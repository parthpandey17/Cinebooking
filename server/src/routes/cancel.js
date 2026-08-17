'use strict'
const express = require('express')
const router = express.Router()
const { protect, authorize } = require('../middleware/auth')
const { previewCancellation, cancelTicket, getRefunds } = require('../controllers/cancelController')

router.get('/preview/:ticketId', protect, previewCancellation)
router.post('/ticket/:ticketId', protect, cancelTicket)
router.get('/admin/refunds', protect, authorize('admin'), getRefunds)

module.exports = router
