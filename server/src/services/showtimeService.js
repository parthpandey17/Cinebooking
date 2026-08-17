'use strict'
const showtimeRepository = require('../repositories/showtimeRepository')
const availabilityRepository = require('../repositories/availabilityRepository')
const movieRepository = require('../repositories/movieRepository')
const theaterRepository = require('../repositories/theaterRepository')
const availabilityService = require('./availabilityService')
const { AppError } = require('../utils/AppError')

// Map a JOINED showtime row -> nested response object (movie + theater + cinema).
function baseShape(row) {
	return {
		_id: String(row.id),
		showtime: row.showtime,
		isRelease: !!row.isRelease,
		movie: { _id: String(row.m_id), name: row.m_name, length: row.m_length, img: row.m_img },
		theater: {
			_id: String(row.th_id),
			number: row.th_number,
			seatPlan: { row: row.sp_row, column: row.sp_col },
			cinema: { _id: String(row.c_id), name: row.c_name }
		},
		seatPlan: { row: row.sp_row, column: row.sp_col } // used by availabilityService
	}
}

async function shapeList(rows) {
	const shaped = rows.map(baseShape)
	const ids = shaped.map((s) => s._id)
	const bookedMap = await availabilityRepository.bookedSeatsByShowtime(ids)
	for (const s of shaped) s.seats = bookedMap[s._id] || []
	await availabilityService.attachAvailability(shaped)
	// seatPlan was a helper for availability; the real seatPlan lives on theater
	for (const s of shaped) delete s.seatPlan
	return shaped
}

const showtimeService = {
	async list() { return shapeList(await showtimeRepository.findAll({ releasedOnly: true })) },
	async listUnreleased() { return shapeList(await showtimeRepository.findAll({ releasedOnly: false })) },

	async getById(id) {
		const row = await showtimeRepository.findFullById(id)
		if (!row) throw new AppError(`Showtime not found with id of ${id}`, 400)
		if (!row.isRelease) throw new AppError('Showtime is not released', 400)
		const [shaped] = await shapeList([row])
		return shaped
	},

	async getWithUser(id) {
		const row = await showtimeRepository.findFullById(id)
		if (!row) throw new AppError(`Showtime not found with id of ${id}`, 400)
		const [shaped] = await shapeList([row])
		const seatRows = await showtimeRepository.bookedSeatsWithUsers(id)
		shaped.seats = seatRows.map((r) => ({
			row: r.row, number: r.number,
			user: r.uid ? { _id: String(r.uid), username: r.username, email: r.email, role: r.role } : null
		}))
		return shaped
	},

	async availability(id) { return availabilityService.metrics(id) },

	async add({ movie, showtime, theater, repeat = 1, isRelease }) {
		const rep = Number(repeat)
		if (!(rep >= 1 && rep <= 31)) throw new AppError('Repeat is not a valid number between 1 to 31', 400)
		const th = await theaterRepository.findById(theater)
		if (!th) throw new AppError(`Theater not found with id of ${theater}`, 400)
		const mv = await movieRepository.findById(movie)
		if (!mv) throw new AppError(`Movie not found with id of ${movie}`, 400)

		const start = new Date(showtime)
		const created = []
		for (let i = 0; i < rep; i++) {
			const when = new Date(start)
			await showtimeRepository.create({ theaterId: th.id, movieId: mv.id, showtime: when, isRelease })
			created.push(new Date(when))
			start.setDate(start.getDate() + 1)
		}
		return created
	},

	async update(id, fields) {
		const existing = await showtimeRepository.findFullById(id)
		if (!existing) throw new AppError(`Showtime not found with id of ${id}`, 400)
		const row = await showtimeRepository.update(id, fields)
		return baseShapePublic(row)
	},

	async remove(id) {
		const ok = await showtimeRepository.softDelete(id)
		if (!ok) throw new AppError(`Showtime not found with id of ${id}`, 400)
	},
	async removeMany(ids) { return showtimeRepository.softDeleteMany(ids) },
	async removePrevious() { return showtimeRepository.softDeletePrevious() }
}

// Update returns a flat showtime (no availability), matching the old findByIdAndUpdate doc.
function baseShapePublic(row) {
	return {
		_id: String(row.id),
		showtime: row.showtime,
		isRelease: !!row.isRelease,
		movie: String(row.m_id),
		theater: String(row.th_id)
	}
}

module.exports = showtimeService
