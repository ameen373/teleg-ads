/**
 * Self-Serve Ad Campaign Management Router
 * Telega.ads Platform
 */

const express = require('express');
const router = express.Router();
const { resolveUserId } = require('../middleware/auth');
const adsController = require('../controllers/adsController');

// ==========================================
// Campaign Creation
// ==========================================
router.post('/api/ads/create', resolveUserId, adsController.handleCreateAd);
router.post('/api/ads', resolveUserId, adsController.handleCreateAd);

// ==========================================
// Fetch User Campaigns
// ==========================================
router.get('/api/ads/my-ads', resolveUserId, adsController.handleGetUserAds);
router.get('/api/ads', resolveUserId, adsController.handleGetUserAds);
router.get('/api/user/ads', resolveUserId, adsController.handleGetUserAds);

// ==========================================
// Campaign Status Management
// ==========================================
router.post('/api/ads/toggle', resolveUserId, adsController.handleToggleAd);

// ==========================================
// Campaign Deletion & Refund
// ==========================================
router.delete('/api/ads/delete/:id', resolveUserId, adsController.handleDeleteAd);
router.delete('/api/ads/:id', resolveUserId, adsController.handleDeleteAd);

// ==========================================
// Serving Ads & Recording Traffic
// ==========================================
router.post('/api/ads/serve', resolveUserId, adsController.handleServeAd);
router.post('/api/ads/record-impression', resolveUserId, adsController.handleRecordImpression);
router.post('/api/ads/click', resolveUserId, adsController.handleRecordClick);

module.exports = router;
