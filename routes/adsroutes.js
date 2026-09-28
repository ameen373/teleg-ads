/**
 * Self-Serve Ad Campaign Management Router
 */

const express = require('express');
const router = express.Router();
const { resolveUserId } = require('../middleware/auth');
const adsController = require('../controllers/adsController');

// Create New Ad Campaign
router.post('/api/ads/create', resolveUserId, adsController.handleCreateAd);
router.post('/api/ads', resolveUserId, adsController.handleCreateAd);

// Fetch User Ad Campaigns
router.get('/api/ads/my-ads', resolveUserId, adsController.handleGetUserAds);
router.get('/api/ads', resolveUserId, adsController.handleGetUserAds);
router.get('/api/user/ads', resolveUserId, adsController.handleGetUserAds);

// Toggle Ad Active/Pause Status
router.post('/api/ads/toggle', resolveUserId, adsController.handleToggleAd);

// Delete Campaign & Refund
router.delete('/api/ads/delete/:id', resolveUserId, adsController.handleDeleteAd);
router.delete('/api/ads/:id', resolveUserId, adsController.handleDeleteAd);

// Serving Ads & Recording Traffic
router.post('/api/ads/serve', resolveUserId, adsController.handleServeAd);
router.post('/api/ads/record-impression', resolveUserId, adsController.handleRecordImpression);
router.post('/api/ads/click', resolveUserId, adsController.handleRecordClick);

module.exports = router;
