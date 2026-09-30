const API_BASE = (typeof window !== 'undefined' && window.location)
  ? (window.location.protocol.startsWith('file') ? 'http://localhost:3000' : window.location.origin)
  : 'http://localhost:3000';

if (typeof window !== 'undefined') {
  window.API_BASE = API_BASE;
  window.authToken = localStorage.getItem('authToken') || null;
  window.currentUserTelegramId = localStorage.getItem('telegramId') || null;
  window.isUserAdmin = localStorage.getItem('isUserAdmin') === 'true';
}

const API = {
  updateAdminVisibility: function(isAdmin) {
    if (typeof document === 'undefined') return;

    const adminElementIds = [
      'tab-btn-admin',
      'admin-tab',
      'nav-admin',
      'admin-nav-btn',
      'tab-admin',
      'admin-section-btn',
      'admin-link'
    ];

    adminElementIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        if (isAdmin) {
          el.style.display = '';
          el.classList.remove('hidden');
          el.classList.remove('d-none');
          el.removeAttribute('hidden');
        } else {
          el.style.display = 'none';
          el.classList.add('hidden');
        }
      }
    });

    if (window.UI && typeof window.UI.toggleAdminTab === 'function') {
      window.UI.toggleAdminTab(isAdmin);
    }
  },

  safeFetch: async function(endpoint, options = {}) {
    options.headers = options.headers || {};

    let currentUserTelegramId = (typeof window !== 'undefined') 
      ? (window.currentUserTelegramId || localStorage.getItem('telegramId') || null) 
      : null;

    let authToken = (typeof window !== 'undefined') 
      ? (window.authToken || localStorage.getItem('authToken') || null) 
      : null;

    const tg = (typeof window !== 'undefined' && window.Telegram) ? window.Telegram.WebApp : null;
    if ((!currentUserTelegramId || currentUserTelegramId === 'null') && tg?.initDataUnsafe?.user?.id) {
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

    if (currentUserTelegramId && currentUserTelegramId !== 'null' && currentUserTelegramId !== 'undefined') {
      options.headers['x-telegram-id'] = currentUserTelegramId;
      options.headers['telegram-id'] = currentUserTelegramId;
      options.headers['x-user-id'] = currentUserTelegramId;
      options.headers['user-id'] = currentUserTelegramId;
    }

    if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
      if (currentUserTelegramId && currentUserTelegramId !== 'null' && !options.body.userId && !options.body.telegramId) {
        options.body.userId = currentUserTelegramId;
        options.body.telegramId = currentUserTelegramId;
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
    let targetUrl = endpoint.startsWith('http') ? endpoint : `${API_BASE}${cleanEndpoint}`;

    if (currentUserTelegramId && currentUserTelegramId !== 'null' && currentUserTelegramId !== 'undefined' && !targetUrl.includes('telegramId=') && !targetUrl.includes('userId=')) {
      const separator = targetUrl.includes('?') ? '&' : '?';
      targetUrl = `${targetUrl}${separator}telegramId=${encodeURIComponent(currentUserTelegramId)}&userId=${encodeURIComponent(currentUserTelegramId)}`;
    }

    try {
      const response = await fetch(targetUrl, options);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        
        if ((response.status === 401 || response.status === 403) && cleanEndpoint.includes('/admin/')) {
          window.isUserAdmin = false;
          localStorage.setItem('isUserAdmin', 'false');
          this.updateAdminVisibility(false);
        }

        throw new Error(errorData.message || errorData.error || `HTTP error! status: ${response.status}`);
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

    try {
      let currentId = (typeof window !== 'undefined') ? (window.currentUserTelegramId || localStorage.getItem('telegramId') || null) : null;
      if ((!currentId || currentId === 'null') && u.id) {
        currentId = String(u.id);
        if (typeof window !== 'undefined') {
          window.currentUserTelegramId = currentId;
          localStorage.setItem('telegramId', currentId);
        }
      }

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

          if (data.user && (data.user.telegramId || data.user.id)) {
            window.currentUserTelegramId = String(data.user.telegramId || data.user.id);
            localStorage.setItem('telegramId', window.currentUserTelegramId);
          }

          const isAdmin = Boolean(
            data.isAdmin === true || 
            data.user?.isAdmin === true || 
            data.user?.role === 'admin' ||
            data.role === 'admin'
          );

          window.isUserAdmin = isAdmin;
          localStorage.setItem('isUserAdmin', isAdmin ? 'true' : 'false');
          this.updateAdminVisibility(isAdmin);

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

  checkAdminStatus: async function() {
    const res = await this.safeFetch('/api/admin/dashboard', { method: 'GET' });
    const isAdmin = res !== null;
    window.isUserAdmin = isAdmin;
    localStorage.setItem('isUserAdmin', isAdmin ? 'true' : 'false');
    this.updateAdminVisibility(isAdmin);
    return isAdmin;
  },

  getDashboardData: async function() {
    const res = await this.safeFetch('/api/user/dashboard', { method: 'GET' });
    if (!res) return null;
    return await res.json().catch(() => null);
  },

  getUserProfile: async function() {
    const res = await this.safeFetch('/api/user/profile', { method: 'GET' });
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

  getDepositsHistory: async function() {
    const res = await this.safeFetch('/api/wallet/deposits', { method: 'GET' });
    if (!res) return [];
    const data = await res.json().catch(() => []);
    return Array.isArray(data) ? data : (data.deposits || []);
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

  getAdminStats: async function() {
    const res = await this.safeFetch('/api/admin/stats', { method: 'GET' });
    if (!res) return null;
    return await res.json().catch(() => null);
  },

  getAdminUsers: async function(search = '', page = 1) {
    const res = await this.safeFetch(`/api/admin/users?search=${encodeURIComponent(search)}&page=${page}`, { method: 'GET' });
    if (!res) return [];
    const data = await res.json().catch(() => []);
    return Array.isArray(data) ? data : (data.users || []);
  },

  getAdminDeposits: async function() {
    const res = await this.safeFetch('/api/admin/deposits', { method: 'GET' });
    if (!res) return [];
    const data = await res.json().catch(() => []);
    return Array.isArray(data) ? data : (data.deposits || []);
  },

  processAdminDeposit: async function(depositId, action, notes = '') {
    const res = await this.safeFetch('/api/admin/deposits/action', {
      method: 'POST',
      body: { depositId, action, notes }
    });
    if (!res) return false;
    const data = await res.json().catch(() => ({}));
    return !!data.success;
  },

  getAdminWithdrawals: async function() {
    const res = await this.safeFetch('/api/admin/withdrawals', { method: 'GET' });
    if (!res) return [];
    const data = await res.json().catch(() => []);
    return Array.isArray(data) ? data : (data.withdrawals || []);
  },

  processAdminWithdraw: async function(withdrawId, action, notes = '') {
    const res = await this.safeFetch('/api/admin/withdrawals/action', {
      method: 'POST',
      body: { withdrawId, action, notes }
    });
    if (!res) return false;
    const data = await res.json().catch(() => ({}));
    return !!data.success;
  },

  getAdminAds: async function() {
    const res = await this.safeFetch('/api/admin/ads', { method: 'GET' });
    if (!res) return [];
    const data = await res.json().catch(() => []);
    return Array.isArray(data) ? data : (data.ads || []);
  },

  approveAdminAd: async function(adId) {
    const res = await this.safeFetch(`/api/admin/ads/approve`, {
      method: 'POST',
      body: { adId }
    });
    if (!res) return false;
    const data = await res.json().catch(() => ({}));
    return !!data.success;
  },

  rejectAdminAd: async function(adId, reason = '') {
    const res = await this.safeFetch(`/api/admin/ads/reject`, {
      method: 'POST',
      body: { adId, reason }
    });
    if (!res) return false;
    const data = await res.json().catch(() => ({}));
    return !!data.success;
  },

  deleteAdminAd: async function(adId) {
    const res = await this.safeFetch(`/api/admin/ads/${adId}`, { method: 'DELETE' });
    if (!res) return false;
    const data = await res.json().catch(() => ({}));
    return !!data.success;
  },

  getAdminLinks: async function() {
    const res = await this.safeFetch('/api/admin/links', { method: 'GET' });
    if (!res) return [];
    const data = await res.json().catch(() => []);
    return Array.isArray(data) ? data : (data.links || []);
  },

  deleteAdminLink: async function(linkId) {
    const res = await this.safeFetch(`/api/admin/links/${linkId}`, { method: 'DELETE' });
    if (!res) return false;
    const data = await res.json().catch(() => ({}));
    return !!data.success;
  },

  getAdminSettings: async function() {
    const res = await this.safeFetch('/api/admin/settings', { method: 'GET' });
    if (!res) return null;
    return await res.json().catch(() => null);
  },

  updateAdminSettings: async function(settingsData) {
    const res = await this.safeFetch('/api/admin/settings', {
      method: 'POST',
      body: settingsData
    });
    if (!res) return null;
    return await res.json().catch(() => null);
  },

  updateUserBalance: async function(userId, amount, type = 'add', reason = '') {
    const res = await this.safeFetch('/api/admin/users/balance', {
      method: 'POST',
      body: { userId, amount, type, reason }
    });
    if (!res) return false;
    const data = await res.json().catch(() => ({}));
    return !!data.success;
  },

  toggleUserBlock: async function(userId, isBlocked) {
    const res = await this.safeFetch('/api/admin/users/block', {
      method: 'POST',
      body: { userId, isBlocked }
    });
    if (!res) return false;
    const data = await res.json().catch(() => ({}));
    return !!data.success;
  },

  sendAdminBroadcast: async function(message, target = 'all') {
    const res = await this.safeFetch('/api/admin/announcement/send', {
      method: 'POST',
      body: { message, target }
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

  const applyInitialAdminState = () => {
    if (API && typeof API.updateAdminVisibility === 'function') {
      API.updateAdminVisibility(window.isUserAdmin);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyInitialAdminState);
  } else {
    applyInitialAdminState();
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = API;
}
