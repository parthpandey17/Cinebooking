'use strict'
const cinemaRepository = require('../repositories/cinemaRepository')
const { AppError } = require('../utils/AppError')
const { withId } = require('../utils/mapId')

// Assembles the nested cinemas → theaters → showtimes(+movie) shape the frontend
// expects. `releasedOnly` hides unreleased showtimes from customers.
async function assembleNested(cinemas, releasedOnly) {
	if (!cinemas.length) return []
	const theaters = await cinemaRepository.theatersByCinemaIds(cinemas.map((c) => c.id))
	const showtimes = await cinemaRepository.showtimesByTheaterIds(theaters.map((t) => t.id), { releasedOnly })

	const stByTheater = {}
	for (const s of showtimes) {
		(stByTheater[String(s.theaterId)] ||= []).push({
			_id: String(s.id),
			movie: { _id: String(s.movieId), name: s.movieName, length: s.movieLength },
			showtime: s.showtime,
			isRelease: !!s.isRelease
		})
	}
	const thByCinema = {}
	for (const t of theaters) {
		(thByCinema[String(t.cinemaId)] ||= []).push({
			_id: String(t.id),
			number: t.number,
			seatPlan: { row: t.spRow, column: t.spCol },
			showtimes: stByTheater[String(t.id)] || []
		})
	}
	return cinemas.map((c) => ({ _id: String(c.id), name: c.name, theaters: thByCinema[String(c.id)] || [] }))
}

const cinemaService = {
	async list() { return assembleNested(await cinemaRepository.findActive(), true) },
	async listUnreleased() { return assembleNested(await cinemaRepository.findActive(), false) },
	async getById(id) {
		const c = await cinemaRepository.findById(id)
		if (!c) throw new AppError(`Cinema not found with id of ${id}`, 400)
		const [nested] = await assembleNested([c], true)
		return nested
	},
	async create({ name }) {
		if (!name) throw new AppError('Please add a name', 400)
		return withId(await cinemaRepository.create({ name }))
	},
	async update(id, fields) {
		const c = await cinemaRepository.findById(id)
		if (!c) throw new AppError(`Cinema not found with id of ${id}`, 400)
		return withId(await cinemaRepository.update(id, fields))
	},
	async remove(id) {
		const ok = await cinemaRepository.softDelete(id)
		if (!ok) throw new AppError(`Cinema not found with id of ${id}`, 400)
	}
}
module.exports = cinemaService
