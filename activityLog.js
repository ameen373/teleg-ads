// activityLog.js - وحدات تسجيل الأنشطة لمشروع Telega.ads
const { ActivityLog } = require('./models.js');

/**
 * دالة استخراج عنوان الـ IP الحقيقي من الطلب
 * @param {Object} req - كائن الطلب من Express
 * @returns {string} - عنوان الـ IP
 */
const extractIp = (req) => {
  if (!req) return null;
  
  // التحقق من الهيدرز في حالة استخدام بروكسي أو Vercel/Cloudflare
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  
  return (
    req.headers['x-real-ip'] ||
    req.socket?.remoteAddress ||
    req.ip ||
    null
  );
};

/**
 * تسجيل نشاط المستخدم بدون إبطاء السيرفر (Non-blocking Async)
 * 
 * @param {Object} params - معلمات النشاط
 * @param {string|number} params.userId - معرف المستخدم
 * @param {string} params.action - اسم الإجراء (مثل: CREATE_LINK, WITHDRAW_REQUEST)
 * @param {string} [params.category='GENERAL'] - تصنيف الإجراء (LINKS, CAMPAIGN, WALLET, WITHDRAW, DEPOSIT)
 * @param {Object} [params.details={}] - تفاصيل إضافية عن الإجراء
 * @param {Object} [params.req=null] - كائن الطلب لاستخراج البيانات تلقائياً
 * @param {string} [params.status='SUCCESS'] - حالة الإجراء (SUCCESS, FAILED, PENDING)
 */
const logActivity = ({
  userId,
  action,
  category = 'GENERAL',
  details = {},
  req = null,
  status = 'SUCCESS'
}) => {
  // استخدام setImmediate لضمان تنفيذ التسجيل في الخلفية وعدم تعطيل الدورة الأساسية للأحداث (Event Loop)
  setImmediate(async () => {
    try {
      if (!userId || !action) {
        return;
      }

      // استخراج الـ IP والـ User-Agent تلقائياً إذا تم تمرير req
      const ipAddress = extractIp(req);
      const userAgent = req?.headers ? req.headers['user-agent'] : null;

      const logData = {
        userId,
        action,
        category,
        details,
        status,
        ipAddress,
        userAgent,
        createdAt: new Date()
      };

      // الحفظ في قاعدة البيانات
      await ActivityLog.create(logData);
    } catch (error) {
      // التعامل مع الأخطاء داخلياً وتسجيلها في الكونسول دون إيقاف السيرفر
      console.error('[ActivityLog Error]:', error.message);
    }
  });
};

module.exports = {
  logActivity
};
