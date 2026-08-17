'use strict'
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const config = require('../config')
const userRepository = require('../repositories/userRepository')
const { AppError } = require('../utils/AppError')
const { withId } = require('../utils/mapId')

const publicUser = (row) => (row ? { id: row.id, username: row.username, email: row.email, role: row.role } : null)

function signToken(userId) {
	return jwt.sign({ id: String(userId) }, config.jwt.secret, { expiresIn: config.jwt.expire })
}

const authService = {
	signToken,

	async register({ username, email, password }) {
		if (!username || !email || !password) throw new AppError('Please provide username, email and password', 400)
		if (String(password).length < 6) throw new AppError('Password must be at least 6 characters', 400)

		const existing = await userRepository.findByEmailOrUsername(email, username)
		if (existing) {
			if (existing.email === email) throw new AppError('User with this email already exists', 400)
			throw new AppError('Username already taken', 400)
		}
		const passwordHash = await bcrypt.hash(password, 10)
		const user = await userRepository.create({ username, email, passwordHash })
		return { token: signToken(user.id), user: publicUser(user) }
	},

	async authenticate({ username, password }, requiredRole) {
		if (!username || !password) throw new AppError('Please provide a username and password', 400)
		const row = await userRepository.findByUsername(username, { withPassword: true })
		if (!row) throw new AppError('Invalid credentials', 401)
		const match = await bcrypt.compare(password, row.password)
		if (!match) throw new AppError('Invalid credentials', 401)
		if (row.role !== requiredRole) {
			throw new AppError(
				requiredRole === 'admin'
					? 'This login is restricted to administrators'
					: 'Administrators must use the admin login page',
				403
			)
		}
		return { token: signToken(row.id), user: publicUser(row) }
	},

	async getById(id) {
		const row = await userRepository.findById(id)
		if (!row) throw new AppError('User not found', 404)
		return withId(row)
	},

	async listUsers() {
		const rows = await userRepository.findAll()
		return rows.map((r) => ({ _id: String(r.id), username: r.username, email: r.email, role: r.role, ticketCount: Number(r.ticketCount), createdAt: r.createdAt }))
	},

	async deleteUser(actingUserId, targetId) {
		if (String(actingUserId) === String(targetId)) throw new AppError('You cannot delete your own admin account', 400)
		const target = await userRepository.findById(targetId)
		if (!target) throw new AppError(`User not found with id of ${targetId}`, 404)
		if (target.role === 'admin' && (await userRepository.countAdmins()) <= 1) {
			throw new AppError('The last admin account cannot be deleted', 400)
		}
		if (await userRepository.hasBookingHistory(targetId)) {
			throw new AppError('Users with booking or payment history cannot be deleted', 409)
		}
		await userRepository.remove(targetId)
	},


	async getUserTickets(userId) {
		return userRepository.listUserTicketsGrouped(userId)
	},

	async updateUserRole(actingUserId, targetId, role) {
		if (!['user', 'admin'].includes(role)) throw new AppError('Role must be user or admin', 400)
		if (String(actingUserId) === String(targetId)) throw new AppError('You cannot change your own admin role', 400)
		const target = await userRepository.findById(targetId)
		if (!target) throw new AppError(`User not found with id of ${targetId}`, 404)
		if (target.role === 'admin' && role === 'user' && (await userRepository.countAdmins()) <= 1) {
			throw new AppError('The last admin account cannot be demoted', 400)
		}
		const updated = await userRepository.updateRole(targetId, role)
		return withId(updated)
	}
}

module.exports = authService
