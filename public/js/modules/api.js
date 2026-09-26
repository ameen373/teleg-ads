import { API_BASE, state, tg, setCurrentUserTelegramId } from './state.js';
import { showToast } from './ui.js';

export async function safeFetch(endpoint, options = {}) {
  options.headers = options.headers || {};
  
  const webApp = window.Telegram?.WebApp;
  const currentTgId = webApp?.initDataUnsafe?.user?.id || tg?.initDataUnsafe?.user?.id || state.currentUserTelegramId;
  
  if (currentTgId) {
    setCurrentUserTelegramId(currentTgId);
  }

  const initDataStr = webApp?.initData || tg?.initData || '';
  
  if (initDataStr) {
    options.headers['Authorization'] = `Bearer ${initDataStr}`;
    options.headers['x-telegram-init-data'] = initDataStr;
    options.headers['telegram-init-data'] = initDataStr;
  } else if (state.authToken) {
    options.headers['Authorization'] = `Bearer ${state.authToken}`;
  }

  if (state.currentUserTelegramId) {
    options.headers['x-telegram-id'] = String(state.currentUserTelegramId);
    options.headers['telegram-id'] = String(state.currentUserTelegramId);
    options.headers['x-user-id'] = String(state.currentUserTelegramId);
    options.headers['user-id'] = String(state.currentUserTelegramId);
  }

  if (options.body && typeof options.body === 'object') {
    if (state.currentUserTelegramId && !options.body.userId && !options.body.telegramId) {
      options.body.userId = state.currentUserTelegramId;
      options.body.telegramId = state.currentUserTelegramId;
    }
    if (initDataStr && !options.body.initData) {
      options.body.initData = initDataStr;
    }
    options.body = JSON.stringify(options.body);
  }

  if (options.body && !options.headers['Content-Type']) {
    options.headers['Content-Type'] = 'application/json; charset=utf-8';
  }
  
  let cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  let targetUrl = endpoint.startsWith('http') ? endpoint : `${API_BASE}${cleanEndpoint}`;

  if (state.currentUserTelegramId && !targetUrl.includes('telegramId=') && !targetUrl.includes('userId=')) {
    const separator = targetUrl.includes('?') ? '&' : '?';
    targetUrl = `${targetUrl}${separator}telegramId=${encodeURIComponent(state.currentUserTelegramId)}&userId=${encodeURIComponent(state.currentUserTelegramId)}`;
  }

  try {
    let response = await fetch(targetUrl, options);
    return response;
  } catch (err) {
    console.error("Fetch Network Error:", err);
    const i18n = window.i18n;
    const currentLang = state.currentLang;
    showToast(i18n?.[currentLang]?.network_error || (currentLang === 'ar' ? "خطأ في الاتصال بالشبكة" : "Network connection error"));
    return null;
  }
}
