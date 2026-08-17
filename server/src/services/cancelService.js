'use strict'
const Razorpay = require('razorpay')
const config = require('../config')
const { withTransaction } = require('../db/withTransaction')
const cancelRepository = require('../repositories/cancelRepository')
const ticketRepository = require('../repositories/ticketRepository')
const paymentRepository = require('../repositories/paymentRepository')
const waitlistService = require('./waitlistService')
const { sendEmailSafely, sendCancellation } = require('./emailService')
const { AppError } = require('../utils/AppError')
const logger = require('../utils/logger')

const CANCEL_CUTOFF_HOURS = parseInt(process.env.CANCEL_CUTOFF_HOURS || '6', 10)
const CANCELLATION_FEE_PERCENT = parseFloat(process.env.CANCELLATION_FEE_PERCENT || '15')
const razorpay = new Razorpay({ key_id: config.razorpay.keyId, key_secret: config.razorpay.keySecret })

function computeCancellation(showtimeDate, originalAmountPaise) {
	const now = new Date()
	const cutoff = new Date(showtimeDate.getTime() - CANCEL_CUTOFF_HOURS * 60 * 60 * 1000)
	if (now >= cutoff) return { canCancel: false, reason: `Cancellation is not allowed within ${CANCEL_CUTOFF_HOURS} hours of the showtime.` }
	const feePaise = Math.round(originalAmountPaise * CANCELLATION_FEE_PERCENT / 100)
	const refundPaise = originalAmountPaise - feePaise
	return { canCancel: true, refundAmountPaise: refundPaise, feePaise, refundAmountINR: refundPaise / 100, feeINR: feePaise / 100, feePercent: CANCELLATION_FEE_PERCENT, cutoffHours: CANCEL_CUTOFF_HOURS }
}

// Resolve the razorpayPaymentId + original amount, tolerating legacy/missing payments.
async function resolvePaymentBasis(ticketRow) {
	const payment = await cancelRepository.paymentForTicket(ticketRow.id)
	const hasPaid = payment && payment.status === 'paid'
	const razorpayPaymentId = hasPaid ? payment.razorpayPaymentId : ticketRow.razorpayPaymentId
	const originalAmountPaise = hasPaid ? Number(payment.amount) : Math.round((Number(ticketRow.amountPaid) || 0) * 100)
	return { payment, razorpayPaymentId, originalAmountPaise }
}

