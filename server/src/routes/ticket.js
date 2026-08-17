'use strict'
const express = require('express')
const router = express.Router()
const { protect, authorize } = require('../middleware/auth')
const tc = require('../controllers/ticketController')

router.get('/', protect, authorize('user', 'admin'), tc.getMyTickets)
router.post('/validate', protect, authorize('admin'), tc.validateTicket)
router.get('/admin/all', protect, authorize('admin'), tc.getAllTicketsAdmin)
router.get('/showtime/:showtimeId', protect, authorize('admin'), tc.getTicketsByShowtime)
router.get('/:id', protect, tc.getTicketById)

module.exports = router
