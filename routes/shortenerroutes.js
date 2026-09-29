/**
 * Link Shortener & Link Analytics Router
 * Telega.ads Platform
 */

const express = require('express');
const router = express.Router();
const { resolveUserId } = require('../middleware/auth');
const { linkCreationLimiter } = require('../middleware/traffic');
const shortenerController = require('../controllers/shortenerController');

// ==========================================
// Shorten Link Endpoints
// ==========================================
router.post('/api/shorten', resolveUserId, linkCreationLimiter, shortenerController.handleShortenLink);
router.post('/api/links/shorten', resolveUserId, linkCreationLimiter, shortenerController.handleShortenLink);
router.post('/shorten', resolveUserId, linkCreationLimiter, shortenerController.handleShortenLink);

// ==========================================
// User Links Management
// ==========================================
router.get('/api/links', resolveUserId, shortenerController.handleGetUserLinks);
router.get('/api/user/links', resolveUserId, shortenerController.handleGetUserLinks);
router.get('/links', resolveUserId, shortenerController.handleGetUserLinks);

// ==========================================
// Bridge Page & Verification Gateway
// ==========================================
router.get('/api/bridge/:code', shortenerController.handleGetBridgeData);
router.post('/api/bridge/complete', shortenerController.handleBridgeComplete);
router.post('/api/bridge/impression', shortenerController.handleRecordImpression);

// ==========================================
// Link Status & Operations
// ==========================================
router.post('/api/links/toggle', resolveUserId, shortenerController.handleToggleLink);

// ==========================================
// Delete Link Endpoints
// ==========================================
router.delete('/api/links/:id', resolveUserId, shortenerController.handleDeleteLink);
router.post('/api/links/delete', resolveUserId, shortenerController.handleDeleteLink);

// ==========================================
// Link Analytics & Statistics
// ==========================================
router.get('/api/links/:id/stats', resolveUserId, shortenerController.handleGetLinkStats);

module.exports = router;
