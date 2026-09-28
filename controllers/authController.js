/**
 * Authentication & Admin Gateway Controller
 */

const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const CONFIG = require('../config/config');
const connectDB = require('../config/db');
const { verifyTelegramData } = require('../utils/telegram');
const { User } = require('../models');

// استيراد اللوجر مع وجود آلية احتياطية في حال عدم وجود الملف
let logger;
try {
  logger = require('../utils/logger');
} catch (e) {
  logger = console;
}

/**
 * Check Admin Permission Status Controller
 */
const handleCheckAdmin = async (req, res, next) => {
  try {
    await connectDB();
    const initData = req.headers['x-telegram-init-data'] || 
                     req.headers['telegram-init-data'] || 
                     req.query?.initData || 
                     req.body?.initData;

    const telegramUser = verifyTelegramData(initData);
    const telegramIdToCheck = telegramUser ? String(telegramUser.id || telegramUser.telegramId).trim() : null;

    const isAdmin = Boolean(CONFIG.ADMIN_ID && telegramIdToCheck && telegramIdToCheck === CONFIG.ADMIN_ID);
    return res.json({ success: true, message: "تمت مراجعة حالة المدير", isAdmin });
  } catch (error) {
    if (logger && typeof logger.error === 'function') {
      logger.error("خطأ أثناء التحقق من صلاحيات المدير في handleCheckAdmin:", error);
    } else {
      console.error("خطأ أثناء التحقق من صلاحيات المدير في handleCheckAdmin:", error);
    }
    return res.status(500).json({ 
      success: false, 
      message: "حدث خطأ داخلي في الخادم أثناء مراجعة صلاحيات المدير", 
      isAdmin: false 
    });
  }
};

/**
 * Telegram Authentication & Token Issuance Gateway Controller
 */
const handleLogin = async (req, res, next) => {
  try {
    await connectDB();

    const initData = req.headers['x-telegram-init-data'] || 
                     req.headers['telegram-init-data'] || 
                     req.query?.initData || 
                     req.body?.initData || 
                     req.body?.user || 
                     req.query?.user ||
                     req.headers['x-init-data'];

    const telegramUser = verifyTelegramData(initData);

    const rawId = req.body?.telegramId || req.body?.userId || req.body?.telegram_id || req.body?.user_id || req.body?.userld || req.body?.telegramid || req.body?.id || req.body?.tg_id ||
                  telegramUser?.id || telegramUser?.telegramId ||
                  req.query?.telegram_id || req.query?.telegramId || req.query?.userId || req.query?.userld || req.query?.user_id || req.query?.telegramid || req.query?.id || req.query?.tg_id ||
                  req.headers['x-user-id'] || req.headers['user-id'] || req.headers['telegramid'] || req.headers['telegram_id'];

    // تحويل telegramId صراحة إلى رقم
    const tId = Number(req.body?.telegramId || req.body?.userId || rawId);

    // التحقق من صحة المدخلات (Validation Error) - لا نرجع 400 إلا إذا كانت البيانات ناقصة أو غير صالحة
    if (!tId || isNaN(tId)) {
      return res.status(400).json({ 
        success: false, 
        message: 'بيانات معرف المستخدم غير مكتملة أو غير صالحة (Validation Error)' 
      });
    }

    const tgIdStr = String(tId);
    const { referrerId } = req.body || {};

    const currentUsername = telegramUser?.username || `User_${tgIdStr.slice(-4)}`;
    const currentFirstName = telegramUser?.firstName || telegramUser?.first_name || '';
    const currentLastName = telegramUser?.lastName || telegramUser?.last_name || '';
    const userLanguage = telegramUser?.languageCode || telegramUser?.language_code || CONFIG.DEFAULT_LANGUAGE;

    const updatePayload = {
      telegramId: tgIdStr,
      username: currentUsername,
      ...(currentFirstName && { firstName: currentFirstName }),
      ...(currentLastName && { lastName: currentLastName }),
      ...(userLanguage && { language: userLanguage })
    };

    const updateOps = { $set: updatePayload };

    if (referrerId && mongoose.Types.ObjectId.isValid(referrerId)) {
      updateOps.$setOnInsert = { referredBy: referrerId };
    }

    // الاستعلام عن المستخدم ومطابقته كنص أو رقم
    const user = await User.findOneAndUpdate(
      { $or: [{ telegramId: tgIdStr }, { telegramId: tId }] },
      updateOps,
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    if (!user) {
      return res.status(500).json({ 
        success: false, 
        message: 'حدث خطأ داخلي أثناء إنشاء أو تحديث بيانات المستخدم' 
      });
    }

    if (user.isBanned) {
      return res.status(403).json({ 
        success: false, 
        message: `حسابك معطل بسبب مخالفة الشروط. التواصل مع الدعم: ${CONFIG.SUPPORT_USERNAME}` 
      });
    }

    const token = jwt.sign(
      { userId: user._id, telegramId: user.telegramId, role: user.role },
      CONFIG.JWT_SECRET,
      { expiresIn: '7d', algorithm: 'HS256' }
    );

    return res.json({ 
      success: true, 
      message: "تم تسجيل الدخول بنجاح",
      token, 
      userId: user._id,
      user, 
      language: user.language || CONFIG.DEFAULT_LANGUAGE,
      isAdmin: Boolean(CONFIG.ADMIN_ID && String(user.telegramId).trim() === CONFIG.ADMIN_ID),
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
  } catch (error) {
    // تسجيل خطأ قاعدة البيانات/الخادم عبر اللوجر وإعادة 500 Internal Server Error
    if (logger && typeof logger.error === 'function') {
      logger.error('خطأ في قاعدة البيانات أو الخادم أثناء تسجيل الدخول في handleLogin:', error);
    } else {
      console.error('خطأ في قاعدة البيانات أو الخادم أثناء تسجيل الدخول في handleLogin:', error);
    }

    return res.status(500).json({
      success: false,
      message: 'حدث خطأ داخلي في الخادم أثناء معالجة تسجيل الدخول (Internal Server Error)'
    });
  }
};

module.exports = {
  handleCheckAdmin,
  handleLogin
};
