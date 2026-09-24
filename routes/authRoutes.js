const express = require('express');
const router = express.Router();
const { 
  telegramAuth, 
  handleLogin, 
  getMe, 
  handleCheckAdmin 
} = require('../controllers/authController');
const { resolveUserId, verifyToken } = require('../middleware/auth');

// ==========================================
// 1. مسارات تسجيل الدخول والتسجيل ببيانات تليجرام
// ==========================================

// المسارات الأساسية لتسجيل الدخول
router.post('/telegram', telegramAuth);
router.post('/login', handleLogin);

// مسارات إضافية موازية لضمان التوافق مع مختلف طلبات الواجهة الأمامية
router.post('/auth/telegram', telegramAuth);
router.post('/auth/login', handleLogin);
router.post('/api/auth/telegram', telegramAuth);
router.post('/api/auth/login', handleLogin);
router.post('/api/login', handleLogin);

// ==========================================
// 2. مسارات جلب بيانات المستخدم الحالي (Profile / GetMe)
// ==========================================

// جلب بيانات ملف المستخدم بحماية middleware التوثيق
router.get('/me', resolveUserId, getMe);
router.get('/auth/me', resolveUserId, getMe);
router.get('/api/auth/me', resolveUserId, getMe);
router.get('/api/me', resolveUserId, getMe);

// مسار إضافي لدعم التوثيق الصارم عبر JWT Bearer Token
router.get('/me/jwt', verifyToken, getMe);
router.get('/api/auth/me/jwt', verifyToken, getMe);

// ==========================================
// 3. مسارات التحقق من صلاحيات المدير (Admin Check)
// ==========================================

router.all('/check-admin', resolveUserId, handleCheckAdmin);
router.all('/auth/check-admin', resolveUserId, handleCheckAdmin);
router.all('/api/check-admin', resolveUserId, handleCheckAdmin);
router.all('/api/auth/check-admin', resolveUserId, handleCheckAdmin);

module.exports = router;
