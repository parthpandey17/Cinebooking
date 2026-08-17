'use strict'
/**
 * Concurrent-booking stress test.
 *
 * Proves the double-booking guard: fire N concurrent transactions that each try
 * to claim the SAME (showtime, seat) via the exact primitive finalizeBooking uses
 * — SELECT ... FOR UPDATE on the showtime row, then INSERT into
 * showtime_booked_seats (which has UNIQUE(showtime_id, seat_row, seat_number)).
 *
 * Expected result: EXACTLY ONE transaction commits the seat; every other attempt
 * either loses the row-lock race and sees the seat already taken, or hits
 * ER_DUP_ENTRY. Net: the seat is booked exactly once, never twice.
 *
 * Requires: a running MySQL with db/schema.sql loaded and .env configured.
 *   node scripts/stress-test.js [concurrency] [showtimeId] [seatRow] [seatNumber]
 *   e.g. node scripts/stress-test.js 50 1 Z 9
 */
require('dotenv').config()
const mysql = require('mysql2/promise')

const CONCURRENCY = Number(process.argv[2] || 50)
const SHOWTIME_ID = Number(process.argv[3] || 1)
const SEAT_ROW = String(process.argv[4] || 'Z')
const SEAT_NUMBER = Number(process.argv[5] || 9)

async function attemptBooking(pool, userId) {
	const conn = await pool.getConnection()
	try {
		await conn.beginTransaction()
		// Pessimistic lock on the showtime row (mirrors paymentRepository.lockShowtimeRow)
		const [st] = await conn.execute('SELECT id FROM showtimes WHERE id = ? FOR UPDATE', [SHOWTIME_ID])
		if (!st.length) throw new Error(`Showtime ${SHOWTIME_ID} not found`)

		const [existing] = await conn.execute(
			'SELECT user_id FROM showtime_booked_seats WHERE showtime_id = ? AND seat_row = ? AND seat_number = ? LIMIT 1',
			[SHOWTIME_ID, SEAT_ROW, SEAT_NUMBER])
		if (existing.length) { await conn.rollback(); return { userId, result: 'lost-seat-taken' } }

		await conn.execute(
			'INSERT INTO showtime_booked_seats (showtime_id, seat_row, seat_number, user_id) VALUES (?, ?, ?, ?)',
			[SHOWTIME_ID, SEAT_ROW, SEAT_NUMBER, userId])
		await conn.commit()
		return { userId, result: 'won' }
	} catch (err) {
		try { await conn.rollback() } catch (_) {}
		if (err.code === 'ER_DUP_ENTRY') return { userId, result: 'lost-dup-entry' }
		return { userId, result: 'error', error: err.message }
	} finally {
		conn.release()
	}
}

async function main() {
	const pool = mysql.createPool({
		host: process.env.DB_HOST || '127.0.0.1',
		port: Number(process.env.DB_PORT || 3306),
		user: process.env.DB_USER || 'root',
		password: process.env.DB_PASSWORD || '',
		database: process.env.DB_NAME || 'cinebooker',
		waitForConnections: true,
		connectionLimit: CONCURRENCY + 5
	})

	// Ensure a clean seat before the run.
	await pool.execute('DELETE FROM showtime_booked_seats WHERE showtime_id = ? AND seat_row = ? AND seat_number = ?',
		[SHOWTIME_ID, SEAT_ROW, SEAT_NUMBER])

	console.log(`Firing ${CONCURRENCY} concurrent bookings for showtime ${SHOWTIME_ID} seat ${SEAT_ROW}${SEAT_NUMBER}...`)
	const start = Date.now()
	const results = await Promise.all(
		Array.from({ length: CONCURRENCY }, (_, i) => attemptBooking(pool, 1))
	)
	const ms = Date.now() - start

	const won = results.filter((r) => r.result === 'won').length
	const lostTaken = results.filter((r) => r.result === 'lost-seat-taken').length
	const lostDup = results.filter((r) => r.result === 'lost-dup-entry').length
	const errors = results.filter((r) => r.result === 'error')

	const [rows] = await pool.execute(
		'SELECT COUNT(*) AS c FROM showtime_booked_seats WHERE showtime_id = ? AND seat_row = ? AND seat_number = ?',
		[SHOWTIME_ID, SEAT_ROW, SEAT_NUMBER])
	const seatCount = rows[0].c

	console.log('\n──────── RESULTS ────────')
	console.log(`elapsed:              ${ms} ms`)
	console.log(`won (committed):      ${won}`)
	console.log(`lost (seat taken):    ${lostTaken}`)
	console.log(`lost (ER_DUP_ENTRY):  ${lostDup}`)
	console.log(`errors:               ${errors.length}`)
	console.log(`seat rows in table:   ${seatCount}  (MUST be 1)`)
	errors.slice(0, 5).forEach((e) => console.log(`  error: ${e.error}`))

	const pass = won === 1 && seatCount === 1 && errors.length === 0
	console.log(`\n${pass ? '✅ PASS' : '❌ FAIL'} — the seat was booked exactly ${seatCount} time(s) despite ${CONCURRENCY} concurrent attempts.`)

	await pool.end()
	process.exit(pass ? 0 : 1)
}

main().catch((err) => { console.error('Stress test crashed:', err); process.exit(1) })
