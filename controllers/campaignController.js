// controllers/campaignController.js
const mongoose = require('mongoose');
const Campaign = require('../models/Campaign');
const User = require('../models/User');
const SYSTEM_CONSTANTS = require('../config/constants');

/**
 * إنشاء حملة إعلانية جديدة
 */
const createCampaign = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { title, targetUrl, bannerUrl, totalBudget, budget: inputBudget, cpm } = req.body;
    const finalBudget = Number(totalBudget || inputBudget);

    if (!title || !targetUrl || !finalBudget) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'الحقول الأساسية (العنوان، الرابط، الميزانية) مطلوبة'
      });
    }

    const minBudget = SYSTEM_CONSTANTS.MIN_CAMPAIGN_BUDGET || 5;
    if (finalBudget < minBudget) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: `الحد الأدنى لميزانية الحملة هو $${minBudget}`
      });
    }

    try {
      new URL(targetUrl);
    } catch (err) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'صيغة رابط الهدف (targetUrl) غير صالحة'
      });
    }

    const user = await User.findById(req.user._id).session(session);
    const available = user.balances?.available ?? user.availableBalance ?? 0;

    if (available < finalBudget) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'رصيدك المتاح غير كافٍ لإنشاء هذه الحملة'
      });
    }

    if (user.balances) {
      user.balances.available -= finalBudget;
    } else {
      user.availableBalance -= finalBudget;
    }
    await user.save({ session });

    const campaign = await Campaign.create(
      [
        {
          userId: user._id,
          title: title.trim(),
          targetUrl: targetUrl.trim(),
          bannerUrl: bannerUrl ? bannerUrl.trim() : '',
          cpm: cpm ? Number(cpm) : (SYSTEM_CONSTANTS.CPM_RATE || 1.50),
          totalBudget: finalBudget,
          remainingBudget: finalBudget,
          status: 'active'
        }
      ],
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    return res.status(201).json({
      success: true,
      message: 'تم إنشاء الحملة الإعلانية وإطلاقها بنجاح',
      data: campaign[0]
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('[campaignController: createCampaign Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء إنشاء الحملة الإعلانية',
      error: error.message
    });
  }
};

/**
 * جلب جميع حملات المستخدم
 */
const getUserCampaigns = async (req, res) => {
  try {
    const campaigns = await Campaign.find({ userId: req.user._id }).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: campaigns.length,
      data: campaigns
    });
  } catch (error) {
    console.error('[campaignController: getUserCampaigns Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء جلب قائمة الحملات',
      error: error.message
    });
  }
};

/**
 * تبديل حالة الحملة (نشطة / موقوفة)
 */
const toggleCampaignStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const campaign = await Campaign.findOne({ _id: id, userId: req.user._id });

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'الحملة غير موجودة أو ليس لديك صلاحية تعديلها'
      });
    }

    if (campaign.status === 'completed' || campaign.remainingBudget <= 0) {
      return res.status(400).json({
        success: false,
        message: 'لا يمكن تعديل حالة حملة منتهية الميزانية'
      });
    }

    campaign.status = campaign.status === 'active' ? 'paused' : 'active';
    await campaign.save();

    return res.status(200).json({
      success: true,
      message: `تم تغيير حالة الحملة إلى ${campaign.status === 'active' ? 'نشطة' : 'متوقفة مؤقتاً'}`,
      data: {
        id: campaign._id,
        status: campaign.status
      }
    });
  } catch (error) {
    console.error('[campaignController: toggleCampaignStatus Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء تغيير حالة الحملة',
      error: error.message
    });
  }
};

module.exports = {
  createCampaign,
  getUserCampaigns,
  toggleCampaignStatus
};
