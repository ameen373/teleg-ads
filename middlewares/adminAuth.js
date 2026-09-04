// middlewares/adminAuth.js

/**
 * ميدل وير للتحقق من صلاحيات الآدمين (المدير)
 * يجب أن يتم استدعاء هذا الميدل وير بعد authMiddleware لضمان وجود req.user
 */
const adminAuth = (req, res, next) => {
  // التحقق أولاً من وجود كائن المستخدم
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'غير مصرح: بيانات المستخدم مفقودة'
    });
  }

  // قراءة قائمة الآدمين من متغيرات البيئة وتحويلها إلى مصفوفة أرقام
  const adminIdsString = process.env.ADMIN_ID || process.env.ADMIN_IDS || '';
  
  const adminIdsArray = adminIdsString
    .split(',')
    .map(id => parseInt(id.trim(), 10))
    .filter(id => !isNaN(id));

  // التحقق من الشرطين:
  // 1. هل دور المستخدم في قاعدة البيانات هو 'admin'؟
  // 2. أو هل الـ telegramId الخاص بالمستخدم موجود ضمن مصفوفة الآدمين في ملف .env؟
  const isRoleAdmin = req.user.role === 'admin';
  const isIdAdmin = adminIdsArray.includes(Number(req.user.telegramId));

  if (isRoleAdmin || isIdAdmin) {
    return next();
  }

  return res.status(403).json({
    success: false,
    message: 'غير مصرح لك بالوصول لهذا القسم'
  });
};

module.exports = adminAuth;
