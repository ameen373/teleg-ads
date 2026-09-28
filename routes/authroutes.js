/**
 * Authentication & Admin Gateway Router
 */

const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

const loginHandler = authController.login || authController.handleLogin;
const checkAdminHandler = authController.checkAdmin || authController.handleCheckAdmin;

// Check Admin Status Routes
router.all('/api/check-admin', checkAdminHandler);
router.all('/check-admin', checkAdminHandler);

// Telegram Login Gateway Routes
router.post('/api/auth/login', loginHandler);
router.post('/auth/login', loginHandler);
router.post('/api/login', loginHandler);
router.post('/login', loginHandler);

module.exports = router;
