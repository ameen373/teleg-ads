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

  function showCampaignNotice(message, isError = false, ctx) {
    if (!message) return;
    try {
      if (ctx && typeof ctx.showNotice === 'function') {
        ctx.showNotice('campaignNotice', message, isError);
      } else if (window.UI && typeof window.UI.showNotice === 'function') {
        window.UI.showNotice('campaignNotice', message, isError, ctx);
      }
    } catch (err) {
      console.error(err);
    }
    toast(message, ctx);
  }

  function clearCampaignNotice(ctx) {
    try {
      if (ctx && typeof ctx.clearNotice === 'function') {
        ctx.clearNotice('campaignNotice');
      } else if (window.UI && typeof window.UI.clearNotice === 'function') {
        window.UI.clearNotice('campaignNotice', ctx);
      }
    } catch (err) {
      console.error(err);
    }
  }

  function persistDrafts(ctx) {
    try {
      if (ctx && typeof ctx.saveDrafts === 'function') {
        ctx.saveDrafts();
      } else if (window.UI && typeof window.UI.saveDrafts === 'function') {
        window.UI.saveDrafts(ctx);
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
      refreshCampaigns: async () => {
        await refreshCampaigns(baseCtx);
      },
      saveDrafts: () => {
        if (window.UI && typeof window.UI.saveDrafts === 'function') {
          window.UI.saveDrafts(baseCtx);
        }
      }
    };
    return baseCtx;
  }

  function getCatLabel(catValue, ctx) {
    if (window.UI && typeof window.UI.getCategoryLabel === 'function') {
      return window.UI.getCategoryLabel(catValue, ctx);
    }
    return catValue || '';
  }

  function getCampStatusLabel(status, ctx) {
    if (window.UI && typeof window.UI.getCampaignStatusLabel === 'function') {
      return window.UI.getCampaignStatusLabel(status, ctx);
    }
    return translateKey(`status_${status}`, status || 'draft', ctx);
  }

  async function refreshWalletData(ctx) {
    try {
      const activeCtx = buildContext(ctx);
      if (activeCtx && typeof activeCtx.refreshWallet === 'function') {
        await activeCtx.refreshWallet();
      } else if (typeof window.refreshWallet === 'function') {
        await window.refreshWallet(activeCtx);
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function refreshMarketplaceData(ctx) {
    try {
      const activeCtx = buildContext(ctx);
      const state = activeCtx.state;
      const params = new URLSearchParams();
      if (state?.userId) params.set('userId', String(state.userId));
      const langVal = getEl('camp-language', activeCtx)?.value;
      const catVal = getEl('camp-category', activeCtx)?.value;
      const maxPriceVal = getEl('camp-price-input', activeCtx)?.value;
      const searchVal = getEl('mkt-search-input', activeCtx)?.value?.trim();
      if (langVal) params.set('language', langVal);
      if (catVal) params.set('category', catVal);
      if (maxPriceVal) params.set('maxPrice', maxPriceVal);
      if (searchVal) params.set('q', searchVal);
      if (state?.favoritesOnlyFilter) params.set('favoritesOnly', '1');

      const queryString = params.toString() ? `?${params.toString()}` : '';
      const data = await activeCtx.apiRequest(`/api/channels/marketplace${queryString}`, { method: 'GET' }, activeCtx);
      if (state && Array.isArray(data?.channels)) {
        state.marketplaceChannels = data.channels;
      }
      renderMarketplaceChannels(activeCtx);
    } catch (err) {
      console.error(err);
    }
  }

  function syncOpenTargetingRule(ctx) {
    try {
      const activeCtx = buildContext(ctx);
      const budgetInput = getEl('campaignBudgetInput', activeCtx);
      const selectEl = getEl('campaignTargetingSelect', activeCtx);
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
    const state = activeCtx.state;
    const container = getEl('campaignsList', activeCtx);

    try {
      const query = state?.userId ? `?userId=${encodeURIComponent(state.userId)}` : '';
      const data = await activeCtx.apiRequest(`/api/campaigns${query}`, { method: 'GET' }, activeCtx);
      const campaigns = Array.isArray(data?.campaigns) ? data.campaigns : [];

      if (state) {
        state.campaigns = campaigns;
      }

      renderCampaigns(activeCtx);
      renderMyCampaignsList(campaigns, activeCtx);

      if (!container) return data;

      if (campaigns.length === 0) {
        container.innerHTML = '<div class="list-row"><span class="stat-label">لا توجد حملات حالياً.</span></div>';
        return data;
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
          clearCampaignNotice(activeCtx);
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
            showCampaignNotice('تم تسجيل صرف 50$ من الميزانية المتبقية.', false, activeCtx);
            await Promise.all([refreshCampaigns(activeCtx), refreshWalletData(activeCtx)]);
          } catch (err) {
            showCampaignNotice(err.message, true, activeCtx);
          }
        });
      });

      container.querySelectorAll('[data-edit-cmp-id]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          clearCampaignNotice(activeCtx);
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
            showCampaignNotice('تم تحديث عنوان الحملة وتوثيقه في سجل التعديلات.', false, activeCtx);
            await refreshCampaigns(activeCtx);
          } catch (err) {
            showCampaignNotice(err.message, true, activeCtx);
          }
        });
      });

      container.querySelectorAll('[data-settle-id]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          clearCampaignNotice(activeCtx);
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
              false,
              activeCtx
            );
            await Promise.all([refreshCampaigns(activeCtx), refreshWalletData(activeCtx)]);
          } catch (err) {
            showCampaignNotice(err.message, true, activeCtx);
          }
        });
      });

      return data;
    } catch (err) {
      console.error(err);
      throw err;
    }
  }

  function renderMyCampaignsList(campaigns, ctx) {
    const activeCtx = buildContext(ctx);
    const listEl = getEl('my-campaigns-list', activeCtx);
    if (!listEl) return;

    try {
      if (!Array.isArray(campaigns) || campaigns.length === 0) {
        listEl.innerHTML = `<div class="empty-state">${esc(translateKey('no_data', 'No data', activeCtx))}</div>`;
        return;
      }

      listEl.innerHTML = campaigns
        .map((camp) => {
          const chName = camp.channelId?.channelUsername
            ? `@${esc(camp.channelId.channelUsername)}`
            : translateKey('channel_label', 'Channel', activeCtx);
          const budgetNum = Number(camp.budget || 0);
          return `
            <div class="list-item">
              <div class="item-main">
                <span class="item-title">${esc(camp.title)} (${chName})</span>
                <span class="item-sub">$${esc(budgetNum.toFixed(2))} • ${esc(camp.targetUrl || '')}</span>
              </div>
              <span class="badge ${esc(camp.status || '')}">${esc(translateKey(`status_${camp.status}`, camp.status || '', activeCtx))}</span>
            </div>
          `;
        })
        .join('');
    } catch (err) {
      console.error(err);
    }
  }

  async function submitCampaign(status, ctx) {
    const activeCtx = buildContext(ctx);
    const state = activeCtx.state;
    const title = getEl('camp-title', activeCtx)?.value.trim() || '';
    const adText = getEl('camp-text', activeCtx)?.value.trim() || '';
    const targetUrl = getEl('camp-url', activeCtx)?.value.trim() || '';
    const buttonPreset = getEl('camp-btn-preset', activeCtx)?.value || 'Open';
    const customButtonText = getEl('camp-custom-btn', activeCtx)?.value.trim() || '';
    const budgetVal = parseFloat(getEl('camp-budget', activeCtx)?.value || '');
    const budget = Number.isFinite(budgetVal) && budgetVal > 0 ? budgetVal : 50;
    const targetLanguage = getEl('camp-language', activeCtx)?.value || 'English';
    const targetCategory = getEl('camp-category', activeCtx)?.value || 'other';
    const maxPricePerPost = parseFloat(getEl('camp-price-input', activeCtx)?.value || '');
    const scheduleMode = getEl('camp-schedule-mode', activeCtx)?.value || 'immediate';
    const selectedChannelIds = state?.selectedChannelIds ? Array.from(state.selectedChannelIds) : [];

    if (!title) {
      toast(translateKey('msg_fill_required', 'Please fill required fields', activeCtx), activeCtx);
      if (window.UI && typeof window.UI.updateCampaignWizardStep === 'function') {
        window.UI.updateCampaignWizardStep(1, activeCtx);
      }
      return;
    }

    if (isNaN(maxPricePerPost) || maxPricePerPost < 1 || maxPricePerPost > 3) {
      toast(translateKey('msg_price_range', 'Price must be between $1 and $3', activeCtx), activeCtx);
      return;
    }

    const payload = {
      userId: state?.userId,
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

      const json = await activeCtx.apiRequest(url, { method, body: JSON.stringify(payload) }, activeCtx);

      if (json && (json.success || json.ok !== false)) {
        toast(
          status === 'draft'
            ? translateKey('msg_draft_saved', 'Draft saved', activeCtx)
            : translateKey('msg_campaign_published', 'Campaign published', activeCtx),
          activeCtx
        );

        if (window.UI && typeof window.UI.resetCampaignWizard === 'function') {
          window.UI.resetCampaignWizard(activeCtx);
        }

        getEl('panel-campaign-wizard', activeCtx)?.classList.add('hidden');
        if (state) state.isCampaignsListOpen = true;
        getEl('panel-campaigns-list', activeCtx)?.classList.remove('hidden');

        if (typeof window.updateToggleButtonsText === 'function') {
          window.updateToggleButtonsText(activeCtx);
        }

        await Promise.all([refreshCampaigns(activeCtx), refreshWalletData(activeCtx)]);
      } else {
        toast((json && json.message) || translateKey('msg_fill_required', 'Error', activeCtx), activeCtx);
      }
    } catch (err) {
      console.error(err);
      toast(err.message, activeCtx);
    }
  }

  async function simulateCampaignViews(id, viewsDelta, ctx) {
    const activeCtx = buildContext(ctx);
    try {
      const json = await activeCtx.apiRequest(
        `/api/campaigns/${encodeURIComponent(id)}/track-views`,
        {
          method: 'POST',
          body: JSON.stringify({
            viewsDelta: Number(viewsDelta) || 1000,
            eventId: `evt_${id}_${Date.now()}`
          })
        },
        activeCtx
      );
      if (json && (json.success || json.ok !== false)) {
        toast(translateKey('msg_views_tracked', 'Views tracked', activeCtx), activeCtx);
        await Promise.all([refreshCampaigns(activeCtx), refreshWalletData(activeCtx)]);
      } else {
        toast((json && json.message) || translateKey('msg_fill_required', 'Error', activeCtx), activeCtx);
      }
    } catch (err) {
      console.error(err);
      toast(err.message, activeCtx);
    }
  }

  async function topUpCampaignBudget(id, amount, ctx) {
    const activeCtx = buildContext(ctx);
    try {
      const json = await activeCtx.apiRequest(
        `/api/campaigns/${encodeURIComponent(id)}/topup`,
        {
          method: 'POST',
          body: JSON.stringify({ amount: Number(amount) || 25 })
        },
        activeCtx
      );
      if (json && (json.success || json.ok !== false)) {
        toast(translateKey('msg_budget_topped_up', 'Budget topped up', activeCtx), activeCtx);
        await Promise.all([refreshCampaigns(activeCtx), refreshWalletData(activeCtx)]);
      } else {
        toast((json && json.message) || translateKey('msg_fill_required', 'Error', activeCtx), activeCtx);
      }
    } catch (err) {
      console.error(err);
      toast(err.message, activeCtx);
    }
  }

  async function changeCampaignLifecycle(id, action, ctx) {
    const activeCtx = buildContext(ctx);
    try {
      const json = await activeCtx.apiRequest(
        `/api/campaigns/${encodeURIComponent(id)}/lifecycle`,
        {
          method: 'POST',
          body: JSON.stringify({ action })
        },
        activeCtx
      );
      if (json && (json.success || json.ok !== false)) {
        toast(translateKey('msg_lifecycle_updated', 'Campaign updated', activeCtx), activeCtx);
        await Promise.all([refreshCampaigns(activeCtx), refreshWalletData(activeCtx)]);
      } else {
        toast((json && json.message) || translateKey('msg_fill_required', 'Error', activeCtx), activeCtx);
      }
    } catch (err) {
      console.error(err);
      toast(err.message, activeCtx);
    }
  }

  function resumeCampaignDraft(id, ctx) {
    try {
      const activeCtx = buildContext(ctx);
      const state = getState(activeCtx);
      const campaigns = state && Array.isArray(state.campaigns) ? state.campaigns : [];
      const camp = campaigns.find((c) => (c._id || c.id) === id);
      if (!camp) return;

      if (state) {
        state.editingCampaignId = camp._id || camp.id;
        state.selectedChannelIds = new Set(camp.selectedChannelIds || []);
        state.mediaType = camp.mediaType || 'none';
        state.mediaData = camp.mediaData || '';
        state.mediaName = camp.mediaName || '';
      }

      const headingEl = getEl('campaign-wizard-heading', activeCtx);
      if (headingEl) headingEl.textContent = translateKey('wizard_campaign_edit_title', 'Edit Campaign', activeCtx);

      const setVal = (elId, val) => {
        const target = getEl(elId, activeCtx);
        if (target) target.value = val;
      };

      setVal('camp-title', camp.title || '');
      setVal('camp-text', camp.adText || '');
      getEl('btn-clear-media', activeCtx)?.classList.toggle('hidden', !state?.mediaData);
      setVal('camp-btn-preset', camp.buttonPreset || 'Open');
      setVal('camp-custom-btn', camp.customButtonText || '');
      getEl('camp-custom-btn-group', activeCtx)?.classList.toggle('hidden', camp.buttonPreset !== 'Custom');
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

      if (window.UI && typeof window.UI.handleBudgetTargetingState === 'function') {
        window.UI.handleBudgetTargetingState(activeCtx);
      }
      if (window.UI && typeof window.UI.updateLivePreview === 'function') {
        window.UI.updateLivePreview(activeCtx);
      }
      if (window.UI && typeof window.UI.updateCampaignWizardStep === 'function') {
        window.UI.updateCampaignWizardStep(1, activeCtx);
      }

      const wizardPanel = getEl('panel-campaign-wizard', activeCtx);
      if (wizardPanel) {
        wizardPanel.classList.remove('hidden');
        wizardPanel.scrollIntoView({ behavior: 'smooth' });
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function deleteCampaign(id, ctx) {
    const activeCtx = buildContext(ctx);
    try {
      const json = await activeCtx.apiRequest(
        `/api/campaigns/${encodeURIComponent(id)}`,
        { method: 'DELETE' },
        activeCtx
      );
      if (json && (json.success || json.ok !== false)) {
        const state = getState(activeCtx);
        state?.expandedCampaignIds?.delete(id);
        toast(translateKey('msg_campaign_deleted', 'Campaign deleted', activeCtx), activeCtx);
        await Promise.all([refreshCampaigns(activeCtx), refreshWalletData(activeCtx)]);
      } else if (json && json.message) {
        toast(json.message, activeCtx);
      }
    } catch (err) {
      console.error(err);
      toast(err.message, activeCtx);
    }
  }

  function toggleCampaignDetails(id, ctx) {
    try {
      const activeCtx = buildContext(ctx);
      const state = getState(activeCtx);
      if (!state || !state.expandedCampaignIds) return;
      if (state.expandedCampaignIds.has(id)) {
        state.expandedCampaignIds.delete(id);
      } else {
        state.expandedCampaignIds.add(id);
      }
      renderCampaigns(activeCtx);
    } catch (err) {
      console.error(err);
    }
  }

  function toggleMarketplaceSelection(id, ctx) {
    try {
      const activeCtx = buildContext(ctx);
      const state = getState(activeCtx);
      if (!state || !state.selectedChannelIds) return;
      if (state.selectedChannelIds.has(id)) {
        state.selectedChannelIds.delete(id);
      } else {
        state.selectedChannelIds.add(id);
      }
      renderMarketplaceChannels(activeCtx);
    } catch (err) {
      console.error(err);
    }
  }

  async function toggleMarketplaceFavorite(id, ctx) {
    const activeCtx = buildContext(ctx);
    try {
      const json = await activeCtx.apiRequest(
        `/api/channels/${encodeURIComponent(id)}/favorite`,
        {
          method: 'POST',
          body: JSON.stringify({ userId: activeCtx.state?.userId })
        },
        activeCtx
      );
      if (json && (json.success || json.ok !== false)) {
        toast(translateKey('msg_favorite_toggled', 'Favorite updated', activeCtx), activeCtx);
        await refreshMarketplaceData(activeCtx);
      } else if (json && json.message) {
        toast(json.message, activeCtx);
      }
    } catch (err) {
      console.error(err);
      toast(err.message, activeCtx);
    }
  }

  function renderMarketplaceChannels(ctx) {
    const activeCtx = buildContext(ctx);
    const container = getEl('marketplace-channels-list', activeCtx);
    const counterEl = getEl('selected-channels-counter', activeCtx);
    try {
      const state = getState(activeCtx);
      const selectedSet = state?.selectedChannelIds || new Set();
      const channels = state && Array.isArray(state.marketplaceChannels) ? state.marketplaceChannels : [];

      if (counterEl) {
        counterEl.textContent = String(selectedSet.size);
      }
      if (!container) return;

      if (!channels.length) {
        container.innerHTML = `<div class="empty-state">${esc(translateKey('no_marketplace_channels', translateKey('no_data', 'No data', activeCtx), activeCtx))}</div>`;
        return;
      }

      container.innerHTML = channels
        .map((ch) => {
          const chKey = ch._id || ch.id;
          const isSelected = selectedSet.has(chKey);
          const initial = ch.name ? esc(ch.name.charAt(0).toUpperCase()) : 'C';
          const safeName = esc(ch.name || ch.title || '');
          const safeId = esc(chKey);
          const avatarHtml = ch.photoUrl
            ? `<img src="${esc(ch.photoUrl)}" alt="${safeName}" class="mkt-avatar" />`
            : `<div class="mkt-avatar">${initial}</div>`;
          const cpm = ch.pricePer1000Views !== undefined ? ch.pricePer1000Views : ch.price ?? ch.pricePerPost ?? 0;

          return `
            <div class="mkt-channel-card">
              <div class="mkt-channel-left">
                ${avatarHtml}
                <div>
                  <div class="item-title">${safeName}</div>
                  <div style="font-size:0.82rem; color:var(--text-muted);">
                    <span>${esc(translateKey('mkt_subscribers', 'Subs:', activeCtx))} <strong>${esc(ch.subscribersCount ?? ch.subscribers ?? 0)}</strong></span> ·
                    <span>${esc(translateKey('mkt_cpm', 'CPM:', activeCtx))} <strong>${esc(cpm)}$</strong></span> ·
                    <span>${esc(translateKey('mkt_lang', 'Lang:', activeCtx))} <strong>${esc(ch.language || '')}</strong></span> ·
                    <span>${esc(translateKey('mkt_cat', 'Cat:', activeCtx))} <strong>${esc(getCatLabel(ch.category, activeCtx))}</strong></span>
                  </div>
                </div>
              </div>
              <div class="detail-actions">
                <button type="button" class="btn btn-secondary btn-sm" data-fav-id="${safeId}">
                  ${esc(ch.isFavorite ? translateKey('btn_favorite_active', 'Favorited', activeCtx) : translateKey('btn_favorite_add', 'Favorite', activeCtx))}
                </button>
                <button type="button" class="btn ${isSelected ? 'btn-success' : 'btn-primary'} btn-sm" data-select-id="${safeId}">
                  ${esc(isSelected ? translateKey('mkt_selected', 'Selected', activeCtx) : translateKey('mkt_select', 'Select', activeCtx))}
                </button>
              </div>
            </div>
          `;
        })
        .join('');

      container.querySelectorAll('[data-fav-id]').forEach((btn) => {
        btn.addEventListener('click', () => toggleMarketplaceFavorite(btn.getAttribute('data-fav-id'), activeCtx));
      });
      container.querySelectorAll('[data-select-id]').forEach((btn) => {
        btn.addEventListener('click', () => toggleMarketplaceSelection(btn.getAttribute('data-select-id'), activeCtx));
      });
    } catch (err) {
      console.error(err);
    }
  }

  function renderCampaigns(ctx) {
    const activeCtx = buildContext(ctx);
    const container = getEl('campaigns-container', activeCtx);
    if (!container) return;

    try {
      const state = getState(activeCtx);
      const campaigns = state && Array.isArray(state.campaigns) ? state.campaigns : [];

      if (!campaigns.length) {
        container.innerHTML = `<div class="empty-state">${esc(translateKey('no_campaigns', translateKey('no_data', 'No data', activeCtx), activeCtx))}</div>`;
        return;
      }

      container.innerHTML = campaigns
        .map((camp) => {
          const campKey = camp._id || camp.id;
          const isExpanded = Boolean(state?.expandedCampaignIds?.has(campKey));
          const isDraft = camp.status === 'draft';
          const isPaused = camp.status === 'paused';
          const isActive = camp.status === 'active';
          const isCompleted = camp.status === 'completed';
          const safeId = esc(campKey);

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
                  <span class="badge ${badgeClass}">${esc(getCampStatusLabel(camp.status, activeCtx))}</span>
                  <span class="badge badge-price">${esc(camp.maxPricePerPost)}$ / 1k</span>
                  ${camp.openTargeting ? '<span class="badge badge-active">🌍</span>' : ''}
                </div>
                <button type="button" class="btn btn-secondary btn-sm" data-camp-toggle="${safeId}">
                  ${esc(isExpanded ? translateKey('btn_hide_details', 'Hide', activeCtx) : translateKey('btn_show_details', 'Details', activeCtx))}
                </button>
              </div>

              ${
                isExpanded
                  ? `
                <div class="item-details">
                  <div class="detail-grid">
                    <div class="detail-row"><span class="label">${esc(translateKey('stat_views', 'Views:', activeCtx))}</span><strong>${esc(camp.totalViews || 0)}</strong></div>
                    <div class="detail-row"><span class="label">${esc(translateKey('stat_spent', 'Spent:', activeCtx))}</span><strong>${esc(spentNum.toFixed(2))}$</strong></div>
                    <div class="detail-row"><span class="label">${esc(translateKey('stat_remaining', 'Remaining:', activeCtx))}</span><strong>${esc(remainingNum.toFixed(2))}$</strong></div>
                    <div class="detail-row"><span class="label">${esc(translateKey('detail_budget', 'Budget:', activeCtx))}</span><strong>${esc(budgetNum.toFixed(2))}$</strong></div>
                    <div class="detail-row"><span class="label">${esc(translateKey('detail_language', 'Language:', activeCtx))}</span><strong>${esc(camp.targetLanguage || '')}</strong></div>
                    <div class="detail-row"><span class="label">${esc(translateKey('detail_category', 'Category:', activeCtx))}</span><strong>${esc(getCatLabel(camp.targetCategory, activeCtx))}</strong></div>
                    <div class="detail-row"><span class="label">${esc(translateKey('detail_max_price', 'Max Price:', activeCtx))}</span><strong>${esc(camp.maxPricePerPost)}$</strong></div>
                    <div class="detail-row"><span class="label">${esc(translateKey('detail_schedule', 'Schedule:', activeCtx))}</span><strong>${esc(
                      camp.scheduleMode === 'peak'
                        ? translateKey('opt_schedule_peak', 'Peak', activeCtx)
                        : translateKey('opt_schedule_immediate', 'Immediate', activeCtx)
                    )}</strong></div>
                    <div class="detail-row"><span class="label">${esc(translateKey('detail_published_channels', 'Channels:', activeCtx))}</span><strong>${pubList}</strong></div>
                  </div>
                  ${
                    camp.adText
                      ? `<p style="margin-bottom:8px;"><span style="color:var(--text-muted);">${esc(translateKey('detail_ad_text', 'Text:', activeCtx))}</span> ${esc(camp.adText)}</p>`
                      : ''
                  }
                  <p style="margin-bottom:8px; font-size:0.84rem; color:var(--primary);">
                    <strong>Powered by Telega.ads</strong> · ${esc(translateKey('policy_locked_badge', 'Verified', activeCtx))}
                  </p>
                  ${
                    camp.targetUrl
                      ? `<p style="margin-bottom:10px;"><span style="color:var(--text-muted);">${esc(translateKey('detail_target_url', 'URL:', activeCtx))}</span> <span dir="ltr">${esc(camp.targetUrl)}</span></p>`
                      : ''
                  }
                  <div class="detail-actions">
                    ${
                      isDraft
                        ? `<button type="button" class="btn btn-warning btn-sm" data-resume-id="${safeId}">${esc(translateKey('btn_continue_draft', 'Continue', activeCtx))}</button>`
                        : ''
                    }
                    ${
                      isActive
                        ? `<button type="button" class="btn btn-primary btn-sm" data-sim-views-id="${safeId}">${esc(translateKey('btn_simulate_views', '+1000 Views', activeCtx))}</button>`
                        : ''
                    }
                    ${
                      isActive
                        ? `<button type="button" class="btn btn-warning btn-sm" data-lifecycle-id="${safeId}" data-lifecycle-action="pause">${esc(translateKey('btn_pause_campaign', 'Pause', activeCtx))}</button>`
                        : ''
                    }
                    ${
                      isPaused && !isCompleted
                        ? `<button type="button" class="btn btn-success btn-sm" data-lifecycle-id="${safeId}" data-lifecycle-action="resume">${esc(translateKey('btn_resume_campaign', 'Resume', activeCtx))}</button>`
                        : ''
                    }
                    ${
                      !isDraft && !isCompleted
                        ? `<button type="button" class="btn btn-secondary btn-sm" data-lifecycle-id="${safeId}" data-lifecycle-action="complete">${esc(translateKey('btn_complete_campaign', 'Complete', activeCtx))}</button>`
                        : ''
                    }
                    ${
                      !isDraft
                        ? `<button type="button" class="btn btn-secondary btn-sm" data-topup-id="${safeId}">${esc(translateKey('btn_topup_budget', 'Top Up', activeCtx))} (+25$)</button>`
                        : ''
                    }
                    <button type="button" class="btn btn-danger btn-sm" data-del-camp-id="${safeId}">${esc(translateKey('btn_delete', 'Delete', activeCtx))}</button>
                  </div>
                </div>
              `
                  : ''
              }
            </div>
          `;
        })
        .join('');

      container.querySelectorAll('[data-camp-toggle]').forEach((btn) => {
        btn.addEventListener('click', () => toggleCampaignDetails(btn.getAttribute('data-camp-toggle'), activeCtx));
      });
      container.querySelectorAll('[data-resume-id]').forEach((btn) => {
        btn.addEventListener('click', () => resumeCampaignDraft(btn.getAttribute('data-resume-id'), activeCtx));
      });
      container.querySelectorAll('[data-sim-views-id]').forEach((btn) => {
        btn.addEventListener('click', () => simulateCampaignViews(btn.getAttribute('data-sim-views-id'), 1000, activeCtx));
      });
      container.querySelectorAll('[data-lifecycle-id]').forEach((btn) => {
        btn.addEventListener('click', () =>
          changeCampaignLifecycle(btn.getAttribute('data-lifecycle-id'), btn.getAttribute('data-lifecycle-action'), activeCtx)
        );
      });
      container.querySelectorAll('[data-topup-id]').forEach((btn) => {
        btn.addEventListener('click', () => topUpCampaignBudget(btn.getAttribute('data-topup-id'), 25, activeCtx));
      });
      container.querySelectorAll('[data-del-camp-id]').forEach((btn) => {
        btn.addEventListener('click', () => deleteCampaign(btn.getAttribute('data-del-camp-id'), activeCtx));
      });
    } catch (err) {
      console.error(err);
    }
  }

  function bindEvents(ctx) {
    const activeCtx = buildContext(ctx);
    const state = activeCtx.state;

    const budgetInput = getEl('campaignBudgetInput', activeCtx);
    if (budgetInput) {
      budgetInput.addEventListener('input', () => syncOpenTargetingRule(activeCtx));
      syncOpenTargetingRule(activeCtx);
    }

    const estimatorForm = getEl('estimatorForm', activeCtx);
    if (estimatorForm) {
      estimatorForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const resultBox = getEl('estimatorResultBox', activeCtx);
        try {
          const budget = Number(getEl('campaignBudgetInput', activeCtx)?.value || 500);
          const cpm = Number(getEl('estimatorCpmInput', activeCtx)?.value || 2.5);
          const expectedCtrPercent = Number(getEl('estimatorCtrInput', activeCtx)?.value || 3.5);
          const avgConversionValue = Number(getEl('estimatorConvValInput', activeCtx)?.value || 12);

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

    const campaignForm = getEl('campaignForm', activeCtx);
    if (campaignForm) {
      campaignForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearCampaignNotice(activeCtx);
        try {
          const title = getEl('campaignTitleInput', activeCtx)?.value.trim() || '';
          const budget = Number(getEl('campaignBudgetInput', activeCtx)?.value || 0);
          const targetingMode = getEl('campaignTargetingSelect', activeCtx)?.value || 'specific';

          await activeCtx.apiRequest(
            '/api/campaigns',
            {
              method: 'POST',
              body: JSON.stringify({ userId: state?.userId, title, budget, targetingMode })
            },
            activeCtx
          );
          if (getEl('campaignTitleInput', activeCtx)) getEl('campaignTitleInput', activeCtx).value = '';
          persistDrafts(activeCtx);
          showCampaignNotice('تم إنشاء الحملة وحجز الميزانية بنجاح.', false, activeCtx);
          await Promise.all([refreshCampaigns(activeCtx), refreshWalletData(activeCtx)]);
        } catch (err) {
          showCampaignNotice(err.message, true, activeCtx);
        }
      });
    }
  }

  const CampaignsModule = {
    init(ctx) {
      const activeCtx = buildContext(ctx);
      const state = activeCtx.state;
      const form = getEl('create-campaign-form', activeCtx);
      if (!form) return;

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          const titleEl = getEl('camp-title-legacy', activeCtx) || getEl('camp-title', activeCtx);
          const textEl = getEl('camp-text-legacy', activeCtx) || getEl('camp-text', activeCtx);
          const urlEl = getEl('camp-url-legacy', activeCtx) || getEl('camp-url', activeCtx);

          const payload = {
            userId: state?.userId,
            channelId: getEl('camp-channel-select', activeCtx)?.value || '',
            title: titleEl ? titleEl.value : '',
            adText: textEl ? textEl.value : '',
            targetUrl: urlEl ? urlEl.value : ''
          };
          await activeCtx.apiRequest(
            '/api/campaigns',
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
          await Promise.all([refreshCampaigns(activeCtx), refreshWalletData(activeCtx)]);
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

    populateChannelSelect(channels, ctx) {
      const activeCtx = buildContext(ctx);
      const select = getEl('camp-channel-select', activeCtx);
      if (!select) return;

      try {
        const placeholder = `<option value="">${esc(translateKey('select_channel', 'Select channel', activeCtx))}</option>`;
        if (!channels || channels.length === 0) {
          select.innerHTML = placeholder;
          return;
        }
        const options = channels
          .map(
            (ch) =>
              `<option value="${esc(ch._id || ch.id)}">${esc(ch.title || ch.name || '')} (@${esc(String(ch.channelUsername || ch.username || '').replace(/^@/, ''))}) - $${esc(ch.pricePerPost ?? ch.price ?? 0)}</option>`
          )
          .join('');
        select.innerHTML = placeholder + options;
      } catch (err) {
        console.error(err);
      }
    },

    async load(ctx) {
      const activeCtx = buildContext(ctx);
      await Promise.all([refreshCampaigns(activeCtx), refreshMarketplaceData(activeCtx).catch(() => {})]);
    },

    async loadMarketplace(ctx) {
      await refreshMarketplaceData(ctx);
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
  window.refreshCampaigns = (ctx) => refreshCampaigns(ctx);
  window.bindCampaignEvents = (ctx) => bindEvents(ctx);
})();
