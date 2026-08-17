'use strict'
const { runner } = require('../db/withTransaction')

// Repositories ONLY execute SQL. No business logic. Every method accepts an
// optional `conn` so it can join an active transaction (defaults to the pool).
const userRepository = {
	async findByUsername(username, { withPassword = false } = {}, conn) {
		const cols = withPassword
			? 'id, username, email, role, password, created_at AS createdAt'
			: 'id, username, email, role, created_at AS createdAt'
		const [rows] = await runner(conn).execute(
			`SELECT ${cols} FROM users WHERE username = ? LIMIT 1`, [username]
		)
		return rows[0] || null
	},

	async findById(id, conn) {
		const [rows] = await runner(conn).execute(
			'SELECT id, username, email, role, created_at AS createdAt FROM users WHERE id = ? LIMIT 1', [id]
		)
		return rows[0] || null
	},

	async findByEmailOrUsername(email, username, conn) {
		const [rows] = await runner(conn).execute(
			'SELECT id, username, email, role FROM users WHERE email = ? OR username = ? LIMIT 1',
			[email, username]
		)
		return rows[0] || null
	},

	async create({ username, email, passwordHash, role = 'user' }, conn) {
		const [res] = await runner(conn).execute(
			'INSERT INTO users (username, email, role, password) VALUES (?, ?, ?, ?)',
			[username, email, role, passwordHash]
		)
		return this.findById(res.insertId, conn)
	},

	async findAll(conn) {
		const [rows] = await runner(conn).execute(
			`SELECT u.id, u.username, u.email, u.role, u.created_at AS createdAt,
			        (SELECT COUNT(*) FROM tickets t WHERE t.user_id = u.id AND t.is_cancelled = 0) AS ticketCount
			 FROM users u ORDER BY u.created_at DESC`
		)
		return rows
	},

	async countAdmins(conn) {
		const [rows] = await runner(conn).execute("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'")
		return rows[0].c
	},

	async hasBookingHistory(userId, conn) {
		const [rows] = await runner(conn).execute(
			`SELECT
			   (SELECT COUNT(*) FROM tickets  WHERE user_id = ?) +
			   (SELECT COUNT(*) FROM payments WHERE user_id = ?) AS c`,
			[userId, userId]
		)
		return rows[0].c > 0
	},


	async listUserTicketsGrouped(userId, conn) {
		// Returns the user's active (non-cancelled) tickets with showtime/movie/
		// theater/cinema joined — shaped to match the old embedded tickets payload.
		const [rows] = await runner(conn).execute(
			`SELECT t.id AS ticketPk, t.showtime_id AS showtimeId,
			        s.show_datetime AS showDatetime, s.is_release AS isRelease,
			        m.id AS movieId, m.name AS movieName, m.length AS movieLength, m.img AS movieImg,
			        th.number AS theaterNumber, c.name AS cinemaName
			 FROM tickets t
			 JOIN showtimes s ON s.id = t.showtime_id
			 JOIN movies m ON m.id = s.movie_id
			 JOIN theaters th ON th.id = s.theater_id
			 JOIN cinemas c ON c.id = th.cinema_id
			 WHERE t.user_id = ? AND t.is_cancelled = 0
			 ORDER BY t.booked_at DESC`,
			[userId]
		)
		if (!rows.length) return []
		const ids = rows.map((r) => r.ticketPk)
		const [seatRows] = await runner(conn).query(
			`SELECT ticket_id AS ticketPk, seat_row AS row, seat_number AS number
			 FROM ticket_seats WHERE ticket_id IN (${ids.map(() => '?').join(',')})`, ids
		)
		const seatsByTicket = {}
		for (const sr of seatRows) (seatsByTicket[sr.ticketPk] ||= []).push({ row: sr.row, number: sr.number })
		return rows.map((r) => ({
			showtime: {
				_id: String(r.showtimeId),
				showtime: r.showDatetime,
				isRelease: !!r.isRelease,
				movie: { _id: String(r.movieId), name: r.movieName, length: r.movieLength, img: r.movieImg },
				theater: { number: r.theaterNumber, cinema: { name: r.cinemaName } }
			},
			seats: seatsByTicket[r.ticketPk] || []
		}))
	},

	async updateRole(id, role, conn) {
		await runner(conn).execute('UPDATE users SET role = ? WHERE id = ?', [role, id])
		return this.findById(id, conn)
	},

	async remove(id, conn) {
		await runner(conn).execute('DELETE FROM users WHERE id = ?', [id])
	}
}

module.exports = userRepository
