// ==================== CAMPAIGNS & MARKETPLACE MANAGEMENT ====================
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

  function showCampaignNotice(message, isError = false) {
    if (!message) return;
    try {
      if (window.UI && typeof window.UI.showNotice === 'function') {
        window.UI.showNotice('campaignNotice', message, isError);
      } else if (typeof window.showNotice === 'function') {
        window.showNotice('campaignNotice', message, isError);
      }
    } catch (err) {
      console.error(err);
    }
    toast(message);
  }

  function clearCampaignNotice() {
    try {
      if (window.UI && typeof window.UI.clearNotice === 'function') {
        window.UI.clearNotice('campaignNotice');
      } else if (typeof window.clearNotice === 'function') {
        window.clearNotice('campaignNotice');
      }
    } catch (err) {
      console.error(err);
    }
  }

  function persistDrafts(ctx) {
    try {
      if (window.UI && typeof window.UI.saveDrafts === 'function') {
        window.UI.saveDrafts(ctx);
      } else if (typeof window.saveDrafts === 'function') {
        window.saveDrafts(ctx);
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
      apiRequest: async (url, options = {}) =>
        sendRequest(url, options.method || 'GET', options.body ? JSON.parse(options.body) : undefined, options.headers),
      showNotice: (_targetOrMsg, msgOrErr, maybeErr) => {
        if (typeof maybeErr === 'boolean') {
          showCampaignNotice(msgOrErr, maybeErr);
        } else {
          showCampaignNotice(_targetOrMsg, Boolean(msgOrErr));
        }
      },
      clearNotice: () => clearCampaignNotice(),
      refreshWallet: async () => refreshWalletData(),
      refreshCampaigns: async () => refreshCampaignsList()
    };
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

  async function refreshCampaignsList(ctx) {
    try {
      const activeCtx = buildContext(ctx);
      if (typeof activeCtx.apiRequest === 'function' && getEl('campaignsList')) {
        await refreshCampaigns(activeCtx).catch(() => {});
      }
      if (typeof window.fetchCampaigns === 'function') {
        await window.fetchCampaigns();
      } else if (window.Api && typeof window.Api.fetchCampaigns === 'function') {
        await window.Api.fetchCampaigns();
      }
      if (window.CampaignsModule && typeof window.CampaignsModule.load === 'function') {
        await window.CampaignsModule.load(activeCtx);
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function refreshWalletData(ctx) {
    try {
      const activeCtx = buildContext(ctx);
      if (window.WalletModule && typeof window.WalletModule.refresh === 'function') {
        await window.WalletModule.refresh(activeCtx);
      } else if (typeof window.fetchWallet === 'function') {
        await window.fetchWallet();
      } else if (window.Api && typeof window.Api.fetchWallet === 'function') {
        await window.Api.fetchWallet();
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function refreshMarketplaceData() {
    try {
      if (typeof window.fetchMarketplaceChannels === 'function') {
        await window.fetchMarketplaceChannels();
      } else if (window.Api && typeof window.Api.fetchMarketplaceChannels === 'function') {
        await window.Api.fetchMarketplaceChannels();
      }
    } catch (err) {
      console.error(err);
    }
  }

  function syncOpenTargetingRule(ctx) {
    try {
      const activeCtx = buildContext(ctx);
      const budgetInput = getEl('campaignBudgetInput');
      const selectEl = getEl('campaignTargetingSelect');
      if (!budgetInput || !selectEl) return;

      const budgetVal = Number(budgetInput.value || 0);
      const minBudget = Number(activeCtx.state?.openTargetingMinBudget ?? 1000);
      const openOption = selectEl.querySelector('option[value="open"]');
      const allowed = budgetVal > minBudget;

      if (openOption) {
        openOption.disabled = !allowed;
      }
      if (!allowed && selectEl.value === 'open') {
        selectEl.value = 'specific';
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function refreshCampaigns(ctx) {
    const activeCtx = buildContext(ctx);
    const container = getEl('campaignsList');
    if (!container) return;

    try {
      const data = await activeCtx.apiRequest('/api/campaigns', undefined, activeCtx);
      const campaigns = Array.isArray(data?.campaigns) ? data.campaigns : [];

      if (activeCtx.state) {
        activeCtx.state.campaigns = campaigns;
      }

      if (campaigns.length === 0) {
        container.innerHTML = '<div class="list-row"><span class="stat-label">لا توجد حملات حالياً.</span></div>';
        return;
      }

      container.innerHTML = campaigns
        .map((c) => {
          const safeId = esc(c.id || c._id);
          const isOpenAction = c.status === 'active' && !c.settled;
          const historyHtml = (c.editHistory || [])
            .map((h) => `<div>• [${esc(h.at || '')}] ${esc(h.action)}: ${esc(JSON.stringify(h.details || {}))}</div>`)
            .join('');

          return `
            <div class="list-row">
              <div style="width:100%;">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                  <div>
                    <strong>${esc(c.title)}</strong> <span class="stat-label">(${safeId})</span>
                    <div class="stat-label">الميزانية الكلية: $${Number(c.budget || 0).toFixed(2)} | المتبقي: $${Number(c.remainingBudget ?? c.budget ?? 0).toFixed(2)}</div>
                    <div class="stat-label">الاستهداف: ${c.targetingMode === 'open' ? 'مفتوح (>1000$)' : 'محدد'}</div>
                  </div>
                  <div class="actions-inline">
                    <span class="badge badge-${esc(c.status || '')}">${esc(c.status || '')}</span>
                    ${
                      isOpenAction
                        ? `<button type="button" class="btn-secondary" data-spend-id="${safeId}">صرف 50$</button>
                           <button type="button" class="btn-secondary" data-edit-cmp-id="${safeId}">تعديل العنوان</button>
                           <button type="button" class="btn-warning" data-settle-id="${safeId}" data-settle-action="stop">إيقاف وتسوية</button>
                           <button type="button" class="btn-success" data-settle-id="${safeId}" data-settle-action="complete">إنهاء وتسوية</button>`
                        : ''
                    }
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

      container.querySelectorAll('[data-spend-id]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          clearCampaignNotice();
          try {
            const targetId = btn.getAttribute('data-spend-id');
            await activeCtx.apiRequest(
              `/api/campaigns/${encodeURIComponent(targetId)}/spend`,
              {
                method: 'POST',
                body: JSON.stringify({ amount: 50 })
              },
              activeCtx
            );
            showCampaignNotice('تم تسجيل صرف 50$ من الميزانية المتبقية.', false);
            await Promise.all([refreshCampaigns(activeCtx), refreshWalletData(activeCtx)]);
          } catch (err) {
            showCampaignNotice(err.message, true);
          }
        });
      });

      container.querySelectorAll('[data-edit-cmp-id]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          clearCampaignNotice();
          const newTitle = prompt('أدخل العنوان الجديد للحملة:');
          if (!newTitle) return;
          try {
            const targetId = btn.getAttribute('data-edit-cmp-id');
            await activeCtx.apiRequest(
              `/api/campaigns/${encodeURIComponent(targetId)}`,
              {
                method: 'PATCH',
                body: JSON.stringify({ title: newTitle })
              },
              activeCtx
            );
            showCampaignNotice('تم تحديث عنوان الحملة وتوثيقه في سجل التعديلات.', false);
            await refreshCampaigns(activeCtx);
          } catch (err) {
            showCampaignNotice(err.message, true);
          }
        });
      });

      container.querySelectorAll('[data-settle-id]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          clearCampaignNotice();
          try {
            const targetId = btn.getAttribute('data-settle-id');
            const action = btn.getAttribute('data-settle-action');
            const res = await activeCtx.apiRequest(
              `/api/campaigns/${encodeURIComponent(targetId)}/settle`,
              {
                method: 'POST',
                body: JSON.stringify({ action })
              },
              activeCtx
            );
            showCampaignNotice(
              `تمت التسوية الذرية وإعادة $${Number(res.refundAmount || 0).toFixed(2)} إلى المحفظة.`,
              false
            );
            await Promise.all([refreshCampaigns(activeCtx), refreshWalletData(activeCtx)]);
          } catch (err) {
            showCampaignNotice(err.message, true);
          }
        });
      });
    } catch (err) {
      console.error(err);
      throw err;
    }
  }

  async function submitCampaign(status) {
    const state = getState();
    const title = getEl('camp-title')?.value.trim() || '';
    const adText = getEl('camp-text')?.value.trim() || '';
    const targetUrl = getEl('camp-url')?.value.trim() || '';
    const buttonPreset = getEl('camp-btn-preset')?.value || 'Open';
    const customButtonText = getEl('camp-custom-btn')?.value.trim() || '';
    const budgetVal = parseFloat(getEl('camp-budget')?.value || '');
    const budget = Number.isFinite(budgetVal) && budgetVal > 0 ? budgetVal : 50;
    const targetLanguage = getEl('camp-language')?.value || 'English';
    const targetCategory = getEl('camp-category')?.value || 'other';
    const maxPricePerPost = parseFloat(getEl('camp-price-input')?.value || '');
    const scheduleMode = getEl('camp-schedule-mode')?.value || 'immediate';
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
      const url = editingId ? `/api/campaigns/${encodeURIComponent(editingId)}` : '/api/campaigns';
      const method = editingId ? 'PUT' : 'POST';

      const json = await sendRequest(url, method, payload);

      if (json && json.success) {
        toast(status === 'draft' ? t('msg_draft_saved') : t('msg_campaign_published'));

        if (typeof window.resetCampaignWizard === 'function') {
          window.resetCampaignWizard();
        } else if (window.UI && typeof window.UI.resetCampaignWizard === 'function') {
          window.UI.resetCampaignWizard();
        }

        getEl('panel-campaign-wizard')?.classList.add('hidden');
        if (state) state.isCampaignsListOpen = true;
        getEl('panel-campaigns-list')?.classList.remove('hidden');

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
      console.error(err);
      toast(err.message);
    }
  }

  async function simulateCampaignViews(id, viewsDelta) {
    try {
      const json = await sendRequest(`/api/campaigns/${encodeURIComponent(id)}/track-views`, 'POST', {
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
      console.error(err);
      toast(err.message);
    }
  }

  async function topUpCampaignBudget(id, amount) {
    try {
      const json = await sendRequest(`/api/campaigns/${encodeURIComponent(id)}/topup`, 'POST', {
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
      console.error(err);
      toast(err.message);
    }
  }

  async function changeCampaignLifecycle(id, action) {
    try {
      const json = await sendRequest(`/api/campaigns/${encodeURIComponent(id)}/lifecycle`, 'POST', { action });
      if (json && json.success) {
        toast(t('msg_lifecycle_updated'));
        await refreshCampaignsList();
      } else {
        toast((json && json.message) || t('msg_fill_required'));
      }
    } catch (err) {
      console.error(err);
      toast(err.message);
    }
  }

  function resumeCampaignDraft(id) {
    try {
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

      const headingEl = getEl('campaign-wizard-heading');
      if (headingEl) headingEl.textContent = t('wizard_campaign_edit_title');

      const setVal = (elId, val) => {
        const target = getEl(elId);
        if (target) target.value = val;
      };

      setVal('camp-title', camp.title || '');
      setVal('camp-text', camp.adText || '');
      getEl('btn-clear-media')?.classList.toggle('hidden', !state?.mediaData);
      setVal('camp-btn-preset', camp.buttonPreset || 'Open');
      setVal('camp-custom-btn', camp.customButtonText || '');
      getEl('camp-custom-btn-group')?.classList.toggle('hidden', camp.buttonPreset !== 'Custom');
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

      const wizardPanel = getEl('panel-campaign-wizard');
      if (wizardPanel) {
        wizardPanel.classList.remove('hidden');
        wizardPanel.scrollIntoView({ behavior: 'smooth' });
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function deleteCampaign(id) {
    try {
      const json = await sendRequest(`/api/campaigns/${encodeURIComponent(id)}`, 'DELETE');
      if (json && json.success) {
        const state = getState();
        state?.expandedCampaignIds?.delete(id);
        toast(t('msg_campaign_deleted'));
        await refreshCampaignsList();
      } else if (json && json.message) {
        toast(json.message);
      }
    } catch (err) {
      console.error(err);
      toast(err.message);
    }
  }

  function toggleCampaignDetails(id) {
    try {
      const state = getState();
      if (!state || !state.expandedCampaignIds) return;
      if (state.expandedCampaignIds.has(id)) {
        state.expandedCampaignIds.delete(id);
      } else {
        state.expandedCampaignIds.add(id);
      }
      renderCampaigns();
    } catch (err) {
      console.error(err);
    }
  }

  function toggleMarketplaceSelection(id) {
    try {
      const state = getState();
      if (!state || !state.selectedChannelIds) return;
      if (state.selectedChannelIds.has(id)) {
        state.selectedChannelIds.delete(id);
      } else {
        state.selectedChannelIds.add(id);
      }
      renderMarketplaceChannels();
    } catch (err) {
      console.error(err);
    }
  }

  async function toggleMarketplaceFavorite(id) {
    try {
      const json = await sendRequest(`/api/channels/${encodeURIComponent(id)}/favorite`, 'POST');
      if (json && json.success) {
        toast(t('msg_favorite_toggled'));
        await refreshMarketplaceData();
      } else if (json && json.message) {
        toast(json.message);
      }
    } catch (err) {
      console.error(err);
      toast(err.message);
    }
  }

  function renderMarketplaceChannels() {
    const container = getEl('marketplace-channels-list');
    const counterEl = getEl('selected-channels-counter');
    try {
      const state = getState();
      const selectedSet = state?.selectedChannelIds || new Set();
      const channels = state && Array.isArray(state.marketplaceChannels) ? state.marketplaceChannels : [];

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
    } catch (err) {
      console.error(err);
    }
  }

  function renderCampaigns() {
    const container = getEl('campaigns-container');
    if (!container) return;

    try {
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
    } catch (err) {
      console.error(err);
    }
  }

  function bindEvents(ctx) {
    const activeCtx = buildContext(ctx);
    const state = activeCtx.state;

    const budgetInput = getEl('campaignBudgetInput');
    if (budgetInput) {
      budgetInput.addEventListener('input', () => syncOpenTargetingRule(activeCtx));
      syncOpenTargetingRule(activeCtx);
    }

    const estimatorForm = getEl('estimatorForm');
    if (estimatorForm) {
      estimatorForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const resultBox = getEl('estimatorResultBox');
        try {
          const budget = Number(getEl('campaignBudgetInput')?.value || 500);
          const cpm = Number(getEl('estimatorCpmInput')?.value || 2.5);
          const expectedCtrPercent = Number(getEl('estimatorCtrInput')?.value || 3.5);
          const avgConversionValue = Number(getEl('estimatorConvValInput')?.value || 12);

          const res = await activeCtx.apiRequest(
            '/api/campaigns/estimate',
            {
              method: 'POST',
              body: JSON.stringify({ budget, cpm, expectedCtrPercent, avgConversionValue })
            },
            activeCtx
          );
          const est = res.estimate || {};
          if (resultBox) {
            resultBox.innerHTML = `
              <div><strong>الوصول / المشاهدات التقديرية:</strong> ${esc(est.estimatedImpressions ?? 0)}</div>
              <div><strong>النقرات التقديرية:</strong> ${esc(est.estimatedClicks ?? 0)}</div>
              <div><strong>العائد الإجمالي التقديري:</strong> $${Number(est.estimatedGrossReturn || 0).toFixed(2)}</div>
              <div><strong>صافي الربح التقديري:</strong> $${Number(est.estimatedNetProfit || 0).toFixed(2)}</div>
              <div><strong>العائد على الاستثمار ROI:</strong> ${Number(est.estimatedRoiPercent || 0).toFixed(2)}%</div>
              <div><strong>الاستهداف المفتوح (>1000$):</strong> ${est.openTargetingEligible ? 'متاح' : 'غير متاح'}</div>
            `;
          }
        } catch (err) {
          if (resultBox) resultBox.textContent = err.message;
        }
      });
    }

    const campaignForm = getEl('campaignForm');
    if (campaignForm) {
      campaignForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearCampaignNotice();
        try {
          const title = getEl('campaignTitleInput')?.value.trim() || '';
          const budget = Number(getEl('campaignBudgetInput')?.value || 0);
          const targetingMode = getEl('campaignTargetingSelect')?.value || 'specific';

          await activeCtx.apiRequest(
            '/api/campaigns',
            {
              method: 'POST',
              body: JSON.stringify({ userId: state?.userId, title, budget, targetingMode })
            },
            activeCtx
          );
          if (getEl('campaignTitleInput')) getEl('campaignTitleInput').value = '';
          persistDrafts(activeCtx);
          showCampaignNotice('تم إنشاء الحملة وحجز الميزانية بنجاح.', false);
          await Promise.all([refreshCampaigns(activeCtx), refreshWalletData(activeCtx)]);
        } catch (err) {
          showCampaignNotice(err.message, true);
        }
      });
    }
  }

  const CampaignsModule = {
    init() {
      const form = getEl('create-campaign-form');
      if (!form) return;

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          const titleEl = getEl('camp-title-legacy') || getEl('camp-title');
          const textEl = getEl('camp-text-legacy') || getEl('camp-text');
          const urlEl = getEl('camp-url-legacy') || getEl('camp-url');

          const payload = {
            channelId: getEl('camp-channel-select')?.value || '',
            title: titleEl ? titleEl.value : '',
            adText: textEl ? textEl.value : '',
            targetUrl: urlEl ? urlEl.value : ''
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
          console.error(err);
          if (window.UI && typeof window.UI.notify === 'function') {
            window.UI.notify(err.message);
          } else {
            toast(err.message);
          }
        }
      });
    },

    populateChannelSelect(channels) {
      const select = getEl('camp-channel-select');
      if (!select) return;

      try {
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
      } catch (err) {
        console.error(err);
      }
    },

    async load(ctx) {
      const activeCtx = buildContext(ctx);
      if (getEl('campaignsList')) {
        await refreshCampaigns(activeCtx).catch(() => {});
      }

      const listEl = getEl('my-campaigns-list');
      if (!window.Api || typeof window.Api.getCampaigns !== 'function') return;

      try {
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
      } catch (err) {
        console.error(err);
        throw err;
      }
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
    renderCampaigns,
    syncOpenTargetingRule,
    refreshCampaigns,
    bindEvents,
    bindCampaignEvents: bindEvents
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
  window.syncOpenTargetingRule = syncOpenTargetingRule;
  window.refreshCampaigns = refreshCampaigns;
  window.bindCampaignEvents = bindEvents;
})();
