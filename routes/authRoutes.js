// routes/authRoutes.js
const express = require('express');
const router = express.Router();

// استدعاء الميدل وير الخاص بالمصادقة
const authMiddleware = require('../middlewares/auth');

// استدعاء الدوال من الكنترولر
const { getProfile, updateSettings } = require('../controllers/authController');

// حماية جميع المسارات التالية بواسطة authMiddleware
router.use(authMiddleware);

// GET /api/auth/me - جلب بيانات البروفايل
router.get('/me', getProfile);

// PUT /api/auth/settings - تحديث الإعدادات (المحفظة واللغة)
router.put('/settings', updateSettings);

module.exports = router;

