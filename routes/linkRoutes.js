// routes/linkRoutes.js
const express = require('express');
const { body, param } = require('express-validator');
const router = express.Router();

const authMiddleware = require('../middlewares/auth');
const validateRequest = require('../middlewares/validateRequest');
const {
  createLink,
  getUserLinks,
  toggleLinkStatus
} = require('../controllers/linkController');

router.use(authMiddleware);

/**
 * @route   POST /api/links
 * @desc    إنشاء رابط مختصر جديد
 * @access  Private
 */
router.post(
  '/',
  [
    body('originalUrl')
      .trim()
      .isURL()
      .withMessage('يرجى تقديم رابط صالح (URL)'),
    body('title')
      .optional()
      .trim()
      .isLength({ max: 100 })
      .withMessage('العنوان يجب ألا يتجاوز 100 حرف'),
    validateRequest
  ],
  createLink
);

/**
 * @route   GET /api/links
 * @desc    جلب روابط المستخدم الحالي
 * @access  Private
 */
router.get('/', getUserLinks);

/**
 * @route   PATCH /api/links/:id/toggle
 * @desc    تفعيل أو تعطيل رابط معين
 * @access  Private
 */
router.patch(
  '/:id/toggle',
  [
    param('id').isMongoId().withMessage('معرف الرابط غير صالح'),
    validateRequest
  ],
  toggleLinkStatus
);

module.exports = router;
