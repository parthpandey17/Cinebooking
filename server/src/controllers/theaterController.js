'use strict'
const theaterService = require('../services/theaterService')
const asyncHandler = require('../utils/asyncHandler')

exports.getTheaters = asyncHandler(async (req, res) => {
	const data = await theaterService.list()
	res.status(200).json({ success: true, count: data.length, data })
})
exports.getTheater = asyncHandler(async (req, res) => {
	res.status(200).json({ success: true, data: await theaterService.getById(req.params.id) })
})
exports.getTheaterByMovie = asyncHandler(async (req, res) => {
	const { mid, date, timezone } = req.params
	res.status(200).json({ success: true, data: await theaterService.byMovieAndDate(mid, date, timezone, true) })
})
exports.getUnreleasedTheaterByMovie = asyncHandler(async (req, res) => {
	const { mid, date, timezone } = req.params
	res.status(200).json({ success: true, data: await theaterService.byMovieAndDate(mid, date, timezone, false) })
})
exports.getUnreleasedTheater = asyncHandler(async (req, res) => {
	res.status(200).json({ success: true, data: await theaterService.getById(req.params.id) })
})
exports.createTheater = asyncHandler(async (req, res) => {
	res.status(201).json({ success: true, data: await theaterService.create(req.body) })
})
exports.updateTheater = asyncHandler(async (req, res) => {
	res.status(200).json({ success: true, data: await theaterService.update(req.params.id, req.body) })
})
exports.deleteTheater = asyncHandler(async (req, res) => {
	await theaterService.remove(req.params.id)
	res.status(200).json({ success: true })
})
