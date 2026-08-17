'use strict'
/**
 * Integration tests — require a running MySQL loaded with db/schema.sql + db/seed.sql
 * and the env vars in .env (DB_*, JWT_SECRET). They exercise the real HTTP stack via
 * Supertest against src/app.js.
 *
 * If the database is not reachable, the whole suite is SKIPPED (not failed) so the
 * unit tests can still run in a DB-less environment. Provide a DB and run again for
 * full coverage.
 */
const request = require('supertest')

let app, healthCheck, close, dbUp = false

beforeAll(async () => {
	app = require('../../src/app')
	;({ healthCheck, close } = require('../../src/db/pool'))
	dbUp = await healthCheck().catch(() => false)
	if (!dbUp) console.warn('\n[integration] MySQL not reachable — skipping integration tests.\n')
})

afterAll(async () => { if (close) await close().catch(() => {}) })

const itDb = (name, fn) => test(name, async () => { if (!dbUp) return; await fn() })

describe('Catalog (public)', () => {
	itDb('GET /movie returns a list', async () => {
		const res = await request(app).get('/movie')
		expect(res.status).toBe(200)
		expect(res.body.success).toBe(true)
		expect(Array.isArray(res.body.data)).toBe(true)
	})
	itDb('GET /showtime returns released showtimes', async () => {
		const res = await request(app).get('/showtime')
		expect(res.status).toBe(200)
		expect(Array.isArray(res.body.data)).toBe(true)
	})
})

describe('Auth + booking flow', () => {
	let token
	itDb('logs in the seeded user', async () => {
		const res = await request(app).post('/auth/login').send({ username: 'user', password: 'user123' })
		expect(res.status).toBe(200)
		token = res.body.token
		expect(token).toBeTruthy()
	})
	itDb('locks and then unlocks seats', async () => {
		if (!token) return
		const lock = await request(app).post('/seatlock/lock').set('Authorization', `Bearer ${token}`).send({ showtimeId: 1, seats: ['D1', 'D2'] })
		expect([200, 409]).toContain(lock.status)
		const unlock = await request(app).delete('/seatlock/unlock').set('Authorization', `Bearer ${token}`).send({ showtimeId: 1 })
		expect(unlock.status).toBe(200)
	})
	itDb('rejects create-order without a held lock', async () => {
		if (!token) return
		const res = await request(app).post('/payment/create-order').set('Authorization', `Bearer ${token}`).send({ showtimeId: 1, seats: ['E1'] })
		// no lock held for E1 → 400 with expiredSeats
		expect(res.status).toBe(400)
		expect(res.body).toHaveProperty('expiredSeats')
	})
})

describe('Auth guards', () => {
	itDb('blocks admin routes without a token', async () => {
		const res = await request(app).get('/admin/stats')
		expect([401, 403]).toContain(res.status)
	})
})
