/**
 * Telega.ads - API & Network Communication Module
 * Handles all network requests between client and backend server.
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
  /**
   * Universal fetch wrapper handling authorization headers, Telegram initData, URL parameters, and error handling.
   */
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

    if (options.body && !options.headers['Content-Type'] && !options.headers['content-type']) {
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
        
        const msg = (err.message && !err.message.includes('HTTP error')) 
          ? err.message 
          : (lang === 'ar' ? "تعذر الاتصال بالسيرفر، يرجى التحقق من الاتصال بالإنترنت" : "Server connection error, please check network");

        if (window.UI && typeof window.UI.showToast === 'function') {
          window.UI.showToast(msg, 'error');
        } else {
          console.warn("API Error Message:", msg);
        }
      }
      return null;
    }
  },

  /**
   * Performs user authentication and initializes profile credentials
   */
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

          if (data.user && data.user.telegramId) {
            window.currentUserTelegramId = String(data.user.telegramId);
            localStorage.setItem('telegramId', window.currentUserTelegramId);
          }

          if (data.isAdmin === true || data.user?.role === 'admin') {
            window.isUserAdmin = true;
            const adminBtn = document.getElementById('tab-btn-admin');
            if (adminBtn) adminBtn.style.display = 'flex';
          }

          if (data.user && typeof data.user.balance !== 'undefined') {
            const hBal = document.getElementById('header-user-balance');
            if (hBal) hBal.innerText = `$${Number(data.user.balance || 0).toFixed(2)}`;
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

  /**
   * Retrieves dashboard statistics and announcements
   */
  getDashboardData: async function() {
    try {
      const res = await this.safeFetch('/api/user/dashboard', { method: 'GET' });
      if (!res) return null;
      return await res.json().catch(() => null);
    } catch (e) {
      console.error("getDashboardData error:", e);
      return null;
    }
  },

  /**
   * Fetches user created short links
   */
  getUserLinks: async function(search = '') {
    try {
      const res = await this.safeFetch(`/api/links?search=${encodeURIComponent(search)}`, { method: 'GET' });
      if (!res) return [];
      const data = await res.json().catch(() => []);
      return Array.isArray(data) ? data : (data.links || []);
    } catch (e) {
      console.error("getUserLinks error:", e);
      return [];
    }
  },

  /**
   * Shortens a new URL with specified title and ad viewing mode
   */
  createShortLink: async function(title, originalUrl, adMode = 'general') {
    try {
      const res = await this.safeFetch('/api/links/shorten', {
        method: 'POST',
        body: { title, originalUrl, adMode }
      });
      if (!res) return null;
      return await res.json().catch(() => null);
    } catch (e) {
      console.error("createShortLink error:", e);
      return null;
    }
  },

  /**
   * Deletes a short link by ID
   */
  deleteLink: async function(linkId) {
    try {
      const res = await this.safeFetch(`/api/links/${linkId}`, { method: 'DELETE' });
      if (!res) return false;
      const data = await res.json().catch(() => ({}));
      return !!data.success;
    } catch (e) {
      console.error("deleteLink error:", e);
      return false;
    }
  },

  /**
   * Submits a wallet deposit request
   */
  requestDeposit: async function(network, amount, txHash) {
    try {
      const res = await this.safeFetch('/api/wallet/deposit', {
        method: 'POST',
        body: { network, amount, txHash }
      });
      if (!res) return null;
      return await res.json().catch(() => null);
    } catch (e) {
      console.error("requestDeposit error:", e);
      return null;
    }
  },

  /**
   * Submits a earnings withdrawal request
   */
  requestWithdrawal: async function(amount, walletAddress) {
    try {
      const res = await this.safeFetch('/api/wallet/withdraw', {
        method: 'POST',
        body: { amount, walletAddress }
      });
      if (!res) return null;
      return await res.json().catch(() => null);
    } catch (e) {
      console.error("requestWithdrawal error:", e);
      return null;
    }
  },

  /**
   * Updates default withdrawal USDT wallet address
   */
  updateWalletAddress: async function(walletAddress) {
    try {
      const res = await this.safeFetch('/api/wallet/update-address', {
        method: 'POST',
        body: { walletAddress }
      });
      if (!res) return null;
      return await res.json().catch(() => null);
    } catch (e) {
      console.error("updateWalletAddress error:", e);
      return null;
    }
  },

  /**
   * Fetches user's withdrawal history
   */
  getWithdrawalsHistory: async function() {
    try {
      const res = await this.safeFetch('/api/wallet/withdrawals', { method: 'GET' });
      if (!res) return [];
      const data = await res.json().catch(() => []);
      return Array.isArray(data) ? data : (data.withdrawals || []);
    } catch (e) {
      console.error("getWithdrawalsHistory error:", e);
      return [];
    }
  },

  /**
   * Fetches user's ad campaigns
   */
  getUserAds: async function() {
    try {
      const res = await this.safeFetch('/api/ads/my-ads', { method: 'GET' });
      if (!res) return [];
      const data = await res.json().catch(() => []);
      return Array.isArray(data) ? data : (data.ads || []);
    } catch (e) {
      console.error("getUserAds error:", e);
      return [];
    }
  },

  /**
   * Creates a new advertisement campaign
   */
  createAdCampaign: async function(adData) {
    try {
      const res = await this.safeFetch('/api/ads/create', {
        method: 'POST',
        body: adData
      });
      if (!res) return null;
      return await res.json().catch(() => null);
    } catch (e) {
      console.error("createAdCampaign error:", e);
      return null;
    }
  },

  /**
   * Toggles campaign status (active/paused)
   */
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
      console.error("toggleAdStatus error:", e);
      return false;
    }
  },

  /**
   * Deletes an ad campaign
   */
  deleteAd: async function(adId) {
    try {
      const res = await this.safeFetch(`/api/ads/${adId}`, { method: 'DELETE' });
      if (!res) return false;
      const data = await res.json().catch(() => ({}));
      return !!data.success;
    } catch (e) {
      console.error("deleteAd error:", e);
      return false;
    }
  },

  /**
   * Fetches referral statistics and invite history
   */
  getUserReferrals: async function() {
    try {
      const res = await this.safeFetch('/api/user/referrals', { method: 'GET' });
      if (!res) return null;
      return await res.json().catch(() => null);
    } catch (e) {
      console.error("getUserReferrals error:", e);
      return null;
    }
  },

  /**
   * Retrieves short link information for the bridge redirect page
   */
  getBridgeLinkInfo: async function(code) {
    try {
      const res = await this.safeFetch(`/api/bridge/${code}`, { method: 'GET' });
      if (!res) return null;
      return await res.json().catch(() => null);
    } catch (e) {
      console.error("getBridgeLinkInfo error:", e);
      return null;
    }
  },

  /**
   * Records a validated view/impression on the bridge page
   */
  recordBridgeImpression: async function(code, token) {
    try {
      const res = await this.safeFetch('/api/bridge/impression', {
        method: 'POST',
        body: { code, token }
      });
      if (!res) return null;
      return await res.json().catch(() => null);
    } catch (e) {
      console.error("recordBridgeImpression error:", e);
      return null;
    }
  },

  /**
   * Loads administrative dashboard metrics
   */
  loadAdminData: async function() {
    try {
      const res = await this.safeFetch('/api/admin/dashboard', { method: 'GET' });
      if (!res) return null;
      return await res.json().catch(() => null);
    } catch (e) {
      console.error("loadAdminData error:", e);
      return null;
    }
  },

  /**
   * Approves or rejects an admin deposit request
   */
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
      console.error("processAdminDeposit error:", e);
      return false;
    }
  },

  /**
   * Approves or rejects an admin withdrawal request
   */
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
      console.error("processAdminWithdraw error:", e);
      return false;
    }
  },

  /**
   * Admin Users List
   */
  getAdminUsers: async function() {
    try {
      const res = await this.safeFetch('/api/admin/users', { method: 'GET' });
      if (!res) return [];
      const data = await res.json().catch(() => []);
      return Array.isArray(data) ? data : (data.users || []);
    } catch (e) {
      console.error("getAdminUsers error:", e);
      return [];
    }
  },

  /**
   * Admin Links List
   */
  getAdminLinks: async function() {
    try {
      const res = await this.safeFetch('/api/admin/links', { method: 'GET' });
      if (!res) return [];
      const data = await res.json().catch(() => []);
      return Array.isArray(data) ? data : (data.links || []);
    } catch (e) {
      console.error("getAdminLinks error:", e);
      return [];
    }
  },

  /**
   * Admin Ads List
   */
  getAdminAds: async function() {
    try {
      const res = await this.safeFetch('/api/admin/ads', { method: 'GET' });
      if (!res) return [];
      const data = await res.json().catch(() => []);
      return Array.isArray(data) ? data : (data.ads || []);
    } catch (e) {
      console.error("getAdminAds error:", e);
      return [];
    }
  },

  /**
   * Admin Updates User Balance & Pending Balance
   */
  updateUserBalance: async function(userId, balance, pendingBalance) {
    try {
      const res = await this.safeFetch('/api/admin/users/update-balance', {
        method: 'POST',
        body: { userId, balance, pendingBalance }
      });
      if (!res) return false;
      const data = await res.json().catch(() => ({}));
      return !!data.success;
    } catch (e) {
      console.error("updateUserBalance error:", e);
      return false;
    }
  },

  /**
   * Admin Link Deletion
   */
  deleteAdminLink: async function(linkId) {
    try {
      const res = await this.safeFetch(`/api/admin/links/${linkId}`, { method: 'DELETE' });
      if (!res) return false;
      const data = await res.json().catch(() => ({}));
      return !!data.success;
    } catch (e) {
      console.error("deleteAdminLink error:", e);
      return false;
    }
  },

  /**
   * Admin Ad Deletion
   */
  deleteAdminAd: async function(adId) {
    try {
      const res = await this.safeFetch(`/api/admin/ads/${adId}`, { method: 'DELETE' });
      if (!res) return false;
      const data = await res.json().catch(() => ({}));
      return !!data.success;
    } catch (e) {
      console.error("deleteAdminAd error:", e);
      return false;
    }
  }
};

// Bind methods globally on window object for client scripts
if (typeof window !== 'undefined') {
  window.API = API;
  window.safeFetch = API.safeFetch.bind(API);
  window.authLogin = API.authLogin.bind(API);
}

// Export for CommonJS environment
if (typeof module !== 'undefined' && module.exports) {
  module.exports = API;
}
