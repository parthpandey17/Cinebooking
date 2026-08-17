'use strict'
const crypto = require('crypto')
const Razorpay = require('razorpay')
const config = require('../config')
const { withTransaction } = require('../db/withTransaction')
const paymentRepository = require('../repositories/paymentRepository')
const showtimeRepository = require('../repositories/showtimeRepository')
const availabilityRepository = require('../repositories/availabilityRepository')
const seatLockRepository = require('../repositories/seatLockRepository')
const ticketService = require('./ticketService')
const waitlistService = require('./waitlistService')
const { sendEmailSafely, sendBookingConfirmation } = require('./emailService')
const { AppError } = require('../utils/AppError')
const logger = require('../utils/logger')
const { labelToSeat, rowToNumber } = require('../utils/seats')

const PRICE_PER_SEAT = config.pricePerSeat
let razorpayClient = null

const getRazorpayClient = () => {
	if (razorpayClient) return razorpayClient
	if (!config.razorpay.keyId || !config.razorpay.keySecret) {
		throw new AppError('Razorpay keys are not configured', 503)
	}
	razorpayClient = new Razorpay({ key_id: config.razorpay.keyId, key_secret: config.razorpay.keySecret })
	return razorpayClient
}

const seatWithinPlan = (label, spRow, spCol) => {
	const s = labelToSeat(label)
	return !!s && rowToNumber(s.row) <= rowToNumber(spRow) && s.number <= Number(spCol)
}
const hmac = (secret, body) => crypto.createHmac('sha256', secret).update(body).digest('hex')

// Build the ticketData response object (same shape the frontend consumes).
async function buildTicketData(payment, seats, ticketDoc, razorpayPaymentId) {
	const st = await showtimeRepository.findFullById(payment.showtimeId)
	const populatedShowtime = st ? {
		_id: String(st.id), showtime: st.showtime, isRelease: !!st.isRelease,
		movie: { _id: String(st.m_id), name: st.m_name, length: st.m_length, img: st.m_img },
		theater: { _id: String(st.th_id), number: st.th_number, seatPlan: { row: st.sp_row, column: st.sp_col }, cinema: { _id: String(st.c_id), name: st.c_name } }
	} : null
	return {
		ticketId: ticketDoc.ticketId,
		seats: seats.map((s) => `${s.row}${s.number}`),
		amount: payment.amount / 100,
		currency: 'INR',
		razorpayPaymentId: razorpayPaymentId || payment.razorpayPaymentId,
		showtime: populatedShowtime,
		qrCodeDataUrl: ticketDoc.qrCodeDataUrl,
		bookedAt: new Date(ticketDoc.bookedAt).toISOString()
	}
}

