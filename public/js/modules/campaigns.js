// ==================== CAMPAIGNS & MARKETPLACE MANAGEMENT ====================
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

  function getCatLabel(catValue) {
    if (typeof window.getCategoryLabel === 'function') return window.getCategoryLabel(catValue);
    if (window.UI && typeof window.UI.getCategoryLabel === 'function') {
      return window.UI.getCategoryLabel(catValue);
    }
    return catValue || '';
  }

  function getCampStatusLabel(status) {
    if (typeof window.getCampaignStatusLabel === 'function') {
      return window.getCampaignStatusLabel(status);
    }
    if (window.UI && typeof window.UI.getCampaignStatusLabel === 'function') {
      return window.UI.getCampaignStatusLabel(status);
    }
    return t(`status_${status}`, status || 'draft');
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

  async function refreshCampaignsList() {
    if (typeof window.fetchCampaigns === 'function') {
      await window.fetchCampaigns();
    } else if (window.Api && typeof window.Api.fetchCampaigns === 'function') {
      await window.Api.fetchCampaigns();
    }
    if (window.CampaignsModule && typeof window.CampaignsModule.load === 'function') {
      try {
        await window.CampaignsModule.load();
      } catch (err) {
        console.error(err);
      }
    }
  }

  async function refreshWalletData() {
    if (typeof window.fetchWallet === 'function') {
      await window.fetchWallet();
    } else if (window.Api && typeof window.Api.fetchWallet === 'function') {
      await window.Api.fetchWallet();
    }
  }

  async function refreshMarketplaceData() {
    if (typeof window.fetchMarketplaceChannels === 'function') {
      await window.fetchMarketplaceChannels();
    } else if (window.Api && typeof window.Api.fetchMarketplaceChannels === 'function') {
      await window.Api.fetchMarketplaceChannels();
    }
  }

  async function submitCampaign(status) {
    const state = getState();
    const title = document.getElementById('camp-title')?.value.trim() || '';
    const adText = document.getElementById('camp-text')?.value.trim() || '';
    const targetUrl = document.getElementById('camp-url')?.value.trim() || '';
    const buttonPreset = document.getElementById('camp-btn-preset')?.value || 'Open';
    const customButtonText = document.getElementById('camp-custom-btn')?.value.trim() || '';
    const budgetVal = parseFloat(document.getElementById('camp-budget')?.value || '');
    const budget = Number.isFinite(budgetVal) && budgetVal > 0 ? budgetVal : 50;
    const targetLanguage = document.getElementById('camp-language')?.value || 'English';
    const targetCategory = document.getElementById('camp-category')?.value || 'other';
    const maxPricePerPost = parseFloat(document.getElementById('camp-price-input')?.value || '');
    const scheduleMode = document.getElementById('camp-schedule-mode')?.value || 'immediate';
    const selectedChannelIds = state?.selectedChannelIds ? Array.from(state.selectedChannelIds) : [];

    if (!title) {
      toast(t('msg_fill_required'));
      if (typeof window.updateCampaignWizardStep === 'function') {
        window.updateCampaignWizardStep(1);
      } else if (window.UI && typeof window.UI.updateCampaignWizardStep === 'function') {
        window.UI.updateCampaignWizardStep(1);
      }
      return;
    }

    if (isNaN(maxPricePerPost) || maxPricePerPost < 1 || maxPricePerPost > 3) {
      toast(t('msg_price_range'));
      return;
    }

    const payload = {
      title,
      adText,
      mediaType: state?.mediaType || 'none',
      mediaData: state?.mediaData || '',
      mediaName: state?.mediaName || '',
      targetUrl,
      buttonPreset,
      customButtonText,
      budget,
      targetLanguage,
      targetCategory,
      maxPricePerPost,
      scheduleMode,
      selectedChannelIds,
      status
    };

    try {
      const editingId = state?.editingCampaignId || null;
      const url = editingId ? `/api/campaigns/${editingId}` : '/api/campaigns';
      const method = editingId ? 'PUT' : 'POST';

      const json = await sendRequest(url, method, payload);

      if (json && json.success) {
        toast(status === 'draft' ? t('msg_draft_saved') : t('msg_campaign_published'));

        if (typeof window.resetCampaignWizard === 'function') {
          window.resetCampaignWizard();
        } else if (window.UI && typeof window.UI.resetCampaignWizard === 'function') {
          window.UI.resetCampaignWizard();
        }

        document.getElementById('panel-campaign-wizard')?.classList.add('hidden');
        if (state) state.isCampaignsListOpen = true;
        document.getElementById('panel-campaigns-list')?.classList.remove('hidden');

        if (typeof window.updateToggleButtonsText === 'function') {
          window.updateToggleButtonsText();
        }

        await refreshCampaignsList();
        if (window.App && typeof window.App.refreshUserData === 'function') {
          await window.App.refreshUserData();
        }
      } else {
        toast((json && json.message) || t('msg_fill_required'));
      }
    } catch (err) {
      toast(err.message);
    }
  }

  async function simulateCampaignViews(id, viewsDelta) {
    try {
      const json = await sendRequest(`/api/campaigns/${id}/track-views`, 'POST', {
        viewsDelta: Number(viewsDelta) || 1000,
        eventId: `evt_${id}_${Date.now()}`
      });
      if (json && json.success) {
        toast(t('msg_views_tracked'));
        await refreshCampaignsList();
        await refreshWalletData();
      } else {
        toast((json && json.message) || t('msg_fill_required'));
      }
    } catch (err) {
      toast(err.message);
    }
  }

  async function topUpCampaignBudget(id, amount) {
    try {
      const json = await sendRequest(`/api/campaigns/${id}/topup`, 'POST', {
        amount: Number(amount) || 25
      });
      if (json && json.success) {
        toast(t('msg_budget_topped_up'));
        await refreshCampaignsList();
        await refreshWalletData();
      } else {
        toast((json && json.message) || t('msg_fill_required'));
      }
    } catch (err) {
      toast(err.message);
    }
  }

  async function changeCampaignLifecycle(id, action) {
    try {
      const json = await sendRequest(`/api/campaigns/${id}/lifecycle`, 'POST', { action });
      if (json && json.success) {
        toast(t('msg_lifecycle_updated'));
        await refreshCampaignsList();
      } else {
        toast((json && json.message) || t('msg_fill_required'));
      }
    } catch (err) {
      toast(err.message);
    }
  }

  function resumeCampaignDraft(id) {
    const state = getState();
    const campaigns = state && Array.isArray(state.campaigns) ? state.campaigns : [];
    const camp = campaigns.find((c) => c._id === id);
    if (!camp) return;

    if (state) {
      state.editingCampaignId = id;
      state.selectedChannelIds = new Set(camp.selectedChannelIds || []);
      state.mediaType = camp.mediaType || 'none';
      state.mediaData = camp.mediaData || '';
      state.mediaName = camp.mediaName || '';
    }

    const headingEl = document.getElementById('campaign-wizard-heading');
    if (headingEl) headingEl.textContent = t('wizard_campaign_edit_title');

    const setVal = (elId, val) => {
      const el = document.getElementById(elId);
      if (el) el.value = val;
    };

    setVal('camp-title', camp.title || '');
    setVal('camp-text', camp.adText || '');
    document.getElementById('btn-clear-media')?.classList.toggle('hidden', !(state?.mediaData));
    setVal('camp-btn-preset', camp.buttonPreset || 'Open');
    setVal('camp-custom-btn', camp.customButtonText || '');
    document
      .getElementById('camp-custom-btn-group')
      ?.classList.toggle('hidden', camp.buttonPreset !== 'Custom');
    setVal('camp-url', camp.targetUrl || '');
    setVal('camp-budget', camp.budget || 50);
    setVal('camp-language', camp.targetLanguage || 'English');
    setVal('camp-category', camp.targetCategory || 'other');
    setVal('camp-price-input', camp.maxPricePerPost ?? 1);
    setVal('camp-schedule-mode', camp.scheduleMode || 'immediate');

    document.querySelectorAll('#camp-price-pills .price-pill').forEach((p) => {
      p.classList.toggle(
        'selected',
        parseFloat(p.getAttribute('data-price')) === camp.maxPricePerPost
      );
    });

    if (typeof window.handleBudgetTargetingState === 'function') {
      window.handleBudgetTargetingState();
    } else if (window.UI && typeof window.UI.handleBudgetTargetingState === 'function') {
      window.UI.handleBudgetTargetingState();
    }

    if (typeof window.updateLivePreview === 'function') {
      window.updateLivePreview();
    } else if (window.UI && typeof window.UI.updateLivePreview === 'function') {
      window.UI.updateLivePreview();
    }

    if (typeof window.updateCampaignWizardStep === 'function') {
      window.updateCampaignWizardStep(1);
    } else if (window.UI && typeof window.UI.updateCampaignWizardStep === 'function') {
      window.UI.updateCampaignWizardStep(1);
    }

    const wizardPanel = document.getElementById('panel-campaign-wizard');
    if (wizardPanel) {
      wizardPanel.classList.remove('hidden');
      wizardPanel.scrollIntoView({ behavior: 'smooth' });
    }
  }

  async function deleteCampaign(id) {
    try {
      const json = await sendRequest(`/api/campaigns/${id}`, 'DELETE');
      if (json && json.success) {
        const state = getState();
        state?.expandedCampaignIds?.delete(id);
        toast(t('msg_campaign_deleted'));
        await refreshCampaignsList();
      }
    } catch (err) {
      toast(err.message);
    }
  }

  function toggleCampaignDetails(id) {
    const state = getState();
    if (!state || !state.expandedCampaignIds) return;
    if (state.expandedCampaignIds.has(id)) {
      state.expandedCampaignIds.delete(id);
    } else {
      state.expandedCampaignIds.add(id);
    }
    renderCampaigns();
  }

  function toggleMarketplaceSelection(id) {
    const state = getState();
    if (!state || !state.selectedChannelIds) return;
    if (state.selectedChannelIds.has(id)) {
      state.selectedChannelIds.delete(id);
    } else {
      state.selectedChannelIds.add(id);
    }
    renderMarketplaceChannels();
  }

  async function toggleMarketplaceFavorite(id) {
    try {
      const json = await sendRequest(`/api/channels/${id}/favorite`, 'POST');
      if (json && json.success) {
        toast(t('msg_favorite_toggled'));
        await refreshMarketplaceData();
      }
    } catch (err) {
      toast(err.message);
    }
  }

  function renderMarketplaceChannels() {
    const state = getState();
    const selectedSet = state?.selectedChannelIds || new Set();
    const channels = state && Array.isArray(state.marketplaceChannels) ? state.marketplaceChannels : [];

    const container = document.getElementById('marketplace-channels-list');
    const counterEl = document.getElementById('selected-channels-counter');
    if (counterEl) {
      counterEl.textContent = String(selectedSet.size);
    }
    if (!container) return;

    if (!channels.length) {
      container.innerHTML = `<div class="empty-state">${esc(t('no_marketplace_channels', t('no_data')))}</div>`;
      return;
    }

    container.innerHTML = channels
      .map((ch) => {
        const isSelected = selectedSet.has(ch._id);
        const initial = ch.name ? esc(ch.name.charAt(0).toUpperCase()) : 'C';
        const safeName = esc(ch.name || '');
        const safeId = esc(ch._id);
        const avatarHtml = ch.photoUrl
          ? `<img src="${esc(ch.photoUrl)}" alt="${safeName}" class="mkt-avatar" />`
          : `<div class="mkt-avatar">${initial}</div>`;
        const cpm = ch.pricePer1000Views !== undefined ? ch.pricePer1000Views : ch.price;

        return `
          <div class="mkt-channel-card">
            <div class="mkt-channel-left">
              ${avatarHtml}
              <div>
                <div class="item-title">${safeName}</div>
                <div style="font-size:0.82rem; color:var(--text-muted);">
                  <span>${esc(t('mkt_subscribers'))} <strong>${esc(ch.subscribersCount || 0)}</strong></span> ·
                  <span>${esc(t('mkt_cpm'))} <strong>${esc(cpm)}$</strong></span> ·
                  <span>${esc(t('mkt_lang'))} <strong>${esc(ch.language || '')}</strong></span> ·
                  <span>${esc(t('mkt_cat'))} <strong>${esc(getCatLabel(ch.category))}</strong></span>
                </div>
              </div>
            </div>
            <div class="detail-actions">
              <button type="button" class="btn btn-secondary btn-sm" onclick="toggleMarketplaceFavorite('${safeId}')">
                ${esc(ch.isFavorite ? t('btn_favorite_active') : t('btn_favorite_add'))}
              </button>
              <button type="button" class="btn ${isSelected ? 'btn-success' : 'btn-primary'} btn-sm" onclick="toggleMarketplaceSelection('${safeId}')">
                ${esc(isSelected ? t('mkt_selected') : t('mkt_select'))}
              </button>
            </div>
          </div>
        `;
      })
      .join('');
  }

  function renderCampaigns() {
    const container = document.getElementById('campaigns-container');
    if (!container) return;

    const state = getState();
    const campaigns = state && Array.isArray(state.campaigns) ? state.campaigns : [];

    if (!campaigns.length) {
      container.innerHTML = `<div class="empty-state">${esc(t('no_campaigns', t('no_data')))}</div>`;
      return;
    }

    container.innerHTML = campaigns
      .map((camp) => {
        const isExpanded = Boolean(state?.expandedCampaignIds?.has(camp._id));
        const isDraft = camp.status === 'draft';
        const isPaused = camp.status === 'paused';
        const isActive = camp.status === 'active';
        const isCompleted = camp.status === 'completed';
        const safeId = esc(camp._id);

        const badgeClass =
          camp.status === 'active'
            ? 'badge-active'
            : camp.status === 'scheduled' || camp.status === 'completed'
            ? 'badge-price'
            : camp.status === 'paused'
            ? 'badge-rejected'
            : 'badge-draft';

        const budgetNum = Number(camp.budget || 0);
        const spentNum = Number(camp.spentAmount || 0);
        const remainingNum = Math.max(0, budgetNum - spentNum);

        const pubList =
          camp.publishedChannels && camp.publishedChannels.length
            ? camp.publishedChannels
                .map(
                  (p) =>
                    `${esc(p.channelName || '')} [${esc(p.views || 0)} views / ${esc(
                      Number(p.earnings || 0).toFixed(2)
                    )}$]`
                )
                .join(' | ')
            : '-';

        return `
          <div class="item-card">
            <div class="item-summary">
              <div class="item-title-group">
                <span class="item-title">${esc(camp.title)}</span>
                <span class="badge ${badgeClass}">${esc(getCampStatusLabel(camp.status))}</span>
                <span class="badge badge-price">${esc(camp.maxPricePerPost)}$ / 1k</span>
                ${camp.openTargeting ? '<span class="badge badge-active">🌍</span>' : ''}
              </div>
              <button type="button" class="btn btn-secondary btn-sm" onclick="toggleCampaignDetails('${safeId}')">
                ${esc(isExpanded ? t('btn_hide_details') : t('btn_show_details'))}
              </button>
            </div>

            ${
              isExpanded
                ? `
              <div class="item-details">
                <div class="detail-grid">
                  <div class="detail-row"><span class="label">${esc(t('stat_views'))}</span><strong>${esc(camp.totalViews || 0)}</strong></div>
                  <div class="detail-row"><span class="label">${esc(t('stat_spent'))}</span><strong>${esc(spentNum.toFixed(2))}$</strong></div>
                  <div class="detail-row"><span class="label">${esc(t('stat_remaining'))}</span><strong>${esc(remainingNum.toFixed(2))}$</strong></div>
                  <div class="detail-row"><span class="label">${esc(t('detail_budget'))}</span><strong>${esc(budgetNum.toFixed(2))}$</strong></div>
                  <div class="detail-row"><span class="label">${esc(t('detail_language'))}</span><strong>${esc(camp.targetLanguage || '')}</strong></div>
                  <div class="detail-row"><span class="label">${esc(t('detail_category'))}</span><strong>${esc(getCatLabel(camp.targetCategory))}</strong></div>
                  <div class="detail-row"><span class="label">${esc(t('detail_max_price'))}</span><strong>${esc(camp.maxPricePerPost)}$</strong></div>
                  <div class="detail-row"><span class="label">${esc(t('detail_schedule'))}</span><strong>${esc(
                    camp.scheduleMode === 'peak' ? t('opt_schedule_peak') : t('opt_schedule_immediate')
                  )}</strong></div>
                  <div class="detail-row"><span class="label">${esc(t('detail_published_channels'))}</span><strong>${pubList}</strong></div>
                </div>
                ${
                  camp.adText
                    ? `<p style="margin-bottom:8px;"><span style="color:var(--text-muted);">${esc(t('detail_ad_text'))}</span> ${esc(camp.adText)}</p>`
                    : ''
                }
                <p style="margin-bottom:8px; font-size:0.84rem; color:var(--primary);">
                  <strong>Powered by Telega.ads</strong> · ${esc(t('policy_locked_badge'))}
                </p>
                ${
                  camp.targetUrl
                    ? `<p style="margin-bottom:10px;"><span style="color:var(--text-muted);">${esc(t('detail_target_url'))}</span> <span dir="ltr">${esc(camp.targetUrl)}</span></p>`
                    : ''
                }
                <div class="detail-actions">
                  ${
                    isDraft
                      ? `<button type="button" class="btn btn-warning btn-sm" onclick="resumeCampaignDraft('${safeId}')">${esc(t('btn_continue_draft'))}</button>`
                      : ''
                  }
                  ${
                    isActive
                      ? `<button type="button" class="btn btn-primary btn-sm" onclick="simulateCampaignViews('${safeId}', 1000)">${esc(t('btn_simulate_views'))}</button>`
                      : ''
                  }
                  ${
                    isActive
                      ? `<button type="button" class="btn btn-warning btn-sm" onclick="changeCampaignLifecycle('${safeId}', 'pause')">${esc(t('btn_pause_campaign'))}</button>`
                      : ''
                  }
                  ${
                    isPaused && !isCompleted
                      ? `<button type="button" class="btn btn-success btn-sm" onclick="changeCampaignLifecycle('${safeId}', 'resume')">${esc(t('btn_resume_campaign'))}</button>`
                      : ''
                  }
                  ${
                    !isDraft && !isCompleted
                      ? `<button type="button" class="btn btn-secondary btn-sm" onclick="changeCampaignLifecycle('${safeId}', 'complete')">${esc(t('btn_complete_campaign'))}</button>`
                      : ''
                  }
                  ${
                    !isDraft
                      ? `<button type="button" class="btn btn-secondary btn-sm" onclick="topUpCampaignBudget('${safeId}', 25)">${esc(t('btn_topup_budget'))} (+25$)</button>`
                      : ''
                  }
                  <button type="button" class="btn btn-danger btn-sm" onclick="deleteCampaign('${safeId}')">${esc(t('btn_delete'))}</button>
                </div>
              </div>
            `
                : ''
            }
          </div>
        `;
      })
      .join('');
  }

  const CampaignsModule = {
    init() {
      const form = document.getElementById('create-campaign-form');
      if (form) {
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          try {
            const payload = {
              channelId: document.getElementById('camp-channel-select')?.value || '',
              title: document.getElementById('camp-title')?.value || '',
              adText: document.getElementById('camp-text')?.value || '',
              targetUrl: document.getElementById('camp-url')?.value || ''
            };
            await window.Api.createCampaign(payload);
            form.reset();
            if (window.UI && typeof window.UI.haptic === 'function') {
              window.UI.haptic('medium');
            }
            await this.load();
            if (window.App && typeof window.App.refreshUserData === 'function') {
              await window.App.refreshUserData();
            }
          } catch (err) {
            if (window.UI && typeof window.UI.notify === 'function') {
              window.UI.notify(err.message);
            } else {
              toast(err.message);
            }
          }
        });
      }
    },

    populateChannelSelect(channels) {
      const select = document.getElementById('camp-channel-select');
      if (!select) return;
      const placeholder = `<option value="">${esc(t('select_channel'))}</option>`;
      if (!channels || channels.length === 0) {
        select.innerHTML = placeholder;
        return;
      }
      const options = channels
        .map(
          (ch) =>
            `<option value="${esc(ch._id)}">${esc(ch.title)} (@${esc(ch.channelUsername)}) - $${esc(ch.pricePerPost)}</option>`
        )
        .join('');
      select.innerHTML = placeholder + options;
    },

    async load() {
      const listEl = document.getElementById('my-campaigns-list');
      if (!window.Api || typeof window.Api.getCampaigns !== 'function') return;

      const data = await window.Api.getCampaigns();
      const state = getState();
      if (state && data && Array.isArray(data.campaigns)) {
        state.campaigns = data.campaigns;
        renderCampaigns();
      }

      if (!listEl) return;
      if (!data || !data.campaigns || data.campaigns.length === 0) {
        listEl.innerHTML = `<div class="empty-state">${esc(t('no_data'))}</div>`;
        return;
      }

      listEl.innerHTML = data.campaigns
        .map((camp) => {
          const chName = camp.channelId ? `@${camp.channelId.channelUsername}` : 'Channel';
          const budgetNum = Number(camp.budget || 0);
          return `
            <div class="list-item">
              <div class="item-main">
                <span class="item-title">${esc(camp.title)} (${esc(chName)})</span>
                <span class="item-sub">$${esc(budgetNum.toFixed(2))} • ${esc(camp.targetUrl || '')}</span>
              </div>
              <span class="badge ${esc(camp.status || '')}">${esc(t(`status_${camp.status}`, camp.status || ''))}</span>
            </div>
          `;
        })
        .join('');
    },

    submitCampaign,
    simulateCampaignViews,
    topUpCampaignBudget,
    changeCampaignLifecycle,
    resumeCampaignDraft,
    deleteCampaign,
    toggleCampaignDetails,
    toggleMarketplaceSelection,
    toggleMarketplaceFavorite,
    renderMarketplaceChannels,
    renderCampaigns
  };

  window.CampaignsModule = CampaignsModule;

  // Global functions for inline handlers and cross-module compatibility
  window.submitCampaign = submitCampaign;
  window.simulateCampaignViews = simulateCampaignViews;
  window.topUpCampaignBudget = topUpCampaignBudget;
  window.changeCampaignLifecycle = changeCampaignLifecycle;
  window.resumeCampaignDraft = resumeCampaignDraft;
  window.deleteCampaign = deleteCampaign;
  window.toggleCampaignDetails = toggleCampaignDetails;
  window.toggleMarketplaceSelection = toggleMarketplaceSelection;
  window.toggleMarketplaceFavorite = toggleMarketplaceFavorite;
  window.renderMarketplaceChannels = renderMarketplaceChannels;
  window.renderCampaigns = renderCampaigns;
})();
