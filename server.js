// ضع هذه الدوال المساعدة في server.js بدلاً من الدوال القديمة المطابقة:
const normalizeSmartLanguage = (rawLang) => {
  if (!rawLang || typeof rawLang !== 'string') return 'en';
  const clean = rawLang.trim().toLowerCase();
  if (clean === 'ar' || clean.startsWith('ar-') || clean.startsWith('ar_')) {
    return 'ar';
  }
  return 'en';
};

const buildUserSummary = (userDocSnap) => {
  if (!userDocSnap || !userDocSnap.exists) return null;
  const d = userDocSnap.data() || {};
  const firstName = (d.firstName || '').trim();
  const lastName = (d.lastName || '').trim();
  const fullName = [firstName, lastName].filter(Boolean).join(' ') || d.username || 'User';
  const username = (d.username || '').replace(/^@+/, '').trim();
  return {
    telegramId: String(d.telegramId || userDocSnap.id),
    username,
    handle: username ? `@${username}` : '',
    firstName,
    lastName,
    fullName,
    languageCode: normalizeSmartLanguage(d.languageCode)
  };
};
