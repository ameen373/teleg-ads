// js/state.js
export const state = {
  API_BASE: window.location.protocol.startsWith('file') 
    ? 'http://localhost:3000' 
    : window.location.origin,
  authToken: localStorage.getItem('authToken'),
  currentSessionId: null,
  bridgeToken: null,
  bridgeStartTime: Date.now(),
  isUserAdmin: false,
  tg: window.Telegram?.WebApp,
  currentUserTelegramId: null,
  storedTelegramId: localStorage.getItem('telegramId'),
  rawUserLinksCache: [],
  bridgeDestinationUrl: null,
  currentShortCode: null,
  currentLang: localStorage.getItem('appLang') || 'ar'
};

if (state.tg?.initDataUnsafe?.user?.id) {
  state.currentUserTelegramId = String(state.tg.initDataUnsafe.user.id);
  localStorage.setItem('telegramId', state.currentUserTelegramId);
} else {
  state.currentUserTelegramId = state.storedTelegramId || null;
}

// تهيئة احتياطية ونظام اللغات لمنع أي خطأ برمي
if (!window.i18n) {
  window.i18n = {
    ar: {
      copied: "تم النسخ بنجاح!",
      network_error: "خطأ في الاتصال بالشبكة",
      cancel: "إلغاء",
      btn_edit: "تعديل",
      btn_copy: "نسخ",
      link_success_msg: "تم اختصار الرابط بنجاح!"
    },
    en: {
      copied: "Copied successfully!",
      network_error: "Network connection error",
      cancel: "Cancel",
      btn_edit: "Edit",
      btn_copy: "Copy",
      link_success_msg: "Link shortened successfully!"
    }
  };
}

if (typeof window.applyLanguage !== 'function') {
  window.applyLanguage = function(lang) {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  };
}
