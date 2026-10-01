/**
 * Telega.ads - API & Authentication Module
 * CommonJS & Browser Integration
 */

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
  safeFetch: async function(endpoint, options = {}) {
    options.headers = options.headers || {};

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

    if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
      if (currentUserTelegramId) {
        if (!options.body.userId) options.body.userId = currentUserTelegramId;
        if (!options.body.telegramId) options.body.telegramId = currentUserTelegramId;
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
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errMsg = errorData.message || errorData.error || `HTTP error! status: ${response.status}`;
        throw new Error(errMsg);
      }
      return response;
    } catch (err) {
      console.error("API Fetch Error:", err);
      if (typeof window !== 'undefined') {
        const lang = (window.UI && window.UI.currentLang) 
          ? window.UI.currentLang 
          : (localStorage.getItem('appLang') || 'ar');
        
        const msg = (err.message && !err.message.includes('HTTP error') && !err.message.includes('Failed to fetch')) 
          ? err.message 
          : (lang === 'ar' ? "تعذر الاتصال بالسيرفر، يرجى التحقق من الاتصال بالإنترنت" : "Server connection error, please check network");

        if (window.UI && typeof window.UI.showToast === 'function') {
          window.UI.showToast(msg);
        } else {
          console.warn("API Error Message:", msg);
        }
      }
      return null;
    }
  },

  authLogin: async function() {
    const tg = (typeof window !== 'undefined' && window.Telegram) ? window.Telegram.WebApp : null;
    const startParam = tg?.initDataUnsafe?.start_param || null;
    const u = tg?.initDataUnsafe?.user || {};
    const initDataStr = tg?.initData || '';

    let currentId = (typeof window !== 'undefined') ? window.currentUserTelegramId : null;
    if (!currentId && u.id) {
      currentId = String(u.id);
      if (typeof window !== 'undefined') {
        window.currentUserTelegramId = currentId;
        localStorage.setItem('telegramId', currentId);
      }
    }

    try {
      const res = await this.safeFetch('/api/auth/login', {
        method: 'POST',
        body: {
          userId: currentId,
          telegramId: currentId,
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

      if (data && (data.success || data.token || data.user)) {
        if (typeof window !== 'undefined') {
          if (data.token) {
            window.authToken = data.token;
            localStorage.setItem('authToken', window.authToken);
          }

          const userObj = data.user || data;
          if (userObj && (userObj.telegramId || userObj.userId || userObj.id)) {
            window.currentUserTelegramId = String(userObj.telegramId || userObj.userId || userObj.id);
            localStorage.setItem('telegramId', window.currentUserTelegramId);
          }

          const isUserAdmin = !!(data.isAdmin || data.is_admin || userObj.isAdmin || userObj.is_admin || userObj.role === 'admin' || data.role === 'admin');
          if (isUserAdmin) {
            window.isUserAdmin = true;
            const adminBtn = document.getElementById('tab-btn-admin');
            if (adminBtn) {
              adminBtn.style.display = 'inline-flex';
              adminBtn.classList.remove('hidden');
            }
          }

          if (data.depositWallets || userObj.depositWallets) {
            const wallets = data.depositWallets || userObj.depositWallets;
            if (wallets.trc20) {
              const el = document.getElementById('addr-trc20');
              if (el) el.innerText = wallets.trc20;
            }
            if (wallets.bep20) {
              const el = document.getElementById('addr-bep20');
              if (el) el.innerText = wallets.bep20;
            }
          }

          if (data.botUrl || userObj.botUrl) {
            const bUrl = data.botUrl || userObj.botUrl;
            const bLink = document.getElementById('official-bot-link');
            if (bLink) bLink.href = bUrl;
            const sBot = document.getElementById('support-bot-btn');
            if (sBot) sBot.href = bUrl;
          }
          if (data.officialChannelUrl || userObj.officialChannelUrl) {
            const cUrl = data.officialChannelUrl || userObj.officialChannelUrl;
            const cLink = document.getElementById('official-channel-link');
            if (cLink) cLink.href = cUrl;
            const sChan = document.getElementById('support-channel-btn');
            if (sChan) sChan.href = cUrl;
          }
          if (data.supportUrl || userObj.supportUrl) {
            const sUrl = data.supportUrl || userObj.supportUrl;
            const sContact = document.getElementById('support-contact-btn');
            if (sContact) sContact.href = sUrl;
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
    try {
      const res = await this.safeFetch('/api/user/dashboard', { method: 'GET' });
      if (!res) return null;
      const data = await res.json().catch(() => null);
      if (data && data.user && typeof window !== 'undefined') {
        const isUserAdmin = !!(data.user.isAdmin || data.user.is_admin || data.user.role === 'admin' || data.isAdmin);
        if (isUserAdmin) {
          window.isUserAdmin = true;
          const adminBtn = document.getElementById('tab-btn-admin');
          if (adminBtn) {
            adminBtn.style.display = 'inline-flex';
            adminBtn.classList.remove('hidden');
          }
        }
      }
      return data;
    } catch (e) {
      console.error("getDashboardData Exception:", e);
      return null;
    }
  },

  getUserLinks: async function(search = '') {
    try {
      const res = await this.safeFetch(`/api/links?search=${encodeURIComponent(search)}`, { method: 'GET' });
      if (!res) return [];
      const data = await res.json().catch(() => []);
      return Array.isArray(data) ? data : (data.links || []);
    } catch (e) {
      console.error("getUserLinks Exception:", e);
      return [];
    }
  },

  createShortLink: async function(title, originalUrl, adMode = 'general') {
    try {
      const res = await this.safeFetch('/api/links/shorten', {
        method: 'POST',
        body: { title, originalUrl, adMode, mode: adMode }
      });
      if (!res) return null;
      return await res.json().catch(() => null);
    } catch (e) {
      console.error("createShortLink Exception:", e);
      return null;
    }
  },

  deleteLink: async function(linkId) {
    try {
      const res = await this.safeFetch(`/api/links/${linkId}`, { method: 'DELETE' });
      if (!res) return false;
      const data = await res.json().catch(() => ({}));
      return !!data.success;
    } catch (e) {
      console.error("deleteLink Exception:", e);
      return false;
    }
  },

  requestDeposit: async function(network, amount, txHash) {
    try {
      const res = await this.safeFetch('/api/wallet/deposit', {
        method: 'POST',
        body: { network, amount, txHash }
      });
      if (!res) return null;
      return await res.json().catch(() => null);
    } catch (e) {
      console.error("requestDeposit Exception:", e);
      return null;
    }
  },

  requestWithdrawal: async function(amount, walletAddress) {
    try {
      const res = await this.safeFetch('/api/wallet/withdraw', {
        method: 'POST',
        body: { amount, walletAddress }
      });
      if (!res) return null;
      return await res.json().catch(() => null);
    } catch (e) {
      console.error("requestWithdrawal Exception:", e);
      return null;
    }
  },

  updateWalletAddress: async function(walletAddress) {
    try {
      const res = await this.safeFetch('/api/wallet/update-address', {
        method: 'POST',
        body: { walletAddress }
      });
      if (!res) return null;
      return await res.json().catch(() => null);
    } catch (e) {
      console.error("updateWalletAddress Exception:", e);
      return null;
    }
  },

  getWithdrawalsHistory: async function() {
    try {
      const res = await this.safeFetch('/api/wallet/withdrawals', { method: 'GET' });
      if (!res) return [];
      const data = await res.json().catch(() => []);
      return Array.isArray(data) ? data : (data.withdrawals || []);
    } catch (e) {
      console.error("getWithdrawalsHistory Exception:", e);
      return [];
    }
  },

  getUserAds: async function() {
    try {
      const res = await this.safeFetch('/api/ads/my-ads', { method: 'GET' });
      if (!res) return [];
      const data = await res.json().catch(() => []);
      return Array.isArray(data) ? data : (data.ads || []);
    } catch (e) {
      console.error("getUserAds Exception:", e);
      return [];
    }
  },

  createAdCampaign: async function(adData) {
    try {
      const res = await this.safeFetch('/api/ads/create', {
        method: 'POST',
        body: adData
      });
      if (!res) return null;
      return await res.json().catch(() => null);
    } catch (e) {
      console.error("createAdCampaign Exception:", e);
      return null;
    }
  },

  toggleAdStatus: async function(adId, status) {
    try {
      const res = await this.safeFetch('/api/ads/toggle', {
        method: 'POST',
        body: { adId, status }
      });
      if (!res) return false;
      const data = await res.json().catch(() => ({}));
      return !!data.success;
    } catch (e) {
      console.error("toggleAdStatus Exception:", e);
      return false;
    }
  },

  deleteAd: async function(adId) {
    try {
      const res = await this.safeFetch(`/api/ads/${adId}`, { method: 'DELETE' });
      if (!res) return false;
      const data = await res.json().catch(() => ({}));
      return !!data.success;
    } catch (e) {
      console.error("deleteAd Exception:", e);
      return false;
    }
  },

  getUserReferrals: async function() {
    try {
      const res = await this.safeFetch('/api/user/referrals', { method: 'GET' });
      if (!res) return null;
      return await res.json().catch(() => null);
    } catch (e) {
      console.error("getUserReferrals Exception:", e);
      return null;
    }
  },

  getBridgeLinkInfo: async function(code) {
    try {
      const res = await this.safeFetch(`/api/bridge/${code}`, { method: 'GET' });
      if (!res) return null;
      return await res.json().catch(() => null);
    } catch (e) {
      console.error("getBridgeLinkInfo Exception:", e);
      return null;
    }
  },

  recordBridgeImpression: async function(code, token) {
    try {
      const res = await this.safeFetch('/api/bridge/impression', {
        method: 'POST',
        body: { code, token }
      });
      if (!res) return null;
      return await res.json().catch(() => null);
    } catch (e) {
      console.error("recordBridgeImpression Exception:", e);
      return null;
    }
  },

  loadAdminData: async function() {
    try {
      const res = await this.safeFetch('/api/admin/dashboard', { method: 'GET' });
      if (!res) return null;
      return await res.json().catch(() => null);
    } catch (e) {
      console.error("loadAdminData Exception:", e);
      return null;
    }
  },

  processAdminDeposit: async function(depositId, action) {
    try {
      const res = await this.safeFetch('/api/admin/deposits/action', {
        method: 'POST',
        body: { depositId, action }
      });
      if (!res) return false;
      const data = await res.json().catch(() => ({}));
      return !!data.success;
    } catch (e) {
      console.error("processAdminDeposit Exception:", e);
      return false;
    }
  },

  processAdminWithdraw: async function(withdrawId, action) {
    try {
      const res = await this.safeFetch('/api/admin/withdrawals/action', {
        method: 'POST',
        body: { withdrawId, action }
      });
      if (!res) return false;
      const data = await res.json().catch(() => ({}));
      return !!data.success;
    } catch (e) {
      console.error("processAdminWithdraw Exception:", e);
      return false;
    }
  },

  toggleUserBlock: async function(userId, isBlocked) {
    try {
      const res = await this.safeFetch('/api/admin/users/block', {
        method: 'POST',
        body: { userId, isBlocked }
      });
      if (!res) return false;
      const data = await res.json().catch(() => ({}));
      return !!data.success;
    } catch (e) {
      console.error("toggleUserBlock Exception:", e);
      return false;
    }
  },

  adminDeleteLink: async function(linkId) {
    try {
      const res = await this.safeFetch(`/api/admin/links/${linkId}`, { method: 'DELETE' });
      if (!res) return false;
      const data = await res.json().catch(() => ({}));
      return !!data.success;
    } catch (e) {
      console.error("adminDeleteLink Exception:", e);
      return false;
    }
  },

  adminDeleteAd: async function(adId) {
    try {
      const res = await this.safeFetch(`/api/admin/ads/${adId}`, { method: 'DELETE' });
      if (!res) return false;
      const data = await res.json().catch(() => ({}));
      return !!data.success;
    } catch (e) {
      console.error("adminDeleteAd Exception:", e);
      return false;
    }
  }
};

if (typeof window !== 'undefined') {
  window.API = API;
  window.safeFetch = API.safeFetch.bind(API);
  window.authLogin = API.authLogin.bind(API);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = API;
}
