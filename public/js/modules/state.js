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
  i18n: {
    ar: {
      copied: "تم النسخ بنجاح!",
      network_error: "خطأ في الاتصال بالشبكة",
      cancel: "إلغاء",
      btn_edit: "تعديل",
      link_success_msg: "تم اختصار الرابط بنجاح!",
      btn_copy: "نسخ"
    },
    en: {
      copied: "Copied successfully!",
      network_error: "Network connection error",
      cancel: "Cancel",
      btn_edit: "Edit",
      link_success_msg: "Link shortened successfully!",
      btn_copy: "Copy"
    }
  }
};

if (state.tg?.initDataUnsafe?.user?.id) {
  state.currentUserTelegramId = String(state.tg.initDataUnsafe.user.id);
  localStorage.setItem('telegramId', state.currentUserTelegramId);
} else {
  state.currentUserTelegramId = state.storedTelegramId || null;
}
