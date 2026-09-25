/**
 * User Account, Referrals, Deposits & Withdrawals Router
 */

const express = require('express');
const router = express.Router();
const { resolveUserId } = require('../middleware/auth');
const userController = require('../controllers/userController');

// User Dashboard Data
router.get('/api/user/data', resolveUserId, userController.handleUserData);
router.get('/user/data', resolveUserId, userController.handleUserData);

// Referral System Metrics
router.get('/api/user/referrals', resolveUserId, userController.handleUserReferrals);

// Deposit Requests
router.all('/api/deposit', resolveUserId, userController.handleDeposit);
router.all('/deposit', resolveUserId, userController.handleDeposit);
router.all('/api/user/deposit', resolveUserId, userController.handleDeposit);
router.all('/user/deposit', resolveUserId, userController.handleDeposit);
router.all('/api/wallet/topup', resolveUserId, userController.handleDeposit);
router.all('/wallet/topup', resolveUserId, userController.handleDeposit);
router.all('/api/deposits', resolveUserId, userController.handleDeposit);
router.all('/deposits', resolveUserId, userController.handleDeposit);

// Withdrawal Processing
router.post('/api/withdraw', resolveUserId, userController.handleWithdraw);

// Financial Transactions History
router.get('/api/user/transactions', resolveUserId, userController.handleUserTransactions);

// User Settings Update
router.post('/api/user/settings', resolveUserId, userController.handleUpdateSettings);

module.exports = router;
