'use strict'
const seatLockService = require('../services/seatLockService')
const asyncHandler = require('../utils/asyncHandler')

exports.lockSeats = asyncHandler(async (req, res) => {
	const data = await seatLockService.lock({ userId: req.user.id, showtimeId: req.body.showtimeId, seats: req.body.seats })
	res.status(200).json({ success: true, message: 'Seats locked successfully', data })
})
exports.unlockSeats = asyncHandler(async (req, res) => {
	await seatLockService.unlock({ userId: req.user.id, showtimeId: req.body.showtimeId })
	res.status(200).json({ success: true, message: 'Seats unlocked successfully' })
})
exports.getLockedSeats = asyncHandler(async (req, res) => {
	res.status(200).json({ success: true, data: await seatLockService.getLocked(req.params.showtimeId) })
})
exports.verifyLocks = asyncHandler(async (req, res) => {
	const data = await seatLockService.verify({ userId: req.user.id, showtimeId: req.body.showtimeId, seats: req.body.seats })
	res.status(200).json({ success: true, message: 'All locks are valid', data })
})
exports.validateSeats = asyncHandler(async (req, res) => {
	const data = await seatLockService.validate({ userId: req.user.id, showtimeId: req.body.showtimeId, seats: req.body.seats })
	res.status(200).json({ success: true, data })
})
exports.cleanupExpiredLocks = asyncHandler(async (req, res) => {
	const result = await seatLockService.cleanup()
	res.status(200).json({ success: true, message: `Cleaned up ${result.deletedCount} expired lock(s)` })
})
