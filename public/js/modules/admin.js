(function () {
  function translateKey(key, fallback = '', ctx) {
    if (!key) return fallback;
    try {
      if (ctx && typeof ctx.t === 'function') {
        const val = ctx.t(key, ctx);
        if (val !== undefined && val !== null) return val;
      }
      if (window.TelegaI18n && typeof window.TelegaI18n.t === 'function') {
        const val = window.TelegaI18n.t(key, ctx);
        if (val !== undefined && val !== null) return val;
      }
      if (window.I18N && typeof window.I18N.t === 'function') {
        const val = window.I18N.t(key, ctx);
        if (val !== undefined && val !== null) return val;
      }
    } catch (err) {
      console.error(err);
    }
    return fallback || key;
  }

  function esc(str) {
    if (window.UI && typeof window.UI.escapeHTML === 'function') {
      return window.UI.escapeHTML(str);
    }
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getState(ctx) {
    if (ctx && ctx.state && typeof ctx.state === 'object') return ctx.state;
    if (window.AppState && typeof window.AppState === 'object') return window.AppState;
    if (typeof AppState !== 'undefined' && AppState && typeof AppState === 'object') return AppState;
    return null;
  }

  function getEl(id, ctx) {
    if (!id) return null;
    if (ctx && typeof ctx.el === 'function') {
      const node = ctx.el(id);
      if (node) return node;
    }
    if (ctx && ctx.root && typeof ctx.root.querySelector === 'function') {
      const escaped = typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(id) : id;
      const found = ctx.root.querySelector(`#${escaped}`);
      if (found) return found;
    }
    return document.getElementById(id);
  }

  function toast(message, ctx) {
    if (!message) return;
    try {
      if (window.UI && typeof window.UI.showToast === 'function') {
        window.UI.showToast(message, ctx);
      } else if (window.UI && typeof window.UI.notify === 'function') {
        window.UI.notify(message);
      }
    } catch (err) {
      console.error(err);
    }
  }

  function showAdminNotice(message, isError = false, ctx) {
    if (!message) return;
    try {
      if (ctx && typeof ctx.showNotice === 'function') {
        ctx.showNotice('adminNotice', message, isError);
      } else if (window.UI && typeof window.UI.showNotice === 'function') {
        window.UI.showNotice('adminNotice', message, isError, ctx);
      }
    } catch (err) {
      console.error(err);
    }
    toast(message, ctx);
  }

  function clearAdminNotice(ctx) {
    try {
      if (ctx && typeof ctx.clearNotice === 'function') {
        ctx.clearNotice('adminNotice');
      } else if (window.UI && typeof window.UI.clearNotice === 'function') {
        window.UI.clearNotice('adminNotice', ctx);
      }
    } catch (err) {
      console.error(err);
    }
  }

  function syncMaintenanceBanner(enabled, message, ctx) {
    try {
      if (ctx && typeof ctx.renderMaintenanceBanner === 'function') {
        ctx.renderMaintenanceBanner({
          maintenanceMode: Boolean(enabled),
          maintenanceMessage: message
        });
      } else if (window.UI && typeof window.UI.renderMaintenanceBanner === 'function') {
        window.UI.renderMaintenanceBanner(
          { maintenanceMode: Boolean(enabled), maintenanceMessage: message },
          undefined,
          ctx
        );
      }
    } catch (err) {
      console.error(err);
    }
  }

  function buildContext(ctx) {
    if (ctx && ctx.state) return ctx;
    if (window.App && typeof window.App.getContext === 'function') {
      const appCtx = window.App.getContext();
      if (appCtx) return appCtx;
    }
    const state = getState(ctx);
    const baseCtx = {
      state,
      el: (id) => document.getElementById(id),
      t: (key) => translateKey(key, key, baseCtx),
      apiRequest: async (url, options = {}) => {
        const headers = Object.assign(
          {},
          state?.userId ? { 'x-user-id': String(state.userId) } : {},
          state?.adminKey ? { 'x-admin-key': String(state.adminKey) } : {},
          options && options.headers ? options.headers : {}
        );
        if (options && options.body !== undefined && !headers['Content-Type']) {
          headers['Content-Type'] = 'application/json';
        }
        const res = await fetch(url, Object.assign({}, options, { headers }));
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.ok === false || data.success === false) {
          const err = new Error(data.error || data.message || 'Request failed');
          err.status = res.status;
          err.data = data;
          throw err;
        }
        return data;
      },
      showNotice: (targetId, message, isError) => {
        if (window.UI && typeof window.UI.showNotice === 'function') {
          window.UI.showNotice(targetId, message, isError, baseCtx);
        }
      },
      clearNotice: (targetId) => {
        if (window.UI && typeof window.UI.clearNotice === 'function') {
          window.UI.clearNotice(targetId, baseCtx);
        }
      },
      renderMaintenanceBanner: (data) => {
        if (window.UI && typeof window.UI.renderMaintenanceBanner === 'function') {
          window.UI.renderMaintenanceBanner(data, undefined, baseCtx);
        }
      },
      refreshWallet: async () => {
        if (typeof window.refreshWallet === 'function') {
          await window.refreshWallet(baseCtx);
        }
      },
      refreshCampaigns: async () => {
        if (typeof window.refreshCampaigns === 'function') {
          await window.refreshCampaigns(baseCtx);
        }
      },
      refreshChannels: async () => {
        if (typeof window.refreshChannels === 'function') {
          await window.refreshChannels(baseCtx);
        }
      },
      refreshTicketsAndBroadcasts: async () => {
        if (window.UI && typeof window.UI.refreshTicketsAndBroadcasts === 'function') {
          await window.UI.refreshTicketsAndBroadcasts(baseCtx);
        }
      }
    };
    return baseCtx;
  }

  async function callAdminApi(ctx, url, method = 'POST', body = undefined) {
    const activeCtx = buildContext(ctx);
    const adminKey = activeCtx.state?.adminKey || '';
    const opts = {
      method,
      headers: Object.assign({}, adminKey ? { 'x-admin-key': String(adminKey) } : {})
    };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = typeof body === 'string' ? body : JSON.stringify(body);
    }
    return await activeCtx.apiRequest(url, opts, activeCtx);
  }

  async function refreshChannelsData(ctx) {
    try {
      const activeCtx = buildContext(ctx);
      if (typeof activeCtx.refreshChannels === 'function') {
        await activeCtx.refreshChannels();
      } else if (typeof window.refreshChannels === 'function') {
        await window.refreshChannels(activeCtx);
      }
      renderAdminQueue(activeCtx);
    } catch (err) {
      console.error(err);
    }
  }

  async function refreshReferrals(ctx) {
    const activeCtx = buildContext(ctx);
    const state = activeCtx.state;
    try {
      const query = state?.userId ? `?userId=${encodeURIComponent(state.userId)}` : '';
      const data = await activeCtx.apiRequest(`/api/referrals${query}`, { method: 'GET' }, activeCtx);
      if (state && Array.isArray(data?.referrals)) {
        state.referrals = data.referrals;
      }
      renderReferrals(activeCtx);
      return data;
    } catch (err) {
      console.error(err);
    }
  }

  async function refreshReliabilityState(ctx) {
    const activeCtx = buildContext(ctx);
    const state = activeCtx.state;
    try {
      const query = state?.userId ? `?userId=${encodeURIComponent(state.userId)}` : '';
      const data = await activeCtx.apiRequest(`/api/system/reliability${query}`, { method: 'GET' }, activeCtx);
      if (state && data) {
        if (data.health) state.health = data.health;
        if (Array.isArray(data.notifications)) state.notifications = data.notifications;
        if (Array.isArray(data.publishLogs)) state.publishLogs = data.publishLogs;
        if (Array.isArray(data.backups)) state.backups = data.backups;
      }
      renderReliabilityPanel(activeCtx);
      return data;
    } catch (err) {
      console.error(err);
    }
  }

  async function reviewChannelDecision(id, decision, ctx) {
    const activeCtx = buildContext(ctx);
    try {
      const json = await activeCtx.apiRequest(
        `/api/channels/${encodeURIComponent(id)}/review`,
        {
          method: 'POST',
          body: JSON.stringify({ decision })
        },
        activeCtx
      );
      if (json && (json.success || json.ok !== false)) {
        toast(translateKey('msg_review_updated', 'Review updated', activeCtx), activeCtx);
        await refreshChannelsData(activeCtx);
        if (stateHasAdminKey(activeCtx)) {
          await refreshAdminPanel(activeCtx);
        }
      } else if (json && json.message) {
        toast(json.message, activeCtx);
      }
    } catch (err) {
      console.error(err);
      toast(err.message, activeCtx);
    }
  }

  function stateHasAdminKey(ctx) {
    return Boolean(ctx?.state?.adminKey);
  }

  function renderAdminQueue(ctx) {
    const activeCtx = buildContext(ctx);
    const container = getEl('admin-queue-container', activeCtx);
    if (!container) return;

    try {
      const state = getState(activeCtx);
      const channels = state && Array.isArray(state.channels) ? state.channels : [];
      const pending = channels.filter(
        (c) => c.isPublic !== false && c.approvalStatus === 'pending_review'
      );

      if (!pending.length) {
        container.innerHTML = `<div class="empty-state">${esc(translateKey('no_pending_channels', translateKey('no_data', 'No data', activeCtx), activeCtx))}</div>`;
        return;
      }

      container.innerHTML = pending
        .map((ch) => {
          const safeId = esc(ch._id || ch.id);
          return `
            <div class="item-card">
              <div class="item-summary">
                <div class="item-title-group">
                  <span class="item-title">${esc(ch.name || ch.title || '')}</span>
                  <span class="item-subtitle">${esc(ch.username || ch.channelUsername || '')}</span>
                  <span class="badge badge-draft">${esc(ch.subscribersCount ?? ch.subscribers ?? 0)}</span>
                </div>
                <div class="detail-actions">
                  <button type="button" class="btn btn-success btn-sm" data-queue-id="${safeId}" data-queue-decision="approved">${esc(translateKey('btn_approve_channel', translateKey('approve', 'Approve', activeCtx), activeCtx))}</button>
                  <button type="button" class="btn btn-danger btn-sm" data-queue-id="${safeId}" data-queue-decision="rejected">${esc(translateKey('btn_reject_channel', translateKey('reject', 'Reject', activeCtx), activeCtx))}</button>
                </div>
              </div>
            </div>
          `;
        })
        .join('');

      container.querySelectorAll('[data-queue-id]').forEach((btn) => {
        btn.addEventListener('click', () => {
          reviewChannelDecision(btn.getAttribute('data-queue-id'), btn.getAttribute('data-queue-decision'), activeCtx);
        });
      });
    } catch (err) {
      console.error(err);
    }
  }

  function renderReferrals(ctx) {
    const activeCtx = buildContext(ctx);
    const container = getEl('referrals-container', activeCtx);
    if (!container) return;

    try {
      const state = getState(activeCtx);
      const referrals = state && Array.isArray(state.referrals) ? state.referrals : [];

      if (!referrals.length) {
        container.innerHTML = `<div class="empty-state">${esc(translateKey('no_referrals', translateKey('no_data', 'No data', activeCtx), activeCtx))}</div>`;
        return;
      }

      container.innerHTML = referrals
        .map((ref) => {
          const chName = ref.channelId && ref.channelId.name ? ref.channelId.name : '-';
          return `
            <div class="item-card">
              <div class="detail-grid" style="margin-bottom:0;">
                <div class="detail-row"><span class="label">${esc(translateKey('referral_publisher', 'Publisher:', activeCtx))}</span><strong>${esc(ref.publisherTelegramId || ref.publisherId || '-')}</strong></div>
                <div class="detail-row"><span class="label">${esc(translateKey('referral_user', 'User:', activeCtx))}</span><strong>${esc(ref.referredUsername || ref.referredTelegramId || ref.userId || '-')}</strong></div>
                <div class="detail-row"><span class="label">${esc(translateKey('referral_channel', 'Channel:', activeCtx))}</span><strong>${esc(chName)}</strong></div>
              </div>
            </div>
          `;
        })
        .join('');
    } catch (err) {
      console.error(err);
    }
  }

  function renderReliabilityPanel(ctx) {
    const activeCtx = buildContext(ctx);
    try {
      const state = getState(activeCtx);

      const healthBox = getEl('system-health-box', activeCtx);
      if (healthBox && state && state.health) {
        const h = state.health;
        healthBox.innerHTML = `
          <div class="detail-row"><span class="label">${esc(translateKey('health_server', 'Server:', activeCtx))}</span><strong>${esc(h.serverStatus || 'OK')}</strong></div>
          <div class="detail-row"><span class="label">${esc(translateKey('health_bot', 'Bot:', activeCtx))}</span><strong>${esc(h.botUsername || '@adTelega_bot')} (${h.botConfigured ? 'OK' : 'Token'})</strong></div>
          <div class="detail-row"><span class="label">${esc(translateKey('health_uptime', 'Uptime:', activeCtx))}</span><strong>${esc(h.uptimeSeconds ?? 0)}s</strong></div>
          <div class="detail-row"><span class="label">${esc(translateKey('health_channels', 'Channels:', activeCtx))}</span><strong>${esc(h.healthyBotChannels ?? 0)} / ${esc(h.totalChannels ?? 0)}</strong></div>
        `;
      }

      const notifList = getEl('notifications-list', activeCtx);
      if (notifList) {
        const notifications = state && Array.isArray(state.notifications) ? state.notifications : [];
        if (!notifications.length) {
          notifList.innerHTML = `<div class="empty-state">${esc(translateKey('no_notifications', translateKey('no_data', 'No data', activeCtx), activeCtx))}</div>`;
        } else {
          notifList.innerHTML = notifications
            .map(
              (n) => `
              <div class="tx-row">
                <div>
                  <strong>${esc(n.title || '')}</strong> ·
                  <span>${esc(n.message || '')}</span>
                </div>
                <span class="badge ${n.isRead ? 'badge-price' : 'badge-draft'}">${n.isRead ? 'Read' : 'New'}</span>
              </div>
            `
            )
            .join('');
        }
      }

      const logsList = getEl('publish-logs-list', activeCtx);
      if (logsList) {
        const publishLogs = state && Array.isArray(state.publishLogs) ? state.publishLogs : [];
        if (!publishLogs.length) {
          logsList.innerHTML = `<div class="empty-state">${esc(translateKey('no_publish_logs', translateKey('no_data', 'No data', activeCtx), activeCtx))}</div>`;
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
                    <strong>${esc(l.campaignTitle || '')}</strong> →
                    <span>${esc(l.channelName || '')}</span>
                    ${detailsHtml}
                  </div>
                  <span class="badge ${badgeClass}">${esc(l.status || '')}</span>
                </div>
              `;
            })
            .join('');
        }
      }

      const backupsList = getEl('backups-list', activeCtx);
      if (backupsList) {
        const backups = state && Array.isArray(state.backups) ? state.backups : [];
        if (!backups.length) {
          backupsList.innerHTML = `<div class="empty-state">${esc(translateKey('no_backups', translateKey('no_data', 'No data', activeCtx), activeCtx))}</div>`;
        } else {
          backupsList.innerHTML = backups
            .map(
              (b) => `
              <div class="tx-row">
                <div>
                  <strong dir="ltr">${esc(b.filename || '')}</strong> ·
                  <span>${esc(b.totalRecords || 0)} records</span>
                </div>
                <span class="badge badge-price">${esc(b.status || '')}</span>
              </div>
            `
            )
            .join('');
        }
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function createManualBackup(ctx) {
    const activeCtx = buildContext(ctx);
    try {
      const json = await callAdminApi(activeCtx, '/api/system/backups', 'POST');
      if (json && (json.success || json.ok !== false)) {
        toast(translateKey('msg_backup_created', 'Backup created', activeCtx), activeCtx);
        await refreshReliabilityState(activeCtx);
      } else if (json && json.message) {
        toast(json.message, activeCtx);
      }
    } catch (err) {
      console.error(err);
      toast(err.message, activeCtx);
    }
  }

  async function markNotificationsRead(ctx) {
    const activeCtx = buildContext(ctx);
    try {
      const json = await callAdminApi(activeCtx, '/api/notifications/read-all', 'POST');
      if (json && (json.success || json.ok !== false)) {
        toast(translateKey('msg_notifications_read', 'Notifications marked read', activeCtx), activeCtx);
        await refreshReliabilityState(activeCtx);
      } else if (json && json.message) {
        toast(json.message, activeCtx);
      }
    } catch (err) {
      console.error(err);
      toast(err.message, activeCtx);
    }
  }

  async function refreshAdminPanel(ctx) {
    const activeCtx = buildContext(ctx);
    const state = activeCtx.state;
    if (!state || !state.adminKey) return;

    try {
      const data = await callAdminApi(activeCtx, '/api/admin/overview', 'GET');
      if (!data) return;

      if (typeof data.maintenanceMode === 'boolean') {
        state.maintenanceMode = data.maintenanceMode;
        syncMaintenanceBanner(data.maintenanceMode, data.maintenanceMessage || '', activeCtx);
      }

      const workspace = getEl('adminWorkspace', activeCtx);
      if (workspace) workspace.classList.remove('hidden');

      const totalUsersEl = getEl('admin-total-users', activeCtx);
      const pendingChEl = getEl('admin-pending-ch', activeCtx);
      const pendingTxEl = getEl('admin-pending-tx', activeCtx);
      if (totalUsersEl && data.stats) totalUsersEl.textContent = data.stats.totalUsers ?? 0;
      if (pendingChEl && data.stats) pendingChEl.textContent = data.stats.pendingChannelsCount ?? 0;
      if (pendingTxEl && data.stats) pendingTxEl.textContent = data.stats.pendingTransactionsCount ?? 0;

      if (Array.isArray(data.pendingChannels)) {
        AdminModule.renderChannels(data.pendingChannels, activeCtx);
      }
      if (Array.isArray(data.pendingCampaigns)) {
        AdminModule.renderCampaigns(data.pendingCampaigns, activeCtx);
      }
      if (Array.isArray(data.pendingTransactions)) {
        AdminModule.renderTransactions(data.pendingTransactions, activeCtx);
      }
      if (Array.isArray(data.securityLogs)) {
        AdminModule.renderLogs(data.securityLogs, activeCtx);
      }

      const liveGrid = getEl('liveDashboardGrid', activeCtx);
      if (liveGrid) {
        const m = data.liveMetrics || {};
        liveGrid.innerHTML = `
          <div class="card" style="background: var(--bg-card-alt);">
            <div class="stat-label">إجمالي السيولة بالمحافظ</div>
            <div class="stat-value">$${Number(m.totalLiquidity || 0).toFixed(2)}</div>
          </div>
          <div class="card" style="background: var(--bg-card-alt);">
            <div class="stat-label">ميزانيات الحملات النشطة</div>
            <div class="stat-value">$${Number(m.lockedCampaignBudget || 0).toFixed(2)}</div>
          </div>
          <div class="card" style="background: var(--bg-card-alt);">
            <div class="stat-label">المشاهدات المعتمدة</div>
            <div class="stat-value">${esc(m.totalValidViews || 0)}</div>
          </div>
          <div class="card" style="background: var(--bg-card-alt);">
            <div class="stat-label">المشاهدات المفلترة (Anti-Bot)</div>
            <div class="stat-value">${esc(m.totalFilteredBotViews || 0)}</div>
          </div>
        `;
      }

      const dailyBox = getEl('dailyReportBox', activeCtx);
      if (dailyBox) {
        const r = data.dailyReport || {};
        dailyBox.innerHTML = `
          <div><strong>التاريخ:</strong> ${esc(r.date || '')}</div>
          <div><strong>إيداعات مقبولة اليوم:</strong> $${Number(r.approvedDepositsToday || 0).toFixed(2)}</div>
          <div><strong>سحوبات مكتملة اليوم (صافي):</strong> $${Number(r.completedWithdrawalsToday || 0).toFixed(2)}</div>
          <div><strong>رسوم السحب المحصلة اليوم:</strong> $${Number(r.withdrawalFeesToday || 0).toFixed(2)}</div>
          <div><strong>صافي أرباح المنصة اليوم:</strong> $${Number(r.netPlatformProfitToday || 0).toFixed(2)}</div>
        `;
      }

      const blBox = getEl('blacklistWordsBox', activeCtx);
      if (blBox) {
        const blList = Array.isArray(data.blacklistWords) ? data.blacklistWords : [];
        blBox.innerHTML = blList.length
          ? blList.map((w) => `<span class="step-pill">${esc(w)}</span>`).join(' ')
          : '<span class="stat-label">القائمة السوداء فارغة.</span>';
      }

      const depBox = getEl('adminDepositsList', activeCtx);
      if (depBox) {
        depBox.innerHTML = (data.deposits || [])
          .map((d) => {
            const safeId = esc(d.id || d._id);
            return `
              <div class="list-row">
                <div>
                  <strong>${esc(d.userId)}</strong> — $${Number(d.amount || 0).toFixed(2)} <span class="badge badge-${esc(d.status)}">${esc(d.status)}</span>
                  <div class="stat-label">TXID: ${esc(d.txid)}</div>
                </div>
                ${
                  d.status === 'pending'
                    ? `<div class="actions-inline">
                         <button type="button" class="btn-success" data-dep-approve="${safeId}">قبول</button>
                         <button type="button" class="btn-danger" data-dep-reject="${safeId}">رفض</button>
                       </div>`
                    : `<span class="stat-label">${esc(d.adminNote || '')}</span>`
                }
              </div>
            `;
          })
          .join('');

        depBox.querySelectorAll('[data-dep-approve]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            try {
              const reason = prompt('أدخل سبب القبول:') || 'تم التحقق من المعاملة';
              await callAdminApi(activeCtx, `/api/admin/deposits/${encodeURIComponent(btn.getAttribute('data-dep-approve'))}/review`, 'POST', {
                decision: 'approve',
                reason
              });
              await Promise.all([
                refreshAdminPanel(activeCtx),
                activeCtx.refreshWallet ? activeCtx.refreshWallet(activeCtx) : Promise.resolve()
              ]);
            } catch (err) {
              showAdminNotice(err.message, true, activeCtx);
            }
          });
        });

        depBox.querySelectorAll('[data-dep-reject]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            try {
              const reason = prompt('أدخل سبب الرفض:') || 'تعذر التحقق من TXID';
              await callAdminApi(activeCtx, `/api/admin/deposits/${encodeURIComponent(btn.getAttribute('data-dep-reject'))}/review`, 'POST', {
                decision: 'reject',
                reason
              });
              await Promise.all([
                refreshAdminPanel(activeCtx),
                activeCtx.refreshWallet ? activeCtx.refreshWallet(activeCtx) : Promise.resolve()
              ]);
            } catch (err) {
              showAdminNotice(err.message, true, activeCtx);
            }
          });
        });
      }

      const wdrBox = getEl('adminWithdrawalsList', activeCtx);
      if (wdrBox) {
        wdrBox.innerHTML = (data.withdrawals || [])
          .map((w) => {
            const safeId = esc(w.id || w._id);
            const isFinal = w.status === 'completed' || w.status === 'rejected';
            return `
              <div class="list-row">
                <div>
                  <strong>${esc(w.userId)}</strong> — $${Number(w.amount || 0).toFixed(2)} (صافي $${Number(w.netAmount || 0).toFixed(2)}) <span class="badge badge-${esc(w.status)}">${esc(w.status)}</span>
                  <div class="stat-label">${esc(w.network || 'USDT - TRC20')} | ${esc(w.destinationAddress)}</div>
                </div>
                ${
                  !isFinal
                    ? `<div class="actions-inline">
                         <button type="button" class="btn-secondary" data-wdr-proc="${safeId}">قيد المعالجة</button>
                         <button type="button" class="btn-success" data-wdr-approve="${safeId}">مكتمل</button>
                         <button type="button" class="btn-danger" data-wdr-reject="${safeId}">رفض</button>
                       </div>`
                    : `<span class="stat-label">${esc(w.adminNote || '')}</span>`
                }
              </div>
            `;
          })
          .join('');

        wdrBox.querySelectorAll('[data-wdr-proc]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            try {
              const reason = prompt('ملاحظة مرحلة المعالجة:') || 'جاري تجهيز الإرسال على شبكة TRC20';
              await callAdminApi(activeCtx, `/api/admin/withdrawals/${encodeURIComponent(btn.getAttribute('data-wdr-proc'))}/review`, 'POST', {
                decision: 'processing',
                reason
              });
              await Promise.all([
                refreshAdminPanel(activeCtx),
                activeCtx.refreshWallet ? activeCtx.refreshWallet(activeCtx) : Promise.resolve()
              ]);
            } catch (err) {
              showAdminNotice(err.message, true, activeCtx);
            }
          });
        });

        wdrBox.querySelectorAll('[data-wdr-approve]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            try {
              const reason = prompt('أدخل سبب الإتمام:') || 'تم إرسال الحوالة بنجاح';
              await callAdminApi(activeCtx, `/api/admin/withdrawals/${encodeURIComponent(btn.getAttribute('data-wdr-approve'))}/review`, 'POST', {
                decision: 'approve',
                reason
              });
              await Promise.all([
                refreshAdminPanel(activeCtx),
                activeCtx.refreshWallet ? activeCtx.refreshWallet(activeCtx) : Promise.resolve()
              ]);
            } catch (err) {
              showAdminNotice(err.message, true, activeCtx);
            }
          });
        });

        wdrBox.querySelectorAll('[data-wdr-reject]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            try {
              const reason = prompt('أدخل سبب الرفض:') || 'مراجعة أمنية';
              await callAdminApi(activeCtx, `/api/admin/withdrawals/${encodeURIComponent(btn.getAttribute('data-wdr-reject'))}/review`, 'POST', {
                decision: 'reject',
                reason
              });
              await Promise.all([
                refreshAdminPanel(activeCtx),
                activeCtx.refreshWallet ? activeCtx.refreshWallet(activeCtx) : Promise.resolve()
              ]);
            } catch (err) {
              showAdminNotice(err.message, true, activeCtx);
            }
          });
        });
      }

      const tktAdminBox = getEl('adminTicketsList', activeCtx);
      if (tktAdminBox) {
        tktAdminBox.innerHTML = (data.tickets || [])
          .map((tk) => {
            const safeId = esc(tk.id || tk._id);
            return `
              <div class="list-row">
                <div>
                  <strong>${esc(tk.subject)}</strong> <span class="stat-label">(${esc(tk.userId)})</span> <span class="badge badge-${esc(tk.status)}">${esc(tk.status)}</span>
                </div>
                <button type="button" class="btn-secondary" data-tkt-reply="${safeId}">رد مباشر</button>
              </div>
            `;
          })
          .join('');

        tktAdminBox.querySelectorAll('[data-tkt-reply]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            try {
              const reply = prompt('اكتب رد الدعم الفني:');
              if (!reply) return;
              await callAdminApi(activeCtx, `/api/admin/tickets/${encodeURIComponent(btn.getAttribute('data-tkt-reply'))}/reply`, 'POST', {
                reply,
                close: false
              });
              await Promise.all([
                refreshAdminPanel(activeCtx),
                activeCtx.refreshTicketsAndBroadcasts ? activeCtx.refreshTicketsAndBroadcasts(activeCtx) : Promise.resolve()
              ]);
            } catch (err) {
              showAdminNotice(err.message, true, activeCtx);
            }
          });
        });
      }

      const auditBox = getEl('adminAuditLogsList', activeCtx);
      if (auditBox) {
        auditBox.innerHTML = (data.auditLogs || [])
          .map((a) => {
            return `
              <div class="list-row">
                <div>
                  <strong>[${esc(a.severity)}] ${esc(a.entityType)}: ${esc(a.entityId)}</strong>
                  <div class="stat-label">${esc(a.reason || '')}</div>
                  <div class="stat-label">${esc(JSON.stringify(a.meta || {}))}</div>
                </div>
                <span class="stat-label">${esc(a.createdAt || '')}</span>
              </div>
            `;
          })
          .join('');
      }

      const logsBox = getEl('adminSecurityLogsList', activeCtx);
      if (logsBox) {
        logsBox.innerHTML = (data.securityLogs || [])
          .map((l) => {
            return `
              <div class="list-row">
                <div>
                  <strong>${esc(l.action)}</strong> <span class="stat-label">(${esc(l.actorId)} / ${esc(l.actorRole)})</span>
                  <div class="stat-label">${esc(JSON.stringify(l.details || {}))}</div>
                </div>
                <span class="stat-label">${esc(l.createdAt || '')}</span>
              </div>
            `;
          })
          .join('');
      }

      return data;
    } catch (err) {
      console.error(err);
      throw err;
    }
  }

  function bindEvents(ctx) {
    const activeCtx = buildContext(ctx);
    const state = activeCtx.state;

    const loadAdminBtn = getEl('loadAdminBtn', activeCtx);
    if (loadAdminBtn) {
      loadAdminBtn.addEventListener('click', async () => {
        clearAdminNotice(activeCtx);
        const keyInput = getEl('adminKeyInput', activeCtx);
        if (state && keyInput) {
          state.adminKey = keyInput.value.trim();
          try {
            sessionStorage.setItem('telega_admin_key', state.adminKey);
          } catch (err) {
            console.error(err);
          }
        }
        try {
          await refreshAdminPanel(activeCtx);
          showAdminNotice('تم تحميل لوحة الإدارة بنجاح.', false, activeCtx);
        } catch (err) {
          getEl('adminWorkspace', activeCtx)?.classList.add('hidden');
          showAdminNotice(err.message, true, activeCtx);
        }
      });
    }

    const toggleMaintBtn = getEl('toggleMaintenanceBtn', activeCtx);
    if (toggleMaintBtn) {
      toggleMaintBtn.addEventListener('click', async () => {
        clearAdminNotice(activeCtx);
        try {
          const nextState = !(state && state.maintenanceMode);
          const msg = getEl('maintenanceMessageInput', activeCtx)?.value.trim() || '';
          await callAdminApi(activeCtx, '/api/admin/maintenance', 'POST', {
            enabled: nextState,
            message: msg || undefined
          });
          await refreshAdminPanel(activeCtx);
        } catch (err) {
          showAdminNotice(err.message, true, activeCtx);
        }
      });
    }

    const banForm = getEl('adminBanForm', activeCtx);
    if (banForm) {
      banForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearAdminNotice(activeCtx);
        try {
          const entityType = getEl('adminBanTypeSelect', activeCtx)?.value || 'user';
          const entityId = getEl('adminBanIdInput', activeCtx)?.value.trim() || '';
          const reason = getEl('adminBanReasonInput', activeCtx)?.value.trim() || '';
          const unban = Boolean(getEl('adminBanUnbanCheckbox', activeCtx)?.checked);

          await callAdminApi(activeCtx, '/api/admin/ban', 'POST', { entityType, entityId, reason, unban });
          if (getEl('adminBanIdInput', activeCtx)) getEl('adminBanIdInput', activeCtx).value = '';
          if (getEl('adminBanReasonInput', activeCtx)) getEl('adminBanReasonInput', activeCtx).value = '';
          if (getEl('adminBanUnbanCheckbox', activeCtx)) getEl('adminBanUnbanCheckbox', activeCtx).checked = false;
          showAdminNotice('تم تحديث حالة الحظر وتوثيقها بنجاح.', false, activeCtx);
          await refreshAdminPanel(activeCtx);
        } catch (err) {
          showAdminNotice(err.message, true, activeCtx);
        }
      });
    }

    const blacklistForm = getEl('adminBlacklistForm', activeCtx);
    if (blacklistForm) {
      blacklistForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearAdminNotice(activeCtx);
        try {
          const word = getEl('adminBlacklistWordInput', activeCtx)?.value.trim() || '';
          const remove = Boolean(getEl('adminBlacklistRemoveCheckbox', activeCtx)?.checked);
          await callAdminApi(activeCtx, '/api/admin/blacklist', 'POST', { word, remove });
          if (getEl('adminBlacklistWordInput', activeCtx)) getEl('adminBlacklistWordInput', activeCtx).value = '';
          if (getEl('adminBlacklistRemoveCheckbox', activeCtx)) getEl('adminBlacklistRemoveCheckbox', activeCtx).checked = false;
          showAdminNotice('تم تحديث القائمة السوداء للكلمات بنجاح.', false, activeCtx);
          await refreshAdminPanel(activeCtx);
        } catch (err) {
          showAdminNotice(err.message, true, activeCtx);
        }
      });
    }

    const emergencyStopForm = getEl('adminEmergencyStopForm', activeCtx);
    if (emergencyStopForm) {
      emergencyStopForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearAdminNotice(activeCtx);
        try {
          const campaignId = getEl('adminEmergencyCampaignIdInput', activeCtx)?.value.trim() || '';
          const reason = getEl('adminEmergencyReasonInput', activeCtx)?.value.trim() || '';
          await callAdminApi(
            activeCtx,
            `/api/admin/campaigns/${encodeURIComponent(campaignId)}/emergency-stop`,
            'POST',
            { reason }
          );
          if (getEl('adminEmergencyCampaignIdInput', activeCtx)) getEl('adminEmergencyCampaignIdInput', activeCtx).value = '';
          if (getEl('adminEmergencyReasonInput', activeCtx)) getEl('adminEmergencyReasonInput', activeCtx).value = '';
          showAdminNotice('تم تنفيذ الإيقاف الطارئ الفوري للحملة من جميع القنوات.', false, activeCtx);
          await Promise.all([
            refreshAdminPanel(activeCtx),
            activeCtx.refreshCampaigns ? activeCtx.refreshCampaigns(activeCtx) : Promise.resolve(),
            activeCtx.refreshWallet ? activeCtx.refreshWallet(activeCtx) : Promise.resolve()
          ]);
        } catch (err) {
          showAdminNotice(err.message, true, activeCtx);
        }
      });
    }

    const adjustForm = getEl('adminAdjustForm', activeCtx);
    if (adjustForm) {
      adjustForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearAdminNotice(activeCtx);
        try {
          const targetUserId = getEl('adminTargetUserInput', activeCtx)?.value.trim() || '';
          const mode = getEl('adminAdjustModeSelect', activeCtx)?.value || 'add';
          const balanceBucket = getEl('adminBucketSelect', activeCtx)?.value || 'walletBalance';
          const amount = Number(getEl('adminAmountInput', activeCtx)?.value || 0);
          const reason = getEl('adminReasonInput', activeCtx)?.value.trim() || '';

          await callAdminApi(activeCtx, '/api/admin/wallet/adjust', 'POST', {
            targetUserId,
            mode,
            balanceBucket,
            amount,
            reason
          });
          if (getEl('adminReasonInput', activeCtx)) getEl('adminReasonInput', activeCtx).value = '';
          showAdminNotice('تم تنفيذ التعديل المالي اليدوي وتوثيقه في سجل الأمان.', false, activeCtx);
          await Promise.all([
            refreshAdminPanel(activeCtx),
            activeCtx.refreshWallet ? activeCtx.refreshWallet(activeCtx) : Promise.resolve()
          ]);
        } catch (err) {
          showAdminNotice(err.message, true, activeCtx);
        }
      });
    }

    const broadcastForm = getEl('adminBroadcastForm', activeCtx);
    if (broadcastForm) {
      broadcastForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearAdminNotice(activeCtx);
        try {
          const title = getEl('adminBroadcastTitleInput', activeCtx)?.value.trim() || '';
          const body = getEl('adminBroadcastBodyInput', activeCtx)?.value.trim() || '';
          await callAdminApi(activeCtx, '/api/admin/broadcasts', 'POST', { title, body });
          if (getEl('adminBroadcastTitleInput', activeCtx)) getEl('adminBroadcastTitleInput', activeCtx).value = '';
          if (getEl('adminBroadcastBodyInput', activeCtx)) getEl('adminBroadcastBodyInput', activeCtx).value = '';
          showAdminNotice('تم إرسال الرسالة الجماعية وتحديث التنبيهات الفورية.', false, activeCtx);
          await Promise.all([
            refreshAdminPanel(activeCtx),
            activeCtx.refreshTicketsAndBroadcasts ? activeCtx.refreshTicketsAndBroadcasts(activeCtx) : Promise.resolve()
          ]);
        } catch (err) {
          showAdminNotice(err.message, true, activeCtx);
        }
      });
    }
  }

  const AdminModule = {
    enableAdminAccess(ctx) {
      const activeCtx = buildContext(ctx);
      const adminNavBtn = getEl('nav-admin-btn', activeCtx);
      if (adminNavBtn) {
        adminNavBtn.style.display = 'flex';
      }
    },

    async loadDashboard(ctx) {
      try {
        const activeCtx = buildContext(ctx);
        if (activeCtx.state?.adminKey) {
          await refreshAdminPanel(activeCtx);
        }
      } catch (err) {
        console.error(err);
        toast(err.message, ctx);
      }
    },

    renderChannels(channels, ctx) {
      const activeCtx = buildContext(ctx);
      const listEl = getEl('admin-channels-list', activeCtx);
      if (!listEl) return;

      try {
        if (!channels || channels.length === 0) {
          listEl.innerHTML = `<div class="empty-state">${esc(translateKey('no_data', 'No data', activeCtx))}</div>`;
          return;
        }

        listEl.innerHTML = channels
          .map((ch) => {
            const safeId = esc(ch._id || ch.id);
            const cleanUser = esc(String(ch.channelUsername || ch.username || '').replace(/^@/, ''));
            return `
              <div class="list-item">
                <div class="item-main">
                  <span class="item-title">@${cleanUser} ($${esc(ch.pricePerPost ?? ch.price ?? 0)})</span>
                  <span class="item-sub">Owner: ${esc(ch.ownerId || ch.ownerTelegramId || '')} • ${esc(ch.subscribers ?? ch.subscribersCount ?? 0)} subs</span>
                </div>
                <div class="admin-actions">
                  <button type="button" class="tg-btn sm success" data-adm-ch-id="${safeId}" data-adm-ch-action="approved">${esc(translateKey('approve', 'Approve', activeCtx))}</button>
                  <button type="button" class="tg-btn sm danger" data-adm-ch-id="${safeId}" data-adm-ch-action="rejected">${esc(translateKey('reject', 'Reject', activeCtx))}</button>
                </div>
              </div>
            `;
          })
          .join('');

        listEl.querySelectorAll('[data-adm-ch-id]').forEach((btn) => {
          btn.addEventListener('click', () => {
            AdminModule.handleChannel(btn.getAttribute('data-adm-ch-id'), btn.getAttribute('data-adm-ch-action'), activeCtx);
          });
        });
      } catch (err) {
        console.error(err);
      }
    },

    renderCampaigns(campaigns, ctx) {
      const activeCtx = buildContext(ctx);
      const listEl = getEl('admin-campaigns-list', activeCtx);
      if (!listEl) return;

      try {
        if (!campaigns || campaigns.length === 0) {
          listEl.innerHTML = `<div class="empty-state">${esc(translateKey('no_data', 'No data', activeCtx))}</div>`;
          return;
        }

        listEl.innerHTML = campaigns
          .map((camp) => {
            const safeId = esc(camp._id || camp.id);
            const chUsername = camp.channelId?.channelUsername ? `@${esc(camp.channelId.channelUsername)}` : 'N/A';
            return `
              <div class="list-item">
                <div class="item-main">
                  <span class="item-title">${esc(camp.title)} ($${esc(camp.budget ?? 0)})</span>
                  <span class="item-sub">${chUsername} • ${esc(camp.targetUrl || '')}</span>
                </div>
                <div class="admin-actions">
                  <button type="button" class="tg-btn sm success" data-adm-camp-id="${safeId}">${esc(translateKey('complete', 'Complete', activeCtx))}</button>
                </div>
              </div>
            `;
          })
          .join('');

        listEl.querySelectorAll('[data-adm-camp-id]').forEach((btn) => {
          btn.addEventListener('click', () => {
            AdminModule.handleCampaign(btn.getAttribute('data-adm-camp-id'), activeCtx);
          });
        });
      } catch (err) {
        console.error(err);
      }
    },

    renderTransactions(txs, ctx) {
      const activeCtx = buildContext(ctx);
      const listEl = getEl('admin-tx-list', activeCtx);
      if (!listEl) return;

      try {
        if (!txs || txs.length === 0) {
          listEl.innerHTML = `<div class="empty-state">${esc(translateKey('no_data', 'No data', activeCtx))}</div>`;
          return;
        }

        listEl.innerHTML = txs
          .map((tx) => {
            const safeId = esc(tx._id || tx.id);
            const txType = tx.type ? esc(String(tx.type).toUpperCase()) : '';
            return `
              <div class="list-item">
                <div class="item-main">
                  <span class="item-title">${txType} ($${esc(Math.abs(Number(tx.amount || 0)))})</span>
                  <span class="item-sub">User: ${esc(tx.userId)} • ${esc(tx.details || tx.note || '')}</span>
                </div>
                <div class="admin-actions">
                  <button type="button" class="tg-btn sm success" data-adm-tx-id="${safeId}" data-adm-tx-action="completed">${esc(translateKey('approve', 'Approve', activeCtx))}</button>
                  <button type="button" class="tg-btn sm danger" data-adm-tx-id="${safeId}" data-adm-tx-action="rejected">${esc(translateKey('reject', 'Reject', activeCtx))}</button>
                </div>
              </div>
            `;
          })
          .join('');

        listEl.querySelectorAll('[data-adm-tx-id]').forEach((btn) => {
          btn.addEventListener('click', () => {
            AdminModule.handleTx(btn.getAttribute('data-adm-tx-id'), btn.getAttribute('data-adm-tx-action'), activeCtx);
          });
        });
      } catch (err) {
        console.error(err);
      }
    },

    renderLogs(logs, ctx) {
      const activeCtx = buildContext(ctx);
      const listEl = getEl('admin-logs-list', activeCtx);
      if (!listEl) return;

      try {
        if (!logs || logs.length === 0) {
          listEl.innerHTML = `<div class="empty-state">${esc(translateKey('no_data', 'No data', activeCtx))}</div>`;
          return;
        }

        listEl.innerHTML = logs
          .map(
            (log) => `
            <div class="list-item">
              <div class="item-main">
                <span class="item-title">${esc(log.action || '')}</span>
                <span class="item-sub">Actor: ${esc(log.actorId || '')} | ${esc(log.details || '')}</span>
              </div>
            </div>
          `
          )
          .join('');
      } catch (err) {
        console.error(err);
      }
    },

    async handleChannel(id, action, ctx) {
      const activeCtx = buildContext(ctx);
      try {
        await callAdminApi(activeCtx, `/api/admin/channels/${encodeURIComponent(id)}/review`, 'POST', { action });
        await Promise.all([
          refreshAdminPanel(activeCtx),
          activeCtx.refreshChannels ? activeCtx.refreshChannels(activeCtx) : Promise.resolve()
        ]);
      } catch (err) {
        console.error(err);
        toast(err.message, activeCtx);
      }
    },

    async handleCampaign(id, ctx) {
      const activeCtx = buildContext(ctx);
      try {
        await callAdminApi(activeCtx, `/api/admin/campaigns/${encodeURIComponent(id)}/complete`, 'POST');
        await Promise.all([
          refreshAdminPanel(activeCtx),
          activeCtx.refreshCampaigns ? activeCtx.refreshCampaigns(activeCtx) : Promise.resolve(),
          activeCtx.refreshWallet ? activeCtx.refreshWallet(activeCtx) : Promise.resolve()
        ]);
      } catch (err) {
        console.error(err);
        toast(err.message, activeCtx);
      }
    },

    async handleTx(id, action, ctx) {
      const activeCtx = buildContext(ctx);
      try {
        await callAdminApi(activeCtx, `/api/admin/transactions/${encodeURIComponent(id)}/review`, 'POST', { action });
        await Promise.all([
          refreshAdminPanel(activeCtx),
          activeCtx.refreshWallet ? activeCtx.refreshWallet(activeCtx) : Promise.resolve()
        ]);
      } catch (err) {
        console.error(err);
        toast(err.message, activeCtx);
      }
    },

    reviewChannelDecision,
    renderAdminQueue,
    renderReferrals,
    refreshReferrals,
    renderReliabilityPanel,
    refreshReliabilityState,
    createManualBackup,
    markNotificationsRead,
    refreshAdminPanel,
    bindEvents,
    bindAdminEvents: bindEvents
  };

  window.AdminModule = AdminModule;
  window.refreshAdminPanel = (ctx) => refreshAdminPanel(ctx);
  window.bindAdminEvents = (ctx) => bindEvents(ctx);
})();
