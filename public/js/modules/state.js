export const API_BASE = window.location.protocol.startsWith('file') 
  ? 'http://localhost:3000' 
  : window.location.origin;

export const tg = window.Telegram?.WebApp;

let storedTelegramId = localStorage.getItem('telegramId');
let initialTgId = null;

if (tg?.initDataUnsafe?.user?.id) {
  initialTgId = String(tg.initDataUnsafe.user.id);
  localStorage.setItem('telegramId', initialTgId);
} else {
  initialTgId = storedTelegramId || null;
}

export const state = {
  authToken: localStorage.getItem('authToken'),
  currentSessionId: null,
  bridgeToken: null,
  bridgeStartTime: Date.now(),
  isUserAdmin: false,
  currentUserTelegramId: initialTgId,
  rawUserLinksCache: [],
  bridgeDestinationUrl: null,
  currentShortCode: null,
  currentLang: localStorage.getItem('appLang') || 'ar'
};

export function setAuthToken(token) {
  state.authToken = token;
  if (token) {
    localStorage.setItem('authToken', token);
  } else {
    localStorage.removeItem('authToken');
  }
}

export function setCurrentUserTelegramId(id) {
  state.currentUserTelegramId = String(id);
  localStorage.setItem('telegramId', state.currentUserTelegramId);
}

export function setIsUserAdmin(val) {
  state.isUserAdmin = Boolean(val);
}

export function setRawUserLinksCache(links) {
  state.rawUserLinksCache = Array.isArray(links) ? links : [];
}

export function setBridgeDetails(token, destinationUrl, code) {
  state.bridgeToken = token;
  state.bridgeDestinationUrl = destinationUrl;
  state.currentShortCode = code;
  state.bridgeStartTime = Date.now();
}

export function setCurrentLang(lang) {
  state.currentLang = lang;
  localStorage.setItem('appLang', lang);
}
