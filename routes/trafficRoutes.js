const express = require('express');
const router = express.Router();
const { validateTraffic, clickLimiter } = require('../middleware/rateLimiters');
const { handleInitClick, handleImpression } = require('../controllers/trafficController');

// مسارات بدء النقر
router.post('/init-click', validateTraffic, handleInitClick);
router.post('/api/init-click', validateTraffic, handleInitClick);

// مسارات تسجيل الظهور
router.post('/impression', validateTraffic, clickLimiter, handleImpression);
router.post('/api/impression', validateTraffic, clickLimiter, handleImpression);

module.exports = router;
