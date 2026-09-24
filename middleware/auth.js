const crypto = require('crypto');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const CONFIG = env.CONFIG || env;
const connectDB = require('../config/db');
const logger = require('../utils/logger');
const { verifyTelegramData, findOrCreateUser } = require('../utils/helpers');
const { User } = require('../models');

/**
 * دالة مساعدة للتحقق من صحة التوقيع الرقمي (HMAC-SHA256) لبيانات initData القادمة من تليجرام
 * @param {string} initDataRaw البيانات الخام القادمة من تليجرام
 * @param {string} botToken توكن البوت المسجل لدى Telegram
 * @returns {object|null} كائن بيانات المستخدم في حال نجاح التحقق، أو null عند الفشل
 */
function validateTelegramInitData(initDataRaw, botToken) {
  try {
    if (!initDataRaw || !botToken) return null;

    const urlParams = new URLSearchParams(initDataRaw);
    const hash = urlParams.get('hash');
    if (!hash) return null;

    urlParams.delete('hash');

    // ترتيب المعاملات أبجدياً وإنشاء data_check_string
    const paramsArray = Array.from(urlParams.entries());
    paramsArray.sort(([a], [b]) => a.localeCompare(b));
    const dataCheckString = paramsArray.map(([key, value]) => `${key}=${value}`).join('\n');

    // حساب مفتاح التوقيع السري (WebAppData + BOT_TOKEN)
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    // مقارنة التوقيع المحسوب بالتوقيع القادم من تليجرام
    if (calculatedHash.toLowerCase() !== hash.toLowerCase()) {
      return null;
    }

    const userJson = urlParams.get('user');
    if (userJson) {
      return JSON.parse(userJson);
    }

    return {};
  } catch (err) {
    logger.error('خطأ أثناء فحص توقيع Telegram initData:', err.message);
    return null;
  }
}

/**
 * Middleware للتحقق من صحة توكن JWT المرسل في Authorization Header بأسلوب Bearer <token>
 */
const verifyToken = async (req, res, next) => {
  try {
    await connectDB();
    const authHeader = req.headers.authorization || req.headers.Authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'توكن التوثيق مفقود أو بصيغة غير صالحة. يرجى إرسال Bearer token'
      });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'رمز التوثيق مفقود من الترويسة'
      });
    }

    const jwtSecret = CONFIG.JWT_SECRET || process.env.JWT_SECRET || 'secret';
    let decoded;

    try {
      decoded = jwt.verify(token, jwtSecret);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          error: 'انتهت صلاحية رمز التوثيق، يرجى إعادة فتح التطبيق'
        });
      }
      return res.status(401).json({
        success: false,
        error: 'رمز التوثيق (JWT) غير صالح'
      });
    }

    const userId = decoded.userId || decoded.id || decoded.telegramId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'بيانات التوكن غير مكتملة'
      });
    }

    let user = null;
    if (mongoose.Types.ObjectId.isValid(userId)) {
      user = await User.findById(userId);
    }
    if (!user) {
      user = await User.findOne({ telegramId: String(userId).trim() });
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'المستخدم المرتبط بهذا التوكن غير موجود'
      });
    }

    if (user.isBanned) {
      return res.status(403).json({
        success: false,
        error: 'حسابك معطل بسبب مخالفة الشروط'
      });
    }

    req.user = user;
    req.userId = user._id;
    next();
  } catch (err) {
    logger.error('Error in verifyToken middleware:', err);
    return res.status(401).json({
      success: false,
      error: 'حدث خطأ أثناء التوثيق عبر التوكن'
    });
  }
};

/**
 * Middleware للتحقق المباشر والصارم من بيانات initData القادمة من تليجرام عبر HMAC-SHA256
 */
const verifyInitData = async (req, res, next) => {
  try {
    await connectDB();
    const botToken = CONFIG.BOT_TOKEN || process.env.BOT_TOKEN;
    const initData = req.headers['x-telegram-init-data'] || 
                     req.headers['telegram-init-data'] || 
                     req.query?.initData || 
                     req.body?.initData;

    if (!initData) {
      return res.status(401).json({
        success: false,
        error: 'بيانات التوثيق الخاصة بتليجرام (initData) مفقودة'
      });
    }

    let telegramUser = validateTelegramInitData(initData, botToken);

    if (!telegramUser && typeof verifyTelegramData === 'function') {
      telegramUser = verifyTelegramData(initData);
    }

    if (!telegramUser || !telegramUser.id) {
      return res.status(401).json({
        success: false,
        error: 'التوقيع الرقمي لبيانات تليجرام غير صالح أو تم التلاعب به'
      });
    }

    const tgId = String(telegramUser.id).trim();
    let user = await User.findOne({ telegramId: tgId });

    const profileData = {
      username: telegramUser.username || `User_${tgId.slice(-4)}`,
      firstName: telegramUser.first_name || '',
      lastName: telegramUser.last_name || '',
      language: telegramUser.language_code || CONFIG.DEFAULT_LANGUAGE || 'ar'
    };

    if (user) {
      let needsSave = false;
      if (telegramUser.username && user.username !== telegramUser.username) {
        user.username = telegramUser.username;
        needsSave = true;
      }
      if (telegramUser.first_name && user.firstName !== telegramUser.first_name) {
        user.firstName = telegramUser.first_name;
        needsSave = true;
      }
      if (needsSave) {
        await user.save().catch((e) => logger.error('خطأ أثناء تحديث بيانات ملف المستخدم:', e.message));
      }
    } else if (typeof findOrCreateUser === 'function') {
      user = await findOrCreateUser(tgId, profileData, { telegramId: tgId });
    } else {
      user = await User.create({
        telegramId: tgId,
        ...profileData
      });
    }

    if (user.isBanned) {
      return res.status(403).json({ success: false, error: 'حسابك معطل بسبب مخالفة الشروط' });
    }

    req.user = user;
    req.userId = user._id;
    req.telegramUser = telegramUser;
    next();
  } catch (err) {
    logger.error('Error in verifyInitData middleware:', err);
    return res.status(401).json({ success: false, error: 'فشل في المصادقة عبر بيانات تليجرام' });
  }
};

