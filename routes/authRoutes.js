const express = require('express');
const router = express.Router();
const { handleLogin, handleCheckAdmin } = require('../controllers/authController');

router.post('/auth/login', handleLogin);
router.post('/login', handleLogin);
router.post('/api/auth/login', handleLogin);
router.post('/api/login', handleLogin);

router.all('/check-admin', handleCheckAdmin);
router.all('/api/check-admin', handleCheckAdmin);

module.exports = router;
