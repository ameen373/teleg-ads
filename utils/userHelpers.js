const { User } = require('../models');

/**
 * استخراج معرّف التليجرام (telegramId) بأمان كنص نظيف
 */
function getSafeTelegramId(input) {
  if (!input) return null;
  
  let rawId = input;
  if (typeof input === 'object') {
    rawId = input.telegramId || input.id || input._id || input.userId || input.user_id;
  }
  
  const cleanId = String(rawId).trim();
  if (!cleanId || ['null', 'undefined', '', 'NaN'].includes(cleanId)) {
    return null;
  }
  return cleanId;
}

/**
 * استخراج اسم المستخدم (username) بأمان مع توفير اسم افتراضي عند عدم الوجود
 */
function getSafeUsername(user, fallback = null) {
  if (!user) return fallback || 'المستخدم';
  
  const rawUsername = typeof user === 'string' ? user : (user.username || user.userName);
  if (rawUsername && typeof rawUsername === 'string') {
    const cleaned = rawUsername.trim().replace(/^@/, '');
    if (cleaned) return cleaned;
  }
  
  const tgId = getSafeTelegramId(user);
  if (tgId) {
    return `User_${tgId.slice(-4)}`;
  }
  
  return fallback || 'مستخدم_غير_معروف';
}

/**
 * استخراج اسم العرض (DisplayName) المناسب (الاسم الأول واللقب، أو اسم المستخدم، أو رقم المعرف)
 */
function getSafeDisplayName(user) {
  if (!user) return 'مستخدم غير معروف';

  const firstName = (user.firstName || user.first_name || '').trim();
  const lastName = (user.lastName || user.last_name || '').trim();

  const fullName = [firstName, lastName].filter(Boolean).join(' ');
  if (fullName) return fullName;

  const username = getSafeUsername(user, null);
  if (username && !username.startsWith('User_')) {
    return `@${username}`;
  }

  const tgId = getSafeTelegramId(user);
  return tgId ? `مستخدم #${tgId.slice(-4)}` : 'مستخدم';
}

/**
 * تنسيق وتوحيد كائن بيانات المستخدم بالكامل لضمان توفر كافة الحقول الرئيسية بدون أخطاء
 */
function formatUserProfile(user) {
  if (!user) return null;
  const userObj = typeof user.toObject === 'function' ? user.toObject() : user;
  const tgId = getSafeTelegramId(userObj);

  return {
    ...userObj,
    telegramId: tgId,
    username: getSafeUsername(userObj),
    firstName: (userObj.firstName || userObj.first_name || '').trim(),
    lastName: (userObj.lastName || userObj.last_name || '').trim(),
    displayName: getSafeDisplayName(userObj)
  };
}

/**
 * البحث عن مستخدم أو إنشاؤه في قاعدة البيانات بأمان
 */
async function findOrCreateUser(tgId, updateData = {}, setOnInsertData = {}) {
  const cleanId = getSafeTelegramId(tgId);
  if (!cleanId) return null;

  try {
    return await User.findOneAndUpdate(
      { telegramId: cleanId },
      {
        $setOnInsert: { telegramId: cleanId, ...setOnInsertData },$set: updateData
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } catch (err) {
    if (err.code === 11000) {
      return await User.findOne({ telegramId: cleanId });
    }
    throw err;
  }
}

module.exports = {
  getSafeTelegramId,
  getSafeUsername,
  getSafeDisplayName,
  formatUserProfile,
  findOrCreateUser
};
