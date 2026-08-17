'use strict'
const express = require('express')
const router = express.Router()
const { protect, authorize } = require('../middleware/auth')
const email = require('../controllers/emailController')

router.use(protect, authorize('admin'))
router.get('/logs', email.getEmailLogs)
router.post('/reminders/run', email.runReminders)

module.exports = router
