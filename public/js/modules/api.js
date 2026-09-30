// public/js/modules/api.js - API Layer Module

// 1. Base URL Configuration
const API_BASE = (typeof window !== 'undefined' && window.location)
  ? (window.location.protocol.startsWith('file') ? 'http://localhost:3000' : window.location.origin)
  : 'http://localhost:3000';

if (typeof window !== 'undefined') {
  window.API_BASE = API_BASE;
  window.authToken = localStorage.getItem('authToken') || null;
  window.currentUserTelegramId = localStorage.getItem('telegramId') || null;
  window.isUserAdmin = false;
}

// 2. Core API Handler
const API = {
  /**
   * Central Request Handler for GET, POST, PUT, DELETE
   * Handles auto-headers, authorization tokens, Telegram init data, and status code errors.
   */
  request: async function(endpoint, method = 'GET', body = null, customHeaders = {}) {
    const options = {
      method: method.toUpperCase(),
      headers: { ...customHeaders }
    };

    let currentUserTelegramId = (typeof window !== 'undefined') ? window.currentUserTelegramId : null;
    let authToken = (typeof window !== 'undefined') ? window.authToken : null;

    const tg = (typeof window !== 'undefined' && window.Telegram) ? window.Telegram.WebApp : null;
    if (!currentUserTelegramId && tg?.initDataUnsafe?.user?.id) {
      currentUserTelegramId = String(tg.initDataUnsafe.user.id);
      if (typeof window !== 'undefined') {
        window.currentUserTelegramId = currentUserTelegramId;
        localStorage.setItem('telegramId', currentUserTelegramId);
      }
    }

    const initDataStr = tg?.initData || '';

    // Automatically attach Authorization Bearer and Telegram Init Data headers
    if (initDataStr) {
      options.headers['Authorization'] = `Bearer ${initDataStr}`;
      options.headers['x-telegram-init-data'] = initDataStr;
      options.headers['telegram-init-data'] = initDataStr;
    } else if (authToken) {
      options.headers['Authorization'] = `Bearer ${authToken}`;
    }

    if (currentUserTelegramId) {
      options.headers['x-telegram-id'] = currentUserTelegramId;
      options.headers['telegram-id'] = currentUserTelegramId;
      options.headers['x-user-id'] = currentUserTelegramId;
      options.headers['user-id'] = currentUserTelegramId;
    }

    // Process Body Data for POST / PUT / DELETE
    if (body !== null && typeof body === 'object') {
      const formattedBody = { ...body };
      if (currentUserTelegramId && !formattedBody.userId && !formattedBody.telegramId) {
        formattedBody.userId = currentUserTelegramId;
        formattedBody.telegramId = currentUserTelegramId;
      }
      if (initDataStr && !formattedBody.initData) {
        formattedBody.initData = initDataStr;
      }
      options.body = JSON.stringify(formattedBody);
    } else if (body !== null) {
      options.body = body;
    }

    if (options.body && !options.headers['Content-Type']) {
      options.headers['Content-Type'] = 'application/json; charset=utf-8';
    }

    // Target URL construction
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    let targetUrl = endpoint.startsWith('http') ? endpoint : `${API_BASE}${cleanEndpoint}`;

    if (currentUserTelegramId && !targetUrl.includes('telegramId=') && !targetUrl.includes('userId=')) {
      const separator = targetUrl.includes('?') ? '&' : '?';
      targetUrl = `${targetUrl}${separator}telegramId=${encodeURIComponent(currentUserTelegramId)}&userId=${encodeURIComponent(currentUserTelegramId)}`;
    }

    try {
      const response = await fetch(targetUrl, options);

      // Status Code Error Handling (401, 403, 500)
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.message || errorData.error || `HTTP ${response.status} Error`;

        if (response.status === 401) {
          console.warn("API Error 401: Unauthorized request. Clearing expired token.");
          if (typeof window !== 'undefined') {
            window.authToken = null;
            localStorage.removeItem('authToken');
          }
        } else if (response.status === 403) {
          console.warn("API Error 403: Forbidden access.");
        } else if (response.status >= 500) {
          console.error(`API Error ${response.status}: Server Internal Error.`);
        }

        throw new Error(errorMessage);
      }

      return response;
    } catch (err) {
      console.error(`API Fetch Error [${method} ${endpoint}]:`, err);

      if (typeof window !== 'undefined') {
        const lang = (window.UI && window.UI.currentLang) 
          ? window.UI.currentLang 
          : (localStorage.getItem('appLang') || 'ar');
        
        let msg = err.message;
        if (!msg || msg.includes('HTTP error') || msg.includes('Failed to fetch')) {
          msg = lang === 'ar' 
            ? "تعذر الاتصال بالسيرفر، يرجى التحقق من الاتصال بالإنترنت" 
            : "Server connection error, please check network";
        }

        if (window.UI && typeof window.UI.showToast === 'function') {
          window.UI.showToast(msg);
        } else {
          console.warn("API Error Message:", msg);
        }
      }
      return null;
    }
  },

  // HTTP Shortcut Methods (GET, POST, PUT, DELETE)
  safeFetch: async function(endpoint, options = {}) {
    const method = options.method || 'GET';
    let body = options.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) {}
    }
    return await this.request(endpoint, method, body, options.headers || {});
  },

  get: async function(endpoint, customHeaders = {}) {
    return await this.request(endpoint, 'GET', null, customHeaders);
  },

  post: async function(endpoint, body = {}, customHeaders = {}) {
    return await this.request(endpoint, 'POST', body, customHeaders);
  },

  put: async function(endpoint, body = {}, customHeaders = {}) {
    return await this.request(endpoint, 'PUT', body, customHeaders);
  },

  delete: async function(endpoint, body = null, customHeaders = {}) {
    return await this.request(endpoint, 'DELETE', body, customHeaders);
  },

  // Application Service Endpoints
  authLogin: async function() {
    const tg = (typeof window !== 'undefined' && window.Telegram) ? window.Telegram.WebApp : null;
    const startParam = tg?.initDataUnsafe?.start_param || null;
    const u = tg?.initDataUnsafe?.user || {};
    const initDataStr = tg?.initData || '';

    try {
      const currentId = (typeof window !== 'undefined') ? window.currentUserTelegramId : null;
      const res = await this.post('/api/auth/login', {
        userId: currentId,
        telegramId: currentId,
        referrerId: startParam,
        firstName: u.first_name || '',
        lastName: u.last_name || '',
        username: u.username || '',
        photoUrl: u.photo_url || '',
        isPremium: !!u.is_premium,
        initData: initDataStr
      });

      if (!res) return false;
      const data = await res.json().catch(() => ({}));

      if (data && (data.success || data.token)) {
        if (typeof window !== 'undefined') {
          if (data.token) {
            window.authToken = data.token;
            localStorage.setItem('authToken', window.authToken);
          }

          if (data.user && data.user.telegramId) {
            window.currentUserTelegramId = String(data.user.telegramId);
            localStorage.setItem('telegramId', window.currentUserTelegramId);
          }

          if (data.isAdmin === true) {
            window.isUserAdmin = true;
            const adminBtn = document.getElementById('tab-btn-admin');
            if (adminBtn) adminBtn.style.display = 'flex';
          }

          if (data.depositWallets) {
            if (data.depositWallets.trc20) {
              const el = document.getElementById('addr-trc20');
              if (el) el.innerText = data.depositWallets.trc20;
            }
            if (data.depositWallets.bep20) {
              const el = document.getElementById('addr-bep20');
              if (el) el.innerText = data.depositWallets.bep20;
            }
          }

          if (data.botUrl) {
            const bLink = document.getElementById('official-bot-link');
            if (bLink) bLink.href = data.botUrl;
            const sBot = document.getElementById('support-bot-btn');
            if (sBot) sBot.href = data.botUrl;
          }
          if (data.officialChannelUrl) {
            const cLink = document.getElementById('official-channel-link');
            if (cLink) cLink.href = data.officialChannelUrl;
            const sChan = document.getElementById('support-channel-btn');
            if (sChan) sChan.href = data.officialChannelUrl;
          }
          if (data.supportUrl) {
            const sContact = document.getElementById('support-contact-btn');
            if (sContact) sContact.href = data.supportUrl;
          }
        }
        return true;
      }
    } catch (e) {
      console.error("Auth Exception:", e);
    }
    return false;
  },

  getDashboardData: async function() {
    const res = await this.get('/api/user/dashboard');
    if (!res) return null;
    return await res.json().catch(() => null);
  },

  getUserLinks: async function(search = '') {
    const res = await this.get(`/api/links?search=${encodeURIComponent(search)}`);
    if (!res) return [];
    const data = await res.json().catch(() => []);
    return Array.isArray(data) ? data : (data.links || []);
  },

  createShortLink: async function(title, originalUrl) {
    const res = await this.post('/api/links/shorten', { title, originalUrl });
    if (!res) return null;
    return await res.json().catch(() => null);
  },

  deleteLink: async function(linkId) {
    const res = await this.delete(`/api/links/${linkId}`);
    if (!res) return false;
    const data = await res.json().catch(() => ({}));
    return data.success;
  },

  requestDeposit: async function(network, amount, txHash) {
    const res = await this.post('/api/wallet/deposit', { network, amount, txHash });
    if (!res) return null;
    return await res.json().catch(() => null);
  },

  requestWithdrawal: async function(amount, walletAddress) {
    const res = await this.post('/api/wallet/withdraw', { amount, walletAddress });
    if (!res) return null;
    return await res.json().catch(() => null);
  },

  updateWalletAddress: async function(walletAddress) {
    const res = await this.post('/api/wallet/update-address', { walletAddress });
    if (!res) return null;
    return await res.json().catch(() => null);
  },

  getWithdrawalsHistory: async function() {
    const res = await this.get('/api/wallet/withdrawals');
    if (!res) return [];
    const data = await res.json().catch(() => []);
    return Array.isArray(data) ? data : (data.withdrawals || []);
  },

  getUserAds: async function() {
    const res = await this.get('/api/ads/my-ads');
    if (!res) return [];
    const data = await res.json().catch(() => []);
    return Array.isArray(data) ? data : (data.ads || []);
  },

  createAdCampaign: async function(adData) {
    const res = await this.post('/api/ads/create', adData);
    if (!res) return null;
    return await res.json().catch(() => null);
  },

  toggleAdStatus: async function(adId, status) {
    const res = await this.post('/api/ads/toggle', { adId, status });
    if (!res) return false;
    const data = await res.json().catch(() => ({}));
    return data.success;
  },

  deleteAd: async function(adId) {
    const res = await this.delete(`/api/ads/${adId}`);
    if (!res) return false;
    const data = await res.json().catch(() => ({}));
    return data.success;
  },

  getUserReferrals: async function() {
    const res = await this.get('/api/user/referrals');
    if (!res) return null;
    return await res.json().catch(() => null);
  },

  getBridgeLinkInfo: async function(code) {
    const res = await this.get(`/api/bridge/${code}`);
    if (!res) return null;
    return await res.json().catch(() => null);
  },

  recordBridgeImpression: async function(code, token) {
    const res = await this.post('/api/bridge/impression', { code, token });
    if (!res) return null;
    return await res.json().catch(() => null);
  },

  loadAdminData: async function() {
    const res = await this.get('/api/admin/dashboard');
    if (!res) return null;
    return await res.json().catch(() => null);
  },

  processAdminDeposit: async function(depositId, action) {
    const res = await this.post('/api/admin/deposits/action', { depositId, action });
    if (!res) return false;
    const data = await res.json().catch(() => ({}));
    return data.success;
  },

  processAdminWithdraw: async function(withdrawId, action) {
    const res = await this.post('/api/admin/withdrawals/action', { withdrawId, action });
    if (!res) return false;
    const data = await res.json().catch(() => ({}));
    return data.success;
  }
};

// Bind Module to Window
if (typeof window !== 'undefined') {
  window.API = API;
  window.safeFetch = API.safeFetch.bind(API);
  window.authLogin = API.authLogin.bind(API);
}
