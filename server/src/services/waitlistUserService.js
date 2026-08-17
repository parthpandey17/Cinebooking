'use strict'
const { withTransaction } = require('../db/withTransaction')
const waitlistUserRepository = require('../repositories/waitlistUserRepository')
const waitlistRepository = require('../repositories/waitlistRepository')
const seatLockRepository = require('../repositories/seatLockRepository')
const availabilityRepository = require('../repositories/availabilityRepository')
const showtimeRepository = require('../repositories/showtimeRepository')
const waitlistService = require('./waitlistService')
const { emitToUser } = require('../sockets/socketService')
const { AppError } = require('../utils/AppError')

const ACTIVE_OFFER = ['OFFERED', 'OFFER_PARTIAL']
const getRemaining = (e) => (e.seatsRemaining != null ? Number(e.seatsRemaining) : Number(e.seatsRequested) - Number(e.seatsAccepted || 0))

function shapeEntry(e) {
	return {
		_id: String(e.id), user: String(e.userId), showtime: String(e.showtimeId),
		seatsRequested: e.seatsRequested, seatsAccepted: e.seatsAccepted, seatsRemaining: getRemaining(e),
		status: e.status, position: e.position, closeAfterBooking: !!e.closeAfterBooking,
		joinedAt: e.joinedAt, offeredAt: e.offeredAt, offerExpiresAt: e.offerExpiresAt, confirmedAt: e.confirmedAt
	}
}

