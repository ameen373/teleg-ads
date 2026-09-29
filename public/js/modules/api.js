const API_BASE = (typeof window !== 'undefined' && window.location && window.location.protocol.startsWith('file'))
  ? 'http://localhost:3000'
  : (typeof window !== 'undefined' && window.location ? window.location.origin : '');

if (typeof window !== 'undefined') {
  window.API_BASE = API_BASE;
  window.authToken = localStorage.getItem('authToken');
  window.currentUserTelegramId = localStorage.getItem('telegramId') || null;
  window.isUserAdmin = false;
}

const API = {
  safeFetch: async function(endpoint, options = {}) {
    options.headers = options.headers || {};

    const tg = (typeof window !== 'undefined') ? window.Telegram?.WebApp : null;
    let currentTgId = typeof window !== 'undefined' ? window.currentUserTelegramId : null;
    let currentAuthToken = typeof window !== 'undefined' ? window.authToken : null;

    if (!currentTgId && tg?.initDataUnsafe?.user?.id) {
      currentTgId = String(tg.initDataUnsafe.user.id);
      if (typeof window !== 'undefined') {
        window.currentUserTelegramId = currentTgId;
        localStorage.setItem('telegramId', currentTgId);
      }
    }

    const initDataStr = tg?.initData || '';

    if (initDataStr) {
      options.headers['Authorization'] = `Bearer ${initDataStr}`;
      options.headers['x-telegram-init-data'] = initDataStr;
      options.headers['telegram-init-data'] = initDataStr;
    } else if (currentAuthToken) {
      options.headers['Authorization'] = `Bearer ${currentAuthToken}`;
    }

    if (currentTgId) {
      options.headers['x-telegram-id'] = currentTgId;
      options.headers['telegram-id'] = currentTgId;
      options.headers['x-user-id'] = currentTgId;
      options.headers['user-id'] = currentTgId;
    }

    if (options.body && typeof options.body === 'object') {
      if (currentTgId && !options.body.userId && !options.body.telegramId) {
        options.body.userId = currentTgId;
        options.body.telegramId = currentTgId;
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

    if (currentTgId && !targetUrl.includes('telegramId=') && !targetUrl.includes('userId=')) {
      const separator = targetUrl.includes('?') ? '&' : '?';
      targetUrl = `${targetUrl}${separator}telegramId=${encodeURIComponent(currentTgId)}&userId=${encodeURIComponent(currentTgId)}`;
    }

    try {
      const response = await fetch(targetUrl, options);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }
      return response;
    } catch (err) {
      console.error("API Fetch Error:", err);
      if (typeof window !== 'undefined') {
        const lang = window.UI ? window.UI.currentLang : (localStorage.getItem('appLang') || 'ar');
        const msg = lang === 'ar' ? "خطأ في الاتصال بالسيرفر" : "Server connection error";
        if (window.UI && typeof window.UI.showToast === 'function') {
          window.UI.showToast(msg);
        }
      }
      return null;
    }
  },

  authLogin: async function() {
    const tg = typeof window !== 'undefined' ? window.Telegram?.WebApp : null;
    const startParam = tg?.initDataUnsafe?.start_param || null;
    const u = tg?.initDataUnsafe?.user || {};
    const initDataStr = tg?.initData || '';
    const currentTgId = typeof window !== 'undefined' ? window.currentUserTelegramId : null;

    try {
      const res = await this.safeFetch('/api/auth/login', {
        method: 'POST',
        body: {
          userId: currentTgId,
          telegramId: currentTgId,
          referrerId: startParam,
          firstName: u.first_name || '',
          lastName: u.last_name || '',
          username: u.username || '',
          photoUrl: u.photo_url || '',
          isPremium: !!u.is_premium,
          initData: initDataStr
        }
      });

      if (!res) return false;
      const data = await res.json().catch(() => ({}));

      if (data && (data.success || data.token)) {
        if (data.token && typeof window !== 'undefined') {
          window.authToken = data.token;
          localStorage.setItem('authToken', window.authToken);
        }

        if (data.user && data.user.telegramId && typeof window !== 'undefined') {
          window.currentUserTelegramId = String(data.user.telegramId);
          localStorage.setItem('telegramId', window.currentUserTelegramId);
        }

        if (data.isAdmin === true && typeof window !== 'undefined') {
          window.isUserAdmin = true;
          const adminBtn = document.getElementById('tab-btn-admin');
          if (adminBtn) adminBtn.style.display = 'flex';
        }

        if (data.depositWallets && typeof document !== 'undefined') {
          if (data.depositWallets.trc20) {
            const el = document.getElementById('addr-trc20');
            if (el) el.innerText = data.depositWallets.trc20;
          }
          if (data.depositWallets.bep20) {
            const el = document.getElementById('addr-bep20');
            if (el) el.innerText = data.depositWallets.bep20;
          }
        }

        if (typeof document !== 'undefined') {
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
    const res = await this.safeFetch('/api/user/dashboard', { method: 'GET' });
    if (!res) return null;
    return await res.json().catch(() => null);
  },

  getUserLinks: async function(search = '') {
    const res = await this.safeFetch(`/api/links?search=${encodeURIComponent(search)}`, { method: 'GET' });
    if (!res) return [];
    const data = await res.json().catch(() => []);
    return Array.isArray(data) ? data : (data.links || []);
  },

  createShortLink: async function(title, originalUrl) {
    const res = await this.safeFetch('/api/links/shorten', {
      method: 'POST',
      body: { title, originalUrl }
    });
    if (!res) return null;
    return await res.json().catch(() => null);
  },

  deleteLink: async function(linkId) {
    const res = await this.safeFetch(`/api/links/${linkId}`, { method: 'DELETE' });
    if (!res) return false;
    const data = await res.json().catch(() => ({}));
    return !!data.success;
  },

  requestDeposit: async function(network, amount, txHash) {
    const res = await this.safeFetch('/api/wallet/deposit', {
      method: 'POST',
      body: { network, amount, txHash }
    });
    if (!res) return null;
    return await res.json().catch(() => null);
  },

  requestWithdrawal: async function(amount, walletAddress) {
    const res = await this.safeFetch('/api/wallet/withdraw', {
      method: 'POST',
      body: { amount, walletAddress }
    });
    if (!res) return null;
    return await res.json().catch(() => null);
  },

  updateWalletAddress: async function(walletAddress) {
    const res = await this.safeFetch('/api/wallet/update-address', {
      method: 'POST',
      body: { walletAddress }
    });
    if (!res) return null;
    return await res.json().catch(() => null);
  },

  getWithdrawalsHistory: async function() {
    const res = await this.safeFetch('/api/wallet/withdrawals', { method: 'GET' });
    if (!res) return [];
    const data = await res.json().catch(() => []);
    return Array.isArray(data) ? data : (data.withdrawals || []);
  },

  getUserAds: async function() {
    const res = await this.safeFetch('/api/ads/my-ads', { method: 'GET' });
    if (!res) return [];
    const data = await res.json().catch(() => []);
    return Array.isArray(data) ? data : (data.ads || []);
  },

  createAdCampaign: async function(adData) {
    const res = await this.safeFetch('/api/ads/create', {
      method: 'POST',
      body: adData
    });
    if (!res) return null;
    return await res.json().catch(() => null);
  },

  toggleAdStatus: async function(adId, status) {
    const res = await this.safeFetch(`/api/ads/toggle`, {
      method: 'POST',
      body: { adId, status }
    });
    if (!res) return false;
    const data = await res.json().catch(() => ({}));
    return !!data.success;
  },

  deleteAd: async function(adId) {
    const res = await this.safeFetch(`/api/ads/${adId}`, { method: 'DELETE' });
    if (!res) return false;
    const data = await res.json().catch(() => ({}));
    return !!data.success;
  },

  getUserReferrals: async function() {
    const res = await this.safeFetch('/api/user/referrals', { method: 'GET' });
    if (!res) return null;
    return await res.json().catch(() => null);
  },

  getBridgeLinkInfo: async function(code) {
    const res = await this.safeFetch(`/api/bridge/${code}`, { method: 'GET' });
    if (!res) return null;
    return await res.json().catch(() => null);
  },

  recordBridgeImpression: async function(code, token) {
    const res = await this.safeFetch('/api/bridge/impression', {
      method: 'POST',
      body: { code, token }
    });
    if (!res) return null;
    return await res.json().catch(() => null);
  },

  loadAdminData: async function() {
    const res = await this.safeFetch('/api/admin/dashboard', { method: 'GET' });
    if (!res) return null;
    return await res.json().catch(() => null);
  },

  processAdminDeposit: async function(depositId, action) {
    const res = await this.safeFetch('/api/admin/deposits/action', {
      method: 'POST',
      body: { depositId, action }
    });
    if (!res) return false;
    const data = await res.json().catch(() => ({}));
    return !!data.success;
  },

  processAdminWithdraw: async function(withdrawId, action) {
    const res = await this.safeFetch('/api/admin/withdrawals/action', {
      method: 'POST',
      body: { withdrawId, action }
    });
    if (!res) return false;
    const data = await res.json().catch(() => ({}));
    return !!data.success;
  }
};

if (typeof window !== 'undefined') {
  window.API = API;
  window.safeFetch = API.safeFetch.bind(API);
  window.authLogin = API.authLogin.bind(API);
}

module.exports = API;
