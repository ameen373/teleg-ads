const crypto = require('crypto');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const envConfig = require('../config/env');
const CONFIG = envConfig.CONFIG || envConfig;
const connectDB = require('../config/db');
const logger = require('../utils/logger');
const { verifyTelegramData, findOrCreateUser } = require('../utils/helpers');
const { User } = require('../models');

/**
 * دالة مساعدة محلية للتحقق من بيانات initData وفك تشفيرها عبر HMAC-SHA256
 */
function parseAndVerifyInitData(initDataRaw, botToken) {
  if (!initDataRaw) return null;

  try {
    if (botToken) {
      const urlParams = new URLSearchParams(initDataRaw);
      const hash = urlParams.get('hash');

      if (hash) {
        urlParams.delete('hash');
        const paramsArray = Array.from(urlParams.entries());
        paramsArray.sort(([a], [b]) => a.localeCompare(b));
        const dataCheckString = paramsArray.map(([k, v]) => `${k}=${v}`).join('\n');

        const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
        const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

        if (calculatedHash.toLowerCase() === hash.toLowerCase()) {
          const userJson = urlParams.get('user');
          if (userJson) {
            return JSON.parse(userJson);
          }
        }
      }
    }
  } catch (err) {
    if (typeof logger?.error === 'function') {
      logger.error('خطأ أثناء فك تشفير initData في authController:', err.message);
    } else {
      console.error('❌ Error verifying initData:', err.message);
    }
  }

  // الاستعانة بالدالة المساعدة في حال تعذر المطابقة المباشرة
  if (typeof verifyTelegramData === 'function') {
    return verifyTelegramData(initDataRaw);
  }

  return null;
}

/**
 * دالة تسجيل الدخول والتسجيل الآلي ببيانات تليجرام (telegramAuth / handleLogin)
 */
