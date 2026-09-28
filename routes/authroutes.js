/**
 * Authentication & Admin Gateway Router
 */

const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// تحديد دالة تسجيل الدخول ودالة فحص المدير مع دعم المسميات المختلفة لضمان عدم الانقطاع
const loginHandler = authController.handleLogin || authController.login;
const checkAdminHandler = authController.handleCheckAdmin || authController.checkAdmin;

/**
 * Validation Middleware لمسارات تسجيل الدخول
 * يفحص وجود أي مصدر لمعرف المستخدم (telegramId / userId / initData)
 * تم إصلاح الشرط لضمان عدم إرجاع خطأ 400 عند وجود بيانات صالحة بأي صيغة مقبولة
 */
const validateLoginInput = (req, res, next) => {
  const initData = req.headers['x-telegram-init-data'] || 
                   req.headers['telegram-init-data'] || 
                   req.headers['x-init-data'] || 
                   req.query?.initData || 
                   req.body?.initData || 
                   req.body?.user || 
                   req.query?.user;

  const rawId = req.body?.telegramId || 
                req.body?.userId || 
                req.body?.telegram_id || 
                req.body?.user_id || 
                req.body?.userld || 
                req.body?.telegramid || 
                req.body?.id || 
                req.body?.tg_id ||
                req.query?.telegram_id || 
                req.query?.telegramId || 
                req.query?.userId || 
                req.query?.userld || 
                req.query?.user_id || 
                req.query?.telegramid || 
                req.query?.id || 
                req.query?.tg_id ||
                req.headers['x-user-id'] || 
                req.headers['user-id'] || 
                req.headers['telegramid'] || 
                req.headers['telegram_id'];

  // لا يتم إرجاع 400 Bad Request إلا إذا كانت البيانات ناقصة تماماً
  if (!initData && (!rawId || rawId === 'null' || rawId === 'undefined' || rawId === '')) {
    return res.status(400).json({
      success: false,
      message: 'بيانات تسجيل الدخول غير مكتملة: يجب توفير telegramId أو userId أو بيانات initData (Validation Error)'
    });
  }

  next();
};

// Check Admin Status Routes
router.all('/api/check-admin', checkAdminHandler);
router.all('/check-admin', checkAdminHandler);

// Telegram Login Gateway Routes
router.post('/api/auth/login', validateLoginInput, loginHandler);
router.post('/auth/login', validateLoginInput, loginHandler);
router.post('/api/login', validateLoginInput, loginHandler);
router.post('/login', validateLoginInput, loginHandler);

module.exports = router;
