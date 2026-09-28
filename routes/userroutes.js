/**
 * User Account, Referrals, Deposits & Withdrawals Router
 */

const express = require('express');
const router = express.Router();
const { resolveUserId } = require('../middleware/auth');
const userController = require('../controllers/userController');

// User Dashboard Data
router.get('/api/user/data', resolveUserId, userController.handleUserData);
router.get('/api/user/dashboard', resolveUserId, userController.handleUserData);
router.get('/user/data', resolveUserId, userController.handleUserData);

// Referral System Metrics
router.get('/api/user/referrals', resolveUserId, userController.handleUserReferrals);
router.get('/api/referrals', resolveUserId, userController.handleUserReferrals);

// Deposit Requests
router.all('/api/deposit', resolveUserId, userController.handleDeposit);
router.all('/api/wallet/deposit', resolveUserId, userController.handleDeposit);
router.all('/deposit', resolveUserId, userController.handleDeposit);

// Withdrawal Processing
router.post('/api/withdraw', resolveUserId, userController.handleWithdraw);
router.post('/api/wallet/withdraw', resolveUserId, userController.handleWithdraw);

// Financial Transactions History
router.get('/api/user/transactions', resolveUserId, userController.handleUserTransactions);
router.get('/api/wallet/withdrawals', resolveUserId, userController.handleUserTransactions);

// User Settings & Wallet Address Update
router.post('/api/user/settings', resolveUserId, userController.handleUpdateSettings);
router.post('/api/wallet/update-address', resolveUserId, userController.handleUpdateSettings);

module.exports = router;
