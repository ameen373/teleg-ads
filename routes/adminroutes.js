/**
 * Admin Dashboard & System Control Router
 * Telega.ads Platform
 */

const express = require('express');
const router = express.Router();
const { adminMiddleware } = require('../middleware/auth');
const adminController = require('../controllers/adminController');

// ==========================================
// Administrative Dashboard Metrics
// ==========================================
router.get('/api/admin/dashboard', adminMiddleware, adminController.handleGetDashboardData);
router.get('/api/admin/dashboard-data', adminMiddleware, adminController.handleGetDashboardData);

// ==========================================
// Financial & Deposit Management Actions
// ==========================================
router.post('/api/admin/deposits/action', adminMiddleware, adminController.handleDepositAction);
router.post('/api/admin/deposit/:action', adminMiddleware, adminController.handleDepositAction);

// ==========================================
// Withdrawal Processing Actions
// ==========================================
router.post('/api/admin/withdrawals/action', adminMiddleware, adminController.handleWithdrawAction);
router.post('/api/admin/withdraw/:action', adminMiddleware, adminController.handleWithdrawAction);

// ==========================================
// Generic System & Mod Actions
// ==========================================
router.post('/api/admin/:type/:action', adminMiddleware, adminController.handleGenericAdminAction);

module.exports = router;
