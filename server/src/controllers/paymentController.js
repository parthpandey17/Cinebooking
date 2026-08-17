'use strict'
const paymentService = require('../services/paymentService')
const asyncHandler = require('../utils/asyncHandler')

exports.createOrder = asyncHandler(async (req, res) => {
	const data = await paymentService.createOrder({ user: req.user, showtimeId: req.body.showtimeId, seats: req.body.seats })
	res.status(201).json({ success: true, data })
})

exports.verifyPayment = asyncHandler(async (req, res) => {
	const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body
	const data = await paymentService.verifyPayment({ user: req.user, razorpay_order_id, razorpay_payment_id, razorpay_signature })
	res.status(200).json({ success: true, data })
})

exports.webhook = asyncHandler(async (req, res) => {
	// req.body is a Buffer here (express.raw on this route). Parse for the event object.
	const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : (req.rawBody || JSON.stringify(req.body))
	let parsed = {}
	try { parsed = JSON.parse(rawBody) } catch { parsed = {} }
	await paymentService.handleWebhook({ rawBody, signature: req.headers['x-razorpay-signature'], body: parsed })
	res.status(200).json({ success: true })
})

exports.cancelPayment = asyncHandler(async (req, res) => {
	const result = await paymentService.cancelPayment({ user: req.user, orderId: req.body.orderId })
	res.status(200).json({ success: true, message: result.message })
})

exports.getPaymentStatus = asyncHandler(async (req, res) => {
	const data = await paymentService.getPaymentStatus({ user: req.user, orderId: req.params.orderId })
	res.status(200).json({ success: true, data })
})