const waitlistUserService = {
	async join({ userId, showtimeId, seatsRequested }) {
		const n = parseInt(seatsRequested, 10)
		if (!Number.isInteger(n) || n < 1) throw new AppError('Invalid seat count.', 400)
		const st = await showtimeRepository.findByIdWithPlan(showtimeId)
		if (!st || new Date(st.showtime) <= new Date()) throw new AppError('This showtime is no longer eligible for a waitlist.', 400)

		const existing = await waitlistUserRepository.findByUserShowtime(userId, showtimeId)
		if (existing && ['WAITLISTED', 'OFFERED', 'OFFER_PARTIAL'].includes(existing.status)) {
			await waitlistService.processWaitlist(showtimeId)
			return { code: 200, message: 'You are already on the waitlist.', data: shapeEntry(existing) }
		}
		const position = (await waitlistUserRepository.countWaitlisted(showtimeId)) + 1
		let entryId
		if (existing) {
			await withTransaction((conn) => waitlistUserRepository.resetToWaitlisted(existing.id, n, position, conn))
			entryId = existing.id
		} else {
			entryId = await withTransaction((conn) => waitlistUserRepository.insertJoin(userId, showtimeId, n, position, conn))
		}
		await waitlistService.processWaitlist(showtimeId)
		const fresh = await waitlistUserRepository.findByUserShowtime(userId, showtimeId)
		return { code: 201, message: 'Added to waitlist.', data: shapeEntry(fresh || { id: entryId, userId, showtimeId, seatsRequested: n, status: 'WAITLISTED', seatsRemaining: n }) }
	},

	async myStatus({ userId, showtimeId }) {
		const entry = await waitlistUserRepository.findByUserShowtime(userId, showtimeId)
		if (!entry) return null
		let position = null
		if (entry.status === 'WAITLISTED') position = await waitlistUserRepository.countWaitlistedBefore(showtimeId, entry.joinedAt)
		return { ...shapeEntry(entry), position }
	},

	async myWaitlists({ userId }) {
		const rows = await waitlistUserRepository.listByUser(userId)
		return Promise.all(rows.map(async (e) => {
			const offeredSeats = await waitlistRepository.offeredSeatLabels(e.id)
			const partialBookings = await waitlistUserRepository.partialBookings(e.id)
			const obj = {
				_id: String(e.id), user: String(e.userId),
				showtime: { _id: String(e.showtimeId), showtime: e.showDatetime, movie: { _id: String(e.m_id), name: e.m_name, img: e.m_img }, theater: { number: e.th_number, cinema: { name: e.c_name } } },
				seatsRequested: e.seatsRequested, seatsAccepted: e.seatsAccepted, seatsRemaining: getRemaining(e),
				status: e.status, closeAfterBooking: !!e.closeAfterBooking, joinedAt: e.joinedAt,
				offerExpiresAt: e.offerExpiresAt, confirmedAt: e.confirmedAt, createdAt: e.createdAt,
				offeredSeats, partialBookings
			}
			if (e.status === 'WAITLISTED') obj.position = await waitlistUserRepository.countWaitlistedBefore(e.showtimeId, e.joinedAt)
			if (ACTIVE_OFFER.includes(e.status) && e.offerExpiresAt) obj.offerSecondsLeft = Math.max(0, Math.floor((new Date(e.offerExpiresAt).getTime() - Date.now()) / 1000))
			return obj
		}))
	},

	async accept({ userId, showtimeId, acceptedSeats, choice }) {
		const entry = await waitlistUserRepository.findOfferedEntry(userId, showtimeId)
		if (!entry) throw new AppError('Your waitlist offer has expired or does not exist.', 400)

		const offered = await waitlistRepository.offeredSeatLabels(entry.id)
		const booked = new Set(await availabilityRepository.bookedLabels(showtimeId))
		const otherLocked = new Set(await seatLockRepository.otherActiveLockLabels(userId, showtimeId))
		const stillAvailable = offered.filter((s) => !booked.has(s) && !otherLocked.has(s))
		if (!stillAvailable.length) {
			await withTransaction(async (conn) => {
				await seatLockRepository.deleteUserLocksForSeats(userId, showtimeId, offered, conn)
				await waitlistUserRepository.setStatus(entry.id, 'EXPIRED', {}, conn)
			})
			await waitlistService.processWaitlist(showtimeId)
			throw new AppError('Those seats are no longer available. You have been removed from the queue.', 400)
		}

		// FULL offer
		if (entry.status === 'OFFERED') {
			await withTransaction((conn) => waitlistUserRepository.setStatus(entry.id, 'ACCEPTED', { confirmed: true, closeAfterBooking: false }, conn))
			return { message: 'Offer accepted. Please select your preferred seats.', data: { showtimeId: String(showtimeId), seatsRequested: entry.seatsRequested, seatsAccepted: entry.seatsRequested, isPartialAcceptance: false } }
		}

		// PARTIAL offer — validate choice (only these three are accepted)
		if (choice && !['book_and_stay', 'book_and_leave', 'decline'].includes(choice)) throw new AppError('Invalid choice.', 400)
		const seatsOffered = stillAvailable.length
		const count = typeof acceptedSeats === 'number' ? acceptedSeats : seatsOffered
		const currentRemaining = getRemaining(entry)
		const newRemaining = currentRemaining - count
		if (!Number.isInteger(count) || count < 1 || count > seatsOffered) throw new AppError(`You can accept between 1 and ${seatsOffered} seats.`, 400)

		if (choice === 'decline') {
			await withTransaction(async (conn) => {
				await seatLockRepository.deleteUserLocksForSeats(userId, showtimeId, offered, conn)
				await waitlistUserRepository.setStatus(entry.id, 'REJECTED', {}, conn)
			})
			await waitlistService.processWaitlist(showtimeId)
			return { message: 'Offer declined. You have been removed from the waitlist.' }
		}

		if (choice === 'book_and_stay' || (!choice && newRemaining > 0)) {
			if (newRemaining <= 0) throw new AppError('Cannot stay in waitlist — accepting all offered seats satisfies your request. Use book_and_leave instead.', 400)
			const surplus = await withTransaction(async (conn) => {
				const s = await waitlistUserRepository.trimOfferedSeats(entry.id, count, conn)
				if (s.length) await seatLockRepository.deleteUserLocksForSeats(userId, showtimeId, s, conn)
				await waitlistUserRepository.setStatus(entry.id, 'ACCEPTED', { confirmed: true, closeAfterBooking: false }, conn)
				return s
			})
			if (surplus.length) await waitlistService.processWaitlist(showtimeId)
			emitToUser(userId, 'waitlist:partial-accepted', { waitlistId: String(entry.id), showtimeId: String(showtimeId), acceptedSeats: count, remainingInWaitlist: newRemaining })
			return { message: `Accepted ${count} seat${count !== 1 ? 's' : ''}. You will remain in waitlist for ${newRemaining} more.`, data: { showtimeId: String(showtimeId), seatsAccepted: count, remainingInWaitlist: newRemaining, isPartialAcceptance: true, stayInWaitlist: true } }
		}

		// book_and_leave (or choice omitted with newRemaining===0)
		const surplus = await withTransaction(async (conn) => {
			const s = await waitlistUserRepository.trimOfferedSeats(entry.id, count, conn)
			if (s.length) await seatLockRepository.deleteUserLocksForSeats(userId, showtimeId, s, conn)
			await waitlistUserRepository.setStatus(entry.id, 'ACCEPTED', { confirmed: true, closeAfterBooking: true }, conn)
			return s
		})
		if (surplus.length) await waitlistService.processWaitlist(showtimeId)
		return { message: 'Offer accepted. Please select your preferred seats.', data: { showtimeId: String(showtimeId), seatsAccepted: count, remainingInWaitlist: 0, isPartialAcceptance: newRemaining > 0, stayInWaitlist: false } }
	},

	async decline({ userId, showtimeId }) {
		const entry = await waitlistUserRepository.findActiveByStatuses(userId, showtimeId, ACTIVE_OFFER)
		if (!entry) throw new AppError('No active offer found.', 400)
		const offered = await waitlistRepository.offeredSeatLabels(entry.id)
		await withTransaction(async (conn) => {
			await seatLockRepository.deleteUserLocksForSeats(userId, showtimeId, offered, conn)
			await waitlistUserRepository.setStatus(entry.id, 'REJECTED', {}, conn)
		})
		await waitlistService.processWaitlist(showtimeId)
		return { message: 'Offer declined. You have been removed from the waitlist.' }
	},

	async leave({ userId, showtimeId }) {
		const entry = await waitlistUserRepository.findActiveByStatuses(userId, showtimeId, ['WAITLISTED', 'OFFERED', 'OFFER_PARTIAL', 'ACCEPTED'])
		if (!entry) return { message: 'You are not on this waitlist.' }
		const offered = await waitlistRepository.offeredSeatLabels(entry.id)
		const wasOffered = ['OFFERED', 'OFFER_PARTIAL', 'ACCEPTED'].includes(entry.status)
		await withTransaction(async (conn) => {
			await seatLockRepository.deleteUserLocksForSeats(userId, showtimeId, offered, conn)
			await waitlistUserRepository.setStatus(entry.id, 'CANCELLED', {}, conn)
		})
		if (wasOffered) await waitlistService.processWaitlist(showtimeId)
		return { message: 'Removed from waitlist.' }
	},

	async adminAll() {
		const rows = await waitlistUserRepository.listAll()
		return rows.map((e) => ({
			_id: String(e.id), user: { _id: String(e.userId), username: e.username, email: e.email },
			showtime: { _id: String(e.showtimeId), showtime: e.showDatetime, movie: { name: e.m_name, img: e.m_img }, theater: { number: e.th_number, cinema: { name: e.c_name } } },
			seatsRequested: e.seatsRequested, seatsAccepted: e.seatsAccepted, seatsRemaining: getRemaining(e), status: e.status, joinedAt: e.joinedAt
		}))
	},
	async adminStats() {
		const rows = await waitlistUserRepository.stats()
		return rows.map((r) => ({
			_id: String(r.showtimeId), total: Number(r.total),
			waitlisted: Number(r.waitlisted), offered: Number(r.offered), offerPartial: Number(r.offerPartial),
			accepted: Number(r.accepted), confirmed: Number(r.confirmed), expired: Number(r.expired),
			rejected: Number(r.rejected), cancelled: Number(r.cancelled),
			showtime: { _id: String(r.showtimeId), showtime: r.showDatetime }
		}))
	}
}
module.exports = waitlistUserService
