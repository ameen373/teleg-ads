/**
 * Link Shortener, Ad Delivery & Redirection Analytics Controller
 */

const mongoose = require('mongoose');
const crypto = require('crypto');

const CONFIG = require('../config/config');
const logger = require('../config/logger');
const connectDB = require('../config/db');
const { safeRedisGet, safeRedisSet, safeRedisDel } = require('../config/redis');

const { 
  normalizeAndValidateUrl, 
  buildShortUrl, 
  isPhishingOrMalicious,
  getRealIp,
  getGeoLocation,
  getDeviceType,
  generateBridgeToken,
  verifyBridgeToken
} = require('../utils/urlHelpers');

const { User, Link, Impression, Ad, Campaign } = require('../models');

const selectSmartAd = async (country, device, category) => {
  try {
    let adModel = Ad || Campaign;
    if (!adModel && mongoose.models) {
      adModel = mongoose.models.Ad || mongoose.models.Campaign;
    }

    if (adModel) {
      const query = {
        isActive: true,
        $or: [
          { status: 'active' },
          { status: { $exists: false } }
        ],
        $and: [
          {
            $or: [
              { targetCountries: { $in: [country, 'ALL'] } },
              { targetCountries: { $size: 0 } },
              { country: country },
              { country: 'ALL' },
              { targetCountries: { $exists: false } }
            ]
          },
          {
            $or: [
              { targetDevices: { $in: [device, 'all'] } },
              { targetDevices: { $size: 0 } },
              { device: device },
              { device: 'all' },
              { targetDevices: { $exists: false } }
            ]
          }
        ]
      };

      const candidates = await adModel.find(query).sort({ cpm: -1, createdAt: -1 }).limit(10).lean();

      if (candidates && candidates.length > 0) {
        const randomIndex = Math.floor(Math.random() * candidates.length);
        const selected = candidates[randomIndex];
        return {
          id: selected._id,
          title: selected.title || 'إعلان مميز',
          description: selected.description || 'انقر لمشاهدة التفاصيل والعرض الخاص',
          mediaUrl: selected.bannerUrl || selected.mediaUrl || selected.imageUrl || '',
          targetUrl: selected.targetUrl || selected.url || 'https://telega-ads.com',
          type: selected.type || selected.format || 'banner',
          cpm: selected.cpm || 1.50
        };
      }
    }
  } catch (err) {
    if (logger && typeof logger.warn === 'function') {
      logger.warn('Warning in selectSmartAd:', err.message);
    }
  }

  return {
    id: 'fallback_telega_ad',
    title: 'انضم إلى منصة Telega-Ads الإعلانية',
    description: 'اختصر روابطك وشاركها لتحقيق أفضل عائد لكل 1000 مشاهدة بكل سهولة!',
    mediaUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&q=80',
    targetUrl: 'https://telega-ads.com',
    type: 'banner',
    cpm: 1.00
  };
};

const detectCategory = (url) => {
  if (!url) return 'general';
  const lowerUrl = url.toLowerCase();

  if (
    lowerUrl.includes('youtube.com') || lowerUrl.includes('youtu.be') ||
    lowerUrl.includes('vimeo.com') || lowerUrl.includes('tiktok.com') ||
    lowerUrl.includes('twitch.tv') || lowerUrl.includes('dailymotion.com') ||
    /\.(mp4|mkv|avi|webm|mov|flv|m3u8)(\?.*)?$/i.test(lowerUrl)
  ) {
    return 'video';
  }

  if (
    lowerUrl.includes('play.google.com') || lowerUrl.includes('apps.apple.com') ||
    lowerUrl.includes('steampowered.com') || lowerUrl.includes('epicgames.com') ||
    lowerUrl.includes('apkpure.com') || lowerUrl.includes('uptodown.com') ||
    /\.(apk|xapk|ipa|exe|msi)(\?.*)?$/i.test(lowerUrl)
  ) {
    return 'app_game';
  }

  if (
    lowerUrl.includes('imgur.com') || lowerUrl.includes('pinterest.com') ||
    lowerUrl.includes('flickr.com') ||
    /\.(jpg|jpeg|png|gif|webp|svg|bmp)(\?.*)?$/i.test(lowerUrl)
  ) {
    return 'image';
  }

  if (
    lowerUrl.includes('drive.google.com') || lowerUrl.includes('mediafire.com') ||
    lowerUrl.includes('mega.nz') || lowerUrl.includes('dropbox.com') ||
    lowerUrl.includes('archive.org') ||
    /\.(pdf|zip|rar|7z|doc|docx|xls|xlsx|ppt|pptx|txt|iso|tar|gz)(\?.*)?$/i.test(lowerUrl)
  ) {
    return 'file';
  }

  return 'general';
};

