export const state = {
  API_BASE: window.location.protocol.startsWith('file') 
    ? 'http://localhost:3000' 
    : window.location.origin,
  authToken: localStorage.getItem('authToken'),
  currentSessionId: null,
  bridgeToken: null,
  bridgeStartTime: Date.now(),
  isUserAdmin: false,
  tg: window.Telegram?.WebApp || null,
  currentUserTelegramId: null,
  storedTelegramId: localStorage.getItem('telegramId'),
  rawUserLinksCache: [],
  bridgeDestinationUrl: null,
  currentShortCode: null,
  currentLang: localStorage.getItem('appLang') || 'ar',
  user: null,
  activeTab: 'dashboard',
  ads: [],
  wallet: {}
};

// ربط كائن الحالة بالنطاق العام window لسهولة الوصول المباشر
window.state = state;

// تهيئة معرّف التليجرام
if (state.tg?.initDataUnsafe?.user?.id) {
  state.currentUserTelegramId = String(state.tg.initDataUnsafe.user.id);
  localStorage.setItem('telegramId', state.currentUserTelegramId);
} else {
  state.currentUserTelegramId = state.storedTelegramId || null;
}

// تصدير القاموس الموحد المربوط بالنطاق العام
export const i18n = window.i18n || {};

// دالة مساعدة للحصول على النصوص المترجمة حسب اللغة الحالية
export function getText(key) {
  const lang = state.currentLang || 'ar';
  if (window.i18n && window.i18n[lang] && window.i18n[lang][key]) {
    return window.i18n[lang][key];
  }
  if (window.i18n && window.i18n['ar'] && window.i18n['ar'][key]) {
    return window.i18n['ar'][key];
  }
  return key;
}
