// public/js/modules/api.js

var API_BASE = window.location.protocol.startsWith('file') 
  ? 'http://localhost:3000' 
  : window.location.origin;

var authToken = localStorage.getItem('authToken');
var currentSessionId = null;
var bridgeToken = null;
var bridgeStartTime = Date.now();
var isUserAdmin = false;

var tg = window.Telegram?.WebApp;
var currentUser = null;
window.currentUser = null;

var currentUserTelegramId = null;
var storedTelegramId = localStorage.getItem('telegramId');

if (window.Telegram?.WebApp?.initDataUnsafe?.user?.id) {
  currentUserTelegramId = String(window.Telegram.WebApp.initDataUnsafe.user.id);
  localStorage.setItem('telegramId', currentUserTelegramId);
} else {
  currentUserTelegramId = storedTelegramId || null;
}

var rawUserLinksCache = [];
var bridgeDestinationUrl = null;
var currentShortCode = null;
var currentLang = localStorage.getItem('appLang') || 'ar';

function getAuthHeaders() {
  const initData = window.Telegram?.WebApp?.initData || '';
  return {
    'Content-Type': 'application/json',
    'x-telegram-init-data': initData,
    'Authorization': 'Bearer ' + initData
  };
}

async function safeFetch(endpoint, options = {}) {
  options.headers = options.headers || {};
  
  if (!currentUserTelegramId && window.Telegram?.WebApp?.initDataUnsafe?.user?.id) {
    currentUserTelegramId = String(window.Telegram.WebApp.initDataUnsafe.user.id);
    localStorage.setItem('telegramId', currentUserTelegramId);
  }

  const dynamicHeaders = getAuthHeaders();
  options.headers = Object.assign({}, dynamicHeaders, options.headers);

  if (currentUserTelegramId) {
    options.headers['x-telegram-id'] = currentUserTelegramId;
    options.headers['telegram-id'] = currentUserTelegramId;
    options.headers['x-user-id'] = currentUserTelegramId;
    options.headers['user-id'] = currentUserTelegramId;
  }

  if (authToken && !options.headers['Authorization']) {
    options.headers['Authorization'] = `Bearer ${authToken}`;
  }

  const initDataStr = window.Telegram?.WebApp?.initData || '';

  if (options.body && typeof options.body === 'object') {
    if (currentUserTelegramId && !options.body.userId && !options.body.telegramId) {
      options.body.userId = currentUserTelegramId;
      options.body.telegramId = currentUserTelegramId;
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

  if (currentUserTelegramId && !targetUrl.includes('telegramId=') && !targetUrl.includes('userId=')) {
    const separator = targetUrl.includes('?') ? '&' : '?';
    targetUrl = `${targetUrl}${separator}telegramId=${encodeURIComponent(currentUserTelegramId)}&userId=${encodeURIComponent(currentUserTelegramId)}`;
  }

  try {
    let response = await fetch(targetUrl, options);
    return response;
  } catch (err) {
    console.error("Fetch Network Error:", err);
    if (typeof showToast === 'function') {
      showToast(window.i18n?.[currentLang]?.network_error || "خطأ في الاتصال بالشبكة");
    }
    return null;
  }
}
