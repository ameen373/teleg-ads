/**
 * Link Shortener & Link Analytics Router
 */

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const crypto = require('crypto');

const CONFIG = require('../config/config');
const logger = require('../config/logger');
const connectDB = require('../config/db');
const { safeRedisDel } = require('../config/redis');
const { normalizeAndValidateUrl, buildShortUrl, isPhishingOrMalicious } = require('../utils/urlHelpers');
const { resolveUserId } = require('../middleware/auth');
const { linkCreationLimiter } = require('../middleware/traffic');
const { User, Link, Impression } = require('../models');

/**
 * Shorten Link Handler
 */
const handleShortenLink = async (req, res) => {
  try {
    await connectDB();
    const { title, targetUrl, url, originalUrl } = req.body;
    const rawUrl = targetUrl || url || originalUrl;
    const cleanUrl = normalizeAndValidateUrl(rawUrl);

    if (!cleanUrl) {
      return res.status(400).json({ success: false, error: 'الرابط المستهدف غير صالح، يرجى التأكد من كتابة رابط صحيح' });
    }

    if (isPhishingOrMalicious(cleanUrl)) {
      return res.status(400).json({ success: false, error: 'الرابط ينتهك معايير الأمان والسياسات' });
    }

    try {
      const domainCheck = new URL(cleanUrl).hostname;
      if (domainCheck.includes(CONFIG.APP_DOMAIN)) {
        return res.status(400).json({ success: false, error: 'لا يمكن اختصار روابط منصة الاختصار نفسها' });
      }
    } catch (e) {}

    const shortCode = crypto.randomBytes(3).toString('hex');
    const shortUrl = buildShortUrl(shortCode);
    const publisherTelegramId = req.user ? String(req.user.telegramId) : null;
    const targetUserId = req.userId;
    
    const newLink = new Link({
      userId: targetUserId,
      publisherTelegramId: publisherTelegramId,
      telegramId: publisherTelegramId,
      title: title ? String(title).trim() : 'رابط بدون عنوان',
      targetUrl: cleanUrl,
      originalUrl: cleanUrl,
      shortCode,
      shortUrl,
      isActive: true
    });

    await newLink.save();

    if (targetUserId) {
      await User.findByIdAndUpdate(targetUserId, { $inc: { 'statsSummary.totalLinksCreated': 1 } }).catch(() => {});
    }

    const linkObj = newLink.toObject ? newLink.toObject() : newLink;

    return res.json({ 
      success: true, 
      message: 'تم اختصار الرابط بنجاح',
      link: {
        ...linkObj,
        id: linkObj._id,
        shortUrl
      },
      shortUrl
    });
  } catch (err) {
    logger.error('Error in handleShortenLink:', err);
    return res.status(500).json({ 
      success: false, 
      error: 'حدث خطأ أثناء اختصار الرابط، يرجى المحاولة لاحقاً' 
    });
  }
};

router.post('/api/shorten', resolveUserId, linkCreationLimiter, handleShortenLink);
router.post('/shorten', resolveUserId, linkCreationLimiter, handleShortenLink);
router.post('/api/links/shorten', resolveUserId, linkCreationLimiter, handleShortenLink);
router.post('/links/shorten', resolveUserId, linkCreationLimiter, handleShortenLink);
router.post('/api/links', resolveUserId, linkCreationLimiter, handleShortenLink);
router.post('/links', resolveUserId, linkCreationLimiter, handleShortenLink);
router.post('/api/shorten-link', resolveUserId, linkCreationLimiter, handleShortenLink);
router.post('/shorten-link', resolveUserId, linkCreationLimiter, handleShortenLink);

/**
 * Fetch User Links Helper
 */
const getUserLinks = async (user) => {
  if (!user) return [];
  await connectDB();

  const userId = user._id || user;
  const userTelegramId = user.telegramId ? String(user.telegramId) : null;

  const queryConditions = [];
  if (userId) queryConditions.push({ userId: userId });
  if (userTelegramId) queryConditions.push({ publisherTelegramId: userTelegramId }, { telegramId: userTelegramId });

  const rawLinks = await Link.find(queryConditions.length > 0 ? { $or: queryConditions } : { userId: userId }).sort({ createdAt: -1 }).lean();

  return rawLinks.map(link => {
    const totalViews = link.views || 0;
    const validImp = link.validImpressions || 0;
    const ctr = totalViews > 0 ? ((validImp / totalViews) * 100).toFixed(1) : "0.0";
    return { 
      ...link, 
      id: link._id,
      ctr,
      shortUrl: link.shortUrl || buildShortUrl(link.shortCode)
    };
  });
};

