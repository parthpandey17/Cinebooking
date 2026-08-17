'use strict'
const jwt = require('jsonwebtoken')
const config = require('../config')
const userRepository = require('../repositories/userRepository')

// Reads JWT from httpOnly cookie (preferred) or Authorization: Bearer header.
async function protect(req, res, next) {
	let token
	if (req.cookies && req.cookies.token && req.cookies.token !== 'none') token = req.cookies.token
	if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
		const candidate = req.headers.authorization.split(' ')[1]
		if (candidate && candidate !== 'null' && candidate !== 'undefined') token = candidate
	}
	if (!token) return res.status(401).json({ success: false, message: 'Not authorize to access this route' })

	try {
		const decoded = jwt.verify(token, config.jwt.secret)
		const user = await userRepository.findById(decoded.id)
		if (!user) return res.status(401).json({ success: false, message: 'User no longer exists' })
		// Keep the same shape controllers expect: req.user.id (string), role, etc.
		req.user = { id: String(user.id), _id: String(user.id), username: user.username, email: user.email, role: user.role }
		next()
	} catch (err) {
		return res.status(401).json({ success: false, message: 'Not authorize to access this route' })
	}
}

const authorize = (...roles) => (req, res, next) => {
	if (!req.user || !roles.includes(req.user.role)) {
		return res.status(403).json({ success: false, message: 'User is not authorized to access this route' })
	}
	next()
}

module.exports = { protect, authorize }
