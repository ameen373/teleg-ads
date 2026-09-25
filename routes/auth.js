/**
 * Authentication & Admin Gateway Router
 * Handles Telegram WebApp Login & Admin Permission Verification
 */

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const CONFIG = require('../config/config');
const connectDB = require('../config/db');
const { verifyTelegramData } = require('../utils/telegram');
const { findOrCreateUser } = require('../utils/userHelpers');
const { User } = require('../models');

/**
 * Check Admin Permission Status
 */
const handleCheckAdmin = async (req, res) => {
  try {
    await connectDB();
    const initData = req.headers['x-telegram-init-data'] || 
                     req.headers['telegram-init-data'] || 
                     req.query?.initData || 
                     req.body?.initData;

    const telegramUser = verifyTelegramData(initData);
    const telegramIdToCheck = telegramUser ? String(telegramUser.id).trim() : null;

    const isAdmin = Boolean(CONFIG.ADMIN_ID && telegramIdToCheck && telegramIdToCheck === CONFIG.ADMIN_ID);
    return res.json({ success: true, isAdmin });
  } catch (err) {
    return res.json({ success: true, isAdmin: false });
  }
};

router.all('/api/check-admin', handleCheckAdmin);
router.all('/check-admin', handleCheckAdmin);

/**
 * Telegram Authentication & Token Issuance Gateway
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

    const rawId = telegramUser?.id || 
                  req.body?.telegram_id || req.body?.telegramId || req.body?.userId || req.body?.userld || req.body?.user_id || req.body?.telegramid || req.body?.id || req.body?.tg_id ||
                  req.query?.telegram_id || req.query?.telegramId || req.query?.userId || req.query?.userld || req.query?.user_id || req.query?.telegramid || req.query?.id || req.query?.tg_id ||
                  req.headers['x-user-id'] || req.headers['user-id'] || req.headers['telegramid'] || req.headers['telegram_id'];

    let tgId = rawId ? String(rawId).trim() : null;

    if (!tgId || tgId === 'null' || tgId === 'undefined' || tgId === '' || tgId === 'NaN') {
      tgId = '123456789';
    }

    const { referrerId } = req.body || {};

    const currentUsername = telegramUser?.username || `User_${tgId.slice(-4)}`;
    const userLanguage = telegramUser?.language_code || CONFIG.DEFAULT_LANGUAGE;

    const user = await findOrCreateUser(
      tgId,
      {
        username: currentUsername,
        language: userLanguage,
        ...(telegramUser?.first_name && { firstName: telegramUser.first_name }),
        ...(telegramUser?.last_name && { lastName: telegramUser.last_name })
      },
      {
        telegramId: tgId,
        referredBy: mongoose.Types.ObjectId.isValid(referrerId) ? referrerId : null
      }
    );

    if (!user) {
      return res.status(400).json({ 
        success: false, 
        error: 'فشل إنشاء أو استرجاع بيانات المستخدم' 
      });
    }

    if (user.isBanned) {
      return res.status(403).json({ 
        success: false, 
        error: `حسابك معطل بسبب مخالفة الشروط. التواصل مع الدعم: ${CONFIG.SUPPORT_USERNAME}` 
      });
    }

    const token = jwt.sign(
      { userId: user._id, telegramId: user.telegramId, role: user.role },
      CONFIG.JWT_SECRET,
      { expiresIn: '7d', algorithm: 'HS256' }
    );

    res.json({ 
      success: true, 
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
  } catch (err) {
    next(err);
  }
};

router.post('/api/auth/login', handleLogin);
router.post('/auth/login', handleLogin);
router.post('/api/login', handleLogin);
router.post('/login', handleLogin);

module.exports = router;
