const express = require('express');
const router = express.Router();
const { resolveUserId } = require('../middleware/auth');
const { linkCreationLimiter } = require('../middleware/rateLimiters');
const { 
  handleShortenLink, 
  getUserLinks, 
  toggleLink, 
  deleteLink, 
  getLinkStats 
} = require('../controllers/linkController');

router.post('/shorten', resolveUserId, linkCreationLimiter, handleShortenLink);
router.post('/api/shorten', resolveUserId, linkCreationLimiter, handleShortenLink);
router.post('/links/shorten', resolveUserId, linkCreationLimiter, handleShortenLink);
router.post('/api/links/shorten', resolveUserId, linkCreationLimiter, handleShortenLink);
router.post('/links', resolveUserId, linkCreationLimiter, handleShortenLink);
router.post('/api/links', resolveUserId, linkCreationLimiter, handleShortenLink);
router.post('/shorten-link', resolveUserId, linkCreationLimiter, handleShortenLink);
router.post('/api/shorten-link', resolveUserId, linkCreationLimiter, handleShortenLink);

router.get('/links', resolveUserId, getUserLinks);
router.get('/api/links', resolveUserId, getUserLinks);
router.get('/user/links', resolveUserId, getUserLinks);
router.get('/api/user/links', resolveUserId, getUserLinks);

router.post('/links/toggle', resolveUserId, toggleLink);
router.post('/api/links/toggle', resolveUserId, toggleLink);

router.delete('/links/:id', resolveUserId, deleteLink);
router.delete('/api/links/:id', resolveUserId, deleteLink);
router.post('/links/delete', resolveUserId, deleteLink);
router.post('/api/links/delete', resolveUserId, deleteLink);

router.get('/links/:id/stats', resolveUserId, getLinkStats);
router.get('/api/links/:id/stats', resolveUserId, getLinkStats);

module.exports = router;
