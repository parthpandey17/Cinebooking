'use strict'
const movieRepository = require('../repositories/movieRepository')
const { AppError } = require('../utils/AppError')
const { withId, withIds } = require('../utils/mapId')

const movieService = {
	async list() { return withIds(await movieRepository.findAllActive()) },

	async getById(id) {
		const m = await movieRepository.findById(id)
		if (!m) throw new AppError(`Movie not found with id of ${id}`, 400)
		return withId(m)
	},

	async create({ name, length, img }) {
		if (!name || length == null || !img) throw new AppError('Please provide name, length and img', 400)
		return withId(await movieRepository.create({ name, length, img }))
	},

	async update(id, fields) {
		const existing = await movieRepository.findById(id)
		if (!existing) throw new AppError(`Movie not found with id of ${id}`, 400)
		return withId(await movieRepository.update(id, fields))
	},

	async remove(id) {
		const ok = await movieRepository.softDelete(id)
		if (!ok) throw new AppError(`Movie not found with id of ${id}`, 400)
	},

	async showing() {
		const rows = await movieRepository.showingMovies({ released: true })
		return rows.map((r) => ({ _id: String(r.id), name: r.name, length: r.length, img: r.img, count: Number(r.count) }))
	},
	async showingUnreleased() {
		const rows = await movieRepository.showingMovies({ released: false })
		return rows.map((r) => ({ _id: String(r.id), name: r.name, length: r.length, img: r.img, count: Number(r.count) }))
	}
}
module.exports = movieService
