const jwt = require('jsonwebtoken');
const CONFIG = require('../config/config');
const logger = require('../config/logger');

/**
 * ميدلوير التوثيق الصارم - يستخرج بيانات المستخدم ويرجع 401 في حال عدم وجود توكن أو عدم صحته
 */
const resolveUserId = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'غير مصرح بالدخول، التوكن مفقود'
      });
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'غير مصرح بالدخول، صيغة التوكن غير صحيحة'
      });
    }

    const decoded = jwt.verify(token, CONFIG.JWT_SECRET);

    const userId = decoded.id || decoded.userId || decoded._id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'بيانات التوثيق داخل التوكن غير صحيحة'
      });
    }

    // حفظ معرف المستخدم داخل req.user بالشكل المطلوب
    req.user = { id: userId, ...decoded };
    req.userId = userId;

    next();
  } catch (err) {
    logger.error('Error in auth middleware:', err.message);
    return res.status(401).json({
      success: false,
      error: 'غير مصرح بالدخول، التوكن غير صالح أو انتهت صلاحيته'
    });
  }
};

/**
 * ميدلوير حماية مسارات الأدمن
 */
const adminMiddleware = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ success: false, error: 'غير مصرح بالدخول' });
    }

    const adminTelegramId = CONFIG.ADMIN_ID;
    const userTelegramId = req.user.telegramId || req.headers['x-admin-id'];

    if (!adminTelegramId || String(userTelegramId) !== String(adminTelegramId)) {
      return res.status(403).json({ success: false, error: '403 Forbidden - صلاحيات الأدمن مطلوبة' });
    }

    req.adminTelegramId = userTelegramId;
    next();
  } catch (err) {
    return res.status(403).json({ success: false, error: '403 Forbidden' });
  }
};

module.exports = {
  resolveUserId,
  adminMiddleware
};
