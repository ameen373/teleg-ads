// routes/walletRoutes.js
const express = require('express');
const router = express.Router();

// استدعاء ميدل وير المصادقة
const authMiddleware = require('../middlewares/auth');

// استدعاء الدوال من الكنترولر
const {
  submitDeposit,
  requestWithdrawal,
  getTransactionHistory
} = require('../controllers/walletController');

// حماية جميع مسارات المحفظة والمالية بـ authMiddleware
router.use(authMiddleware);

// POST /api/wallet/deposit - تقديم طلب إيداع
router.post('/deposit', submitDeposit);

// POST /api/wallet/withdraw - تقديم طلب سحب
router.post('/withdraw', requestWithdrawal);

// GET /api/wallet/history - جلب سجل المعاملات (إيداعات وسحوبات)
router.get('/history', getTransactionHistory);

module.exports = router;

