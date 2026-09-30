// public/js/modules/api.js - API Integration Layer

const API_BASE = (typeof window !== 'undefined' && window.location)
  ? (window.location.protocol.startsWith('file') ? 'http://localhost:3000' : window.location.origin)
  : 'http://localhost:3000';

if (typeof window !== 'undefined') {
  window.API_BASE = API_BASE;
  window.authToken = localStorage.getItem('authToken') || null;
  window.currentUserTelegramId = localStorage.getItem('telegramId') || null;
  window.isUserAdmin = false;
}

const API = {
  /**
   * الدالة الرئيسية لجميع طلبات الشبكة (GET, POST, PUT, DELETE)
   */
  request: async function(endpoint, options = {}) {
    options.method = (options.method || 'GET').toUpperCase();
    options.headers = options.headers || {};

    let currentUserTelegramId = (typeof window !== 'undefined') ? window.currentUserTelegramId : null;
    let authToken = (typeof window !== 'undefined') ? window.authToken : null;

    const tg = (typeof window !== 'undefined' && window.Telegram) ? window.Telegram.WebApp : null;
    
    // استخراج معرّف التليجرام إذا لم يكن مخزناً
    if (!currentUserTelegramId && tg?.initDataUnsafe?.user?.id) {
      currentUserTelegramId = String(tg.initDataUnsafe.user.id);
      if (typeof window !== 'undefined') {
        window.currentUserTelegramId = currentUserTelegramId;
        localStorage.setItem('telegramId', currentUserTelegramId);
      }
    }

    const initDataStr = tg?.initData || '';

    // إرفاق رؤوس التوثيق تلقائياً
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

    // تجهيز جسم الطلب وتحديد نوع المحتوى JSON
    if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
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

    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    let targetUrl = endpoint.startsWith('http') ? endpoint : `${API_BASE}${cleanEndpoint}`;

    if (currentUserTelegramId && !targetUrl.includes('telegramId=') && !targetUrl.includes('userId=')) {
      const separator = targetUrl.includes('?') ? '&' : '?';
      targetUrl = `${targetUrl}${separator}telegramId=${encodeURIComponent(currentUserTelegramId)}&userId=${encodeURIComponent(currentUserTelegramId)}`;
    }

    try {
      const response = await fetch(targetUrl, options);

      // معالجة رموز حالات الأخطاء البرمجية (401, 403, 500...)
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const status = response.status;
        let errorMessage = errorData.message || errorData.error;

        const lang = (window.UI && window.UI.currentLang) ? window.UI.currentLang : (localStorage.getItem('appLang') || 'ar');

        if (!errorMessage) {
          if (status === 401) {
            errorMessage = lang === 'ar' ? 'جلسة الاتصال انتهت، يرجى إعادة الفتح' : 'Unauthorized. Please re-open the app.';
          } else if (status === 403) {
            errorMessage = lang === 'ar' ? 'غير مصرح لك بإجراء هذه العملية' : 'Access forbidden.';
          } else if (status >= 500) {
            errorMessage = lang === 'ar' ? 'حدث خطأ في السيرفر الداخلي' : 'Internal server error.';
          } else {
            errorMessage = `HTTP error! status: ${status}`;
          }
        }

        throw new Error(errorMessage);
      }

      return response;
    } catch (err) {
      console.error(`[API Error] ${options.method} ${cleanEndpoint}:`, err);
      if (typeof window !== 'undefined' && window.UI && typeof window.UI.showToast === 'function') {
        window.UI.showToast(err.message || 'تعذر الاتصال بالسيرفر');
      }
      return null;
    }
  },

  // دالة المساعدة safeFetch لضمان التوافق مع الشفرات القديمة
  safeFetch: async function(endpoint, options = {}) {
    return await this.request(endpoint, options);
  },

  // مختصرات الطلبات المباشرة
  get: async function(endpoint, headers = {}) {
    return await this.request(endpoint, { method: 'GET', headers });
  },

  post: async function(endpoint, body = {}, headers = {}) {
    return await this.request(endpoint, { method: 'POST', body, headers });
  },

  put: async function(endpoint, body = {}, headers = {}) {
    return await this.request(endpoint, { method: 'PUT', body, headers });
  },

  delete: async function(endpoint, body = {}, headers = {}) {
    return await this.request(endpoint, { method: 'DELETE', body, headers });
  },

  // --- Auth API ---
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

  // --- Dashboard & Links API ---
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
    return !!data.success;
  },

  // --- Wallet API ---
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

  // --- Ads API ---
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
    return !!data.success;
  },

  deleteAd: async function(adId) {
    const res = await this.delete(`/api/ads/${adId}`);
    if (!res) return false;
    const data = await res.json().catch(() => ({}));
    return !!data.success;
  },

  // --- Referrals & Bridge API ---
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

  // --- Admin API ---
  loadAdminData: async function() {
    const res = await this.get('/api/admin/dashboard');
    if (!res) return null;
    return await res.json().catch(() => null);
  },

  processAdminDeposit: async function(depositId, action) {
    const res = await this.post('/api/admin/deposits/action', { depositId, action });
    if (!res) return false;
    const data = await res.json().catch(() => ({}));
    return !!data.success;
  },

  processAdminWithdraw: async function(withdrawId, action) {
    const res = await this.post('/api/admin/withdrawals/action', { withdrawId, action });
    if (!res) return false;
    const data = await res.json().catch(() => ({}));
    return !!data.success;
  }
};

// ربط النطاق العام window
if (typeof window !== 'undefined') {
  window.API = API;
  window.safeFetch = API.safeFetch.bind(API);
  window.authLogin = API.authLogin.bind(API);
}
