// routes/adminRoutes.js
const express = require('express');
const { body, param } = require('express-validator');
const router = express.Router();

const authMiddleware = require('../middlewares/auth');
const adminAuthMiddleware = require('../middlewares/adminAuth');
const validateRequest = require('../middlewares/validateRequest');
const {
  getDashboardStats,
  verifyAdmin,
  getPendingDeposits,
  processDeposit,
  getPendingWithdrawals,
  processWithdrawal,
  toggleUserBan
} = require('../controllers/adminController');

// تطبيق طبقتي المصادقة لحماية مسارات الأدمن
router.use(authMiddleware);
router.use(adminAuthMiddleware);

/**
 * @route   GET /api/admin/verify
 * @desc    التأكد من صلاحيات الآدمين للفرونت إند
 * @access  Private (Admin)
 */
router.get('/verify', verifyAdmin);

/**
 * @route   GET /api/admin/stats
 * @desc    جلب إحصائيات النظام العامة
 * @access  Private (Admin)
 */
router.get('/stats', getDashboardStats);

/**
 * @route   GET /api/admin/deposits/pending
 * @desc    جلب طلبات الإيداع المعلقة
 * @access  Private (Admin)
 */
router.get('/deposits/pending', getPendingDeposits);

/**
 * @route   PATCH /api/admin/deposits/:id/process
 * @desc    معالجة طلب إيداع (قبول/رفض)
 * @access  Private (Admin)
 */
router.patch(
  '/deposits/:id/process',
  [
    param('id').isMongoId().withMessage('معرف الطلب غير صالح'),
    body('status')
      .isIn(['approved', 'rejected'])
      .withMessage('الحالة يجب أن تكون approved أو rejected'),
    validateRequest
  ],
  processDeposit
);

/**
 * @route   GET /api/admin/withdrawals/pending
 * @desc    جلب طلبات السحب المعلقة
 * @access  Private (Admin)
 */
router.get('/withdrawals/pending', getPendingWithdrawals);

/**
 * @route   PATCH /api/admin/withdrawals/:id/process
 * @desc    معالجة طلب سحب (قبول/رفض)
 * @access  Private (Admin)
 */
router.patch(
  '/withdrawals/:id/process',
  [
    param('id').isMongoId().withMessage('معرف الطلب غير صالح'),
    body('status')
      .isIn(['approved', 'rejected'])
      .withMessage('الحالة يجب أن تكون approved أو rejected'),
    validateRequest
  ],
  processWithdrawal
);

/**
 * @route   PATCH /api/admin/users/:userId/ban
 * @desc    حظر أو فك حظر حساب مستخدم
 * @access  Private (Admin)
 */
router.patch(
  '/users/:userId/ban',
  [
    param('userId').isMongoId().withMessage('معرف المستخدم غير صالح'),
    validateRequest
  ],
  toggleUserBan
);

module.exports = router;
