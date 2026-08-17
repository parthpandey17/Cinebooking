'use strict'
const { runner } = require('../db/withTransaction')
const R = (c) => runner(c)

const theaterRepository = {
	async findActive(conn) {
		const [rows] = await R(conn).query(
			`SELECT th.id AS id, th.number AS number, th.seat_plan_row AS spRow, th.seat_plan_column AS spCol,
			        c.id AS cinemaId, c.name AS cinemaName
			 FROM theaters th JOIN cinemas c ON c.id = th.cinema_id
			 WHERE th.is_active = 1 ORDER BY th.number ASC`)
		return rows
	},
	async findById(id, conn) {
		const [rows] = await R(conn).execute(
			`SELECT th.id AS id, th.number AS number, th.seat_plan_row AS spRow, th.seat_plan_column AS spCol,
			        c.id AS cinemaId, c.name AS cinemaName
			 FROM theaters th JOIN cinemas c ON c.id = th.cinema_id
			 WHERE th.id = ? AND th.is_active = 1 LIMIT 1`, [id])
		return rows[0] || null
	},
	// Showtimes for theaters, with movie id + name (theater lists show movie name).
	async showtimesByTheaterIds(theaterIds, { releasedOnly }, conn) {
		if (!theaterIds.length) return []
		const ph = theaterIds.map(() => '?').join(',')
		const rel = releasedOnly ? 'AND s.is_release = 1' : ''
		const [rows] = await R(conn).query(
			`SELECT s.id AS id, s.theater_id AS theaterId, s.show_datetime AS showtime, s.is_release AS isRelease,
			        m.id AS movieId, m.name AS movieName
			 FROM showtimes s JOIN movies m ON m.id = s.movie_id
			 WHERE s.is_active = 1 ${rel} AND s.theater_id IN (${ph})
			 ORDER BY s.show_datetime ASC`, theaterIds)
		return rows
	},
	async countByCinema(cinemaId, conn) {
		const [rows] = await R(conn).execute(
			'SELECT COUNT(*) AS c FROM theaters WHERE cinema_id = ? AND is_active = 1', [cinemaId])
		return rows[0].c
	},
	async create({ cinemaId, number, spRow, spCol }, conn) {
		const [res] = await R(conn).execute(
			'INSERT INTO theaters (cinema_id, number, seat_plan_row, seat_plan_column) VALUES (?, ?, ?, ?)',
			[cinemaId, number, spRow, spCol])
		return this.findById(res.insertId, conn)
	},
	async updateSeatPlan(id, spRow, spCol, conn) {
		await R(conn).execute(
			'UPDATE theaters SET seat_plan_row = ?, seat_plan_column = ? WHERE id = ? AND is_active = 1', [spRow, spCol, id])
		return this.findById(id, conn)
	},
	async softDelete(id, conn) {
		const [res] = await R(conn).execute(
			'UPDATE theaters SET is_active = 0, deleted_at = NOW() WHERE id = ? AND is_active = 1', [id])
		return res.affectedRows > 0
	},
	// Booked + active-locked seat labels across a theater's showtimes (seat-plan shrink guard).
	async occupiedLabelsForTheater(theaterId, conn) {
		const [booked] = await R(conn).execute(
			`SELECT CONCAT(b.seat_row, b.seat_number) AS label
			 FROM showtime_booked_seats b JOIN showtimes s ON s.id = b.showtime_id
			 WHERE s.theater_id = ? AND s.is_active = 1`, [theaterId])
		const [locked] = await R(conn).execute(
			`SELECT sl.seat_label AS label
			 FROM seat_locks sl JOIN showtimes s ON s.id = sl.showtime_id
			 WHERE s.theater_id = ? AND s.is_active = 1 AND sl.locked_until > NOW()`, [theaterId])
		return [...booked.map((r) => r.label), ...locked.map((r) => r.label)]
	}
}
module.exports = theaterRepository
