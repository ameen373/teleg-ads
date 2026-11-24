// ==================== CHANNELS MANAGEMENT ====================
(function () {
  function t(key, fallback = '') {
    if (!key) return fallback;
    try {
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

  async function sendRequest(url, method, body) {
    try {
      if (typeof window.apiSend === 'function') {
        return await window.apiSend(url, method, body);
      }
      if (window.Api && typeof window.Api.send === 'function') {
        return await window.Api.send(url, method, body);
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
      return await res.json();
    } catch (err) {
      console.error(err);
      throw err;
    }
  }

  async function refreshChannelsList() {
    try {
      if (typeof window.fetchChannels === 'function') {
        await window.fetchChannels();
      } else if (window.Api && typeof window.Api.fetchChannels === 'function') {
        await window.Api.fetchChannels();
      }
      if (window.ChannelsModule && typeof window.ChannelsModule.load === 'function') {
        await window.ChannelsModule.load();
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function saveNewChannel() {
    const nameEl = document.getElementById('ch-name') || document.getElementById('ch-title');
    const usernameEl = document.getElementById('ch-username');
    const langEl = document.getElementById('ch-language');
    const catEl = document.getElementById('ch-category');
    const priceEl = document.getElementById('ch-price-input') || document.getElementById('ch-price');
    const botAddedEl = document.getElementById('ch-bot-added');

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

        document.getElementById('panel-add-channel')?.classList.add('hidden');
        const state = getState();
        if (state) state.isChannelsListOpen = true;
        document.getElementById('panel-channels-list')?.classList.remove('hidden');

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
      const json = await sendRequest(`/api/channels/${id}/verify`, 'POST');
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
      const json = await sendRequest(`/api/channels/${id}/sync`, 'POST');
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
    const langEl = document.getElementById(`edit-ch-lang-${id}`);
    const catEl = document.getElementById(`edit-ch-cat-${id}`);
    const priceEl = document.getElementById(`edit-ch-price-${id}`);
    const botEl = document.getElementById(`edit-ch-bot-${id}`);

    const language = langEl ? langEl.value : 'English';
    const category = catEl ? catEl.value : 'other';
    const price = priceEl ? parseFloat(priceEl.value) : NaN;
    const botAdded = botEl ? Boolean(botEl.checked) : false;

    if (isNaN(price) || price < 1 || price > 3) {
      toast(t('msg_price_range'));
      return;
    }

    try {
      const json = await sendRequest(`/api/channels/${id}`, 'PUT', {
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
      const json = await sendRequest(`/api/channels/${id}`, 'DELETE');
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

  function renderChannels() {
    const container = document.getElementById('channels-container');
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

          const ownerDisplay = ch.ownerUsername || ch.ownerName || ch.ownerTelegramId || '-';
          const safeId = esc(ch._id);

          return `
            <div class="item-card">
              <div class="item-summary">
                <div class="item-title-group">
                  <span class="item-title">${esc(ch.name)}</span>
                  <span class="item-subtitle">${esc(ch.username)}</span>
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
                      <div class="detail-row"><span class="label">${esc(t('detail_language'))}</span><strong>${esc(ch.language)}</strong></div>
                      <div class="detail-row"><span class="label">${esc(t('detail_category'))}</span><strong>${esc(getCatLabel(ch.category))}</strong></div>
                      <div class="detail-row"><span class="label">${esc(t('detail_price'))}</span><strong>${esc(ch.price)}$</strong></div>
                      <div class="detail-row"><span class="label">${esc(t('detail_subscribers'))}</span><strong>${esc(ch.subscribersCount || 0)}</strong></div>
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

  const ChannelsModule = {
    init() {
      const form = document.getElementById('add-channel-form');
      if (!form) return;

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          const usernameInput = document.getElementById('ch-username-legacy') || document.getElementById('ch-username');
          const priceInput = document.getElementById('ch-price-legacy') || document.getElementById('ch-price');
          const payload = {
            channelUsername: usernameInput ? usernameInput.value : '',
            title: document.getElementById('ch-title')?.value || '',
            subscribers: document.getElementById('ch-subs')?.value || 0,
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

    async load() {
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
      const listEl = document.getElementById('my-channels-list');
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
    toggleEditChannel
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
})();
