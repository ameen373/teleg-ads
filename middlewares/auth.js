// middlewares/auth.js
const crypto = require('crypto');
const User = require('../models/User');

/**
 * ميدل وير المصادقة للتحقق من التوقيع والتأكد من هويّة المستخدم عبر Telegram InitData
 */
const authMiddleware = async (req, res, next) => {
  try {
    // 1. قراءة الترويسة بمرونة مرئية
    let initDataRaw = req.headers['x-telegram-init-data'] || req.headers['x-init-data'];

    if (!initDataRaw && req.headers.authorization) {
      const authHeader = req.headers.authorization;
      if (authHeader.startsWith('tma ')) {
        initDataRaw = authHeader.substring(4);
      } else {
        initDataRaw = authHeader;
      }
    }

    if (!initDataRaw) {
      return res.status(401).json({
        success: false,
        message: 'غير مصرح: ترويسة Telegram InitData مفقودة'
      });
    }

    const botToken = process.env.BOT_TOKEN;
    if (!botToken) {
      console.error('[Auth Error] BOT_TOKEN غير معرف في متغيرات البيئة');
      return res.status(500).json({
        success: false,
        message: 'خطأ داخلي في إعدادات الخادم'
      });
    }

    // 2. تفكيك السلسلة
    const urlParams = new URLSearchParams(initDataRaw);
    const hash = urlParams.get('hash');

    if (!hash) {
      return res.status(401).json({
        success: false,
        message: 'غير مصرح: رمز التوقيع (hash) مفقود'
      });
    }

    urlParams.delete('hash');

    // ترتيب العناصر أبجدياً وتجهيز السلسلة للمطابقة
    const dataCheckArr = [];
    for (const [key, value] of urlParams.entries()) {
      dataCheckArr.push(`${key}=${value}`);
    }
    dataCheckArr.sort();
    const dataCheckString = dataCheckArr.join('\n');

    // 3. مطابقة التوقيع باستخدام HMAC-SHA256
    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();

    const calculatedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    const isHashValid = crypto.timingSafeEqual(
      Buffer.from(calculatedHash, 'utf-8'),
      Buffer.from(hash, 'utf-8')
    );

    if (!isHashValid) {
      return res.status(401).json({
        success: false,
        message: 'غير مصرح: توقيع البيانات غير صالح'
      });
    }

    // 4. استخراج كائن المستخدم
    const userJson = urlParams.get('user');
    if (!userJson) {
      return res.status(400).json({
        success: false,
        message: 'بيانات المستخدم مفقودة داخل الترويسة'
      });
    }

    const tgUser = JSON.parse(userJson);
    const startParam = urlParams.get('start_param');

    // 5. جلب المستخدم أو تسجيله تلقائياً
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
      user.firstName = tgUser.first_name || user.firstName;
      user.lastName = tgUser.last_name || user.lastName;
      user.username = tgUser.username || user.username;
      user.isPremium = Boolean(tgUser.is_premium);
      user.photoUrl = tgUser.photo_url || user.photoUrl;
      await user.save();
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
      message: 'فشلت عملية المصادقة',
      error: error.message
    });
  }
};

module.exports = authMiddleware;
