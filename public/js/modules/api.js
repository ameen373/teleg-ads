import { state, i18n } from '../state.js';
import { showToast } from './ui.js';

export async function apiRequest(endpoint, method = 'GET', body = null, headers = {}) {
  const options = {
    method,
    headers: { ...headers }
  };
  if (body) {
    options.body = body;
  }
  const response = await safeFetch(endpoint, options);
  if (!response) return null;
  return await response.json().catch(() => ({}));
}

export async function safeFetch(endpoint, options = {}) {
  options.headers = options.headers || {};
  
  const tg = state.tg || window.Telegram?.WebApp;

  if (!state.currentUserTelegramId && tg?.initDataUnsafe?.user?.id) {
    state.currentUserTelegramId = String(tg.initDataUnsafe.user.id);
    localStorage.setItem('telegramId', state.currentUserTelegramId);
  }

  const initDataStr = window.Telegram?.WebApp?.initData || tg?.initData || '';
  
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

  if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
    if (state.currentUserTelegramId && !options.body.userId && !options.body.telegramId) {
      options.body.userId = state.currentUserTelegramId;
      options.body.telegramId = state.currentUserTelegramId;
    }
    if (initDataStr && !options.body.initData) {
      options.body.initData = initDataStr;
    }
    options.body = JSON.stringify(options.body);
  }

  if (options.body && typeof options.body === 'string' && !options.headers['Content-Type']) {
    options.headers['Content-Type'] = 'application/json; charset=utf-8';
  }
  
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  let targetUrl = endpoint.startsWith('http') ? endpoint : `${state.API_BASE}${cleanEndpoint}`;

  if (state.currentUserTelegramId && !targetUrl.includes('telegramId=') && !targetUrl.includes('userId=')) {
    const separator = targetUrl.includes('?') ? '&' : '?';
    targetUrl = `${targetUrl}${separator}telegramId=${encodeURIComponent(state.currentUserTelegramId)}&userId=${encodeURIComponent(state.currentUserTelegramId)}`;
  }

  try {
    const response = await fetch(targetUrl, options);
    return response;
  } catch (err) {
    console.error("Fetch Network Error:", err);
    const errorMsg = i18n[state.currentLang]?.network_error || "خطأ في الاتصال بالشبكة";
    showToast(errorMsg);
    return null;
  }
}
