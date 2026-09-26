import { state } from './state.js';
import { showToast } from './ui.js';

export async function safeFetch(endpoint, options = {}) {
  options.headers = options.headers || {};
  
  if (!state.currentUserTelegramId && state.tg?.initDataUnsafe?.user?.id) {
    state.currentUserTelegramId = String(state.tg.initDataUnsafe.user.id);
    localStorage.setItem('telegramId', state.currentUserTelegramId);
  }

  const initDataStr = window.Telegram?.WebApp?.initData || state.tg?.initData || '';
  
  if (initDataStr) {
    options.headers['Authorization'] = `Bearer ${initDataStr}`;
    options.headers['x-telegram-init-data'] = initDataStr;
    options.headers['telegram-init-data'] = initDataStr;
  } else if (state.authToken) {
    options.headers['Authorization'] = `Bearer ${state.authToken}`;
  }

  if (state.currentUserTelegramId) {
    options.headers['x-telegram-id'] = state.currentUserTelegramId;
    options.headers['telegram-id'] = state.currentUserTelegramId;
    options.headers['x-user-id'] = state.currentUserTelegramId;
    options.headers['user-id'] = state.currentUserTelegramId;
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
  let targetUrl = endpoint.startsWith('http') ? endpoint : `${state.API_BASE}${cleanEndpoint}`;

  if (state.currentUserTelegramId && !targetUrl.includes('telegramId=') && !targetUrl.includes('userId=')) {
    const separator = targetUrl.includes('?') ? '&' : '?';
    targetUrl = `${targetUrl}${separator}telegramId=${encodeURIComponent(state.currentUserTelegramId)}&userId=${encodeURIComponent(state.currentUserTelegramId)}`;
  }

  try {
    let response = await fetch(targetUrl, options);
    return response;
  } catch (err) {
    console.error("Fetch Network Error:", err);
    showToast(state.i18n[state.currentLang]?.network_error || "خطأ في الاتصال بالشبكة");
    return null;
  }
}
