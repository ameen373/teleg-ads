// routes/authRoutes.js
const express = require('express');
const router = express.Router();

const authMiddleware = require('../middlewares/auth');
const { getProfile, updateSettings } = require('../controllers/authController');

// حماية المسارات مع authMiddleware
router.use(authMiddleware);

// GET /api/auth/me - جلب البروفايل والأرصدة
router.get('/me', getProfile);

// PUT /api/auth/settings - تحديث إعدادات المستخدم
router.put('/settings', updateSettings);

module.exports = router;
