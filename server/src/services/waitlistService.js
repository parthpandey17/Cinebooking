'use strict'
const config = require('../config')
const { withTransaction } = require('../db/withTransaction')
const waitlistRepository = require('../repositories/waitlistRepository')
const seatLockRepository = require('../repositories/seatLockRepository')
const showtimeRepository = require('../repositories/showtimeRepository')
const availabilityService = require('./availabilityService')
const { emitToUser, emitToShowtime } = require('../sockets/socketService')
const { sendEmailSafely, sendWaitlistOffer } = require('./emailService')
const logger = require('../utils/logger')

const OFFER_DURATION_MS = config.waitlist.offerWindowMs

const getSeatsRemaining = (entry) => {
	if (entry.seatsRemaining != null) return Number(entry.seatsRemaining)
	return Number(entry.seatsRequested) - Number(entry.seatsAccepted || 0)
}

async function isShowtimeFull(showtimeId) {
	return (await availabilityService.metrics(showtimeId)).availableSeats === 0
}

// Release the offer holds a waitlist entry was granted.
async function releaseOfferLocks(entry, conn) {
	const labels = entry.offeredLabels || (await waitlistRepository.offeredSeatLabels(entry.id, conn))
	if (labels.length) await seatLockRepository.deleteUserLocksForSeats(entry.userId, entry.showtimeId, labels, conn)
}

// ── Core FIFO processor ───────────────────────────────────────────────────────
async function processWaitlist(showtimeId) {
	if (await waitlistRepository.findLiveOffer(showtimeId)) return null

	const st = await showtimeRepository.findFullById(showtimeId)
	if (!st) return null
	const availableCount = (await availabilityService.metrics(showtimeId)).availableSeats
	if (availableCount === 0) return null

	const offeredAt = new Date()
	const offerExpiresAt = new Date(Date.now() + OFFER_DURATION_MS)

	let outcome = null
	try {
		outcome = await withTransaction(async (conn) => {
			// Atomic FIFO claim (row-locked). Loser of a concurrent race gets null.
			const entry = await waitlistRepository.claimOldestWaitlisted(showtimeId, offeredAt, offerExpiresAt, conn)
			if (!entry) return null

			const stillNeeded = getSeatsRemaining(entry)
			const seatsToOffer = Math.min(stillNeeded, availableCount)
			const seats = await availabilityService.availableLabels(showtimeId, seatsToOffer, conn)
			if (!seats.length) { const e = new Error('no seats'); e.__revert = entry.id; throw e }

			const isPartial = seatsToOffer < stillNeeded
			const status = isPartial ? 'OFFER_PARTIAL' : 'OFFERED'

			// Hold the offered seats for this user; a unique-constraint conflict
			// (someone locked first) rolls the whole offer back.
			for (const label of seats) {
				await seatLockRepository.insertLock(entry.userId, showtimeId, label, offerExpiresAt, conn)
			}
			await waitlistRepository.setOfferSeats(entry.id, status, seats, conn)
			return { entry, seats, seatsToOffer, stillNeeded, isPartial, status }
		})
	} catch (err) {
		if (err.__revert) {
			await withTransaction((conn) => waitlistRepository.revertClaim(err.__revert, conn)).catch(() => {})
			return null
		}
		// Lock conflict or other failure: transaction already rolled back the claim.
		logger.warn(`processWaitlist rolled back for showtime ${showtimeId}: ${err.message}`)
		return null
	}
	if (!outcome) return null

	const { entry, seats, seatsToOffer, stillNeeded, isPartial, status } = outcome
	const payload = {
		waitlistId: String(entry.id),
		showtimeId: String(showtimeId),
		movieName: st.m_name || '',
		cinemaName: st.c_name || '',
		theaterNumber: st.th_number,
		offeredSeats: seats,
		seatsRequested: entry.seatsRequested,
		seatsRemaining: stillNeeded,
		seatsOffered: seatsToOffer,
		isPartial,
		offerExpiresAt,
		status
	}
	emitToUser(entry.userId, 'waitlistOfferCreated', payload)
	emitToUser(entry.userId, 'waitlist:offer', payload)
	emitToShowtime(showtimeId, 'seatmap:update', { showtimeId: String(showtimeId) })
	sendEmailSafely(
		sendWaitlistOffer({ to: entry.email, userId: entry.userId, showtimeId, movieName: st.m_name, seats, offerExpiresAt, isPartial }),
		'Waitlist offer'
	)
	return entry
}

