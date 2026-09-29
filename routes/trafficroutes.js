/**
 * Traffic Engine Router (Session Creation & Impression Tracking)
 * Telega.ads Platform
 */

const express = require('express');
const router = express.Router();
const { validateTraffic, clickLimiter } = require('../middleware/traffic');
const trafficController = require('../controllers/trafficController');

// ==========================================
// Initialize Click Session
// ==========================================
router.post('/api/init-click', validateTraffic, trafficController.handleInitClick);
router.post('/init-click', validateTraffic, trafficController.handleInitClick);

// ==========================================
// Record Impression & Settle Publisher Revenue
// ==========================================
router.post('/api/impression', validateTraffic, clickLimiter, trafficController.handleImpression);
router.post('/impression', validateTraffic, clickLimiter, trafficController.handleImpression);

module.exports = router;
