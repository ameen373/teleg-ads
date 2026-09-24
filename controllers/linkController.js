const mongoose = require('mongoose');
const crypto = require('crypto');

// استدعاء ملفات الإعدادات والخدمات بمسارات مباشرة ومحددة
const config = require('../config/env');
const connectDB = require('../config/db');

// استدعاء آمن لـ Redis لضمان عدم توقف السيرفر في حال وجود مشكلة في إعدادات الكاش
let safeRedisDel = async () => {};
try {
  const redisModule = require('../config/redis');
  if (redisModule && typeof redisModule.safeRedisDel === 'function') {
    safeRedisDel = redisModule.safeRedisDel;
  }
} catch (e) {
  console.warn('تنبيه: لم يتم تحميل وحدة Redis في linkController:', e.message);
}

const logger = require('../utils/logger');
const { normalizeAndValidateUrl, isPhishingOrMalicious, buildShortUrl } = require('../utils/helpers');
const { User, Link, Impression } = require('../models');

// جلب نطاق التطبيق من الملف المخصص للإعدادات
const APP_DOMAIN = config?.APP_DOMAIN || config?.CONFIG?.APP_DOMAIN || process.env.APP_DOMAIN;

const handleShortenLink = async (req, res) => {
  try {
    if (typeof connectDB === 'function') await connectDB();

    const { title, targetUrl, url, originalUrl } = req.body || {};
    const rawUrl = targetUrl || url || originalUrl;

    if (!rawUrl) {
      return res.status(400).json({ success: false, error: 'يرجى تقديم رابط صالح لاختصاره' });
    }

    const cleanUrl = typeof normalizeAndValidateUrl === 'function' 
      ? normalizeAndValidateUrl(rawUrl) 
      : rawUrl;

    if (!cleanUrl) {
      return res.status(400).json({ success: false, error: 'الرابط المستهدف غير صالح، يرجى التأكد من كتابة رابط صحيح' });
    }

    if (typeof isPhishingOrMalicious === 'function' && isPhishingOrMalicious(cleanUrl)) {
      return res.status(400).json({ success: false, error: 'الرابط ينتهك معايير الأمان والسياسات' });
    }

    try {
      if (APP_DOMAIN) {
        const domainCheck = new URL(cleanUrl).hostname.toLowerCase();
        const appDomainClean = String(APP_DOMAIN)
          .replace(/^https?:\/\//i, '')
          .split('/')[0]
          .split(':')[0]
          .toLowerCase();

        if (domainCheck === appDomainClean || domainCheck.endsWith('.' + appDomainClean)) {
          return res.status(400).json({ success: false, error: 'لا يمكن اختصار روابط منصة الاختصار نفسها' });
        }
      }
    } catch (e) {
      // التجاهل الآمن في حال فشل تحليل URL
    }

    const shortCode = crypto.randomBytes(3).toString('hex');
    const shortUrl = typeof buildShortUrl === 'function' ? buildShortUrl(shortCode) : `${APP_DOMAIN || ''}/${shortCode}`;
    const publisherTelegramId = req.user?.telegramId ? String(req.user.telegramId) : null;
    
    const rawUserId = req.userId || req.user?._id;
    const targetUserId = (rawUserId && mongoose.Types.ObjectId.isValid(rawUserId)) ? rawUserId : null;

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

    if (targetUserId && User && typeof User.findByIdAndUpdate === 'function') {
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
    if (logger && typeof logger.error === 'function') {
      logger.error('Error in handleShortenLink:', err);
    } else {
      console.error('Error in handleShortenLink:', err);
    }
    return res.status(500).json({ 
      success: false, 
      error: 'حدث خطأ أثناء اختصار الرابط، يرجى المحاولة لاحقاً' 
    });
  }
};

const getUserLinksHelper = async (userOrId) => {
  if (!userOrId) return [];
  if (typeof connectDB === 'function') await connectDB();

  let userId = null;
  let userTelegramId = null;

  if (typeof userOrId === 'object' && userOrId !== null) {
    if (userOrId._id && mongoose.Types.ObjectId.isValid(userOrId._id)) {
      userId = userOrId._id;
    }
    if (userOrId.telegramId) {
      userTelegramId = String(userOrId.telegramId);
    }
  } else if (typeof userOrId === 'string' || typeof userOrId === 'number') {
    if (mongoose.Types.ObjectId.isValid(userOrId)) {
      userId = userOrId;
    } else {
      userTelegramId = String(userOrId);
    }
  }

  const queryConditions = [];
  if (userId) queryConditions.push({ userId });
  if (userTelegramId) {
    queryConditions.push({ publisherTelegramId: userTelegramId });
    queryConditions.push({ telegramId: userTelegramId });
  }

  if (queryConditions.length === 0) return [];

  const rawLinks = await Link.find({ $or: queryConditions }).sort({ createdAt: -1 }).lean();

  return rawLinks.map(link => {
    const totalViews = link.views || 0;
    const validImp = link.validImpressions || 0;
    const ctr = totalViews > 0 ? ((validImp / totalViews) * 100).toFixed(1) : "0.0";
    return { 
      ...link, 
      id: link._id,
      ctr,
      shortUrl: link.shortUrl || (typeof buildShortUrl === 'function' ? buildShortUrl(link.shortCode) : link.shortCode)
    };
  });
};

const getUserLinks = async (req, res, next) => {
  try {
    const userOrId = req.user || req.userId;
    const links = await getUserLinksHelper(userOrId);
    res.json({ success: true, links });
  } catch (err) {
    next(err);
  }
};

// بناء استعلام الأمان للتحقق من هوية صاحب الرابط
const buildUserLinkQuery = (linkId, req) => {
  if (!mongoose.Types.ObjectId.isValid(linkId)) {
    return null;
  }

  const rawUserId = req.userId || req.user?._id;
  const userId = (rawUserId && mongoose.Types.ObjectId.isValid(rawUserId)) ? rawUserId : null;
  const telegramId = req.user?.telegramId ? String(req.user.telegramId) : null;

  const userConditions = [];
  if (userId) userConditions.push({ userId });
  if (telegramId) {
    userConditions.push({ publisherTelegramId: telegramId });
    userConditions.push({ telegramId: telegramId });
  }

  if (userConditions.length === 0) {
    return null;
  }

  return {
    _id: linkId,
    $or: userConditions
  };
};

const toggleLink = async (req, res, next) => {
  try {
    if (typeof connectDB === 'function') await connectDB();
    const linkId = req.body?.linkId || req.body?.id;
    if (!linkId || !mongoose.Types.ObjectId.isValid(linkId)) {
      return res.status(400).json({ success: false, error: 'معرف الرابط غير صالح' });
    }

    const query = buildUserLinkQuery(linkId, req);
    if (!query) {
      return res.status(401).json({ success: false, error: 'غير مصرح للوصول لهذا الرابط' });
    }

    const link = await Link.findOne(query);
    if (!link) {
      return res.status(404).json({ success: false, error: 'الرابط غير موجود أو لا تملك صلاحيات التعديل عليه' });
    }

    link.isActive = !link.isActive;
    await link.save();

    if (typeof safeRedisDel === 'function') {
      await safeRedisDel(`link:data:${link.shortCode}`).catch(() => {});
    }

    res.json({ success: true, isActive: link.isActive });
  } catch (err) {
    next(err);
  }
};

const deleteLink = async (req, res, next) => {
  try {
    if (typeof connectDB === 'function') await connectDB();
    const linkId = req.params?.id || req.body?.linkId || req.body?.id;
    if (!linkId || !mongoose.Types.ObjectId.isValid(linkId)) {
      return res.status(400).json({ success: false, error: 'معرف الرابط غير صالح' });
    }

    const query = buildUserLinkQuery(linkId, req);
    if (!query) {
      return res.status(401).json({ success: false, error: 'غير مصرح للوصول لهذا الرابط' });
    }

    const link = await Link.findOneAndDelete(query);
    if (!link) {
      return res.status(404).json({ success: false, error: 'الرابط غير موجود أو لا تملك صلاحيات حذفه' });
    }

    if (typeof safeRedisDel === 'function') {
      await safeRedisDel(`link:data:${link.shortCode}`).catch(() => {});
    }

    res.json({ success: true, message: 'تم حذف الرابط بنجاح' });
  } catch (err) {
    next(err);
  }
};

const getLinkStats = async (req, res, next) => {
  try {
    if (typeof connectDB === 'function') await connectDB();
    const linkId = req.params?.id;
    if (!linkId || !mongoose.Types.ObjectId.isValid(linkId)) {
      return res.status(400).json({ success: false, error: 'معرف الرابط غير صالح' });
    }

    const query = buildUserLinkQuery(linkId, req);
    if (!query) {
      return res.status(401).json({ success: false, error: 'غير مصرح للوصول لهذا الرابط' });
    }

    const link = await Link.findOne(query).lean();
    if (!link) {
      return res.status(404).json({ success: false, error: 'الرابط غير موجود أو لا تملك صلاحية الوصول إليه' });
    }

    const impressions = (Impression && typeof Impression.find === 'function')
      ? await Impression.find({ linkId: link._id }).sort({ createdAt: -1 }).limit(100).lean()
      : [];
    
    const totalViews = link.views || 0;
    const validImp = link.validImpressions || 0;
    const invalidImp = link.invalidImpressions || 0;
    const ctr = totalViews > 0 ? ((validImp / totalViews) * 100).toFixed(1) : "0.0";

    res.json({
      success: true,
      stats: {
        linkId: link._id,
        shortCode: link.shortCode,
        shortUrl: link.shortUrl || (typeof buildShortUrl === 'function' ? buildShortUrl(link.shortCode) : link.shortCode),
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
};

module.exports = {
  handleShortenLink,
  getUserLinks,
  toggleLink,
  deleteLink,
  getLinkStats
};
