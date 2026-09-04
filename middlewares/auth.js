// middlewares/auth.js
const crypto = require('crypto');
const User = require('../models/User');

/**
 * ميدل وير المصادقة والتحقق المتقدم من صحة توقيع Telegram WebApp initData
 */
const authMiddleware = async (req, res, next) => {
  try {
    // 1. استخراج الترويسة بمرونة عالية (Header Inspection)
    let rawInitData = req.headers['x-telegram-init-data'] || req.headers['x-init-data'];

    if (!rawInitData && req.headers.authorization) {
      const authHeader = req.headers.authorization;
      if (authHeader.startsWith('tma ')) {
        rawInitData = authHeader.substring(4).trim();
      } else if (authHeader.startsWith('Bearer ')) {
        rawInitData = authHeader.substring(7).trim();
      } else {
        rawInitData = authHeader.trim();
      }
    }

    if (!rawInitData || rawInitData === 'null' || rawInitData === 'undefined') {
      return res.status(401).json({
        success: false,
        message: 'لم يتم توفير بيانات المصادقة'
      });
    }

    // جلب التوكين من متغيرات البيئة
    const botToken = process.env.BOT_TOKEN;
    if (!botToken) {
      console.error('[Auth Error] BOT_TOKEN غير معرف في متغيرات البيئة');
      return res.status(500).json({
        success: false,
        message: 'خطأ إعدادات السيرفر الداخلي'
      });
    }

    // 2. معالجة وتفكيك سلسلة URL Parameters
    let searchParams;
    try {
      searchParams = new URLSearchParams(
        rawInitData.includes('%3D') || rawInitData.includes('%26')
          ? decodeURIComponent(rawInitData)
          : rawInitData
      );
    } catch (e) {
      searchParams = new URLSearchParams(rawInitData);
    }

    const hash = searchParams.get('hash');
    if (!hash) {
      return res.status(401).json({
        success: false,
        message: 'رمز التوقيع (hash) مفقود من البيانات'
      });
    }

    // حذف hash وإعداد البيانات المتبقية للترتيب والتحقق
    searchParams.delete('hash');
    const dataCheckArr = [];
    const paramsDict = {};

    for (const [key, value] of searchParams.entries()) {
      dataCheckArr.push(`${key}=${value}`);
      paramsDict[key] = value;
    }

    // ترتيب المعلمات أبجدياً حسب معايير تليجرام الرسمية
    dataCheckArr.sort();
    const dataCheckString = dataCheckArr.join('\n');

    // 3. التحقق من التوقيع عبر HMAC-SHA256
    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();

    const calculatedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    // مقارنة آمنة زمنياً لمنع هجمات Timing Attacks
    const calculatedBuffer = Buffer.from(calculatedHash, 'hex');
    const receivedBuffer = Buffer.from(hash, 'hex');

    if (
      calculatedBuffer.length !== receivedBuffer.length ||
      !crypto.timingSafeEqual(calculatedBuffer, receivedBuffer)
    ) {
      console.warn('[Auth Warning] فشل مطابقة توقيع HMAC');
      return res.status(401).json({
        success: false,
        message: 'فشلت عملية المصادقة: توقيع غير صالح'
      });
    }

    // 4. استخراج كائن المستخدم
    const userJson = paramsDict['user'];
    if (!userJson) {
      return res.status(401).json({
        success: false,
        message: 'بيانات المستخدم مفقودة من جلسة تليجرام'
      });
    }

    const tgUser = JSON.parse(userJson);
    let startParam = paramsDict['start_param'] || paramsDict['tgWebAppStartParam'];

    if (startParam && startParam.startsWith('ref_')) {
      startParam = startParam.replace('ref_', '');
    }

    // 5. جلب المستخدم أو إنشاؤه في قاعدة البيانات
    let user = await User.findOne({ telegramId: tgUser.id });

    if (!user) {
      let referrerTelegramId = null;

      if (startParam) {
        const parsedRefId = parseInt(startParam, 10);
        if (!isNaN(parsedRefId) && parsedRefId !== tgUser.id) {
          const referrerExists = await User.exists({ telegramId: parsedRefId });
          if (referrerExists) {
            referrerTelegramId = parsedRefId;
          }
        }
      }

      user = await User.create({
        telegramId: tgUser.id,
        firstName: tgUser.first_name || '',
        lastName: tgUser.last_name || '',
        username: tgUser.username || '',
        isPremium: Boolean(tgUser.is_premium),
        languageCode: tgUser.language_code || 'ar',
        photoUrl: tgUser.photo_url || '',
        referredBy: referrerTelegramId,
        balances: {
          available: 0,
          pending: 0,
          totalEarned: 0,
          referralEarned: 0
        }
      });
    } else {
      // تحديث بيانات المستخدم المزامنة بشكل لحظي
      let isUpdated = false;
      if (tgUser.first_name && user.firstName !== tgUser.first_name) { user.firstName = tgUser.first_name; isUpdated = true; }
      if (tgUser.last_name !== undefined && user.lastName !== tgUser.last_name) { user.lastName = tgUser.last_name || ''; isUpdated = true; }
      if (tgUser.username !== undefined && user.username !== tgUser.username) { user.username = tgUser.username || ''; isUpdated = true; }
      if (user.isPremium !== Boolean(tgUser.is_premium)) { user.isPremium = Boolean(tgUser.is_premium); isUpdated = true; }
      if (tgUser.photo_url && user.photoUrl !== tgUser.photo_url) { user.photoUrl = tgUser.photo_url; isUpdated = true; }

      if (isUpdated) {
        await user.save();
      }
    }

    if (user.isBanned) {
      return res.status(403).json({
        success: false,
        message: 'الحساب محظور من استخدام النظام.'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('[Auth Middleware Error]:', error);
    return res.status(401).json({
      success: false,
      message: 'فشلت عملية المصادقة'
    });
  }
};

module.exports = authMiddleware;
