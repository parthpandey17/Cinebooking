'use strict'
const express = require('express')
const router = express.Router()
const { protect, authorize } = require('../middleware/auth')
const w = require('../controllers/waitlistController')

router.get('/admin/all', protect, authorize('admin'), w.getAllWaitlists)
router.get('/admin/stats', protect, authorize('admin'), w.getWaitlistStats)
router.get('/my', protect, authorize('user'), w.getMyWaitlists)
router.get('/:showtimeId', protect, authorize('user'), w.getMyStatus)
router.post('/:showtimeId', protect, authorize('user'), w.joinWaitlist)
router.post('/:showtimeId/accept', protect, authorize('user'), w.acceptOffer)
router.post('/:showtimeId/decline', protect, authorize('user'), w.declineOffer)
router.post('/:showtimeId/confirm', protect, authorize('user'), w.confirmOffer)
router.delete('/:showtimeId', protect, authorize('user'), w.leaveWaitlist)

module.exports = router
