const express = require('express');
const router = express.Router();
const { resolveUserId } = require('../middleware/auth');
const { createAd, getUserAds, toggleAd, deleteAd } = require('../controllers/adController');

router.post('/ads', resolveUserId, createAd);
router.post('/api/ads', resolveUserId, createAd);

router.get('/user/ads', resolveUserId, getUserAds);
router.get('/api/user/ads', resolveUserId, getUserAds);

router.post('/ads/toggle', resolveUserId, toggleAd);
router.post('/api/ads/toggle', resolveUserId, toggleAd);

router.delete('/ads/:id', resolveUserId, deleteAd);
router.delete('/api/ads/:id', resolveUserId, deleteAd);

module.exports = router;
