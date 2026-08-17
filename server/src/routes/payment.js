'use strict'
const express = require('express')
const router = express.Router()
const { protect } = require('../middleware/auth')
const { createOrder, verifyPayment, webhook, cancelPayment, getPaymentStatus } = require('../controllers/paymentController')

// Webhook must receive the RAW body for HMAC verification — mount express.raw here
// (before the global JSON parser sees it). Public route (verified by signature).
router.post('/webhook', express.raw({ type: '*/*' }), webhook)

router.post('/create-order', protect, createOrder)
router.post('/verify', protect, verifyPayment)
router.post('/cancel', protect, cancelPayment)
router.get('/status/:orderId', protect, getPaymentStatus)

module.exports = router
