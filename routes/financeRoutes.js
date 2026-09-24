const express = require('express');
const router = express.Router();
const { resolveUserId } = require('../middleware/auth');
const { handleDeposit, handleWithdraw, getTransactions } = require('../controllers/financeController');

router.all('/deposit', resolveUserId, handleDeposit);
router.all('/api/deposit', resolveUserId, handleDeposit);
router.all('/user/deposit', resolveUserId, handleDeposit);
router.all('/api/user/deposit', resolveUserId, handleDeposit);
router.all('/wallet/topup', resolveUserId, handleDeposit);
router.all('/api/wallet/topup', resolveUserId, handleDeposit);
router.all('/deposits', resolveUserId, handleDeposit);
router.all('/api/deposits', resolveUserId, handleDeposit);

router.post('/withdraw', resolveUserId, handleWithdraw);
router.post('/api/withdraw', resolveUserId, handleWithdraw);

router.get('/user/transactions', resolveUserId, getTransactions);
router.get('/api/user/transactions', resolveUserId, getTransactions);

module.exports = router;
