(function () {
  const Api = {
    getInitData() {
      return window.Telegram?.WebApp?.initData || '';
    },

    async request(endpoint, options = {}) {
      const headers = {
        'Content-Type': 'application/json',
        'x-telegram-init-data': this.getInitData(),
        ...(options.headers || {})
      };

      const response = await fetch(endpoint, {
        ...options,
        headers
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || 'API Request Failed');
      }
      return data;
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
    }
  };

  window.Api = Api;
})();
