'use strict'
const emailLogRepository = require('../repositories/emailLogRepository')

const emailLogService = {
	async listRecent() {
		const rows = await emailLogRepository.listRecent(200)
		return rows.map((r) => ({
			_id: String(r.id), type: r.type, recipient: r.recipient, subject: r.subject, status: r.status,
			providerMessageId: r.providerMessageId, error: r.error, sentAt: r.sentAt, createdAt: r.createdAt,
			user: r.uid ? { _id: String(r.uid), username: r.username, email: r.email } : null,
			showtime: r.sid ? { _id: String(r.sid), showtime: r.showDatetime, movie: { name: r.movieName } } : null
		}))
	}
}
module.exports = emailLogService
