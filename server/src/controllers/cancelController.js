'use strict'
const cancelService = require('../services/cancelService')
const asyncHandler = require('../utils/asyncHandler')

exports.previewCancellation = asyncHandler(async (req, res) => {
	res.status(200).json({ success: true, data: await cancelService.preview(req.params.ticketId, req.user) })
})
exports.cancelTicket = asyncHandler(async (req, res) => {
	const result = await cancelService.cancel(req.params.ticketId, req.user, req.body.reason || '')
	res.status(200).json({ success: true, message: result.message, data: result.data })
})
exports.getRefunds = asyncHandler(async (req, res) => {
	res.status(200).json({ success: true, ...(await cancelService.getRefunds(req.query)) })
})
