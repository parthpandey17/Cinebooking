'use strict'
const { runner } = require('../db/withTransaction')
const R = (c) => runner(c)

const cancelRepository = {
	async paymentForTicket(ticketPk, conn) {
		const [rows] = await R(conn).execute(
			`SELECT p.id, p.amount, p.status, p.razorpay_payment_id AS razorpayPaymentId
			 FROM payments p JOIN tickets t ON t.payment_id = p.id WHERE t.id = ? LIMIT 1`, [ticketPk])
		return rows[0] || null
	},
	async setRefunded(paymentId, { razorpayRefundId, refundAmount, cancellationFee, feePercent, status, reason }, conn) {
		await R(conn).execute(
			`UPDATE payments SET status = 'refunded', refund_razorpay_id = ?, refund_amount = ?, refund_cancellation_fee = ?,
			        refund_fee_percent = ?, refund_at = NOW(), refund_status = ?, refund_reason = ? WHERE id = ?`,
			[razorpayRefundId, refundAmount, cancellationFee, feePercent, status || 'pending', reason || null, paymentId])
	},
	async releaseBookedSeats(showtimeId, seats, conn) {
		for (const s of seats) {
			await R(conn).execute('DELETE FROM showtime_booked_seats WHERE showtime_id = ? AND seat_row = ? AND seat_number = ?',
				[showtimeId, s.row, s.number])
		}
	},
	async setRefundStatusByRefundId(refundId, status, conn) {
		await R(conn).execute('UPDATE payments SET refund_status = ? WHERE refund_razorpay_id = ?', [status, refundId])
	},
	async listRefunds({ page, limit }, conn) {
		const [cnt] = await R(conn).query("SELECT COUNT(*) AS total FROM payments WHERE status = 'refunded'")
		const [rows] = await R(conn).query(
			`SELECT p.id, p.razorpay_order_id AS razorpayOrderId, p.amount, p.refund_amount AS refundAmount,
			        p.refund_cancellation_fee AS cancellationFee, p.refund_status AS refundStatus, p.refund_at AS refundedAt,
			        u.id AS userId, u.username, u.email,
			        s.id AS showtimeId, s.show_datetime AS showDatetime,
			        m.name AS movieName, th.number AS theaterNumber, c.name AS cinemaName
			 FROM payments p
			 JOIN users u ON u.id = p.user_id
			 JOIN showtimes s ON s.id = p.showtime_id
			 JOIN movies m ON m.id = s.movie_id
			 JOIN theaters th ON th.id = s.theater_id
			 JOIN cinemas c ON c.id = th.cinema_id
			 WHERE p.status = 'refunded'
			 ORDER BY p.refund_at DESC LIMIT ? OFFSET ?`, [limit, (page - 1) * limit])
		return { total: cnt[0].total, rows }
	}
}
module.exports = cancelRepository
