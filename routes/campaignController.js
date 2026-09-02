// controllers/campaignController.js
const Campaign = require('../models/Campaign');
const User = require('../models/User');
const SYSTEM_CONSTANTS = require('../config/constants');

/**
 * إنشاء حملة إعلانية جديدة
 */
const createCampaign = async (req, res) => {
  try {
    const { title, targetUrl, bannerUrl, totalBudget } = req.body;

    if (!title || !targetUrl || !totalBudget) {
      return res.status(400).json({
        success: false,
        message: 'جميع الحقول الأساسية (title, targetUrl, totalBudget) مطلوبة'
      });
    }

    const budget = Number(totalBudget);

    // 1. التحقق من الحد الأدنى لميزانية الحملة ($5)
    if (budget < SYSTEM_CONSTANTS.MIN_CAMPAIGN_BUDGET) {
      return res.status(400).json({
        success: false,
        message: `الحد الأدنى لميزانية الحملة هو $${SYSTEM_CONSTANTS.MIN_CAMPAIGN_BUDGET}`
      });
    }

    // التحقق من صحة الرابط Target URL
    try {
      new URL(targetUrl);
    } catch (err) {
      return res.status(400).json({
        success: false,
        message: 'صيغة رابط الهدف (targetUrl) غير صالحة'
      });
    }

    // 2. إعادة جلب المستخدم للتأكد من الرصيد
    const user = await User.findById(req.user._id);

    if (user.availableBalance < budget) {
      return res.status(400).json({
        success: false,
        message: 'رصيدك المتاح غير كافٍ لإنشاء هذه الحملة. يرجى شحن حسابك أولاً.'
      });
    }

    // 3. خصم قيمة الحملة من الرصيد المتاح لحجزها
    user.availableBalance -= budget;
    await user.save();

    // 4. إنشاء سجل الحملة الإعلانية
    const campaign = await Campaign.create({
      userId: user._id,
      title: title.trim(),
      targetUrl: targetUrl.trim(),
      bannerUrl: bannerUrl ? bannerUrl.trim() : '',
      totalBudget: budget,
      remainingBudget: budget,
      status: 'active'
    });

    return res.status(201).json({
      success: true,
      message: 'تم إنشاء الحملة الإعلانية وإطلاقها بنجاح',
      data: campaign
    });
  } catch (error) {
    console.error('[campaignController: createCampaign Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء إنشاء الحملة الإعلانية',
      error: error.message
    });
  }
};

/**
 * جلب جميع الحملات الخاصة بالمستخدم الحالي
 */
const getUserCampaigns = async (req, res) => {
  try {
    const campaigns = await Campaign.find({ userId: req.user._id })
      .sort({ createdAt: -1 });

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
 * تبديل حالة الحملة (إيقاف مؤقت active/paused)
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

    // تبديل الحالة بين active و paused
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
