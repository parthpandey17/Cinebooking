'use strict'
const cinemaService = require('../services/cinemaService')
const asyncHandler = require('../utils/asyncHandler')

exports.getCinemas = asyncHandler(async (req, res) => {
	const data = await cinemaService.list()
	res.status(200).json({ success: true, count: data.length, data })
})
exports.getUnreleasedCinemas = asyncHandler(async (req, res) => {
	const data = await cinemaService.listUnreleased()
	res.status(200).json({ success: true, count: data.length, data })
})
exports.getCinema = asyncHandler(async (req, res) => {
	res.status(200).json({ success: true, data: await cinemaService.getById(req.params.id) })
})
exports.createCinema = asyncHandler(async (req, res) => {
	res.status(201).json({ success: true, data: await cinemaService.create(req.body) })
})
exports.updateCinema = asyncHandler(async (req, res) => {
	res.status(200).json({ success: true, data: await cinemaService.update(req.params.id, req.body) })
})
exports.deleteCinema = asyncHandler(async (req, res) => {
	await cinemaService.remove(req.params.id)
	res.status(200).json({ success: true })
})
