// routes/bridgeRoutes.js
const express = require('express');
const router = express.Router();

// استدعاء الميدل وير والكنترولر
const authMiddleware = require('../middlewares/auth');
const {
  getLinkDetails,
  confirmImpression
} = require('../controllers/bridgeController');

// GET /api/bridge/link/:code - مسار عام لجلب تفاصيل الرابط والإعلان لصفحة الجسر
router.get('/link/:code', getLinkDetails);

// POST /api/bridge/confirm - مسار محمي بـ Auth لتأكيد المشاهدة واحتساب الأرباح
router.post('/confirm', authMiddleware, confirmImpression);

module.exports = router;

