// ==================== APP STATE & CORE CONSTANTS ====================
const SUPPORTED_LANGUAGES = [
  'English',
  'Chinese',
  'Hindi',
  'Spanish',
  'Arabic',
  'French',
  'Bengali',
  'Portuguese',
  'Indonesian',
  'Urdu',
  'Russian',
  'German',
  'Japanese',
  'Nigerian Pidgin',
  'Marathi',
  'Vietnamese',
  'Telugu',
  'Swahili',
  'Turkish'
];

const SUPPORTED_CATEGORIES = [
  { value: 'entertainment', key: 'cat_entertainment' },
  { value: 'news_media', key: 'cat_news_media' },
  { value: 'movies_series', key: 'cat_movies_series' },
  { value: 'fashion_beauty', key: 'cat_fashion_beauty' },
  { value: 'gaming', key: 'cat_gaming' },
  { value: 'art_photography', key: 'cat_art_photography' },
  { value: 'crypto', key: 'cat_crypto' },
  { value: 'technology', key: 'cat_technology' },
  { value: 'education', key: 'cat_education' },
  { value: 'cooking', key: 'cat_cooking' },
  { value: 'health', key: 'cat_health' },
  { value: 'sports', key: 'cat_sports' },
  { value: 'other', key: 'cat_other' }
];

const AppState = {
  channels: [],
  campaigns: [],
  referrals: [],
  marketplaceChannels: [],
  notifications: [],
  publishLogs: [],
  backups: [],
  health: null,
  wallet: {
    advertiserBalance: 0,
    publisherBalance: 0,
    transactions: []
  },
  selectedChannelIds: new Set(),
  favoritesOnlyFilter: false,
  mediaType: 'none',
  mediaData: '',
  mediaName: '',
  channelStep: 1,
  campaignStep: 1,
  editingCampaignId: null,
  isChannelsListOpen: false,
  isCampaignsListOpen: false,
  expandedChannelIds: new Set(),
  editingChannelIds: new Set(),
  expandedCampaignIds: new Set()
};

window.SUPPORTED_LANGUAGES = SUPPORTED_LANGUAGES;
window.SUPPORTED_CATEGORIES = SUPPORTED_CATEGORIES;
window.AppState = AppState;

function getTranslateFn() {
  if (window.I18n && typeof window.I18n.t === 'function') {
    return (key) => window.I18n.t(key);
  }
  if (window.I18N && typeof window.I18N.t === 'function') {
    return (key) => window.I18N.t(key);
  }
  return (key) => key;
}

function notifyUser(message) {
  if (!message) return;
  if (typeof window.showToast === 'function') {
    window.showToast(message);
  } else if (window.UI && typeof window.UI.notify === 'function') {
    window.UI.notify(message);
  }
}

function safeOn(elementId, eventName, handler) {
  const el = document.getElementById(elementId);
  if (!el || typeof handler !== 'function') return null;
  el.addEventListener(eventName, handler);
  return el;
}

function updateToggleButtonsText() {
  const t = getTranslateFn();

  const btnChannelsList = document.getElementById('btn-toggle-channels-list');
  if (btnChannelsList) {
    btnChannelsList.textContent = AppState.isChannelsListOpen
      ? t('btn_hide_channels_list')
      : t('btn_toggle_channels_list');
  }

  const btnCampaignsList = document.getElementById('btn-toggle-campaigns-list');
  if (btnCampaignsList) {
    btnCampaignsList.textContent = AppState.isCampaignsListOpen
      ? t('btn_hide_campaigns')
      : t('btn_view_campaigns');
  }
}

