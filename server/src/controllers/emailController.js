'use strict'
const emailLogService = require('../services/emailLogService')
const { sendDueReminders } = require('../services/reminderService')
const asyncHandler = require('../utils/asyncHandler')

exports.getEmailLogs = asyncHandler(async (req, res) => {
	const data = await emailLogService.listRecent()
	res.status(200).json({ success: true, count: data.length, data })
})
exports.runReminders = asyncHandler(async (req, res) => {
	const processed = await sendDueReminders()
	res.status(200).json({ success: true, processed })
})
