'use strict'
const adminRepository = require('../repositories/adminRepository')
const showtimeService = require('./showtimeService')
const waitlistService = require('./waitlistService')

const paymentShape = (r) => ({
	_id: String(r.id), razorpayOrderId: r.razorpayOrderId, razorpayPaymentId: r.razorpayPaymentId,
	amount: Number(r.amount), currency: r.currency, status: r.status, createdAt: r.createdAt,
	user: { _id: String(r.uid), username: r.username, email: r.email, ...(r.role ? { role: r.role } : {}) },
	showtime: { _id: String(r.sid), showtime: r.showDatetime, movie: { name: r.movieName },
		...(r.theaterNumber != null ? { theater: { number: r.theaterNumber, cinema: { name: r.cinemaName } } } : {}) }
})

const adminService = {
	async getStats() {
		const [counts, revenue, monthlyRevenue, recent] = await Promise.all([
			adminRepository.counts(), adminRepository.revenue(), adminRepository.monthlyRevenue(), adminRepository.recentPaidPayments(10)
		])
		return {
			counts: { ...counts, bookings: counts.tickets },
			revenue, monthlyRevenue,
			recentPayments: recent.map(paymentShape)
		}
	},
	async getPayments(query) {
		const page = Math.max(parseInt(query.page || '1', 10), 1)
		const limit = Math.min(Math.max(parseInt(query.limit || '20', 10), 1), 100)
		const { total, rows } = await adminRepository.paymentsPage({ status: query.status, search: query.search || '', page, limit })
		const data = rows.map(paymentShape)
		return { count: data.length, total, totalPages: Math.ceil(total / limit), data }
	},
	async getActiveLocks() {
		const rows = await adminRepository.activeLocks()
		return rows.map((r) => ({ _id: String(r.id), seatNumber: r.seatNumber, expiresAt: r.expiresAt,
			userId: { _id: String(r.uid), username: r.username }, showtimeId: { _id: String(r.showtimeId), movie: { name: r.movieName } } }))
	},
	async forceReleaseLock(id) {
		const showtimeId = await adminRepository.lockShowtimeId(id)
		await adminRepository.deleteLock(id)
		if (showtimeId) await waitlistService.processWaitlist(showtimeId)
	},
	async cleanupLocks() {
		return waitlistService.cleanupExpiredLocksAndProcessWaitlists()
	},
	async getAdminShowtimes() {
		return showtimeService.listUnreleased()
	}
}
module.exports = adminService
