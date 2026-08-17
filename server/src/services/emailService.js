'use strict'
const config = require('../config')
const logger = require('../utils/logger')
const emailLogRepository = require('../repositories/emailLogRepository')

const RESEND_API_URL = 'https://api.resend.com/emails'

if (!config.resend.apiKey) {
	logger.warn('[email] RESEND_API_KEY not set — emails will be skipped (not sent).')
} else if (!config.resend.fromEmail) {
	logger.warn("[email] RESEND_FROM_EMAIL not set — falling back to onboarding@resend.dev (test mode: delivers only to your Resend account).")
}

// Low-level send + email_logs write. Idempotent via idempotencyKey.
async function send({ type, to, subject, html, userId, ticketRef, showtimeId, idempotencyKey, metadata }) {
	if (idempotencyKey) {
		const existing = await emailLogRepository.findByIdempotencyKey(idempotencyKey)
		if (existing) return { skipped: true, reason: 'duplicate' }
	}
	if (!config.resend.apiKey) {
		logger.warn(`[email] skipped ${type} to ${to} — RESEND_API_KEY not configured`)
		await emailLogRepository.record({ type, recipient: to, userId, ticketRef, showtimeId, subject, status: 'skipped', idempotencyKey, error: 'RESEND_API_KEY not configured', metadata })
		return { skipped: true }
	}
	try {
		const from = config.resend.fromEmail || 'CineBooker <onboarding@resend.dev>'
		const res = await fetch(RESEND_API_URL, {
			method: 'POST',
			headers: { Authorization: `Bearer ${config.resend.apiKey}`, 'Content-Type': 'application/json' },
			body: JSON.stringify({ from, to, subject, html })
		})
		const data = await res.json().catch(() => ({}))
		if (!res.ok) throw new Error(data?.message || `Resend responded ${res.status}`)
		await emailLogRepository.record({ type, recipient: to, userId, ticketRef, showtimeId, subject, status: 'sent', providerMessageId: data?.id || null, idempotencyKey, metadata, sentAt: new Date() })
		return { sent: true, id: data?.id }
	} catch (err) {
		logger.error(`[email] failed ${type} to ${to}: ${err.message}`)
		await emailLogRepository.record({ type, recipient: to, userId, ticketRef, showtimeId, subject, status: 'failed', idempotencyKey, error: err.message, metadata })
		return { failed: true, error: err.message }
	}
}

// Fire-and-forget wrapper used across services (never blocks the booking flow).
function sendEmailSafely(promise, label) {
	Promise.resolve(promise).catch((err) => logger.error(`[email] ${label} error: ${err.message}`))
	return promise
}

// ── Content builders (return the send() promise) ──────────────────────────────
const esc = (s) => String(s == null ? '' : s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))

function sendBookingConfirmation({ to, userId, ticketRef, showtimeId, ticketId, movieName, seats, when }) {
	const subject = `Your CineBooker ticket ${ticketId}`
	const html = `<h2>Booking confirmed 🎬</h2><p>Ticket <b>${esc(ticketId)}</b> for <b>${esc(movieName)}</b>.</p>
		<p>Seats: <b>${esc((seats || []).join(', '))}</b><br/>Showtime: ${esc(when)}</p>`
	return send({ type: 'booking_confirmation', to, subject, html, userId, ticketRef, showtimeId, idempotencyKey: `booking:${ticketRef}` })
}
function sendWaitlistOffer({ to, userId, showtimeId, movieName, seats, offerExpiresAt, isPartial }) {
	const subject = `Seat${seats.length > 1 ? 's' : ''} available for ${movieName}`
	const link = config.resend.frontendAppUrl ? `${config.resend.frontendAppUrl}/my-waitlists` : ''
	const html = `<h2>${isPartial ? 'Partial ' : ''}seat offer</h2>
		<p><b>${esc(seats.length)}</b> seat(s) available for <b>${esc(movieName)}</b>: ${esc(seats.join(', '))}</p>
		<p>Offer expires at ${esc(offerExpiresAt)}.</p>${link ? `<p><a href="${esc(link)}">Respond to offer</a></p>` : ''}`
	return send({ type: 'waitlist_offer', to, subject, html, userId, showtimeId })
}
function sendCancellation({ to, userId, ticketRef, showtimeId, ticketId, refundAmount }) {
	const subject = `Cancellation & refund for ${ticketId}`
	const html = `<h2>Ticket cancelled</h2><p>Ticket <b>${esc(ticketId)}</b> cancelled. Refund: <b>₹${esc(refundAmount)}</b>.</p>`
	return send({ type: 'cancellation', to, subject, html, userId, ticketRef, showtimeId, idempotencyKey: `cancel:${ticketRef}` })
}
function sendReminder({ to, userId, ticketRef, showtimeId, ticketId, movieName, when }) {
	const subject = `Reminder: ${movieName} starts soon`
	const html = `<h2>See you soon 🍿</h2><p>Ticket <b>${esc(ticketId)}</b> — <b>${esc(movieName)}</b> at ${esc(when)}.</p>`
	return send({ type: 'reminder', to, subject, html, userId, ticketRef, showtimeId, idempotencyKey: `reminder:${ticketRef}` })
}

module.exports = { send, sendEmailSafely, sendBookingConfirmation, sendWaitlistOffer, sendCancellation, sendReminder }
