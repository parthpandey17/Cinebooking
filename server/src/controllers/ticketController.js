'use strict'
const ticketService = require('../services/ticketService')
const asyncHandler = require('../utils/asyncHandler')

exports.getMyTickets = asyncHandler(async (req, res) => {
	const data = await ticketService.getMyTickets(req.user.id)
	res.status(200).json({ success: true, count: data.length, data })
})
exports.getTicketById = asyncHandler(async (req, res) => {
	const data = await ticketService.getById(req.params.id, req.user)
	res.status(200).json({ success: true, data })
})
exports.validateTicket = asyncHandler(async (req, res) => {
	const { status, body } = await ticketService.validate({ qrPayload: req.body.qrPayload, ticketId: req.body.ticketId, adminId: req.user.id })
	res.status(status).json(body)
})
exports.getTicketsByShowtime = asyncHandler(async (req, res) => {
	const data = await ticketService.getByShowtime(req.params.showtimeId, req.query.isUsed)
	res.status(200).json({ success: true, count: data.length, data })
})
exports.getAllTicketsAdmin = asyncHandler(async (req, res) => {
	const result = await ticketService.getAllAdmin(req.query)
	res.status(200).json({ success: true, ...result })
})
