// routes/referralRoutes.js
const express = require('express');
const router = express.Router();

// استدعاء الميدلوير الخاص بالتحقق من الهوية
const authMiddleware = require('../middlewares/auth');

// استدعاء الدوال من referralController
const {
  getReferralStats,
  claimReferralEarnings
} = require('../controllers/referralController');

// حماية كافة المسارات المعرفة في هذا الـ Router
router.use(authMiddleware);

/**
 * @route   GET /api/referrals/stats
 * @desc    جلب إحصائيات الإحالات ورابط الدعوة
 * @access  Private
 */
router.get('/stats', getReferralStats);

/**
 * @route   POST /api/referrals/claim
 * @desc    تحويل أرباح الإحالات إلى الرصيد المتاح للسحب
 * @access  Private
 */
router.post('/claim', claimReferralEarnings);

// تصدير الـ Router
module.exports = router;
