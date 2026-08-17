'use strict'
const { runner } = require('../db/withTransaction')

// Shared seat-availability SQL used by catalog + booking. Booked seats live in
// showtime_booked_seats; active holds live in seat_locks (locked_until > NOW()).
const availabilityRepository = {
	// Map: showtimeId(string) -> ["A1","A2",...] currently booked
	async bookedLabelsByShowtime(showtimeIds, conn) {
		if (!showtimeIds.length) return {}
		const ph = showtimeIds.map(() => '?').join(',')
		const [rows] = await runner(conn).query(
			`SELECT showtime_id AS sid, CONCAT(seat_row, seat_number) AS label
			 FROM showtime_booked_seats WHERE showtime_id IN (${ph})`, showtimeIds
		)
		const out = {}
		for (const r of rows) (out[String(r.sid)] ||= []).push(r.label)
		return out
	},

	// Map: showtimeId(string) -> ["A1",...] currently locked (active holds only)
	async lockedLabelsByShowtime(showtimeIds, conn) {
		if (!showtimeIds.length) return {}
		const ph = showtimeIds.map(() => '?').join(',')
		const [rows] = await runner(conn).query(
			`SELECT showtime_id AS sid, seat_label AS label
			 FROM seat_locks WHERE locked_until > NOW() AND showtime_id IN (${ph})`, showtimeIds
		)
		const out = {}
		for (const r of rows) (out[String(r.sid)] ||= []).push(r.label)
		return out
	},


	// Map: showtimeId -> [{ row, number }] booked (for the seat map; no user field)
	async bookedSeatsByShowtime(showtimeIds, conn) {
		if (!showtimeIds.length) return {}
		const ph = showtimeIds.map(() => '?').join(',')
		const [rows] = await runner(conn).query(
			`SELECT showtime_id AS sid, seat_row AS row, seat_number AS number
			 FROM showtime_booked_seats WHERE showtime_id IN (${ph})`, showtimeIds
		)
		const out = {}
		for (const r of rows) (out[String(r.sid)] ||= []).push({ row: r.row, number: r.number })
		return out
	},

	async bookedLabels(showtimeId, conn) {
		return (await this.bookedLabelsByShowtime([showtimeId], conn))[String(showtimeId)] || []
	},
	async lockedLabels(showtimeId, conn) {
		return (await this.lockedLabelsByShowtime([showtimeId], conn))[String(showtimeId)] || []
	}
}

module.exports = availabilityRepository
