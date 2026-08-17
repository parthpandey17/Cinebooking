'use strict'
const { runner } = require('../db/withTransaction')
const R = (c) => runner(c)
const ph = (a) => a.map(() => '?').join(',')

const seatLockRepository = {
	async activeLocksForShowtime(showtimeId, conn) {
		const [rows] = await R(conn).execute(
			`SELECT seat_label AS seatNumber, user_id AS userId, locked_until AS expiresAt
			 FROM seat_locks WHERE showtime_id = ? AND locked_until > NOW()`, [showtimeId])
		return rows
	},
	async activeUserLockLabels(userId, showtimeId, conn) {
		const [rows] = await R(conn).execute(
			'SELECT seat_label FROM seat_locks WHERE user_id = ? AND showtime_id = ? AND locked_until > NOW()', [userId, showtimeId])
		return rows.map((r) => r.seat_label)
	},
	async allUserLockLabels(userId, showtimeId, conn) {
		const [rows] = await R(conn).execute(
			'SELECT seat_label FROM seat_locks WHERE user_id = ? AND showtime_id = ?', [userId, showtimeId])
		return rows.map((r) => r.seat_label)
	},
	async otherActiveLockLabels(userId, showtimeId, conn) {
		const [rows] = await R(conn).execute(
			'SELECT seat_label FROM seat_locks WHERE showtime_id = ? AND user_id <> ? AND locked_until > NOW()', [showtimeId, userId])
		return rows.map((r) => r.seat_label)
	},
	async deleteExpiredForSeats(showtimeId, labels, conn) {
		if (!labels.length) return
		await R(conn).query(
			`DELETE FROM seat_locks WHERE showtime_id = ? AND locked_until <= NOW() AND seat_label IN (${ph(labels)})`, [showtimeId, ...labels])
	},
	async deleteUserLocksNotIn(userId, showtimeId, labels, conn) {
		if (!labels.length) {
			await R(conn).execute('DELETE FROM seat_locks WHERE user_id = ? AND showtime_id = ?', [userId, showtimeId]); return
		}
		await R(conn).query(
			`DELETE FROM seat_locks WHERE user_id = ? AND showtime_id = ? AND seat_label NOT IN (${ph(labels)})`, [userId, showtimeId, ...labels])
	},
	async refreshUserLocks(userId, showtimeId, labels, until, conn) {
		if (!labels.length) return
		await R(conn).query(
			`UPDATE seat_locks SET locked_until = ? WHERE user_id = ? AND showtime_id = ? AND seat_label IN (${ph(labels)})`,
			[until, userId, showtimeId, ...labels])
	},
	// INSERT a single lock. Throws ER_DUP_ENTRY if the seat is already held.
	async insertLock(userId, showtimeId, label, until, conn) {
		await R(conn).execute(
			'INSERT INTO seat_locks (user_id, showtime_id, seat_label, locked_until) VALUES (?, ?, ?, ?)',
			[userId, showtimeId, label, until])
	},
	async deleteUserLocks(userId, showtimeId, conn) {
		await R(conn).execute('DELETE FROM seat_locks WHERE user_id = ? AND showtime_id = ?', [userId, showtimeId])
	},
	async deleteUserLocksForSeats(userId, showtimeId, labels, conn) {
		if (!labels.length) return
		await R(conn).query(
			`DELETE FROM seat_locks WHERE user_id = ? AND showtime_id = ? AND seat_label IN (${ph(labels)})`, [userId, showtimeId, ...labels])
	},
	// Cron support
	async expiredShowtimeIds(conn) {
		const [rows] = await R(conn).query('SELECT DISTINCT showtime_id AS sid FROM seat_locks WHERE locked_until <= NOW()')
		return rows.map((r) => String(r.sid))
	},
	async deleteExpired(conn) {
		const [res] = await R(conn).query('DELETE FROM seat_locks WHERE locked_until <= NOW()')
		return res.affectedRows
	}
}
module.exports = seatLockRepository
