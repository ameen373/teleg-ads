/**
 * Traffic Engine Router (Bridge Page Gateway, Session Creation & Impression Tracking)
 */

const express = require('express');
const router = express.Router();
const { validateTraffic, clickLimiter } = require('../middleware/traffic');
const trafficController = require('../controllers/trafficController');

// Initialize Click Session
router.post('/api/init-click', validateTraffic, trafficController.handleInitClick);
router.post('/init-click', validateTraffic, trafficController.handleInitClick);

// Record Impression & Settle Revenue
router.post('/api/impression', validateTraffic, clickLimiter, trafficController.handleImpression);
router.post('/impression', validateTraffic, clickLimiter, trafficController.handleImpression);

module.exports = router;
