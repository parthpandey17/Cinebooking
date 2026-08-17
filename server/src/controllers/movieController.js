'use strict'
const movieService = require('../services/movieService')
const asyncHandler = require('../utils/asyncHandler')

exports.getMovies = asyncHandler(async (req, res) => {
	const data = await movieService.list()
	res.status(200).json({ success: true, count: data.length, data })
})
exports.getShowingMovies = asyncHandler(async (req, res) => {
	res.status(200).json({ success: true, data: await movieService.showing() })
})
exports.getUnreleasedShowingMovies = asyncHandler(async (req, res) => {
	res.status(200).json({ success: true, data: await movieService.showingUnreleased() })
})
exports.getMovie = asyncHandler(async (req, res) => {
	res.status(200).json({ success: true, data: await movieService.getById(req.params.id) })
})
exports.createMovie = asyncHandler(async (req, res) => {
	res.status(201).json({ success: true, data: await movieService.create(req.body) })
})
exports.updateMovie = asyncHandler(async (req, res) => {
	res.status(200).json({ success: true, data: await movieService.update(req.params.id, req.body) })
})
exports.deleteMovie = asyncHandler(async (req, res) => {
	await movieService.remove(req.params.id)
	res.status(200).json({ success: true })
})
