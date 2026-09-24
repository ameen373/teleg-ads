const express = require('express');
const router = express.Router();

const { resolveUserId } = require('../middleware/auth');
const { 
  handleUserData, 
  getUserReferrals, 
  updateUserSettings 
} = require('../controllers/userController');

// مسارات بيانات المستخدم (يدعم المسار المباشر ومسار API)
router.get(['/user/data', '/api/user/data'], resolveUserId, handleUserData);

// مسارات الإحالات
router.get(['/user/referrals', '/api/user/referrals'], resolveUserId, getUserReferrals);

// مسارات إعدادات المستخدم
router.post(['/user/settings', '/api/user/settings'], resolveUserId, updateUserSettings);

module.exports = router;
