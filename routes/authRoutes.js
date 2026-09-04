// routes/authRoutes.js
const express = require('express');
const { body } = require('express-validator');
const router = express.Router();

const authMiddleware = require('../middlewares/auth');
const validateRequest = require('../middlewares/validateRequest');
const { getProfile, updateSettings } = require('../controllers/authController');

// حماية جميع المسارات بواسطة authMiddleware
router.use(authMiddleware);

/**
 * @route   GET /api/auth/me
 * @desc    جلب البروفايل والأرصدة للمستخدم الحالي
 * @access  Private
 */
router.get('/me', getProfile);

/**
 * @route   PUT /api/auth/settings
 * @desc    تحديث إعدادات المستخدم
 * @access  Private
 */
router.put(
  '/settings',
  [
    body('walletAddress')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('عنوان المحفظة لا يمكن أن يكون فارغاً'),
    body('language')
      .optional()
      .isIn(['ar', 'en'])
      .withMessage('اللغة غير مدعومة'),
    validateRequest
  ],
  updateSettings
);

module.exports = router;
