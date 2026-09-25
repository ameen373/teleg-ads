/**
 * Self-Serve Ad Campaign Management Controller
 */

const mongoose = require('mongoose');

const connectDB = require('../config/db');
const { normalizeAndValidateUrl } = require('../utils/urlHelpers');
const { User, Ad } = require('../models');

/**
 * Create New Ad Campaign Controller
 */
const handleCreateAd = async (req, res, next) => {
  await connectDB();
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const { title, targetUrl, totalBudget } = req.body;
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
      advertiserTelegramId: req.user.telegramId,
      title: String(title).trim(),
      targetUrl: cleanTarget,
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
  handleDeleteAd
};