/**
 * Shorten Link Handler
 */
const handleShortenLink = async (req, res) => {
  try {
    await connectDB();
    const { title, targetUrl, url, originalUrl, category, previewTitle, previewImage, fileSize } = req.body;
    const rawUrl = targetUrl || url || originalUrl;
    const cleanUrl = normalizeAndValidateUrl(rawUrl);

    if (!cleanUrl) {
      return res.status(400).json({ success: false, message: 'الرابط المستهدف غير صالح، يرجى التأكد من كتابة رابط صحيح' });
    }

    if (isPhishingOrMalicious(cleanUrl)) {
      return res.status(400).json({ success: false, message: 'الرابط ينتهك معايير الأمان والسياسات' });
    }

    try {
      const domainCheck = new URL(cleanUrl).hostname;
      if (domainCheck.includes(CONFIG.APP_DOMAIN)) {
        return res.status(400).json({ success: false, message: 'لا يمكن اختصار روابط منصة الاختصار نفسها' });
      }
    } catch (e) {}

    const detectedCategory = category || detectCategory(cleanUrl);
    const shortCode = crypto.randomBytes(3).toString('hex');
    const shortUrl = buildShortUrl(shortCode);
    const publisherTelegramId = req.user ? String(req.user.telegramId) : null;
    const targetUserId = req.userId;

    const finalTitle = title ? String(title).trim() : (previewTitle || 'رابط مختصر');

    const newLink = new Link({
      userId: targetUserId,
      publisherTelegramId: publisherTelegramId,
      telegramId: publisherTelegramId,
      title: finalTitle,
      targetUrl: cleanUrl,
      originalUrl: cleanUrl,
      shortCode,
      shortUrl,
      category: detectedCategory,
      previewTitle: previewTitle ? String(previewTitle).trim() : finalTitle,
      previewImage: previewImage ? String(previewImage).trim() : '',
      fileSize: fileSize ? String(fileSize).trim() : '',
      isActive: true
    });

    await newLink.save();

    if (targetUserId) {
      await User.findByIdAndUpdate(targetUserId, { $inc: { 'statsSummary.totalLinksCreated': 1 } }).catch(() => {});
    }

    const linkObj = newLink.toObject ? newLink.toObject() : newLink;

    await safeRedisSet(`link:data:${shortCode}`, JSON.stringify(linkObj), 'EX', 600);

    return res.json({ 
      success: true, 
      message: 'تم اختصار الرابط بنجاح',
      shortCode,
      shortUrl,
      link: {
        ...linkObj,
        id: linkObj._id,
        shortUrl
      }
    });
  } catch (err) {
    if (logger && typeof logger.error === 'function') {
      logger.error('Error in handleShortenLink:', err);
    }
    return res.status(500).json({ 
      success: false, 
      message: 'حدث خطأ أثناء اختصار الرابط، يرجى المحاولة لاحقاً' 
    });
  }
};

/**
 * Get Bridge Page Data
 */
const handleGetBridgeData = async (req, res, next) => {
  try {
    await connectDB();
    const { code } = req.params;

    if (!code) {
      return res.status(400).json({ success: false, message: 'كود الرابط غير موجود' });
    }

    let link = null;
    const cachedLink = await safeRedisGet(`link:data:${code}`);

    if (cachedLink) {
      link = JSON.parse(cachedLink);
    } else {
      link = await Link.findOne({ shortCode: code, isActive: true }).lean();
      if (link) {
        await safeRedisSet(`link:data:${code}`, JSON.stringify(link), 'EX', 300);
      }
    }

    if (!link || !link.isActive) {
      return res.status(404).json({ success: false, message: 'الرابط المطلوب غير موجود أو غير نشط' });
    }

    const clientIp = getRealIp(req);
    const country = getGeoLocation(req, clientIp);
    const device = getDeviceType(req.headers['user-agent']);

    const token = generateBridgeToken(code, clientIp, 300);
    const matchedAd = await selectSmartAd(country, device, link.category);

    return res.json({
      success: true,
      message: "تم تجهيز بيانات التوجيه",
      shortCode: code,
      targetUrl: link.targetUrl,
      originalUrl: link.targetUrl,
      token,
      timer: 5,
      category: link.category,
      title: link.title,
      previewTitle: link.previewTitle || link.title,
      previewImage: link.previewImage || '',
      fileSize: link.fileSize || '',
      ad: matchedAd
    });
  } catch (err) {
    if (logger && typeof logger.error === 'function') {
      logger.error('Error in handleGetBridgeData:', err);
    }
    next(err);
  }
};

/**
 * Handle Bridge Completion
 */
