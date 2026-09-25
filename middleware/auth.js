const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const CONFIG = require('../config/config');
const logger = require('../config/logger');
const connectDB = require('../config/db');
const { User } = require('../models');
const { verifyTelegramData } = require('../utils/telegram');
const { findOrCreateUser } = require('../utils/userHelpers');

/**
 * 1. Middleware المصادقة الصارم وفك شفرة JWT
 * يتحقق من وجود التوكن وإتاحة المستخدم، ويتعامل مع أخطاء JWT بأمان.
 */
const authenticateToken = async (req, res, next) => {
  try {
    await connectDB();

    let token = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }

    const initData = req.headers['x-telegram-init-data'] || 
                     req.headers['telegram-init-data'] || 
                     req.query?.initData || 
                     req.body?.initData;

    let user = null;

    // 1. التحقق عبر Bearer JWT Token
    if (token) {
      try {
        const decoded = jwt.verify(token, CONFIG.JWT_SECRET);
        const jwtUserId = decoded.userId || decoded.id || decoded.telegramId;

        if (jwtUserId) {
          if (mongoose.Types.ObjectId.isValid(jwtUserId)) {
            user = await User.findById(jwtUserId);
          }
          if (!user) {
            user = await User.findOne({ telegramId: String(jwtUserId).trim() });
          }
        }
      } catch (jwtErr) {
        if (jwtErr.name === 'TokenExpiredError') {
          return res.status(401).json({ success: false, error: 'انتهت صلاحية الجلسة، يرجى إعادة تسجيل الدخول' });
        }
        if (jwtErr.name === 'JsonWebTokenError') {
          return res.status(401).json({ success: false, error: 'رمز المصادقة غير صالح' });
        }
        logger.error('Error verifying JWT token:', jwtErr);
        return res.status(401).json({ success: false, error: 'فشل التحقق من رمز المصادقة' });
      }
    } 
    // 2. التحقق البديل عبر Telegram InitData
    else if (initData) {
      const telegramUser = verifyTelegramData(initData);
      if (telegramUser && telegramUser.id) {
        const tgId = String(telegramUser.id).trim();
        user = await User.findOne({ telegramId: tgId });
      }
    }

    if (!user) {
      return res.status(401).json({ success: false, error: '401 Unauthorized - يلزم تسجيل الدخول للوصول لهذا المسار' });
    }

    if (user.isBanned) {
      return res.status(403).json({ success: false, error: 'حسابك معطل بسبب مخالفة الشروط' });
    }

    req.user = user;
    req.userId = user._id;
    return next();
  } catch (err) {
    logger.error('Error in authenticateToken middleware:', err);
    return res.status(500).json({ success: false, error: 'خطأ في المصادقة الداخلية للخادم' });
  }
};

/**
 * 2. Middleware حماية مسارات الأدمن (isAdmin)
 * يتأكد من أن المستخدم يملك صلاحية الأدمن عبر (role === 'admin' أو isAdmin === true أو CONFIG.ADMIN_ID)
 */
const isAdmin = async (req, res, next) => {
  try {
    await connectDB();

    // إذا لم يتم استخدام authenticateToken قبله، نقوم بمحاولة استخراج المستخدم أولاً
    if (!req.user) {
      const authHeader = req.headers.authorization;
      const initData = req.headers['x-telegram-init-data'] || 
                       req.headers['telegram-init-data'] || 
                       req.query?.initData || 
                       req.body?.initData;

      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        try {
          const decoded = jwt.verify(token, CONFIG.JWT_SECRET);
          const jwtUserId = decoded.userId || decoded.id || decoded.telegramId;
          if (jwtUserId) {
            if (mongoose.Types.ObjectId.isValid(jwtUserId)) {
              req.user = await User.findById(jwtUserId);
            }
            if (!req.user) {
              req.user = await User.findOne({ telegramId: String(jwtUserId).trim() });
            }
          }
        } catch (jwtErr) {
          return res.status(401).json({ success: false, error: 'رمز المصادقة غير صالح أو منتهي الصلاحية' });
        }
      } else if (initData) {
        const telegramUser = verifyTelegramData(initData);
        if (telegramUser && telegramUser.id) {
          const tgId = String(telegramUser.id).trim();
          req.user = await User.findOne({ telegramId: tgId });
        }
      }
    }

    if (!req.user) {
      return res.status(401).json({ success: false, error: 'غير مصرح - يجب تسجيل الدخول أولاً' });
    }

    if (req.user.isBanned) {
      return res.status(403).json({ success: false, error: 'حسابك معطل بسبب مخالفة الشروط' });
    }

    // فحص صلاحيات الأدمن بحسب المعايير المحددة
    const isRoleAdmin = req.user.role === 'admin';
    const isFlagAdmin = req.user.isAdmin === true;
    const isConfigAdmin = CONFIG.ADMIN_ID && String(req.user.telegramId).trim() === String(CONFIG.ADMIN_ID).trim();

    if (!isRoleAdmin && !isFlagAdmin && !isConfigAdmin) {
      return res.status(403).json({ success: false, error: '403 Forbidden - صلاحيات الأدمن مطلوبة للوصول' });
    }

    req.adminTelegramId = req.user.telegramId;
    return next();
  } catch (err) {
    logger.error('Error in isAdmin middleware:', err);
    return res.status(403).json({ success: false, error: '403 Forbidden - حدث خطأ أثناء التحقق من الصلاحيات' });
  }
};

/**
 * 3. Middleware مرن لاستخراج هوية المستخدم (تحديد هوية عام/محتوى بوت)
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

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
        const decoded = jwt.verify(token, CONFIG.JWT_SECRET);
        const jwtUserId = decoded.userId || decoded.id || decoded.telegramId;
        if (jwtUserId) {
          if (mongoose.Types.ObjectId.isValid(jwtUserId)) {
            user = await User.findById(jwtUserId);
          }
          if (!user) {
            user = await User.findOne({ telegramId: String(jwtUserId).trim() });
          }
        }
      } catch (jwtErr) {
        logger.warn('JWT verification soft-failed in resolveUserId:', jwtErr.message);
      }
    }

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
              language: telegramUser.language_code || CONFIG.DEFAULT_LANGUAGE
            },
            { telegramId: tgId }
          );
        }
      }
    }

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
              language: CONFIG.DEFAULT_LANGUAGE
            },
            { telegramId: cleanRawId }
          );
        }
      }
    }

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
              language: CONFIG.DEFAULT_LANGUAGE
            },
            { telegramId: possibleTgId }
          );
          if (user) break;
        }
      }
    }

    if (!user) {
      const defaultTgId = '123456789';
      user = await findOrCreateUser(
        defaultTgId,
        {
          username: `User_${defaultTgId.slice(-4)}`,
          language: CONFIG.DEFAULT_LANGUAGE
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
    }

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
          username: 'DefaultUser'
        });
      }
      req.user = fallbackUser;
      req.userId = fallbackUser._id;
      return next();
    } catch (fallbackErr) {
      return res.status(500).json({ success: false, error: 'خطأ في المصادقة الداخلية للخادم' });
    }
  }
};

module.exports = {
  resolveUserId,
  authenticateToken,
  auth: authenticateToken,
  isAdmin,
  adminMiddleware: isAdmin
};
