const express = require('express');
const router = express.Router();
const { resolveUserId } = require('../middleware/auth');
const { handleUserData, getUserReferrals, updateUserSettings } = require('../controllers/userController');

router.get('/user/data', resolveUserId, handleUserData);
router.get('/api/user/data', resolveUserId, handleUserData);

router.get('/user/referrals', resolveUserId, getUserReferrals);
router.get('/api/user/referrals', resolveUserId, getUserReferrals);

router.post('/user/settings', resolveUserId, updateUserSettings);
router.post('/api/user/settings', resolveUserId, updateUserSettings);

module.exports = router;
