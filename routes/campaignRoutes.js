// routes/campaignRoutes.js
const express = require('express');
const router = express.Router();

// استدعاء ميدل وير المصادقة
const authMiddleware = require('../middlewares/auth');

// استدعاء الدوال من الكنترولر
const {
  createCampaign,
  getUserCampaigns,
  toggleCampaignStatus
} = require('../controllers/campaignController');

// حماية كافة مسارات الحملات بواسطة authMiddleware
router.use(authMiddleware);

// POST /api/campaigns - إنشاء حملة جديدة
router.post('/', createCampaign);

// GET /api/campaigns - جلب حملات المستخدم
router.get('/', getUserCampaigns);

// PATCH /api/campaigns/:id/toggle - إيقاف أو تشغيل الحملة
router.patch('/:id/toggle', toggleCampaignStatus);

module.exports = router;
