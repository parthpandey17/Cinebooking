'use strict'
const express = require('express')
const { register, login, adminLogin, getMe, getAll, logout, deleteUser, getTickets, updateUser } = require('../controllers/authController')
const { protect, authorize } = require('../middleware/auth')
const { authLimiter } = require('../middleware/rateLimiter')

const router = express.Router()

router.post('/register', authLimiter, register)
router.post('/login', authLimiter, login)
router.post('/admin/login', authLimiter, adminLogin)
router.get('/logout', logout)

router.get('/me', protect, getMe)
router.get('/tickets', protect, authorize('user'), getTickets)

router.put('/user/:id', protect, authorize('admin'), updateUser)
router.get('/user', protect, authorize('admin'), getAll)
router.delete('/user/:id', protect, authorize('admin'), deleteUser)

module.exports = router
