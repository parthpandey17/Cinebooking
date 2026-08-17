'use strict'
const logger = require('../utils/logger')
const config = require('../config')

// Maps known MySQL / app errors to safe JSON. No SQL detail leaks to clients.
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
	let status = err.statusCode || 500
	let message = err.message || 'Internal server error'

	// MySQL duplicate key -> 400 with a friendly message
	if (err && err.code === 'ER_DUP_ENTRY') {
		status = 400
		message = 'A record with these details already exists'
	} else if (err && (err.code === 'ER_ROW_IS_REFERENCED_2' || err.code === 'ER_ROW_IS_REFERENCED')) {
		status = 409
		message = 'This item is referenced by existing records and cannot be modified'
	} else if (err && err.code === 'ER_NO_REFERENCED_ROW_2') {
		status = 400
		message = 'Referenced record does not exist'
	}

	if (status >= 500) logger.error('Unhandled error', { msg: err.message, code: err.code, stack: config.env === 'production' ? undefined : err.stack })

	if (err && err.message === 'Not allowed by CORS') {
		return res.status(403).json({ success: false, message: 'CORS error', origin: req.get('Origin') })
	}
	res.status(status).json({
		success: false,
		message: status >= 500 && config.env === 'production' ? 'Internal server error' : message,
		...(err && err.extra && typeof err.extra === 'object' ? err.extra : {})
	})
}

function notFound(req, res) {
	res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` })
}

module.exports = { errorHandler, notFound }
