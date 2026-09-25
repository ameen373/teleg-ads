/**
 * Traffic Engine Controller (Bridge Page Gateway, Session Creation & Impression Tracking)
 */

const mongoose = require('mongoose');
const crypto = require('crypto');

const CONFIG = require('../config/config');
const connectDB = require('../config/db');
const { safeRedisGet, safeRedisSet, safeRedisDel } = require('../config/redis');
const { User, Ad, Link, Impression, ClickSession } = require('../models');

/**
 * Initialize Click Session Controller
 */
const handleInitClick = async (req, res, next) => {
  try {
    await connectDB();
    const { shortCode } = req.body;
    if (!shortCode) {
      return res.status(400).json({ success: false, error: 'رمز الرابط مطلوب' });
    }

    const cachedLink = await safeRedisGet(`link:data:${shortCode}`);
    let link = cachedLink ? JSON.parse(cachedLink) : null;

    if (!link) {
      link = await Link.findOne({ shortCode, isActive: true }).lean();
      if (!link) {
        return res.status(404).json({ success: false, error: 'الرابط غير موجود أو تم إيقافه' });
      }
      await safeRedisSet(`link:data:${shortCode}`, JSON.stringify(link), 300);
    }

    // Select Internal Ad or Fallback to Adsgram Network
    const activeAd = await Ad.findOne({
      status: 'active',
      remainingBudget: { $gte: 0.0015 }
    }).sort({ createdAt: -1 }).lean();

    const sessionId = crypto.randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    const clickSession = new ClickSession({
      sessionId,
      linkId: link._id,
      publisherUserId: link.userId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] || '',
      adSource: activeAd ? 'internal' : 'adsgram',
      adId: activeAd ? activeAd._id : null,
      expiresAt
    });

    await clickSession.save();
    await safeRedisSet(`session:${sessionId}`, JSON.stringify(clickSession), 900);

    return res.json({
      success: true,
      sessionId,
      requiredDelay: 5,
      adConfig: activeAd ? {
        type: 'internal',
        title: activeAd.title,
        targetUrl: activeAd.targetUrl
      } : {
        type: 'adsgram',
        blockId: CONFIG.ADSGRAM_BLOCK_ID
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Finalize & Record Impression / Revenue Settlement Controller
 */
const handleImpression = async (req, res, next) => {
  await connectDB();
  const sessionDb = await mongoose.startSession();
  try {
    sessionDb.startTransaction();

    const { sessionId } = req.body;
    if (!sessionId) {
      await sessionDb.abortTransaction();
      return res.status(400).json({ success: false, error: 'معرف الجلسة مطلوب' });
    }

    const cachedSession = await safeRedisGet(`session:${sessionId}`);
    let clickSession = cachedSession ? JSON.parse(cachedSession) : null;

    if (!clickSession) {
      clickSession = await ClickSession.findOne({ sessionId }).session(sessionDb);
      if (!clickSession) {
        await sessionDb.abortTransaction();
        return res.status(404).json({ success: false, error: 'جلسة النقرة غير صالحة أو انتهت صلاحيتها' });
      }
    }

    if (clickSession.isVerified) {
      await sessionDb.abortTransaction();
      return res.status(400).json({ success: false, error: 'تم احتساب هذه النقرة مسبقاً' });
    }

    const link = await Link.findById(clickSession.linkId).populate('userId').session(sessionDb);
    if (!link) {
      await sessionDb.abortTransaction();
      return res.status(404).json({ success: false, error: 'الرابط المرتبط بالجلسة غير موجود' });
    }

    let publisherShare = 0.00135;
    let costPerImpression = 0.0015;

    // Record Impression Document
    await Impression.create([{
      linkId: link._id,
      publisherUserId: link.userId ? link.userId._id : null,
      publisherTelegramId: link.publisherTelegramId,
      adSource: clickSession.adSource,
      adId: clickSession.adId,
      revenueGenerated: publisherShare,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] || '',
      isValid: true
    }], { session: sessionDb });

    // Update Link Stats
    await Link.findByIdAndUpdate(
      link._id,
      { $inc: { views: 1, validImpressions: 1 } },
      { session: sessionDb }
    );

    const linkOwnerId = link.userId ? link.userId._id : null;

    if (clickSession.adSource === 'internal' && clickSession.adId) {
      const ad = await Ad.findById(clickSession.adId).session(sessionDb);
      if (ad) {
        ad.remainingBudget = Math.max(0, ad.remainingBudget - costPerImpression);
        ad.impressionsCount += 1;
        if (ad.remainingBudget < costPerImpression) {
          ad.status = 'completed';
        }
        await ad.save({ session: sessionDb });
      }
    }

    // Process Referral Bonus Distribution
    if (linkOwnerId && link.userId && link.userId.referredBy) {
      const refBonus = Math.round((publisherShare * 0.10 + Number.EPSILON) * 100000) / 100000;
      publisherShare = Math.round((publisherShare - refBonus + Number.EPSILON) * 100000) / 100000;

      await User.findByIdAndUpdate(
        link.userId.referredBy,
        { $inc: { availableBalance: refBonus, referralEarnings: refBonus } },
        { session: sessionDb }
      );
    }

    // Credit Publisher Balance
    if (linkOwnerId) {
      await User.findByIdAndUpdate(
        linkOwnerId,
        { $inc: { availableBalance: publisherShare, 'statsSummary.totalEarnings': publisherShare } },
        { session: sessionDb }
      );
    }

    // Update Session Status
    await ClickSession.updateOne(
      { sessionId },
      { $set: { isVerified: true, verifiedAt: new Date() } },
      { session: sessionDb }
    );

    await sessionDb.commitTransaction();
    await safeRedisDel(`session:${sessionId}`);

    return res.json({
      success: true,
      targetUrl: link.targetUrl,
      counted: true,
      publisherEarnings: publisherShare
    });
  } catch (err) {
    await sessionDb.abortTransaction();
    next(err);
  } finally {
    sessionDb.endSession();
  }
};

module.exports = {
  handleInitClick,
  handleImpression
};
