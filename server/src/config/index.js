'use strict'
require('dotenv').config()

const int = (v, d) => (v == null || v === '' ? d : parseInt(v, 10))

module.exports = {
	env: process.env.NODE_ENV || 'development',
	port: int(process.env.PORT, 8080),
	db: {
		host: process.env.DB_HOST || '127.0.0.1',
		port: int(process.env.DB_PORT, 3306),
		user: process.env.DB_USER || 'root',
		password: process.env.DB_PASSWORD || '',
		database: process.env.DB_NAME || 'cinebooker',
		connectionLimit: int(process.env.DB_POOL_LIMIT, 15),
		timezone: process.env.DB_TIMEZONE || 'Z'
	},
	jwt: {
		secret: process.env.JWT_SECRET || 'change_me',
		expire: process.env.JWT_EXPIRE || '30d',
		cookieExpireDays: int(process.env.JWT_COOKIE_EXPIRE, 30)
	},
	pricePerSeat: int(process.env.PRICE_PER_SEAT, 150),
	seatLock: { durationMs: int(process.env.SEAT_LOCK_MS, 5 * 60 * 1000) },
	waitlist: { offerWindowMs: int(process.env.WAITLIST_OFFER_MS, 10 * 60 * 1000) },
	razorpay: {
		keyId: process.env.RAZORPAY_KEY_ID || '',
		keySecret: process.env.RAZORPAY_KEY_SECRET || '',
		webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || ''
	},
	resend: {
		apiKey: process.env.RESEND_API_KEY || '',
		fromEmail: process.env.RESEND_FROM_EMAIL || '',
		frontendAppUrl: process.env.FRONTEND_APP_URL || ''
	},
	frontendUrls: (process.env.FRONTEND_URLS || 'http://localhost:5173,http://localhost:3000')
		.split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean)
}
