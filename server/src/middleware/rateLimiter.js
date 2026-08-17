'use strict'
// Lightweight in-memory fixed-window limiter (no external dep). Sufficient for a
// single-instance deployment; swap for a Redis store if you scale horizontally.
function createLimiter({ windowMs, max, message }) {
	const hits = new Map()
	setInterval(() => {
		const now = Date.now()
		for (const [k, v] of hits) if (v.reset <= now) hits.delete(k)
	}, windowMs).unref()

	return (req, res, next) => {
		const key = req.ip || req.headers['x-forwarded-for'] || 'global'
		const now = Date.now()
		let rec = hits.get(key)
		if (!rec || rec.reset <= now) { rec = { count: 0, reset: now + windowMs }; hits.set(key, rec) }
		rec.count++
		if (rec.count > max) {
			return res.status(429).json({ success: false, message: message || 'Too many requests, please try again later' })
		}
		next()
	}
}

const authLimiter = createLimiter({ windowMs: 15 * 60 * 1000, max: 50, message: 'Too many attempts, please try again later' })

module.exports = { createLimiter, authLimiter }
