// ==================== ADMIN QUEUE, REFERRALS & SYSTEM RELIABILITY ====================
(function () {
  function t(key, fallback = '') {
    if (!key) return fallback;
    if (window.I18n && typeof window.I18n.t === 'function') {
      const val = window.I18n.t(key);
      if (val !== undefined && val !== null) return val;
    }
    if (window.I18N && typeof window.I18N.t === 'function') {
      const val = window.I18N.t(key);
      if (val !== undefined && val !== null) return val;
    }
    return fallback || key;
  }

  function toast(message) {
    if (!message) return;
    if (typeof window.showToast === 'function') {
      window.showToast(message);
    } else if (window.UI && typeof window.UI.showToast === 'function') {
      window.UI.showToast(message);
    } else if (window.UI && typeof window.UI.notify === 'function') {
      window.UI.notify(message);
    }
  }

  function esc(str) {
    if (typeof window.escapeHTML === 'function') return window.escapeHTML(str);
    if (window.UI && typeof window.UI.escapeHTML === 'function') return window.UI.escapeHTML(str);
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getState() {
    if (window.AppState) return window.AppState;
    if (typeof AppState !== 'undefined') return AppState;
    return null;
  }

  async function sendRequest(url, method, body) {
    if (typeof window.apiSend === 'function') {
      return window.apiSend(url, method, body);
    }
    if (window.Api && typeof window.Api.send === 'function') {
      return window.Api.send(url, method, body);
    }
    const options = {
      method,
      headers: {
        ...(window.Api?.getInitData ? { 'x-telegram-init-data': window.Api.getInitData() } : {})
      }
    };
    if (body !== undefined) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
    const res = await fetch(url, options);
    return res.json();
  }

  async function refreshChannelsData() {
    if (typeof window.fetchChannels === 'function') {
      await window.fetchChannels();
    } else if (window.Api && typeof window.Api.fetchChannels === 'function') {
      await window.Api.fetchChannels();
    }
  }

  async function refreshReliabilityState() {
    if (typeof window.fetchReliabilityData === 'function') {
      await window.fetchReliabilityData();
    } else if (window.Api && typeof window.Api.fetchReliabilityData === 'function') {
      await window.Api.fetchReliabilityData();
    }
  }

  async function reviewChannelDecision(id, decision) {
    try {
      const json = await sendRequest(`/api/channels/${id}/review`, 'POST', { decision });
      if (json && json.success) {
        toast(t('msg_review_updated'));
        await refreshChannelsData();
      } else if (json && json.message) {
        toast(json.message);
      }
    } catch (err) {
      toast(err.message);
    }
  }

  function renderAdminQueue() {
    const container = document.getElementById('admin-queue-container');
    if (!container) return;

    const state = getState();
    const channels = state && Array.isArray(state.channels) ? state.channels : [];
    const pending = channels.filter(
      (c) => c.isPublic !== false && c.approvalStatus === 'pending_review'
    );

    if (!pending.length) {
      container.innerHTML = `<div class="empty-state">${esc(t('no_pending_channels', t('no_data')))}</div>`;
      return;
    }

    container.innerHTML = pending
      .map((ch) => {
        const safeId = esc(ch._id);
        return `
          <div class="item-card">
            <div class="item-summary">
              <div class="item-title-group">
                <span class="item-title">${esc(ch.name)}</span>
                <span class="item-subtitle">${esc(ch.username)}</span>
                <span class="badge badge-draft">${esc(ch.subscribersCount || 0)}</span>
              </div>
              <div class="detail-actions">
                <button type="button" class="btn btn-success btn-sm" onclick="reviewChannelDecision('${safeId}', 'approved')">${esc(t('btn_approve_channel', t('approve')))}</button>
                <button type="button" class="btn btn-danger btn-sm" onclick="reviewChannelDecision('${safeId}', 'rejected')">${esc(t('btn_reject_channel', t('reject')))}</button>
              </div>
            </div>
          </div>
        `;
      })
      .join('');
  }

  function renderReferrals() {
    const container = document.getElementById('referrals-container');
    if (!container) return;

    const state = getState();
    const referrals = state && Array.isArray(state.referrals) ? state.referrals : [];

    if (!referrals.length) {
      container.innerHTML = `<div class="empty-state">${esc(t('no_referrals', t('no_data')))}</div>`;
      return;
    }

    container.innerHTML = referrals
      .map((ref) => {
        const chName = ref.channelId && ref.channelId.name ? ref.channelId.name : '-';
        return `
          <div class="item-card">
            <div class="detail-grid" style="margin-bottom:0;">
              <div class="detail-row"><span class="label">${esc(t('referral_publisher'))}</span><strong>${esc(ref.publisherTelegramId)}</strong></div>
              <div class="detail-row"><span class="label">${esc(t('referral_user'))}</span><strong>${esc(ref.referredUsername || ref.referredTelegramId)}</strong></div>
              <div class="detail-row"><span class="label">${esc(t('referral_channel'))}</span><strong>${esc(chName)}</strong></div>
            </div>
          </div>
        `;
      })
      .join('');
  }

  function renderReliabilityPanel() {
    const state = getState();

    const healthBox = document.getElementById('system-health-box');
    if (healthBox && state && state.health) {
      const h = state.health;
      healthBox.innerHTML = `
        <div class="detail-row"><span class="label">${esc(t('health_server'))}</span><strong>${esc(h.serverStatus)}</strong></div>
        <div class="detail-row"><span class="label">${esc(t('health_bot'))}</span><strong>${esc(h.botUsername)} (${h.botConfigured ? 'OK' : 'Token'})</strong></div>
        <div class="detail-row"><span class="label">${esc(t('health_uptime'))}</span><strong>${esc(h.uptimeSeconds)}s</strong></div>
        <div class="detail-row"><span class="label">${esc(t('health_channels'))}</span><strong>${esc(h.healthyBotChannels)} / ${esc(h.totalChannels)}</strong></div>
      `;
    }

    const notifList = document.getElementById('notifications-list');
    if (notifList) {
      const notifications = state && Array.isArray(state.notifications) ? state.notifications : [];
      if (!notifications.length) {
        notifList.innerHTML = `<div class="empty-state">${esc(t('no_notifications', t('no_data')))}</div>`;
      } else {
        notifList.innerHTML = notifications
          .map(
            (n) => `
            <div class="tx-row">
              <div>
                <strong>${esc(n.title)}</strong> ·
                <span>${esc(n.message)}</span>
              </div>
              <span class="badge ${n.isRead ? 'badge-price' : 'badge-draft'}">${n.isRead ? 'Read' : 'New'}</span>
            </div>
          `
          )
          .join('');
      }
    }

    const logsList = document.getElementById('publish-logs-list');
    if (logsList) {
      const publishLogs = state && Array.isArray(state.publishLogs) ? state.publishLogs : [];
      if (!publishLogs.length) {
        logsList.innerHTML = `<div class="empty-state">${esc(t('no_publish_logs', t('no_data')))}</div>`;
      } else {
        logsList.innerHTML = publishLogs
          .map((l) => {
            const detailsHtml = l.details
              ? `<span style="color:var(--text-muted);">(${esc(l.details)})</span>`
              : '';
            const badgeClass = l.status === 'published' ? 'badge-active' : 'badge-draft';
            return `
              <div class="tx-row">
                <div>
                  <strong>${esc(l.campaignTitle)}</strong> →
                  <span>${esc(l.channelName)}</span>
                  ${detailsHtml}
                </div>
                <span class="badge ${badgeClass}">${esc(l.status)}</span>
              </div>
            `;
          })
          .join('');
      }
    }

    const backupsList = document.getElementById('backups-list');
    if (backupsList) {
      const backups = state && Array.isArray(state.backups) ? state.backups : [];
      if (!backups.length) {
        backupsList.innerHTML = `<div class="empty-state">${esc(t('no_backups', t('no_data')))}</div>`;
      } else {
        backupsList.innerHTML = backups
          .map(
            (b) => `
            <div class="tx-row">
              <div>
                <strong dir="ltr">${esc(b.filename)}</strong> ·
                <span>${esc(b.totalRecords || 0)} records</span>
              </div>
              <span class="badge badge-price">${esc(b.status)}</span>
            </div>
          `
          )
          .join('');
      }
    }
  }

  async function createManualBackup() {
    try {
      const json = await sendRequest('/api/system/backups', 'POST');
      if (json && json.success) {
        toast(t('msg_backup_created'));
        await refreshReliabilityState();
      }
    } catch (err) {
      toast(err.message);
    }
  }

  async function markNotificationsRead() {
    try {
      const json = await sendRequest('/api/notifications/read-all', 'POST');
      if (json && json.success) {
        toast(t('msg_notifications_read'));
        await refreshReliabilityState();
      }
    } catch (err) {
      toast(err.message);
    }
  }

  const AdminModule = {
    enableAdminAccess() {
      const adminNavBtn = document.getElementById('nav-admin-btn');
      if (adminNavBtn) {
        adminNavBtn.style.display = 'flex';
      }
    },

    async loadDashboard() {
      try {
        if (!window.Api || typeof window.Api.getAdminDashboard !== 'function') return;
        const data = await window.Api.getAdminDashboard();
        if (!data) return;

        const totalUsersEl = document.getElementById('admin-total-users');
        const pendingChEl = document.getElementById('admin-pending-ch');
        const pendingTxEl = document.getElementById('admin-pending-tx');

        if (totalUsersEl && data.stats) totalUsersEl.textContent = data.stats.totalUsers ?? 0;
        if (pendingChEl && data.stats) pendingChEl.textContent = data.stats.pendingChannelsCount ?? 0;
        if (pendingTxEl && data.stats) pendingTxEl.textContent = data.stats.pendingTransactionsCount ?? 0;

        this.renderChannels(data.pendingChannels);
        this.renderCampaigns(data.pendingCampaigns);
        this.renderTransactions(data.pendingTransactions);
        this.renderLogs(data.securityLogs);
      } catch (err) {
        if (window.UI && typeof window.UI.notify === 'function') {
          window.UI.notify(err.message);
        } else {
          toast(err.message);
        }
      }
    },

    renderChannels(channels) {
      const listEl = document.getElementById('admin-channels-list');
      if (!listEl) return;

      if (!channels || channels.length === 0) {
        listEl.innerHTML = `<div class="empty-state">${esc(t('no_data'))}</div>`;
        return;
      }

      listEl.innerHTML = channels
        .map((ch) => {
          const safeId = esc(ch._id);
          return `
            <div class="list-item">
              <div class="item-main">
                <span class="item-title">@${esc(ch.channelUsername)} ($${esc(ch.pricePerPost)})</span>
                <span class="item-sub">Owner: ${esc(ch.ownerId)} • ${esc(ch.subscribers)} subs</span>
              </div>
              <div class="admin-actions">
                <button type="button" class="tg-btn sm success" onclick="AdminModule.handleChannel('${safeId}', 'approved')">${esc(t('approve'))}</button>
                <button type="button" class="tg-btn sm danger" onclick="AdminModule.handleChannel('${safeId}', 'rejected')">${esc(t('reject'))}</button>
              </div>
            </div>
          `;
        })
        .join('');
    },

    renderCampaigns(campaigns) {
      const listEl = document.getElementById('admin-campaigns-list');
      if (!listEl) return;

      if (!campaigns || campaigns.length === 0) {
        listEl.innerHTML = `<div class="empty-state">${esc(t('no_data'))}</div>`;
        return;
      }

      listEl.innerHTML = campaigns
        .map((camp) => {
          const safeId = esc(camp._id);
          const chUsername = camp.channelId?.channelUsername ? `@${esc(camp.channelId.channelUsername)}` : 'N/A';
          return `
            <div class="list-item">
              <div class="item-main">
                <span class="item-title">${esc(camp.title)} ($${esc(camp.budget)})</span>
                <span class="item-sub">${chUsername} • ${esc(camp.targetUrl || '')}</span>
              </div>
              <div class="admin-actions">
                <button type="button" class="tg-btn sm success" onclick="AdminModule.handleCampaign('${safeId}')">${esc(t('complete'))}</button>
              </div>
            </div>
          `;
        })
        .join('');
    },

    renderTransactions(txs) {
      const listEl = document.getElementById('admin-tx-list');
      if (!listEl) return;

      if (!txs || txs.length === 0) {
        listEl.innerHTML = `<div class="empty-state">${esc(t('no_data'))}</div>`;
        return;
      }

      listEl.innerHTML = txs
        .map((tx) => {
          const safeId = esc(tx._id);
          const txType = tx.type ? esc(String(tx.type).toUpperCase()) : '';
          return `
            <div class="list-item">
              <div class="item-main">
                <span class="item-title">${txType} ($${esc(Math.abs(Number(tx.amount || 0)))})</span>
                <span class="item-sub">User: ${esc(tx.userId)} • ${esc(tx.details || '')}</span>
              </div>
              <div class="admin-actions">
                <button type="button" class="tg-btn sm success" onclick="AdminModule.handleTx('${safeId}', 'completed')">${esc(t('approve'))}</button>
                <button type="button" class="tg-btn sm danger" onclick="AdminModule.handleTx('${safeId}', 'rejected')">${esc(t('reject'))}</button>
              </div>
            </div>
          `;
        })
        .join('');
    },

    renderLogs(logs) {
      const listEl = document.getElementById('admin-logs-list');
      if (!listEl) return;

      if (!logs || logs.length === 0) {
        listEl.innerHTML = `<div class="empty-state">${esc(t('no_data'))}</div>`;
        return;
      }

      listEl.innerHTML = logs
        .map(
          (log) => `
          <div class="list-item">
            <div class="item-main">
              <span class="item-title">${esc(log.action)}</span>
              <span class="item-sub">Actor: ${esc(log.actorId)} | ${esc(log.details || '')}</span>
            </div>
          </div>
        `
        )
        .join('');
    },

    async handleChannel(id, action) {
      if (!window.Api || typeof window.Api.reviewChannel !== 'function') return;
      await window.Api.reviewChannel(id, action);
      await this.loadDashboard();
    },

    async handleCampaign(id) {
      if (!window.Api || typeof window.Api.completeCampaign !== 'function') return;
      await window.Api.completeCampaign(id);
      await this.loadDashboard();
    },

    async handleTx(id, action) {
      if (!window.Api || typeof window.Api.reviewTransaction !== 'function') return;
      await window.Api.reviewTransaction(id, action);
      await this.loadDashboard();
    },

    reviewChannelDecision,
    renderAdminQueue,
    renderReferrals,
    renderReliabilityPanel,
    createManualBackup,
    markNotificationsRead
  };

  window.AdminModule = AdminModule;

  // Global helper functions for inline handlers and cross-module compatibility
  window.reviewChannelDecision = reviewChannelDecision;
  window.renderAdminQueue = renderAdminQueue;
  window.renderReferrals = renderReferrals;
  window.renderReliabilityPanel = renderReliabilityPanel;
  window.createManualBackup = createManualBackup;
  window.markNotificationsRead = markNotificationsRead;
})();
