// controllers/referralController.js
const mongoose = require('mongoose');
const User = require('../models/User');
const SYSTEM_CONSTANTS = require('../config/constants');

function maskName(name) {
  if (!name || name.length <= 2) return '***';
  const start = name.charAt(0);
  const end = name.charAt(name.length - 1);
  return `${start}***${end}`;
}

/**
 * جلب إحصائيات الإحالة للمستخدم
 */
exports.getReferralStats = async (req, res) => {
  try {
    const userId = req.user._id;
    const currentUser = await User.findById(userId);

    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: 'المستخدم غير موجود'
      });
    }

    const botUsername = process.env.TELEGRAM_BOT_USERNAME || process.env.BOT_USERNAME || SYSTEM_CONSTANTS.BOT_USERNAME || 'TelegaAdsBot';
    const telegramId = currentUser.telegramId;
    const referralLink = `https://t.me/${botUsername}/app?startapp=ref_${telegramId}`;

    const totalReferredUsers = await User.countDocuments({ referredBy: telegramId });

    const recentReferredUsers = await User.find({ referredBy: telegramId })
      .sort({ createdAt: -1 })
      .limit(10)
      .select('firstName username createdAt');

    const formattedRecentUsers = recentReferredUsers.map((u) => {
      const displayName = u.username ? `@${u.username}` : (u.firstName || 'User');
      return {
        maskedName: maskName(displayName),
        joinedAt: u.createdAt
      };
    });

    const referralEarnings = currentUser.balances?.referralEarned ?? currentUser.referralEarnings ?? 0;

    return res.status(200).json({
      success: true,
      data: {
        referralLink,
        totalReferredUsers,
        referralEarnings,
        recentReferredUsers: formattedRecentUsers
      }
    });
  } catch (error) {
    console.error('[Get Referral Stats Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء جلب بيانات الإحالة',
      error: error.message
    });
  }
};

/**
 * تحويل أرباح الإحالة إلى الرصيد المتاح
 */
exports.claimReferralEarnings = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const userId = req.user._id;
    const currentUser = await User.findById(userId).session(session);

    if (!currentUser) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: 'المستخدم غير موجود'
      });
    }

    const currentReferralEarned = currentUser.balances?.referralEarned ?? currentUser.referralEarnings ?? 0;
    const MIN_CLAIM_AMOUNT = parseFloat(process.env.MIN_REFERRAL_CLAIM_AMOUNT) || 1.0;

    if (currentReferralEarned < MIN_CLAIM_AMOUNT) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: `الحد الأدنى لتحويل أرباح الإحالة إلى الرصيد المتاح هو $${MIN_CLAIM_AMOUNT.toFixed(2)}`
      });
    }

    const claimAmount = currentReferralEarned;

    if (currentUser.balances) {
      currentUser.balances.available = (currentUser.balances.available || 0) + claimAmount;
      currentUser.balances.referralEarned = 0;
    } else {
      currentUser.availableBalance = (currentUser.availableBalance || 0) + claimAmount;
      currentUser.referralEarnings = 0;
    }

    await currentUser.save({ session });
    await session.commitTransaction();
    session.endSession();

    const newAvailable = currentUser.balances ? currentUser.balances.available : currentUser.availableBalance;

    return res.status(200).json({
      success: true,
      message: `تم تحويل مبلغ $${claimAmount.toFixed(2)} بنجاح إلى رصيدك المتاح للسحب.`,
      data: {
        claimedAmount: claimAmount,
        newAvailableBalance: newAvailable
      }
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('[Claim Referral Earnings Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء تحويل أرباح الإحالة',
      error: error.message
    });
  }
};
