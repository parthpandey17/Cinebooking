'use strict'
const config = require('../config')
const authService = require('../services/authService')
const asyncHandler = require('../utils/asyncHandler')

function sendToken(res, statusCode, token, user) {
	const options = {
		expires: new Date(Date.now() + config.jwt.cookieExpireDays * 24 * 60 * 60 * 1000),
		httpOnly: true
	}
	if (config.env === 'production') { options.secure = true; options.sameSite = 'none' }
	res.status(statusCode).cookie('token', token, options).json({
		success: true,
		token,
		user: { id: String(user.id), username: user.username, email: user.email, role: user.role }
	})
}

exports.register = asyncHandler(async (req, res) => {
	const { token, user } = await authService.register(req.body)
	sendToken(res, 201, token, user)
})

exports.login = asyncHandler(async (req, res) => {
	const { token, user } = await authService.authenticate(req.body, 'user')
	sendToken(res, 200, token, user)
})

exports.adminLogin = asyncHandler(async (req, res) => {
	const { token, user } = await authService.authenticate(req.body, 'admin')
	sendToken(res, 200, token, user)
})

exports.getMe = asyncHandler(async (req, res) => {
	const user = await authService.getById(req.user.id)
	res.status(200).json({ success: true, data: user })
})

exports.getTickets = asyncHandler(async (req, res) => {
	// Preserves the old GET /auth/tickets shape: { data: { _id, tickets:[...] } }
	const tickets = await authService.getUserTickets(req.user.id)
	res.status(200).json({ success: true, data: { _id: String(req.user.id), tickets } })
})

exports.logout = asyncHandler(async (req, res) => {
	res.cookie('token', 'none', { expires: new Date(Date.now() + 10 * 1000), httpOnly: true })
	res.status(200).json({ success: true, message: 'User logged out successfully' })
})

exports.getAll = asyncHandler(async (req, res) => {
	const users = await authService.listUsers()
	res.status(200).json({ success: true, count: users.length, data: users })
})

exports.deleteUser = asyncHandler(async (req, res) => {
	await authService.deleteUser(req.user.id, req.params.id)
	res.status(200).json({ success: true, message: 'User deleted successfully' })
})

exports.updateUser = asyncHandler(async (req, res) => {
	const user = await authService.updateUserRole(req.user.id, req.params.id, req.body.role)
	res.status(200).json({ success: true, data: user })
})
