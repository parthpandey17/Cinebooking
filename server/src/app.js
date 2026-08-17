'use strict'
const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const morgan = require('morgan')
const cookieParser = require('cookie-parser')
const config = require('./config')
const { healthCheck } = require('./db/pool')
const { errorHandler, notFound } = require('./middleware/errorHandler')

const app = express()

// CORS — allow configured frontends + Vercel preview subdomains.
const isAllowedVercelPreview = (origin) => /\.vercel\.app$/.test(origin || '')
app.use(cors({
	origin(origin, cb) {
		if (!origin) return cb(null, true)
		const clean = origin.replace(/\/+$/, '')
		if (config.frontendUrls.includes(clean) || isAllowedVercelPreview(clean)) return cb(null, true)
		return cb(new Error('Not allowed by CORS'))
	},
	credentials: true
}))
app.use(helmet())
if (config.env !== 'test') app.use(morgan('dev'))
app.use(cookieParser())

// NOTE: the Razorpay webhook needs the RAW body and mounts its own express.raw
// inside routes/payment.js BEFORE this JSON parser sees it.
app.use('/payment', require('./routes/payment'))

// JSON parser for everything else.
app.use(express.json({ limit: '1mb' }))
app.use(express.urlencoded({ extended: true }))

app.get('/health', async (req, res) => {
	const db = await healthCheck().catch(() => false)
	res.status(db ? 200 : 503).json({ success: db, status: db ? 'ok' : 'degraded', db })
})

app.use('/auth', require('./routes/auth'))
app.use('/cinema', require('./routes/cinema'))
app.use('/theater', require('./routes/theater'))
app.use('/movie', require('./routes/movie'))
app.use('/showtime', require('./routes/showtime'))
app.use('/seatlock', require('./routes/seatLock'))
app.use('/admin', require('./routes/admin'))
app.use('/ticket', require('./routes/ticket'))
app.use('/cancel', require('./routes/cancel'))
app.use('/waitlist', require('./routes/waitlist'))
app.use('/email', require('./routes/email'))

app.use(notFound)
app.use(errorHandler)

module.exports = app
