// routes/campaignRoutes.js
const express = require('express');
const { body, param } = require('express-validator');
const router = express.Router();

const authMiddleware = require('../middlewares/auth');
const validateRequest = require('../middlewares/validateRequest');
const {
  createCampaign,
  getUserCampaigns,
  toggleCampaignStatus
} = require('../controllers/campaignController');

router.use(authMiddleware);

/**
 * @route   POST /api/campaigns
 * @desc    إنشاء حملة إعلانية جديدة
 * @access  Private
 */
router.post(
  '/',
  [
    body('title').trim().notEmpty().withMessage('عنوان الحملة مطلوب'),
    body('targetUrl').trim().isURL().withMessage('الرابط المستهدف غير صالح'),
    body('budget')
      .isFloat({ gt: 0 })
      .withMessage('الميزانية يجب أن تكون أكبر من 0'),
    body('cpm')
      .isFloat({ gt: 0 })
      .withMessage('تكلفة الألف ظهور (CPM) يجب أن تكون أكبر من 0'),
    validateRequest
  ],
  createCampaign
);

/**
 * @route   GET /api/campaigns
 * @desc    جلب حملات المستخدم
 * @access  Private
 */
router.get('/', getUserCampaigns);

/**
 * @route   PATCH /api/campaigns/:id/toggle
 * @desc    إيقاف أو تشغيل الحملة
 * @access  Private
 */
router.patch(
  '/:id/toggle',
  [
    param('id').isMongoId().withMessage('معرف الحملة غير صالح'),
    validateRequest
  ],
  toggleCampaignStatus
);

module.exports = router;
