'use strict'
const { runner } = require('../db/withTransaction')
const R = (c) => runner(c)
const ACTIVE = ['WAITLISTED', 'OFFERED', 'OFFER_PARTIAL', 'ACCEPTED']

const baseCols = `id, user_id AS userId, showtime_id AS showtimeId, seats_requested AS seatsRequested,
	seats_accepted AS seatsAccepted, seats_remaining AS seatsRemaining, status, position,
	close_after_booking AS closeAfterBooking, joined_at AS joinedAt, offered_at AS offeredAt,
	offer_expires_at AS offerExpiresAt, confirmed_at AS confirmedAt`

const waitlistRepository = {
	async findLiveOffer(showtimeId, conn) {
		const [rows] = await R(conn).execute(
			`SELECT ${baseCols} FROM waitlists
			 WHERE showtime_id = ? AND status IN ('OFFERED','OFFER_PARTIAL') AND offer_expires_at > NOW() LIMIT 1`, [showtimeId])
		return rows[0] || null
	},

	// Claim the oldest WAITLISTED entry (FIFO) with a row lock, mark OFFERED.
	async claimOldestWaitlisted(showtimeId, offeredAt, offerExpiresAt, conn) {
		const [rows] = await R(conn).execute(
			`SELECT w.id, w.user_id AS userId, w.seats_requested AS seatsRequested,
			        w.seats_accepted AS seatsAccepted, w.seats_remaining AS seatsRemaining,
			        u.username, u.email
			 FROM waitlists w JOIN users u ON u.id = w.user_id
			 WHERE w.showtime_id = ? AND w.status = 'WAITLISTED'
			 ORDER BY w.joined_at ASC LIMIT 1 FOR UPDATE`, [showtimeId])
		const entry = rows[0]
		if (!entry) return null
		await R(conn).execute(
			`UPDATE waitlists SET status = 'OFFERED', offered_at = ?, offer_expires_at = ? WHERE id = ?`,
			[offeredAt, offerExpiresAt, entry.id])
		return entry
	},

	async setOfferSeats(id, status, labels, conn) {
		await R(conn).execute('UPDATE waitlists SET status = ? WHERE id = ?', [status, id])
		await R(conn).execute('DELETE FROM waitlist_offered_seats WHERE waitlist_id = ?', [id])
		if (labels.length) {
			const values = labels.map(() => '(?, ?)').join(', ')
			const params = []
			for (const l of labels) params.push(id, l)
			await R(conn).query(`INSERT INTO waitlist_offered_seats (waitlist_id, seat_label) VALUES ${values}`, params)
		}
	},

	async offeredSeatLabels(id, conn) {
		const [rows] = await R(conn).execute('SELECT seat_label FROM waitlist_offered_seats WHERE waitlist_id = ?', [id])
		return rows.map((r) => r.seat_label)
	},

	async revertClaim(id, conn) {
		await R(conn).execute(
			`UPDATE waitlists SET status = 'WAITLISTED', offered_at = NULL, offer_expires_at = NULL WHERE id = ?`, [id])
		await R(conn).execute('DELETE FROM waitlist_offered_seats WHERE waitlist_id = ?', [id])
	},

	async findExpiredOfferEntries(conn) {
		const [rows] = await R(conn).query(
			`SELECT ${baseCols} FROM waitlists
			 WHERE status IN ('OFFERED','OFFER_PARTIAL','ACCEPTED') AND offer_expires_at <= NOW()`)
		return rows
	},

	async requeue(id, conn) {
		await R(conn).execute(
			`UPDATE waitlists SET status = 'WAITLISTED', offered_at = NULL, offer_expires_at = NULL WHERE id = ?`, [id])
		await R(conn).execute('DELETE FROM waitlist_offered_seats WHERE waitlist_id = ?', [id])
	},
	async setExpired(id, conn) {
		await R(conn).execute(`UPDATE waitlists SET status = 'EXPIRED' WHERE id = ?`, [id])
		await R(conn).execute('DELETE FROM waitlist_offered_seats WHERE waitlist_id = ?', [id])
	},

	// FOR UPDATE variant used inside completeWaitlistForBooking.
	async findActiveEntryForUpdate(userId, showtimeId, conn) {
		const ph = ACTIVE.map(() => '?').join(',')
		const [rows] = await R(conn).query(
			`SELECT ${baseCols} FROM waitlists
			 WHERE user_id = ? AND showtime_id = ? AND status IN (${ph}) LIMIT 1 FOR UPDATE`,
			[userId, showtimeId, ...ACTIVE])
		return rows[0] || null
	},

	async applyBooking(id, { seatsAccepted, seatsRemaining, status, confirmed, closeAfterBooking }, conn) {
		await R(conn).execute(
			`UPDATE waitlists SET seats_accepted = ?, seats_remaining = ?, status = ?,
			        offered_at = NULL, offer_expires_at = NULL,
			        confirmed_at = ${confirmed ? 'NOW()' : 'confirmed_at'},
			        close_after_booking = ?
			 WHERE id = ?`,
			[seatsAccepted, seatsRemaining, status, closeAfterBooking ? 1 : 0, id])
		await R(conn).execute('DELETE FROM waitlist_offered_seats WHERE waitlist_id = ?', [id])
	},

	async addPartialBooking(id, seatsBooked, seatLabels, conn) {
		await R(conn).execute(
			'INSERT INTO waitlist_partial_bookings (waitlist_id, seats_booked, seat_labels) VALUES (?, ?, ?)',
			[id, seatsBooked, JSON.stringify(Array.isArray(seatLabels) ? seatLabels : [])])
	},

	// Set offered seats + expiry for an ACCEPTED entry (seat-lock refresh sync).
	async syncAcceptedOffer(userId, showtimeId, labels, offerExpiresAt, conn) {
		const [rows] = await R(conn).execute(
			`SELECT id FROM waitlists WHERE user_id = ? AND showtime_id = ? AND status = 'ACCEPTED' LIMIT 1`, [userId, showtimeId])
		if (!rows[0]) return
		const id = rows[0].id
		await R(conn).execute('UPDATE waitlists SET offer_expires_at = ? WHERE id = ?', [offerExpiresAt, id])
		await R(conn).execute('DELETE FROM waitlist_offered_seats WHERE waitlist_id = ?', [id])
		if (labels.length) {
			const values = labels.map(() => '(?, ?)').join(', ')
			const params = []
			for (const l of labels) params.push(id, l)
			await R(conn).query(`INSERT INTO waitlist_offered_seats (waitlist_id, seat_label) VALUES ${values}`, params)
		}
	}
}
module.exports = waitlistRepository
