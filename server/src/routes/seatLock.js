'use strict'
const express = require('express')
const router = express.Router()
const { protect, authorize } = require('../middleware/auth')
const { lockSeats, unlockSeats, getLockedSeats, verifyLocks, cleanupExpiredLocks, validateSeats } = require('../controllers/seatLockController')

// Specific named routes BEFORE the wildcard so they aren't swallowed.
router.route('/lock').post(protect, authorize('user'), lockSeats)
router.route('/unlock').delete(protect, authorize('user'), unlockSeats)
router.route('/verify').post(protect, authorize('user'), verifyLocks)
router.route('/validate').post(protect, authorize('user'), validateSeats)
router.route('/cleanup').delete(protect, authorize('admin'), cleanupExpiredLocks)
router.route('/:showtimeId').get(getLockedSeats)

module.exports = router
