/**
 * Link Shortener & Link Analytics Controller
 */

const mongoose = require('mongoose');
const crypto = require('crypto');

const CONFIG = require('../config/config');
const logger = require('../config/logger');
const connectDB = require('../config/db');
const { safeRedisDel } = require('../config/redis');
const { normalizeAndValidateUrl, buildShortUrl, isPhishingOrMalicious } = require('../utils/urlHelpers');
const { User, Link, Impression } = require('../models');

/**
 * دالة التعرّف الذكي على تصنيف الرابط بناءً على النطاق والامتداد
 */
const detectCategory = (url) => {
  if (!url) return 'general';
  const lowerUrl = url.toLowerCase();

  // 1. الفيديو (Video)
  if (
    lowerUrl.includes('youtube.com') || lowerUrl.includes('youtu.be') ||
    lowerUrl.includes('vimeo.com') || lowerUrl.includes('tiktok.com') ||
    lowerUrl.includes('twitch.tv') || lowerUrl.includes('dailymotion.com') ||
    /\.(mp4|mkv|avi|webm|mov|flv|m3u8)(\?.*)?$/i.test(lowerUrl)
  ) {
    return 'video';
  }

  // 2. التطبيقات والألعاب (App / Game)
  if (
    lowerUrl.includes('play.google.com') || lowerUrl.includes('apps.apple.com') ||
    lowerUrl.includes('steampowered.com') || lowerUrl.includes('epicgames.com') ||
    lowerUrl.includes('apkpure.com') || lowerUrl.includes('uptodown.com') ||
    /\.(apk|xapk|ipa|exe|msi)(\?.*)?$/i.test(lowerUrl)
  ) {
    return 'app_game';
  }

  // 3. الصور (Image)
  if (
    lowerUrl.includes('imgur.com') || lowerUrl.includes('pinterest.com') ||
    lowerUrl.includes('flickr.com') ||
    /\.(jpg|jpeg|png|gif|webp|svg|bmp)(\?.*)?$/i.test(lowerUrl)
  ) {
    return 'image';
  }

  // 4. الملفات والمستندات (File)
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
 * Shorten Link Handler Controller
 */
const handleShortenLink = async (req, res) => {
  try {
    await connectDB();
    const { title, targetUrl, url, originalUrl, category, previewTitle, previewImage, fileSize } = req.body;
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

    // التصنيف الذكي التلقائي
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

/**
 * تسجيل وتتبع زيارات الرابط فورياً وبدون أي قيود أو حظر للزيارات المكررة
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
      return res.status(404).json({ success: false, error: 'الرابط غير موجود أو غير نشط' });
    }

    // القيم الافتراضية للأرباح للزيارات المباشرة
    const publisherEarning = 0.00135; // $1.35 لكل 1000 مشاهدة
    const platformFee = 0.00015;

    // حفظ عملية المشاهدة فورياً في سجل Impressions
    const impression = new Impression({
      linkId: link._id,
      publisherUserId: link.userId,
      publisherTelegramId: link.publisherTelegramId || link.telegramId,
      shortCode: link.shortCode,
      ip: req.ip || req.headers['x-forwarded-for'] || '127.0.0.1',
      userAgent: req.headers['user-agent'] || 'Unknown',
      publisherEarnings: publisherEarning,
      platformFee: platformFee,
      isValid: true
    });
    await impression.save();

    // تحديث إحصائيات الرابط فورياً
    link.views = (link.views || 0) + 1;
    link.clicks = (link.clicks || 0) + 1;
    link.validImpressions = (link.validImpressions || 0) + 1;
    link.totalEarnings = (link.totalEarnings || 0) + publisherEarning;
    await link.save();

    // إضافة الأرباح لرصيد الناشر فورياً
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

    return res.json({
      success: true,
      message: 'تم تسجيل الزيارة واحتساب الأرباح بنجاح',
      earnings: publisherEarning,
      targetUrl: link.targetUrl
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Fetch User Links Helper Utility
 */
const getUserLinksHelper = async (user) => {
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

/**
 * Fetch User Links Controller
 */
const handleGetUserLinks = async (req, res, next) => {
  try {
    const links = await getUserLinksHelper(req.user || req.userId);
    return res.json({ success: true, links });
  } catch (err) {
    next(err);
  }
};

/**
 * Toggle Link Active Status Controller
 */
const handleToggleLink = async (req, res, next) => {
  try {
    await connectDB();
    const linkId = req.body?.linkId || req.body?.id;
    if (!mongoose.Types.ObjectId.isValid(linkId)) return res.status(400).json({ success: false, error: 'معرف الرابط غير صالح' });

    const link = await Link.findOne({ _id: linkId, $or: [{ userId: req.userId }, { publisherTelegramId: req.user.telegramId }] });
    if (!link) return res.status(404).json({ success: false, error: 'الرابط غير موجود أو لا تملك صلاحيات التعديل عليه' });

    link.isActive = !link.isActive;
    await link.save();
    await safeRedisDel(`link:data:${link.shortCode}`);

    return res.json({ success: true, isActive: link.isActive });
  } catch (err) {
    next(err);
  }
};

/**
 * Delete Link Controller
 */
const handleDeleteLink = async (req, res, next) => {
  try {
    await connectDB();
    const linkId = req.params.id || req.body?.linkId || req.body?.id;
    if (!mongoose.Types.ObjectId.isValid(linkId)) {
      return res.status(400).json({ success: false, error: 'معرف الرابط غير صالح' });
    }

    const link = await Link.findOneAndDelete({ _id: linkId, $or: [{ userId: req.userId }, { publisherTelegramId: req.user.telegramId }] });
    if (!link) {
      return res.status(404).json({ success: false, error: 'الرابط غير موجود أو لا تملك صلاحيات حذفه' });
    }

    await safeRedisDel(`link:data:${link.shortCode}`);
    return res.json({ success: true, message: 'تم حذف الرابط بنجاح' });
  } catch (err) {
    next(err);
  }
};

/**
 * Link Detailed Analytics Statistics Controller
 */
const handleGetLinkStats = async (req, res, next) => {
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

    return res.json({
      success: true,
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
  detectCategory
};