async function refreshAllRenderedViews() {
  try {
    if (typeof window.populateDropdowns === 'function') window.populateDropdowns();
    updateToggleButtonsText();
    if (typeof window.renderChannels === 'function') window.renderChannels();
    if (typeof window.renderAdminQueue === 'function') window.renderAdminQueue();
    if (typeof window.renderReferrals === 'function') window.renderReferrals();
    if (typeof window.renderWallet === 'function') window.renderWallet();
    if (typeof window.renderReliabilityPanel === 'function') window.renderReliabilityPanel();
    if (typeof window.renderMarketplaceChannels === 'function') window.renderMarketplaceChannels();
    if (typeof window.renderCampaigns === 'function') window.renderCampaigns();
  } catch (err) {
    console.error(err);
  }
}

window.updateToggleButtonsText = updateToggleButtonsText;
window.refreshAllRenderedViews = refreshAllRenderedViews;

// ==================== MAIN APPLICATION CONTROLLER ====================
(function () {
  const App = {
    user: null,
    _initialized: false,

    async init() {
      if (this._initialized) return;
      this._initialized = true;

      try {
        const tg = window.Telegram?.WebApp;
        if (tg) {
          if (typeof tg.ready === 'function') tg.ready();
          if (typeof tg.expand === 'function') tg.expand();
        }
      } catch (err) {
        console.error(err);
      }

      try {
        if (window.I18n) {
          const initialLang = typeof window.I18n.detectInitialLanguage === 'function'
            ? window.I18n.detectInitialLanguage()
            : window.I18n.currentLang || 'ar';
          if (typeof window.I18n.setLanguage === 'function') {
            window.I18n.setLanguage(initialLang);
          }
        } else if (window.I18N) {
          if (typeof window.I18N.applyDirection === 'function') window.I18N.applyDirection();
          if (typeof window.I18N.translateDOM === 'function') window.I18N.translateDOM();
        }
      } catch (err) {
        console.error(err);
      }

      try {
        if (typeof window.populateDropdowns === 'function') {
          window.populateDropdowns();
        }
        updateToggleButtonsText();
      } catch (err) {
        console.error(err);
      }

      this.bindNavigation();
      this.bindLanguageToggle();
      this.bindProgressivePanelsAndWizards();

      try {
        if (window.ChannelsModule && typeof window.ChannelsModule.init === 'function') {
          window.ChannelsModule.init();
        }
        if (window.CampaignsModule && typeof window.CampaignsModule.init === 'function') {
          window.CampaignsModule.init();
        }
        if (window.WalletModule && typeof window.WalletModule.init === 'function') {
          window.WalletModule.init();
        }
      } catch (err) {
        console.error(err);
      }

      try {
        if (window.Api && typeof window.Api.getMe === 'function') {
          await this.refreshUserData();
          await Promise.all([
            window.ChannelsModule?.load ? window.ChannelsModule.load() : Promise.resolve(),
            window.CampaignsModule?.load ? window.CampaignsModule.load() : Promise.resolve()
          ]);
        }
      } catch (err) {
        if (window.UI && typeof window.UI.notify === 'function') {
          window.UI.notify(err.message);
        } else {
          notifyUser(err.message);
        }
      } finally {
        if (window.UI && typeof window.UI.hideLoader === 'function') {
          window.UI.hideLoader();
        }
      }
    },

    async refreshUserData() {
      if (!window.Api || typeof window.Api.getMe !== 'function') return;
      try {
        const data = await window.Api.getMe();
        this.user = data?.user || null;
        if (!this.user) return;

        if (window.I18n) {
          const syncedLang = typeof window.I18n.detectInitialLanguage === 'function'
            ? window.I18n.detectInitialLanguage(this.user.languageCode)
            : this.user.languageCode || window.I18n.currentLang;
          if (typeof window.I18n.setLanguage === 'function') {
            window.I18n.setLanguage(syncedLang);
          }
        }

        if (window.UI && typeof window.UI.renderUserHeader === 'function') {
          window.UI.renderUserHeader(this.user);
        }
        if (window.UI && typeof window.UI.renderHome === 'function') {
          window.UI.renderHome(this.user, data.stats, data.transactions);
        }
        if (window.WalletModule && typeof window.WalletModule.render === 'function') {
          window.WalletModule.render(this.user);
        }

        if (
          this.user?.isAdmin === true &&
          window.AdminModule &&
          typeof window.AdminModule.enableAdminAccess === 'function'
        ) {
          window.AdminModule.enableAdminAccess();
        }
      } catch (err) {
        console.error(err);
        throw err;
      }
    },

    bindNavigation() {
      document.querySelectorAll('.nav-item').forEach((btn) => {
        btn.addEventListener('click', async () => {
          try {
            const target = btn.getAttribute('data-target');
            if (!target) return;

            if (target === 'view-admin' && (!this.user || !this.user.isAdmin)) {
              return;
            }

            if (window.UI && typeof window.UI.switchView === 'function') {
              window.UI.switchView(target);
            }

            if (target === 'view-channels' && window.ChannelsModule?.load) {
              await window.ChannelsModule.load();
            }
            if (target === 'view-campaigns' && window.CampaignsModule?.load) {
              await window.CampaignsModule.load();
            }
            if (target === 'view-admin' && this.user?.isAdmin && window.AdminModule?.loadDashboard) {
              await window.AdminModule.loadDashboard();
            }
          } catch (err) {
            console.error(err);
            notifyUser(err.message);
          }
        });
      });
    },

    async handleLanguageSwitch() {
      const t = getTranslateFn();

      try {
        if (window.I18n && typeof window.I18n.setLanguage === 'function') {
          const nextLang = window.I18n.currentLang === 'ar' ? 'en' : 'ar';
          window.I18n.setLanguage(nextLang);
          if (window.UI && typeof window.UI.haptic === 'function') {
            window.UI.haptic('light');
          }
          try {
            if (window.Api && typeof window.Api.updateLanguage === 'function') {
              await window.Api.updateLanguage(nextLang);
              await this.refreshUserData();
            }
          } catch (err) {
            console.error(err);
          }
        } else if (window.I18N && typeof window.I18N.toggleLanguage === 'function') {
          window.I18N.toggleLanguage();
        }

        await refreshAllRenderedViews();
        if (!window.I18n && typeof window.showToast === 'function') {
          window.showToast(t('msg_lang_updated') || 'Language updated');
        }
      } catch (err) {
        console.error(err);
      }
    },

    bindLanguageToggle() {
      const legacyToggleBtn = document.getElementById('lang-toggle-btn');
      if (legacyToggleBtn) {
        legacyToggleBtn.addEventListener('click', () => this.handleLanguageSwitch());
      }

      const newToggleBtn = document.getElementById('btn-lang-toggle');
      if (newToggleBtn) {
        newToggleBtn.addEventListener('click', () => this.handleLanguageSwitch());
      }
    },

    bindProgressivePanelsAndWizards() {
      const t = getTranslateFn();
      const closePanels = () => {
        try {
          if (typeof window.closeAllChannelPanels === 'function') {
            window.closeAllChannelPanels();
          }
        } catch (err) {
          console.error(err);
        }
      };

      try {
        if (typeof window.setupPriceSelector === 'function') {
          window.setupPriceSelector('ch-price-pills', 'ch-price-input', null);
          window.setupPriceSelector('camp-price-pills', 'camp-price-input', () => {
            if (AppState.campaignStep === 3 && typeof window.fetchMarketplaceChannels === 'function') {
              window.fetchMarketplaceChannels();
            }
          });
        }
      } catch (err) {
        console.error(err);
      }

      // Bot Instructions Progressive Toggle
      safeOn('btn-toggle-bot-box', 'click', () => {
        const panel = document.getElementById('panel-bot-instructions');
        if (!panel) return;
        const isHidden = panel.classList.contains('hidden');
        closePanels();
        if (isHidden) panel.classList.remove('hidden');
      });

      safeOn('btn-close-bot-box', 'click', () => {
        document.getElementById('panel-bot-instructions')?.classList.add('hidden');
      });

      safeOn('btn-copy-bot', 'click', async () => {
        try {
          if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            await navigator.clipboard.writeText('@adTelega_bot');
            notifyUser(t('msg_copied'));
          }
        } catch (err) {
          console.error(err);
        }
      });

      // Admin Review Queue Progressive Toggle
      safeOn('btn-toggle-admin-queue', 'click', async () => {
        try {
          const panel = document.getElementById('panel-admin-queue');
          if (!panel) return;
          const isHidden = panel.classList.contains('hidden');
          closePanels();
          if (isHidden) {
            panel.classList.remove('hidden');
            if (typeof window.fetchChannels === 'function') await window.fetchChannels();
          }
        } catch (err) {
          console.error(err);
        }
      });

      safeOn('btn-close-admin-queue', 'click', () => {
        document.getElementById('panel-admin-queue')?.classList.add('hidden');
      });

      // Referrals Progressive Toggle
      safeOn('btn-toggle-referrals', 'click', async () => {
        try {
          const panel = document.getElementById('panel-referrals');
          if (!panel) return;
          const isHidden = panel.classList.contains('hidden');
          closePanels();
          if (isHidden) {
            panel.classList.remove('hidden');
            if (typeof window.fetchReferrals === 'function') await window.fetchReferrals();
          }
        } catch (err) {
          console.error(err);
        }
      });

      safeOn('btn-close-referrals', 'click', () => {
        document.getElementById('panel-referrals')?.classList.add('hidden');
      });

      // Wallets Progressive Toggle
      safeOn('btn-toggle-wallet', 'click', async () => {
        try {
          const panel = document.getElementById('panel-wallet');
          if (!panel) return;
          const isHidden = panel.classList.contains('hidden');
          closePanels();
          if (isHidden) {
            panel.classList.remove('hidden');
            if (typeof window.fetchWallet === 'function') await window.fetchWallet();
          }
        } catch (err) {
          console.error(err);
        }
      });

      safeOn('btn-close-wallet', 'click', () => {
        document.getElementById('panel-wallet')?.classList.add('hidden');
      });

      safeOn('btn-wallet-deposit', 'click', async () => {
        try {
          if (typeof window.handleWalletOperation === 'function') {
            await window.handleWalletOperation('deposit');
          }
        } catch (err) {
          console.error(err);
        }
      });

      safeOn('btn-wallet-withdraw', 'click', async () => {
        try {
          if (typeof window.handleWalletOperation === 'function') {
            await window.handleWalletOperation('withdraw');
          }
        } catch (err) {
          console.error(err);
        }
      });

      // Reliability Progressive Toggle
      safeOn('btn-toggle-reliability', 'click', async () => {
        try {
          const panel = document.getElementById('panel-reliability');
          if (!panel) return;
          const isHidden = panel.classList.contains('hidden');
          closePanels();
          if (isHidden) {
            panel.classList.remove('hidden');
            if (typeof window.fetchReliabilityData === 'function') await window.fetchReliabilityData();
          }
        } catch (err) {
          console.error(err);
        }
      });

      safeOn('btn-close-reliability', 'click', () => {
        document.getElementById('panel-reliability')?.classList.add('hidden');
      });

      safeOn('btn-mark-notifications-read', 'click', async () => {
        try {
          if (typeof window.markNotificationsRead === 'function') {
            await window.markNotificationsRead();
          }
        } catch (err) {
          console.error(err);
        }
      });

      safeOn('btn-run-backup', 'click', async () => {
        try {
          if (typeof window.createManualBackup === 'function') {
            await window.createManualBackup();
          }
        } catch (err) {
          console.error(err);
        }
      });

      // Add Channel Progressive Wizard
      safeOn('btn-open-add-channel', 'click', () => {
        const panel = document.getElementById('panel-add-channel');
        if (!panel) return;
        const isHidden = panel.classList.contains('hidden');
        closePanels();
        if (isHidden) {
          if (typeof window.resetChannelWizard === 'function') window.resetChannelWizard();
          panel.classList.remove('hidden');
        }
      });

      safeOn('btn-cancel-channel-wizard', 'click', () => {
        document.getElementById('panel-add-channel')?.classList.add('hidden');
        if (typeof window.resetChannelWizard === 'function') window.resetChannelWizard();
      });

      safeOn('btn-ch-next', 'click', () => {
        if (AppState.channelStep === 1) {
          const name = document.getElementById('ch-name')?.value.trim() || '';
          const username = document.getElementById('ch-username')?.value.trim() || '';
          if (!name || !username) {
            notifyUser(t('msg_fill_required'));
            return;
          }
          if (username.includes('+') || username.toLowerCase().includes('joinchat')) {
            notifyUser(t('msg_private_rejected'));
            return;
          }
        }
        if (AppState.channelStep < 3 && typeof window.updateChannelWizardStep === 'function') {
          window.updateChannelWizardStep(AppState.channelStep + 1);
        }
      });

      safeOn('btn-ch-prev', 'click', () => {
        if (AppState.channelStep > 1 && typeof window.updateChannelWizardStep === 'function') {
          window.updateChannelWizardStep(AppState.channelStep - 1);
        }
      });

      safeOn('btn-ch-save', 'click', async () => {
        try {
          if (typeof window.saveNewChannel === 'function') await window.saveNewChannel();
        } catch (err) {
          console.error(err);
        }
      });

      // Toggle Channels List (Progressive)
      safeOn('btn-toggle-channels-list', 'click', async () => {
        try {
          AppState.isChannelsListOpen = !AppState.isChannelsListOpen;
          const panel = document.getElementById('panel-channels-list');
          if (panel) panel.classList.toggle('hidden', !AppState.isChannelsListOpen);
          updateToggleButtonsText();
          if (AppState.isChannelsListOpen && typeof window.fetchChannels === 'function') {
            await window.fetchChannels();
          }
        } catch (err) {
          console.error(err);
        }
      });

      // Campaign Listeners
      safeOn('camp-title', 'input', () => {
        if (typeof window.updateLivePreview === 'function') window.updateLivePreview();
      });

      safeOn('camp-text', 'input', () => {
        if (typeof window.updateLivePreview === 'function') window.updateLivePreview();
      });

      safeOn('camp-custom-btn', 'input', () => {
        if (typeof window.updateLivePreview === 'function') window.updateLivePreview();
      });

      safeOn('camp-btn-preset', 'change', (e) => {
        const isCustom = e.target.value === 'Custom';
        document.getElementById('camp-custom-btn-group')?.classList.toggle('hidden', !isCustom);
        if (typeof window.updateLivePreview === 'function') window.updateLivePreview();
      });

      safeOn('camp-media-file', 'change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const isVideo = file.type.startsWith('video/');
        const isImage = file.type.startsWith('image/');
        if (!isVideo && !isImage) return;

        const reader = new FileReader();
        reader.onload = () => {
          AppState.mediaType = isVideo ? 'video' : 'photo';
          AppState.mediaData = String(reader.result || '');
          AppState.mediaName = file.name;
          document.getElementById('btn-clear-media')?.classList.remove('hidden');
          if (typeof window.updateLivePreview === 'function') window.updateLivePreview();
        };
        reader.onerror = () => {
          console.error(reader.error);
        };
        reader.readAsDataURL(file);
      });

      safeOn('btn-clear-media', 'click', () => {
        AppState.mediaType = 'none';
        AppState.mediaData = '';
        AppState.mediaName = '';
        const fileInput = document.getElementById('camp-media-file');
        if (fileInput) fileInput.value = '';
        document.getElementById('btn-clear-media')?.classList.add('hidden');
        if (typeof window.updateLivePreview === 'function') window.updateLivePreview();
      });

      safeOn('camp-budget', 'input', async () => {
        try {
          if (typeof window.handleBudgetTargetingState === 'function') {
            window.handleBudgetTargetingState();
          }
          if (AppState.campaignStep === 3 && typeof window.fetchMarketplaceChannels === 'function') {
            await window.fetchMarketplaceChannels();
          }
        } catch (err) {
          console.error(err);
        }
      });

      safeOn('camp-language', 'change', async () => {
        try {
          if (AppState.campaignStep === 3 && typeof window.fetchMarketplaceChannels === 'function') {
            await window.fetchMarketplaceChannels();
          }
        } catch (err) {
          console.error(err);
        }
      });

      safeOn('camp-category', 'change', async () => {
        try {
          if (AppState.campaignStep === 3 && typeof window.fetchMarketplaceChannels === 'function') {
            await window.fetchMarketplaceChannels();
          }
        } catch (err) {
          console.error(err);
        }
      });

      safeOn('mkt-search-input', 'input', async () => {
        try {
          if (typeof window.fetchMarketplaceChannels === 'function') {
            await window.fetchMarketplaceChannels();
          }
        } catch (err) {
          console.error(err);
        }
      });

      safeOn('btn-mkt-favorites', 'click', async (e) => {
        try {
          AppState.favoritesOnlyFilter = !AppState.favoritesOnlyFilter;
          e.currentTarget.classList.toggle('btn-primary', AppState.favoritesOnlyFilter);
          e.currentTarget.classList.toggle('btn-secondary', !AppState.favoritesOnlyFilter);
          if (typeof window.fetchMarketplaceChannels === 'function') {
            await window.fetchMarketplaceChannels();
          }
        } catch (err) {
          console.error(err);
        }
      });

      // Create Campaign Progressive Wizard
      safeOn('btn-open-create-campaign', 'click', () => {
        const panel = document.getElementById('panel-campaign-wizard');
        if (!panel) return;
        const isHidden = panel.classList.contains('hidden');
        if (isHidden) {
          if (typeof window.resetCampaignWizard === 'function') window.resetCampaignWizard();
          panel.classList.remove('hidden');
        } else {
          panel.classList.add('hidden');
        }
      });

      safeOn('btn-cancel-campaign-wizard', 'click', () => {
        document.getElementById('panel-campaign-wizard')?.classList.add('hidden');
        if (typeof window.resetCampaignWizard === 'function') window.resetCampaignWizard();
      });

      safeOn('btn-camp-next', 'click', () => {
        if (AppState.campaignStep === 1) {
          const title = document.getElementById('camp-title')?.value.trim() || '';
          if (!title) {
            notifyUser(t('msg_fill_required'));
            return;
          }
        }
        if (AppState.campaignStep < 3 && typeof window.updateCampaignWizardStep === 'function') {
          window.updateCampaignWizardStep(AppState.campaignStep + 1);
        }
      });

      safeOn('btn-camp-prev', 'click', () => {
        if (AppState.campaignStep > 1 && typeof window.updateCampaignWizardStep === 'function') {
          window.updateCampaignWizardStep(AppState.campaignStep - 1);
        }
      });

      safeOn('btn-camp-save-draft', 'click', async () => {
        try {
          if (typeof window.submitCampaign === 'function') await window.submitCampaign('draft');
        } catch (err) {
          console.error(err);
        }
      });

      safeOn('btn-camp-publish', 'click', async () => {
        try {
          if (typeof window.submitCampaign === 'function') await window.submitCampaign('active');
        } catch (err) {
          console.error(err);
        }
      });

      // Toggle Campaigns List (Progressive)
      safeOn('btn-toggle-campaigns-list', 'click', async () => {
        try {
          AppState.isCampaignsListOpen = !AppState.isCampaignsListOpen;
          const panel = document.getElementById('panel-campaigns-list');
          if (panel) panel.classList.toggle('hidden', !AppState.isCampaignsListOpen);
          updateToggleButtonsText();
          if (AppState.isCampaignsListOpen && typeof window.fetchCampaigns === 'function') {
            await window.fetchCampaigns();
          }
        } catch (err) {
          console.error(err);
        }
      });
    }
  };

  window.App = App;
  document.addEventListener('DOMContentLoaded', () => App.init());
})();
