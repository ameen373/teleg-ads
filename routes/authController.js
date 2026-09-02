// controllers/authController.js
const User = require('../models/User');

/**
 * جلب بيانات البروفايل الخاص بالمستخدم الحالي
 */
const getProfile = async (req, res) => {
  try {
    // req.user معبأة مسبقاً من خلال authMiddleware
    const user = req.user;

    // بناء رابط الإحالة الخاص بالمستخدم
    const botUsername = process.env.BOT_USERNAME || 'YourBot';
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
        role: user.role,
        isPremium: user.isPremium,
        balances: {
          available: user.availableBalance,
          pending: user.pendingBalance,
          totalEarned: user.totalEarned,
          referralEarnings: user.referralEarnings
        },
        defaultWalletAddress: user.defaultWalletAddress || '',
        referralLink: referralLink,
        referredBy: user.referredBy,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error('[authController: getProfile Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في الخادم أثناء جلب بيانات البروفايل',
      error: error.message
    });
  }
};

/**
 * تحديث إعدادات المستخدم (عنوان المحفظة واللغة المفضلة)
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

    // تحديث عنوان المحفظة الافتراضي إن وجد في جسم الطلب
    if (defaultWalletAddress !== undefined) {
      user.defaultWalletAddress = defaultWalletAddress.trim();
    }

    // تحديث لغة الواجهة إن وجدت في جسم الطلب
    if (languageCode !== undefined) {
      user.languageCode = languageCode.trim();
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

