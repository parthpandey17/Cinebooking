'use strict'
const { runner } = require('../db/withTransaction')
const R = (c) => runner(c)

const adminRepository = {
	async counts(conn) {
		const [[u]] = [await R(conn).query("SELECT COUNT(*) AS c FROM users WHERE role='user'")]
		const [[m]] = [await R(conn).query('SELECT COUNT(*) AS c FROM movies WHERE is_active=1')]
		const [[c1]] = [await R(conn).query('SELECT COUNT(*) AS c FROM cinemas WHERE is_active=1')]
		const [[th]] = [await R(conn).query('SELECT COUNT(*) AS c FROM theaters WHERE is_active=1')]
		const [[s]] = [await R(conn).query('SELECT COUNT(*) AS c FROM showtimes WHERE is_active=1')]
		const [[al]] = [await R(conn).query('SELECT COUNT(*) AS c FROM seat_locks WHERE locked_until > NOW()')]
		const [[up]] = [await R(conn).query('SELECT COUNT(*) AS c FROM showtimes WHERE is_active=1 AND is_release=1 AND show_datetime >= NOW()')]
		const [[tt]] = [await R(conn).query('SELECT COUNT(*) AS c FROM tickets')]
		const [[ut]] = [await R(conn).query('SELECT COUNT(*) AS c FROM tickets WHERE is_used=1')]
		return {
			users: u[0].c, movies: m[0].c, cinemas: c1[0].c, theaters: th[0].c, showtimes: s[0].c,
			activeLocks: al[0].c, upcomingShowtimes: up[0].c, tickets: tt[0].c, usedTickets: ut[0].c
		}
	},
	async revenue(conn) {
		const [rev] = await R(conn).query('SELECT COALESCE(SUM(amount_paid),0) AS total FROM tickets WHERE is_cancelled=0')
		const [seats] = await R(conn).query(
			'SELECT COUNT(*) AS total FROM ticket_seats ts JOIN tickets t ON t.id=ts.ticket_id WHERE t.is_cancelled=0')
		return { total: Number(rev[0].total), totalSeatsBooked: Number(seats[0].total) }
	},
	async monthlyRevenue(conn) {
		const [rows] = await R(conn).query(
			`SELECT YEAR(booked_at) AS y, MONTH(booked_at) AS mo,
			        SUM(amount_paid*100) AS revenue, COUNT(*) AS bookings
			 FROM tickets WHERE is_cancelled=0 AND booked_at >= (CURDATE() - INTERVAL 6 MONTH)
			 GROUP BY YEAR(booked_at), MONTH(booked_at) ORDER BY y, mo`)
		return rows.map((r) => ({ _id: { year: r.y, month: r.mo }, revenue: Number(r.revenue), bookings: Number(r.bookings) }))
	},
	async recentPaidPayments(limit, conn) {
		const [rows] = await R(conn).query(
			`SELECT p.id, p.razorpay_order_id AS razorpayOrderId, p.razorpay_payment_id AS razorpayPaymentId,
			        p.amount, p.currency, p.status, p.created_at AS createdAt,
			        u.id AS uid, u.username, u.email,
			        s.id AS sid, s.show_datetime AS showDatetime, m.name AS movieName
			 FROM payments p JOIN users u ON u.id=p.user_id
			 JOIN showtimes s ON s.id=p.showtime_id JOIN movies m ON m.id=s.movie_id
			 WHERE p.status='paid' ORDER BY p.created_at DESC LIMIT ?`, [limit])
		return rows
	},
	async paymentsPage({ status, search, page, limit }, conn) {
		const conds = []; const params = []
		if (status && status !== 'all') { conds.push('p.status = ?'); params.push(status) }
		if (search && search.trim()) {
			conds.push('(u.username LIKE ? OR p.razorpay_order_id LIKE ? OR p.razorpay_payment_id LIKE ?)')
			const like = `%${search.trim()}%`; params.push(like, like, like)
		}
		const where = conds.length ? 'WHERE ' + conds.join(' AND ') : ''
		const [cnt] = await R(conn).query(`SELECT COUNT(*) AS total FROM payments p JOIN users u ON u.id=p.user_id ${where}`, params)
		const [rows] = await R(conn).query(
			`SELECT p.id, p.razorpay_order_id AS razorpayOrderId, p.razorpay_payment_id AS razorpayPaymentId,
			        p.amount, p.currency, p.status, p.created_at AS createdAt,
			        u.id AS uid, u.username, u.email, u.role,
			        s.id AS sid, s.show_datetime AS showDatetime, m.name AS movieName,
			        th.number AS theaterNumber, c.name AS cinemaName
			 FROM payments p JOIN users u ON u.id=p.user_id
			 JOIN showtimes s ON s.id=p.showtime_id JOIN movies m ON m.id=s.movie_id
			 JOIN theaters th ON th.id=s.theater_id JOIN cinemas c ON c.id=th.cinema_id
			 ${where} ORDER BY p.created_at DESC LIMIT ? OFFSET ?`, [...params, limit, (page - 1) * limit])
		return { total: cnt[0].total, rows }
	},
	async activeLocks(conn) {
		const [rows] = await R(conn).query(
			`SELECT sl.id, sl.seat_label AS seatNumber, sl.locked_until AS expiresAt,
			        u.id AS uid, u.username, sl.showtime_id AS showtimeId, m.name AS movieName
			 FROM seat_locks sl JOIN users u ON u.id=sl.user_id
			 JOIN showtimes s ON s.id=sl.showtime_id JOIN movies m ON m.id=s.movie_id
			 WHERE sl.locked_until > NOW() ORDER BY sl.locked_until ASC`)
		return rows
	},
	async lockShowtimeId(id, conn) {
		const [rows] = await R(conn).execute('SELECT showtime_id AS showtimeId FROM seat_locks WHERE id = ? LIMIT 1', [id])
		return rows[0] ? String(rows[0].showtimeId) : null
	},
	async deleteLock(id, conn) {
		await R(conn).execute('DELETE FROM seat_locks WHERE id = ?', [id])
	}
}
module.exports = adminRepository
