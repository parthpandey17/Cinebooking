'use strict'
const { AppError } = require('../../src/utils/AppError')

describe('utils/AppError', () => {
	test('carries statusCode and message', () => {
		const e = new AppError('nope', 404)
		expect(e).toBeInstanceOf(Error)
		expect(e.message).toBe('nope')
		expect(e.statusCode).toBe(404)
	})
	test('defaults to 500 and stores extra payload', () => {
		const e = new AppError('boom')
		expect(e.statusCode).toBe(500)
		const e2 = new AppError('locks', 400, { expiredSeats: ['A1'] })
		expect(e2.extra).toEqual({ expiredSeats: ['A1'] })
	})
})
