// ==================== API & SERVER COMMUNICATION ====================
(function () {
  function safeCall(fnName, ...args) {
    if (typeof window[fnName] === 'function') {
      return window[fnName](...args);
    }
    return undefined;
  }

  const Api = {
    getInitData() {
      return window.Telegram?.WebApp?.initData || '';
    },

    async request(endpoint, options = {}) {
      const headers = {
        'x-telegram-init-data': this.getInitData(),
        ...(options.headers || {})
      };

      if (options.body !== undefined && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
      }

      const response = await fetch(endpoint, {
        ...options,
        headers
      });

      const data = await response.json();
      if (!response.ok || (data && data.success === false)) {
        throw new Error((data && data.message) || 'API Request Failed');
      }
      return data;
    },

    async get(url) {
      return this.request(url, { method: 'GET' });
    },

    async send(url, method = 'POST', body) {
      const options = { method };
      if (body !== undefined) {
        options.body = typeof body === 'string' ? body : JSON.stringify(body);
      }
      return this.request(url, options);
    },

    getMe() {
      return this.request('/api/me');
    },

    updateLanguage(lang) {
      return this.request('/api/user/language', {
        method: 'POST',
        body: JSON.stringify({ lang })
      });
    },

    getChannels() {
      return this.request('/api/channels');
    },

    addChannel(payload) {
      return this.request('/api/channels', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    },

    getCampaigns() {
      return this.request('/api/campaigns');
    },

    createCampaign(payload) {
      return this.request('/api/campaigns', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    },

    requestDeposit(amount) {
      return this.request('/api/wallet/deposit', {
        method: 'POST',
        body: JSON.stringify({ amount })
      });
    },

    requestWithdraw(amount, walletAddress) {
      return this.request('/api/wallet/withdraw', {
        method: 'POST',
        body: JSON.stringify({ amount, walletAddress })
      });
    },

    getAdminDashboard() {
      return this.request('/api/admin/dashboard');
    },

    reviewChannel(id, action) {
      return this.request(`/api/admin/channels/${id}/review`, {
        method: 'POST',
        body: JSON.stringify({ action })
      });
    },

    reviewTransaction(id, action) {
      return this.request(`/api/admin/transactions/${id}/review`, {
        method: 'POST',
        body: JSON.stringify({ action })
      });
    },

    completeCampaign(id) {
      return this.request(`/api/admin/campaigns/${id}/complete`, {
        method: 'POST'
      });
    },

    async fetchChannels() {
      try {
        const json = await this.get('/api/channels');
        if (json && json.success) {
          if (window.AppState) window.AppState.channels = json.data;
          safeCall('renderChannels');
          safeCall('renderAdminQueue');
        }
        return json;
      } catch (err) {
        console.error(err);
        return null;
      }
    },

    async fetchReferrals() {
      try {
        const json = await this.get('/api/referrals');
        if (json && json.success) {
          if (window.AppState) window.AppState.referrals = json.data;
          safeCall('renderReferrals');
        }
        return json;
      } catch (err) {
        console.error(err);
        return null;
      }
    },

    async fetchWallet() {
      try {
        const json = await this.get('/api/wallet');
        if (json && json.success && json.data) {
          if (window.AppState) window.AppState.wallet = json.data;
          safeCall('renderWallet');
        }
        return json;
      } catch (err) {
        console.error(err);
        return null;
      }
    },

    async fetchReliabilityData() {
      try {
        const [healthJson, notifJson, logsJson, backupsJson] = await Promise.all([
          this.get('/api/system/health'),
          this.get('/api/notifications'),
          this.get('/api/publish-logs'),
          this.get('/api/system/backups')
        ]);

        if (window.AppState) {
          if (healthJson && healthJson.success) window.AppState.health = healthJson.data;
          if (notifJson && notifJson.success) window.AppState.notifications = notifJson.data;
          if (logsJson && logsJson.success) window.AppState.publishLogs = logsJson.data;
          if (backupsJson && backupsJson.success) window.AppState.backups = backupsJson.data;
        }

        safeCall('renderReliabilityPanel');
        return { healthJson, notifJson, logsJson, backupsJson };
      } catch (err) {
        console.error(err);
        return null;
      }
    },

    async fetchMarketplaceChannels() {
      const budgetResult = safeCall('handleBudgetTargetingState');
      const isOpen = Boolean(budgetResult);

      const langEl = document.getElementById('camp-language');
      const catEl = document.getElementById('camp-category');
      const priceEl = document.getElementById('camp-price-input');
      const searchEl = document.getElementById('mkt-search-input');

      const lang = langEl ? langEl.value : '';
      const cat = catEl ? catEl.value : '';
      const parsedPrice = priceEl ? parseFloat(priceEl.value) : NaN;
      const maxPrice = Number.isFinite(parsedPrice) && parsedPrice > 0 ? parsedPrice : 3;
      const search = searchEl ? searchEl.value.trim() : '';

      const params = new URLSearchParams();
      params.set('openTargeting', String(isOpen));
      params.set('maxPrice', String(maxPrice));
      if (!isOpen) {
        if (lang) params.set('language', lang);
        if (cat) params.set('category', cat);
      }
      if (search) params.set('search', search);
      if (window.AppState && window.AppState.favoritesOnlyFilter) {
        params.set('favoritesOnly', 'true');
      }

      try {
        const json = await this.get(`/api/marketplace/channels?${params.toString()}`);
        if (json && json.success) {
          if (window.AppState) window.AppState.marketplaceChannels = json.data;
          safeCall('renderMarketplaceChannels');
        }
        return json;
      } catch (err) {
        console.error(err);
        return null;
      }
    },

    async fetchCampaigns() {
      try {
        const json = await this.get('/api/campaigns');
        if (json && json.success) {
          if (window.AppState) window.AppState.campaigns = json.data;
          safeCall('renderCampaigns');
        }
        return json;
      } catch (err) {
        console.error(err);
        return null;
      }
    }
  };

  window.Api = Api;

  // Global helper functions compatible with direct calls across modules
  window.apiGet = (url) => Api.get(url);
  window.apiSend = (url, method, body) => Api.send(url, method, body);
  window.fetchChannels = () => Api.fetchChannels();
  window.fetchReferrals = () => Api.fetchReferrals();
  window.fetchWallet = () => Api.fetchWallet();
  window.fetchReliabilityData = () => Api.fetchReliabilityData();
  window.fetchMarketplaceChannels = () => Api.fetchMarketplaceChannels();
  window.fetchCampaigns = () => Api.fetchCampaigns();
})();
