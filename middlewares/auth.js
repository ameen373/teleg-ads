// middlewares/auth.js
const crypto = require('crypto');
const User = require('../models/User');

/**
 * ميدل وير المصادقة والتحقق من صحة توقيع Telegram InitData
 */
const authMiddleware = async (req, res, next) => {
  try {
    // 1. استخراج الترويسة بمرونة (Header Inspection)
    let initDataRaw = req.headers['x-telegram-init-data'] || req.headers['x-init-data'];

    if (!initDataRaw && req.headers.authorization) {
      const authHeader = req.headers.authorization;
      if (authHeader.startsWith('tma ')) {
        initDataRaw = authHeader.substring(4).trim();
      } else if (authHeader.startsWith('Bearer ')) {
        initDataRaw = authHeader.substring(7).trim();
      } else {
        initDataRaw = authHeader.trim();
      }
    }

    if (!initDataRaw) {
      return res.status(401).json({ message: 'فشلت عملية المصادقة' });
    }

    const botToken = process.env.BOT_TOKEN;
    if (!botToken) {
      console.error('[Auth Error] BOT_TOKEN غير معرف في متغيرات البيئة');
      return res.status(401).json({ message: 'فشلت عملية المصادقة' });
    }

    // 2. تحليل سلسلة URL parameters
    const searchParams = new URLSearchParams(initDataRaw);
    const hash = searchParams.get('hash');

    if (!hash) {
      return res.status(401).json({ message: 'فشلت عملية المصادقة' });
    }

    // إزالة hash وإعداد البيانات المتبقية للترتيب
    searchParams.delete('hash');
    const dataCheckArr = [];
    const paramsDict = {};

    for (const [key, value] of searchParams.entries()) {
      dataCheckArr.push(`${key}=${value}`);
      paramsDict[key] = value;
    }

    // ترتيب المعلمات أبجدياً
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

    // المقارنة الآمنة زمنياً
    const calculatedBuffer = Buffer.from(calculatedHash, 'utf-8');
    const receivedBuffer = Buffer.from(hash, 'utf-8');

    if (
      calculatedBuffer.length !== receivedBuffer.length ||
      !crypto.timingSafeEqual(calculatedBuffer, receivedBuffer)
    ) {
      return res.status(401).json({ message: 'فشلت عملية المصادقة' });
    }

    // 4. استخراج كائن المستخدم
    const userJson = paramsDict['user'];
    if (!userJson) {
      return res.status(401).json({ message: 'فشلت عملية المصادقة' });
    }

    const tgUser = JSON.parse(userJson);
    let startParam = paramsDict['start_param'] || paramsDict['tgWebAppStartParam'];

    // التعامل مع قوالب الإحالة ref_123456
    if (startParam && startParam.startsWith('ref_')) {
      startParam = startParam.replace('ref_', '');
    }

    // 5. جلب المستخدم أو إنشاؤه عند تسجيل الدخول الأول
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
        referredBy: referrerTelegramId
      });
    } else {
      // تحديث بيانات الملف الشخصي باستمرار عند التغيير
      user.firstName = tgUser.first_name || user.firstName;
      user.lastName = tgUser.last_name || user.lastName;
      user.username = tgUser.username || user.username;
      user.isPremium = Boolean(tgUser.is_premium);
      user.photoUrl = tgUser.photo_url || user.photoUrl;
      await user.save();
    }

    if (user.isBanned) {
      return res.status(403).json({ message: 'الحساب محظور من استخدام النظام.' });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('[Auth Middleware Error]:', error);
    return res.status(401).json({ message: 'فشلت عملية المصادقة' });
  }
};

module.exports = authMiddleware;