async function processWaitlistsForShowtimes(showtimeIds) {
	const unique = [...new Set(showtimeIds.filter(Boolean).map(String))]
	const results = []
	for (const id of unique) results.push(await processWaitlist(id))
	return results
}

async function cleanupExpiredLocksAndProcessWaitlists() {
	const showtimeIds = await seatLockRepository.expiredShowtimeIds()
	const deletedCount = await seatLockRepository.deleteExpired()
	if (showtimeIds.length) await processWaitlistsForShowtimes(showtimeIds)
	return { deletedCount, processedCount: new Set(showtimeIds).size }
}

async function expireOffers() {
	const entries = await waitlistRepository.findExpiredOfferEntries()
	for (const entry of entries) {
		const labels = await waitlistRepository.offeredSeatLabels(entry.id)
		await withTransaction((conn) => releaseOfferLocks({ ...entry, offeredLabels: labels }, conn)).catch(() => {})

		if (entry.status === 'ACCEPTED' && Number(entry.seatsAccepted || 0) > 0 && getSeatsRemaining(entry) > 0) {
			await withTransaction((conn) => waitlistRepository.requeue(entry.id, conn))
			emitToUser(entry.userId, 'waitlist:requeued', { waitlistId: String(entry.id), showtimeId: String(entry.showtimeId), seatsRemaining: getSeatsRemaining(entry) })
			emitToShowtime(entry.showtimeId, 'seatmap:update', { showtimeId: String(entry.showtimeId) })
			await processWaitlist(entry.showtimeId)
			continue
		}
		await withTransaction((conn) => waitlistRepository.setExpired(entry.id, conn))
		emitToUser(entry.userId, 'waitlist:expired', { waitlistId: String(entry.id), showtimeId: String(entry.showtimeId) })
		emitToShowtime(entry.showtimeId, 'seatmap:update', { showtimeId: String(entry.showtimeId) })
		await processWaitlist(entry.showtimeId)
	}
	return entries.length
}

// SINGLE place counts mutate after a booking (BUG-3 fix preserved).
async function completeWaitlistForBooking({ userId, showtimeId, seatsJustBooked, seatLabels }) {
	const result = await withTransaction(async (conn) => {
		const entry = await waitlistRepository.findActiveEntryForUpdate(userId, showtimeId, conn)
		if (!entry) return null
		const currentRemaining = getSeatsRemaining(entry)
		const booked = seatsJustBooked || currentRemaining
		const newRemaining = Math.max(0, currentRemaining - booked)
		const totalAccepted = Number(entry.seatsAccepted || 0) + booked
		const forceClose = Number(entry.closeAfterBooking) === 1

		await waitlistRepository.addPartialBooking(entry.id, booked, seatLabels, conn)

		if (newRemaining === 0 || forceClose) {
			await waitlistRepository.applyBooking(entry.id, {
				seatsAccepted: totalAccepted, seatsRemaining: forceClose ? 0 : newRemaining,
				status: 'CONFIRMED', confirmed: true, closeAfterBooking: false
			}, conn)
			return { requeue: false, event: { name: 'waitlist:confirmed', payload: { waitlistId: String(entry.id), showtimeId: String(showtimeId), fullyBooked: newRemaining === 0, forfeited: forceClose && newRemaining > 0 } } }
		}
		await waitlistRepository.applyBooking(entry.id, {
			seatsAccepted: totalAccepted, seatsRemaining: newRemaining,
			status: 'WAITLISTED', confirmed: false, closeAfterBooking: false
		}, conn)
		return { requeue: true, event: { name: 'waitlist:requeued', payload: { waitlistId: String(entry.id), showtimeId: String(showtimeId), seatsBooked: booked, seatsRemaining: newRemaining } } }
	})
	if (!result) return
	emitToUser(userId, result.event.name, result.event.payload)
	if (result.requeue) await processWaitlist(showtimeId)
}

module.exports = {
	OFFER_DURATION_MS, getSeatsRemaining, isShowtimeFull, releaseOfferLocks,
	processWaitlist, processWaitlistsForShowtimes, cleanupExpiredLocksAndProcessWaitlists,
	expireOffers, completeWaitlistForBooking
}
