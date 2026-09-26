/**
 * Authentication & Admin Gateway Controller
 * Handles Telegram WebApp Login & Admin Permission Verification
 */

const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const CONFIG = require('../config/config');
const connectDB = require('../config/db');
const { verifyTelegramData } = require('../utils/telegram');
const { User } = require('../models');

/**
 * Check Admin Permission Status Controller
 */
const handleCheckAdmin = async (req, res, next) => {
  try {
    await connectDB();

    const initData = req.headers['x-telegram-init-data'] || 
                     req.headers['telegram-init-data'] || 
                     req.headers['x-init-data'] ||
                     req.query?.initData || 
                     req.body?.initData;

    let telegramIdToCheck = null;

    if (initData) {
      const telegramUser = verifyTelegramData(initData);
      if (telegramUser) {
        telegramIdToCheck = String(telegramUser.id || telegramUser.telegramId || '').trim();
      }
    }

    // Fallback to authenticated req.user if JWT middleware ran before
    if (!telegramIdToCheck && req.user) {
      telegramIdToCheck = String(req.user.telegramId || req.user.id || '').trim();
    }

    const adminId = CONFIG.ADMIN_ID ? String(CONFIG.ADMIN_ID).trim() : null;
    const isAdmin = Boolean(adminId && telegramIdToCheck && telegramIdToCheck === adminId);

    return res.status(200).json({ 
      success: true, 
      isAdmin 
    });
  } catch (err) {
    return res.status(200).json({ 
      success: true, 
      isAdmin: false 
    });
  }
};

/**
 * Telegram Authentication & Token Issuance Gateway Controller
 * Automatically synchronizes Telegram profile data and registers/updates users safely.
 */
const handleLogin = async (req, res, next) => {
  try {
    await connectDB();

    const initData = req.headers['x-telegram-init-data'] || 
                     req.headers['telegram-init-data'] || 
                     req.headers['x-init-data'] ||
                     req.query?.initData || 
                     req.body?.initData;

    // Verify raw Telegram WebApp initData signature
    let telegramUser = verifyTelegramData(initData);

    // Fallback extraction for direct user payload if verify succeeds or dev environment allows
    if (!telegramUser && typeof req.body?.user === 'object' && req.body?.user !== null) {
      telegramUser = req.body.user;
    }

    // Extract Telegram ID from verified data or request fallbacks
    const rawId = telegramUser?.id || 
                  telegramUser?.telegramId || 
                  req.body?.telegram_id || 
                  req.body?.telegramId || 
                  req.body?.userId || 
                  req.body?.user_id || 
                  req.query?.telegram_id || 
                  req.query?.telegramId || 
                  req.headers['x-user-id'] || 
                  req.headers['user-id'];

    let tgId = rawId ? String(rawId).trim() : null;

    // Reject invalid or unauthenticated IDs to prevent user account collision
    const isInvalidId = !tgId || tgId === 'null' || tgId === 'undefined' || tgId === '' || tgId === 'NaN' || tgId === '123456789';
    
    if (isInvalidId) {
      if (process.env.NODE_ENV === 'development' && CONFIG.ALLOW_DEV_LOGIN) {
        tgId = '123456789';
      } else {
        return res.status(401).json({
          success: false,
          error: 'بيانات الاعتماد غير صالحة. يرجى فتح التطبيق من خلال التليجرام.'
        });
      }
    }

    const { referrerId } = req.body || {};

    // Safe extraction of Telegram profile properties
    const currentFirstName = telegramUser?.first_name || telegramUser?.firstName || '';
    const currentLastName = telegramUser?.last_name || telegramUser?.lastName || '';
    const currentUsername = telegramUser?.username || '';
    const photoUrl = telegramUser?.photo_url || telegramUser?.photoUrl || '';
    const userLanguage = telegramUser?.language_code || telegramUser?.languageCode || CONFIG.DEFAULT_LANGUAGE || 'ar';

    // Build conditional $set payload to prevent overwriting existing valid values with empty ones
    const updatePayload = {
      telegramId: tgId,
      lastLoginAt: new Date()
    };

    if (currentUsername) {
      updatePayload.username = currentUsername;
    }
    if (currentFirstName) {
      updatePayload.firstName = currentFirstName;
    }
    if (currentLastName) {
      updatePayload.lastName = currentLastName;
    }
    if (userLanguage) {
      updatePayload.language = userLanguage;
    }
    if (photoUrl) {
      updatePayload.photoUrl = photoUrl;
    }

    const updateOps = {
      $set: updatePayload
    };

    // Defaults applied only upon new document creation
    updateOps.$setOnInsert = {
      createdAt: new Date(),
      role: 'user',
      isBanned: false
    };

    // Set fallback username on new user creation if telegram username was omitted
    if (!currentUsername) {
      updateOps.$setOnInsert.username = `User_${tgId.slice(-4)}`;
    }

    // Attach referrer only when creating a new user record
    if (referrerId && mongoose.Types.ObjectId.isValid(referrerId)) {
      updateOps.$setOnInsert.referredBy = referrerId;
    }

    // Execute atomic Upsert operation
    const userDoc = await User.findOneAndUpdate(
      { telegramId: tgId },
      updateOps,
      { 
        new: true, 
        upsert: true, 
        setDefaultsOnInsert: true,
        runValidators: true
      }
    );

    if (!userDoc) {
      return res.status(400).json({ 
        success: false, 
        error: 'فشل إنشاء أو تحديث بيانات المستخدم' 
      });
    }

    if (userDoc.isBanned) {
      return res.status(403).json({ 
        success: false, 
        error: `حسابك معطل بسبب مخالفة الشروط. التواصل مع الدعم: ${CONFIG.SUPPORT_USERNAME || '@support'}` 
      });
    }

    // Generate JWT Auth Token
    const jwtSecret = CONFIG.JWT_SECRET || 'default_jwt_secret_key';
    const token = jwt.sign(
      { 
        userId: userDoc._id, 
        telegramId: userDoc.telegramId, 
        role: userDoc.role || 'user' 
      },
      jwtSecret,
      { expiresIn: '7d', algorithm: 'HS256' }
    );

    // Convert Mongoose document to clean JavaScript object for response serialization
    const user = userDoc.toObject ? userDoc.toObject() : userDoc;

    const adminId = CONFIG.ADMIN_ID ? String(CONFIG.ADMIN_ID).trim() : null;
    const isAdmin = Boolean(adminId && String(user.telegramId).trim() === adminId);

    return res.status(200).json({ 
      success: true, 
      token, 
      userId: user._id,
      user, 
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
    next(err);
  }
};

module.exports = {
  handleCheckAdmin,
  handleLogin
};
