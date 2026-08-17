'use strict'
const { runner } = require('../db/withTransaction')
const R = (c) => runner(c)

const SEL = 'id, name, length, img, created_at AS createdAt, updated_at AS updatedAt'

const movieRepository = {
	async findAllActive(conn) {
		const [rows] = await R(conn).query(`SELECT ${SEL} FROM movies WHERE is_active = 1 ORDER BY created_at DESC`)
		return rows
	},
	async findById(id, conn) {
		const [rows] = await R(conn).execute(`SELECT ${SEL} FROM movies WHERE id = ? AND is_active = 1 LIMIT 1`, [id])
		return rows[0] || null
	},
	async create({ name, length, img }, conn) {
		const [res] = await R(conn).execute('INSERT INTO movies (name, length, img) VALUES (?, ?, ?)', [name, length, img])
		return this.findById(res.insertId, conn)
	},
	async update(id, fields, conn) {
		const allowed = ['name', 'length', 'img']
		const sets = [], vals = []
		for (const k of allowed) if (fields[k] !== undefined) { sets.push(`${k} = ?`); vals.push(fields[k]) }
		if (!sets.length) return this.findById(id, conn)
		vals.push(id)
		await R(conn).execute(`UPDATE movies SET ${sets.join(', ')} WHERE id = ? AND is_active = 1`, vals)
		return this.findById(id, conn)
	},
	async softDelete(id, conn) {
		const [res] = await R(conn).execute(
			'UPDATE movies SET is_active = 0, deleted_at = NOW() WHERE id = ? AND is_active = 1', [id])
		return res.affectedRows > 0
	},
	// Movies that have upcoming showtimes, with a count. released=true => only is_release=1
	async showingMovies({ released }, conn) {
		const relClause = released ? 'AND s.is_release = 1' : ''
		const order = released ? 'ORDER BY count DESC' : 'ORDER BY count DESC, m.updated_at DESC'
		const [rows] = await R(conn).query(
			`SELECT m.id AS id, m.name AS name, m.length AS length, m.img AS img,
			        m.created_at AS createdAt, m.updated_at AS updatedAt, COUNT(*) AS count
			 FROM showtimes s
			 JOIN movies m ON m.id = s.movie_id AND m.is_active = 1
			 WHERE s.is_active = 1 AND s.show_datetime >= NOW() ${relClause}
			 GROUP BY m.id, m.name, m.length, m.img, m.created_at, m.updated_at ${order}`)
		return rows
	}
}
module.exports = movieRepository
