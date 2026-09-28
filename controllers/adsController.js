/**
 * Self-Serve Ad Campaign Management Controller
 */

const mongoose = require('mongoose');

const connectDB = require('../config/db');
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
    const { title, targetUrl, totalBudget, targetCategory } = req.body;
    const budget = Number(totalBudget);
    const cleanTarget = normalizeAndValidateUrl(targetUrl);
    const targetUserId = req.userId;

    if (!title || String(title).trim().length === 0) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, error: 'عنوان الإعلان مطلوب' });
    }

    if (!cleanTarget) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, error: 'الرابط المستهدف للإعلان غير صالح' });
    }

    if (isNaN(budget) || budget < 5) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, error: 'الحد الأدنى لميزانية الحملة هو $5' });
    }

    const validCategories = ['all', 'video', 'image', 'app_game', 'file'];
    const finalTargetCategory = validCategories.includes(targetCategory) ? targetCategory : 'all';

    const updatedUser = await User.findOneAndUpdate(
      { _id: targetUserId, availableBalance: { $gte: budget } },
      { $inc: { availableBalance: -budget } },
      { new: true, session }
    );

    if (!updatedUser) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, error: 'رصيدك المتاح غير كافي لإنشاء هذه الحملة (الحد الأدنى $5)' });
    }

    const ad = await Ad.create([{
      userId: targetUserId,
      advertiserId: targetUserId,
      advertiserTelegramId: req.user ? req.user.telegramId : null,
      title: String(title).trim(),
      targetUrl: cleanTarget,
      targetCategory: finalTargetCategory,
      totalBudget: budget,
      remainingBudget: budget,
      cpmRate: 1.50,
      costPerImpression: 0.0015,
      publisherEarningsPerImpression: 0.00135,
      platformFeePerImpression: 0.00015,
      status: 'active'
    }], { session });

    await session.commitTransaction();
    return res.json({ success: true, ad: ad[0] });
  } catch (err) {
    await session.abortTransaction();
    next(err);
  } finally {
    session.endSession();
  }
};

/**
 * جلب الإعلان المطابق لنوع الرابط واحتساب مشاهدته وأرباحه فورياً
 */
const handleGetMatchingAd = async (req, res, next) => {
  try {
    await connectDB();
    const { shortCode, linkId, category } = req.query || req.body || {};

    let linkCategory = category || 'general';
    let link = null;

    // البحث عن الرابط لمعرفة نوعه
    if (linkId && mongoose.Types.ObjectId.isValid(linkId)) {
      link = await Link.findById(linkId);
    } else if (shortCode) {
      link = await Link.findOne({ shortCode, isActive: true });
    }

    if (link) {
      linkCategory = link.category || linkCategory;
    }

    // البحث عن الإعلان المناسب (أولوية للنوع المطابق للرابط، ثم الإعلانات العامة 'all')
    let ad = await Ad.findOne({
      status: 'active',
      remainingBudget: { $gte: 0.0015 },
      targetCategory: linkCategory
    });

    if (!ad) {
      ad = await Ad.findOne({
        status: 'active',
        remainingBudget: { $gte: 0.0015 },
        targetCategory: 'all'
      });
    }

    if (!ad) {
      // إعلان افتراضي في حال عدم وجود إعلانات نشطة
      return res.json({
        success: true,
        hasAd: false,
        ad: null,
        message: 'لا يوجد إعلان متاح حالياً'
      });
    }

    // التكلفة فورية وبدون قيود
    const cost = ad.costPerImpression || 0.0015;
    const publisherEarning = ad.publisherEarningsPerImpression || 0.00135;
    const platformFee = ad.platformFeePerImpression || 0.00015;

    // خصم التكلفة من ميزانية الإعلان وتحديث المشاهدات
    ad.remainingBudget = Math.max(0, ad.remainingBudget - cost);
    ad.impressionsCount = (ad.impressionsCount || 0) + 1;
    if (ad.remainingBudget < cost) {
      ad.status = 'completed';
    }
    await ad.save();

    // احتساب الأرباح للناشر والرابط فورياً
    if (link) {
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

      // توثيق المشاهدة فورياً في سجل المشاهدات
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
    }

    return res.json({
      success: true,
      hasAd: true,
      ad: {
        id: ad._id,
        title: ad.title,
        targetUrl: ad.targetUrl,
        targetCategory: ad.targetCategory
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Fetch Advertiser Campaigns Controller
 */
const handleGetUserAds = async (req, res, next) => {
  try {
    await connectDB();
    const ads = await Ad.find({ userId: req.userId }).sort({ createdAt: -1 }).lean();
    return res.json({ success: true, ads });
  } catch (err) {
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
    if (!mongoose.Types.ObjectId.isValid(adId)) return res.status(400).json({ success: false, error: 'معرف الإعلان غير صالح' });

    const ad = await Ad.findOne({ _id: adId, userId: req.userId });
    if (!ad) return res.status(404).json({ success: false, error: 'الإعلان غير موجود أو لا تملك صلاحية تعديله' });

    if (ad.status === 'completed') {
      return res.status(400).json({ success: false, error: 'لا يمكن تفعيل حملة مكتملة ونفاذ ميزانيتها' });
    }

    ad.status = ad.status === 'active' ? 'paused' : 'active';
    await ad.save();

    return res.json({ success: true, status: ad.status });
  } catch (err) {
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
      return res.status(400).json({ success: false, error: 'معرف الإعلان غير صالح' });
    }

    const ad = await Ad.findOne({ _id: adId, userId: req.userId }).session(session);
    if (!ad) {
      await session.abortTransaction();
      return res.status(404).json({ success: false, error: 'الإعلان غير موجود أو لا تملك صلاحيات حذفه' });
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

    return res.json({ success: true, message: 'تم إيقاف وحذف الحملة وإعادة الميزانية المتبقية لحسابك' });
  } catch (err) {
    await session.abortTransaction();
    next(err);
  } finally {
    session.endSession();
  }
};

module.exports = {
  handleCreateAd,
  handleGetUserAds,
  handleToggleAd,
  handleDeleteAd,
  handleGetMatchingAd,
  handleServeAd: handleGetMatchingAd
};
