const express = require('express');
const router = express.Router();
const { adminMiddleware } = require('../middleware/auth');
const { getAdminDashboardData } = require('../controllers/adminController');

router.get('/admin/dashboard-data', adminMiddleware, getAdminDashboardData);
router.get('/api/admin/dashboard-data', adminMiddleware, getAdminDashboardData);

module.exports = router;
