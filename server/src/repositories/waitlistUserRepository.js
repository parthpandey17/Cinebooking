'use strict'
const { runner } = require('../db/withTransaction')
const R = (c) => runner(c)

const cols = `id, user_id AS userId, showtime_id AS showtimeId, seats_requested AS seatsRequested,
	seats_accepted AS seatsAccepted, seats_remaining AS seatsRemaining, status, position,
	close_after_booking AS closeAfterBooking, joined_at AS joinedAt, offered_at AS offeredAt,
	offer_expires_at AS offerExpiresAt, confirmed_at AS confirmedAt, created_at AS createdAt`

const waitlistUserRepository = {
	async findByUserShowtime(userId, showtimeId, conn) {
		const [rows] = await R(conn).execute(`SELECT ${cols} FROM waitlists WHERE user_id = ? AND showtime_id = ? LIMIT 1`, [userId, showtimeId])
		return rows[0] || null
	},
	async countWaitlisted(showtimeId, conn) {
		const [rows] = await R(conn).execute("SELECT COUNT(*) AS c FROM waitlists WHERE showtime_id = ? AND status = 'WAITLISTED'", [showtimeId])
		return rows[0].c
	},
	async countWaitlistedBefore(showtimeId, joinedAt, conn) {
		const [rows] = await R(conn).execute(
			"SELECT COUNT(*) AS c FROM waitlists WHERE showtime_id = ? AND status = 'WAITLISTED' AND joined_at <= ?", [showtimeId, joinedAt])
		return rows[0].c
	},
	async insertJoin(userId, showtimeId, seatsRequested, position, conn) {
		const [res] = await R(conn).execute(
			`INSERT INTO waitlists (user_id, showtime_id, seats_requested, seats_remaining, seats_accepted, position, status, joined_at)
			 VALUES (?, ?, ?, ?, NULL, ?, 'WAITLISTED', NOW())`, [userId, showtimeId, seatsRequested, seatsRequested, position])
		return res.insertId
	},
	async resetToWaitlisted(id, seatsRequested, position, conn) {
		await R(conn).execute(
			`UPDATE waitlists SET status='WAITLISTED', joined_at=NOW(), seats_requested=?, seats_remaining=?, seats_accepted=NULL,
			 position=?, offered_at=NULL, offer_expires_at=NULL, confirmed_at=NULL, close_after_booking=0 WHERE id=?`,
			[seatsRequested, seatsRequested, position, id])
		await R(conn).execute('DELETE FROM waitlist_offered_seats WHERE waitlist_id = ?', [id])
		await R(conn).execute('DELETE FROM waitlist_partial_bookings WHERE waitlist_id = ?', [id])
	},
	async findOfferedEntry(userId, showtimeId, conn) {
		const [rows] = await R(conn).execute(
			`SELECT ${cols} FROM waitlists WHERE user_id = ? AND showtime_id = ?
			 AND status IN ('OFFERED','OFFER_PARTIAL') AND offer_expires_at > NOW() LIMIT 1`, [userId, showtimeId])
		return rows[0] || null
	},
	async findActiveByStatuses(userId, showtimeId, statuses, conn) {
		const ph = statuses.map(() => '?').join(',')
		const [rows] = await R(conn).query(
			`SELECT ${cols} FROM waitlists WHERE user_id = ? AND showtime_id = ? AND status IN (${ph}) LIMIT 1`,
			[userId, showtimeId, ...statuses])
		return rows[0] || null
	},
	async setStatus(id, status, { confirmed = false, closeAfterBooking } = {}, conn) {
		const sets = ['status = ?']; const vals = [status]
		if (confirmed) sets.push('confirmed_at = NOW()')
		if (closeAfterBooking !== undefined) { sets.push('close_after_booking = ?'); vals.push(closeAfterBooking ? 1 : 0) }
		vals.push(id)
		await R(conn).execute(`UPDATE waitlists SET ${sets.join(', ')} WHERE id = ?`, vals)
	},
	async trimOfferedSeats(id, keepCount, conn) {
		const [rows] = await R(conn).execute('SELECT id, seat_label FROM waitlist_offered_seats WHERE waitlist_id = ? ORDER BY id ASC', [id])
		const surplus = rows.slice(keepCount)
		if (surplus.length) {
			const ph = surplus.map(() => '?').join(',')
			await R(conn).query(`DELETE FROM waitlist_offered_seats WHERE id IN (${ph})`, surplus.map((r) => r.id))
		}
		return surplus.map((r) => r.seat_label)
	},
	async listByUser(userId, conn) {
		const [rows] = await R(conn).query(
			`SELECT w.id, w.user_id AS userId, w.showtime_id AS showtimeId, w.seats_requested AS seatsRequested,
			        w.seats_accepted AS seatsAccepted, w.seats_remaining AS seatsRemaining, w.status, w.position,
			        w.close_after_booking AS closeAfterBooking, w.joined_at AS joinedAt, w.offered_at AS offeredAt,
			        w.offer_expires_at AS offerExpiresAt, w.confirmed_at AS confirmedAt, w.created_at AS createdAt,
			        s.show_datetime AS showDatetime,
			        m.id AS m_id, m.name AS m_name, m.img AS m_img,
			        th.number AS th_number, c.name AS c_name
			 FROM waitlists w
			 JOIN showtimes s ON s.id = w.showtime_id
			 JOIN movies m ON m.id = s.movie_id
			 JOIN theaters th ON th.id = s.theater_id
			 JOIN cinemas c ON c.id = th.cinema_id
			 WHERE w.user_id = ? ORDER BY w.created_at DESC`, [userId])
		return rows
	},
	async listAll(conn) {
		const [rows] = await R(conn).query(
			`SELECT w.id, w.user_id AS userId, u.username, u.email, w.showtime_id AS showtimeId, w.seats_requested AS seatsRequested,
			        w.seats_accepted AS seatsAccepted, w.seats_remaining AS seatsRemaining, w.status, w.joined_at AS joinedAt,
			        s.show_datetime AS showDatetime, m.name AS m_name, m.img AS m_img, th.number AS th_number, c.name AS c_name
			 FROM waitlists w
			 JOIN users u ON u.id = w.user_id
			 JOIN showtimes s ON s.id = w.showtime_id
			 JOIN movies m ON m.id = s.movie_id
			 JOIN theaters th ON th.id = s.theater_id
			 JOIN cinemas c ON c.id = th.cinema_id
			 ORDER BY w.created_at DESC`)
		return rows
	},
	async stats(conn) {
		const [rows] = await R(conn).query(
			`SELECT w.showtime_id AS showtimeId, s.show_datetime AS showDatetime,
			        COUNT(*) AS total,
			        SUM(w.status='WAITLISTED') AS waitlisted, SUM(w.status='OFFERED') AS offered,
			        SUM(w.status='OFFER_PARTIAL') AS offerPartial, SUM(w.status='ACCEPTED') AS accepted,
			        SUM(w.status='CONFIRMED') AS confirmed, SUM(w.status='EXPIRED') AS expired,
			        SUM(w.status='REJECTED') AS rejected, SUM(w.status='CANCELLED') AS cancelled
			 FROM waitlists w JOIN showtimes s ON s.id = w.showtime_id
			 GROUP BY w.showtime_id, s.show_datetime ORDER BY s.show_datetime DESC`)
		return rows
	},
	async partialBookings(id, conn) {
		const [rows] = await R(conn).execute(
			'SELECT seats_booked AS seatsBooked, seat_labels AS seatLabels, booked_at AS bookedAt FROM waitlist_partial_bookings WHERE waitlist_id = ? ORDER BY booked_at ASC', [id])
		return rows.map((r) => ({ seatsBooked: r.seatsBooked, seatLabels: (() => { try { return JSON.parse(r.seatLabels) } catch { return [] } })(), bookedAt: r.bookedAt }))
	}
}
module.exports = waitlistUserRepository
