// middlewares/auth.js
const crypto = require('crypto');
const User = require('../models/User');

/**
 * ميدل وير للتحقق من صحة بيانات Telegram InitData
 * والمصادقة على طلبات المستخدم عبر HMAC-SHA256
 */
const authMiddleware = async (req, res, next) => {
  try {
    // 1. استلام البيانات من الترويسات (Headers) أو الاستعلام (Query)
    const initDataRaw = req.headers['x-telegram-init-data'] || req.headers['x-init-data'];

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
        message: 'خطأ في إعدادات السيرفر الداخلية'
      });
    }

    // 2. تحليل البيانات (URLSearchParams) واستخراج التوقيع hash
    const urlParams = new URLSearchParams(initDataRaw);
    const hash = urlParams.get('hash');

    if (!hash) {
      return res.status(401).json({
        success: false,
        message: 'غير مصرح: رمز التوقيع (hash) مفقود'
      });
    }

    // إزالة رمز التوقيع hash للحصول على السلسلة الأصلية للبيانات
    urlParams.delete('hash');

    // ترتيب المفاتيح أبجدياً وتنسيقها بأسلوب key=value\n
    const dataCheckString = Array.from(urlParams.entries())
      .map(([key, value]) => `${key}=${value}`)
      .sort()
      .join('\n');

    // 3. التحقق من سلامة التوقيع باستخدام HMAC-SHA256
    // مفتاح التشفير الأولي المعتمد من تيليجرام هو HMAC-SHA256 لـ "WebAppData" باستخدام BOT_TOKEN
    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();

    // حساب التوقيع الصادر بناءً على البيانات المستقبلة
    const calculatedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    // مقارنة التوقيع المحسوب بالتوقيع القادم مع الحماية من هجمات التوقيت (Timing Attacks)
    const isHashValid = crypto.timingSafeEqual(
      Buffer.from(calculatedHash, 'utf-8'),
      Buffer.from(hash, 'utf-8')
    );

    if (!isHashValid) {
      return res.status(401).json({
        success: false,
        message: 'غير مصرح: توقيع البيانات غير صالح أو تم التلاعب به'
      });
    }

    // 4. استخراج كائن المستخدم ورابط الإحالة (start_param)
    const userJson = urlParams.get('user');
    if (!userJson) {
      return res.status(400).json({
        success: false,
        message: 'بيانات المستخدم مفقودة داخل InitData'
      });
    }

    const tgUser = JSON.parse(userJson);
    const startParam = urlParams.get('start_param'); // يحتوي على كود الإحالة إن وجد (مثل ID المُحيل)

    // 5. البحث عن المستخدم في قاعدة البيانات أو إنشائه تلقائياً (Register on the fly)
    let user = await User.findOne({ telegramId: tgUser.id });

    if (!user) {
      let referrerTelegramId = null;

      // التأكد من معرف المُحيل إذا كُتب في start_param
      if (startParam) {
        const parsedRefId = parseInt(startParam, 10);
        if (!isNaN(parsedRefId) && parsedRefId !== tgUser.id) {
          // التحقق من أن حساب المُحيل موجود فعلاً
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
      // تحديث البيانات الشخصية للمستخدم تلقائياً عند تغييرها في تيليجرام
      user.firstName = tgUser.first_name || user.firstName;
      user.lastName = tgUser.last_name || user.lastName;
      user.username = tgUser.username || user.username;
      user.isPremium = Boolean(tgUser.is_premium);
      user.photoUrl = tgUser.photo_url || user.photoUrl;
      await user.save();
    }

    // 6. التحقق مما إذا كان حساب المستخدم محظوراً
    if (user.isBanned) {
      return res.status(403).json({
        success: false,
        message: 'تم حظر حسابك من استخدام النظام. يرجى التواصل مع الدعم الفني.'
      });
    }

    // إرفاق كائن المستخدم بالطلب لاستخدامه في المسارات التالية
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

