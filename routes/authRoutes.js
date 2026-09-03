// routes/authRoutes.js
const express = require('express');
const router = express.Router();

const authMiddleware = require('../middlewares/auth');
const { getProfile, updateSettings } = require('../controllers/authController');

// حماية جميع المسارات التالية بواسطة authMiddleware
router.use(authMiddleware);

// GET /api/auth/me - جلب البروفايل والأرصدة للمستخدم الحالي
router.get('/me', getProfile);

// PUT /api/auth/settings - تحديث إعدادات المستخدم (مثل المحفظة واللغة)
router.put('/settings', updateSettings);

module.exports = router;