const handleBridgeComplete = async (req, res, next) => {
  try {
    await connectDB();
    const { shortCode, token, duration, interactionProof, fingerprint } = req.body || {};

    if (!shortCode || !token) {
      return res.status(400).json({ success: false, message: 'بيانات التوثيق غير كاملة' });
    }

    const clientIp = getRealIp(req);
    const country = getGeoLocation(req, clientIp);
    const device = getDeviceType(req.headers['user-agent']);

    const tokenCheck = verifyBridgeToken(token, shortCode, clientIp);
    if (!tokenCheck.valid) {
      return res.status(403).json({ success: false, message: tokenCheck.error || 'رمز التوثيق غير صالح' });
    }

    const spentDuration = parseInt(duration, 10) || 0;
    if (spentDuration < 2) {
      return res.status(400).json({ success: false, message: 'لم يتم قضاء وقت كافٍ لتأكيد الزيارة' });
    }

    const link = await Link.findOne({ shortCode, isActive: true });
    if (!link) {
      return res.status(404).json({ success: false, message: 'الرابط المستهدف غير موجود' });
    }

    const publisherEarning = 0.00135;
    const platformFee = 0.00015;

    const impression = new Impression({
      linkId: link._id,
      publisherUserId: link.userId,
      publisherTelegramId: link.publisherTelegramId || link.telegramId,
      shortCode: link.shortCode,
      ip: clientIp,
      country,
      device,
      userAgent: req.headers['user-agent'] || 'Unknown',
      publisherEarnings: publisherEarning,
      platformFee: platformFee,
      fingerprint: fingerprint || '',
      isValid: true
    });
    await impression.save();

    link.views = (link.views || 0) + 1;
    link.validImpressions = (link.validImpressions || 0) + 1;
    link.totalEarnings = (link.totalEarnings || 0) + publisherEarning;
    await link.save();

    if (link.userId) {
      await User.findByIdAndUpdate(link.userId, {
        $inc: {
          'statsSummary.totalViews': 1,
          'statsSummary.totalEarnings': publisherEarning,
          totalEarnings: publisherEarning,
          availableBalance: publisherEarning
        }
      }).catch(() => {});
    }

    await safeRedisDel(`link:data:${shortCode}`);

    return res.json({
      success: true,
      message: 'تم التوثيق بنجاح',
      targetUrl: link.targetUrl
    });
  } catch (err) {
    if (logger && typeof logger.error === 'function') {
      logger.error('Error in handleBridgeComplete:', err);
    }
    next(err);
  }
};

/**
 * Handle Record Impression
 */
const handleRecordImpression = async (req, res, next) => {
  try {
    await connectDB();
    const { shortCode, linkId } = req.body || req.params;

    let link = null;
    if (linkId && mongoose.Types.ObjectId.isValid(linkId)) {
      link = await Link.findById(linkId);
    } else if (shortCode) {
      link = await Link.findOne({ shortCode, isActive: true });
    }

    if (!link) {
      return res.status(404).json({ success: false, message: 'الرابط غير موجود أو غير نشط' });
    }

    const publisherEarning = 0.00135;
    const platformFee = 0.00015;

    const impression = new Impression({
      linkId: link._id,
      publisherUserId: link.userId,
      publisherTelegramId: link.publisherTelegramId || link.telegramId,
      shortCode: link.shortCode,
      ip: getRealIp(req),
      userAgent: req.headers['user-agent'] || 'Unknown',
      publisherEarnings: publisherEarning,
      platformFee: platformFee,
      isValid: true
    });
    await impression.save();

    link.views = (link.views || 0) + 1;
    link.clicks = (link.clicks || 0) + 1;
    link.validImpressions = (link.validImpressions || 0) + 1;
    link.totalEarnings = (link.totalEarnings || 0) + publisherEarning;
    await link.save();

    if (link.userId) {
      await User.findByIdAndUpdate(link.userId, {
        $inc: {
          'statsSummary.totalViews': 1,
          'statsSummary.totalEarnings': publisherEarning,
          totalEarnings: publisherEarning,
          availableBalance: publisherEarning
        }
      }).catch(() => {});
    }

    if (link.shortCode) {
      await safeRedisDel(`link:data:${link.shortCode}`);
    }

    return res.json({
      success: true,
      message: 'تم تسجيل الزيارة واحتساب الأرباح بنجاح',
      earnings: publisherEarning,
      targetUrl: link.targetUrl
    });
  } catch (err) {
    if (logger && typeof logger.error === 'function') {
      logger.error('Error in handleRecordImpression:', err);
    }
    next(err);
  }
};

/**
 * Get User Links
 */
