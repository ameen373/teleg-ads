const { CONFIG } = require('../config/config');
const connectDB = require('../config/db');
const { User, Ad, Link, Withdraw, Deposit, Announcement } = require('../models');
const { buildShortUrl } = require('../utils/helpers');

const handleUserData = async (req, res, next) => {
  try {
    await connectDB();
    const targetUserId = req.userId;
    const targetTgId = req.user ? req.user.telegramId : null;

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

    const links = rawLinks.map(link => {
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

    const isAdmin = Boolean(CONFIG.ADMIN_ID && String(req.user.telegramId).trim() === CONFIG.ADMIN_ID);
    res.json({ 
      success: true,
      userId: targetUserId,
      user: {
        ...req.user.toObject(),
        referralsCount
      }, 
      language: req.user.language || CONFIG.DEFAULT_LANGUAGE,
      links, 
      withdraws, 
      announcements, 
      ads, 
      deposits, 
      referralsCount,
      isAdmin,
      botUsername: CONFIG.BOT_USERNAME,
      supportUsername: CONFIG.SUPPORT_USERNAME,
      botUrl: CONFIG.OFFICIAL_BOT_URL,
      officialChannelUrl: CONFIG.OFFICIAL_CHANNEL_URL,
      supportUrl: CONFIG.TELEGRAM_SUPPORT_URL,
      depositWallets: {
        bep20: CONFIG.DEPOSIT_USDT_BEP20,
        trc20: CONFIG.DEPOSIT_USDT_TRC20
      }
    });
  } catch (err) {
    next(err);
  }
};

const getUserReferrals = async (req, res, next) => {
  try {
    await connectDB();
    const targetUserId = req.userId;
    const referrals = await User.find({ referredBy: targetUserId })
      .select('username telegramId referralEarnings createdAt')
      .sort({ createdAt: -1 })
      .lean();

    const referralLink = `${CONFIG.OFFICIAL_BOT_URL}?start=${req.user.telegramId}`;

    res.json({
      success: true,
      referralsCount: referrals.length,
      referralEarnings: req.user.referralEarnings || 0,
      referralLink,
      referrals
    });
  } catch (err) {
    next(err);
  }
};

const updateUserSettings = async (req, res, next) => {
  try {
    await connectDB();
    const { defaultWallet, language } = req.body;
    const updateData = {};
    
    if (defaultWallet !== undefined) updateData.defaultWallet = String(defaultWallet).trim();
    if (language !== undefined) updateData.language = String(language).trim().toLowerCase() || CONFIG.DEFAULT_LANGUAGE;

    await User.findByIdAndUpdate(req.userId, updateData);
    res.json({ success: true, message: 'تم تحديث الإعدادات بنجاح' });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  handleUserData,
  getUserReferrals,
  updateUserSettings
};
