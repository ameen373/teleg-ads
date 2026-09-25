/**
 * Self-Serve Ad Campaign Management Router
 */

const express = require('express');
const router = express.Router();
const { resolveUserId } = require('../middleware/auth');
const adsController = require('../controllers/adsController');

// Create New Ad Campaign
router.post('/api/ads', resolveUserId, adsController.handleCreateAd);

// Fetch User Ad Campaigns
router.get('/api/user/ads', resolveUserId, adsController.handleGetUserAds);

// Toggle Ad Active/Pause Status
router.post('/api/ads/toggle', resolveUserId, adsController.handleToggleAd);

// Delete Campaign & Refund
router.delete('/api/ads/:id', resolveUserId, adsController.handleDeleteAd);

module.exports = router;
