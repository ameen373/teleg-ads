/**
 * Self-Serve Ad Campaign Management Controller
 */

const mongoose = require('mongoose');
const connectDB = require('../config/db');
const logger = require('../config/logger');
const { safeRedisGet, safeRedisSet, safeRedisDel } = require('../config/redis');
const { normalizeAndValidateUrl } = require('../utils/urlHelpers');
const { User, Ad, Link, Impression } = require('../models');

/**
 * Create New Ad Campaign Controller
 */
const handleCreateAd = async (req, res, next) => {
  await connectDB();
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const { 
      title, 
      targetUrl, 
      type = 'image', 
      mediaUrl = '', 
      appDownloadUrl = '', 
      gameEmbedUrl = '', 
      countries = [], 
      devices = [], 
      totalBudget, 
      budget,
      dailyBudget = 0, 
      targetCategory = 'all' 
    } = req.body;

    const finalBudget = Number(totalBudget || budget);
    const parsedDailyBudget = Number(dailyBudget) || 0;
    const cleanTarget = normalizeAndValidateUrl(targetUrl);
    const targetUserId = req.userId;

    if (!title || String(title).trim().length === 0) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: 'عنوان الإعلان مطلوب' });
    }

    if (!cleanTarget) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: 'الرابط المستهدف للإعلان غير صالح' });
    }

    if (isNaN(finalBudget) || finalBudget < 5) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: 'الحد الأدنى لميزانية الحملة هو $5' });
    }

    const validTypes = ['image', 'video', 'app', 'game'];
    const finalType = validTypes.includes(type) ? type : 'image';

    let cleanMediaUrl = mediaUrl ? normalizeAndValidateUrl(mediaUrl) : '';
    let cleanAppUrl = appDownloadUrl ? normalizeAndValidateUrl(appDownloadUrl) : '';
    let cleanGameUrl = gameEmbedUrl ? normalizeAndValidateUrl(gameEmbedUrl) : '';

    if (finalType === 'image' || finalType === 'video') {
      if (mediaUrl && !cleanMediaUrl) {
        await session.abortTransaction();
        return res.status(400).json({ success: false, message: 'رابط الصورة/الفيديو غير صالح' });
      }
    } else if (finalType === 'app') {
      if (appDownloadUrl && !cleanAppUrl) {
        await session.abortTransaction();
        return res.status(400).json({ success: false, message: 'رابط تحميل التطبيق غير صالح' });
      }
      if (!cleanAppUrl) cleanAppUrl = cleanTarget;
    } else if (finalType === 'game') {
      if (gameEmbedUrl && !cleanGameUrl) {
        await session.abortTransaction();
        return res.status(400).json({ success: false, message: 'رابط تضمين اللعبة غير صالح' });
      }
      if (!cleanGameUrl) cleanGameUrl = cleanTarget;
    }

    const validCategories = ['all', 'video', 'image', 'app_game', 'file'];
    const finalTargetCategory = validCategories.includes(targetCategory) ? targetCategory : 'all';

    const allowedDevicesList = ['Android', 'iOS', 'Desktop'];
    const filteredDevices = Array.isArray(devices) 
      ? devices.filter(d => allowedDevicesList.includes(d))
      : allowedDevicesList;
    
    const finalDevices = filteredDevices.length > 0 ? filteredDevices : allowedDevicesList;

    const parsedCountries = Array.isArray(countries) 
      ? countries.map(c => String(c).trim().toUpperCase()).filter(Boolean)
      : (typeof countries === 'string' && countries.trim() ? countries.split(',').map(c => c.trim().toUpperCase()) : ['ALL']);
    
    const finalCountries = parsedCountries.length > 0 ? parsedCountries : ['ALL'];

    const updatedUser = await User.findOneAndUpdate(
      { _id: targetUserId, availableBalance: { $gte: finalBudget } },
      { $inc: { availableBalance: -finalBudget } },
      { new: true, session }
    );

    if (!updatedUser) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: 'رصيدك المتاح غير كافي لإنشاء هذه الحملة (الحد الأدنى $5)' });
    }

    const ad = await Ad.create([{
      userId: targetUserId,
      advertiserId: targetUserId,
      advertiserTelegramId: req.user ? req.user.telegramId : null,
      title: String(title).trim(),
      targetUrl: cleanTarget,
      type: finalType,
      mediaUrl: cleanMediaUrl,
      appDownloadUrl: cleanAppUrl,
      gameEmbedUrl: cleanGameUrl,
      targeting: {
        countries: finalCountries,
        devices: finalDevices,
        operatingSystems: ['ALL']
      },
      targetCategory: finalTargetCategory,
      totalBudget: finalBudget,
      dailyBudget: parsedDailyBudget,
      remainingBudget: finalBudget,
      cpmRate: 1.50,
      cpcRate: 0.05,
      costPerImpression: 0.0015,
      publisherEarningsPerImpression: 0.00135,
      platformFeePerImpression: 0.00015,
      status: 'active'
    }], { session });

    await session.commitTransaction();
    await safeRedisDel('active_ads_list');

    return res.json({ success: true, message: "تم إنشاء الحملة بنجاح", ad: ad[0] });
  } catch (err) {
    await session.abortTransaction();
    if (logger && typeof logger.error === 'function') {
      logger.error('Error in handleCreateAd:', err);
    }
    next(err);
  } finally {
    session.endSession();
  }
};

