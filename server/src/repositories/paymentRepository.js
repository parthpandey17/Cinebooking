'use strict'
const { runner } = require('../db/withTransaction')
const R = (c) => runner(c)

const SEL = `id, razorpay_order_id AS razorpayOrderId, razorpay_payment_id AS razorpayPaymentId,
	razorpay_signature AS razorpaySignature, amount, currency, status, user_id AS userId,
	showtime_id AS showtimeId, ticket_data AS ticketData, webhook_processed AS webhookProcessed`

const paymentRepository = {
	async create({ razorpayOrderId, amount, userId, showtimeId, seats }, conn) {
		const [res] = await R(conn).execute(
			'INSERT INTO payments (razorpay_order_id, amount, user_id, showtime_id) VALUES (?, ?, ?, ?)',
			[razorpayOrderId, amount, userId, showtimeId])
		const paymentId = res.insertId
		if (seats.length) {
			const values = seats.map(() => '(?, ?, ?)').join(', ')
			const params = []
			for (const s of seats) params.push(paymentId, s.row, s.number)
			await R(conn).query(`INSERT INTO payment_seats (payment_id, seat_row, seat_number) VALUES ${values}`, params)
		}
		return paymentId
	},
	async findByOrderId(orderId, conn) {
		const [rows] = await R(conn).execute(`SELECT ${SEL} FROM payments WHERE razorpay_order_id = ? LIMIT 1`, [orderId])
		return rows[0] || null
	},
	async findByOrderIdAndUser(orderId, userId, conn) {
		const [rows] = await R(conn).execute(`SELECT ${SEL} FROM payments WHERE razorpay_order_id = ? AND user_id = ? LIMIT 1`, [orderId, userId])
		return rows[0] || null
	},
	async findById(id, conn) {
		const [rows] = await R(conn).execute(`SELECT ${SEL} FROM payments WHERE id = ? LIMIT 1`, [id])
		return rows[0] || null
	},
	async seatsFor(paymentId, conn) {
		const [rows] = await R(conn).execute('SELECT seat_row AS row, seat_number AS number FROM payment_seats WHERE payment_id = ?', [paymentId])
		return rows
	},
	async paidSeatLabels(showtimeId, conn) {
		const [rows] = await R(conn).execute(
			`SELECT CONCAT(ps.seat_row, ps.seat_number) AS label
			 FROM payment_seats ps JOIN payments p ON p.id = ps.payment_id
			 WHERE p.showtime_id = ? AND p.status = 'paid'`, [showtimeId])
		return rows.map((r) => r.label)
	},
	async cancelCreatedForUser(userId, showtimeId, conn) {
		await R(conn).execute(
			`UPDATE payments SET status = 'cancelled' WHERE user_id = ? AND showtime_id = ? AND status = 'created'`, [userId, showtimeId])
	},
	async setStatus(id, status, extra = {}, conn) {
		const sets = ['status = ?']; const vals = [status]
		if (extra.razorpayPaymentId !== undefined) { sets.push('razorpay_payment_id = ?'); vals.push(extra.razorpayPaymentId) }
		if (extra.razorpaySignature !== undefined) { sets.push('razorpay_signature = ?'); vals.push(extra.razorpaySignature) }
		if (extra.webhookProcessed !== undefined) { sets.push('webhook_processed = ?'); vals.push(extra.webhookProcessed ? 1 : 0) }
		vals.push(id)
		await R(conn).execute(`UPDATE payments SET ${sets.join(', ')} WHERE id = ?`, vals)
	},
	async setTicketData(id, ticketData, conn) {
		await R(conn).execute('UPDATE payments SET ticket_data = ? WHERE id = ?', [JSON.stringify(ticketData), id])
	},
	async isSeatBooked(showtimeId, row, number, conn) {
		const [rows] = await R(conn).execute(
			'SELECT user_id AS userId FROM showtime_booked_seats WHERE showtime_id = ? AND seat_row = ? AND seat_number = ? LIMIT 1',
			[showtimeId, row, number])
		return rows[0] || null
	},
	async insertBookedSeat(showtimeId, row, number, userId, conn) {
		await R(conn).execute(
			'INSERT INTO showtime_booked_seats (showtime_id, seat_row, seat_number, user_id) VALUES (?, ?, ?, ?)',
			[showtimeId, row, number, userId])
	},
	async linkBookedSeatsToTicket(showtimeId, userId, labels, ticketPk, conn) {
		if (!labels.length) return
		// Match by CONCAT(row, number) IN labels for this showtime+user.
		const ph = labels.map(() => '?').join(',')
		await R(conn).query(
			`UPDATE showtime_booked_seats SET ticket_id = ?
			 WHERE showtime_id = ? AND user_id = ? AND CONCAT(seat_row, seat_number) IN (${ph})`,
			[ticketPk, showtimeId, userId, ...labels])
	},
	async lockShowtimeRow(showtimeId, conn) {
		const [rows] = await R(conn).execute('SELECT id FROM showtimes WHERE id = ? AND is_active = 1 FOR UPDATE', [showtimeId])
		return rows[0] || null
	}
}
module.exports = paymentRepository
