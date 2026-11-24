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

const _urlParams = new URLSearchParams(window.location.search);
const _urlRef = (_urlParams.get('ref') || '').trim();
if (_urlRef) {
  try {
    localStorage.setItem('telega_referred_by', _urlRef);
  } catch (err) {
    console.error(err);
  }
}

function readStoredValue(storage, key, fallback) {
  try {
    const val = storage && typeof storage.getItem === 'function' ? storage.getItem(key) : null;
    return val !== null && val !== undefined && val !== '' ? val : fallback;
  } catch (err) {
    return fallback;
  }
}

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
  expandedCampaignIds: new Set(),
  userId: readStoredValue(window.localStorage, 'telega_user_id', 'user_demo_01'),
  referredBy: readStoredValue(window.localStorage, 'telega_referred_by', ''),
  adminKey: readStoredValue(window.sessionStorage, 'telega_admin_key', ''),
  walletAddress: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
  minDepositUsd: 10,
  minWithdrawalUsd: 30,
  withdrawalFeeUsd: 3,
  withdrawalNetwork: 'USDT - TRC20',
  minSubscribers: 1000,
  openTargetingMinBudget: 1000,
  maintenanceMode: false,
  tickets: [],
  broadcasts: [],
  smartAlerts: []
};

window.SUPPORTED_LANGUAGES = SUPPORTED_LANGUAGES;
window.SUPPORTED_CATEGORIES = SUPPORTED_CATEGORIES;
window.AppState = AppState;

function getTranslateFn() {
  if (window.TelegaI18n && typeof window.TelegaI18n.t === 'function') {
    return (key) => window.TelegaI18n.t(key);
  }
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
  if (window.UI && typeof window.UI.showNotice === 'function') {
    window.UI.showNotice(message);
  } else if (typeof window.showNotice === 'function') {
    window.showNotice(message);
  } else if (typeof window.showToast === 'function') {
    window.showToast(message);
  } else if (window.UI && typeof window.UI.notify === 'function') {
    window.UI.notify(message);
  }
}

