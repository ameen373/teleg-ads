const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const CONFIG = env.CONFIG || env;
const connectDB = require('../config/db');
const logger = require('../utils/logger');
const { verifyTelegramData, findOrCreateUser } = require('../utils/helpers');
const { User } = require('../models');

/**
 * Middleware لتحديد وتوثيق هوية المستخدم استناداً إلى:
 * 1. JWT Token (Header: Authorization)
 * 2. Telegram InitData (Header/Query/Body)
 * 3. User / Telegram ID (Header/Query/Body)
 */
const resolveUserId = async (req, res, next) => {
  try {
    await connectDB();
    let user = null;

    const authHeader = req.headers.authorization;
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
      const telegramUser = verifyTelegramData(initData);
      if (telegramUser && telegramUser.id) {
        const tgId = String(telegramUser.id).trim();
        if (tgId && tgId !== 'null' && tgId !== 'undefined' && tgId !== '' && tgId !== 'NaN') {
          user = await findOrCreateUser(
            tgId,
            {
              username: telegramUser.username || `User_${tgId.slice(-4)}`,
              firstName: telegramUser.first_name || '',
              lastName: telegramUser.last_name || '',
              language: telegramUser.language_code || CONFIG.DEFAULT_LANGUAGE || 'ar'
            },
            { telegramId: tgId }
          );
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
        if (!user) {
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
          user = await findOrCreateUser(
            possibleTgId,
            {
              username: `User_${possibleTgId.slice(-4)}`,
              language: CONFIG.DEFAULT_LANGUAGE || 'ar'
            },
            { telegramId: possibleTgId }
          );
          if (user) break;
        }
      }
    }

    // 5. استخدام حساب افتراضي كخيار أخير عند عدم التمكن من تحديد هوية المستخدم
    if (!user) {
      const defaultTgId = '123456789';
      user = await findOrCreateUser(
        defaultTgId,
        {
          username: `User_${defaultTgId.slice(-4)}`,
          language: CONFIG.DEFAULT_LANGUAGE || 'ar'
        },
        { telegramId: defaultTgId }
      );
    }

    if (!user) {
      user = new User({
        telegramId: '123456789',
        username: 'DefaultUser',
        availableBalance: 0,
        pendingBalance: 0
      });
      await user.save().catch(() => {});
    }

    // التحقق مما إذا كان الحساب محظوراً
    if (user.isBanned) {
      return res.status(403).json({ success: false, error: 'حسابك معطل بسبب مخالفة الشروط' });
    }

    req.user = user;
    req.userId = user._id;
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
    const initData = req.headers['x-telegram-init-data'] || 
                     req.headers['telegram-init-data'] || 
                     req.query?.initData || 
                     req.body?.initData;
    let telegramId = null;

    if (initData) {
      const telegramUser = verifyTelegramData(initData);
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

    const adminId = String(CONFIG.ADMIN_ID || '').trim();

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
  adminMiddleware
};
