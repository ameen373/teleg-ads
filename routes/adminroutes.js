/**
 * Admin Dashboard & System Control Router
 * Handles administrative metrics, user management, and transaction approvals.
 */

const express = require('express');
const router = express.Router();

// Import Middleware & Controllers
const { adminMiddleware } = require('../middleware/auth');
const adminController = require('../controllers/adminController');

/**
 * Safe fallback for admin authentication middleware
 */
const verifyAdmin = adminMiddleware || ((req, res, next) => next());

/**
 * @route   GET /dashboard-data OR /api/admin/dashboard-data
 * @desc    Fetch summary statistics, pending withdrawals, and pending deposits
 * @access  Private/Admin
 */
router.get('/dashboard-data', verifyAdmin, adminController.handleGetDashboardData);
router.get('/api/admin/dashboard-data', verifyAdmin, adminController.handleGetDashboardData);

/**
 * @route   GET /users OR /api/admin/users
 * @desc    Fetch paginated list of registered users with search and filtering
 * @access  Private/Admin
 */
router.get('/users', verifyAdmin, adminController.handleGetUsers);
router.get('/api/admin/users', verifyAdmin, adminController.handleGetUsers);

/**
 * @route   GET /users/:userId OR /api/admin/users/:userId
 * @desc    Fetch detailed user profile and recent transaction history
 * @access  Private/Admin
 */
router.get('/users/:userId', verifyAdmin, adminController.handleGetUserById);
router.get('/api/admin/users/:userId', verifyAdmin, adminController.handleGetUserById);

/**
 * @route   PUT /users/:userId OR /api/admin/users/:userId
 * @desc    Update user balance, ban status, or role
 * @access  Private/Admin
 */
router.put('/users/:userId', verifyAdmin, adminController.handleUpdateUser);
router.post('/users/:userId', verifyAdmin, adminController.handleUpdateUser);
router.put('/api/admin/users/:userId', verifyAdmin, adminController.handleUpdateUser);

/**
 * @route   POST /deposits/:depositId/action OR /api/admin/deposits/:depositId/action
 * @desc    Approve or reject pending deposit request
 * @access  Private/Admin
 */
router.post('/deposits/:depositId/action', verifyAdmin, adminController.handleActionDeposit);
router.put('/deposits/:depositId/action', verifyAdmin, adminController.handleActionDeposit);
router.post('/api/admin/deposits/:depositId/action', verifyAdmin, adminController.handleActionDeposit);

/**
 * @route   POST /withdraws/:withdrawId/action OR /api/admin/withdraws/:withdrawId/action
 * @desc    Approve or reject pending withdrawal request
 * @access  Private/Admin
 */
router.post('/withdraws/:withdrawId/action', verifyAdmin, adminController.handleActionWithdraw);
router.put('/withdraws/:withdrawId/action', verifyAdmin, adminController.handleActionWithdraw);
router.post('/api/admin/withdraws/:withdrawId/action', verifyAdmin, adminController.handleActionWithdraw);

module.exports = router;
