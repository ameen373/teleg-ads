// public/js/modules/api.js
import { state } from '../state.js';
import { showToast } from './ui.js';

/**
 * دالة إرسال الطلبات للسيرفر وإرفاق بيانات توثيق تلجرام تلقائياً
 */
export async function apiRequest(endpoint, options = {}) {
  options.headers = options.headers || {};
  
  // التأكد من استخراج معرّف المستخدم من Telegram WebApp إن وجد
  const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user || state.tg?.initDataUnsafe?.user;
  if (tgUser?.id) {
    state.currentUserTelegramId = String(tgUser.id);
    localStorage.setItem('telegramId', state.currentUserTelegramId);
  } else if (!state.currentUserTelegramId) {
    state.currentUserTelegramId = localStorage.getItem('telegramId') || '';
  }

  // جلب initData المباشرة من نافذة WebApp أو من state
  const initDataStr = window.Telegram?.WebApp?.initData || state.tg?.initData || '';
  
  // إرفاق بيانات التوثيق في الترويسات (Headers) أوتوماتيكياً
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

  // تجهيز نص الطلب (Body) وإضافة المعاملات التلقائية
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
  
  // صياغة الرابط النهائي
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
    const langMsg = (window.i18n && state.currentLang && window.i18n[state.currentLang]?.network_error)
      ? window.i18n[state.currentLang].network_error
      : "خطأ في الاتصال بالشبكة";
    
    if (typeof showToast === 'function') {
      showToast(langMsg);
    }
    return null;
  }
}

/**
 * دالة safeFetch للعمل كدالة بديلة لـ apiRequest لضمان توافق باقي الموديولات
 */
export async function safeFetch(endpoint, options = {}) {
  return await apiRequest(endpoint, options);
}