router.get('/api/links', resolveUserId, async (req, res, next) => {
  try {
    const links = await getUserLinks(req.user || req.userId);
    res.json({ success: true, links });
  } catch (err) {
    next(err);
  }
});

router.get('/links', resolveUserId, async (req, res, next) => {
  try {
    const links = await getUserLinks(req.user || req.userId);
    res.json({ success: true, links });
  } catch (err) {
    next(err);
  }
});

router.get('/api/user/links', resolveUserId, async (req, res, next) => {
  try {
    const links = await getUserLinks(req.user || req.userId);
    res.json({ success: true, links });
  } catch (err) {
    next(err);
  }
});

router.get('/user/links', resolveUserId, async (req, res, next) => {
  try {
    const links = await getUserLinks(req.user || req.userId);
    res.json({ success: true, links });
  } catch (err) {
    next(err);
  }
});

/**
 * Toggle Link Active Status
 */
router.post('/api/links/toggle', resolveUserId, async (req, res, next) => {
  try {
    await connectDB();
    const linkId = req.body?.linkId || req.body?.id;
    if (!mongoose.Types.ObjectId.isValid(linkId)) return res.status(400).json({ success: false, error: 'معرف الرابط غير صالح' });

    const link = await Link.findOne({ _id: linkId, $or: [{ userId: req.userId }, { publisherTelegramId: req.user.telegramId }] });
    if (!link) return res.status(404).json({ success: false, error: 'الرابط غير موجود أو لا تملك صلاحيات التعديل عليه' });

    link.isActive = !link.isActive;
    await link.save();
    await safeRedisDel(`link:data:${link.shortCode}`);

    res.json({ success: true, isActive: link.isActive });
  } catch (err) {
    next(err);
  }
});

/**
 * Delete Link Endpoints
 */
router.delete('/api/links/:id', resolveUserId, async (req, res, next) => {
  try {
    await connectDB();
    const linkId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(linkId)) {
      return res.status(400).json({ success: false, error: 'معرف الرابط غير صالح' });
    }

    const link = await Link.findOneAndDelete({ _id: linkId, $or: [{ userId: req.userId }, { publisherTelegramId: req.user.telegramId }] });
    if (!link) {
      return res.status(404).json({ success: false, error: 'الرابط غير موجود أو لا تملك صلاحيات حذفه' });
    }

    await safeRedisDel(`link:data:${link.shortCode}`);
    res.json({ success: true, message: 'تم حذف الرابط بنجاح' });
  } catch (err) {
    next(err);
  }
});

router.post('/api/links/delete', resolveUserId, async (req, res, next) => {
  try {
    await connectDB();
    const linkId = req.body?.linkId || req.body?.id;
    if (!mongoose.Types.ObjectId.isValid(linkId)) {
      return res.status(400).json({ success: false, error: 'معرف الرابط غير صالح' });
    }

    const link = await Link.findOneAndDelete({ _id: linkId, $or: [{ userId: req.userId }, { publisherTelegramId: req.user.telegramId }] });
    if (!link) {
      return res.status(404).json({ success: false, error: 'الرابط غير موجود أو لا تملك صلاحيات حذفه' });
    }

    await safeRedisDel(`link:data:${link.shortCode}`);
    res.json({ success: true, message: 'تم حذف الرابط بنجاح' });
  } catch (err) {
    next(err);
  }
});

/**
 * Link Detailed Analytics Statistics
 */
router.get('/api/links/:id/stats', resolveUserId, async (req, res, next) => {
  try {
    await connectDB();
    const linkId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(linkId)) {
      return res.status(400).json({ success: false, error: 'معرف الرابط غير صالح' });
    }

    const link = await Link.findOne({ _id: linkId, $or: [{ userId: req.userId }, { publisherTelegramId: req.user.telegramId }] }).lean();
    if (!link) {
      return res.status(404).json({ success: false, error: 'الرابط غير موجود أو لا تملك صلاحية الوصول إليه' });
    }

    const impressions = await Impression.find({ linkId: link._id }).sort({ createdAt: -1 }).limit(100).lean();
    
    const totalViews = link.views || 0;
    const validImp = link.validImpressions || 0;
    const invalidImp = link.invalidImpressions || 0;
    const ctr = totalViews > 0 ? ((validImp / totalViews) * 100).toFixed(1) : "0.0";

    res.json({
      success: true,
      stats: {
        linkId: link._id,
        shortCode: link.shortCode,
        shortUrl: link.shortUrl || buildShortUrl(link.shortCode),
        title: link.title,
        targetUrl: link.targetUrl,
        totalViews,
        validImpressions: validImp,
        invalidImpressions: invalidImp,
        ctr,
        recentImpressions: impressions
      }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
