// routes/bridgeRoutes.js
const express = require('express');
const { body, param } = require('express-validator');
const router = express.Router();

const authMiddleware = require('../middlewares/auth');
const validateRequest = require('../middlewares/validateRequest');
const {
  getLinkDetails,
  confirmImpression
} = require('../controllers/bridgeController');

/**
 * @route   GET /api/bridge/link/:code
 * @desc    مسار عام لجلب تفاصيل الرابط والإعلان لصفحة الجسر
 * @access  Public
 */
router.get(
  '/link/:code',
  [
    param('code')
      .trim()
      .notEmpty()
      .isAlphanumeric()
      .withMessage('كود الرابط غير صالح'),
    validateRequest
  ],
  getLinkDetails
);

/**
 * @route   POST /api/bridge/confirm
 * @desc    تأكيد المشاهدة واحتساب الأرباح
 * @access  Private
 */
router.post(
  '/confirm',
  authMiddleware,
  [
    body('linkId').isMongoId().withMessage('معرف الرابط غير صالح'),
    body('campaignId').isMongoId().withMessage('معرف الحملة غير صالح'),
    validateRequest
  ],
  confirmImpression
);

module.exports = router;
