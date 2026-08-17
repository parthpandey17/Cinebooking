'use strict'
const waitlistUserService = require('../services/waitlistUserService')
const asyncHandler = require('../utils/asyncHandler')

exports.joinWaitlist = asyncHandler(async (req, res) => {
	const result = await waitlistUserService.join({ userId: req.user.id, showtimeId: req.params.showtimeId, seatsRequested: req.body.seatsRequested || req.body.seats || 1 })
	res.status(result.code).json({ success: true, message: result.message, data: result.data })
})
exports.getMyStatus = asyncHandler(async (req, res) => {
	res.status(200).json({ success: true, data: await waitlistUserService.myStatus({ userId: req.user.id, showtimeId: req.params.showtimeId }) })
})
exports.getMyWaitlists = asyncHandler(async (req, res) => {
	const data = await waitlistUserService.myWaitlists({ userId: req.user.id })
	res.status(200).json({ success: true, count: data.length, data })
})
exports.acceptOffer = asyncHandler(async (req, res) => {
	const result = await waitlistUserService.accept({ userId: req.user.id, showtimeId: req.params.showtimeId, acceptedSeats: req.body.acceptedSeats, choice: req.body.choice })
	res.status(200).json({ success: true, message: result.message, data: result.data })
})
exports.declineOffer = asyncHandler(async (req, res) => {
	const result = await waitlistUserService.decline({ userId: req.user.id, showtimeId: req.params.showtimeId })
	res.status(200).json({ success: true, message: result.message })
})
exports.leaveWaitlist = asyncHandler(async (req, res) => {
	const result = await waitlistUserService.leave({ userId: req.user.id, showtimeId: req.params.showtimeId })
	res.status(200).json({ success: true, message: result.message })
})
exports.getAllWaitlists = asyncHandler(async (req, res) => {
	const data = await waitlistUserService.adminAll()
	res.status(200).json({ success: true, count: data.length, data })
})
exports.getWaitlistStats = asyncHandler(async (req, res) => {
	res.status(200).json({ success: true, data: await waitlistUserService.adminStats() })
})
exports.confirmOffer = exports.acceptOffer
