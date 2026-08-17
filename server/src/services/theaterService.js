'use strict'
const theaterRepository = require('../repositories/theaterRepository')
const cinemaRepository = require('../repositories/cinemaRepository')
const availabilityService = require('./availabilityService')
const { AppError } = require('../utils/AppError')
const { totalSeats, isSeatWithinPlan } = require('../utils/seats')

const ROW_REGEX = /^([A-D][A-Z]|[A-Z])$/
function normalizeSeatPlan({ row, column }) {
	const r = String(row || '').trim().toUpperCase()
	const c = Number(column)
	if (!ROW_REGEX.test(r)) throw new AppError('Row is not a valid letter between A and DZ', 400)
	if (!Number.isInteger(c) || c < 1 || c > 120) throw new AppError('Column is not a valid number between 1 and 120', 400)
	return { row: r, column: c }
}

// Build the theater response shape (with seatPlan + cinema + showtimes+availability).
async function assemble(theaters, releasedOnly) {
	if (!theaters.length) return []
	const st = await theaterRepository.showtimesByTheaterIds(theaters.map((t) => t.id), { releasedOnly })
	// group + attach availability (needs seatPlan per showtime)
	const byTheater = {}
	const flat = []
	for (const s of st) {
		const item = {
			_id: String(s.id),
			movie: String(s.movieId),          // theater lists reference movie by id
			movieName: s.movieName,
			showtime: s.showtime,
			isRelease: !!s.isRelease
		}
		;(byTheater[String(s.theaterId)] ||= []).push({ item, theaterId: String(s.theaterId) })
		flat.push({ _id: String(s.id), seatPlan: null, ref: item, theaterId: String(s.theaterId) })
	}
	const planByTheater = {}
	for (const t of theaters) planByTheater[String(t.id)] = { row: t.spRow, column: t.spCol }
	for (const f of flat) f.seatPlan = planByTheater[f.theaterId]
	await availabilityService.attachAvailability(flat)
	for (const f of flat) {
		f.ref.totalSeats = f.totalSeats
		f.ref.bookedSeats = f.bookedSeats
		f.ref.lockedSeats = f.lockedSeats
		f.ref.availableSeats = f.availableSeats
	}
	return theaters.map((t) => ({
		_id: String(t.id),
		number: t.number,
		seatPlan: { row: t.spRow, column: t.spCol },
		cinema: { _id: String(t.cinemaId), name: t.cinemaName },
		showtimes: (byTheater[String(t.id)] || []).map((x) => x.item)
	}))
}

function sameLocalDate(showtimeIso, dateStr, tzMinutes) {
	const d1 = new Date(showtimeIso); const d2 = new Date(dateStr)
	d1.setTime(d1.getTime() - tzMinutes * 60 * 1000)
	d2.setTime(d2.getTime() - tzMinutes * 60 * 1000)
	return d1.getUTCFullYear() === d2.getUTCFullYear() && d1.getUTCMonth() === d2.getUTCMonth() && d1.getUTCDate() === d2.getUTCDate()
}

const theaterService = {
	async list() { return assemble(await theaterRepository.findActive(), true) },

	async getById(id) {
		const t = await theaterRepository.findById(id)
		if (!t) throw new AppError(`Theater not found with id of ${id}`, 400)
		const [full] = await assemble([t], true)
		return full
	},

	async byMovieAndDate(movieId, dateStr, tz, releasedOnly) {
		const theaters = await assemble(await theaterRepository.findActive(), releasedOnly)
		const tzMinutes = Number(tz)
		return theaters.filter((t) => t.showtimes.some((s) =>
			String(s.movie) === String(movieId) && sameLocalDate(s.showtime, dateStr, tzMinutes)))
	},

	async create(body) {
		const plan = normalizeSeatPlan(body)
		const cinema = await cinemaRepository.findById(body.cinema)
		if (!cinema) throw new AppError(`Cinema not found with id of ${body.cinema}`, 400)
		const count = await theaterRepository.countByCinema(cinema.id)
		const t = await theaterRepository.create({ cinemaId: cinema.id, number: count + 1, spRow: plan.row, spCol: plan.column })
		return { _id: String(t.id), number: t.number, seatPlan: { row: t.spRow, column: t.spCol }, cinema: String(cinema.id) }
	},

	async update(id, body) {
		const plan = normalizeSeatPlan(body)
		const t = await theaterRepository.findById(id)
		if (!t) throw new AppError(`Theater not found with id of ${id}`, 404)
		const occupied = await theaterRepository.occupiedLabelsForTheater(id)
		const invalid = occupied.filter((label) => !isSeatWithinPlan(label, plan.row, plan.column))
		if (invalid.length) {
			throw new AppError('Cannot shrink this seat plan because booked or reserved seats would fall outside the new layout', 409)
		}
		const updated = await theaterRepository.updateSeatPlan(id, plan.row, plan.column)
		return { _id: String(updated.id), number: updated.number, seatPlan: { row: updated.spRow, column: updated.spCol }, cinema: { _id: String(updated.cinemaId), name: updated.cinemaName } }
	},

	async remove(id) {
		const ok = await theaterRepository.softDelete(id)
		if (!ok) throw new AppError(`Theater not found with id of ${id}`, 400)
	}
}
module.exports = theaterService