// Atomic, idempotent finalize. Concurrency = row lock on the showtime +
// UNIQUE(showtime_id,row,number) backstop. Returns { ok, ticketData } | { ok:false }.
async function finalizeBooking({ payment, razorpayPaymentId, razorpaySignature }) {
	if (payment.status === 'paid' && payment.ticketData) {
		await seatLockRepository.deleteUserLocks(payment.userId, payment.showtimeId)
		return { ok: true, ticketData: payment.ticketData, alreadyDone: true }
	}
	const seats = await paymentRepository.seatsFor(payment.id)
	const seatLabels = seats.map((s) => `${s.row}${s.number}`)

	let conflict = false
	try {
		await withTransaction(async (conn) => {
			const st = await paymentRepository.lockShowtimeRow(payment.showtimeId, conn) // SELECT ... FOR UPDATE
			if (!st) { const e = new Error('Showtime no longer exists'); e.code404 = true; throw e }

			for (const s of seats) {
				const existing = await paymentRepository.isSeatBooked(payment.showtimeId, s.row, s.number, conn)
				if (existing) {
					// idempotent re-run if it's already ours; otherwise a real conflict
					if (String(existing.userId) === String(payment.userId)) continue
					conflict = true
					throw new Error('seat conflict')
				}
				try {
					await paymentRepository.insertBookedSeat(payment.showtimeId, s.row, s.number, payment.userId, conn)
				} catch (err) {
					if (err && err.code === 'ER_DUP_ENTRY') { conflict = true; throw new Error('seat conflict') }
					throw err
				}
			}
			await paymentRepository.setStatus(payment.id, 'paid', {
				razorpayPaymentId: razorpayPaymentId || payment.razorpayPaymentId,
				...(razorpaySignature ? { razorpaySignature } : {})
			}, conn)
		})
	} catch (err) {
		if (conflict) {
			await paymentRepository.setStatus(payment.id, 'failed').catch(() => {})
			await seatLockRepository.deleteUserLocks(payment.userId, payment.showtimeId).catch(() => {})
			await waitlistService.processWaitlist(payment.showtimeId).catch(() => {})
			return { ok: false, reason: 'Seats were taken by another booking', code: 409 }
		}
		if (err.code404) return { ok: false, reason: 'Showtime no longer exists', code: 404 }
		throw err
	}

	// ── Post-commit side effects (idempotent) ──
	const ticketDoc = await ticketService.createForPayment({
		paymentId: payment.id, userId: payment.userId, showtimeId: payment.showtimeId,
		amountPaise: payment.amount, seats, razorpayPaymentId: razorpayPaymentId || payment.razorpayPaymentId
	})
	await paymentRepository.linkBookedSeatsToTicket(payment.showtimeId, payment.userId, seatLabels, ticketDoc._id).catch(() => {})

	const ticketData = await buildTicketData(payment, seats, ticketDoc, razorpayPaymentId)
	await paymentRepository.setTicketData(payment.id, ticketData)
	await seatLockRepository.deleteUserLocks(payment.userId, payment.showtimeId)
	await waitlistService.completeWaitlistForBooking({
		userId: payment.userId, showtimeId: payment.showtimeId, seatsJustBooked: seats.length, seatLabels
	})
	sendEmailSafely(sendBookingConfirmation({
		to: payment.__userEmail, userId: payment.userId, ticketRef: ticketDoc._id, showtimeId: payment.showtimeId,
		ticketId: ticketDoc.ticketId, movieName: ticketData.showtime?.movie?.name, seats: seatLabels, when: ticketData.showtime?.showtime
	}), 'Booking confirmation')

	return { ok: true, ticketData }
}

