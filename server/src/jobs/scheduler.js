'use strict'
const cron = require('node-cron')
const logger = require('../utils/logger')
const { healthCheck } = require('../db/pool')
const waitlistService = require('../services/waitlistService')
const { sendDueReminders } = require('../services/reminderService')

let running = false

// Guarded runner: never overlap, and skip if the DB isn't reachable yet.
async function guarded(label, fn) {
	if (running) return
	running = true
	try {
		if (!(await healthCheck().catch(() => false))) return
		await fn()
	} catch (err) {
		logger.error(`[scheduler] ${label} failed: ${err.message}`)
	} finally {
		running = false
	}
}

function startSchedulers() {
	// Every minute: expire seat locks → notify waitlist; expire stale offers.
	cron.schedule('* * * * *', () => guarded('locks+offers', async () => {
		await waitlistService.cleanupExpiredLocksAndProcessWaitlists()
		await waitlistService.expireOffers()
	}))
	// Every 15 minutes: send showtime reminders.
	cron.schedule('*/15 * * * *', () => guarded('reminders', async () => {
		const n = await sendDueReminders()
		if (n) logger.info(`[scheduler] sent ${n} reminder(s)`)
	}))
	logger.info('Schedulers started (locks/offers every 1m, reminders every 15m)')
}
module.exports = { startSchedulers }
