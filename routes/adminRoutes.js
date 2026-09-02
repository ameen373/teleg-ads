// routes/adminRoutes.js
const express = require('express');
const router = express.Router();

// استدعاء ميدل وير المصادقة والصلاحيات
const authMiddleware = require('../middlewares/auth');
const adminAuthMiddleware = require('../middlewares/adminAuth');

// استدعاء الدوال من الكنترولر
const {
  getDashboardStats,
  verifyAdmin,
  getPendingDeposits,
  processDeposit,
  getPendingWithdrawals,
  processWithdrawal,
  toggleUserBan
} = require('../controllers/adminController');

// تطبيق authMiddleware ثم adminAuthMiddleware على كافة المسارات التالية بالترتيب
router.use(authMiddleware);
router.use(adminAuthMiddleware);

// GET /api/admin/verify - التأكد من صلاحيات الآدمين للفرونت إند
router.get('/verify', verifyAdmin);

// GET /api/admin/stats - جلب إحصائيات النظام العامة
router.get('/stats', getDashboardStats);

// GET /api/admin/deposits/pending - جلب طلبات الإيداع المعلقة
router.get('/deposits/pending', getPendingDeposits);

// PATCH /api/admin/deposits/:id/process - معالجة طلب إيداع (قبول/رفض)
router.patch('/deposits/:id/process', processDeposit);

// GET /api/admin/withdrawals/pending - جلب طلبات السحب المعلقة
router.get('/withdrawals/pending', getPendingWithdrawals);

// PATCH /api/admin/withdrawals/:id/process - معالجة طلب سحب (قبول/رفض)
router.patch('/withdrawals/:id/process', processWithdrawal);

// PATCH /api/admin/users/:userId/ban - حظر أو فك حظر حساب مستخدم
router.patch('/users/:userId/ban', toggleUserBan);

module.exports = router;
