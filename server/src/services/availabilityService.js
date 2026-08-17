'use strict'
const availabilityRepository = require('../repositories/availabilityRepository')
const showtimeRepository = require('../repositories/showtimeRepository')
const { totalSeats, enumerateSeats } = require('../utils/seats')
const { AppError } = require('../utils/AppError')

// Attaches totalSeats/bookedSeats/lockedSeats/availableSeats to each showtime obj.
// Each item must carry `_id` and a `seatPlan` ({ row, column }).
async function attachAvailability(showtimes) {
	const list = Array.isArray(showtimes) ? showtimes : [showtimes]
	const ids = list.filter(Boolean).map((s) => s._id)
	if (!ids.length) return showtimes
	const bookedMap = await availabilityRepository.bookedLabelsByShowtime(ids)
	const lockedMap = await availabilityRepository.lockedLabelsByShowtime(ids)
	for (const s of list) {
		if (!s) continue
		const booked = new Set(bookedMap[String(s._id)] || [])
		const locked = new Set(lockedMap[String(s._id)] || [])
		const total = totalSeats(s.seatPlan?.row, s.seatPlan?.column)
		const unavailable = new Set([...booked, ...locked])
		s.totalSeats = total
		s.bookedSeats = booked.size
		s.lockedSeats = locked.size
		s.availableSeats = Math.max(0, total - unavailable.size)
	}
	return showtimes
}

// Live metrics for GET /showtime/:id/availability
async function metrics(showtimeId) {
	const st = await showtimeRepository.findByIdWithPlan(showtimeId)
	if (!st) throw new AppError('Showtime not found', 400)
	const booked = new Set(await availabilityRepository.bookedLabels(showtimeId))
	const locked = new Set(await availabilityRepository.lockedLabels(showtimeId))
	const total = totalSeats(st.seatPlanRow, st.seatPlanColumn)
	const unavailable = new Set([...booked, ...locked])
	return {
		totalSeats: total,
		bookedSeats: booked.size,
		lockedSeats: locked.size,
		availableSeats: Math.max(0, total - unavailable.size)
	}
}

// Ordered list of available seat labels (for waitlist offers), up to `count`.
async function availableLabels(showtimeId, count = Infinity, conn) {
	const st = await showtimeRepository.findByIdWithPlan(showtimeId, conn)
	if (!st) throw new AppError('Showtime not found', 400)
	const booked = new Set(await availabilityRepository.bookedLabels(showtimeId, conn))
	const locked = new Set(await availabilityRepository.lockedLabels(showtimeId, conn))
	const all = enumerateSeats(st.seatPlanRow, st.seatPlanColumn)
	const out = []
	for (const label of all) {
		if (out.length >= count) break
		if (!booked.has(label) && !locked.has(label)) out.push(label)
	}
	return out
}

module.exports = { attachAvailability, metrics, availableLabels }
