// controllers/authController.js
const User = require('../models/User');

/**
 * جلب بيانات البروفايل الخاص بالمستخدم الحالي والأرصدة
 */
const getProfile = async (req, res) => {
  try {
    const user = req.user;
    const botUsername = process.env.BOT_USERNAME || 'TelegaAdsBot';
    const referralLink = `https://t.me/${botUsername}?start=${user.telegramId}`;

    return res.status(200).json({
      success: true,
      data: {
        id: user._id,
        telegramId: user.telegramId,
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        photoUrl: user.photoUrl,
        languageCode: user.languageCode,
        role: user.role || 'user',
        isPremium: user.isPremium,
        balances: {
          available: user.availableBalance || 0,
          pending: user.pendingBalance || 0,
          totalEarned: user.totalEarned || 0,
          referralEarnings: user.referralEarnings || 0
        },
        defaultWalletAddress: user.defaultWalletAddress || '',
        referralLink: referralLink,
        referredBy: user.referredBy || null,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error('[authController: getProfile Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء جلب بيانات البروفايل',
      error: error.message
    });
  }
};

/**
 * تحديث إعدادات الحساب (العنوان الافتراضي واللغة)
 */
const updateSettings = async (req, res) => {
  try {
    const { defaultWalletAddress, languageCode } = req.body;
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'المستخدم غير موجود'
      });
    }

    if (defaultWalletAddress !== undefined) {
      user.defaultWalletAddress = String(defaultWalletAddress).trim();
    }

    if (languageCode !== undefined) {
      user.languageCode = String(languageCode).trim();
    }

    await user.save();

    return res.status(200).json({
      success: true,
      message: 'تم تحديث الإعدادات بنجاح',
      data: {
        defaultWalletAddress: user.defaultWalletAddress,
        languageCode: user.languageCode
      }
    });
  } catch (error) {
    console.error('[authController: updateSettings Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء تحديث الإعدادات',
      error: error.message
    });
  }
};

module.exports = {
  getProfile,
  updateSettings
};