const handleGetUserLinks = async (req, res, next) => {
  try {
    await connectDB();
    const targetUserId = req.userId;
    const targetTgId = req.user ? String(req.user.telegramId) : null;

    const queryConditions = [];
    if (targetUserId) queryConditions.push({ userId: targetUserId });
    if (targetTgId) queryConditions.push({ publisherTelegramId: targetTgId }, { telegramId: targetTgId });

    const rawLinks = await Link.find(queryConditions.length > 0 ? { $or: queryConditions } : { userId: targetUserId }).sort({ createdAt: -1 }).lean();

    const links = rawLinks.map(link => {
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

    return res.json({ success: true, message: "تم جلب الروابط بنجاح", links });
  } catch (err) {
    if (logger && typeof logger.error === 'function') {
      logger.error('Error in handleGetUserLinks:', err);
    }
    next(err);
  }
};

const handleToggleLink = async (req, res, next) => {
  try {
    await connectDB();
    const linkId = req.body?.linkId || req.body?.id;
    if (!mongoose.Types.ObjectId.isValid(linkId)) return res.status(400).json({ success: false, message: 'معرف الرابط غير صالح' });

    const link = await Link.findOne({ _id: linkId, $or: [{ userId: req.userId }, { publisherTelegramId: req.user?.telegramId }] });
    if (!link) return res.status(404).json({ success: false, message: 'الرابط غير موجود أو لا تملك صلاحيات التعديل عليه' });

    link.isActive = !link.isActive;
    await link.save();
    await safeRedisDel(`link:data:${link.shortCode}`);

    return res.json({ success: true, message: "تم تحديث حالة الرابط", isActive: link.isActive });
  } catch (err) {
    if (logger && typeof logger.error === 'function') {
      logger.error('Error in handleToggleLink:', err);
    }
    next(err);
  }
};

const handleDeleteLink = async (req, res, next) => {
  try {
    await connectDB();
    const linkId = req.params.id || req.body?.linkId || req.body?.id;
    if (!mongoose.Types.ObjectId.isValid(linkId)) {
      return res.status(400).json({ success: false, message: 'معرف الرابط غير صالح' });
    }

    const link = await Link.findOneAndDelete({ _id: linkId, $or: [{ userId: req.userId }, { publisherTelegramId: req.user?.telegramId }] });
    if (!link) {
      return res.status(404).json({ success: false, message: 'الرابط غير موجود أو لا تملك صلاحيات حذفه' });
    }

    await safeRedisDel(`link:data:${link.shortCode}`);
    return res.json({ success: true, message: 'تم حذف الرابط بنجاح' });
  } catch (err) {
    if (logger && typeof logger.error === 'function') {
      logger.error('Error in handleDeleteLink:', err);
    }
    next(err);
  }
};

const handleGetLinkStats = async (req, res, next) => {
  try {
    await connectDB();
    const linkId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(linkId)) {
      return res.status(400).json({ success: false, message: 'معرف الرابط غير صالح' });
    }

    const link = await Link.findOne({ _id: linkId, $or: [{ userId: req.userId }, { publisherTelegramId: req.user?.telegramId }] }).lean();
    if (!link) {
      return res.status(404).json({ success: false, message: 'الرابط غير موجود أو لا تملك صلاحية الوصول إليه' });
    }

    const impressions = await Impression.find({ linkId: link._id }).sort({ createdAt: -1 }).limit(100).lean();

    const totalViews = link.views || 0;
    const validImp = link.validImpressions || 0;
    const invalidImp = link.invalidImpressions || 0;
    const ctr = totalViews > 0 ? ((validImp / totalViews) * 100).toFixed(1) : "0.0";

    return res.json({
      success: true,
      message: "تم جلب إحصائيات الرابط بنجاح",
      stats: {
        linkId: link._id,
        shortCode: link.shortCode,
        shortUrl: link.shortUrl || buildShortUrl(link.shortCode),
        title: link.title,
        targetUrl: link.targetUrl,
        category: link.category,
        previewTitle: link.previewTitle,
        previewImage: link.previewImage,
        fileSize: link.fileSize,
        totalViews,
        validImpressions: validImp,
        invalidImpressions: invalidImp,
        ctr,
        recentImpressions: impressions
      }
    });
  } catch (err) {
    if (logger && typeof logger.error === 'function') {
      logger.error('Error in handleGetLinkStats:', err);
    }
    next(err);
  }
};

module.exports = {
  handleShortenLink,
  handleGetUserLinks,
  handleToggleLink,
  handleDeleteLink,
  handleGetLinkStats,
  handleRecordImpression,
  handleGetBridgeData,
  handleBridgeComplete,
  selectSmartAd,
  detectCategory
};
