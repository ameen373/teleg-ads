(function () {
  function resolveState(ctx) {
    if (ctx && ctx.state) return ctx.state;
    if (window.AppState && typeof window.AppState === 'object') return window.AppState;
    if (typeof AppState !== 'undefined' && AppState && typeof AppState === 'object') return AppState;
    return null;
  }

  function invokeUnified(fnName, ctx, ...args) {
    try {
      if (ctx && typeof ctx[fnName] === 'function') {
        return ctx[fnName](ctx, ...args);
      }
      if (typeof window[fnName] === 'function') {
        return window[fnName](ctx, ...args);
      }
    } catch (err) {
      console.error(err);
    }
    return undefined;
  }

  function triggerMaintenanceBanner(data, ctx) {
    if (!data || typeof data.maintenanceMode !== 'boolean') return;
    try {
      if (ctx && typeof ctx.renderMaintenanceBanner === 'function') {
        ctx.renderMaintenanceBanner(data.maintenanceMode, data.maintenanceMessage, ctx);
        return;
      }
      if (window.UI && typeof window.UI.renderMaintenanceBanner === 'function') {
        window.UI.renderMaintenanceBanner(data, ctx);
      } else if (typeof window.renderMaintenanceBanner === 'function') {
        window.renderMaintenanceBanner(data, ctx);
      }
    } catch (err) {
      console.error(err);
    }
  }

  const Api = {
    getInitData() {
      try {
        return window.Telegram?.WebApp?.initData || '';
      } catch (err) {
        console.error(err);
        return '';
      }
    },

    async request(endpoint, options = {}, ctx) {
      try {
        const state = resolveState(ctx);
        const headers = Object.assign(
          {
            'x-telegram-init-data': this.getInitData()
          },
          state?.userId ? { 'x-user-id': String(state.userId) } : {},
          state?.adminKey ? { 'x-admin-key': String(state.adminKey) } : {},
          options && options.headers ? options.headers : {}
        );

        if (options && options.body !== undefined && !headers['Content-Type']) {
          headers['Content-Type'] = 'application/json';
        }

        const response = await fetch(
          endpoint,
          Object.assign({}, options, {
            headers
          })
        );

        const data = await response.json().catch(() => ({}));
        triggerMaintenanceBanner(data, ctx);

        if (!response.ok || (data && (data.success === false || data.ok === false))) {
          throw new Error((data && (data.error || data.message)) || 'API Request Failed');
        }
        return data;
      } catch (err) {
        console.error(err);
        throw err;
      }
    },

    async get(url, ctx) {
      return this.request(url, { method: 'GET' }, ctx);
    },

    async send(url, method = 'POST', body, ctx) {
      const options = { method };
      if (body !== undefined) {
        options.body = typeof body === 'string' ? body : JSON.stringify(body);
      }
      return this.request(url, options, ctx);
    },

    getMe(ctx) {
      return this.request('/api/me', { method: 'GET' }, ctx);
    },

    updateLanguage(lang, ctx) {
      return this.request(
        '/api/user/language',
        {
          method: 'POST',
          body: JSON.stringify({ lang })
        },
        ctx
      );
    },

    getChannels(ctx) {
      return this.request('/api/channels', { method: 'GET' }, ctx);
    },

    addChannel(payload, ctx) {
      return this.request(
        '/api/channels',
        {
          method: 'POST',
          body: JSON.stringify(payload)
        },
        ctx
      );
    },

    getCampaigns(ctx) {
      return this.request('/api/campaigns', { method: 'GET' }, ctx);
    },

    createCampaign(payload, ctx) {
      return this.request(
        '/api/campaigns',
        {
          method: 'POST',
          body: JSON.stringify(payload)
        },
        ctx
      );
    },

    requestDeposit(amount, ctx) {
      return this.request(
        '/api/wallet/deposit',
        {
          method: 'POST',
          body: JSON.stringify({ amount })
        },
        ctx
      );
    },

    requestWithdraw(amount, walletAddress, ctx) {
      return this.request(
        '/api/wallet/withdraw',
        {
          method: 'POST',
          body: JSON.stringify({ amount, walletAddress })
        },
        ctx
      );
    },

    getAdminDashboard(ctx) {
      return this.request('/api/admin/dashboard', { method: 'GET' }, ctx);
    },

    reviewChannel(id, action, ctx) {
      return this.request(
        `/api/admin/channels/${encodeURIComponent(id)}/review`,
        {
          method: 'POST',
          body: JSON.stringify({ action })
        },
        ctx
      );
    },

    reviewTransaction(id, action, ctx) {
      return this.request(
        `/api/admin/transactions/${encodeURIComponent(id)}/review`,
        {
          method: 'POST',
          body: JSON.stringify({ action })
        },
        ctx
      );
    },

    completeCampaign(id, ctx) {
      return this.request(
        `/api/admin/campaigns/${encodeURIComponent(id)}/complete`,
        {
          method: 'POST'
        },
        ctx
      );
    },

    async refreshChannels(ctx) {
      try {
        const json = await this.get('/api/channels', ctx);
        const state = resolveState(ctx);
        if (json && json.success) {
          if (state) state.channels = json.data;
          invokeUnified('renderAdminQueue', ctx, json.data);
        }
        return json;
      } catch (err) {
        console.error(err);
        return null;
      }
    },

    async refreshReferrals(ctx) {
      try {
        const json = await this.get('/api/referrals', ctx);
        const state = resolveState(ctx);
        if (json && json.success && state) {
          state.referrals = json.data;
        }
        return json;
      } catch (err) {
        console.error(err);
        return null;
      }
    },

    async refreshWallet(ctx) {
      try {
        const json = await this.get('/api/wallet', ctx);
        const state = resolveState(ctx);
        if (json && json.success && json.data && state) {
          state.wallet = json.data;
        }
        return json;
      } catch (err) {
        console.error(err);
        return null;
      }
    },

    async refreshReliabilityData(ctx) {
      try {
        const [healthJson, notifJson, logsJson, backupsJson] = await Promise.all([
          this.get('/api/system/health', ctx),
          this.get('/api/notifications', ctx),
          this.get('/api/publish-logs', ctx),
          this.get('/api/system/backups', ctx)
        ]);

        const state = resolveState(ctx);
        if (state) {
          if (healthJson && healthJson.success) state.health = healthJson.data;
          if (notifJson && notifJson.success) state.notifications = notifJson.data;
          if (logsJson && logsJson.success) state.publishLogs = logsJson.data;
          if (backupsJson && backupsJson.success) state.backups = backupsJson.data;
        }

        invokeUnified('renderReliabilityPanel', ctx, {
          healthJson,
          notifJson,
          logsJson,
          backupsJson
        });
        return { healthJson, notifJson, logsJson, backupsJson };
      } catch (err) {
        console.error(err);
        return null;
      }
    },

    async refreshMarketplaceChannels(ctx) {
      try {
        const budgetResult = invokeUnified('handleBudgetTargetingState', ctx);
        const isOpen = Boolean(budgetResult);
        const state = resolveState(ctx);

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
        if (state && state.favoritesOnlyFilter) {
          params.set('favoritesOnly', 'true');
        }

        const json = await this.get(`/api/marketplace/channels?${params.toString()}`, ctx);
        if (json && json.success && state) {
          state.marketplaceChannels = json.data;
        }
        return json;
      } catch (err) {
        console.error(err);
        return null;
      }
    },

    async refreshCampaigns(ctx) {
      try {
        const json = await this.get('/api/campaigns', ctx);
        const state = resolveState(ctx);
        if (json && json.success && state) {
          state.campaigns = json.data;
        }
        return json;
      } catch (err) {
        console.error(err);
        return null;
      }
    }
  };

  window.Api = Api;
  window.apiRequest = (url, options, ctx) => Api.request(url, options, ctx);
  window.apiGet = (url, ctx) => Api.get(url, ctx);
  window.apiSend = (url, method, body, ctx) => Api.send(url, method, body, ctx);
  window.refreshChannels = (ctx) => Api.refreshChannels(ctx);
  window.refreshReferrals = (ctx) => Api.refreshReferrals(ctx);
  window.refreshWallet = (ctx) => Api.refreshWallet(ctx);
  window.refreshReliabilityData = (ctx) => Api.refreshReliabilityData(ctx);
  window.refreshMarketplaceChannels = (ctx) => Api.refreshMarketplaceChannels(ctx);
  window.refreshCampaigns = (ctx) => Api.refreshCampaigns(ctx);
})();
