'use strict'
const QRCode = require('qrcode')
const ticketRepository = require('../repositories/ticketRepository')
const { withTransaction } = require('../db/withTransaction')
const { AppError } = require('../utils/AppError')

function makeTicketId(paymentId) {
	return `TKT-${String(paymentId).padStart(8, '0').slice(-8).toUpperCase()}`
}
async function generateQR(payload) {
	try {
		return await QRCode.toDataURL(payload, { errorCorrectionLevel: 'H', margin: 2, width: 300, color: { dark: '#1e1b4b', light: '#ffffff' } })
	} catch { return null }
}

const ticketService = {
	makeTicketId,

	// Idempotent: creates the ticket (+ seats) for a paid payment, returns display data.
	async createForPayment({ paymentId, userId, showtimeId, amountPaise, seats, razorpayPaymentId }, conn) {
		const existing = await ticketRepository.findByPaymentId(paymentId, conn)
		const ticketId = makeTicketId(paymentId)
		const seatLabels = seats.map((s) => `${s.row}${s.number}`)
		if (existing) {
			return { _id: String(existing.id), ticketId: existing.ticketId, bookedAt: existing.bookedAt, qrCodeDataUrl: await generateQR(existing.qrPayload) }
		}
		const qrPayload = JSON.stringify({ ticketId, bookingId: String(paymentId), userId: String(userId), showtimeId: String(showtimeId), seats: seatLabels })

		const run = async (c) => {
			const pk = await ticketRepository.create({ ticketId, paymentId, userId, showtimeId, amountPaid: amountPaise / 100, razorpayPaymentId, qrPayload }, c)
			await ticketRepository.addSeats(pk, seats, c)
			return pk
		}
		const pk = conn ? await run(conn) : await withTransaction(run)
		return { _id: String(pk), ticketId, bookedAt: new Date(), qrCodeDataUrl: await generateQR(qrPayload) }
	},

	// Build the populated ticket shape the frontend expects.
	async _hydrate(row, seatsMap, { withQR }) {
		const obj = {
			_id: String(row.id),
			ticketId: row.ticketId,
			user: { _id: String(row.userId), username: row.username, email: row.email },
			showtime: {
				_id: String(row.showtimeId), showtime: row.showDatetime, isRelease: !!row.isRelease,
				movie: { _id: String(row.m_id), name: row.m_name, length: row.m_length },
				theater: { _id: String(row.th_id), number: row.th_number, seatPlan: { row: row.sp_row, column: row.sp_col }, cinema: { _id: String(row.c_id), name: row.c_name } }
			},
			seats: seatsMap[String(row.id)] || [],
			amountPaid: Number(row.amountPaid),
			razorpayPaymentId: row.razorpayPaymentId,
			qrPayload: row.qrPayload,
			isUsed: !!row.isUsed, usedAt: row.usedAt,
			usedBy: row.ub_id ? { _id: String(row.ub_id), username: row.ub_username, email: row.ub_email } : null,
			isCancelled: !!row.isCancelled, cancelledAt: row.cancelledAt, cancellationReason: row.cancellationReason,
			refundAmount: row.refundAmount != null ? Number(row.refundAmount) : undefined,
			cancellationFee: row.cancellationFee != null ? Number(row.cancellationFee) : undefined,
			bookedAt: row.bookedAt
		}
		if (withQR) obj.qrCodeDataUrl = await generateQR(row.qrPayload)
		return obj
	},

	async _hydrateMany(rows, { withQR }) {
		const seatsMap = await ticketRepository.seatsForTickets(rows.map((r) => r.id))
		return Promise.all(rows.map((r) => this._hydrate(r, seatsMap, { withQR })))
	},

	async getById(ticketId, requester) {
		const row = await ticketRepository.oneByTicketId(ticketId)
		if (!row) { const e = new AppError('Ticket not found', 404); throw e }
		if (requester.role !== 'admin' && String(row.userId) !== String(requester.id)) throw new AppError('Not authorised to view this ticket', 403)
		const seatsMap = await ticketRepository.seatsForTickets([row.id])
		return this._hydrate(row, seatsMap, { withQR: true })
	},

	async getMyTickets(userId) {
		const rows = await ticketRepository.listByUser(userId)
		return this._hydrateMany(rows, { withQR: true })
	},

	async getByShowtime(showtimeId, isUsed) {
		const rows = await ticketRepository.listByShowtime(showtimeId, isUsed)
		return this._hydrateMany(rows, { withQR: false })
	},

	async getAllAdmin(query) {
		const page = Math.max(parseInt(query.page || '1', 10), 1)
		const limit = Math.min(parseInt(query.limit || '20', 10), 100)
		const { total, rows } = await ticketRepository.listAdmin({ page, limit, isUsed: query.isUsed, showtimeId: query.showtimeId, search: query.search })
		const data = await this._hydrateMany(rows, { withQR: false })
		return { total, totalPages: Math.ceil(total / limit), count: data.length, data }
	},

	// Scan / validate at the venue. Returns { status, body } for the controller.
	async validate({ qrPayload, ticketId: rawTicketId, adminId }) {
		let ticketId = rawTicketId
		if (qrPayload && !ticketId) {
			try { const parsed = typeof qrPayload === 'string' ? JSON.parse(qrPayload) : qrPayload; ticketId = parsed.ticketId }
			catch { throw new AppError('Invalid QR payload — could not parse JSON', 400) }
		}
		if (!ticketId) throw new AppError('ticketId or qrPayload is required', 400)
		const row = await ticketRepository.oneByTicketId(ticketId)
		if (!row) return { status: 404, body: { success: false, valid: false, message: 'Ticket not found — QR may be invalid or tampered' } }
		const seatsMap = await ticketRepository.seatsForTickets([row.id])
		const hydrated = await this._hydrate(row, seatsMap, { withQR: false })
		if (row.isCancelled) return { status: 409, body: { success: false, valid: false, message: 'Ticket has been cancelled and refunded', data: { ticketId: row.ticketId, showtime: hydrated.showtime, seats: hydrated.seats } } }
		if (row.isUsed) return { status: 409, body: { success: false, valid: false, alreadyUsed: true, message: `Ticket already used at ${new Date(row.usedAt).toLocaleString('en-IN')}`, data: { ticketId: row.ticketId, usedAt: row.usedAt, usedBy: hydrated.usedBy, showtime: hydrated.showtime, seats: hydrated.seats } } }
		const showDate = new Date(row.showDatetime)
		if (new Date() > new Date(showDate.getTime() + 4 * 60 * 60 * 1000)) {
			return { status: 400, body: { success: false, valid: false, message: 'Ticket is expired — showtime has already passed' } }
		}
		await ticketRepository.markUsed(row.id, adminId)
		return { status: 200, body: { success: true, valid: true, message: '✓ Ticket is valid — entry granted', data: { ticketId: row.ticketId, showtime: hydrated.showtime, seats: hydrated.seats.map((s) => `${s.row}${s.number}`), user: hydrated.user, usedAt: new Date(), amountPaid: hydrated.amountPaid } } }
	}
}
module.exports = ticketService
