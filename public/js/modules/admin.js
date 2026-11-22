'use strict';

(function (window) {
  const state = {
    pendingChannels: [],
    processingIds: {},
    dashboardData: null,
  };

  function tr(key) {
    if (window.I18n && typeof window.I18n.t === 'function') {
      return window.I18n.t(key);
    }
    if (window.TelegaI18n && typeof window.TelegaI18n.t === 'function') {
      return window.TelegaI18n.t(key);
    }
    return key;
  }

  function getApiRequest() {
    if (window.TelegaApi && typeof window.TelegaApi.request === 'function') {
      return window.TelegaApi.request.bind(window.TelegaApi);
    }
    if (window.Api && typeof window.Api.request === 'function') {
      return window.Api.request.bind(window.Api);
    }
    throw new Error('واجهة طلبات الشبكة TelegaApi.request غير متاحة');
  }

  function notify(message, type = 'info') {
    if (window.TelegaUI && typeof window.TelegaUI.toast === 'function') {
      window.TelegaUI.toast(message, type, 'admin-feedback-banner');
      return;
    }

    if (window.UI && typeof window.UI.notify === 'function') {
      window.UI.notify(message);
      return;
    }

    const banner = document.getElementById('admin-feedback-banner');
    if (!banner) {
      return;
    }
    banner.className = `feedback-banner feedback-${type}`;
    banner.textContent = message;
    banner.classList.remove('hidden');
  }

  function sanitizeText(value) {
    if (window.TelegaUI && typeof window.TelegaUI.escapeHtml === 'function') {
      return window.TelegaUI.escapeHtml(value);
    }
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderPendingChannels() {
    const container = document.getElementById('admin-pending-channels-list');
    const countEl = document.getElementById('admin-pending-count');
    if (!container) {
      return;
    }

    if (countEl) {
      countEl.textContent = String(state.pendingChannels.length);
    }

    if (!state.pendingChannels.length) {
      container.innerHTML = `
        <div class="empty-state-card">
          <p>لا توجد قنوات بانتظار موافقة الإدارة حالياً.</p>
          <span>القنوات التي تملك أقل من 1000 مشترك ستظهر هنا لمراجعتها واعتمادها أو رفضها.</span>
        </div>
      `;
      return;
    }

    container.innerHTML = state.pendingChannels
      .map((ch) => {
        const chatId = ch.chatId || ch.id || ch._id || '';
        const isBusy = Boolean(state.processingIds[chatId]);
        const uname = ch.username || ch.channelUsername || '';
        const handleText = uname
          ? `@${sanitizeText(String(uname).replace(/^@/, ''))}`
          : sanitizeText(chatId);
        const subs = Number(ch.subscribersCount ?? ch.subscribers ?? 0);
        const price = Number(ch.price ?? ch.pricePerPost ?? 0);

        return `
          <div class="channel-item-card" data-admin-chat-id="${sanitizeText(chatId)}">
            <div class="channel-card-top">
              <div>
                <h4 class="channel-title">${sanitizeText(ch.title || handleText)}</h4>
                <div class="channel-handle">${handleText} • المالك: ${sanitizeText(ch.ownerId)}</div>
              </div>
              <span class="status-badge badge-pending">أقل من 1000 مشترك</span>
            </div>

            <div class="channel-stats-grid">
              <div class="stat-box">
                <span class="stat-label">المشتركون</span>
                <strong class="stat-value">${subs.toLocaleString()}</strong>
              </div>
              <div class="stat-box">
                <span class="stat-label">السعر</span>
                <strong class="stat-value">$${price.toFixed(2)}</strong>
              </div>
              <div class="stat-box">
                <span class="stat-label">اللغة</span>
                <strong class="stat-value">${sanitizeText(ch.language || '-')}</strong>
              </div>
              <div class="stat-box">
                <span class="stat-label">التصنيف</span>
                <strong class="stat-value">${sanitizeText(ch.category || '-')}</strong>
              </div>
            </div>

            <div class="channel-card-footer">
              <span class="promo-indicator">عند الموافقة يُنشر إعلان المنصة تلقائياً في القناة</span>
              <div class="admin-action-buttons">
                <button
                  type="button"
                  class="btn btn-primary btn-sm admin-decision-btn"
                  data-chat-id="${sanitizeText(chatId)}"
                  data-decision="approve"
                  ${isBusy ? 'disabled' : ''}
                >
                  ✅ موافقة ونشر الإعلان
                </button>
                <button
                  type="button"
                  class="btn btn-outline btn-sm admin-decision-btn"
                  data-chat-id="${sanitizeText(chatId)}"
                  data-decision="reject"
                  ${isBusy ? 'disabled' : ''}
                >
                  ❌ رفض
                </button>
              </div>
            </div>
          </div>
        `;
      })
      .join('');
  }

  async function loadPendingChannels() {
    try {
      const request = getApiRequest();
      const data = await request('/api/admin/channels/pending', { method: 'GET' });
      state.pendingChannels = Array.isArray(data.channels) ? data.channels : [];
      renderPendingChannels();
    } catch (err) {
      if (err?.status === 401 || err?.status === 403) {
        state.pendingChannels = [];
        renderPendingChannels();
        return;
      }
      notify(err.message || 'تعذر تحميل القنوات المعلقة', 'error');
      renderPendingChannels();
    }
  }

  async function handleDecision(chatId, decision) {
    if (!chatId || !['approve', 'reject'].includes(decision) || state.processingIds[chatId]) {
      return;
    }

    state.processingIds[chatId] = true;
    renderPendingChannels();

    try {
      const request = getApiRequest();
      await request(`/api/admin/channels/${encodeURIComponent(chatId)}/decision`, {
        method: 'POST',
        body: { decision },
      });

      const msg =
        decision === 'approve'
          ? 'تمت الموافقة على القناة ونشر منشور المنصة بنجاح'
          : 'تم رفض القناة بنجاح';
      notify(msg, 'success');
      await loadPendingChannels();
      if (window.AdminModule && typeof window.AdminModule.loadDashboard === 'function') {
        await window.AdminModule.loadDashboard();
      }
    } catch (err) {
      notify(err.message || 'تعذر تنفيذ قرار الإدارة', 'error');
    } finally {
      state.processingIds[chatId] = false;
      renderPendingChannels();
    }
  }

  function bindEvents() {
    const refreshBtn = document.getElementById('refresh-admin-pending-btn');
    if (refreshBtn && refreshBtn.dataset.adminBound !== 'true') {
      refreshBtn.dataset.adminBound = 'true';
      refreshBtn.addEventListener('click', loadPendingChannels);
    }

    const listEl = document.getElementById('admin-pending-channels-list');
    if (listEl && listEl.dataset.adminBound !== 'true') {
      listEl.dataset.adminBound = 'true';
      listEl.addEventListener('click', (event) => {
        const btn = event.target.closest('.admin-decision-btn');
        if (btn) {
          const cid = btn.getAttribute('data-chat-id');
          const dec = btn.getAttribute('data-decision');
          handleDecision(cid, dec);
        }
      });
    }
  }

  function initAdminModule() {
    bindEvents();
    renderPendingChannels();
  }

  const AdminModule = {
    enableAdminAccess() {
      const adminNavBtn = document.getElementById('nav-admin-btn');
      if (adminNavBtn) {
        adminNavBtn.style.display = 'flex';
        adminNavBtn.classList.remove('hidden');
      }
      bindEvents();
      loadPendingChannels();
    },

    async loadDashboard() {
      try {
        bindEvents();
        let data;
        if (window.Api && typeof window.Api.getAdminDashboard === 'function') {
          data = await window.Api.getAdminDashboard();
        } else {
          const request = getApiRequest();
          data = await request('/api/admin/dashboard', { method: 'GET' });
        }

        state.dashboardData = data;

        const totalUsersEl = document.getElementById('admin-total-users');
        const pendingChEl = document.getElementById('admin-pending-ch');
        const pendingTxEl = document.getElementById('admin-pending-tx');

        if (totalUsersEl) totalUsersEl.textContent = data.stats?.totalUsers ?? 0;
        if (pendingChEl) pendingChEl.textContent = data.stats?.pendingChannelsCount ?? 0;
        if (pendingTxEl) pendingTxEl.textContent = data.stats?.pendingTransactionsCount ?? 0;

        this.renderChannels(data.pendingChannels);
        this.renderCampaigns(data.pendingCampaigns);
        this.renderTransactions(data.pendingTransactions);
        this.renderLogs(data.securityLogs);

        if (Array.isArray(data.pendingChannels)) {
          state.pendingChannels = data.pendingChannels;
          renderPendingChannels();
        }
      } catch (err) {
        if (err?.status === 401 || err?.status === 403) {
          return;
        }
        notify(err.message);
      }
    },

    renderChannels(channels) {
      const listEl = document.getElementById('admin-channels-list');
      if (!listEl) {
        return;
      }
      if (!channels || channels.length === 0) {
        listEl.innerHTML = `<div class="empty-state">${sanitizeText(tr('no_data'))}</div>`;
        return;
      }

      listEl.innerHTML = channels
        .map((ch) => {
          const id = ch._id || ch.id || ch.chatId || '';
          const uname = ch.channelUsername || ch.username || id;
          const price = ch.pricePerPost ?? ch.price ?? 0;
          const subs = ch.subscribers ?? ch.subscribersCount ?? 0;
          return `
            <div class="list-item">
              <div class="item-main">
                <span class="item-title">@${sanitizeText(uname)} ($${sanitizeText(price)})</span>
                <span class="item-sub">Owner: ${sanitizeText(ch.ownerId)} • ${sanitizeText(subs)} subs</span>
              </div>
              <div class="admin-actions">
                <button class="tg-btn sm success" onclick="AdminModule.handleChannel('${sanitizeText(id)}', 'approved')">${sanitizeText(tr('approve'))}</button>
                <button class="tg-btn sm danger" onclick="AdminModule.handleChannel('${sanitizeText(id)}', 'rejected')">${sanitizeText(tr('reject'))}</button>
              </div>
            </div>
          `;
        })
        .join('');
    },

    renderCampaigns(campaigns) {
      const listEl = document.getElementById('admin-campaigns-list');
      if (!listEl) {
        return;
      }
      if (!campaigns || campaigns.length === 0) {
        listEl.innerHTML = `<div class="empty-state">${sanitizeText(tr('no_data'))}</div>`;
        return;
      }

      listEl.innerHTML = campaigns
        .map((camp) => {
          const id = camp._id || camp.id || camp.campaignId || '';
          const budget = camp.budget ?? camp.budgetAllocated ?? 0;
          const chUsername = camp.channelId?.channelUsername || camp.channelId?.username || 'N/A';
          const url = camp.targetUrl || camp.ctaButton?.url || '';
          return `
            <div class="list-item">
              <div class="item-main">
                <span class="item-title">${sanitizeText(camp.title)} ($${sanitizeText(budget)})</span>
                <span class="item-sub">@${sanitizeText(chUsername)} • ${sanitizeText(url)}</span>
              </div>
              <div class="admin-actions">
                <button class="tg-btn sm success" onclick="AdminModule.handleCampaign('${sanitizeText(id)}')">${sanitizeText(tr('complete'))}</button>
              </div>
            </div>
          `;
        })
        .join('');
    },

    renderTransactions(txs) {
      const listEl = document.getElementById('admin-tx-list');
      if (!listEl) {
        return;
      }
      if (!txs || txs.length === 0) {
        listEl.innerHTML = `<div class="empty-state">${sanitizeText(tr('no_data'))}</div>`;
        return;
      }

      listEl.innerHTML = txs
        .map((tx) => {
          const id = tx._id || tx.id || tx.transactionId || '';
          return `
            <div class="list-item">
              <div class="item-main">
                <span class="item-title">${sanitizeText(String(tx.type || '').toUpperCase())} ($${sanitizeText(Math.abs(Number(tx.amount || 0)))})</span>
                <span class="item-sub">User: ${sanitizeText(tx.userId)} • ${sanitizeText(tx.details)}</span>
              </div>
              <div class="admin-actions">
                <button class="tg-btn sm success" onclick="AdminModule.handleTx('${sanitizeText(id)}', 'completed')">${sanitizeText(tr('approve'))}</button>
                <button class="tg-btn sm danger" onclick="AdminModule.handleTx('${sanitizeText(id)}', 'rejected')">${sanitizeText(tr('reject'))}</button>
              </div>
            </div>
          `;
        })
        .join('');
    },

    renderLogs(logs) {
      const listEl = document.getElementById('admin-logs-list');
      if (!listEl) {
        return;
      }
      if (!logs || logs.length === 0) {
        listEl.innerHTML = `<div class="empty-state">${sanitizeText(tr('no_data'))}</div>`;
        return;
      }

      listEl.innerHTML = logs
        .map((log) => {
          const action = log.action || log.eventType || '';
          const actor = log.actorId || log.details?.actorId || log.details?.userId || 'system';
          const details =
            typeof log.details === 'string'
              ? log.details
              : log.details?.details || JSON.stringify(log.details || {});
          return `
            <div class="list-item">
              <div class="item-main">
                <span class="item-title">${sanitizeText(action)}</span>
                <span class="item-sub">Actor: ${sanitizeText(actor)} | ${sanitizeText(details)}</span>
              </div>
            </div>
          `;
        })
        .join('');
    },

    async handleChannel(id, action) {
      if (window.Api && typeof window.Api.reviewChannel === 'function') {
        await window.Api.reviewChannel(id, action);
      } else {
        const request = getApiRequest();
        const decision = action === 'approved' ? 'approve' : 'reject';
        await request(`/api/admin/channels/${encodeURIComponent(id)}/decision`, {
          method: 'POST',
          body: { decision },
        });
      }
      await this.loadDashboard();
      await loadPendingChannels();
    },

    async handleCampaign(id) {
      if (window.Api && typeof window.Api.completeCampaign === 'function') {
        await window.Api.completeCampaign(id);
      } else {
        const request = getApiRequest();
        await request(`/api/admin/campaigns/${encodeURIComponent(id)}/complete`, {
          method: 'POST',
        });
      }
      await this.loadDashboard();
    },

    async handleTx(id, action) {
      if (window.Api && typeof window.Api.reviewTransaction === 'function') {
        await window.Api.reviewTransaction(id, action);
      } else {
        const request = getApiRequest();
        await request(`/api/admin/transactions/${encodeURIComponent(id)}/review`, {
          method: 'POST',
          body: { action },
        });
      }
      await this.loadDashboard();
    },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAdminModule);
  } else {
    initAdminModule();
  }

  window.AdminModule = AdminModule;
  window.TelegaAdminModule = {
    init: initAdminModule,
    reload: loadPendingChannels,
    loadDashboard: () => AdminModule.loadDashboard(),
    getState: function () {
      return state;
    },
  };
})(window);
