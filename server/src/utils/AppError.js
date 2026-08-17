'use strict'
// Typed application error carrying an HTTP status. Services throw these; the
// central error handler maps them to { success:false, message } responses.
class AppError extends Error {
	constructor(message, statusCode = 500, extra = null) {
		super(message)
		this.statusCode = statusCode
		this.isOperational = true
		if (extra) this.extra = extra
	}
}
module.exports = { AppError }
