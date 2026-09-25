/**
 * Link Shortener & Link Analytics Router
 */

const express = require('express');
const router = express.Router();
const { resolveUserId } = require('../middleware/auth');
const { linkCreationLimiter } = require('../middleware/traffic');
const shortenerController = require('../controllers/shortenerController');

// Shorten Link Endpoints
router.post('/api/shorten', resolveUserId, linkCreationLimiter, shortenerController.handleShortenLink);
router.post('/shorten', resolveUserId, linkCreationLimiter, shortenerController.handleShortenLink);
router.post('/api/links/shorten', resolveUserId, linkCreationLimiter, shortenerController.handleShortenLink);
router.post('/links/shorten', resolveUserId, linkCreationLimiter, shortenerController.handleShortenLink);
router.post('/api/links', resolveUserId, linkCreationLimiter, shortenerController.handleShortenLink);
router.post('/links', resolveUserId, linkCreationLimiter, shortenerController.handleShortenLink);
router.post('/api/shorten-link', resolveUserId, linkCreationLimiter, shortenerController.handleShortenLink);
router.post('/shorten-link', resolveUserId, linkCreationLimiter, shortenerController.handleShortenLink);

// Fetch User Links Endpoints
router.get('/api/links', resolveUserId, shortenerController.handleGetUserLinks);
router.get('/links', resolveUserId, shortenerController.handleGetUserLinks);
router.get('/api/user/links', resolveUserId, shortenerController.handleGetUserLinks);
router.get('/user/links', resolveUserId, shortenerController.handleGetUserLinks);

// Toggle Link Active Status
router.post('/api/links/toggle', resolveUserId, shortenerController.handleToggleLink);

// Delete Link Endpoints
router.delete('/api/links/:id', resolveUserId, shortenerController.handleDeleteLink);
router.post('/api/links/delete', resolveUserId, shortenerController.handleDeleteLink);

// Link Analytics Statistics
router.get('/api/links/:id/stats', resolveUserId, shortenerController.handleGetLinkStats);

module.exports = router;
