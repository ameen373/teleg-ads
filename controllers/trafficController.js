/**
 * Traffic Engine Controller (Session Creation & Impression Tracking)
 */

const mongoose = require('mongoose');
const crypto = require('crypto');

const CONFIG = require('../config/config');
const logger = require('../config/logger');
const connectDB = require('../config/db');
const { 
  safeRedisGet, 
  safeRedisSet, 
  safeRedisDel, 
  checkUniqueness, 
  banIp 
} = require('../config/redis');
const { User, Ad, Link, Impression, ClickSession } = require('../models');

/**
 * Initialize Click Session Controller
 */
const handleInitClick = async (req, res, next) => {
  try {
    await connectDB();
    const { shortCode, deviceFingerprint } = req.body;
    
    if (!shortCode) {
      return res.status(400).json({ success: false, message: 'رمز الرابط مطلوب' });
    }

    const clientIp = req.trafficData?.realIp || req.realIp || req.ip;
    const userAgent = req.trafficData?.userAgent || req.headers['user-agent'] || '';

    const cachedLink = await safeRedisGet(`link:data:${shortCode}`);
    let link = cachedLink ? JSON.parse(cachedLink) : null;

    if (!link) {
      link = await Link.findOne({ shortCode, isActive: true }).lean();
      if (!link) {
        return res.status(404).json({ success: false, message: 'الرابط غير موجود أو تم إيقافه' });
      }
      await safeRedisSet(`link:data:${shortCode}`, JSON.stringify(link), 'EX', 300);
    }

    const activeAd = await Ad.findOne({
      status: 'active',
      remainingBudget: { $gte: 0.0015 }
    }).sort({ createdAt: -1 }).lean();

    const sessionId = crypto.randomBytes(16).toString('hex');
    const nonceToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    const clickSessionData = {
      sessionId,
      linkId: link._id,
      userId: link.userId,
      publisherId: link.userId,
      ip: clientIp,
      userAgent,
      deviceFingerprint: deviceFingerprint || null,
      nonceToken,
      bridgeToken: nonceToken,
      adSource: activeAd ? 'internal' : 'adsgram',
      adId: activeAd ? activeAd._id : null,
      isVerified: false,
      expiresAt
    };

    const clickSession = new ClickSession(clickSessionData);
    await clickSession.save();

    await safeRedisSet(`session:${sessionId}`, JSON.stringify(clickSessionData), 'EX', 900);

    return res.json({
      success: true,
      message: "تم بدء جلسة التوجيه بنجاح",
      sessionId,
      nonceToken,
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
    if (logger && typeof logger.error === 'function') {
      logger.error('Error in handleInitClick:', err);
    }
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

    const { sessionId, nonceToken, deviceFingerprint, interactionTime } = req.body;
    const clientIp = req.trafficData?.realIp || req.realIp || req.ip;
    const userAgent = req.trafficData?.userAgent || req.headers['user-agent'] || '';
    const country = req.trafficData?.country || 'XX';

    if (!sessionId || (!nonceToken && !req.body.bridgeToken)) {
      await sessionDb.abortTransaction();
      return res.status(400).json({ success: false, message: 'بيانات الجلسة أو التوكين غير مكتملة' });
    }

    const tokenToValidate = nonceToken || req.body.bridgeToken;

    const cachedSession = await safeRedisGet(`session:${sessionId}`);
    let clickSession = cachedSession ? JSON.parse(cachedSession) : null;

    if (!clickSession) {
      clickSession = await ClickSession.findOne({ sessionId }).session(sessionDb);
      if (!clickSession) {
        await sessionDb.abortTransaction();
        return res.status(404).json({ success: false, message: 'جلسة النقرة غير صالحة أو انتهت صلاحيتها' });
      }
    }

    if (clickSession.nonceToken !== tokenToValidate && clickSession.bridgeToken !== tokenToValidate) {
      await sessionDb.abortTransaction();
      await banIp(clientIp, 86400, 'Invalid Nonce Token submission');
      return res.status(403).json({ success: false, message: 'رمز التحقق المعاملاتي غير مطابق' });
    }

    if (clickSession.isVerified) {
      await sessionDb.abortTransaction();
      return res.status(400).json({ success: false, message: 'تم احتساب هذه النقرة مسبقاً' });
    }

    const timeSpent = Number(interactionTime) || 0;
    if (timeSpent < 3) {
      await sessionDb.abortTransaction();
      return res.status(400).json({ success: false, message: 'تفاعل بشري غير كافٍ قبل تخطي الإعلان' });
    }

    const effectiveFingerprint = deviceFingerprint || clickSession.deviceFingerprint;
    const uniqueCheck = await checkUniqueness(clientIp, effectiveFingerprint, 86400);

    const link = await Link.findById(clickSession.linkId).populate('userId').session(sessionDb);
    if (!link) {
      await sessionDb.abortTransaction();
      return res.status(404).json({ success: false, message: 'الرابط المرتبط بالجلسة غير موجود' });
    }

    let publisherShare = 0.00135;
    let costPerImpression = 0.0015;

    await Impression.create([{
      linkId: link._id,
      userId: link.userId ? link.userId._id : null,
      publisherId: link.userId ? link.userId._id : null,
      publisherTelegramId: link.publisherTelegramId || (link.userId ? link.userId.telegramId : null),
      adSource: clickSession.adSource,
      adId: clickSession.adId,
      publisherEarnings: publisherShare,
      cost: costPerImpression,
      viewerIp: clientIp,
      ip: clientIp,
      deviceFingerprint: effectiveFingerprint,
      country,
      status: uniqueCheck.isUnique ? 'valid' : 'flagged',
      userAgent,
      isUnique: uniqueCheck.isUnique
    }], { session: sessionDb });

    await Link.findByIdAndUpdate(
      link._id,
      { $inc: { views: 1, validImpressions: uniqueCheck.isUnique ? 1 : 0 } },
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

    if (uniqueCheck.isUnique && linkOwnerId && link.userId && link.userId.referredBy) {
      const refBonus = Math.round((publisherShare * 0.10 + Number.EPSILON) * 100000) / 100000;
      publisherShare = Math.round((publisherShare - refBonus + Number.EPSILON) * 100000) / 100000;

      await User.findByIdAndUpdate(
        link.userId.referredBy,
        { $inc: { availableBalance: refBonus, referralEarnings: refBonus } },
        { session: sessionDb }
      );
    }

    if (uniqueCheck.isUnique && linkOwnerId) {
      await User.findByIdAndUpdate(
        linkOwnerId,
        { $inc: { availableBalance: publisherShare, 'statsSummary.totalEarnings': publisherShare } },
        { session: sessionDb }
      );
    }

    await ClickSession.updateOne(
      { sessionId },
      { $set: { isVerified: true, verifiedAt: new Date(), interactionTime: timeSpent } },
      { session: sessionDb }
    );

    await sessionDb.commitTransaction();
    await safeRedisDel(`session:${sessionId}`);

    return res.json({
      success: true,
      message: "تم توثيق الزيارة واحتساب الأرباح بنجاح",
      targetUrl: link.targetUrl,
      counted: uniqueCheck.isUnique,
      publisherEarnings: uniqueCheck.isUnique ? publisherShare : 0
    });
  } catch (err) {
    await sessionDb.abortTransaction();
    if (logger && typeof logger.error === 'function') {
      logger.error('Error in handleImpression:', err);
    }
    next(err);
  } finally {
    sessionDb.endSession();
  }
};

module.exports = {
  handleInitClick,
  handleImpression,
  verifyClick: handleInitClick,
  verifyImpression: handleImpression
};
