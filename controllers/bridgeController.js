// controllers/bridgeController.js
const Link = require('../models/Link');
const User = require('../models/User');
const Campaign = require('../models/Campaign');
const SYSTEM_CONSTANTS = require('../config/constants');

/**
 * جلب تفاصيل الرابط المختصر وجلب الإعلان المناسب لصفحة الجسر
 */
const getLinkDetails = async (req, res) => {
  try {
    const { code } = req.params;

    // 1. البحث عن الرابط المختصر والتأكد من أنه نشط
    const link = await Link.findOne({ code, isActive: true });

    if (!link) {
      return res.status(404).json({
        success: false,
        message: 'الرابط غير موجود أو تم تعطيله'
      });
    }

    // زيادة إجمالي عدد النقرات الكلية (غبر المفلترة)
    link.totalClicks += 1;
    await link.save();

    // 2. البحث عن حملة إعلانية داخلية نشطة وتملك ميزانية متبقية
    const activeCampaign = await Campaign.findOne({
      status: 'active',
      remainingBudget: { $gte: SYSTEM_CONSTANTS.CPM_RATE / 1000 }
    }).sort({ createdAt: 1 }); // جلب الأقدم أولاً

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
      // إرجاع إعلانات شبكات خارجية كخيار احتياطي (Adsgram / Adsterra)
      adData = {
        type: 'external',
        adsgramBlockId: process.env.ADSGRAM_BLOCK_ID || null,
        provider: 'adsgram'
      };
    }

    return res.status(200).json({
      success: true,
      data: {
        code: link.code,
        title: link.title,
        originalUrl: link.originalUrl,
        waitTimeSeconds: SYSTEM_CONSTANTS.BRIDGE_WAIT_SECONDS,
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
 * تأكيد مشاهدة الإعلان واحتساب الأرباح بعد انتهاء العداد التنازلي
 */
const confirmImpression = async (req, res) => {
  try {
    const { code, campaignId, startTime } = req.body;

    if (!code || !startTime) {
      return res.status(400).json({
        success: false,
        message: 'جميع البيانات المطلوبة (code, startTime) يجب توفيرها'
      });
    }

    // 1. التأكد من سلامة وقت الجلسة (مرور 5 ثوانٍ على الأقل من بدء الصفحة)
    const currentTime = Date.now();
    const elapsedTimeSeconds = (currentTime - Number(startTime)) / 1000;

    if (elapsedTimeSeconds < SYSTEM_CONSTANTS.BRIDGE_WAIT_SECONDS) {
      return res.status(400).json({
        success: false,
        message: `لم تكتمل مدة الانتظار المطلوبة (${SYSTEM_CONSTANTS.BRIDGE_WAIT_SECONDS} ثوانٍ)`
      });
    }

    // 2. البحث عن الرابط المختصر
    const link = await Link.findOne({ code, isActive: true });
    if (!link) {
      return res.status(404).json({
        success: false,
        message: 'الرابط غير موجود أو معطل'
      });
    }

    // 3. حساب تكلفة المشاهدة الواحدة بناءً على الـ CPM
    // CPM_RATE = سعر 1000 مشاهدة (مثال: 1.50$) -> المشاهدة الواحدة = 1.50 / 1000 = 0.0015$
    const impressionEarning = SYSTEM_CONSTANTS.CPM_RATE / 1000;

    // تحديث بيانات الرابط
    link.validImpressions += 1;
    link.earningsGenerated += impressionEarning;
    await link.save();

    // 4. إضافة الأرباح إلى الرصيد المعلق (pendingBalance) لصاحب الرابط
    const linkOwner = await User.findById(link.userId);
    if (linkOwner) {
      linkOwner.pendingBalance += impressionEarning;
      await linkOwner.save();

      // 5. احتساب عمولة الإحالة (10%) للمُحيل إن وجد
      if (linkOwner.referredBy) {
        const referrer = await User.findOne({ telegramId: linkOwner.referredBy });
        if (referrer) {
          const referralCommission = impressionEarning * SYSTEM_CONSTANTS.REFERRAL_COMMISSION_PERCENT;
          referrer.availableBalance += referralCommission;
          referrer.referralEarnings += referralCommission;
          referrer.totalEarned += referralCommission;
          await referrer.save();
        }
      }
    }

    // 6. خصم التكلفة من ميزانية الحملة الداخلية إن كانت المشاهدة تابعة لحملة
    if (campaignId) {
      const campaign = await Campaign.findById(campaignId);
      if (campaign && campaign.status === 'active') {
        campaign.impressionsDelivered += 1;
        campaign.remainingBudget = Math.max(0, campaign.remainingBudget - impressionEarning);

        // إنهاء الحملة تلقائياً عند استنفاد الميزانية
        if (campaign.remainingBudget <= 0) {
          campaign.status = 'completed';
        }
        await campaign.save();
      }
    }

    return res.status(200).json({
      success: true,
      message: 'تم تأكيد المشاهدة واحتساب الأرباح بنجاح',
      data: {
        originalUrl: link.originalUrl,
        earnedAmount: impressionEarning
      }
    });
  } catch (error) {
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
