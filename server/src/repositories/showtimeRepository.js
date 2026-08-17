'use strict'
const { runner } = require('../db/withTransaction')
const R = (c) => runner(c)

// Base projection joining movie + theater + cinema for the standard showtime shape.
const JOINED = `
	SELECT s.id AS id, s.show_datetime AS showtime, s.is_release AS isRelease,
	       s.theater_id AS theaterId, s.movie_id AS movieId,
	       m.id AS m_id, m.name AS m_name, m.length AS m_length, m.img AS m_img,
	       th.id AS th_id, th.number AS th_number,
	       th.seat_plan_row AS sp_row, th.seat_plan_column AS sp_col,
	       c.id AS c_id, c.name AS c_name
	FROM showtimes s
	JOIN movies m   ON m.id = s.movie_id
	JOIN theaters th ON th.id = s.theater_id
	JOIN cinemas c  ON c.id = th.cinema_id`

const showtimeRepository = {
	async findByIdWithPlan(id, conn) {
		const [rows] = await R(conn).execute(
			`SELECT s.id AS id, s.show_datetime AS showtime, s.is_release AS isRelease, s.is_active AS isActive,
			        th.seat_plan_row AS seatPlanRow, th.seat_plan_column AS seatPlanColumn, th.id AS theaterId
			 FROM showtimes s JOIN theaters th ON th.id = s.theater_id
			 WHERE s.id = ? AND s.is_active = 1 LIMIT 1`, [id])
		return rows[0] || null
	},

	async findFullById(id, conn) {
		const [rows] = await R(conn).execute(`${JOINED} WHERE s.id = ? AND s.is_active = 1 LIMIT 1`, [id])
		return rows[0] || null
	},

	async findAll({ releasedOnly }, conn) {
		const rel = releasedOnly ? 'AND s.is_release = 1' : ''
		const [rows] = await R(conn).query(`${JOINED} WHERE s.is_active = 1 ${rel} ORDER BY s.show_datetime ASC`)
		return rows
	},

	async create({ theaterId, movieId, showtime, isRelease }, conn) {
		const [res] = await R(conn).execute(
			'INSERT INTO showtimes (theater_id, movie_id, show_datetime, is_release) VALUES (?, ?, ?, ?)',
			[theaterId, movieId, showtime, isRelease ? 1 : 0])
		return res.insertId
	},

	async update(id, fields, conn) {
		const map = { showtime: 'show_datetime', isRelease: 'is_release', movie: 'movie_id', theater: 'theater_id' }
		const sets = [], vals = []
		for (const [k, col] of Object.entries(map)) {
			if (fields[k] !== undefined) { sets.push(`${col} = ?`); vals.push(k === 'isRelease' ? (fields[k] ? 1 : 0) : fields[k]) }
		}
		if (!sets.length) return this.findFullById(id, conn)
		vals.push(id)
		await R(conn).execute(`UPDATE showtimes SET ${sets.join(', ')} WHERE id = ? AND is_active = 1`, vals)
		return this.findFullById(id, conn)
	},

	async softDelete(id, conn) {
		const [res] = await R(conn).execute(
			'UPDATE showtimes SET is_active = 0, deleted_at = NOW() WHERE id = ? AND is_active = 1', [id])
		return res.affectedRows > 0
	},
	async softDeleteMany(ids, conn) {
		if (!ids || !ids.length) {
			const [res] = await R(conn).query('UPDATE showtimes SET is_active = 0, deleted_at = NOW() WHERE is_active = 1')
			return res.affectedRows
		}
		const ph = ids.map(() => '?').join(',')
		const [res] = await R(conn).query(
			`UPDATE showtimes SET is_active = 0, deleted_at = NOW() WHERE is_active = 1 AND id IN (${ph})`, ids)
		return res.affectedRows
	},
	async softDeletePrevious(conn) {
		const [res] = await R(conn).query(
			'UPDATE showtimes SET is_active = 0, deleted_at = NOW() WHERE is_active = 1 AND show_datetime < CURDATE()')
		return res.affectedRows
	},

	// Booked seats for a showtime including who booked them (admin view).
	async bookedSeatsWithUsers(showtimeId, conn) {
		const [rows] = await R(conn).execute(
			`SELECT b.seat_row AS row, b.seat_number AS number,
			        u.id AS uid, u.username, u.email, u.role
			 FROM showtime_booked_seats b LEFT JOIN users u ON u.id = b.user_id
			 WHERE b.showtime_id = ?`, [showtimeId])
		return rows
	}
}
module.exports = showtimeRepository
