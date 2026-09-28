/**
 * Admin Dashboard & System Control Router
 * Project: Telega-Ads Platform
 */

const express = require('express');
const router = express.Router();
const { adminMiddleware } = require('../middleware/auth');
const adminController = require('../controllers/adminController');

// Administrative Dashboard Metrics
router.get('/api/admin/dashboard-data', adminMiddleware, adminController.handleGetDashboardData);
router.get('/admin/dashboard-data', adminMiddleware, adminController.handleGetDashboardData);

module.exports = router;