/**
 * Middleware لتحديد وتوثيق هوية المستخدم بمرونة عبر أكثر من طريقة مع تحديث الاسم تلقائياً
 */
const resolveUserId = async (req, res, next) => {
  try {
    await connectDB();
    let user = null;
    const botToken = CONFIG.BOT_TOKEN || process.env.BOT_TOKEN;

    const authHeader = req.headers.authorization || req.headers.Authorization;
    const initData = req.headers['x-telegram-init-data'] || 
                     req.headers['telegram-init-data'] || 
                     req.query?.initData || 
                     req.body?.initData || 
                     req.body?.user || 
                     req.query?.user ||
                     req.headers['x-init-data'];

    const rawUserId = req.headers['x-user-id'] || req.headers['user-id'] || 
                      req.headers['x-user-ld'] || req.headers['user-ld'] || 
                      req.headers['telegramid'] || req.headers['telegram_id'] || 
                      req.headers['x-telegram-id'] || req.headers['telegram-id'] ||
                      req.query?.telegram_id || req.query?.telegramId || 
                      req.query?.userId || req.query?.user_id || 
                      req.query?.userld || req.query?.telegramid || 
                      req.query?.id || req.query?.tg_id || req.query?.telegram_user_id ||
                      req.body?.telegram_id || req.body?.telegramId || 
                      req.body?.userId || req.body?.user_id || 
                      req.body?.userld || req.body?.telegramid || 
                      req.body?.id || req.body?.tg_id || req.body?.telegram_user_id;

    // 1. التوثيق بواسطة JWT Token
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
        const jwtSecret = CONFIG.JWT_SECRET || process.env.JWT_SECRET || 'secret';
        const decoded = jwt.verify(token, jwtSecret);
        const jwtUserId = decoded.userId || decoded.telegramId || decoded.id;

        if (jwtUserId) {
          if (mongoose.Types.ObjectId.isValid(jwtUserId)) {
            user = await User.findById(jwtUserId);
          }
          if (!user) {
            user = await User.findOne({ telegramId: String(jwtUserId).trim() });
          }
        }
      } catch (err) {
        logger.warn('فشل في التحقق من صحة توكن JWT:', err.message);
      }
    }

    // 2. التوثيق بواسطة بيانات تليجرام (Telegram InitData)
    if (!user && initData) {
      let telegramUser = validateTelegramInitData(initData, botToken);
      if (!telegramUser && typeof verifyTelegramData === 'function') {
        telegramUser = verifyTelegramData(initData);
      }

      if (telegramUser && telegramUser.id) {
        const tgId = String(telegramUser.id).trim();
        if (tgId && tgId !== 'null' && tgId !== 'undefined' && tgId !== '' && tgId !== 'NaN') {
          user = await User.findOne({ telegramId: tgId });

          const profileData = {
            username: telegramUser.username || `User_${tgId.slice(-4)}`,
            firstName: telegramUser.first_name || '',
            lastName: telegramUser.last_name || '',
            language: telegramUser.language_code || CONFIG.DEFAULT_LANGUAGE || 'ar'
          };

          if (user) {
            let updated = false;
            if (telegramUser.username && user.username !== telegramUser.username) {
              user.username = telegramUser.username;
              updated = true;
            }
            if (telegramUser.first_name && user.firstName !== telegramUser.first_name) {
              user.firstName = telegramUser.first_name;
              updated = true;
            }
            if (updated) {
              await user.save().catch((e) => logger.error('خطأ أثناء حفظ التحديثات:', e.message));
            }
          } else if (typeof findOrCreateUser === 'function') {
            user = await findOrCreateUser(tgId, profileData, { telegramId: tgId });
          } else {
            user = await User.create({
              telegramId: tgId,
              ...profileData
            });
          }
        }
      }
    }

    // 3. التوثيق بواسطة معرف المستخدم المباشر (Raw User ID / Telegram ID)
    if (!user && rawUserId) {
      const cleanRawId = String(rawUserId).trim();
      if (cleanRawId && cleanRawId !== 'null' && cleanRawId !== 'undefined' && cleanRawId !== '' && cleanRawId !== 'NaN') {
        if (mongoose.Types.ObjectId.isValid(cleanRawId)) {
          user = await User.findById(cleanRawId);
        }
        if (!user) {
          user = await User.findOne({ telegramId: cleanRawId });
        }
        if (!user && typeof findOrCreateUser === 'function') {
          user = await findOrCreateUser(
            cleanRawId,
            {
              username: `User_${cleanRawId.slice(-4)}`,
              language: CONFIG.DEFAULT_LANGUAGE || 'ar'
            },
            { telegramId: cleanRawId }
          );
        }
      }
    }

    // 4. البحث في باقي المعاملات (Parameters)
    if (!user) {
      const allParams = { ...(req.query || {}), ...(req.body || {}) };
      for (const key of Object.keys(allParams)) {
        const val = allParams[key];
        if (val && (typeof val === 'number' || /^\d{5,15}$/.test(String(val)))) {
          const possibleTgId = String(val).trim();
          if (typeof findOrCreateUser === 'function') {
            user = await findOrCreateUser(
              possibleTgId,
              {
                username: `User_${possibleTgId.slice(-4)}`,
                language: CONFIG.DEFAULT_LANGUAGE || 'ar'
              },
              { telegramId: possibleTgId }
            );
          } else {
            user = await User.findOne({ telegramId: possibleTgId });
          }
          if (user) break;
        }
      }
    }

    // 5. استخدام حساب افتراضي كخيار أخير عند عدم التمكن من تحديد هوية المستخدم
    if (!user) {
      const defaultTgId = '123456789';
      user = await User.findOne({ telegramId: defaultTgId });
      if (!user) {
        user = new User({
          telegramId: defaultTgId,
          username: 'DefaultUser',
          availableBalance: 0,
          pendingBalance: 0
        });
        await user.save().catch(() => {});
      }
    }

    // التحقق مما إذا كان الحساب محظوراً
    if (user && user.isBanned) {
      return res.status(403).json({ success: false, error: 'حسابك معطل بسبب مخالفة الشروط' });
    }

    req.user = user;
    req.userId = user ? user._id : null;
    next();
  } catch (err) {
    logger.error('Error in resolveUserId middleware:', err);
    try {
      let fallbackUser = await User.findOne({ telegramId: '123456789' });
      if (!fallbackUser) {
        fallbackUser = await User.create({
          telegramId: '123456789',
          username: 'DefaultUser',
          availableBalance: 0,
          pendingBalance: 0
        });
      }
      req.user = fallbackUser;
      req.userId = fallbackUser._id;
      return next();
    } catch (fallbackErr) {
      logger.error('Error in fallback authentication:', fallbackErr);
      return res.status(500).json({ success: false, error: 'خطأ في المصادقة الداخلية للخادم' });
    }
  }
};

