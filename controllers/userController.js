const envConfig = require('../config/env');
const CONFIG = envConfig.CONFIG || envConfig;
const connectDB = require('../config/db');
const { User, Ad, Link, Withdraw, Deposit, Announcement } = require('../models');
const { buildShortUrl } = require('../utils/helpers');

const handleUserData = async (req, res, next) => {
  try {
    await connectDB();
    const targetUserId = req.userId;
    const userObj = req.user || {};
    const targetTgId = userObj.telegramId || null;

    if (!targetUserId) {
      return res.status(401).json({
        success: false,
        error: 'غير مصرح: لم يتم العثور على معرف المستخدم'
      });
    }

    const queryConditions = [];
    if (targetUserId) queryConditions.push({ userId: targetUserId });
    if (targetTgId) queryConditions.push({ publisherTelegramId: String(targetTgId) }, { telegramId: String(targetTgId) });

    const [rawLinks, withdraws, announcements, ads, deposits, referralsCount] = await Promise.all([
      Link.find(queryConditions.length > 0 ? { $or: queryConditions } : { userId: targetUserId }).sort({ createdAt: -1 }).lean(),
      Withdraw.find({ userId: targetUserId }).sort({ createdAt: -1 }).lean(),
      Announcement.find({ $or: [{ isGlobal: true }, { targetUserId: targetUserId }] }).sort({ createdAt: -1 }).lean(),
      Ad.find({ userId: targetUserId }).sort({ createdAt: -1 }).lean(),
      Deposit.find({ userId: targetUserId }).sort({ createdAt: -1 }).lean(),
      User.countDocuments({ referredBy: targetUserId })
    ]);

    const links = (rawLinks || []).map(link => {
      const totalViews = link.views || 0;
      const validImp = link.validImpressions || 0;
      const invalidImp = link.invalidImpressions || 0;
      const ctr = totalViews > 0 ? ((validImp / totalViews) * 100).toFixed(1) : "0.0";
      return { 
        ...link, 
        id: link._id,
        ctr, 
        validImpressions: validImp, 
        invalidImpressions: invalidImp,
        shortUrl: link.shortUrl || buildShortUrl(link.shortCode)
      };
    });

    const userTelegramId = userObj.telegramId ? String(userObj.telegramId).trim() : '';
    const adminId = CONFIG.ADMIN_ID ? String(CONFIG.ADMIN_ID).trim() : '';
    const isAdmin = Boolean(adminId && userTelegramId === adminId);

    const userPayload = typeof userObj.toObject === 'function' ? userObj.toObject() : userObj;

    return res.json({ 
      success: true,
      userId: targetUserId,
      user: {
        ...userPayload,
        referralsCount
      }, 
      language: userObj.language || CONFIG.DEFAULT_LANGUAGE || 'ar',
      links: links || [], 
      withdraws: withdraws || [], 
      announcements: announcements || [], 
      ads: ads || [], 
      deposits: deposits || [], 
      referralsCount: referralsCount || 0,
      isAdmin,
      botUsername: CONFIG.BOT_USERNAME || '',
      supportUsername: CONFIG.SUPPORT_USERNAME || '',
      botUrl: CONFIG.OFFICIAL_BOT_URL || '',
      officialChannelUrl: CONFIG.OFFICIAL_CHANNEL_URL || '',
      supportUrl: CONFIG.TELEGRAM_SUPPORT_URL || '',
      depositWallets: {
        bep20: CONFIG.DEPOSIT_USDT_BEP20 || '',
        trc20: CONFIG.DEPOSIT_USDT_TRC20 || ''
      }
    });
  } catch (err) {
    console.error('❌ [User Controller Error] Exception in handleUserData:', err);
    return res.status(500).json({
      success: false,
      error: 'حدث خطأ أثناء تحميل بيانات المستخدم',
      details: err.message || 'Unknown Server Exception'
    });
  }
};

const getUserReferrals = async (req, res, next) => {
  try {
    await connectDB();
    const targetUserId = req.userId;
    const userObj = req.user || {};

    if (!targetUserId) {
      return res.status(401).json({
        success: false,
        error: 'غير مصرح: لم يتم تزويد المعرف المطلوب'
      });
    }

    const referrals = await User.find({ referredBy: targetUserId })
      .select('username telegramId referralEarnings createdAt')
      .sort({ createdAt: -1 })
      .lean();

    const botUrl = CONFIG.OFFICIAL_BOT_URL || '';
    const telegramId = userObj.telegramId || '';
    const referralLink = botUrl ? `${botUrl}?start=${telegramId}` : '';

    return res.json({
      success: true,
      referralsCount: (referrals || []).length,
      referralEarnings: userObj.referralEarnings || 0,
      referralLink,
      referrals: referrals || []
    });
  } catch (err) {
    console.error('❌ [User Controller Error] Exception in getUserReferrals:', err);
    return res.status(500).json({
      success: false,
      error: 'حدث خطأ أثناء جلب سجل الإحالات',
      details: err.message || 'Unknown Server Exception'
    });
  }
};

const updateUserSettings = async (req, res, next) => {
  try {
    await connectDB();
    const { defaultWallet, language } = req.body || {};
    const updateData = {};
    
    if (defaultWallet !== undefined) updateData.defaultWallet = String(defaultWallet).trim();
    if (language !== undefined) updateData.language = String(language).trim().toLowerCase() || CONFIG.DEFAULT_LANGUAGE;

    await User.findByIdAndUpdate(req.userId, updateData);
    return res.json({ success: true, message: 'تم تحديث الإعدادات بنجاح' });
  } catch (err) {
    console.error('❌ [User Controller Error] Exception in updateUserSettings:', err);
    return res.status(500).json({
      success: false,
      error: 'حدث خطأ أثناء تحديث إعدادات الحساب',
      details: err.message || 'Unknown Server Exception'
    });
  }
};

module.exports = {
  handleUserData,
  getUserReferrals,
  updateUserSettings
};
