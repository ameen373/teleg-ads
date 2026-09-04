// controllers/bridgeController.js
const mongoose = require('mongoose');
const Link = require('../models/Link');
const User = require('../models/User');
const Campaign = require('../models/Campaign');
const SYSTEM_CONSTANTS = require('../config/constants');

/**
 * جلب تفاصيل الرابط المختصر والإعلان المناسب لصفحة الجسر
 */
const getLinkDetails = async (req, res) => {
  try {
    const { code } = req.params;

    const link = await Link.findOneAndUpdate(
      { code, isActive: true },
      { $inc: { totalClicks: 1 } },
      { new: true }
    );

    if (!link) {
      return res.status(404).json({
        success: false,
        message: 'الرابط غير موجود أو تم تعطيله'
      });
    }

    const cpmRate = SYSTEM_CONSTANTS.CPM_RATE || 1.50;
    const minCostPerImpression = cpmRate / 1000;

    const activeCampaign = await Campaign.findOne({
      status: 'active',
      remainingBudget: { $gte: minCostPerImpression }
    }).sort({ createdAt: 1 });

    let adData = null;

    if (activeCampaign) {
      adData = {
        type: 'internal',
        campaignId: activeCampaign._id,
        title: activeCampaign.title,
        bannerUrl: activeCampaign.bannerUrl,
        targetUrl: activeCampaign.targetUrl
      };
    } else {
      adData = {
        type: 'external',
        adsgramBlockId: process.env.ADSGRAM_BLOCK_ID || null,
        provider: 'adsgram'
      };
    }

    return res.status(200).json({
      success: true,
      data: {
        linkId: link._id,
        code: link.code,
        title: link.title,
        originalUrl: link.originalUrl,
        waitTimeSeconds: SYSTEM_CONSTANTS.BRIDGE_WAIT_SECONDS || 5,
        ad: adData
      }
    });
  } catch (error) {
    console.error('[bridgeController: getLinkDetails Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء جلب تفاصيل الرابط',
      error: error.message
    });
  }
};

/**
 * تأكيد مشاهدة الإعلان واحتساب الأرباح برمجياً عبر Transaction
 */
const confirmImpression = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { code, linkId, campaignId, startTime } = req.body;

    if ((!code && !linkId) || !startTime) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'بيانات غير كاملة للتحقق من المشاهدة'
      });
    }

    const waitSeconds = SYSTEM_CONSTANTS.BRIDGE_WAIT_SECONDS || 5;
    const elapsedTime = (Date.now() - Number(startTime)) / 1000;

    if (elapsedTime < waitSeconds - 0.5) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: `لم تكتمل مدة الانتظار المطلوبة (${waitSeconds} ثوانٍ)`
      });
    }

    const query = linkId ? { _id: linkId, isActive: true } : { code, isActive: true };
    const link = await Link.findOne(query).session(session);

    if (!link) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: 'الرابط غير موجود أو معطل'
      });
    }

    const cpmRate = SYSTEM_CONSTANTS.CPM_RATE || 1.50;
    const impressionEarning = cpmRate / 1000;

    link.validImpressions += 1;
    link.earningsGenerated += impressionEarning;
    await link.save({ session });

    const linkOwner = await User.findById(link.userId).session(session);
    if (linkOwner) {
      if (linkOwner.balances) {
        linkOwner.balances.pending = (linkOwner.balances.pending || 0) + impressionEarning;
      } else {
        linkOwner.pendingBalance = (linkOwner.pendingBalance || 0) + impressionEarning;
      }
      await linkOwner.save({ session });

      if (linkOwner.referredBy) {
        const referrer = await User.findOne({ telegramId: linkOwner.referredBy }).session(session);
        if (referrer) {
          const commissionPercent = SYSTEM_CONSTANTS.REFERRAL_COMMISSION_PERCENT || 0.10;
          const referralCommission = impressionEarning * commissionPercent;

          if (referrer.balances) {
            referrer.balances.available = (referrer.balances.available || 0) + referralCommission;
            referrer.balances.referralEarned = (referrer.balances.referralEarned || 0) + referralCommission;
            referrer.balances.totalEarned = (referrer.balances.totalEarned || 0) + referralCommission;
          } else {
            referrer.availableBalance = (referrer.availableBalance || 0) + referralCommission;
            referrer.referralEarnings = (referrer.referralEarnings || 0) + referralCommission;
            referrer.totalEarned = (referrer.totalEarned || 0) + referralCommission;
          }
          await referrer.save({ session });
        }
      }
    }

    if (campaignId) {
      const campaign = await Campaign.findById(campaignId).session(session);
      if (campaign && campaign.status === 'active') {
        campaign.impressionsDelivered += 1;
        campaign.remainingBudget = Math.max(0, campaign.remainingBudget - impressionEarning);

        if (campaign.remainingBudget <= 0) {
          campaign.status = 'completed';
        }
        await campaign.save({ session });
      }
    }

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      success: true,
      message: 'تم تأكيد المشاهدة واحتساب الأرباح بنجاح',
      data: {
        originalUrl: link.originalUrl,
        earnedAmount: impressionEarning
      }
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('[bridgeController: confirmImpression Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء تأكيد المشاهدة',
      error: error.message
    });
  }
};

module.exports = {
  getLinkDetails,
  confirmImpression
};
