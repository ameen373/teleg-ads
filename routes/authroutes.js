/**
 * Authentication & Admin Gateway Router
 */

const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Check Admin Status
router.all('/api/check-admin', authController.handleCheckAdmin);
router.all('/check-admin', authController.handleCheckAdmin);

// Telegram Login Gateway
router.post('/api/auth/login', authController.handleLogin);
router.post('/auth/login', authController.handleLogin);
router.post('/api/login', authController.handleLogin);
router.post('/login', authController.handleLogin);

module.exports = router;
