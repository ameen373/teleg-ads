// ==================== CHANNELS MANAGEMENT ====================
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

  function showChannelNotice(message, isError = false) {
    if (!message) return;
    try {
      if (window.UI && typeof window.UI.showNotice === 'function') {
        window.UI.showNotice('channelNotice', message, isError);
      } else if (typeof window.showNotice === 'function') {
        window.showNotice('channelNotice', message, isError);
      }
    } catch (err) {
      console.error(err);
    }
    toast(message);
  }

  function clearChannelNotice() {
    try {
      if (window.UI && typeof window.UI.clearNotice === 'function') {
        window.UI.clearNotice('channelNotice');
      } else if (typeof window.clearNotice === 'function') {
        window.clearNotice('channelNotice');
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
          showChannelNotice(msgOrErr, maybeErr);
        } else {
          showChannelNotice(_targetOrMsg, Boolean(msgOrErr));
        }
      },
      clearNotice: () => clearChannelNotice(),
      refreshWallet: async () => {
        if (window.WalletModule && typeof window.WalletModule.refresh === 'function') {
          await window.WalletModule.refresh();
        } else if (typeof window.fetchWallet === 'function') {
          await window.fetchWallet();
        }
      },
      refreshAdminPanel: async () => {
        if (window.AdminModule && typeof window.AdminModule.loadDashboard === 'function') {
          await window.AdminModule.loadDashboard();
        } else if (typeof window.fetchAdminOverview === 'function') {
          await window.fetchAdminOverview();
        }
      }
    };
  }

  function getLanguages() {
    if (Array.isArray(window.SUPPORTED_LANGUAGES)) return window.SUPPORTED_LANGUAGES;
    if (typeof SUPPORTED_LANGUAGES !== 'undefined' && Array.isArray(SUPPORTED_LANGUAGES)) {
      return SUPPORTED_LANGUAGES;
    }
    return ['English', 'Arabic'];
  }

  function getCategories() {
    if (Array.isArray(window.SUPPORTED_CATEGORIES)) return window.SUPPORTED_CATEGORIES;
    if (typeof SUPPORTED_CATEGORIES !== 'undefined' && Array.isArray(SUPPORTED_CATEGORIES)) {
      return SUPPORTED_CATEGORIES;
    }
    return [];
  }

  function getCatLabel(catValue) {
    if (typeof window.getCategoryLabel === 'function') return window.getCategoryLabel(catValue);
    if (window.UI && typeof window.UI.getCategoryLabel === 'function') {
      return window.UI.getCategoryLabel(catValue);
    }
    const found = getCategories().find((c) => c.value === catValue);
    return found ? t(found.key, catValue) : catValue;
  }

  function getApprovalText(status) {
    if (typeof window.getApprovalLabel === 'function') return window.getApprovalLabel(status);
    if (window.UI && typeof window.UI.getApprovalLabel === 'function') {
      return window.UI.getApprovalLabel(status);
    }
    if (status === 'approved') return t('status_approved', status);
    if (status === 'rejected') return t('status_rejected', status);
    return t('status_pending_review', status || 'pending');
  }

  async function sendRequest(url, method, body, extraHeaders = {}) {
    try {
      const state = getState();
      const userId = extraHeaders['x-user-id'] || state?.userId || '';
      const adminKey = extraHeaders['x-admin-key'] || state?.adminKey || '';

      if (typeof window.apiSend === 'function' && !userId && !adminKey) {
        return await window.apiSend(url, method, body);
      }
      if (window.Api && typeof window.Api.send === 'function' && !userId && !adminKey) {
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

  async function refreshChannelsList(ctx) {
    try {
      const activeCtx = buildContext(ctx);
      if (typeof activeCtx.apiRequest === 'function' && activeCtx.state?.userId) {
        await refreshChannels(activeCtx);
      }
      if (typeof window.fetchChannels === 'function') {
        await window.fetchChannels();
      } else if (window.Api && typeof window.Api.fetchChannels === 'function') {
        await window.Api.fetchChannels();
      }
      if (window.ChannelsModule && typeof window.ChannelsModule.load === 'function') {
        await window.ChannelsModule.load(activeCtx);
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function saveNewChannel() {
    const nameEl = getEl('ch-name') || getEl('ch-title');
    const usernameEl = getEl('ch-username');
    const langEl = getEl('ch-language');
    const catEl = getEl('ch-category');
    const priceEl = getEl('ch-price-input') || getEl('ch-price');
    const botAddedEl = getEl('ch-bot-added');

    const name = nameEl ? nameEl.value.trim() : '';
    const username = usernameEl ? usernameEl.value.trim() : '';
    const language = langEl ? langEl.value : 'English';
    const category = catEl ? catEl.value : 'other';
    const price = priceEl ? parseFloat(priceEl.value) : NaN;
    const botAdded = botAddedEl ? Boolean(botAddedEl.checked) : false;

    if (!name || !username) {
      toast(t('msg_fill_required'));
      if (typeof window.updateChannelWizardStep === 'function') {
        window.updateChannelWizardStep(1);
      } else if (window.UI && typeof window.UI.updateChannelWizardStep === 'function') {
        window.UI.updateChannelWizardStep(1);
      }
      return;
    }

    if (username.includes('+') || username.toLowerCase().includes('joinchat')) {
      toast(t('msg_private_rejected'));
      return;
    }

    if (isNaN(price) || price < 1 || price > 3) {
      toast(t('msg_price_range'));
      return;
    }

    try {
      const json = await sendRequest('/api/channels', 'POST', {
        name,
        username,
        language,
        category,
        price,
        botAdded
      });

      if (json && json.success) {
        toast(t('msg_channel_saved'));
        if (typeof window.resetChannelWizard === 'function') {
          window.resetChannelWizard();
        } else if (window.UI && typeof window.UI.resetChannelWizard === 'function') {
          window.UI.resetChannelWizard();
        }

        getEl('panel-add-channel')?.classList.add('hidden');
        const state = getState();
        if (state) state.isChannelsListOpen = true;
        getEl('panel-channels-list')?.classList.remove('hidden');

        if (typeof window.updateToggleButtonsText === 'function') {
          window.updateToggleButtonsText();
        }

        await refreshChannelsList();
        if (window.App && typeof window.App.refreshUserData === 'function') {
          await window.App.refreshUserData();
        }
      } else {
        toast((json && json.message) || t('msg_fill_required'));
      }
    } catch (err) {
      console.error(err);
      toast(err.message);
    }
  }

  async function verifyChannelAutoLink(id) {
    try {
      const json = await sendRequest(`/api/channels/${encodeURIComponent(id)}/verify`, 'POST');
      if (json && json.success) {
        toast(t('msg_channel_verified'));
        await refreshChannelsList();
      } else {
        toast((json && json.message) || t('msg_fill_required'));
      }
    } catch (err) {
      console.error(err);
      toast(err.message);
    }
  }

  async function syncChannelNow(id) {
    try {
      const json = await sendRequest(`/api/channels/${encodeURIComponent(id)}/sync`, 'POST');
      if (json && json.success) {
        toast(t('msg_channel_synced'));
        await refreshChannelsList();
      } else if (json && json.message) {
        toast(json.message);
      }
    } catch (err) {
      console.error(err);
      toast(err.message);
    }
  }

  async function updateChannelSettings(id) {
    const langEl = getEl(`edit-ch-lang-${id}`);
    const catEl = getEl(`edit-ch-cat-${id}`);
    const priceEl = getEl(`edit-ch-price-${id}`);
    const botEl = getEl(`edit-ch-bot-${id}`);

    const language = langEl ? langEl.value : 'English';
    const category = catEl ? catEl.value : 'other';
    const price = priceEl ? parseFloat(priceEl.value) : NaN;
    const botAdded = botEl ? Boolean(botEl.checked) : false;

    if (isNaN(price) || price < 1 || price > 3) {
      toast(t('msg_price_range'));
      return;
    }

    try {
      const json = await sendRequest(`/api/channels/${encodeURIComponent(id)}`, 'PUT', {
        language,
        category,
        price,
        botAdded
      });
      if (json && json.success) {
        const state = getState();
        if (state && state.editingChannelIds) {
          state.editingChannelIds.delete(id);
        }
        toast(t('msg_channel_updated'));
        await refreshChannelsList();
      } else if (json && json.message) {
        toast(json.message);
      }
    } catch (err) {
      console.error(err);
      toast(err.message);
    }
  }

  async function deleteChannel(id) {
    try {
      const json = await sendRequest(`/api/channels/${encodeURIComponent(id)}`, 'DELETE');
      if (json && json.success) {
        const state = getState();
        if (state) {
          state.expandedChannelIds?.delete(id);
          state.editingChannelIds?.delete(id);
        }
        toast(t('msg_channel_deleted'));
        await refreshChannelsList();
      } else if (json && json.message) {
        toast(json.message);
      }
    } catch (err) {
      console.error(err);
      toast(err.message);
    }
  }

  async function refreshChannels(ctx) {
    const activeCtx = buildContext(ctx);
    const state = activeCtx.state;
    const container = getEl('channelsList');
    if (!container) return;

    try {
      const query = state?.userId ? `?userId=${encodeURIComponent(state.userId)}` : '';
      const data = await activeCtx.apiRequest(`/api/channels${query}`, undefined, activeCtx);
      const channels = Array.isArray(data?.channels) ? data.channels : [];

      if (state) {
        state.channels = channels;
      }

      if (channels.length === 0) {
        container.innerHTML = '<div class="list-row"><span class="stat-label">لا توجد قنوات مسجلة بعد.</span></div>';
        return;
      }

      container.innerHTML = channels
        .map((ch) => {
          const safeId = esc(ch.id || ch._id);
          const historyHtml = (ch.editHistory || [])
            .map((h) => `<div>• [${esc(h.at || '')}] ${esc(h.action)}: ${esc(JSON.stringify(h.details || {}))}</div>`)
            .join('');

          return `
            <div class="list-row">
              <div style="width:100%;">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                  <div>
                    <strong>${esc(ch.name)}</strong> <span class="stat-label">(${safeId})</span>
                    <div class="stat-label">المشتركون: ${esc(ch.subscribers || ch.subscribersCount || 0)} | السعر: $${Number(ch.price || 0).toFixed(2)}</div>
                    <div class="stat-label">مشاهدات حقيقية: ${esc(ch.viewsCount || 0)} | مفلترة Anti-Bot: ${esc(ch.filteredBotViews || 0)} | الأرباح: $${Number(ch.earnedTotal || 0).toFixed(2)}</div>
                  </div>
                  <div class="actions-inline">
                    <span class="badge badge-${esc(ch.status || '')}">${esc(ch.status || '')}</span>
                    <button type="button" class="btn-secondary" data-stat-id="${safeId}">+1000 مشاهدة / +25$</button>
                    <button type="button" class="btn-warning" data-bot-test-id="${safeId}">اختبار تضخيم (60000 مشاهدة)</button>
                  </div>
                </div>
                <div class="history-box">
                  <strong>سجل التعديلات الزمني:</strong>
                  ${historyHtml}
                </div>
              </div>
            </div>
          `;
        })
        .join('');

      container.querySelectorAll('[data-stat-id]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          clearChannelNotice();
          try {
            const targetId = btn.getAttribute('data-stat-id');
            const res = await activeCtx.apiRequest(
              `/api/channels/${encodeURIComponent(targetId)}/record-stats`,
              {
                method: 'POST',
                body: JSON.stringify({ views: 1000, earnings: 25 })
              },
              activeCtx
            );
            showChannelNotice(
              `تم اعتماد ${res.validViews} مشاهدة و $${Number(res.validEarnings || 0).toFixed(2)} أرباح معلقة.`,
              false
            );
            await Promise.all([
              refreshChannels(activeCtx),
              activeCtx.refreshWallet ? activeCtx.refreshWallet(activeCtx) : Promise.resolve()
            ]);
          } catch (err) {
            showChannelNotice(err.message, true);
          }
        });
      });

      container.querySelectorAll('[data-bot-test-id]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          clearChannelNotice();
          try {
            const targetId = btn.getAttribute('data-bot-test-id');
            const res = await activeCtx.apiRequest(
              `/api/channels/${encodeURIComponent(targetId)}/record-stats`,
              {
                method: 'POST',
                body: JSON.stringify({ views: 60000, earnings: 150 })
              },
              activeCtx
            );
            showChannelNotice(
              `Anti-Bot: تم قبول ${res.validViews} مشاهدة وفلترة ${res.botFilteredViews} مشاهدة مشبوهة.`,
              false
            );
            await Promise.all([
              refreshChannels(activeCtx),
              activeCtx.refreshWallet ? activeCtx.refreshWallet(activeCtx) : Promise.resolve()
            ]);
            if (state?.adminKey && activeCtx.refreshAdminPanel) {
              await activeCtx.refreshAdminPanel(activeCtx);
            }
          } catch (err) {
            showChannelNotice(err.message, true);
          }
        });
      });
    } catch (err) {
      console.error(err);
      throw err;
    }
  }

  function renderChannels() {
    const container = getEl('channels-container');
    if (!container) return;

    try {
      const state = getState();
      const channels = state && Array.isArray(state.channels) ? state.channels : [];

      if (!channels.length) {
        container.innerHTML = `<div class="empty-state">${esc(t('no_channels', t('no_data')))}</div>`;
        return;
      }

      const languages = getLanguages();
      const categories = getCategories();

      container.innerHTML = channels
        .map((ch) => {
          const isExpanded = Boolean(state?.expandedChannelIds?.has(ch._id));
          const isEditing = Boolean(state?.editingChannelIds?.has(ch._id));

          const langOptions = languages
            .map(
              (l) =>
                `<option value="${esc(l)}" ${l === ch.language ? 'selected' : ''}>${esc(l)}</option>`
            )
            .join('');

          const catOptions = categories
            .map(
              (c) =>
                `<option value="${esc(c.value)}" ${c.value === ch.category ? 'selected' : ''}>${esc(
                  t(c.key, c.value)
                )}</option>`
            )
            .join('');

          const statusBadgeClass =
            ch.approvalStatus === 'approved'
              ? 'badge-active'
              : ch.approvalStatus === 'rejected'
              ? 'badge-rejected'
              : 'badge-draft';

          const ownerDisplay = ch.ownerUsername || ch.ownerName || ch.ownerTelegramId || ch.ownerId || '-';
          const safeId = esc(ch._id);

          return `
            <div class="item-card">
              <div class="item-summary">
                <div class="item-title-group">
                  <span class="item-title">${esc(ch.name)}</span>
                  <span class="item-subtitle">${esc(ch.username || '')}</span>
                  <span class="badge badge-price">${esc(ch.price)}$</span>
                  <span class="badge ${statusBadgeClass}">${esc(getApprovalText(ch.approvalStatus))}</span>
                </div>
                <button type="button" class="btn btn-secondary btn-sm" onclick="toggleChannelDetails('${safeId}')">
                  ${esc(isExpanded ? t('btn_hide_details') : t('btn_show_details'))}
                </button>
              </div>

              ${
                isExpanded
                  ? `
                <div class="item-details">
                  ${
                    !isEditing
                      ? `
                    <div class="detail-grid">
                      <div class="detail-row"><span class="label">${esc(t('detail_language'))}</span><strong>${esc(ch.language || '-')}</strong></div>
                      <div class="detail-row"><span class="label">${esc(t('detail_category'))}</span><strong>${esc(getCatLabel(ch.category) || '-')}</strong></div>
                      <div class="detail-row"><span class="label">${esc(t('detail_price'))}</span><strong>${esc(ch.price)}$</strong></div>
                      <div class="detail-row"><span class="label">${esc(t('detail_subscribers'))}</span><strong>${esc(ch.subscribersCount ?? ch.subscribers ?? 0)}</strong></div>
                      <div class="detail-row"><span class="label">${esc(t('detail_channel_type'))}</span><strong>${esc(ch.isPublic !== false ? t('type_public') : t('type_private'))}</strong></div>
                      <div class="detail-row"><span class="label">${esc(t('detail_owner'))}</span><strong>${esc(ownerDisplay)}</strong></div>
                      <div class="detail-row"><span class="label">${esc(t('detail_intro_post'))}</span><strong>${esc(ch.introPostSent ? t('intro_sent_yes') : t('intro_sent_no'))}</strong></div>
                      <div class="detail-row"><span class="label">${esc(t('detail_referrals'))}</span><strong>${esc(ch.referralsCount || 0)}</strong></div>
                      <div class="detail-row"><span class="label">${esc(t('detail_bot_status'))}</span><strong>${esc(
                          ch.botAdded ? t('bot_status_ok') : t('bot_status_pending')
                        )}</strong></div>
                      <div class="detail-row"><span class="label">${esc(t('detail_bot_perms'))}</span><strong>${esc(
                          ch.botPermissionsOk !== false ? t('perms_ok') : t('perms_warn')
                        )}</strong></div>
                    </div>
                    <div class="detail-actions">
                      <button type="button" class="btn btn-secondary btn-sm" onclick="verifyChannelAutoLink('${safeId}')">${esc(t('btn_verify_channel'))}</button>
                      <button type="button" class="btn btn-secondary btn-sm" onclick="syncChannelNow('${safeId}')">${esc(t('btn_sync_channel'))}</button>
                      <button type="button" class="btn btn-primary btn-sm" onclick="toggleEditChannel('${safeId}')">${esc(t('btn_edit_settings'))}</button>
                      <button type="button" class="btn btn-danger btn-sm" onclick="deleteChannel('${safeId}')">${esc(t('btn_delete'))}</button>
                    </div>
                  `
                      : `
                    <div class="form-group">
                      <label>${esc(t('label_channel_lang'))}</label>
                      <select id="edit-ch-lang-${safeId}" class="form-control">${langOptions}</select>
                    </div>
                    <div class="form-group">
                      <label>${esc(t('label_channel_cat'))}</label>
                      <select id="edit-ch-cat-${safeId}" class="form-control">${catOptions}</select>
                    </div>
                    <div class="form-group">
                      <label>${esc(t('label_channel_price'))}</label>
                      <input type="number" id="edit-ch-price-${safeId}" class="form-control" min="1" max="3" step="0.1" value="${esc(ch.price)}" />
                    </div>
                    <div class="checkbox-row" style="margin-bottom: 12px;">
                      <input type="checkbox" id="edit-ch-bot-${safeId}" ${ch.botAdded ? 'checked' : ''} />
                      <label for="edit-ch-bot-${safeId}">${esc(t('label_bot_confirmed'))}</label>
                    </div>
                    <div class="detail-actions">
                      <button type="button" class="btn btn-success btn-sm" onclick="updateChannelSettings('${safeId}')">${esc(t('btn_save_changes'))}</button>
                      <button type="button" class="btn btn-secondary btn-sm" onclick="toggleEditChannel('${safeId}')">${esc(t('btn_cancel'))}</button>
                    </div>
                  `
                  }
                </div>
              `
                  : ''
              }
            </div>
          `;
        })
        .join('');
    } catch (err) {
      console.error(err);
    }
  }

  function toggleChannelDetails(id) {
    try {
      const state = getState();
      if (!state) return;
      if (state.expandedChannelIds?.has(id)) {
        state.expandedChannelIds.delete(id);
        state.editingChannelIds?.delete(id);
      } else {
        state.expandedChannelIds?.add(id);
      }
      renderChannels();
    } catch (err) {
      console.error(err);
    }
  }

  function toggleEditChannel(id) {
    try {
      const state = getState();
      if (!state || !state.editingChannelIds) return;
      if (state.editingChannelIds.has(id)) {
        state.editingChannelIds.delete(id);
      } else {
        state.editingChannelIds.add(id);
      }
      renderChannels();
    } catch (err) {
      console.error(err);
    }
  }

  function bindEvents(ctx) {
    const activeCtx = buildContext(ctx);
    const state = activeCtx.state;
    const form = getEl('channelForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearChannelNotice();
      try {
        const name = getEl('channelNameInput')?.value.trim() || '';
        const subscribers = Number(getEl('channelSubsInput')?.value || 0);
        const price = Number(getEl('channelPriceInput')?.value || 0);

        await activeCtx.apiRequest(
          '/api/channels',
          {
            method: 'POST',
            body: JSON.stringify({
              userId: state?.userId,
              name,
              subscribers,
              price,
              referredBy: state?.referredBy || ''
            })
          },
          activeCtx
        );

        if (getEl('channelNameInput')) getEl('channelNameInput').value = '';
        showChannelNotice('تمت إضافة القناة بنجاح.', false);
        await refreshChannels(activeCtx);
      } catch (err) {
        showChannelNotice(err.message, true);
      }
    });
  }

  const ChannelsModule = {
    init() {
      const form = getEl('add-channel-form');
      if (!form) return;

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          const usernameInput = getEl('ch-username-legacy') || getEl('ch-username');
          const priceInput = getEl('ch-price-legacy') || getEl('ch-price');
          const payload = {
            channelUsername: usernameInput ? usernameInput.value : '',
            title: getEl('ch-title')?.value || '',
            subscribers: getEl('ch-subs')?.value || 0,
            pricePerPost: priceInput ? priceInput.value : 0
          };
          await window.Api.addChannel(payload);
          form.reset();
          if (window.UI && typeof window.UI.haptic === 'function') {
            window.UI.haptic('medium');
          }
          await this.load();
          if (window.App && typeof window.App.refreshUserData === 'function') {
            await window.App.refreshUserData();
          }
        } catch (err) {
          console.error(err);
          if (window.UI && typeof window.UI.notify === 'function') {
            window.UI.notify(err.message);
          } else {
            toast(err.message);
          }
        }
      });
    },

    async load(ctx) {
      const activeCtx = buildContext(ctx);
      if (activeCtx.state?.userId && getEl('channelsList')) {
        await refreshChannels(activeCtx).catch(() => {});
      }

      if (!window.Api || typeof window.Api.getChannels !== 'function') return;
      try {
        const data = await window.Api.getChannels();
        if (!data) return;

        const state = getState();
        if (state && Array.isArray(data.channels)) {
          state.channels = data.channels;
          renderChannels();
        }
        if (data.myChannels !== undefined) {
          this.renderMyChannels(data.myChannels);
        }
        if (
          data.marketplaceChannels !== undefined &&
          window.CampaignsModule &&
          typeof window.CampaignsModule.populateChannelSelect === 'function'
        ) {
          window.CampaignsModule.populateChannelSelect(data.marketplaceChannels);
        }
      } catch (err) {
        console.error(err);
        throw err;
      }
    },

    renderMyChannels(channels) {
      const listEl = getEl('my-channels-list');
      if (!listEl) return;

      try {
        if (!channels || channels.length === 0) {
          listEl.innerHTML = `<div class="empty-state">${esc(t('no_data'))}</div>`;
          return;
        }

        listEl.innerHTML = channels
          .map((ch) => {
            const subs = Number(ch.subscribers || 0).toLocaleString();
            const price = Number(ch.pricePerPost || 0);
            const safeStatus = esc(ch.status || '');
            return `
              <div class="list-item">
                <div class="item-main">
                  <span class="item-title">${esc(ch.title)} (@${esc(ch.channelUsername)})</span>
                  <span class="item-sub">${esc(subs)} subs • $${esc(price)}/post</span>
                </div>
                <span class="badge ${safeStatus}">${esc(t(`status_${ch.status}`, ch.status || ''))}</span>
              </div>
            `;
          })
          .join('');
      } catch (err) {
        console.error(err);
      }
    },

    saveNewChannel,
    verifyChannelAutoLink,
    syncChannelNow,
    updateChannelSettings,
    deleteChannel,
    renderChannels,
    toggleChannelDetails,
    toggleEditChannel,
    refreshChannels,
    bindEvents,
    bindChannelEvents: bindEvents
  };

  window.ChannelsModule = ChannelsModule;

  // Global functions for inline handlers and cross-module compatibility
  window.saveNewChannel = saveNewChannel;
  window.verifyChannelAutoLink = verifyChannelAutoLink;
  window.syncChannelNow = syncChannelNow;
  window.updateChannelSettings = updateChannelSettings;
  window.deleteChannel = deleteChannel;
  window.renderChannels = renderChannels;
  window.toggleChannelDetails = toggleChannelDetails;
  window.toggleEditChannel = toggleEditChannel;
  window.refreshChannels = refreshChannels;
  window.bindChannelEvents = bindEvents;
})();