function safeOn(elementId, eventName, handler) {
  const element = document.getElementById(elementId);
  if (!element || typeof handler !== 'function') return null;
  element.addEventListener(eventName, handler);
  return element;
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
    if (window.UI && typeof window.UI.renderSmartAlerts === 'function') {
      window.UI.renderSmartAlerts(AppState.smartAlerts);
    } else if (typeof window.renderSmartAlerts === 'function') {
      window.renderSmartAlerts(AppState.smartAlerts);
    }
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

    getContext() {
      return {
        state: AppState,
        el: (id) => document.getElementById(id),
        apiRequest: async (url, options, ctx) => {
          if (window.Api && typeof window.Api.request === 'function') {
            return window.Api.request(url, options, ctx);
          }
          const headers = Object.assign(
            {
              'Content-Type': 'application/json',
              'x-user-id': AppState.userId
            },
            AppState.adminKey ? { 'x-admin-key': AppState.adminKey } : {},
            (options && options.headers) || {}
          );
          const resp = await fetch(url, Object.assign({}, options, { headers }));
          const data = await resp.json().catch(() => ({}));
          if (!resp.ok || data.ok === false || data.success === false) {
            const err = new Error(data.error || data.message || 'Request failed');
            err.status = resp.status;
            err.data = data;
            throw err;
          }
          return data;
        },
        showNotice: (msg, isError) => {
          if (window.UI && typeof window.UI.showNotice === 'function') {
            window.UI.showNotice(msg, isError);
          } else if (typeof window.showNotice === 'function') {
            window.showNotice(msg, isError);
          } else {
            notifyUser(msg);
          }
        },
        clearNotice: () => {
          if (window.UI && typeof window.UI.clearNotice === 'function') {
            window.UI.clearNotice();
          } else if (typeof window.clearNotice === 'function') {
            window.clearNotice();
          }
        },
        renderMaintenanceBanner: (data) => {
          if (window.UI && typeof window.UI.renderMaintenanceBanner === 'function') {
            window.UI.renderMaintenanceBanner(data);
          } else if (typeof window.renderMaintenanceBanner === 'function') {
            window.renderMaintenanceBanner(data);
          }
        },
        syncReferralLink: () => {
          if (window.UI && typeof window.UI.syncReferralLink === 'function') {
            window.UI.syncReferralLink(App.getContext());
          } else if (typeof window.syncReferralLink === 'function') {
            window.syncReferralLink(App.getContext());
          }
        },
        saveDrafts: () => {
          if (window.UI && typeof window.UI.saveDrafts === 'function') {
            window.UI.saveDrafts(App.getContext());
          } else if (typeof window.saveDrafts === 'function') {
            window.saveDrafts(App.getContext());
          }
        },
        restoreDrafts: () => {
          if (window.UI && typeof window.UI.restoreDrafts === 'function') {
            window.UI.restoreDrafts(App.getContext());
          } else if (typeof window.restoreDrafts === 'function') {
            window.restoreDrafts(App.getContext());
          }
        },
        syncOpenTargetingRule: () => {
          if (typeof window.handleBudgetTargetingState === 'function') {
            window.handleBudgetTargetingState();
          }
          if (window.CampaignsModule && typeof window.CampaignsModule.syncOpenTargetingRule === 'function') {
            window.CampaignsModule.syncOpenTargetingRule(App.getContext());
          }
        },
        syncWithdrawalSummary: () => {
          if (window.WalletModule && typeof window.WalletModule.syncWithdrawalSummary === 'function') {
            window.WalletModule.syncWithdrawalSummary(App.getContext());
          } else if (typeof window.syncWithdrawalSummary === 'function') {
            window.syncWithdrawalSummary(App.getContext());
          }
        },
        renderSmartAlerts: (alerts) => {
          AppState.smartAlerts = Array.isArray(alerts) ? alerts : [];
          if (window.UI && typeof window.UI.renderSmartAlerts === 'function') {
            window.UI.renderSmartAlerts(AppState.smartAlerts);
          } else if (typeof window.renderSmartAlerts === 'function') {
            window.renderSmartAlerts(AppState.smartAlerts);
          }
        },
        refreshWallet: async () => {
          if (window.WalletModule && typeof window.WalletModule.refresh === 'function') {
            await window.WalletModule.refresh(App.getContext());
          } else if (typeof window.fetchWallet === 'function') {
            await window.fetchWallet();
          }
          await App.refreshUserData().catch(() => {});
        },
        refreshCampaigns: async () => {
          if (window.CampaignsModule && typeof window.CampaignsModule.load === 'function') {
            await window.CampaignsModule.load(App.getContext());
          } else if (typeof window.fetchCampaigns === 'function') {
            await window.fetchCampaigns();
          }
        },
        refreshChannels: async () => {
          if (window.ChannelsModule && typeof window.ChannelsModule.load === 'function') {
            await window.ChannelsModule.load(App.getContext());
          } else if (typeof window.fetchChannels === 'function') {
            await window.fetchChannels();
          }
        },
        refreshTicketsAndBroadcasts: async () => {
          const ctx = App.getContext();
          if (window.UI && typeof window.UI.refreshTicketsAndBroadcasts === 'function') {
            await window.UI.refreshTicketsAndBroadcasts(ctx);
            return;
          }
          try {
            const [tktRes, bcastRes] = await Promise.all([
              ctx.apiRequest(`/api/tickets?userId=${encodeURIComponent(AppState.userId)}`, undefined, ctx).catch(() => ({ tickets: [] })),
              ctx.apiRequest('/api/broadcasts', undefined, ctx).catch(() => ({ broadcasts: [] }))
            ]);
            AppState.tickets = Array.isArray(tktRes.tickets) ? tktRes.tickets : [];
            AppState.broadcasts = Array.isArray(bcastRes.broadcasts) ? bcastRes.broadcasts : [];
          } catch (err) {
            console.error(err);
          }
        },
        refreshAdminPanel: async () => {
          if (window.AdminModule && typeof window.AdminModule.loadDashboard === 'function') {
            await window.AdminModule.loadDashboard(App.getContext());
          } else if (typeof window.fetchAdminOverview === 'function') {
            await window.fetchAdminOverview();
          }
        }
      };
    },

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
        if (window.TelegaI18n && typeof window.TelegaI18n.applyLanguage === 'function' && typeof window.TelegaI18n.getLang === 'function') {
          window.TelegaI18n.applyLanguage(window.TelegaI18n.getLang());
        } else if (window.I18n) {
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
        const userIdInput = document.getElementById('userIdInput');
        if (userIdInput) userIdInput.value = AppState.userId;

        const adminKeyInput = document.getElementById('adminKeyInput');
        if (adminKeyInput) adminKeyInput.value = AppState.adminKey;

        if (typeof window.populateDropdowns === 'function') {
          window.populateDropdowns();
        }
        updateToggleButtonsText();
      } catch (err) {
        console.error(err);
      }

      const ctx = this.getContext();
      ctx.syncReferralLink();
      ctx.restoreDrafts();
      ctx.syncWithdrawalSummary();

      this.bindNavigation();
      this.bindLanguageToggle();
      this.bindProgressivePanelsAndWizards();

      try {
        if (window.UI && typeof window.UI.bindEvents === 'function') {
          window.UI.bindEvents(ctx);
        }
        if (window.ChannelsModule) {
          if (typeof window.ChannelsModule.init === 'function') window.ChannelsModule.init();
          if (typeof window.ChannelsModule.bindEvents === 'function') window.ChannelsModule.bindEvents(ctx);
        }
        if (window.CampaignsModule) {
          if (typeof window.CampaignsModule.init === 'function') window.CampaignsModule.init();
          if (typeof window.CampaignsModule.bindEvents === 'function') window.CampaignsModule.bindEvents(ctx);
        }
        if (window.WalletModule) {
          if (typeof window.WalletModule.init === 'function') window.WalletModule.init();
          if (typeof window.WalletModule.bindEvents === 'function') window.WalletModule.bindEvents(ctx);
        }
        if (window.AdminModule && typeof window.AdminModule.bindEvents === 'function') {
          window.AdminModule.bindEvents(ctx);
        }
      } catch (err) {
        console.error(err);
      }

      try {
        const cfg = await ctx.apiRequest('/api/config/rules', undefined, ctx).catch(() => null);
        if (cfg) {
          if (typeof cfg.maintenanceMode === 'boolean') {
            AppState.maintenanceMode = cfg.maintenanceMode;
            ctx.renderMaintenanceBanner(cfg);
          }
          if (cfg.rules) {
            AppState.walletAddress = cfg.rules.WALLET_ADDRESS || AppState.walletAddress;
            AppState.minDepositUsd = cfg.rules.MIN_DEPOSIT_USD || AppState.minDepositUsd;
            AppState.minWithdrawalUsd = cfg.rules.MIN_WITHDRAWAL_USD || AppState.minWithdrawalUsd;
            AppState.withdrawalFeeUsd =
              typeof cfg.rules.WITHDRAWAL_FEE_USD === 'number'
                ? cfg.rules.WITHDRAWAL_FEE_USD
                : AppState.withdrawalFeeUsd;
            AppState.withdrawalNetwork = cfg.rules.WITHDRAWAL_NETWORK || AppState.withdrawalNetwork;
            AppState.minSubscribers = cfg.rules.MIN_CHANNEL_SUBSCRIBERS || AppState.minSubscribers;
            AppState.openTargetingMinBudget =
              cfg.rules.OPEN_TARGETING_MIN_BUDGET || AppState.openTargetingMinBudget;
            ctx.syncWithdrawalSummary();
            ctx.syncOpenTargetingRule();
          }
        }

        if (AppState.userId) {
          await ctx.apiRequest(
            '/api/users/init',
            {
              method: 'POST',
              body: JSON.stringify({ userId: AppState.userId, referredBy: AppState.referredBy })
            },
            ctx
          ).catch(() => {});
        }

        if (window.Api && typeof window.Api.getMe === 'function') {
          await this.refreshUserData();
          await Promise.all([
            window.ChannelsModule?.load ? window.ChannelsModule.load(ctx) : Promise.resolve(),
            window.CampaignsModule?.load ? window.CampaignsModule.load(ctx) : Promise.resolve(),
            ctx.refreshTicketsAndBroadcasts()
          ]);
        } else {
          await Promise.all([
            ctx.refreshWallet(),
            ctx.refreshCampaigns(),
            ctx.refreshChannels(),
            ctx.refreshTicketsAndBroadcasts()
          ]);
        }

        if (AppState.adminKey) {
          await ctx.refreshAdminPanel().catch(() => {});
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

            if (target === 'view-admin' && (!this.user || !this.user.isAdmin) && !AppState.adminKey) {
              return;
            }

            if (window.UI && typeof window.UI.switchView === 'function') {
              window.UI.switchView(target);
            }

            const ctx = this.getContext();
            if (target === 'view-channels' && window.ChannelsModule?.load) {
              await window.ChannelsModule.load(ctx);
            }
            if (target === 'view-campaigns' && window.CampaignsModule?.load) {
              await window.CampaignsModule.load(ctx);
            }
            if (target === 'view-admin' && (this.user?.isAdmin || AppState.adminKey)) {
              await ctx.refreshAdminPanel();
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
        if (window.TelegaI18n && typeof window.TelegaI18n.getLang === 'function' && typeof window.TelegaI18n.applyLanguage === 'function') {
          const nextLang = window.TelegaI18n.getLang() === 'ar' ? 'en' : 'ar';
          window.TelegaI18n.applyLanguage(nextLang);
        }

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