const telegramAuth = async (req, res, next) => {
  try {
    await connectDB();
    const botToken = CONFIG.BOT_TOKEN || process.env.BOT_TOKEN;

    const initData = req.headers['x-telegram-init-data'] || 
                     req.headers['telegram-init-data'] || 
                     req.query?.initData || 
                     req.body?.initData || 
                     req.body?.user || 
                     req.query?.user ||
                     req.headers['x-init-data'];

    let telegramUser = parseAndVerifyInitData(initData, botToken);

    // استخراج معرف تليجرام من المصادر المتاحة
    const rawId = telegramUser?.id || 
                  req.body?.telegram_id || req.body?.telegramId || req.body?.userId || req.body?.userld || req.body?.user_id || req.body?.telegramid || req.body?.id || req.body?.tg_id ||
                  req.query?.telegram_id || req.query?.telegramId || req.query?.userId || req.query?.userld || req.query?.user_id || req.query?.telegramid || req.query?.id || req.query?.tg_id ||
                  req.headers['x-user-id'] || req.headers['user-id'] || req.headers['telegramid'] || req.headers['telegram_id'];

    let tgId = rawId ? String(rawId).trim() : null;

    if (!tgId || tgId === 'null' || tgId === 'undefined' || tgId === '' || tgId === 'NaN') {
      return res.status(400).json({ 
        success: false, 
        error: 'لم يتم العثور على معرف التليجرام (Telegram ID) الخاص بك' 
      });
    }

    const { referrerId, ref } = req.body || {};
    const effectiveReferrer = referrerId || ref || null;

    // استخراج اسم المستخدم واللغات
    const currentUsername = telegramUser?.username || `User_${tgId.slice(-4)}`;
    const firstName = telegramUser?.first_name || '';
    const lastName = telegramUser?.last_name || '';
    const userLanguage = telegramUser?.language_code || CONFIG.DEFAULT_LANGUAGE || 'ar';

    let user = await User.findOne({ telegramId: tgId });

    if (user) {
      // تحديث بيانات الملف الشخصي إذا تغيرت في تليجرام
      let isUpdated = false;
      if (telegramUser?.username && user.username !== telegramUser.username) {
        user.username = telegramUser.username;
        isUpdated = true;
      }
      if (firstName && user.firstName !== firstName) {
        user.firstName = firstName;
        isUpdated = true;
      }
      if (lastName && user.lastName !== lastName) {
        user.lastName = lastName;
        isUpdated = true;
      }
      if (isUpdated) {
        await user.save().catch((err) => {
          if (typeof logger?.error === 'function') {
            logger.error('خطأ أثناء تحديث اسم المستخدم عند تسجيل الدخول:', err.message);
          }
        });
      }
    } else {
      // إنشاء مستخدم جديد في حالة عدم وجوده
      if (typeof findOrCreateUser === 'function') {
        user = await findOrCreateUser(
          tgId,
          {
            username: currentUsername,
            firstName: firstName,
            lastName: lastName,
            language: userLanguage
          },
          {
            telegramId: tgId,
            referredBy: mongoose.Types.ObjectId.isValid(effectiveReferrer) ? effectiveReferrer : null
          }
        );
      } else {
        user = await User.create({
          telegramId: tgId,
          username: currentUsername,
          firstName: firstName,
          lastName: lastName,
          language: userLanguage,
          availableBalance: 0,
          pendingBalance: 0,
          referredBy: mongoose.Types.ObjectId.isValid(effectiveReferrer) ? effectiveReferrer : null
        });
      }
    }

    if (!user) {
      return res.status(400).json({ 
        success: false, 
        error: 'فشل إنشاء أو استرجاع بيانات المستخدم' 
      });
    }

    if (user.isBanned) {
      return res.status(403).json({ 
        success: false, 
        error: `حسابك معطل بسبب مخالفة الشروط. للتواصل مع الدعم: ${CONFIG.SUPPORT_USERNAME || ''}` 
      });
    }

    // توليد رمز JWT لتأمين الجلسات
    const jwtSecret = CONFIG.JWT_SECRET || process.env.JWT_SECRET || 'fallback_secret_key';
    const token = jwt.sign(
      { userId: user._id, telegramId: user.telegramId, role: user.role || 'user' },
      jwtSecret,
      { expiresIn: '30d', algorithm: 'HS256' }
    );

    const adminId = String(CONFIG.ADMIN_ID || process.env.ADMIN_ID || '').trim();
    const isAdmin = Boolean(adminId && String(user.telegramId).trim() === adminId);

    return res.json({ 
      success: true, 
      token, 
      userId: user._id,
      user: {
        _id: user._id,
        telegramId: user.telegramId,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        availableBalance: user.availableBalance || 0,
        pendingBalance: user.pendingBalance || 0,
        totalEarned: user.totalEarned || 0,
        referredBy: user.referredBy || null,
        language: user.language || CONFIG.DEFAULT_LANGUAGE || 'ar'
      }, 
      language: user.language || CONFIG.DEFAULT_LANGUAGE || 'ar',
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
    if (typeof logger?.error === 'function') {
      logger.error('❌ [Auth Controller Error] Exception in telegramAuth:', err);
    } else {
      console.error('❌ [Auth Controller Error] Exception in telegramAuth:', err);
    }
    return res.status(500).json({
      success: false,
      error: 'حدث خطأ أثناء عملية تسجيل الدخول',
      details: err.message || 'Unknown Server Exception'
    });
  }
};

/**
 * دالة جلب بيانات المستخدم الحالي (Profile / GetMe)
 */
const getMe = async (req, res) => {
  try {
    await connectDB();
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'غير مصرح للوصول' });
    }

    const adminId = String(CONFIG.ADMIN_ID || process.env.ADMIN_ID || '').trim();
    const isAdmin = Boolean(adminId && String(req.user.telegramId).trim() === adminId);

    return res.json({
      success: true,
      user: req.user,
      isAdmin
    });
  } catch (err) {
    if (typeof logger?.error === 'function') {
      logger.error('❌ [Auth Controller Error] Exception in getMe:', err);
    }
    return res.status(500).json({
      success: false,
      error: 'حدث خطأ أثناء جلب بيانات الملف الشخصي'
    });
  }
};

/**
 * دالة التحقق من صلاحيات الآدمن
 */
const handleCheckAdmin = async (req, res) => {
  try {
    await connectDB();
    const botToken = CONFIG.BOT_TOKEN || process.env.BOT_TOKEN;
    const initData = req.headers['x-telegram-init-data'] || 
                     req.headers['telegram-init-data'] || 
                     req.query?.initData || 
                     req.body?.initData;

    let telegramUser = parseAndVerifyInitData(initData, botToken);
    let telegramIdToCheck = telegramUser ? String(telegramUser.id).trim() : null;

    if (!telegramIdToCheck && req.user) {
      telegramIdToCheck = String(req.user.telegramId).trim();
    }

    const adminId = String(CONFIG.ADMIN_ID || process.env.ADMIN_ID || '').trim();
    const isAdmin = Boolean(adminId && telegramIdToCheck && telegramIdToCheck === adminId);

    return res.json({ success: true, isAdmin });
  } catch (err) {
    if (typeof logger?.error === 'function') {
      logger.error('❌ [Auth Controller Error] Exception in handleCheckAdmin:', err);
    }
    return res.status(500).json({
      success: false,
      isAdmin: false,
      error: 'حدث خطأ أثناء التحقق من صلاحيات الآدمن',
      details: err.message
    });
  }
};

module.exports = {
  telegramAuth,
  handleLogin: telegramAuth, // دعم الاسم القديم والجديد لتجنب التضارب
  getMe,
  handleCheckAdmin
};