/**
 * Middleware للتحقق من صلاحيات المدير (Admin)
 */
const adminMiddleware = async (req, res, next) => {
  try {
    await connectDB();
    const botToken = CONFIG.BOT_TOKEN || process.env.BOT_TOKEN;
    const initData = req.headers['x-telegram-init-data'] || 
                     req.headers['telegram-init-data'] || 
                     req.query?.initData || 
                     req.body?.initData;
    let telegramId = null;

    if (initData) {
      let telegramUser = validateTelegramInitData(initData, botToken);
      if (!telegramUser && typeof verifyTelegramData === 'function') {
        telegramUser = verifyTelegramData(initData);
      }
      if (telegramUser && telegramUser.id) {
        telegramId = String(telegramUser.id).trim();
      }
    }

    if (!telegramId && req.user) {
      telegramId = String(req.user.telegramId).trim();
    }

    if (!telegramId) {
      const rawUserId = req.headers['x-user-id'] || req.headers['user-id'] || 
                        req.headers['telegramid'] || req.headers['telegram_id'] || 
                        req.headers['x-telegram-id'] || req.headers['telegram-id'];
      if (rawUserId) {
        telegramId = String(rawUserId).trim();
      }
    }

    const adminId = String(CONFIG.ADMIN_ID || process.env.ADMIN_ID || '').trim();

    if (!adminId || !telegramId || telegramId !== adminId) {
      return res.status(403).json({ success: false, error: '403 Forbidden - صلاحيات الأدمن مطلوبة' });
    }

    req.adminTelegramId = telegramId;
    next();
  } catch (err) {
    logger.error('Error in adminMiddleware:', err);
    return res.status(403).json({ success: false, error: '403 Forbidden' });
  }
};

module.exports = {
  resolveUserId,
  verifyToken,
  verifyInitData,
  validateTelegramInitData,
  adminMiddleware
};
