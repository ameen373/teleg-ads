// ==================== UI HELPERS, TABS, WIZARDS & PREVIEW ====================
(function () {
  function translateKey(key, fallback = '') {
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

  function getSupportedLanguages() {
    if (Array.isArray(window.SUPPORTED_LANGUAGES)) return window.SUPPORTED_LANGUAGES;
    if (typeof SUPPORTED_LANGUAGES !== 'undefined' && Array.isArray(SUPPORTED_LANGUAGES)) {
      return SUPPORTED_LANGUAGES;
    }
    return ['English', 'Arabic'];
  }

  function getSupportedCategories() {
    if (Array.isArray(window.SUPPORTED_CATEGORIES)) return window.SUPPORTED_CATEGORIES;
    if (typeof SUPPORTED_CATEGORIES !== 'undefined' && Array.isArray(SUPPORTED_CATEGORIES)) {
      return SUPPORTED_CATEGORIES;
    }
    return [];
  }

  function getAppState() {
    if (window.AppState) return window.AppState;
    if (typeof AppState !== 'undefined') return AppState;
    return null;
  }

  const UI = {
    notify(message) {
      if (window.Telegram?.WebApp?.showAlert) {
        window.Telegram.WebApp.showAlert(message);
      } else {
        alert(message);
      }
    },

    haptic(type = 'light') {
      if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.impactOccurred(type);
      }
    },

    hideLoader() {
      const loader = document.getElementById('loader');
      if (loader) loader.classList.add('hidden');
    },

    switchView(targetId) {
      document.querySelectorAll('.view-section').forEach((sec) => {
        sec.classList.remove('active');
        if (sec.id === 'view-admin' && targetId !== 'view-admin') {
          sec.style.display = 'none';
        }
      });

      const targetSection = document.getElementById(targetId);
      if (targetSection) {
        if (targetId === 'view-admin') {
          targetSection.style.display = 'block';
        }
        targetSection.classList.add('active');
      }

      document.querySelectorAll('.nav-item').forEach((btn) => {
        btn.classList.toggle('active', btn.getAttribute('data-target') === targetId);
      });

      window.scrollTo({ top: 0, behavior: 'smooth' });
      this.haptic('light');
    },

    updateNavBadge(badgeId, count) {
      const badge = document.getElementById(badgeId);
      if (!badge) return;
      const num = Number(count) || 0;
      if (num > 0) {
        badge.textContent = num > 99 ? '99+' : num;
        badge.style.display = 'inline-block';
      } else {
        badge.style.display = 'none';
      }
    },

    renderUserHeader(user) {
      if (!user) return;
      const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || 'User';
      const nameEl = document.getElementById('user-name');
      const idEl = document.getElementById('user-id');
      const avatarEl = document.getElementById('user-avatar');

      if (nameEl) nameEl.textContent = fullName;
      if (idEl) idEl.textContent = `ID: ${user.telegramId}`;

      if (avatarEl) {
        const tgPhoto = window.Telegram?.WebApp?.initDataUnsafe?.user?.photo_url || user.photoUrl;
        if (tgPhoto) {
          avatarEl.innerHTML = `<img src="${this.escapeHTML(tgPhoto)}" alt="${this.escapeHTML(fullName)}" />`;
        } else {
          avatarEl.textContent = fullName.charAt(0).toUpperCase();
        }
      }
    },

    renderHome(user, stats, transactions) {
      if (user) {
        const earningsEl = document.getElementById('home-earnings-balance');
        const adBalanceEl = document.getElementById('home-ad-balance');
        if (earningsEl) earningsEl.textContent = `$${Number(user.balance || 0).toFixed(2)}`;
        if (adBalanceEl) adBalanceEl.textContent = `$${Number(user.adBalance || 0).toFixed(2)}`;
      }

      if (stats) {
        const marketEl = document.getElementById('stat-market-channels');
        const myChannelsEl = document.getElementById('stat-my-channels');
        const myCampaignsEl = document.getElementById('stat-my-campaigns');

        if (marketEl) marketEl.textContent = stats.activeChannels ?? 0;
        if (myChannelsEl) myChannelsEl.textContent = stats.userChannels ?? 0;
        if (myCampaignsEl) myCampaignsEl.textContent = stats.userCampaigns ?? 0;

        // تحديث عدادات الإشعارات الذكية على الكبسولة السفلية
        this.updateNavBadge('nav-badge-channels', stats.userChannels);
        this.updateNavBadge('nav-badge-campaigns', stats.userCampaigns);
      }

      const listEl = document.getElementById('home-transactions-list');
      if (!listEl) return;

      if (!transactions || transactions.length === 0) {
        listEl.innerHTML = `<div class="empty-state">${this.escapeHTML(translateKey('no_data', 'No data'))}</div>`;
        return;
      }

      listEl.innerHTML = transactions.map((tx) => {
        const amountNum = Number(tx.amount || 0);
        const sign = amountNum >= 0 ? '+' : '';
        const safeDetails = this.escapeHTML(tx.details || tx.type || '');
        const safeStatus = this.escapeHTML(tx.status || '');
        const statusLabel = this.escapeHTML(translateKey(`status_${tx.status}`, tx.status || ''));
        const dateText = tx.createdAt ? this.escapeHTML(new Date(tx.createdAt).toLocaleDateString()) : '';

        return `
          <div class="list-item">
            <div class="item-main">
              <span class="item-title">${safeDetails}</span>
              <span class="item-sub">${dateText}</span>
            </div>
            <div style="text-align: end;">
              <div class="item-title">${sign}$${amountNum.toFixed(2)}</div>
              <span class="badge ${safeStatus}">${statusLabel}</span>
            </div>
          </div>
        `;
      }).join('');
    },

    showToast(message) {
      const toast = document.getElementById('toast');
      if (!toast) return;
      toast.textContent = message;
      toast.classList.remove('hidden');
      clearTimeout(toast._timer);
      toast._timer = setTimeout(() => {
        toast.classList.add('hidden');
      }, 3200);
    },

    escapeHTML(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    },

    populateDropdowns() {
      const languages = getSupportedLanguages();
      const categories = getSupportedCategories();

      const langSelects = [
        document.getElementById('ch-language'),
        document.getElementById('camp-language')
      ];
      langSelects.forEach((select) => {
        if (!select) return;
        const prevVal = select.value;
        select.innerHTML = languages
          .map((lang) => `<option value="${this.escapeHTML(lang)}">${this.escapeHTML(lang)}</option>`)
          .join('');
        if (prevVal && languages.includes(prevVal)) {
          select.value = prevVal;
        }
      });

      const catSelects = [
        document.getElementById('ch-category'),
        document.getElementById('camp-category')
      ];
      catSelects.forEach((select) => {
        if (!select) return;
        const prevVal = select.value;
        select.innerHTML = categories
          .map((cat) => `<option value="${this.escapeHTML(cat.value)}">${this.escapeHTML(translateKey(cat.key, cat.value))}</option>`)
          .join('');
        if (prevVal) {
          select.value = prevVal;
        }
      });
    },

    getCategoryLabel(catValue) {
      const categories = getSupportedCategories();
      const found = categories.find((c) => c.value === catValue);
      return found ? translateKey(found.key, catValue) : catValue;
    },

    getApprovalLabel(status) {
      if (status === 'approved') return translateKey('status_approved', status);
      if (status === 'rejected') return translateKey('status_rejected', status);
      return translateKey('status_pending_review', status || 'pending');
    },

    getCampaignStatusLabel(status) {
      if (status === 'active') return translateKey('status_active', status);
      if (status === 'scheduled') return translateKey('status_scheduled', status);
      if (status === 'paused') return translateKey('status_paused', status);
      if (status === 'completed') return translateKey('status_completed', status);
      return translateKey('status_draft', status || 'draft');
    },

    getTxTypeLabel(type) {
      const map = {
        deposit: 'tx_type_deposit',
        withdraw: 'tx_type_withdraw',
        ad_spend: 'tx_type_ad_spend',
        ad_earning: 'tx_type_ad_earning',
        budget_topup: 'tx_type_budget_topup'
      };
      return translateKey(map[type] || type, type);
    },

    setupPriceSelector(pillsContainerId, inputId, onChangeCallback) {
      const container = document.getElementById(pillsContainerId);
      const input = document.getElementById(inputId);
      if (!container || !input) return;

      const pills = container.querySelectorAll('.price-pill');
      pills.forEach((pill) => {
        pill.addEventListener('click', () => {
          pills.forEach((p) => p.classList.remove('selected'));
          pill.classList.add('selected');
          input.value = pill.getAttribute('data-price') || '';
          if (typeof onChangeCallback === 'function') onChangeCallback();
        });
      });

      input.addEventListener('input', () => {
        const val = parseFloat(input.value);
        pills.forEach((p) => {
          if (parseFloat(p.getAttribute('data-price')) === val) {
            p.classList.add('selected');
          } else {
            p.classList.remove('selected');
          }
        });
        if (typeof onChangeCallback === 'function') onChangeCallback();
      });
    },

    switchMainTab(tab) {
      const tabChannels = document.getElementById('tab-channels');
      const tabPromotion = document.getElementById('tab-promotion');
      const secChannels = document.getElementById('section-channels');
      const secPromotion = document.getElementById('section-promotion');

      if (tab === 'channels') {
        tabChannels?.classList.add('active');
        tabPromotion?.classList.remove('active');
        secChannels?.classList.remove('hidden');
        secPromotion?.classList.add('hidden');
      } else {
        tabPromotion?.classList.add('active');
        tabChannels?.classList.remove('active');
        secPromotion?.classList.remove('hidden');
        secChannels?.classList.add('hidden');
      }
    },

    closeAllChannelPanels() {
      [
        'panel-bot-instructions',
        'panel-add-channel',
        'panel-admin-queue',
        'panel-referrals',
        'panel-wallet',
        'panel-reliability'
      ].forEach((id) => {
        document.getElementById(id)?.classList.add('hidden');
      });
    },

    updateChannelWizardStep(step) {
      const state = getAppState();
      if (state) state.channelStep = step;

      for (let i = 1; i <= 3; i++) {
        const stepEl = document.getElementById(`ch-step-${i}`);
        const badgeEl = document.getElementById(`ch-badge-${i}`);
        if (i === step) {
          stepEl?.classList.remove('hidden');
          badgeEl?.classList.add('active');
        } else {
          stepEl?.classList.add('hidden');
          badgeEl?.classList.remove('active');
        }
      }

      document.getElementById('btn-ch-prev')?.classList.toggle('hidden', step === 1);
      document.getElementById('btn-ch-next')?.classList.toggle('hidden', step === 3);
      document.getElementById('btn-ch-save')?.classList.toggle('hidden', step !== 3);
    },

    resetChannelWizard() {
      const nameEl = document.getElementById('ch-name');
      const usernameEl = document.getElementById('ch-username');
      const langEl = document.getElementById('ch-language');
      const catEl = document.getElementById('ch-category');
      const priceEl = document.getElementById('ch-price-input');
      const botAddedEl = document.getElementById('ch-bot-added');

      if (nameEl) nameEl.value = '';
      if (usernameEl) usernameEl.value = '';
      if (langEl) langEl.selectedIndex = 0;
      if (catEl) catEl.selectedIndex = 0;
      if (priceEl) priceEl.value = '1';
      if (botAddedEl) botAddedEl.checked = false;

      document.querySelectorAll('#ch-price-pills .price-pill').forEach((p) => {
        p.classList.toggle('selected', p.getAttribute('data-price') === '1');
      });
      this.updateChannelWizardStep(1);
    },

    handleBudgetTargetingState() {
      const budgetEl = document.getElementById('camp-budget');
      const budgetVal = budgetEl ? (parseFloat(budgetEl.value) || 0) : 0;
      const isOpenTargeting = budgetVal > 1000;
      const banner = document.getElementById('open-targeting-banner');
      const targetedBox = document.getElementById('targeted-filters-box');

      banner?.classList.toggle('hidden', !isOpenTargeting);
      targetedBox?.classList.toggle('hidden', isOpenTargeting);
      return isOpenTargeting;
    },

    getCurrentCTAtext() {
      const presetEl = document.getElementById('camp-btn-preset');
      const preset = presetEl ? presetEl.value : 'Open';
      if (preset === 'Custom') {
        const customEl = document.getElementById('camp-custom-btn');
        const customText = customEl ? customEl.value.trim() : '';
        return customText || 'Open';
      }
      return preset || 'Open';
    },

    updateLivePreview() {
      const state = getAppState();
      const title = document.getElementById('camp-title')?.value.trim() || '';
      const adText = document.getElementById('camp-text')?.value.trim() || '';
      const mediaContainer = document.getElementById('live-preview-media');
      const textContainer = document.getElementById('live-preview-text');
      const ctaEl = document.getElementById('live-preview-cta');

      if (textContainer) {
        textContainer.textContent = [title, adText].filter(Boolean).join('\n\n');
      }

      if (mediaContainer) {
        if (state && state.mediaType === 'photo' && state.mediaData) {
          mediaContainer.innerHTML = `<img src="${this.escapeHTML(state.mediaData)}" alt="Ad Media" class="preview-media-img" />`;
        } else if (state && state.mediaType === 'video' && state.mediaData) {
          mediaContainer.innerHTML = `<video src="${this.escapeHTML(state.mediaData)}" controls class="preview-media-video"></video>`;
        } else {
          mediaContainer.innerHTML = '';
        }
      }

      if (ctaEl) {
        ctaEl.textContent = this.getCurrentCTAtext();
      }
    },

    updateCampaignWizardStep(step) {
      const state = getAppState();
      if (state) state.campaignStep = step;

      for (let i = 1; i <= 3; i++) {
        const stepEl = document.getElementById(`camp-step-${i}`);
        const badgeEl = document.getElementById(`camp-badge-${i}`);
        if (i === step) {
          stepEl?.classList.remove('hidden');
          badgeEl?.classList.add('active');
        } else {
          stepEl?.classList.add('hidden');
          badgeEl?.classList.remove('active');
        }
      }

      document.getElementById('btn-camp-prev')?.classList.toggle('hidden', step === 1);
      document.getElementById('btn-camp-next')?.classList.toggle('hidden', step === 3);
      document.getElementById('btn-camp-publish')?.classList.toggle('hidden', step !== 3);

      if (step === 2) {
        this.handleBudgetTargetingState();
      }
      if (step === 3) {
        this.updateLivePreview();
        if (typeof window.fetchMarketplaceChannels === 'function') {
          window.fetchMarketplaceChannels();
        }
      }
    },

    resetCampaignWizard() {
      const state = getAppState();
      if (state) {
        state.editingCampaignId = null;
        state.selectedChannelIds?.clear();
        state.mediaType = 'none';
        state.mediaData = '';
        state.mediaName = '';
        state.favoritesOnlyFilter = false;
      }

      const headingEl = document.getElementById('campaign-wizard-heading');
      if (headingEl) {
        headingEl.textContent = translateKey('wizard_campaign_title', headingEl.textContent);
      }

      const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val;
      };
      const setIdx = (id, idx) => {
        const el = document.getElementById(id);
        if (el) el.selectedIndex = idx;
      };

      setVal('camp-title', '');
      setVal('camp-text', '');
      setVal('camp-media-file', '');
      document.getElementById('btn-clear-media')?.classList.add('hidden');
      setVal('camp-btn-preset', 'Open');
      setVal('camp-custom-btn', '');
      document.getElementById('camp-custom-btn-group')?.classList.add('hidden');
      setVal('camp-url', '');
      setVal('camp-budget', '50');
      setIdx('camp-language', 0);
      setIdx('camp-category', 0);
      setVal('camp-price-input', '1');
      setVal('camp-schedule-mode', 'immediate');
      setVal('mkt-search-input', '');

      document.querySelectorAll('#camp-price-pills .price-pill').forEach((p) => {
        p.classList.toggle('selected', p.getAttribute('data-price') === '1');
      });

      this.handleBudgetTargetingState();
      this.updateLivePreview();
      this.updateCampaignWizardStep(1);
    }
  };

  window.UI = UI;

  // Global helper functions compatible with direct calls across modules
  window.showToast = (message) => UI.showToast(message);
  window.escapeHTML = (str) => UI.escapeHTML(str);
  window.populateDropdowns = () => UI.populateDropdowns();
  window.getCategoryLabel = (catValue) => UI.getCategoryLabel(catValue);
  window.getApprovalLabel = (status) => UI.getApprovalLabel(status);
  window.getCampaignStatusLabel = (status) => UI.getCampaignStatusLabel(status);
  window.getTxTypeLabel = (type) => UI.getTxTypeLabel(type);
  window.setupPriceSelector = (pillsContainerId, inputId, onChangeCallback) =>
    UI.setupPriceSelector(pillsContainerId, inputId, onChangeCallback);
  window.switchMainTab = (tab) => UI.switchMainTab(tab);
  window.closeAllChannelPanels = () => UI.closeAllChannelPanels();
  window.updateChannelWizardStep = (step) => UI.updateChannelWizardStep(step);
  window.resetChannelWizard = () => UI.resetChannelWizard();
  window.handleBudgetTargetingState = () => UI.handleBudgetTargetingState();
  window.getCurrentCTAtext = () => UI.getCurrentCTAtext();
  window.updateLivePreview = () => UI.updateLivePreview();
  window.updateCampaignWizardStep = (step) => UI.updateCampaignWizardStep(step);
  window.resetCampaignWizard = () => UI.resetCampaignWizard();
})();
