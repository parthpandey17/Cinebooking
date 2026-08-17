'use strict'
// Seats are virtual, derived from a theater's seat plan. Mirrors the Mongo app's
// rowToNumber / enumerateSeats / getCapacity helpers exactly so seat identities and
// counts are byte-for-byte compatible.

// 'A'->1, 'Z'->26, 'AA'->27 ...
function rowToNumber(row = '') {
	return String(row).toUpperCase().split('').reduce((t, ch) => t * 26 + (ch.charCodeAt(0) - 64), 0)
}
function totalSeats(row, column) {
	return rowToNumber(row) * Number(column || 0)
}
// All labels in plan order: A1..A{col}, B1.. etc.
function enumerateSeats(row, column) {
	const rows = rowToNumber(row)
	const cols = Number(column || 0)
	const out = []
	for (let rn = 1; rn <= rows; rn++) {
		let n = rn, label = ''
		while (n > 0) { const r = (n - 1) % 26; label = String.fromCharCode(65 + r) + label; n = Math.floor((n - 1) / 26) }
		for (let c = 1; c <= cols; c++) out.push(`${label}${c}`)
	}
	return out
}
// "A12" -> { row:"A", number:12 }
function labelToSeat(label) {
	const m = String(label).match(/^([A-Za-z]{1,2})(\d{1,3})$/)
	return m ? { row: m[1].toUpperCase(), number: parseInt(m[2], 10) } : null
}
const seatToLabel = (row, number) => `${row}${number}`

// Is a seat label within the given plan? (used when shrinking a seat plan)
function isSeatWithinPlan(label, row, column) {
	const s = labelToSeat(label)
	if (!s) return false
	return rowToNumber(s.row) <= rowToNumber(row) && s.number <= Number(column)
}

module.exports = { rowToNumber, totalSeats, enumerateSeats, labelToSeat, seatToLabel, isSeatWithinPlan }