const cancelService = {
	CANCEL_CUTOFF_HOURS, CANCELLATION_FEE_PERCENT,

	async preview(ticketId, requester) {
		const row = await ticketRepository.oneByTicketId(ticketId)
		if (!row) throw new AppError('Ticket not found', 404)
		if (requester.role !== 'admin' && String(row.userId) !== String(requester.id)) throw new AppError('Not authorised', 403)
		if (row.isCancelled) throw new AppError('Ticket is already cancelled', 400)
		if (row.isUsed) throw new AppError('Cannot cancel a ticket that has already been used', 400)
		const { razorpayPaymentId, originalAmountPaise } = await resolvePaymentBasis(row)
		if (!razorpayPaymentId || !originalAmountPaise) throw new AppError('No confirmed payment found for this ticket', 400)
		const showDate = new Date(row.showDatetime)
		const calc = computeCancellation(showDate, originalAmountPaise)
		const seatsMap = await ticketRepository.seatsForTickets([row.id])
		const hoursUntilShow = Math.max(0, (showDate - new Date()) / 3600000)
		return {
			ticketId: row.ticketId,
			seats: (seatsMap[String(row.id)] || []).map((s) => `${s.row}${s.number}`),
			showtime: { _id: String(row.showtimeId), showtime: row.showDatetime, movie: { name: row.m_name }, theater: { number: row.th_number, cinema: { name: row.c_name } } },
			originalAmount: originalAmountPaise / 100,
			hoursUntilShow: Math.round(hoursUntilShow * 10) / 10,
			cutoffHours: CANCEL_CUTOFF_HOURS,
			...calc
		}
	},

	async cancel(ticketId, requester, reason = '') {
		const row = await ticketRepository.oneByTicketId(ticketId)
		if (!row) throw new AppError('Ticket not found', 404)
		if (requester.role !== 'admin' && String(row.userId) !== String(requester.id)) throw new AppError('Not authorised', 403)
		if (row.isCancelled) throw new AppError('Ticket is already cancelled', 400)
		if (row.isUsed) throw new AppError('Cannot cancel a ticket that has already been used at the venue', 400)

		const { payment, razorpayPaymentId, originalAmountPaise } = await resolvePaymentBasis(row)
		if (!razorpayPaymentId || !originalAmountPaise) throw new AppError('No confirmed payment found for this ticket — cannot process refund automatically. Contact support.', 400)

		const calc = computeCancellation(new Date(row.showDatetime), originalAmountPaise)
		if (!calc.canCancel) throw new AppError(calc.reason, 400)

		let refund
		try {
			refund = await razorpay.payments.refund(razorpayPaymentId, {
				amount: calc.refundAmountPaise, speed: 'normal',
				notes: { ticketId: row.ticketId, reason: reason || 'Customer cancellation', cancellationFee: `${CANCELLATION_FEE_PERCENT}%` }
			})
		} catch (rzpErr) {
			const msg = rzpErr?.error?.description || rzpErr?.description || rzpErr?.message
			throw new AppError(`Refund initiation failed: ${msg}. Please contact support with ticket ID ${row.ticketId}.`, 502)
		}

		const seatsMap = await ticketRepository.seatsForTickets([row.id])
		const seats = seatsMap[String(row.id)] || []

		await withTransaction(async (conn) => {
			if (payment) {
				await cancelRepository.setRefunded(payment.id, {
					razorpayRefundId: refund.id, refundAmount: calc.refundAmountPaise, cancellationFee: calc.feePaise,
					feePercent: CANCELLATION_FEE_PERCENT, status: refund.status || 'pending', reason: reason || null
				}, conn)
			}
			await ticketRepository.setCancelled(row.id, { reason: reason || null, refundAmountINR: calc.refundAmountINR, feeINR: calc.feeINR }, conn)
			await cancelRepository.releaseBookedSeats(row.showtimeId, seats, conn)
		})

		sendEmailSafely(sendCancellation({ to: row.email, userId: row.userId, ticketRef: row.id, showtimeId: row.showtimeId, ticketId: row.ticketId, refundAmount: calc.refundAmountINR }), 'Cancellation')
		await waitlistService.processWaitlist(row.showtimeId)

		return {
			message: `Booking cancelled. Refund of ₹${calc.refundAmountINR} initiated (${CANCELLATION_FEE_PERCENT}% fee of ₹${calc.feeINR} retained).`,
			data: { ticketId: row.ticketId, razorpayRefundId: refund.id, refundAmount: calc.refundAmountINR, cancellationFee: calc.feeINR, feePercent: CANCELLATION_FEE_PERCENT, refundStatus: refund.status, estimatedArrival: '5–7 business days' }
		}
	},

	async getRefunds(query) {
		const page = Math.max(parseInt(query.page || '1', 10), 1)
		const limit = Math.min(parseInt(query.limit || '20', 10), 100)
		const { total, rows } = await cancelRepository.listRefunds({ page, limit })
		const data = rows.map((r) => ({
			_id: String(r.id), razorpayOrderId: r.razorpayOrderId, amount: Number(r.amount),
			refund: { refundAmount: r.refundAmount != null ? Number(r.refundAmount) : null, cancellationFee: r.cancellationFee != null ? Number(r.cancellationFee) : null, status: r.refundStatus, refundedAt: r.refundedAt },
			user: { _id: String(r.userId), username: r.username, email: r.email },
			showtime: { _id: String(r.showtimeId), showtime: r.showDatetime, movie: { name: r.movieName }, theater: { number: r.theaterNumber, cinema: { name: r.cinemaName } } }
		}))
		return { total, totalPages: Math.ceil(total / limit), count: data.length, data }
	},

	async handleRefundWebhook(event) {
		const type = event.event
		const refundEntity = event.payload.refund?.entity
		if (!refundEntity?.id) return
		if (type === 'refund.processed') { await cancelRepository.setRefundStatusByRefundId(refundEntity.id, 'processed'); logger.info(`Refund processed: ${refundEntity.id}`) }
		if (type === 'refund.failed') { await cancelRepository.setRefundStatusByRefundId(refundEntity.id, 'failed'); logger.warn(`Refund failed: ${refundEntity.id}`) }
	}
}
module.exports = cancelService
