'use strict'
const { pool } = require('../db/pool')
const { sendEmailSafely, sendReminder } = require('./emailService')

// Send a reminder for tickets whose showtime starts within the next 2 hours and
// that haven't been reminded yet (idempotency via email_logs key reminder:<ticketPk>).
async function sendDueReminders() {
	const [rows] = await pool.query(
		`SELECT t.id AS ticketPk, t.ticket_id AS ticketId, t.user_id AS userId, t.showtime_id AS showtimeId,
		        u.email, s.show_datetime AS showDatetime, m.name AS movieName
		 FROM tickets t
		 JOIN users u ON u.id = t.user_id
		 JOIN showtimes s ON s.id = t.showtime_id
		 JOIN movies m ON m.id = s.movie_id
		 WHERE t.is_cancelled = 0
		   AND s.show_datetime BETWEEN NOW() AND (NOW() + INTERVAL 2 HOUR)
		   AND NOT EXISTS (SELECT 1 FROM email_logs e WHERE e.idempotency_key = CONCAT('reminder:', t.id))`)
	for (const r of rows) {
		await sendEmailSafely(sendReminder({
			to: r.email, userId: r.userId, ticketRef: r.ticketPk, showtimeId: r.showtimeId,
			ticketId: r.ticketId, movieName: r.movieName, when: r.showDatetime
		}), 'Reminder')
	}
	return rows.length
}
module.exports = { sendDueReminders }
