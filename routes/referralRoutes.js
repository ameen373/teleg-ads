// routes/referralRoutes.js
const express = require('express');
const router = express.Router();

const authMiddleware = require('../middlewares/auth');
const {
  getReferralStats,
  claimReferralEarnings
} = require('../controllers/referralController');

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

module.exports = router;