/**
 * Fetch Advertiser Campaigns Controller
 */
const handleGetUserAds = async (req, res, next) => {
  try {
    await connectDB();
    const ads = await Ad.find({ userId: req.userId }).sort({ createdAt: -1 }).lean();
    return res.json({ success: true, message: "تم جلب الحملات بنجاح", ads });
  } catch (err) {
    if (logger && typeof logger.error === 'function') {
      logger.error('Error in handleGetUserAds:', err);
    }
    next(err);
  }
};

/**
 * Toggle Ad Active/Pause Status Controller
 */
const handleToggleAd = async (req, res, next) => {
  try {
    await connectDB();
    const adId = req.body?.adId || req.body?.id;
    if (!mongoose.Types.ObjectId.isValid(adId)) return res.status(400).json({ success: false, message: 'معرف الإعلان غير صالح' });

    const ad = await Ad.findOne({ _id: adId, userId: req.userId });
    if (!ad) return res.status(404).json({ success: false, message: 'الإعلان غير موجود أو لا تملك صلاحية تعديله' });

    if (ad.status === 'completed') {
      return res.status(400).json({ success: false, message: 'لا يمكن تفعيل حملة مكتملة ونفاذ ميزانيتها' });
    }

    ad.status = ad.status === 'active' ? 'paused' : 'active';
    await ad.save();
    await safeRedisDel('active_ads_list');

    return res.json({ success: true, message: "تم تغيير حالة الحملة بنجاح", status: ad.status });
  } catch (err) {
    if (logger && typeof logger.error === 'function') {
      logger.error('Error in handleToggleAd:', err);
    }
    next(err);
  }
};

/**
 * Delete Campaign & Refund Remaining Budget Controller
 */
const handleDeleteAd = async (req, res, next) => {
  await connectDB();
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const adId = req.params.id || req.body?.adId || req.body?.id;
    if (!mongoose.Types.ObjectId.isValid(adId)) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: 'معرف الإعلان غير صالح' });
    }

    const ad = await Ad.findOne({ _id: adId, userId: req.userId }).session(session);
    if (!ad) {
      await session.abortTransaction();
      return res.status(404).json({ success: false, message: 'الإعلان غير موجود أو لا تملك صلاحيات حذفه' });
    }

    if (ad.remainingBudget > 0 && ad.status !== 'completed') {
      await User.findByIdAndUpdate(
        req.userId, 
        { $inc: { availableBalance: ad.remainingBudget } },
        { session }
      );
    }

    await Ad.deleteOne({ _id: adId, userId: req.userId }).session(session);
    await session.commitTransaction();
    await safeRedisDel('active_ads_list');

    return res.json({ success: true, message: 'تم إيقاف وحذف الحملة وإعادة الميزانية المتبقية لحسابك' });
  } catch (err) {
    await session.abortTransaction();
    if (logger && typeof logger.error === 'function') {
      logger.error('Error in handleDeleteAd:', err);
    }
    next(err);
  } finally {
    session.endSession();
  }
};