const paymentService = {
	finalizeBooking,

	async createOrder({ user, showtimeId, seats }) {
		if (!showtimeId || !Array.isArray(seats) || seats.length === 0) throw new AppError('showtimeId and seats are required', 400)
		const st = await showtimeRepository.findByIdWithPlan(showtimeId)
		if (!st) throw new AppError('Showtime not found', 404)
		if (!st.isRelease) throw new AppError('Showtime is not released yet', 400)
		if (!seats.every((l) => seatWithinPlan(l, st.seatPlanRow, st.seatPlanColumn))) throw new AppError('One or more seats are invalid', 400)

		const booked = new Set([...(await availabilityRepository.bookedLabels(showtimeId)), ...(await paymentRepository.paidSeatLabels(showtimeId))])
		if (seats.some((l) => booked.has(l))) throw new AppError('One or more seats are already booked', 400)

		const held = new Set(await seatLockRepository.activeUserLockLabels(user.id, showtimeId))
		const missing = seats.filter((l) => !held.has(l))
		if (missing.length) throw new AppError(`Seat reservation expired or not found for seat(s): ${missing.join(', ')}. Please re-select your seats.`, 400, { expiredSeats: missing })

		await paymentRepository.cancelCreatedForUser(user.id, showtimeId)

		const amountInPaise = seats.length * PRICE_PER_SEAT * 100
		const order = await getRazorpayClient().orders.create({
			amount: amountInPaise, currency: 'INR',
			receipt: `cb_${Date.now()}_${String(user.id).slice(-8)}`,
			notes: { userId: String(user.id), showtimeId: String(showtimeId), seats: seats.join(',') }
		})
		const seatObjs = seats.map((l) => { const s = labelToSeat(l); return { row: s.row, number: s.number } })
		const paymentId = await withTransaction((conn) => paymentRepository.create({ razorpayOrderId: order.id, amount: amountInPaise, userId: user.id, showtimeId, seats: seatObjs }, conn))

		return { orderId: order.id, amount: amountInPaise, currency: 'INR', keyId: config.razorpay.keyId, paymentId: String(paymentId), seats, showtimeId }
	},

	async verifyPayment({ user, razorpay_order_id, razorpay_payment_id, razorpay_signature }) {
		if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) throw new AppError('Missing payment verification fields', 400)
		const expected = hmac(config.razorpay.keySecret, `${razorpay_order_id}|${razorpay_payment_id}`)
		if (expected !== razorpay_signature) {
			const failed = await paymentRepository.findByOrderIdAndUser(razorpay_order_id, user.id)
			if (failed) {
				await paymentRepository.setStatus(failed.id, 'failed', { razorpayPaymentId: razorpay_payment_id })
				await seatLockRepository.deleteUserLocks(user.id, failed.showtimeId)
				await waitlistService.processWaitlist(failed.showtimeId)
			}
			throw new AppError('Payment verification failed — invalid signature', 400)
		}
		const payment = await paymentRepository.findByOrderIdAndUser(razorpay_order_id, user.id)
		if (!payment) throw new AppError('Payment record not found', 404)
		payment.__userEmail = user.email
		const result = await finalizeBooking({ payment, razorpayPaymentId: razorpay_payment_id, razorpaySignature: razorpay_signature })
		if (!result.ok) throw new AppError(result.reason, result.code || 409)
		return result.ticketData
	},

	async handleWebhook({ rawBody, signature, body }) {
		const secret = config.razorpay.webhookSecret
		if (!secret || !signature) throw new AppError('Webhook secret or signature missing', 400)
		if (hmac(secret, rawBody) !== signature) throw new AppError('Invalid webhook signature', 400)

		const event = body && body.event ? body : JSON.parse(rawBody)
		const type = event.event
		logger.info(`Razorpay webhook: ${type}`)

		const finalizeByOrderId = async (orderId, paymentId) => {
			if (!orderId) return
			const payment = await paymentRepository.findByOrderId(orderId)
			if (!payment) return
			if (payment.webhookProcessed && payment.status === 'paid') return
			const result = await finalizeBooking({ payment, razorpayPaymentId: paymentId || payment.razorpayPaymentId })
			if (result.ok) await paymentRepository.setStatus(payment.id, 'paid', { webhookProcessed: true })
			else logger.warn(`Webhook finalize failed for order ${orderId}: ${result.reason}`)
		}
		const failOrder = async (orderId, paymentId, requireCreated) => {
			if (!orderId) return
			const payment = await paymentRepository.findByOrderId(orderId)
			if (!payment) return
			if (requireCreated ? payment.status !== 'created' : (payment.webhookProcessed || payment.status === 'paid')) return
			await paymentRepository.setStatus(payment.id, 'failed', { webhookProcessed: true, ...(paymentId ? { razorpayPaymentId: paymentId } : {}) })
			await seatLockRepository.deleteUserLocks(payment.userId, payment.showtimeId)
			await waitlistService.processWaitlist(payment.showtimeId)
		}

		switch (type) {
			case 'payment.captured':
			case 'order.paid': {
				const orderId = event.payload.payment?.entity?.order_id || event.payload.order?.entity?.id
				await finalizeByOrderId(orderId, event.payload.payment?.entity?.id); break
			}
			case 'invoice.paid': {
				const inv = event.payload.invoice?.entity
				await finalizeByOrderId(inv?.order_id, inv?.payment_id); break
			}
			case 'payment.failed':
				await failOrder(event.payload.payment?.entity?.order_id, event.payload.payment?.entity?.id, false); break
			case 'invoice.expired':
				await failOrder(event.payload.invoice?.entity?.order_id, null, true); break
			case 'refund.processed':
			case 'refund.failed':
				await require('./cancelService').handleRefundWebhook(event); break
			default:
				logger.info(`Unhandled webhook event: ${type}`)
		}
	},

	async cancelPayment({ user, orderId }) {
		if (!orderId) throw new AppError('orderId is required', 400)
		const payment = await paymentRepository.findByOrderIdAndUser(orderId, user.id)
		if (!payment) return { message: 'Payment already cancelled or not found' }
		if (payment.status !== 'created') return { message: `Payment is already in status: ${payment.status}` }
		await paymentRepository.setStatus(payment.id, 'cancelled')
		await seatLockRepository.deleteUserLocks(user.id, payment.showtimeId)
		await waitlistService.processWaitlist(payment.showtimeId)
		return { message: 'Payment cancelled' }
	},

	async getPaymentStatus({ user, orderId }) {
		const payment = await paymentRepository.findByOrderIdAndUser(orderId, user.id)
		if (!payment) throw new AppError('Payment not found', 404)
		return { status: payment.status, orderId: payment.razorpayOrderId, paymentId: payment.razorpayPaymentId, amount: payment.amount, ticketData: payment.ticketData }
	}
}
module.exports = paymentService
