// routes/walletRoutes.js
const express = require('express');
const { body } = require('express-validator');
const router = express.Router();

const authMiddleware = require('../middlewares/auth');
const validateRequest = require('../middlewares/validateRequest');
const {
  submitDeposit,
  requestWithdrawal,
  getTransactionHistory
} = require('../controllers/walletController');

router.use(authMiddleware);

/**
 * @route   POST /api/wallet/deposit
 * @desc    تقديم طلب إيداع
 * @access  Private
 */
router.post(
  '/deposit',
  [
    body('amount')
      .isFloat({ gt: 0 })
      .withMessage('المبلغ يجب أن يكون رقماً موجباً أكبر من 0'),
    body('txHash')
      .trim()
      .notEmpty()
      .withMessage('هاش العملية (TX Hash) مطلوب'),
    validateRequest
  ],
  submitDeposit
);

/**
 * @route   POST /api/wallet/withdraw
 * @desc    تقديم طلب سحب
 * @access  Private
 */
router.post(
  '/withdraw',
  [
    body('amount')
      .isFloat({ gt: 0 })
      .withMessage('المبلغ يجب أن يكون رقماً موجباً أكبر من 0'),
    body('walletAddress')
      .trim()
      .notEmpty()
      .withMessage('عنوان المحفظة مطلوب'),
    validateRequest
  ],
  requestWithdrawal
);

/**
 * @route   GET /api/wallet/history
 * @desc    جلب سجل المعاملات
 * @access  Private
 */
router.get('/history', getTransactionHistory);

module.exports = router;
