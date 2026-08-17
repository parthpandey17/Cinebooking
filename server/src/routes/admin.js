'use strict'
const express = require('express')
const router = express.Router()
const { protect, authorize } = require('../middleware/auth')
const admin = require('../controllers/adminController')

router.use(protect, authorize('admin'))
router.get('/stats', admin.getStats)
router.get('/payments', admin.getPayments)
router.get('/seatlocks', admin.getActiveLocks)
router.delete('/seatlocks/cleanup', admin.cleanupExpiredLocks)
router.delete('/seatlocks/:id', admin.forceReleaseLock)
router.get('/showtimes', admin.getAdminShowtimes)

module.exports = router
