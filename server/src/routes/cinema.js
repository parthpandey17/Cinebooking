'use strict'
const express = require('express')
const { getCinemas, getCinema, createCinema, updateCinema, deleteCinema, getUnreleasedCinemas } = require('../controllers/cinemaController')
const { protect, authorize } = require('../middleware/auth')
const router = express.Router()

router.route('/').get(getCinemas).post(protect, authorize('admin'), createCinema)
router.route('/unreleased').get(protect, authorize('admin'), getUnreleasedCinemas)
router.route('/:id').get(getCinema).put(protect, authorize('admin'), updateCinema).delete(protect, authorize('admin'), deleteCinema)

module.exports = router