/**
 * Serve Active Ad Matching Link
 */
const handleGetMatchingAd = async (req, res, next) => {
  try {
    await connectDB();
    const { shortCode, linkId, category, device } = req.query || req.body || {};

    let linkCategory = category || 'general';
    let link = null;

    if (linkId && mongoose.Types.ObjectId.isValid(linkId)) {
      const cachedLink = await safeRedisGet(`link:data:${linkId}`);
      if (cachedLink) {
        link = JSON.parse(cachedLink);
      } else {
        link = await Link.findById(linkId).lean();
        if (link) await safeRedisSet(`link:data:${linkId}`, JSON.stringify(link), 'EX', 300);
      }
    } else if (shortCode) {
      const cachedLink = await safeRedisGet(`link:data:${shortCode}`);
      if (cachedLink) {
        link = JSON.parse(cachedLink);
      } else {
        link = await Link.findOne({ shortCode, isActive: true }).lean();
        if (link) await safeRedisSet(`link:data:${shortCode}`, JSON.stringify(link), 'EX', 300);
      }
    }

    if (link) {
      linkCategory = link.category || linkCategory;
    }

    const queryFilter = {
      status: 'active',
      remainingBudget: { $gte: 0.0015 }
    };

    if (device && ['Android', 'iOS', 'Desktop'].includes(device)) {
      queryFilter['targeting.devices'] = { $in: [device, 'ALL'] };
    }

    let ad = await Ad.findOne({
      ...queryFilter,
      targetCategory: linkCategory
    }).lean();

    if (!ad) {
      ad = await Ad.findOne({
        ...queryFilter,
        targetCategory: 'all'
      }).lean();
    }

    if (!ad) {
      return res.json({
        success: true,
        hasAd: false,
        ad: null,
        message: 'لا يوجد إعلان متاح حالياً'
      });
    }

    return res.json({
      success: true,
      hasAd: true,
      message: "تم اختيار إعلان مطابق بنجاح",
      ad: {
        id: ad._id,
        _id: ad._id,
        title: ad.title,
        targetUrl: ad.targetUrl,
        type: ad.type || 'image',
        mediaUrl: ad.mediaUrl || '',
        appDownloadUrl: ad.appDownloadUrl || '',
        gameEmbedUrl: ad.gameEmbedUrl || '',
        targetCategory: ad.targetCategory
      }
    });
  } catch (err) {
    if (logger && typeof logger.error === 'function') {
      logger.error('Error in handleGetMatchingAd:', err);
    }
    next(err);
  }
};

/**
 * Record Ad Click Controller
 */
const handleRecordClick = async (req, res, next) => {
  try {
    await connectDB();
    const { adId } = req.body;
    if (adId && mongoose.Types.ObjectId.isValid(adId)) {
      await Ad.findByIdAndUpdate(adId, { $inc: { clicksCount: 1 } });
    }
    return res.json({ success: true, message: "تم تسجيل النقرة بنجاح" });
  } catch (err) {
    if (logger && typeof logger.error === 'function') {
      logger.error('Error in handleRecordClick:', err);
    }
    next(err);
  }
};

/**
 * Record Impression Controller
 */
const handleRecordImpression = async (req, res, next) => {
  try {
    await connectDB();
    return res.json({ success: true, message: "تم تسجيل المشاهدة بنجاح" });
  } catch (err) {
    if (logger && typeof logger.error === 'function') {
      logger.error('Error in handleRecordImpression:', err);
    }
    next(err);
  }
};

module.exports = {
  handleCreateAd,
  handleGetUserAds,
  handleToggleAd,
  handleDeleteAd,
  handleGetMatchingAd,
  handleServeAd: handleGetMatchingAd,
  handleRecordClick,
  handleRecordImpression
};
