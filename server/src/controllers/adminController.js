'use strict'
const adminService = require('../services/adminService')
const asyncHandler = require('../utils/asyncHandler')

exports.getStats = asyncHandler(async (req, res) => {
	res.status(200).json({ success: true, data: await adminService.getStats() })
})
exports.getPayments = asyncHandler(async (req, res) => {
	res.status(200).json({ success: true, ...(await adminService.getPayments(req.query)) })
})
exports.getActiveLocks = asyncHandler(async (req, res) => {
	const data = await adminService.getActiveLocks()
	res.status(200).json({ success: true, count: data.length, data })
})
exports.cleanupExpiredLocks = asyncHandler(async (req, res) => {
	const result = await adminService.cleanupLocks()
	res.status(200).json({ success: true, message: `Cleaned up ${result.deletedCount} expired lock(s)` })
})
exports.forceReleaseLock = asyncHandler(async (req, res) => {
	await adminService.forceReleaseLock(req.params.id)
	res.status(200).json({ success: true, message: 'Lock released' })
})
exports.getAdminShowtimes = asyncHandler(async (req, res) => {
	const data = await adminService.getAdminShowtimes()
	res.status(200).json({ success: true, count: data.length, data })
})
