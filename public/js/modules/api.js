window.API_BASE = window.location.protocol.startsWith('file') 
  ? 'http://localhost:3000' 
  : window.location.origin;

window.authToken = localStorage.getItem('authToken');
window.currentSessionId = null;
window.bridgeToken = null;
window.bridgeStartTime = Date.now();
window.isUserAdmin = false;

window.tg = window.Telegram?.WebApp;

window.storedTelegramId = localStorage.getItem('telegramId');
if (window.tg?.initDataUnsafe?.user?.id) {
  window.currentUserTelegramId = String(window.tg.initDataUnsafe.user.id);
  localStorage.setItem('telegramId', window.currentUserTelegramId);
} else {
  window.currentUserTelegramId = window.storedTelegramId || null;
}

async function safeFetch(endpoint, options = {}) {
  options.headers = options.headers || {};
  
  if (!window.currentUserTelegramId && window.tg?.initDataUnsafe?.user?.id) {
    window.currentUserTelegramId = String(window.tg.initDataUnsafe.user.id);
    localStorage.setItem('telegramId', window.currentUserTelegramId);
  }

  const initDataStr = window.Telegram?.WebApp?.initData || window.tg?.initData || '';
  
  if (initDataStr) {
    options.headers['Authorization'] = `Bearer ${initDataStr}`;
    options.headers['x-telegram-init-data'] = initDataStr;
    options.headers['telegram-init-data'] = initDataStr;
  } else if (window.authToken) {
    options.headers['Authorization'] = `Bearer ${window.authToken}`;
  }

  if (window.currentUserTelegramId) {
    options.headers['x-telegram-id'] = window.currentUserTelegramId;
    options.headers['telegram-id'] = window.currentUserTelegramId;
    options.headers['x-user-id'] = window.currentUserTelegramId;
    options.headers['user-id'] = window.currentUserTelegramId;
  }

  if (options.body && typeof options.body === 'object') {
    if (window.currentUserTelegramId && !options.body.userId && !options.body.telegramId) {
      options.body.userId = window.currentUserTelegramId;
      options.body.telegramId = window.currentUserTelegramId;
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
  let targetUrl = endpoint.startsWith('http') ? endpoint : `${window.API_BASE}${cleanEndpoint}`;

  if (window.currentUserTelegramId && !targetUrl.includes('telegramId=') && !targetUrl.includes('userId=')) {
    const separator = targetUrl.includes('?') ? '&' : '?';
    targetUrl = `${targetUrl}${separator}telegramId=${encodeURIComponent(window.currentUserTelegramId)}&userId=${encodeURIComponent(window.currentUserTelegramId)}`;
  }

  try {
    let response = await fetch(targetUrl, options);
    return response;
  } catch (err) {
    console.error("Fetch Network Error:", err);
    const lang = window.currentLang || 'ar';
    const i18n = window.i18n || {};
    if (typeof window.showToast === 'function') {
      window.showToast(i18n[lang]?.network_error || (lang === 'ar' ? "خطأ في الاتصال بالشبكة" : "Network error"));
    }
    return null;
  }
}
window.safeFetch = safeFetch;

window.API = {
  fetch: safeFetch,

  authLogin: async function() {
    const tg = window.tg || window.Telegram?.WebApp;
    const startParam = tg?.initDataUnsafe?.start_param || null;
    const u = tg?.initDataUnsafe?.user || {};
    const initDataStr = window.Telegram?.WebApp?.initData || tg?.initData || '';

    try {
      const res = await window.safeFetch('/api/auth/login', {
        method: 'POST',
        body: { 
          userId: window.currentUserTelegramId,
          telegramId: window.currentUserTelegramId,
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

        return true;
      }
    } catch (e) {
      console.error("Auth error:", e);
    }
    return false;
  },

  loadUserData: async function() {
    const res = await window.safeFetch('/api/user/me');
    if (!res || !res.ok) return null;
    const data = await res.json().catch(() => null);
    if (data && data.user) {
      const pBal = document.getElementById('pending-bal');
      const aBal = document.getElementById('avail-bal');
      const defW = document.getElementById('default-wallet');
      const refL = document.getElementById('ref-link');
      const refC = document.getElementById('ref-count');
      const refE = document.getElementById('ref-earnings');

      if (pBal) pBal.innerText = `$${(data.user.pendingBalance || 0).toFixed(2)}`;
      if (aBal) aBal.innerText = `$${(data.user.availableBalance || 0).toFixed(2)}`;
      if (defW) defW.value = data.user.walletAddress || '';
      if (refL) refL.value = data.user.referralLink || `https://t.me/Ads_telegabot?start=${window.currentUserTelegramId}`;
      if (refC) refC.innerText = data.user.referralCount || 0;
      if (refE) refE.innerText = `$${(data.user.referralEarnings || 0).toFixed(2)}`;

      if (data.user.role === 'admin' || data.isAdmin) {
        window.isUserAdmin = true;
        const adminBtn = document.getElementById('tab-btn-admin');
        if (adminBtn) adminBtn.style.display = 'flex';
      }
    }
    return data;
  },

  createShortLink: async function(title, originalUrl) {
    const res = await window.safeFetch('/api/links', {
      method: 'POST',
      body: { title, originalUrl }
    });
    if (!res) return null;
    return await res.json();
  },

  fetchUserLinks: async function() {
    const res = await window.safeFetch('/api/links');
    if (!res || !res.ok) return [];
    const data = await res.json().catch(() => []);
    return Array.isArray(data) ? data : (data.links || []);
  },

  deleteLink: async function(linkId) {
    const res = await window.safeFetch(`/api/links/${linkId}`, {
      method: 'DELETE'
    });
    if (!res) return false;
    return res.ok;
  },

  requestDeposit: async function(amount, network, txHash) {
    const res = await window.safeFetch('/api/wallet/deposit', {
      method: 'POST',
      body: { amount, network, txHash }
    });
    if (!res) return null;
    return await res.json();
  },

  requestWithdrawal: async function(amount, walletAddress) {
    const res = await window.safeFetch('/api/wallet/withdraw', {
      method: 'POST',
      body: { amount, walletAddress }
    });
    if (!res) return null;
    return await res.json();
  },

  saveWalletAddress: async function(walletAddress) {
    const res = await window.safeFetch('/api/user/wallet', {
      method: 'PUT',
      body: { walletAddress }
    });
    if (!res) return null;
    return await res.json();
  },

  fetchWithdrawals: async function() {
    const res = await window.safeFetch('/api/wallet/withdrawals');
    if (!res || !res.ok) return [];
    const data = await res.json().catch(() => []);
    return Array.isArray(data) ? data : (data.withdrawals || []);
  },

  createAdCampaign: async function(adData) {
    const res = await window.safeFetch('/api/ads', {
      method: 'POST',
      body: adData
    });
    if (!res) return null;
    return await res.json();
  },

  fetchUserAds: async function() {
    const res = await window.safeFetch('/api/ads');
    if (!res || !res.ok) return [];
    const data = await res.json().catch(() => []);
    return Array.isArray(data) ? data : (data.ads || []);
  },

  deleteAd: async function(adId) {
    const res = await window.safeFetch(`/api/ads/${adId}`, {
      method: 'DELETE'
    });
    if (!res) return false;
    return res.ok;
  },

  fetchReferrals: async function() {
    const res = await window.safeFetch('/api/referrals');
    if (!res || !res.ok) return [];
    const data = await res.json().catch(() => []);
    return Array.isArray(data) ? data : (data.referrals || []);
  },

  getBridgeInfo: async function(code) {
    const res = await window.safeFetch(`/api/bridge/${code}`);
    if (!res || !res.ok) return null;
    return await res.json();
  },

  completeImpression: async function(bridgeToken, code) {
    const res = await window.safeFetch('/api/bridge/complete', {
      method: 'POST',
      body: { bridgeToken, code }
    });
    if (!res || !res.ok) return null;
    return await res.json();
  },

  fetchAdminData: async function() {
    const res = await window.safeFetch('/api/admin/dashboard');
    if (!res || !res.ok) return null;
    return await res.json();
  },

  approveAdminDeposit: async function(id) {
    const res = await window.safeFetch(`/api/admin/deposits/${id}/approve`, { method: 'POST' });
    return res && res.ok;
  },

  rejectAdminDeposit: async function(id) {
    const res = await window.safeFetch(`/api/admin/deposits/${id}/reject`, { method: 'POST' });
    return res && res.ok;
  },

  approveAdminWithdraw: async function(id) {
    const res = await window.safeFetch(`/api/admin/withdrawals/${id}/approve`, { method: 'POST' });
    return res && res.ok;
  },

  rejectAdminWithdraw: async function(id) {
    const res = await window.safeFetch(`/api/admin/withdrawals/${id}/reject`, { method: 'POST' });
    return res && res.ok;
  }
};

window.authLogin = window.API.authLogin;
window.loadUserData = window.API.loadUserData;
window.fetchUserLinks = window.API.fetchUserLinks;
window.fetchUserAds = window.API.fetchUserAds;
window.fetchUserReferrals = window.API.fetchReferrals;
