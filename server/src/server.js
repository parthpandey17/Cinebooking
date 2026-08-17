'use strict'
const http = require('http')
const { Server } = require('socket.io')
const app = require('./app')
const config = require('./config')
const logger = require('./utils/logger')
const { pool, healthCheck, close } = require('./db/pool')
const { initSocket } = require('./sockets/socketService')
const { startSchedulers } = require('./jobs/scheduler')

async function start() {
	// Verify DB connectivity before accepting traffic.
	const ok = await healthCheck().catch((e) => { logger.error(`DB health check failed: ${e.message}`); return false })
	if (!ok) { logger.error('Could not connect to MySQL — check DB_* env vars. Exiting.'); process.exit(1) }
	logger.info('Connected to MySQL')

	const server = http.createServer(app)
	const io = new Server(server, {
		cors: { origin: config.frontendUrls, credentials: true }
	})
	initSocket(io)
	io.on('connection', (socket) => {
		socket.on('join:user', (userId) => { if (userId) socket.join(`user:${String(userId)}`) })
		socket.on('join:showtime', (showtimeId) => { if (showtimeId) socket.join(`showtime:${String(showtimeId)}`) })
		socket.on('leave:showtime', (showtimeId) => { if (showtimeId) socket.leave(`showtime:${String(showtimeId)}`) })
	})

	server.listen(config.port, () => {
		logger.info(`CineBooker API listening on :${config.port} (${config.env})`)
		startSchedulers()
	})

	const shutdown = async (sig) => {
		logger.info(`${sig} received — shutting down gracefully`)
		server.close(async () => {
			try { await close() } catch (_) {}
			process.exit(0)
		})
		setTimeout(() => process.exit(1), 10000).unref()
	}
	process.on('SIGTERM', () => shutdown('SIGTERM'))
	process.on('SIGINT', () => shutdown('SIGINT'))
}

start()

module.exports = { start }
