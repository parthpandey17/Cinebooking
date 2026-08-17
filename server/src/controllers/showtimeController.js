'use strict'
const showtimeService = require('../services/showtimeService')
const asyncHandler = require('../utils/asyncHandler')

exports.getShowtimes = asyncHandler(async (req, res) => {
	const data = await showtimeService.list()
	res.status(200).json({ success: true, count: data.length, data })
})
exports.getUnreleasedShowtimes = asyncHandler(async (req, res) => {
	const data = await showtimeService.listUnreleased()
	res.status(200).json({ success: true, count: data.length, data })
})
exports.getShowtime = asyncHandler(async (req, res) => {
	res.status(200).json({ success: true, data: await showtimeService.getById(req.params.id) })
})
exports.getShowtimeWithUser = asyncHandler(async (req, res) => {
	res.status(200).json({ success: true, data: await showtimeService.getWithUser(req.params.id) })
})
exports.getShowtimeAvailability = asyncHandler(async (req, res) => {
	res.status(200).json({ success: true, data: await showtimeService.availability(req.params.id) })
})
exports.addShowtime = asyncHandler(async (req, res) => {
	const showtimes = await showtimeService.add(req.body)
	res.status(200).json({ success: true, showtimes })
})
exports.updateShowtime = asyncHandler(async (req, res) => {
	res.status(200).json({ success: true, data: await showtimeService.update(req.params.id, req.body) })
})
exports.deleteShowtime = asyncHandler(async (req, res) => {
	await showtimeService.remove(req.params.id)
	res.status(200).json({ success: true })
})
exports.deleteShowtimes = asyncHandler(async (req, res) => {
	const count = await showtimeService.removeMany(req.body.ids)
	res.status(200).json({ success: true, count })
})
exports.deletePreviousShowtime = asyncHandler(async (req, res) => {
	const count = await showtimeService.removePrevious()
	res.status(200).json({ success: true, count })
})
