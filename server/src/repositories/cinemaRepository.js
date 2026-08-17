'use strict'
const { runner } = require('../db/withTransaction')
const R = (c) => runner(c)

const cinemaRepository = {
	async findActive(conn) {
		const [rows] = await R(conn).query(
			'SELECT id, name, created_at AS createdAt, updated_at AS updatedAt FROM cinemas WHERE is_active = 1 ORDER BY name ASC')
		return rows
	},
	async findById(id, conn) {
		const [rows] = await R(conn).execute(
			'SELECT id, name, created_at AS createdAt, updated_at AS updatedAt FROM cinemas WHERE id = ? AND is_active = 1 LIMIT 1', [id])
		return rows[0] || null
	},
	async theatersByCinemaIds(cinemaIds, conn) {
		if (!cinemaIds.length) return []
		const ph = cinemaIds.map(() => '?').join(',')
		const [rows] = await R(conn).query(
			`SELECT id, cinema_id AS cinemaId, number, seat_plan_row AS spRow, seat_plan_column AS spCol
			 FROM theaters WHERE is_active = 1 AND cinema_id IN (${ph}) ORDER BY number ASC`, cinemaIds)
		return rows
	},
	// Showtimes for the given theaters, movie fields joined. releasedOnly filters public.
	async showtimesByTheaterIds(theaterIds, { releasedOnly }, conn) {
		if (!theaterIds.length) return []
		const ph = theaterIds.map(() => '?').join(',')
		const rel = releasedOnly ? 'AND s.is_release = 1' : ''
		const [rows] = await R(conn).query(
			`SELECT s.id AS id, s.theater_id AS theaterId, s.show_datetime AS showtime, s.is_release AS isRelease,
			        m.id AS movieId, m.name AS movieName, m.length AS movieLength
			 FROM showtimes s JOIN movies m ON m.id = s.movie_id
			 WHERE s.is_active = 1 ${rel} AND s.theater_id IN (${ph})
			 ORDER BY s.show_datetime ASC`, theaterIds)
		return rows
	},
	async create({ name }, conn) {
		const [res] = await R(conn).execute('INSERT INTO cinemas (name) VALUES (?)', [name])
		return this.findById(res.insertId, conn)
	},
	async update(id, { name }, conn) {
		if (name !== undefined) await R(conn).execute('UPDATE cinemas SET name = ? WHERE id = ? AND is_active = 1', [name, id])
		return this.findById(id, conn)
	},
	async softDelete(id, conn) {
		const [res] = await R(conn).execute(
			'UPDATE cinemas SET is_active = 0, deleted_at = NOW() WHERE id = ? AND is_active = 1', [id])
		return res.affectedRows > 0
	}
}
module.exports = cinemaRepository
