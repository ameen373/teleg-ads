// routes/linkRoutes.js
const express = require('express');
const router = express.Router();

// استدعاء ميدل وير المصادقة
const authMiddleware = require('../middlewares/auth');

// استدعاء الدوال من الكنترولر
const {
  createLink,
  getUserLinks,
  toggleLinkStatus
} = require('../controllers/linkController');

// حماية جميع مسارات الروابط باستخدام authMiddleware
router.use(authMiddleware);

// POST /api/links - إنشاء رابط مختصر جديد
router.post('/', createLink);

// GET /api/links - جلب روابط المستخدم الحالي
router.get('/', getUserLinks);

// PATCH /api/links/:id/toggle - تفعيل أو تعطيل رابط معين
router.patch('/:id/toggle', toggleLinkStatus);

module.exports = router;

