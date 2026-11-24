// ==================== ADMIN QUEUE, REFERRALS & SYSTEM RELIABILITY ====================
(function () {
  function t(key, fallback = '') {
    if (!key) return fallback;
    try {
      if (window.TelegaI18n && typeof window.TelegaI18n.t === 'function') {
        const val = window.TelegaI18n.t(key);
        if (val !== undefined && val !== null) return val;
      }
      if (window.I18n && typeof window.I18n.t === 'function') {
        const val = window.I18n.t(key);
        if (val !== undefined && val !== null) return val;
      }
      if (window.I18N && typeof window.I18N.t === 'function') {
        const val = window.I18N.t(key);
        if (val !== undefined && val !== null) return val;
      }
    } catch (err) {
      console.error(err);
    }
    return fallback || key;
  }

  function toast(message) {
    if (!message) return;
    try {
      if (typeof window.showToast === 'function') {
        window.showToast(message);
      } else if (window.UI && typeof window.UI.showToast === 'function') {
        window.UI.showToast(message);
      } else if (window.UI && typeof window.UI.notify === 'function') {
        window.UI.notify(message);
      }
    } catch (err) {
      console.error(err);
    }
  }

  function esc(str) {
    if (typeof window.escapeHTML === 'function') return window.escapeHTML(str);
    if (window.UI && typeof window.UI.escapeHTML === 'function') return window.UI.escapeHTML(str);
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getEl(id) {
    return document.getElementById(id);
  }

  function showAdminNotice(message, isError = false) {
    if (!message) return;
    try {
      if (window.UI && typeof window.UI.showNotice === 'function') {
        window.UI.showNotice('adminNotice', message, isError);
      } else if (typeof window.showNotice === 'function') {
        window.showNotice('adminNotice', message, isError);
      }
    } catch (err) {
      console.error(err);
    }
    toast(message);
  }

  function clearAdminNotice() {
    try {
      if (window.UI && typeof window.UI.clearNotice === 'function') {
        window.UI.clearNotice('adminNotice');
      } else if (typeof window.clearNotice === 'function') {
        window.clearNotice('adminNotice');
      }
    } catch (err) {
      console.error(err);
    }
  }

  function syncMaintenanceBanner(enabled, message) {
    try {
      if (window.UI && typeof window.UI.renderMaintenanceBanner === 'function') {
        window.UI.renderMaintenanceBanner({ maintenanceMode: Boolean(enabled), maintenanceMessage: message });
      } else if (typeof window.renderMaintenanceBanner === 'function') {
        window.renderMaintenanceBanner({ maintenanceMode: Boolean(enabled), maintenanceMessage: message });
      }
    } catch (err) {
      console.error(err);
    }
  }

  function getState() {
    if (window.AppState) return window.AppState;
    if (typeof AppState !== 'undefined') return AppState;
    return null;
  }

  function buildContext(ctx) {
    if (ctx && ctx.state) return ctx;
    if (window.App && typeof window.App.getContext === 'function') {
      return window.App.getContext();
    }
    const state = getState();
    return {
      state,
      el: getEl,
      apiRequest: async (url, options = {}) => sendRequest(url, options.method || 'GET', options.body ? JSON.parse(options.body) : undefined, options.headers),
      showNotice: (_targetOrMsg, msgOrErr, maybeErr) => {
        if (typeof maybeErr === 'boolean') {
          showAdminNotice(msgOrErr, maybeErr);
        } else {
          showAdminNotice(_targetOrMsg, Boolean(msgOrErr));
        }
      },
      clearNotice: () => clearAdminNotice(),
      refreshWallet: async () => {
        if (window.WalletModule && typeof window.WalletModule.refresh === 'function') {
          await window.WalletModule.refresh();
        } else if (typeof window.fetchWallet === 'function') {
          await window.fetchWallet();
        }
      },
      refreshCampaigns: async () => {
        if (window.CampaignsModule && typeof window.CampaignsModule.load === 'function') {
          await window.CampaignsModule.load();
        } else if (typeof window.fetchCampaigns === 'function') {
          await window.fetchCampaigns();
        }
      },
      refreshTicketsAndBroadcasts: async () => {
        if (window.App && typeof window.App.getContext === 'function') {
          await window.App.getContext().refreshTicketsAndBroadcasts();
        }
      }
    };
  }

  async function sendRequest(url, method, body, extraHeaders = {}) {
    try {
      const state = getState();
      const adminKey = extraHeaders['x-admin-key'] || state?.adminKey || '';
      const userId = extraHeaders['x-user-id'] || state?.userId || '';

      if (typeof window.apiSend === 'function' && !adminKey) {
        return await window.apiSend(url, method, body);
      }
      if (window.Api && typeof window.Api.send === 'function' && !adminKey) {
        return await window.Api.send(url, method, body);
      }

      const headers = Object.assign(
        {},
        window.Api?.getInitData ? { 'x-telegram-init-data': window.Api.getInitData() } : {},
        userId ? { 'x-user-id': userId } : {},
        adminKey ? { 'x-admin-key': adminKey } : {},
        extraHeaders
      );

      const options = {
        method,
        headers
      };

      if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
        options.body = typeof body === 'string' ? body : JSON.stringify(body);
      }

      const res = await fetch(url, options);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false || data.success === false) {
        const err = new Error(data.error || data.message || 'Request failed');
        err.status = res.status;
        err.data = data;
        throw err;
      }
      return data;
    } catch (err) {
      console.error(err);
      throw err;
    }
  }

  async function callAdminApi(ctx, url, method = 'POST', body = undefined) {
    const activeCtx = buildContext(ctx);
    const adminKey = activeCtx.state?.adminKey || '';
    if (typeof activeCtx.apiRequest === 'function') {
      const opts = {
        method,
        headers: Object.assign({}, adminKey ? { 'x-admin-key': adminKey } : {})
      };
      if (body !== undefined) {
        opts.headers['Content-Type'] = 'application/json';
        opts.body = typeof body === 'string' ? body : JSON.stringify(body);
      }
      return await activeCtx.apiRequest(url, opts, activeCtx);
    }
    return await sendRequest(url, method, body, adminKey ? { 'x-admin-key': adminKey } : {});
  }

  async function refreshChannelsData() {
    try {
      if (typeof window.fetchChannels === 'function') {
        await window.fetchChannels();
      } else if (window.Api && typeof window.Api.fetchChannels === 'function') {
        await window.Api.fetchChannels();
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function refreshReliabilityState() {
    try {
      if (typeof window.fetchReliabilityData === 'function') {
        await window.fetchReliabilityData();
      } else if (window.Api && typeof window.Api.fetchReliabilityData === 'function') {
        await window.Api.fetchReliabilityData();
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function reviewChannelDecision(id, decision) {
    try {
      const json = await sendRequest(`/api/channels/${encodeURIComponent(id)}/review`, 'POST', { decision });
      if (json && json.success) {
        toast(t('msg_review_updated'));
        await refreshChannelsData();
      } else if (json && json.message) {
        toast(json.message);
      }
    } catch (err) {
      console.error(err);
      toast(err.message);
    }
  }

  function renderAdminQueue() {
    const container = getEl('admin-queue-container');
    if (!container) return;

    try {
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
    } catch (err) {
      console.error(err);
    }
  }

  function renderReferrals() {
    const container = getEl('referrals-container');
    if (!container) return;

    try {
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
    } catch (err) {
      console.error(err);
    }
  }

  function renderReliabilityPanel() {
    try {
      const state = getState();

      const healthBox = getEl('system-health-box');
      if (healthBox && state && state.health) {
        const h = state.health;
        healthBox.innerHTML = `
          <div class="detail-row"><span class="label">${esc(t('health_server'))}</span><strong>${esc(h.serverStatus)}</strong></div>
          <div class="detail-row"><span class="label">${esc(t('health_bot'))}</span><strong>${esc(h.botUsername)} (${h.botConfigured ? 'OK' : 'Token'})</strong></div>
          <div class="detail-row"><span class="label">${esc(t('health_uptime'))}</span><strong>${esc(h.uptimeSeconds)}s</strong></div>
          <div class="detail-row"><span class="label">${esc(t('health_channels'))}</span><strong>${esc(h.healthyBotChannels)} / ${esc(h.totalChannels)}</strong></div>
        `;
      }

      const notifList = getEl('notifications-list');
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

      const logsList = getEl('publish-logs-list');
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

      const backupsList = getEl('backups-list');
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
    } catch (err) {
      console.error(err);
    }
  }

  async function createManualBackup() {
    try {
      const json = await sendRequest('/api/system/backups', 'POST');
      if (json && json.success) {
        toast(t('msg_backup_created'));
        await refreshReliabilityState();
      } else if (json && json.message) {
        toast(json.message);
      }
    } catch (err) {
      console.error(err);
      toast(err.message);
    }
  }

  async function markNotificationsRead() {
    try {
      const json = await sendRequest('/api/notifications/read-all', 'POST');
      if (json && json.success) {
        toast(t('msg_notifications_read'));
        await refreshReliabilityState();
      } else if (json && json.message) {
        toast(json.message);
      }
    } catch (err) {
      console.error(err);
      toast(err.message);
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
        syncMaintenanceBanner(data.maintenanceMode, data.maintenanceMessage || '');
      }

      const workspace = getEl('adminWorkspace');
      if (workspace) workspace.classList.remove('hidden');

      const liveGrid = getEl('liveDashboardGrid');
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

      const dailyBox = getEl('dailyReportBox');
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

      const blBox = getEl('blacklistWordsBox');
      if (blBox) {
        const blList = Array.isArray(data.blacklistWords) ? data.blacklistWords : [];
        blBox.innerHTML = blList.length
          ? blList.map((w) => `<span class="step-pill">${esc(w)}</span>`).join(' ')
          : '<span class="stat-label">القائمة السوداء فارغة.</span>';
      }

      const depBox = getEl('adminDepositsList');
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
              showAdminNotice(err.message, true);
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
              showAdminNotice(err.message, true);
            }
          });
        });
      }

      const wdrBox = getEl('adminWithdrawalsList');
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
              showAdminNotice(err.message, true);
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
              showAdminNotice(err.message, true);
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
              showAdminNotice(err.message, true);
            }
          });
        });
      }

      const tktAdminBox = getEl('adminTicketsList');
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
              showAdminNotice(err.message, true);
            }
          });
        });
      }

      const auditBox = getEl('adminAuditLogsList');
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

      const logsBox = getEl('adminSecurityLogsList');
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
    } catch (err) {
      console.error(err);
      throw err;
    }
  }

  function bindEvents(ctx) {
    const activeCtx = buildContext(ctx);
    const state = activeCtx.state;

    const loadAdminBtn = getEl('loadAdminBtn');
    if (loadAdminBtn) {
      loadAdminBtn.addEventListener('click', async () => {
        clearAdminNotice();
        const keyInput = getEl('adminKeyInput');
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
          showAdminNotice('تم تحميل لوحة الإدارة بنجاح.', false);
        } catch (err) {
          getEl('adminWorkspace')?.classList.add('hidden');
          showAdminNotice(err.message, true);
        }
      });
    }

    const toggleMaintBtn = getEl('toggleMaintenanceBtn');
    if (toggleMaintBtn) {
      toggleMaintBtn.addEventListener('click', async () => {
        clearAdminNotice();
        try {
          const nextState = !(state && state.maintenanceMode);
          const msg = getEl('maintenanceMessageInput')?.value.trim() || '';
          await callAdminApi(activeCtx, '/api/admin/maintenance', 'POST', {
            enabled: nextState,
            message: msg || undefined
          });
          await refreshAdminPanel(activeCtx);
        } catch (err) {
          showAdminNotice(err.message, true);
        }
      });
    }

    const banForm = getEl('adminBanForm');
    if (banForm) {
      banForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearAdminNotice();
        try {
          const entityType = getEl('adminBanTypeSelect')?.value || 'user';
          const entityId = getEl('adminBanIdInput')?.value.trim() || '';
          const reason = getEl('adminBanReasonInput')?.value.trim() || '';
          const unban = Boolean(getEl('adminBanUnbanCheckbox')?.checked);

          await callAdminApi(activeCtx, '/api/admin/ban', 'POST', { entityType, entityId, reason, unban });
          if (getEl('adminBanIdInput')) getEl('adminBanIdInput').value = '';
          if (getEl('adminBanReasonInput')) getEl('adminBanReasonInput').value = '';
          if (getEl('adminBanUnbanCheckbox')) getEl('adminBanUnbanCheckbox').checked = false;
          showAdminNotice('تم تحديث حالة الحظر وتوثيقها بنجاح.', false);
          await refreshAdminPanel(activeCtx);
        } catch (err) {
          showAdminNotice(err.message, true);
        }
      });
    }

    const blacklistForm = getEl('adminBlacklistForm');
    if (blacklistForm) {
      blacklistForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearAdminNotice();
        try {
          const word = getEl('adminBlacklistWordInput')?.value.trim() || '';
          const remove = Boolean(getEl('adminBlacklistRemoveCheckbox')?.checked);
          await callAdminApi(activeCtx, '/api/admin/blacklist', 'POST', { word, remove });
          if (getEl('adminBlacklistWordInput')) getEl('adminBlacklistWordInput').value = '';
          if (getEl('adminBlacklistRemoveCheckbox')) getEl('adminBlacklistRemoveCheckbox').checked = false;
          showAdminNotice('تم تحديث القائمة السوداء للكلمات بنجاح.', false);
          await refreshAdminPanel(activeCtx);
        } catch (err) {
          showAdminNotice(err.message, true);
        }
      });
    }

    const emergencyStopForm = getEl('adminEmergencyStopForm');
    if (emergencyStopForm) {
      emergencyStopForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearAdminNotice();
        try {
          const campaignId = getEl('adminEmergencyCampaignIdInput')?.value.trim() || '';
          const reason = getEl('adminEmergencyReasonInput')?.value.trim() || '';
          await callAdminApi(
            activeCtx,
            `/api/admin/campaigns/${encodeURIComponent(campaignId)}/emergency-stop`,
            'POST',
            { reason }
          );
          if (getEl('adminEmergencyCampaignIdInput')) getEl('adminEmergencyCampaignIdInput').value = '';
          if (getEl('adminEmergencyReasonInput')) getEl('adminEmergencyReasonInput').value = '';
          showAdminNotice('تم تنفيذ الإيقاف الطارئ الفوري للحملة من جميع القنوات.', false);
          await Promise.all([
            refreshAdminPanel(activeCtx),
            activeCtx.refreshCampaigns ? activeCtx.refreshCampaigns(activeCtx) : Promise.resolve(),
            activeCtx.refreshWallet ? activeCtx.refreshWallet(activeCtx) : Promise.resolve()
          ]);
        } catch (err) {
          showAdminNotice(err.message, true);
        }
      });
    }

    const adjustForm = getEl('adminAdjustForm');
    if (adjustForm) {
      adjustForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearAdminNotice();
        try {
          const targetUserId = getEl('adminTargetUserInput')?.value.trim() || '';
          const mode = getEl('adminAdjustModeSelect')?.value || 'add';
          const balanceBucket = getEl('adminBucketSelect')?.value || 'walletBalance';
          const amount = Number(getEl('adminAmountInput')?.value || 0);
          const reason = getEl('adminReasonInput')?.value.trim() || '';

          await callAdminApi(activeCtx, '/api/admin/wallet/adjust', 'POST', {
            targetUserId,
            mode,
            balanceBucket,
            amount,
            reason
          });
          if (getEl('adminReasonInput')) getEl('adminReasonInput').value = '';
          showAdminNotice('تم تنفيذ التعديل المالي اليدوي وتوثيقه في سجل الأمان.', false);
          await Promise.all([
            refreshAdminPanel(activeCtx),
            activeCtx.refreshWallet ? activeCtx.refreshWallet(activeCtx) : Promise.resolve()
          ]);
        } catch (err) {
          showAdminNotice(err.message, true);
        }
      });
    }

    const broadcastForm = getEl('adminBroadcastForm');
    if (broadcastForm) {
      broadcastForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearAdminNotice();
        try {
          const title = getEl('adminBroadcastTitleInput')?.value.trim() || '';
          const body = getEl('adminBroadcastBodyInput')?.value.trim() || '';
          await callAdminApi(activeCtx, '/api/admin/broadcasts', 'POST', { title, body });
          if (getEl('adminBroadcastTitleInput')) getEl('adminBroadcastTitleInput').value = '';
          if (getEl('adminBroadcastBodyInput')) getEl('adminBroadcastBodyInput').value = '';
          showAdminNotice('تم إرسال الرسالة الجماعية وتحديث التنبيهات الفورية.', false);
          await Promise.all([
            refreshAdminPanel(activeCtx),
            activeCtx.refreshTicketsAndBroadcasts ? activeCtx.refreshTicketsAndBroadcasts(activeCtx) : Promise.resolve()
          ]);
        } catch (err) {
          showAdminNotice(err.message, true);
        }
      });
    }
  }

  const AdminModule = {
    enableAdminAccess() {
      const adminNavBtn = getEl('nav-admin-btn');
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

        if (!window.Api || typeof window.Api.getAdminDashboard !== 'function') return;
        const data = await window.Api.getAdminDashboard();
        if (!data) return;

        const totalUsersEl = getEl('admin-total-users');
        const pendingChEl = getEl('admin-pending-ch');
        const pendingTxEl = getEl('admin-pending-tx');

        if (totalUsersEl && data.stats) totalUsersEl.textContent = data.stats.totalUsers ?? 0;
        if (pendingChEl && data.stats) pendingChEl.textContent = data.stats.pendingChannelsCount ?? 0;
        if (pendingTxEl && data.stats) pendingTxEl.textContent = data.stats.pendingTransactionsCount ?? 0;

        this.renderChannels(data.pendingChannels);
        this.renderCampaigns(data.pendingCampaigns);
        this.renderTransactions(data.pendingTransactions);
        this.renderLogs(data.securityLogs);
      } catch (err) {
        console.error(err);
        if (window.UI && typeof window.UI.notify === 'function') {
          window.UI.notify(err.message);
        } else {
          toast(err.message);
        }
      }
    },

    renderChannels(channels) {
      const listEl = getEl('admin-channels-list');
      if (!listEl) return;

      try {
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
      } catch (err) {
        console.error(err);
      }
    },

    renderCampaigns(campaigns) {
      const listEl = getEl('admin-campaigns-list');
      if (!listEl) return;

      try {
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
      } catch (err) {
        console.error(err);
      }
    },

    renderTransactions(txs) {
      const listEl = getEl('admin-tx-list');
      if (!listEl) return;

      try {
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
      } catch (err) {
        console.error(err);
      }
    },

    renderLogs(logs) {
      const listEl = getEl('admin-logs-list');
      if (!listEl) return;

      try {
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
      } catch (err) {
        console.error(err);
      }
    },

    async handleChannel(id, action) {
      try {
        if (!window.Api || typeof window.Api.reviewChannel !== 'function') return;
        await window.Api.reviewChannel(id, action);
        await this.loadDashboard();
      } catch (err) {
        console.error(err);
        toast(err.message);
      }
    },

    async handleCampaign(id) {
      try {
        if (!window.Api || typeof window.Api.completeCampaign !== 'function') return;
        await window.Api.completeCampaign(id);
        await this.loadDashboard();
      } catch (err) {
        console.error(err);
        toast(err.message);
      }
    },

    async handleTx(id, action) {
      try {
        if (!window.Api || typeof window.Api.reviewTransaction !== 'function') return;
        await window.Api.reviewTransaction(id, action);
        await this.loadDashboard();
      } catch (err) {
        console.error(err);
        toast(err.message);
      }
    },

    reviewChannelDecision,
    renderAdminQueue,
    renderReferrals,
    renderReliabilityPanel,
    createManualBackup,
    markNotificationsRead,
    refreshAdminPanel,
    bindEvents,
    bindAdminEvents: bindEvents
  };

  window.AdminModule = AdminModule;

  // Global helper functions for inline handlers and cross-module compatibility
  window.reviewChannelDecision = reviewChannelDecision;
  window.renderAdminQueue = renderAdminQueue;
  window.renderReferrals = renderReferrals;
  window.renderReliabilityPanel = renderReliabilityPanel;
  window.createManualBackup = createManualBackup;
  window.markNotificationsRead = markNotificationsRead;
  window.refreshAdminPanel = refreshAdminPanel;
  window.bindAdminEvents = bindEvents;
})();
