/**
 * Authentication & Admin Gateway Controller
 */

const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const CONFIG = require('../config/config');
const connectDB = require('../config/db');
const { verifyTelegramData } = require('../utils/telegram');
const User = require('../models/User');

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

    let telegramUser = null;
    if (initData) {
      try {
        telegramUser = verifyTelegramData(initData);
      } catch (e) {
        // Ignored
      }
    }

    const rawId = telegramUser?.id || 
                  telegramUser?.telegramId || 
                  req.body?.telegramId || 
                  req.body?.userId || 
                  req.query?.telegramId || 
                  req.query?.userId;

    const telegramIdToCheck = rawId ? String(rawId).trim() : null;

    const isAdmin = Boolean(
      CONFIG.ADMIN_ID && 
      telegramIdToCheck && 
      String(telegramIdToCheck) === String(CONFIG.ADMIN_ID)
    );

    return res.json({ success: true, message: "تمت مراجعة حالة المدير", isAdmin });
  } catch (err) {
    if (logger && typeof logger.error === 'function') {
      logger.error('Error in handleCheckAdmin:', err);
    }
    return res.json({ success: true, message: "غير مصرح كمدير", isAdmin: false });
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

    let telegramUser = null;
    if (initData) {
      try {
        telegramUser = verifyTelegramData(initData);
      } catch (e) {
        // Fallback to body inputs
      }
    }

    const rawInputId = req.body?.telegramId || 
                       req.body?.userId || 
                       req.body?.telegram_id || 
                       req.body?.id || 
                       req.body?.tg_id ||
                       telegramUser?.id || 
                       telegramUser?.telegramId ||
                       req.query?.telegramId || 
                       req.query?.userId || 
                       req.query?.telegram_id ||
                       req.headers?.['x-user-id'] || 
                       req.headers?.['user-id'];

    const tId = rawInputId ? String(rawInputId).trim() : null;

    if (!tId || tId === 'null' || tId === 'undefined' || !/^\d+$/.test(tId)) {
      return res.status(400).json({
        success: false,
        message: 'بيانات غير مكتملة: يُرجى إرسال telegramId أو userId بشكل صحيح'
      });
    }

    const { referrerId } = req.body || {};

    const currentUsername = telegramUser?.username || req.body?.username || `User_${tId.slice(-4)}`;
    const currentFirstName = telegramUser?.firstName || telegramUser?.first_name || req.body?.firstName || '';
    const currentLastName = telegramUser?.lastName || telegramUser?.last_name || req.body?.lastName || '';
    const userLanguage = telegramUser?.languageCode || telegramUser?.language_code || req.body?.language || CONFIG.DEFAULT_LANGUAGE || 'ar';

    let user = null;

    // 1. البحث عن مستخدم موجود أولاً بالشكل الحديث أو القديم
    user = await User.findOne({
      $or: [
        { telegramId: tId },
        { telegram_id: tId }
      ]
    });

    if (user) {
      // 2. تحديث بيانات المستخدم الموجود
      user.telegramId = tId;
      if (currentUsername) user.username = currentUsername;
      if (currentFirstName) user.firstName = currentFirstName;
      if (currentLastName) user.lastName = currentLastName;
      if (userLanguage) user.language = userLanguage;

      try {
        await user.save();
      } catch (saveErr) {
        if (saveErr.code === 11000 || (saveErr.message && saveErr.message.includes('E11000'))) {
          // التعامل مع تعارض اسم المستخدم أو المفتاح المكرر بحذر شديد
          try {
            user.username = `user_${tId}_${Date.now().toString().slice(-4)}`;
            await user.save();
          } catch (retryErr) {
            // جلب الحساب الموجود كخيار أخير لتفادي تعطل السيرفر
            user = await User.findOne({
              $or: [{ telegramId: tId }, { telegram_id: tId }]
            });
          }
        } else {
          throw saveErr;
        }
      }
    } else {
      // 3. مستخدم جديد - الاستعانة بعملية الذرة (Atomic Upsert) لمنع التعارض الموازي E11000
      try {
        const updateFields = {
          telegramId: tId,
          username: currentUsername,
          ...(currentFirstName && { firstName: currentFirstName }),
          ...(currentLastName && { lastName: currentLastName }),
          ...(userLanguage && { language: userLanguage })
        };

        const insertFields = {
          telegramId: tId,
          username: currentUsername,
          firstName: currentFirstName,
          lastName: currentLastName,
          language: userLanguage,
          ...(referrerId && mongoose.Types.ObjectId.isValid(referrerId) ? { referredBy: referrerId } : {})
        };

        user = await User.findOneAndUpdate(
          { telegramId: tId },
          {
            $set: updateFields,$setOnInsert: insertFields
          },
          {
            new: true,
            upsert: true,
            setDefaultsOnInsert: true,
            runValidators: true
          }
        );
      } catch (createErr) {
        if (createErr.code === 11000 || (createErr.message && createErr.message.includes('E11000'))) {
          // إذا حدث تعارض مفتاح مكرر أثناء الإنشاء، نحضر المستخدم المسجل بالفعل
          user = await User.findOne({
            $or: [{ telegramId: tId }, { telegram_id: tId }]
          });
        } else {
          throw createErr;
        }
      }
    }

    if (!user) {
      return res.status(500).json({ 
        success: false, 
        message: 'فشل إنشاء أو تحديث بيانات المستخدم' 
      });
    }

    if (user.isBanned) {
      return res.status(403).json({ 
        success: false, 
        message: `حسابك معطل بسبب مخالفة الشروط. التواصل مع الدعم: ${CONFIG.SUPPORT_USERNAME || ''}` 
      });
    }

    const token = jwt.sign(
      { userId: user._id, telegramId: user.telegramId, role: user.role },
      CONFIG.JWT_SECRET || 'jwt_secret_key',
      { expiresIn: '7d', algorithm: 'HS256' }
    );

    return res.json({ 
      success: true, 
      message: "تم تسجيل الدخول بنجاح",
      token, 
      userId: user._id,
      user, 
      language: user.language || CONFIG.DEFAULT_LANGUAGE || 'ar',
      isAdmin: Boolean(CONFIG.ADMIN_ID && String(user.telegramId) === String(CONFIG.ADMIN_ID)),
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
    if (logger && typeof logger.error === 'function') {
      logger.error('Unexpected Internal Server Error in handleLogin:', err);
    } else {
      console.error('Unexpected Internal Server Error in handleLogin:', err);
    }

    return res.status(500).json({
      success: false,
      message: 'خطأ داخلي في الخادم (Internal Server Error)'
    });
  }
};

module.exports = {
  handleCheckAdmin,
  handleLogin,
  login: handleLogin,
  checkAdmin: handleCheckAdmin
};
