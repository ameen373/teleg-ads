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

  function showChannelNotice(message, isError = false, ctx) {
    if (!message) return;
    try {
      if (ctx && typeof ctx.showNotice === 'function') {
        ctx.showNotice('channelNotice', message, isError);
      } else if (window.UI && typeof window.UI.showNotice === 'function') {
        window.UI.showNotice('channelNotice', message, isError, ctx);
      }
    } catch (err) {
      console.error(err);
    }
    toast(message, ctx);
  }

  function clearChannelNotice(ctx) {
    try {
      if (ctx && typeof ctx.clearNotice === 'function') {
        ctx.clearNotice('channelNotice');
      } else if (window.UI && typeof window.UI.clearNotice === 'function') {
        window.UI.clearNotice('channelNotice', ctx);
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
      refreshWallet: async () => {
        if (typeof window.refreshWallet === 'function') {
          await window.refreshWallet(baseCtx);
        }
      },
      refreshAdminPanel: async () => {
        if (window.AdminModule && typeof window.AdminModule.loadDashboard === 'function') {
          await window.AdminModule.loadDashboard(baseCtx);
        }
      }
    };
    return baseCtx;
  }

  function getLanguages(ctx) {
    if (ctx && Array.isArray(ctx.supportedLanguages)) return ctx.supportedLanguages;
    if (Array.isArray(window.SUPPORTED_LANGUAGES)) return window.SUPPORTED_LANGUAGES;
    if (typeof SUPPORTED_LANGUAGES !== 'undefined' && Array.isArray(SUPPORTED_LANGUAGES)) {
      return SUPPORTED_LANGUAGES;
    }
    return ['English', 'Arabic'];
  }

  function getCategories(ctx) {
    if (ctx && Array.isArray(ctx.supportedCategories)) return ctx.supportedCategories;
    if (Array.isArray(window.SUPPORTED_CATEGORIES)) return window.SUPPORTED_CATEGORIES;
    if (typeof SUPPORTED_CATEGORIES !== 'undefined' && Array.isArray(SUPPORTED_CATEGORIES)) {
      return SUPPORTED_CATEGORIES;
    }
    return [];
  }

  function getCatLabel(catValue, ctx) {
    if (window.UI && typeof window.UI.getCategoryLabel === 'function') {
      return window.UI.getCategoryLabel(catValue, ctx);
    }
    const found = getCategories(ctx).find((c) => c.value === catValue);
    return found ? translateKey(found.key, catValue, ctx) : catValue;
  }

  function getApprovalText(status, ctx) {
    if (window.UI && typeof window.UI.getApprovalLabel === 'function') {
      return window.UI.getApprovalLabel(status, ctx);
    }
    if (status === 'approved') return translateKey('status_approved', status, ctx);
    if (status === 'rejected') return translateKey('status_rejected', status, ctx);
    return translateKey('status_pending_review', status || 'pending', ctx);
  }

  async function saveNewChannel(ctx) {
    const activeCtx = buildContext(ctx);
    const nameEl = getEl('ch-name', activeCtx) || getEl('ch-title', activeCtx);
    const usernameEl = getEl('ch-username', activeCtx);
    const langEl = getEl('ch-language', activeCtx);
    const catEl = getEl('ch-category', activeCtx);
    const priceEl = getEl('ch-price-input', activeCtx) || getEl('ch-price', activeCtx);
    const botAddedEl = getEl('ch-bot-added', activeCtx);

    const name = nameEl ? nameEl.value.trim() : '';
    const username = usernameEl ? usernameEl.value.trim() : '';
    const language = langEl ? langEl.value : 'English';
    const category = catEl ? catEl.value : 'other';
    const price = priceEl ? parseFloat(priceEl.value) : NaN;
    const botAdded = botAddedEl ? Boolean(botAddedEl.checked) : false;

    if (!name || !username) {
      toast(translateKey('msg_fill_required', 'Please fill required fields', activeCtx), activeCtx);
      if (window.UI && typeof window.UI.updateChannelWizardStep === 'function') {
        window.UI.updateChannelWizardStep(1, activeCtx);
      }
      return;
    }

    if (username.includes('+') || username.toLowerCase().includes('joinchat')) {
      toast(translateKey('msg_private_rejected', 'Private channels are rejected', activeCtx), activeCtx);
      return;
    }

    if (isNaN(price) || price < 1 || price > 3) {
      toast(translateKey('msg_price_range', 'Price must be between $1 and $3', activeCtx), activeCtx);
      return;
    }

    try {
      const json = await activeCtx.apiRequest(
        '/api/channels',
        {
          method: 'POST',
          body: JSON.stringify({
            userId: activeCtx.state?.userId,
            name,
            username,
            language,
            category,
            price,
            botAdded
          })
        },
        activeCtx
      );

      if (json && (json.success || json.ok !== false)) {
        toast(translateKey('msg_channel_saved', 'Channel saved', activeCtx), activeCtx);
        if (window.UI && typeof window.UI.resetChannelWizard === 'function') {
          window.UI.resetChannelWizard(activeCtx);
        }

        getEl('panel-add-channel', activeCtx)?.classList.add('hidden');
        const state = getState(activeCtx);
        if (state) state.isChannelsListOpen = true;
        getEl('panel-channels-list', activeCtx)?.classList.remove('hidden');

        if (typeof window.updateToggleButtonsText === 'function') {
          window.updateToggleButtonsText(activeCtx);
        }

        await refreshChannels(activeCtx);
        renderChannels(activeCtx);
      } else {
        toast((json && json.message) || translateKey('msg_fill_required', 'Error', activeCtx), activeCtx);
      }
    } catch (err) {
      console.error(err);
      toast(err.message, activeCtx);
    }
  }

  async function verifyChannelAutoLink(id, ctx) {
    const activeCtx = buildContext(ctx);
    try {
      const json = await activeCtx.apiRequest(
        `/api/channels/${encodeURIComponent(id)}/verify`,
        { method: 'POST' },
        activeCtx
      );
      if (json && (json.success || json.ok !== false)) {
        toast(translateKey('msg_channel_verified', 'Channel verified', activeCtx), activeCtx);
        await refreshChannels(activeCtx);
        renderChannels(activeCtx);
      } else {
        toast((json && json.message) || translateKey('msg_fill_required', 'Error', activeCtx), activeCtx);
      }
    } catch (err) {
      console.error(err);
      toast(err.message, activeCtx);
    }
  }

  async function syncChannelNow(id, ctx) {
    const activeCtx = buildContext(ctx);
    try {
      const json = await activeCtx.apiRequest(
        `/api/channels/${encodeURIComponent(id)}/sync`,
        { method: 'POST' },
        activeCtx
      );
      if (json && (json.success || json.ok !== false)) {
        toast(translateKey('msg_channel_synced', 'Channel synced', activeCtx), activeCtx);
        await refreshChannels(activeCtx);
        renderChannels(activeCtx);
      } else if (json && json.message) {
        toast(json.message, activeCtx);
      }
    } catch (err) {
      console.error(err);
      toast(err.message, activeCtx);
    }
  }

  async function updateChannelSettings(id, ctx) {
    const activeCtx = buildContext(ctx);
    const langEl = getEl(`edit-ch-lang-${id}`, activeCtx);
    const catEl = getEl(`edit-ch-cat-${id}`, activeCtx);
    const priceEl = getEl(`edit-ch-price-${id}`, activeCtx);
    const botEl = getEl(`edit-ch-bot-${id}`, activeCtx);

    const language = langEl ? langEl.value : 'English';
    const category = catEl ? catEl.value : 'other';
    const price = priceEl ? parseFloat(priceEl.value) : NaN;
    const botAdded = botEl ? Boolean(botEl.checked) : false;

    if (isNaN(price) || price < 1 || price > 3) {
      toast(translateKey('msg_price_range', 'Price must be between $1 and $3', activeCtx), activeCtx);
      return;
    }

    try {
      const json = await activeCtx.apiRequest(
        `/api/channels/${encodeURIComponent(id)}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            language,
            category,
            price,
            botAdded
          })
        },
        activeCtx
      );
      if (json && (json.success || json.ok !== false)) {
        const state = getState(activeCtx);
        if (state && state.editingChannelIds) {
          state.editingChannelIds.delete(id);
        }
        toast(translateKey('msg_channel_updated', 'Channel updated', activeCtx), activeCtx);
        await refreshChannels(activeCtx);
        renderChannels(activeCtx);
      } else if (json && json.message) {
        toast(json.message, activeCtx);
      }
    } catch (err) {
      console.error(err);
      toast(err.message, activeCtx);
    }
  }

  async function deleteChannel(id, ctx) {
    const activeCtx = buildContext(ctx);
    try {
      const json = await activeCtx.apiRequest(
        `/api/channels/${encodeURIComponent(id)}`,
        { method: 'DELETE' },
        activeCtx
      );
      if (json && (json.success || json.ok !== false)) {
        const state = getState(activeCtx);
        if (state) {
          state.expandedChannelIds?.delete(id);
          state.editingChannelIds?.delete(id);
        }
        toast(translateKey('msg_channel_deleted', 'Channel deleted', activeCtx), activeCtx);
        await refreshChannels(activeCtx);
        renderChannels(activeCtx);
      } else if (json && json.message) {
        toast(json.message, activeCtx);
      }
    } catch (err) {
      console.error(err);
      toast(err.message, activeCtx);
    }
  }

  async function refreshChannels(ctx) {
    const activeCtx = buildContext(ctx);
    const state = activeCtx.state;
    const container = getEl('channelsList', activeCtx);

    try {
      const query = state?.userId ? `?userId=${encodeURIComponent(state.userId)}` : '';
      const data = await activeCtx.apiRequest(`/api/channels${query}`, { method: 'GET' }, activeCtx);
      const channels = Array.isArray(data?.channels)
        ? data.channels
        : Array.isArray(data?.myChannels)
        ? data.myChannels
        : [];

      if (state) {
        state.channels = channels;
      }

      if (data && data.myChannels !== undefined) {
        renderMyChannels(data.myChannels, activeCtx);
      }
      if (
        data &&
        data.marketplaceChannels !== undefined &&
        window.CampaignsModule &&
        typeof window.CampaignsModule.populateChannelSelect === 'function'
      ) {
        window.CampaignsModule.populateChannelSelect(data.marketplaceChannels);
      }

      renderChannels(activeCtx);

      if (!container) return data;

      if (channels.length === 0) {
        container.innerHTML = '<div class="list-row"><span class="stat-label">لا توجد قنوات مسجلة بعد.</span></div>';
        return data;
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
                    <strong>${esc(ch.name || ch.title || '')}</strong> <span class="stat-label">(${safeId})</span>
                    <div class="stat-label">المشتركون: ${esc(ch.subscribers || ch.subscribersCount || 0)} | السعر: $${Number(ch.price || ch.pricePerPost || 0).toFixed(2)}</div>
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
          clearChannelNotice(activeCtx);
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
              false,
              activeCtx
            );
            await Promise.all([
              refreshChannels(activeCtx),
              activeCtx.refreshWallet ? activeCtx.refreshWallet(activeCtx) : Promise.resolve()
            ]);
          } catch (err) {
            showChannelNotice(err.message, true, activeCtx);
          }
        });
      });

      container.querySelectorAll('[data-bot-test-id]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          clearChannelNotice(activeCtx);
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
              false,
              activeCtx
            );
            await Promise.all([
              refreshChannels(activeCtx),
              activeCtx.refreshWallet ? activeCtx.refreshWallet(activeCtx) : Promise.resolve()
            ]);
            if (state?.adminKey && activeCtx.refreshAdminPanel) {
              await activeCtx.refreshAdminPanel(activeCtx);
            }
          } catch (err) {
            showChannelNotice(err.message, true, activeCtx);
          }
        });
      });

      return data;
    } catch (err) {
      console.error(err);
      throw err;
    }
  }

  function renderChannels(ctx) {
    const activeCtx = buildContext(ctx);
    const container = getEl('channels-container', activeCtx);
    if (!container) return;

    try {
      const state = getState(activeCtx);
      const channels = state && Array.isArray(state.channels) ? state.channels : [];

      if (!channels.length) {
        container.innerHTML = `<div class="empty-state">${esc(translateKey('no_channels', translateKey('no_data', 'No data', activeCtx), activeCtx))}</div>`;
        return;
      }

      const languages = getLanguages(activeCtx);
      const categories = getCategories(activeCtx);

      container.innerHTML = channels
        .map((ch) => {
          const channelKey = ch._id || ch.id;
          const isExpanded = Boolean(state?.expandedChannelIds?.has(channelKey));
          const isEditing = Boolean(state?.editingChannelIds?.has(channelKey));

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
                  translateKey(c.key, c.value, activeCtx)
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
          const safeId = esc(channelKey);
          const displayName = ch.name || ch.title || '';
          const displayPrice = ch.price ?? ch.pricePerPost ?? 0;

          return `
            <div class="item-card">
              <div class="item-summary">
                <div class="item-title-group">
                  <span class="item-title">${esc(displayName)}</span>
                  <span class="item-subtitle">${esc(ch.username || ch.channelUsername || '')}</span>
                  <span class="badge badge-price">${esc(displayPrice)}$</span>
                  <span class="badge ${statusBadgeClass}">${esc(getApprovalText(ch.approvalStatus, activeCtx))}</span>
                </div>
                <button type="button" class="btn btn-secondary btn-sm" data-toggle-details="${safeId}">
                  ${esc(isExpanded ? translateKey('btn_hide_details', 'Hide', activeCtx) : translateKey('btn_show_details', 'Details', activeCtx))}
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
                      <div class="detail-row"><span class="label">${esc(translateKey('detail_language', 'Language:', activeCtx))}</span><strong>${esc(ch.language || '-')}</strong></div>
                      <div class="detail-row"><span class="label">${esc(translateKey('detail_category', 'Category:', activeCtx))}</span><strong>${esc(getCatLabel(ch.category, activeCtx) || '-')}</strong></div>
                      <div class="detail-row"><span class="label">${esc(translateKey('detail_price', 'Price:', activeCtx))}</span><strong>${esc(displayPrice)}$</strong></div>
                      <div class="detail-row"><span class="label">${esc(translateKey('detail_subscribers', 'Subscribers:', activeCtx))}</span><strong>${esc(ch.subscribersCount ?? ch.subscribers ?? 0)}</strong></div>
                      <div class="detail-row"><span class="label">${esc(translateKey('detail_channel_type', 'Type:', activeCtx))}</span><strong>${esc(ch.isPublic !== false ? translateKey('type_public', 'Public', activeCtx) : translateKey('type_private', 'Private', activeCtx))}</strong></div>
                      <div class="detail-row"><span class="label">${esc(translateKey('detail_owner', 'Owner:', activeCtx))}</span><strong>${esc(ownerDisplay)}</strong></div>
                      <div class="detail-row"><span class="label">${esc(translateKey('detail_intro_post', 'Intro:', activeCtx))}</span><strong>${esc(ch.introPostSent ? translateKey('intro_sent_yes', 'Sent', activeCtx) : translateKey('intro_sent_no', 'Not sent', activeCtx))}</strong></div>
                      <div class="detail-row"><span class="label">${esc(translateKey('detail_referrals', 'Referrals:', activeCtx))}</span><strong>${esc(ch.referralsCount || 0)}</strong></div>
                      <div class="detail-row"><span class="label">${esc(translateKey('detail_bot_status', 'Bot:', activeCtx))}</span><strong>${esc(
                          ch.botAdded ? translateKey('bot_status_ok', 'Active', activeCtx) : translateKey('bot_status_pending', 'Pending', activeCtx)
                        )}</strong></div>
                      <div class="detail-row"><span class="label">${esc(translateKey('detail_bot_perms', 'Permissions:', activeCtx))}</span><strong>${esc(
                          ch.botPermissionsOk !== false ? translateKey('perms_ok', 'OK', activeCtx) : translateKey('perms_warn', 'Check', activeCtx)
                        )}</strong></div>
                    </div>
                    <div class="detail-actions">
                      <button type="button" class="btn btn-secondary btn-sm" data-verify-id="${safeId}">${esc(translateKey('btn_verify_channel', 'Verify', activeCtx))}</button>
                      <button type="button" class="btn btn-secondary btn-sm" data-sync-id="${safeId}">${esc(translateKey('btn_sync_channel', 'Sync', activeCtx))}</button>
                      <button type="button" class="btn btn-primary btn-sm" data-edit-id="${safeId}">${esc(translateKey('btn_edit_settings', 'Edit', activeCtx))}</button>
                      <button type="button" class="btn btn-danger btn-sm" data-delete-id="${safeId}">${esc(translateKey('btn_delete', 'Delete', activeCtx))}</button>
                    </div>
                  `
                      : `
                    <div class="form-group">
                      <label>${esc(translateKey('label_channel_lang', 'Language', activeCtx))}</label>
                      <select id="edit-ch-lang-${safeId}" class="form-control">${langOptions}</select>
                    </div>
                    <div class="form-group">
                      <label>${esc(translateKey('label_channel_cat', 'Category', activeCtx))}</label>
                      <select id="edit-ch-cat-${safeId}" class="form-control">${catOptions}</select>
                    </div>
                    <div class="form-group">
                      <label>${esc(translateKey('label_channel_price', 'Price', activeCtx))}</label>
                      <input type="number" id="edit-ch-price-${safeId}" class="form-control" min="1" max="3" step="0.1" value="${esc(displayPrice)}" />
                    </div>
                    <div class="checkbox-row" style="margin-bottom: 12px;">
                      <input type="checkbox" id="edit-ch-bot-${safeId}" ${ch.botAdded ? 'checked' : ''} />
                      <label for="edit-ch-bot-${safeId}">${esc(translateKey('label_bot_confirmed', 'Bot confirmed', activeCtx))}</label>
                    </div>
                    <div class="detail-actions">
                      <button type="button" class="btn btn-success btn-sm" data-save-edit-id="${safeId}">${esc(translateKey('btn_save_changes', 'Save', activeCtx))}</button>
                      <button type="button" class="btn btn-secondary btn-sm" data-cancel-edit-id="${safeId}">${esc(translateKey('btn_cancel', 'Cancel', activeCtx))}</button>
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

      container.querySelectorAll('[data-toggle-details]').forEach((btn) => {
        btn.addEventListener('click', () => toggleChannelDetails(btn.getAttribute('data-toggle-details'), activeCtx));
      });
      container.querySelectorAll('[data-verify-id]').forEach((btn) => {
        btn.addEventListener('click', () => verifyChannelAutoLink(btn.getAttribute('data-verify-id'), activeCtx));
      });
      container.querySelectorAll('[data-sync-id]').forEach((btn) => {
        btn.addEventListener('click', () => syncChannelNow(btn.getAttribute('data-sync-id'), activeCtx));
      });
      container.querySelectorAll('[data-edit-id]').forEach((btn) => {
        btn.addEventListener('click', () => toggleEditChannel(btn.getAttribute('data-edit-id'), activeCtx));
      });
      container.querySelectorAll('[data-cancel-edit-id]').forEach((btn) => {
        btn.addEventListener('click', () => toggleEditChannel(btn.getAttribute('data-cancel-edit-id'), activeCtx));
      });
      container.querySelectorAll('[data-save-edit-id]').forEach((btn) => {
        btn.addEventListener('click', () => updateChannelSettings(btn.getAttribute('data-save-edit-id'), activeCtx));
      });
      container.querySelectorAll('[data-delete-id]').forEach((btn) => {
        btn.addEventListener('click', () => deleteChannel(btn.getAttribute('data-delete-id'), activeCtx));
      });
    } catch (err) {
      console.error(err);
    }
  }

  function renderMyChannels(channels, ctx) {
    const activeCtx = buildContext(ctx);
    const listEl = getEl('my-channels-list', activeCtx);
    if (!listEl) return;

    try {
      if (!channels || channels.length === 0) {
        listEl.innerHTML = `<div class="empty-state">${esc(translateKey('no_data', 'No data', activeCtx))}</div>`;
        return;
      }

      listEl.innerHTML = channels
        .map((ch) => {
          const subs = Number(ch.subscribers || 0).toLocaleString();
          const price = Number(ch.pricePerPost || ch.price || 0);
          const safeStatus = esc(ch.status || '');
          const cleanUsername = esc(String(ch.channelUsername || ch.username || '').replace(/^@/, ''));
          return `
            <div class="list-item">
              <div class="item-main">
                <span class="item-title">${esc(ch.title || ch.name || '')} (@${cleanUsername})</span>
                <span class="item-sub">${esc(subs)} subs • $${esc(price)}/post</span>
              </div>
              <span class="badge ${safeStatus}">${esc(translateKey(`status_${ch.status}`, ch.status || '', activeCtx))}</span>
            </div>
          `;
        })
        .join('');
    } catch (err) {
      console.error(err);
    }
  }

  function toggleChannelDetails(id, ctx) {
    try {
      const activeCtx = buildContext(ctx);
      const state = getState(activeCtx);
      if (!state) return;
      if (state.expandedChannelIds?.has(id)) {
        state.expandedChannelIds.delete(id);
        state.editingChannelIds?.delete(id);
      } else {
        state.expandedChannelIds?.add(id);
      }
      renderChannels(activeCtx);
    } catch (err) {
      console.error(err);
    }
  }

  function toggleEditChannel(id, ctx) {
    try {
      const activeCtx = buildContext(ctx);
      const state = getState(activeCtx);
      if (!state || !state.editingChannelIds) return;
      if (state.editingChannelIds.has(id)) {
        state.editingChannelIds.delete(id);
      } else {
        state.editingChannelIds.add(id);
      }
      renderChannels(activeCtx);
    } catch (err) {
      console.error(err);
    }
  }

  function bindEvents(ctx) {
    const activeCtx = buildContext(ctx);
    const state = activeCtx.state;
    const form = getEl('channelForm', activeCtx);
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearChannelNotice(activeCtx);
      try {
        const name = getEl('channelNameInput', activeCtx)?.value.trim() || '';
        const subscribers = Number(getEl('channelSubsInput', activeCtx)?.value || 0);
        const price = Number(getEl('channelPriceInput', activeCtx)?.value || 0);

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

        if (getEl('channelNameInput', activeCtx)) getEl('channelNameInput', activeCtx).value = '';
        showChannelNotice('تمت إضافة القناة بنجاح.', false, activeCtx);
        await refreshChannels(activeCtx);
      } catch (err) {
        showChannelNotice(err.message, true, activeCtx);
      }
    });
  }

  const ChannelsModule = {
    init(ctx) {
      const activeCtx = buildContext(ctx);
      const state = activeCtx.state;
      const form = getEl('add-channel-form', activeCtx);
      if (!form) return;

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          const usernameInput = getEl('ch-username-legacy', activeCtx) || getEl('ch-username', activeCtx);
          const priceInput = getEl('ch-price-legacy', activeCtx) || getEl('ch-price', activeCtx);
          const payload = {
            userId: state?.userId,
            channelUsername: usernameInput ? usernameInput.value : '',
            title: getEl('ch-title', activeCtx)?.value || '',
            subscribers: getEl('ch-subs', activeCtx)?.value || 0,
            pricePerPost: priceInput ? priceInput.value : 0
          };
          await activeCtx.apiRequest(
            '/api/channels',
            {
              method: 'POST',
              body: JSON.stringify(payload)
            },
            activeCtx
          );
          form.reset();
          if (window.UI && typeof window.UI.haptic === 'function') {
            window.UI.haptic('medium');
          }
          await this.load(activeCtx);
        } catch (err) {
          console.error(err);
          if (window.UI && typeof window.UI.notify === 'function') {
            window.UI.notify(err.message);
          } else {
            toast(err.message, activeCtx);
          }
        }
      });
    },

    async load(ctx) {
      const activeCtx = buildContext(ctx);
      await refreshChannels(activeCtx);
    },

    renderMyChannels(channels, ctx) {
      renderMyChannels(channels, ctx);
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
  window.refreshChannels = (ctx) => refreshChannels(ctx);
  window.bindChannelEvents = (ctx) => bindEvents(ctx);
})();
