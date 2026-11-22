'use strict';

(function (window) {
  function getCurrentUserId() {
    try {
      const tg = window.Telegram && window.Telegram.WebApp;
      if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.id) {
        return String(tg.initDataUnsafe.user.id);
      }
    } catch (err) {
      // تجاهل أخطاء بيئة التطوير
    }

    try {
      if (window.TelegaAppState && window.TelegaAppState.devUserId) {
        return String(window.TelegaAppState.devUserId);
      }
      if (window.AppState && window.AppState.devUserId) {
        return String(window.AppState.devUserId);
      }
      if (window.localStorage) {
        const stored = window.localStorage.getItem('telega_dev_user_id');
        if (stored) {
          return String(stored);
        }
      }
    } catch (err) {
      // تجاهل أخطاء التخزين المحلي
    }

    return '';
  }

  function getAuthHeaders() {
    const headers = {
      'Content-Type': 'application/json',
    };

    try {
      const tg = window.Telegram && window.Telegram.WebApp;
      if (tg && tg.initData) {
        headers['x-telegram-init-data'] = tg.initData;
        return headers;
      }
    } catch (err) {
      // تجاهل خطأ قراءة initData خارج بيئة تليجرام
    }

    const devUserId = getCurrentUserId();
    if (devUserId) {
      headers['x-dev-user-id'] = devUserId;
    }

    return headers;
  }

  function getFallbackError() {
    if (window.TelegaI18n && typeof window.TelegaI18n.t === 'function') {
      return window.TelegaI18n.t('channels.networkError');
    }
    if (window.I18n && typeof window.I18n.t === 'function') {
      return window.I18n.t('network_error');
    }
    return 'حدث خطأ أثناء الاتصال بالخادم';
  }

  async function rawRequest(url, options = {}) {
    const fallbackError = getFallbackError();
    const mergedHeaders = Object.assign({}, getAuthHeaders(), options.headers || {});
    const body =
      options.body !== undefined
        ? typeof options.body === 'string'
          ? options.body
          : JSON.stringify(options.body)
        : undefined;

    const response = await fetch(url, {
      ...options,
      method: options.method || 'GET',
      headers: mergedHeaders,
      body,
    });

    const data = await response.json();
    const isOk = response.ok && data.ok !== false && data.success !== false;
    if (!isOk) {
      throw new Error(data.message || data.error || fallbackError);
    }

    return data;
  }

  const Api = {
    getInitData() {
      return window.Telegram?.WebApp?.initData || '';
    },

    getCurrentUserId,

    getAuthHeaders,

    rawRequest,

    async request(endpoint, options = {}) {
      const headers = Object.assign(
        {
          'Content-Type': 'application/json',
          'x-telegram-init-data': this.getInitData(),
        },
        getAuthHeaders(),
        options.headers || {}
      );

      const response = await fetch(endpoint, {
        ...options,
        headers,
      });

      const data = await response.json();
      const isOk = response.ok && (data.success === true || (data.success === undefined && data.ok !== false));
      if (!isOk) {
        throw new Error(data.message || data.error || 'API Request Failed');
      }
      return data;
    },

    getMe() {
      return this.request('/api/me');
    },

    updateLanguage(lang) {
      return this.request('/api/user/language', {
        method: 'POST',
        body: JSON.stringify({ lang }),
      });
    },

    getChannels() {
      return this.request('/api/channels');
    },

    addChannel(payload) {
      return this.request('/api/channels', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },

    getCampaigns() {
      return this.request('/api/campaigns');
    },

    createCampaign(payload) {
      return this.request('/api/campaigns', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },

    requestDeposit(amount) {
      return this.request('/api/wallet/deposit', {
        method: 'POST',
        body: JSON.stringify({ amount }),
      });
    },

    requestWithdraw(amount, walletAddress) {
      return this.request('/api/wallet/withdraw', {
        method: 'POST',
        body: JSON.stringify({ amount, walletAddress }),
      });
    },

    getAdminDashboard() {
      return this.request('/api/admin/dashboard');
    },

    reviewChannel(id, action) {
      return this.request(`/api/admin/channels/${id}/review`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      });
    },

    reviewTransaction(id, action) {
      return this.request(`/api/admin/transactions/${id}/review`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      });
    },

    completeCampaign(id) {
      return this.request(`/api/admin/campaigns/${id}/complete`, {
        method: 'POST',
      });
    },
  };

  window.Api = Api;

  window.TelegaApi = Object.assign({}, window.TelegaApi || {}, {
    getCurrentUserId,
    getAuthHeaders,
    rawRequest,
    request: (url, options = {}) => rawRequest(url, options),
  });
})(window);
