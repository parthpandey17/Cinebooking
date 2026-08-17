'use strict'
const { runner } = require('../db/withTransaction')
const R = (c) => runner(c)

const emailLogRepository = {
	async findByIdempotencyKey(key, conn) {
		if (!key) return null
		const [rows] = await R(conn).execute('SELECT id, status FROM email_logs WHERE idempotency_key = ? LIMIT 1', [key])
		return rows[0] || null
	},
	async record({ type, recipient, userId = null, ticketRef = null, showtimeId = null, subject, status, providerMessageId = null, idempotencyKey = null, error = null, metadata = null, sentAt = null }, conn) {
		await R(conn).execute(
			`INSERT INTO email_logs
			  (type, recipient, user_id, ticket_ref, showtime_id, subject, status, provider_message_id, idempotency_key, error, metadata, sent_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			[type, recipient, userId, ticketRef, showtimeId, subject, status, providerMessageId, idempotencyKey, error,
			 metadata ? JSON.stringify(metadata) : null, sentAt]
		)
	},

	async listRecent(limit, conn) {
		const [rows] = await runner(conn).query(
			`SELECT e.id, e.type, e.recipient, e.subject, e.status, e.provider_message_id AS providerMessageId,
			        e.error, e.sent_at AS sentAt, e.created_at AS createdAt,
			        u.id AS uid, u.username, u.email,
			        s.id AS sid, s.show_datetime AS showDatetime, m.name AS movieName
			 FROM email_logs e
			 LEFT JOIN users u ON u.id = e.user_id
			 LEFT JOIN showtimes s ON s.id = e.showtime_id
			 LEFT JOIN movies m ON m.id = s.movie_id
			 ORDER BY e.created_at DESC LIMIT ?`, [limit])
		return rows
	}
}
module.exports = emailLogRepository
