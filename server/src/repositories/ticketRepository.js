'use strict'
const { runner } = require('../db/withTransaction')
const R = (c) => runner(c)

const ticketRepository = {
	async findByPaymentId(paymentId, conn) {
		const [rows] = await R(conn).execute(
			'SELECT id, ticket_id AS ticketId, booked_at AS bookedAt, qr_payload AS qrPayload FROM tickets WHERE payment_id = ? LIMIT 1', [paymentId])
		return rows[0] || null
	},
	async create({ ticketId, paymentId, userId, showtimeId, amountPaid, razorpayPaymentId, qrPayload }, conn) {
		const [res] = await R(conn).execute(
			`INSERT INTO tickets (ticket_id, payment_id, user_id, showtime_id, amount_paid, razorpay_payment_id, qr_payload, booked_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
			[ticketId, paymentId, userId, showtimeId, amountPaid, razorpayPaymentId || null, qrPayload])
		return res.insertId
	},
	async addSeats(ticketPk, seats, conn) {
		if (!seats.length) return
		const values = []
		const params = []
		for (const s of seats) { values.push('(?, ?, ?)'); params.push(ticketPk, s.row, s.number) }
		await R(conn).query(`INSERT INTO ticket_seats (ticket_id, seat_row, seat_number) VALUES ${values.join(', ')}`, params)
	},
	async findByTicketId(ticketId, conn) {
		const [rows] = await R(conn).execute(
			`SELECT t.id, t.ticket_id AS ticketId, t.payment_id AS paymentId, t.user_id AS userId, t.showtime_id AS showtimeId,
			        t.amount_paid AS amountPaid, t.razorpay_payment_id AS razorpayPaymentId, t.qr_payload AS qrPayload,
			        t.is_used AS isUsed, t.used_at AS usedAt, t.used_by AS usedBy,
			        t.is_cancelled AS isCancelled, t.cancelled_at AS cancelledAt, t.cancellation_reason AS cancellationReason,
			        t.refund_amount AS refundAmount, t.cancellation_fee AS cancellationFee, t.booked_at AS bookedAt
			 FROM tickets t WHERE t.ticket_id = ? LIMIT 1`, [ticketId])
		return rows[0] || null
	},
	async seatsForTickets(ticketPks, conn) {
		if (!ticketPks.length) return {}
		const ph = ticketPks.map(() => '?').join(',')
		const [rows] = await R(conn).query(
			`SELECT ticket_id AS tid, seat_row AS row, seat_number AS number FROM ticket_seats WHERE ticket_id IN (${ph})`, ticketPks)
		const out = {}
		for (const r of rows) (out[String(r.tid)] ||= []).push({ row: r.row, number: r.number })
		return out
	},

	// Full projection joining everything the ticket UI needs.
	async _list(where, params, { page, limit } = {}, conn) {
		let sql = `SELECT t.id, t.ticket_id AS ticketId, t.user_id AS userId, u.username, u.email,
			t.showtime_id AS showtimeId, s.show_datetime AS showDatetime, s.is_release AS isRelease,
			m.id AS m_id, m.name AS m_name, m.length AS m_length,
			th.id AS th_id, th.number AS th_number, th.seat_plan_row AS sp_row, th.seat_plan_column AS sp_col,
			c.id AS c_id, c.name AS c_name,
			t.amount_paid AS amountPaid, t.razorpay_payment_id AS razorpayPaymentId, t.qr_payload AS qrPayload,
			t.is_used AS isUsed, t.used_at AS usedAt,
			ub.id AS ub_id, ub.username AS ub_username, ub.email AS ub_email,
			t.is_cancelled AS isCancelled, t.cancelled_at AS cancelledAt, t.cancellation_reason AS cancellationReason,
			t.refund_amount AS refundAmount, t.cancellation_fee AS cancellationFee, t.booked_at AS bookedAt
			FROM tickets t
			JOIN users u ON u.id = t.user_id
			JOIN showtimes s ON s.id = t.showtime_id
			JOIN movies m ON m.id = s.movie_id
			JOIN theaters th ON th.id = s.theater_id
			JOIN cinemas c ON c.id = th.cinema_id
			LEFT JOIN users ub ON ub.id = t.used_by
			${where ? 'WHERE ' + where : ''}
			ORDER BY t.booked_at DESC`
		const p = [...params]
		if (limit != null) { sql += ' LIMIT ? OFFSET ?'; p.push(limit, (page - 1) * limit) }
		const [rows] = await runner(conn).query(sql, p)
		return rows
	},
	async oneByTicketId(ticketId, conn) {
		const rows = await this._list('t.ticket_id = ?', [ticketId], {}, conn)
		return rows[0] || null
	},
	async listByUser(userId, conn) { return this._list('t.user_id = ?', [userId], {}, conn) },
	async listByShowtime(showtimeId, isUsed, conn) {
		let w = 't.showtime_id = ?'; const p = [showtimeId]
		if (isUsed === 'true') w += ' AND t.is_used = 1'
		if (isUsed === 'false') w += ' AND t.is_used = 0'
		return this._list(w, p, {}, conn)
	},
	async listAdmin({ page, limit, isUsed, showtimeId, search }, conn) {
		const conds = []; const params = []
		if (isUsed === 'true') conds.push('t.is_used = 1')
		if (isUsed === 'false') conds.push('t.is_used = 0')
		if (showtimeId) { conds.push('t.showtime_id = ?'); params.push(showtimeId) }
		if (search) { conds.push('t.ticket_id LIKE ?'); params.push(`%${search.trim()}%`) }
		const where = conds.join(' AND ')
		const [cnt] = await runner(conn).query(`SELECT COUNT(*) AS total FROM tickets t ${where ? 'WHERE ' + where : ''}`, params)
		const rows = await this._list(where, params, { page, limit }, conn)
		return { total: cnt[0].total, rows }
	},
	async markUsed(ticketPk, usedBy, conn) {
		await runner(conn).execute('UPDATE tickets SET is_used = 1, used_at = NOW(), used_by = ? WHERE id = ?', [usedBy, ticketPk])
	},
	async setCancelled(ticketPk, { reason, refundAmountINR, feeINR }, conn) {
		await runner(conn).execute(
			`UPDATE tickets SET is_cancelled = 1, cancelled_at = NOW(), cancellation_reason = ?, refund_amount = ?, cancellation_fee = ? WHERE id = ?`,
			[reason || null, refundAmountINR, feeINR, ticketPk])
	}
}
module.exports = ticketRepository
