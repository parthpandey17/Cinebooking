'use strict'
const config = require('../config')
const { withTransaction } = require('../db/withTransaction')
const seatLockRepository = require('../repositories/seatLockRepository')
const waitlistRepository = require('../repositories/waitlistRepository')
const showtimeRepository = require('../repositories/showtimeRepository')
const availabilityRepository = require('../repositories/availabilityRepository')
const waitlistService = require('./waitlistService')
const { AppError } = require('../utils/AppError')
const { labelToSeat, rowToNumber } = require('../utils/seats')

const LOCK_MS = config.seatLock.durationMs
const LOCK_MINUTES = Math.round(LOCK_MS / 60000)

// Validate seat label is well-formed AND inside the theater's plan.
function seatWithinPlan(label, spRow, spCol) {
	const s = labelToSeat(label)
	if (!s) return false
	return rowToNumber(s.row) <= rowToNumber(spRow) && s.number <= Number(spCol)
}

const seatLockService = {
	LOCK_MINUTES,

	async lock({ userId, showtimeId, seats }) {
		if (!showtimeId || !Array.isArray(seats) || seats.length === 0) throw new AppError('showtimeId and seats array are required', 400)
		if (seats.length > 10) throw new AppError('Maximum 10 seats per booking', 400)

		const st = await showtimeRepository.findByIdWithPlan(showtimeId)
		if (!st) throw new AppError('Showtime not found', 404)
		if (!st.isRelease) throw new AppError('Showtime is not released', 400)

		if (!seats.every((l) => seatWithinPlan(l, st.seatPlanRow, st.seatPlanColumn))) {
			throw new AppError('One or more seats are not valid', 400)
		}
		// Already-booked check
		const booked = new Set(await availabilityRepository.bookedLabels(showtimeId))
		const clash = seats.filter((l) => booked.has(l))
		if (clash.length) throw new AppError(`Seat(s) already booked: ${clash.join(', ')}`, 400)

		const until = new Date(Date.now() + LOCK_MS)

		const conflict = await withTransaction(async (conn) => {
			// Free any expired holds on these seats first so availability is correct.
			await seatLockRepository.deleteExpiredForSeats(showtimeId, seats, conn)
			// Drop this user's locks that are no longer part of the selection.
			await seatLockRepository.deleteUserLocksNotIn(userId, showtimeId, seats, conn)
			// Refresh the ones they already hold.
			const held = await seatLockRepository.allUserLockLabels(userId, showtimeId, conn)
			const heldSet = new Set(held)
			await seatLockRepository.refreshUserLocks(userId, showtimeId, seats.filter((l) => heldSet.has(l)), until, conn)
			// Insert the new ones; a duplicate = another user holds it.
			for (const label of seats.filter((l) => !heldSet.has(l))) {
				try {
					await seatLockRepository.insertLock(userId, showtimeId, label, until, conn)
				} catch (err) {
					if (err && err.code === 'ER_DUP_ENTRY') return label
					throw err
				}
			}
			// Keep an ACCEPTED waitlist entry's offered seats in sync.
			await waitlistRepository.syncAcceptedOffer(userId, showtimeId, seats, until, conn)
			return null
		})

		if (conflict) {
			throw new AppError(`Seat ${conflict} was just selected by another user. Please choose different seats.`, 409)
		}
		return { showtimeId, seats, expiresAt: until, lockDurationMinutes: LOCK_MINUTES }
	},

	async unlock({ userId, showtimeId }) {
		if (!showtimeId) throw new AppError('showtimeId is required', 400)
		await withTransaction((conn) => seatLockRepository.deleteUserLocks(userId, showtimeId, conn))
		await waitlistService.processWaitlist(showtimeId)
	},

	async getLocked(showtimeId) {
		const rows = await seatLockRepository.activeLocksForShowtime(showtimeId)
		return rows.map((r) => ({ seatNumber: r.seatNumber, userId: String(r.userId), expiresAt: r.expiresAt }))
	},

	async verify({ userId, showtimeId, seats }) {
		if (!showtimeId || !Array.isArray(seats) || seats.length === 0) throw new AppError('showtimeId and seats are required', 400)
		const active = await seatLockRepository.activeUserLockLabels(userId, showtimeId)
		const set = new Set(active)
		const invalid = seats.filter((s) => !set.has(s))
		if (invalid.length) {
			throw new AppError(`Lock expired or not found for seat(s): ${invalid.join(', ')}. Please re-select your seats.`, 400, { expiredSeats: invalid })
		}
		return { expiresAt: new Date(Date.now() + LOCK_MS) }
	},

	async validate({ userId, showtimeId, seats }) {
		if (!showtimeId || !Array.isArray(seats) || seats.length === 0) throw new AppError('showtimeId and seats array are required', 400)
		const st = await showtimeRepository.findByIdWithPlan(showtimeId)
		if (!st) throw new AppError('Showtime not found', 404)
		const booked = new Set(await availabilityRepository.bookedLabels(showtimeId))
		const otherLocked = new Set(await seatLockRepository.otherActiveLockLabels(userId, showtimeId))
		const unavailable = seats.filter((s) => booked.has(s) || otherLocked.has(s))
		const available = seats.filter((s) => !booked.has(s) && !otherLocked.has(s))
		return { availableSeats: available.length, unavailableSeats: unavailable, availableSeatLabels: available }
	},

	async cleanup() {
		return waitlistService.cleanupExpiredLocksAndProcessWaitlists()
	}
}
module.exports = seatLockService
