/**
 * Authentication & Admin Gateway Controller
 * Handles Telegram WebApp Login, HMAC Validation & Admin Permission Verification
 * 
 * @file controllers/authController.js
 */

const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const CONFIG = require('../config/config');
const connectDB = require('../config/db');
const { verifyTelegramData } = require('../utils/telegram');
const { User } = require('../models');

/**
 * دالة مساعدة للتحقق مما إذا كان معرف التليجرام يطابق قائمة المسؤولين
 * تدعم المعرف المنفرد أو المعرفات المتعددة المفصولة بفاصلة في Config
 * 
 * @param {string|number} tgId - معرف التليجرام
 * @returns {boolean}
 */
const checkIsAdmin = (tgId) => {
  if (!tgId || !CONFIG.ADMIN_ID) return false;

  const targetId = String(tgId).trim();
  const configuredAdmins = String(CONFIG.ADMIN_ID)
    .split(',')
    .map((id) => id.trim());

  return configuredAdmins.includes(targetId);
};

/**
 * استخراج ترويسة initData من كافة الأماكن المحتملة للطلب
 * 
 * @param {import('express').Request} req
 * @returns {string|null}
 */
const extractInitData = (req) => {
  return (
    req.headers['x-telegram-init-data'] ||
    req.headers['telegram-init-data'] ||
    req.headers['x-init-data'] ||
    req.body?.initData ||
    req.query?.initData ||
    null
  );
};

/**
 * التحقق من صلاحيات المسؤول (Admin Check Controller)
 * GET/POST /api/auth/check-admin
 */
const handleCheckAdmin = async (req, res, next) => {
  try {
    await connectDB();

    const initData = extractInitData(req);

    if (!initData) {
      return res.status(401).json({
        success: false,
        isAdmin: false,
        error: 'بيانات التوثيق مفقودة (initData)'
      });
    }

    const telegramUser = verifyTelegramData(initData);

    if (!telegramUser) {
      return res.status(401).json({
        success: false,
        isAdmin: false,
        error: 'فشل التحقق من صحة توقيع بيانات التليجرام'
      });
    }

    const telegramIdToCheck = String(telegramUser.id || telegramUser.telegramId || '').trim();
    const isAdmin = checkIsAdmin(telegramIdToCheck);

    return res.json({
      success: true,
      isAdmin
    });
  } catch (err) {
    console.error('[Admin Check Error]:', err);
    return res.status(500).json({
      success: false,
      isAdmin: false,
      error: 'حدث خطأ داخلي أثناء التحقق من الصلاحيات'
    });
  }
};

/**
 * بوابة مصادقة التليجرام وتوليد رمزي الوصول (Login Gateway Controller)
 * يقوم بالتحقق من التوقيع الرقمي (HMAC)، مزامنة البيانات (Upsert)، وإصدار JWT Token
 * POST /api/auth/login
 */
const handleLogin = async (req, res, next) => {
  try {
    await connectDB();

    const initData = extractInitData(req);
    let telegramUser = null;

    if (initData) {
      telegramUser = verifyTelegramData(initData);
    }

    const isDevEnvironment =
      process.env.NODE_ENV === 'development' || CONFIG.NODE_ENV === 'development';

    let tgId = null;

    // الاعتماد الصارم على التوقيع الموثق من تليجرام في بيئة الإنتاج
    if (telegramUser && (telegramUser.id || telegramUser.telegramId)) {
      tgId = String(telegramUser.id || telegramUser.telegramId).trim();
    } else if (isDevEnvironment) {
      // السماح بتمرير المعرف يدوياً فقط أثناء التطوير المحلي والاختبار
      const rawFallbackId =
        req.body?.telegram_id ||
        req.body?.telegramId ||
        req.body?.userId ||
        req.body?.id ||
        req.query?.telegram_id ||
        req.query?.telegramId ||
        req.headers['x-user-id'];

      if (rawFallbackId) {
        tgId = String(rawFallbackId).trim();
      }
    }

    // رفض الطلبات غير الموثوقة أو المصطنعة
    if (!tgId || tgId === 'null' || tgId === 'undefined' || tgId === 'NaN' || tgId === '') {
      return res.status(401).json({
        success: false,
        error: 'بيانات المصادقة غير صالحة أو منتهية الصلاحية. يرجى فتح التطبيق عبر التليجرام.'
      });
    }

    const { referrerId } = req.body || {};

    // تنسيق استخراج البيانات القادمة من التليجرام
    const currentUsername = telegramUser?.username || `User_${tgId.slice(-4)}`;
    const currentFirstName = telegramUser?.firstName || telegramUser?.first_name || '';
    const currentLastName = telegramUser?.lastName || telegramUser?.last_name || '';
    const userLanguage =
      telegramUser?.languageCode || telegramUser?.language_code || CONFIG.DEFAULT_LANGUAGE || 'ar';

    // كائن التحديث والتزامن (Upsert Payload)
    const updatePayload = {
      telegramId: tgId,
      username: currentUsername,
      ...(currentFirstName && { firstName: currentFirstName }),
      ...(currentLastName && { lastName: currentLastName }),
      ...(userLanguage && { language: userLanguage }),
      lastLoginAt: new Date()
    };

    const updateOps = {
      $set: updatePayload
    };

    // ربط المحيل فقط عند إنشاء الحساب لأول مرة ومع مراعاة صحة المعرف
    if (referrerId && mongoose.Types.ObjectId.isValid(referrerId)) {
      updateOps.$setOnInsert = { referredBy: referrerId };
    }

    // تحديث أو إنشاء حساب المستخدم تلقائياً
    const user = await User.findOneAndUpdate(
      { telegramId: tgId },
      updateOps,
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true
      }
    );

    if (!user) {
      return res.status(400).json({
        success: false,
        error: 'فشل إنشاء أو تحديث بيانات المستخدم'
      });
    }

    // حماية ضد الإحالة الذاتية (Self-Referral Prevention)
    if (user.referredBy && String(user.referredBy) === String(user._id)) {
      user.referredBy = undefined;
      await user.save();
    }

    // التحقق من حالة حظر الحساب
    if (user.isBanned) {
      return res.status(403).json({
        success: false,
        error: `حسابك معطل بسبب مخالفة الشروط. للتواصل مع الدعم: ${CONFIG.SUPPORT_USERNAME || '@support'}`
      });
    }

    // التحقق من رتبة المسؤول وتحديثها في القاعدة إن لزم الأمر
    const isAdmin = checkIsAdmin(user.telegramId);
    if (isAdmin && user.role !== 'admin') {
      user.role = 'admin';
      await user.save();
    }

    // توقيع رمز JWT محمي بحجم البيانات المطلوب
    const token = jwt.sign(
      {
        userId: user._id,
        telegramId: user.telegramId,
        role: user.role || (isAdmin ? 'admin' : 'user')
      },
      CONFIG.JWT_SECRET || 'default_secret_key',
      { expiresIn: '7d', algorithm: 'HS256' }
    );

    return res.json({
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
