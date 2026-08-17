'use strict'
const { rowToNumber, totalSeats, enumerateSeats, labelToSeat, seatToLabel, isSeatWithinPlan } = require('../../src/utils/seats')

describe('utils/seats — virtual seat helpers', () => {
	test('rowToNumber maps letters to 1-based indices', () => {
		expect(rowToNumber('A')).toBe(1)
		expect(rowToNumber('Z')).toBe(26)
		expect(rowToNumber('AA')).toBe(27)
		expect(rowToNumber('a')).toBe(1)
	})

	test('totalSeats multiplies rows by columns', () => {
		expect(totalSeats('J', 12)).toBe(120)
		expect(totalSeats('A', 1)).toBe(1)
		expect(totalSeats('H', 10)).toBe(80)
	})

	test('enumerateSeats returns every label in plan order', () => {
		const seats = enumerateSeats('B', 3)
		expect(seats).toEqual(['A1', 'A2', 'A3', 'B1', 'B2', 'B3'])
		expect(enumerateSeats('J', 12)).toHaveLength(120)
	})

	test('labelToSeat parses valid labels and rejects junk', () => {
		expect(labelToSeat('A12')).toEqual({ row: 'A', number: 12 })
		expect(labelToSeat('C5')).toEqual({ row: 'C', number: 5 })
		expect(labelToSeat('')).toBeNull()
		expect(labelToSeat('12')).toBeNull()
		expect(labelToSeat('ABC')).toBeNull()
	})

	test('seatToLabel is the inverse of labelToSeat', () => {
		expect(seatToLabel('C', 5)).toBe('C5')
		const s = labelToSeat('J12')
		expect(seatToLabel(s.row, s.number)).toBe('J12')
	})

	test('isSeatWithinPlan enforces plan bounds', () => {
		expect(isSeatWithinPlan('J12', 'J', 12)).toBe(true)
		expect(isSeatWithinPlan('K1', 'J', 12)).toBe(false)
		expect(isSeatWithinPlan('A13', 'J', 12)).toBe(false)
		expect(isSeatWithinPlan('bad', 'J', 12)).toBe(false)
	})
})
