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

function getTranslateFn(ctx) {
  if (ctx && typeof ctx.t === 'function') {
    return (key) => ctx.t(key, ctx);
  }
  if (window.TelegaI18n && typeof window.TelegaI18n.t === 'function') {
    return (key) => window.TelegaI18n.t(key, ctx);
  }
  if (window.I18N && typeof window.I18N.t === 'function') {
    return (key) => window.I18N.t(key, ctx);
  }
  return (key) => key;
}

function notifyUser(message, ctx) {
  if (!message) return;
  if (window.UI && typeof window.UI.showToast === 'function') {
    window.UI.showToast(message, ctx);
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

function updateToggleButtonsText(ctx) {
  const t = getTranslateFn(ctx);

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

async function refreshAllRenderedViews(ctx) {
  try {
    if (window.UI && typeof window.UI.populateDropdowns === 'function') {
      window.UI.populateDropdowns(ctx);
    }
    updateToggleButtonsText(ctx);
    if (window.ChannelsModule && typeof window.ChannelsModule.render === 'function') {
      window.ChannelsModule.render(ctx);
    }
    if (window.CampaignsModule && typeof window.CampaignsModule.render === 'function') {
      window.CampaignsModule.render(ctx);
    }
    if (window.WalletModule && typeof window.WalletModule.render === 'function') {
      window.WalletModule.render(ctx);
    }
    if (window.UI && typeof window.UI.renderSmartAlerts === 'function') {
      window.UI.renderSmartAlerts(AppState.smartAlerts, ctx);
    }
  } catch (err) {
    console.error(err);
  }
}

window.updateToggleButtonsText = updateToggleButtonsText;
window.refreshAllRenderedViews = refreshAllRenderedViews;

(function () {
  const App = {
    user: null,
    _initialized: false,

    getContext() {
      const ctx = {
        state: AppState,
        el: (id) => document.getElementById(id),
        t: (key) => getTranslateFn(ctx)(key),
        apiRequest: async (url, options = {}) => {
          const headers = Object.assign(
            {
              'Content-Type': 'application/json',
              'x-user-id': String(AppState.userId || '')
            },
            AppState.adminKey ? { 'x-admin-key': String(AppState.adminKey) } : {},
            options && options.headers ? options.headers : {}
          );
          const resp = await fetch(url, Object.assign({}, options, { headers }));
          const data = await resp.json().catch(() => ({}));
          if (typeof data.maintenanceMode === 'boolean') {
            ctx.renderMaintenanceBanner(data);
          }
          if (!resp.ok || data.ok === false || data.success === false) {
            const err = new Error(data.error || data.message || 'Request failed');
            err.status = resp.status;
            err.data = data;
            throw err;
          }
          return data;
        },
        showNotice: (containerId, msg, isError) => {
          if (window.UI && typeof window.UI.showNotice === 'function') {
            window.UI.showNotice(containerId, msg, isError, ctx);
          } else {
            notifyUser(msg, ctx);
          }
        },
        clearNotice: (containerId) => {
          if (window.UI && typeof window.UI.clearNotice === 'function') {
            window.UI.clearNotice(containerId, ctx);
          }
        },
        renderMaintenanceBanner: (data) => {
          if (window.UI && typeof window.UI.renderMaintenanceBanner === 'function') {
            window.UI.renderMaintenanceBanner(data, undefined, ctx);
          }
        },
        syncReferralLink: () => {
          if (window.UI && typeof window.UI.syncReferralLink === 'function') {
            window.UI.syncReferralLink(ctx);
          }
        },
        saveDrafts: () => {
          if (window.UI && typeof window.UI.saveDrafts === 'function') {
            window.UI.saveDrafts(ctx);
          }
        },
        restoreDrafts: () => {
          if (window.UI && typeof window.UI.restoreDrafts === 'function') {
            window.UI.restoreDrafts(ctx);
          }
        },
        syncOpenTargetingRule: () => {
          if (window.UI && typeof window.UI.handleBudgetTargetingState === 'function') {
            window.UI.handleBudgetTargetingState(ctx);
          }
          if (window.CampaignsModule && typeof window.CampaignsModule.syncOpenTargetingRule === 'function') {
            window.CampaignsModule.syncOpenTargetingRule(ctx);
          }
        },
        syncWithdrawalSummary: () => {
          if (window.WalletModule && typeof window.WalletModule.syncWithdrawalSummary === 'function') {
            window.WalletModule.syncWithdrawalSummary(ctx);
          }
        },
        renderSmartAlerts: (alerts) => {
          AppState.smartAlerts = Array.isArray(alerts) ? alerts : [];
          if (window.UI && typeof window.UI.renderSmartAlerts === 'function') {
            window.UI.renderSmartAlerts(AppState.smartAlerts, ctx);
          }
        },
        refreshWallet: async () => {
          if (window.WalletModule && typeof window.WalletModule.refresh === 'function') {
            await window.WalletModule.refresh(ctx);
          }
          await App.refreshUserData(ctx).catch(() => {});
        },
        refreshCampaigns: async () => {
          if (window.CampaignsModule && typeof window.CampaignsModule.load === 'function') {
            await window.CampaignsModule.load(ctx);
          }
        },
        refreshChannels: async () => {
          if (window.ChannelsModule && typeof window.ChannelsModule.load === 'function') {
            await window.ChannelsModule.load(ctx);
          }
        },
        refreshTicketsAndBroadcasts: async () => {
          if (window.UI && typeof window.UI.refreshTicketsAndBroadcasts === 'function') {
            await window.UI.refreshTicketsAndBroadcasts(ctx);
            return;
          }
          try {
            const [tktRes, bcastRes] = await Promise.all([
              ctx.apiRequest(`/api/tickets?userId=${encodeURIComponent(AppState.userId)}`).catch(() => ({ tickets: [] })),
              ctx.apiRequest('/api/broadcasts').catch(() => ({ broadcasts: [] }))
            ]);
            AppState.tickets = Array.isArray(tktRes.tickets) ? tktRes.tickets : [];
            AppState.broadcasts = Array.isArray(bcastRes.broadcasts) ? bcastRes.broadcasts : [];
          } catch (err) {
            console.error(err);
          }
        },
        refreshAdminPanel: async () => {
          if (window.AdminModule && typeof window.AdminModule.loadDashboard === 'function') {
            await window.AdminModule.loadDashboard(ctx);
          }
        }
      };
      return ctx;
    },

    async init() {
      if (this._initialized) return;
      this._initialized = true;

      const ctx = this.getContext();

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
          window.TelegaI18n.applyLanguage(window.TelegaI18n.getLang(ctx), ctx);
        } else if (window.I18N) {
          const initialLang = typeof window.I18N.detectInitialLanguage === 'function'
            ? window.I18N.detectInitialLanguage(undefined, ctx)
            : window.I18N.currentLang || 'ar';
          if (typeof window.I18N.setLanguage === 'function') {
            window.I18N.setLanguage(initialLang, ctx);
          }
        }
      } catch (err) {
        console.error(err);
      }

      try {
        const userIdInput = document.getElementById('userIdInput');
        if (userIdInput) userIdInput.value = AppState.userId;

        const adminKeyInput = document.getElementById('adminKeyInput');
        if (adminKeyInput) adminKeyInput.value = AppState.adminKey;

        if (window.UI && typeof window.UI.populateDropdowns === 'function') {
          window.UI.populateDropdowns(ctx);
        }
        updateToggleButtonsText(ctx);
      } catch (err) {
        console.error(err);
      }

      ctx.syncReferralLink();
      ctx.restoreDrafts();
      ctx.syncWithdrawalSummary();

      this.bindNavigation(ctx);
      this.bindLanguageToggle(ctx);
      this.bindProgressivePanelsAndWizards(ctx);

      try {
        if (window.UI && typeof window.UI.bindEvents === 'function') {
          window.UI.bindEvents(ctx);
        }
        if (window.ChannelsModule) {
          if (typeof window.ChannelsModule.init === 'function') window.ChannelsModule.init(ctx);
          if (typeof window.ChannelsModule.bindEvents === 'function') window.ChannelsModule.bindEvents(ctx);
        }
        if (window.CampaignsModule) {
          if (typeof window.CampaignsModule.init === 'function') window.CampaignsModule.init(ctx);
          if (typeof window.CampaignsModule.bindEvents === 'function') window.CampaignsModule.bindEvents(ctx);
        }
        if (window.WalletModule) {
          if (typeof window.WalletModule.init === 'function') window.WalletModule.init(ctx);
          if (typeof window.WalletModule.bindEvents === 'function') window.WalletModule.bindEvents(ctx);
        }
        if (window.AdminModule && typeof window.AdminModule.bindEvents === 'function') {
          window.AdminModule.bindEvents(ctx);
        }
      } catch (err) {
        console.error(err);
      }

      try {
        const cfg = await ctx.apiRequest('/api/config/rules').catch(() => null);
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
          await ctx.apiRequest('/api/users/init', {
            method: 'POST',
            body: JSON.stringify({ userId: AppState.userId, referredBy: AppState.referredBy })
          }).catch(() => {});
        }

        await Promise.all([
          this.refreshUserData(ctx).catch(() => {}),
          ctx.refreshWallet(),
          ctx.refreshCampaigns(),
          ctx.refreshChannels(),
          ctx.refreshTicketsAndBroadcasts()
        ]);

        if (AppState.adminKey) {
          await ctx.refreshAdminPanel().catch(() => {});
        }
      } catch (err) {
        notifyUser(err.message, ctx);
      } finally {
        if (window.UI && typeof window.UI.hideLoader === 'function') {
          window.UI.hideLoader(ctx);
        }
      }
    },

    async refreshUserData(ctx) {
      const activeCtx = ctx || this.getContext();
      try {
        const data = await activeCtx.apiRequest('/api/me');
        this.user = data?.user || null;
        if (!this.user) return;

        if (window.I18N && this.user.languageCode) {
          const syncedLang = typeof window.I18N.detectInitialLanguage === 'function'
            ? window.I18N.detectInitialLanguage(this.user.languageCode, activeCtx)
            : this.user.languageCode;
          if (typeof window.I18N.setLanguage === 'function') {
            window.I18N.setLanguage(syncedLang, activeCtx);
          }
        }

        if (window.UI && typeof window.UI.renderUserHeader === 'function') {
          window.UI.renderUserHeader(this.user, activeCtx);
        }
        if (window.WalletModule && typeof window.WalletModule.render === 'function') {
          window.WalletModule.render(activeCtx);
        }

        if (
          this.user?.isAdmin === true &&
          window.AdminModule &&
          typeof window.AdminModule.enableAdminAccess === 'function'
        ) {
          window.AdminModule.enableAdminAccess(activeCtx);
        }
      } catch (err) {
        console.error(err);
        throw err;
      }
    },

    bindNavigation(ctx) {
      const activeCtx = ctx || this.getContext();
      document.querySelectorAll('.nav-item').forEach((btn) => {
        btn.addEventListener('click', async () => {
          try {
            const target = btn.getAttribute('data-target');
            if (!target) return;

            if (target === 'view-admin' && (!this.user || !this.user.isAdmin) && !AppState.adminKey) {
              return;
            }

            if (window.UI && typeof window.UI.switchView === 'function') {
              window.UI.switchView(target, activeCtx);
            }

            if (target === 'view-channels') {
              await activeCtx.refreshChannels();
            }
            if (target === 'view-campaigns') {
              await activeCtx.refreshCampaigns();
            }
            if (target === 'view-admin' && (this.user?.isAdmin || AppState.adminKey)) {
              await activeCtx.refreshAdminPanel();
            }
          } catch (err) {
            console.error(err);
            notifyUser(err.message, activeCtx);
          }
        });
      });
    },

    async handleLanguageSwitch(ctx) {
      const activeCtx = ctx || this.getContext();
      const t = getTranslateFn(activeCtx);

      try {
        let nextLang = 'ar';
        if (window.TelegaI18n && typeof window.TelegaI18n.getLang === 'function' && typeof window.TelegaI18n.applyLanguage === 'function') {
          nextLang = window.TelegaI18n.getLang(activeCtx) === 'ar' ? 'en' : 'ar';
          window.TelegaI18n.applyLanguage(nextLang, activeCtx);
        } else if (window.I18N && typeof window.I18N.toggleLanguage === 'function') {
          nextLang = window.I18N.toggleLanguage(activeCtx);
        }

        if (window.UI && typeof window.UI.haptic === 'function') {
          window.UI.haptic('light');
        }

        try {
          await activeCtx.apiRequest('/api/user/language', {
            method: 'POST',
            body: JSON.stringify({ lang: nextLang })
          });
        } catch (err) {
          console.error(err);
        }

        await refreshAllRenderedViews(activeCtx);
        notifyUser(t('msg_lang_updated') || 'Language updated', activeCtx);
      } catch (err) {
        console.error(err);
      }
    },

    bindLanguageToggle(ctx) {
      const activeCtx = ctx || this.getContext();
      const legacyToggleBtn = document.getElementById('lang-toggle-btn');
      if (legacyToggleBtn) {
        legacyToggleBtn.addEventListener('click', () => this.handleLanguageSwitch(activeCtx));
      }

      const newToggleBtn = document.getElementById('btn-lang-toggle');
      if (newToggleBtn) {
        newToggleBtn.addEventListener('click', () => this.handleLanguageSwitch(activeCtx));
      }
    },

    bindProgressivePanelsAndWizards(ctx) {
      const activeCtx = ctx || this.getContext();
      const t = getTranslateFn(activeCtx);
      const closePanels = () => {
        try {
          if (window.UI && typeof window.UI.closeAllChannelPanels === 'function') {
            window.UI.closeAllChannelPanels(activeCtx);
          }
        } catch (err) {
          console.error(err);
        }
      };

      try {
        if (window.UI && typeof window.UI.setupPriceSelector === 'function') {
          window.UI.setupPriceSelector('ch-price-pills', 'ch-price-input', null, activeCtx);
          window.UI.setupPriceSelector(
            'camp-price-pills',
            'camp-price-input',
            () => {
              if (AppState.campaignStep === 3 && window.CampaignsModule?.loadMarketplace) {
                window.CampaignsModule.loadMarketplace(activeCtx);
              }
            },
            activeCtx
          );
        }
      } catch (err) {
        console.error(err);
      }

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
            notifyUser(t('msg_copied'), activeCtx);
          }
        } catch (err) {
          console.error(err);
        }
      });

      safeOn('btn-toggle-admin-queue', 'click', async () => {
        try {
          const panel = document.getElementById('panel-admin-queue');
          if (!panel) return;
          const isHidden = panel.classList.contains('hidden');
          closePanels();
          if (isHidden) {
            panel.classList.remove('hidden');
            await activeCtx.refreshChannels();
          }
        } catch (err) {
          console.error(err);
        }
      });

      safeOn('btn-close-admin-queue', 'click', () => {
        document.getElementById('panel-admin-queue')?.classList.add('hidden');
      });

      safeOn('btn-toggle-referrals', 'click', async () => {
        try {
          const panel = document.getElementById('panel-referrals');
          if (!panel) return;
          const isHidden = panel.classList.contains('hidden');
          closePanels();
          if (isHidden) {
            panel.classList.remove('hidden');
            if (window.ChannelsModule && typeof window.ChannelsModule.loadReferrals === 'function') {
              await window.ChannelsModule.loadReferrals(activeCtx);
            }
          }
        } catch (err) {
          console.error(err);
        }
      });

      safeOn('btn-close-referrals', 'click', () => {
        document.getElementById('panel-referrals')?.classList.add('hidden');
      });

      safeOn('btn-toggle-wallet', 'click', async () => {
        try {
          const panel = document.getElementById('panel-wallet');
          if (!panel) return;
          const isHidden = panel.classList.contains('hidden');
          closePanels();
          if (isHidden) {
            panel.classList.remove('hidden');
            await activeCtx.refreshWallet();
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
          if (window.WalletModule && typeof window.WalletModule.handleOperation === 'function') {
            await window.WalletModule.handleOperation('deposit', activeCtx);
          }
        } catch (err) {
          console.error(err);
        }
      });

      safeOn('btn-wallet-withdraw', 'click', async () => {
        try {
          if (window.WalletModule && typeof window.WalletModule.handleOperation === 'function') {
            await window.WalletModule.handleOperation('withdraw', activeCtx);
          }
        } catch (err) {
          console.error(err);
        }
      });

      safeOn('btn-toggle-reliability', 'click', async () => {
        try {
          const panel = document.getElementById('panel-reliability');
          if (!panel) return;
          const isHidden = panel.classList.contains('hidden');
          closePanels();
          if (isHidden) {
            panel.classList.remove('hidden');
            if (window.AdminModule && typeof window.AdminModule.loadReliability === 'function') {
              await window.AdminModule.loadReliability(activeCtx);
            }
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
          if (window.AdminModule && typeof window.AdminModule.markNotificationsRead === 'function') {
            await window.AdminModule.markNotificationsRead(activeCtx);
          }
        } catch (err) {
          console.error(err);
        }
      });

      safeOn('btn-run-backup', 'click', async () => {
        try {
          if (window.AdminModule && typeof window.AdminModule.createBackup === 'function') {
            await window.AdminModule.createBackup(activeCtx);
          }
        } catch (err) {
          console.error(err);
        }
      });

      safeOn('btn-open-add-channel', 'click', () => {
        const panel = document.getElementById('panel-add-channel');
        if (!panel) return;
        const isHidden = panel.classList.contains('hidden');
        closePanels();
        if (isHidden) {
          if (window.UI && typeof window.UI.resetChannelWizard === 'function') {
            window.UI.resetChannelWizard(activeCtx);
          }
          panel.classList.remove('hidden');
        }
      });

      safeOn('btn-cancel-channel-wizard', 'click', () => {
        document.getElementById('panel-add-channel')?.classList.add('hidden');
        if (window.UI && typeof window.UI.resetChannelWizard === 'function') {
          window.UI.resetChannelWizard(activeCtx);
        }
      });

      safeOn('btn-ch-next', 'click', () => {
        if (AppState.channelStep === 1) {
          const name = document.getElementById('ch-name')?.value.trim() || '';
          const username = document.getElementById('ch-username')?.value.trim() || '';
          if (!name || !username) {
            notifyUser(t('msg_fill_required'), activeCtx);
            return;
          }
          if (username.includes('+') || username.toLowerCase().includes('joinchat')) {
            notifyUser(t('msg_private_rejected'), activeCtx);
            return;
          }
        }
        if (AppState.channelStep < 3 && window.UI && typeof window.UI.updateChannelWizardStep === 'function') {
          window.UI.updateChannelWizardStep(AppState.channelStep + 1, activeCtx);
        }
      });

      safeOn('btn-ch-prev', 'click', () => {
        if (AppState.channelStep > 1 && window.UI && typeof window.UI.updateChannelWizardStep === 'function') {
          window.UI.updateChannelWizardStep(AppState.channelStep - 1, activeCtx);
        }
      });

      safeOn('btn-ch-save', 'click', async () => {
        try {
          if (window.ChannelsModule && typeof window.ChannelsModule.saveNewChannel === 'function') {
            await window.ChannelsModule.saveNewChannel(activeCtx);
          }
        } catch (err) {
          console.error(err);
        }
      });

      safeOn('btn-toggle-channels-list', 'click', async () => {
        try {
          AppState.isChannelsListOpen = !AppState.isChannelsListOpen;
          const panel = document.getElementById('panel-channels-list');
          if (panel) panel.classList.toggle('hidden', !AppState.isChannelsListOpen);
          updateToggleButtonsText(activeCtx);
          if (AppState.isChannelsListOpen) {
            await activeCtx.refreshChannels();
          }
        } catch (err) {
          console.error(err);
        }
      });

      safeOn('camp-title', 'input', () => {
        if (window.UI && typeof window.UI.updateLivePreview === 'function') {
          window.UI.updateLivePreview(activeCtx);
        }
      });

      safeOn('camp-text', 'input', () => {
        if (window.UI && typeof window.UI.updateLivePreview === 'function') {
          window.UI.updateLivePreview(activeCtx);
        }
      });

      safeOn('camp-custom-btn', 'input', () => {
        if (window.UI && typeof window.UI.updateLivePreview === 'function') {
          window.UI.updateLivePreview(activeCtx);
        }
      });

      safeOn('camp-btn-preset', 'change', (e) => {
        const isCustom = e.target.value === 'Custom';
        document.getElementById('camp-custom-btn-group')?.classList.toggle('hidden', !isCustom);
        if (window.UI && typeof window.UI.updateLivePreview === 'function') {
          window.UI.updateLivePreview(activeCtx);
        }
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
          if (window.UI && typeof window.UI.updateLivePreview === 'function') {
            window.UI.updateLivePreview(activeCtx);
          }
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
        if (window.UI && typeof window.UI.updateLivePreview === 'function') {
          window.UI.updateLivePreview(activeCtx);
        }
      });

      safeOn('camp-budget', 'input', async () => {
        try {
          if (window.UI && typeof window.UI.handleBudgetTargetingState === 'function') {
            window.UI.handleBudgetTargetingState(activeCtx);
          }
          if (AppState.campaignStep === 3 && window.CampaignsModule?.loadMarketplace) {
            await window.CampaignsModule.loadMarketplace(activeCtx);
          }
        } catch (err) {
          console.error(err);
        }
      });

      safeOn('camp-language', 'change', async () => {
        try {
          if (AppState.campaignStep === 3 && window.CampaignsModule?.loadMarketplace) {
            await window.CampaignsModule.loadMarketplace(activeCtx);
          }
        } catch (err) {
          console.error(err);
        }
      });

      safeOn('camp-category', 'change', async () => {
        try {
          if (AppState.campaignStep === 3 && window.CampaignsModule?.loadMarketplace) {
            await window.CampaignsModule.loadMarketplace(activeCtx);
          }
        } catch (err) {
          console.error(err);
        }
      });

      safeOn('mkt-search-input', 'input', async () => {
        try {
          if (window.CampaignsModule && typeof window.CampaignsModule.loadMarketplace === 'function') {
            await window.CampaignsModule.loadMarketplace(activeCtx);
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
          if (window.CampaignsModule && typeof window.CampaignsModule.loadMarketplace === 'function') {
            await window.CampaignsModule.loadMarketplace(activeCtx);
          }
        } catch (err) {
          console.error(err);
        }
      });

      safeOn('btn-open-create-campaign', 'click', () => {
        const panel = document.getElementById('panel-campaign-wizard');
        if (!panel) return;
        const isHidden = panel.classList.contains('hidden');
        if (isHidden) {
          if (window.UI && typeof window.UI.resetCampaignWizard === 'function') {
            window.UI.resetCampaignWizard(activeCtx);
          }
          panel.classList.remove('hidden');
        } else {
          panel.classList.add('hidden');
        }
      });

      safeOn('btn-cancel-campaign-wizard', 'click', () => {
        document.getElementById('panel-campaign-wizard')?.classList.add('hidden');
        if (window.UI && typeof window.UI.resetCampaignWizard === 'function') {
          window.UI.resetCampaignWizard(activeCtx);
        }
      });

      safeOn('btn-camp-next', 'click', () => {
        if (AppState.campaignStep === 1) {
          const title = document.getElementById('camp-title')?.value.trim() || '';
          if (!title) {
            notifyUser(t('msg_fill_required'), activeCtx);
            return;
          }
        }
        if (AppState.campaignStep < 3 && window.UI && typeof window.UI.updateCampaignWizardStep === 'function') {
          window.UI.updateCampaignWizardStep(AppState.campaignStep + 1, activeCtx);
        }
      });

      safeOn('btn-camp-prev', 'click', () => {
        if (AppState.campaignStep > 1 && window.UI && typeof window.UI.updateCampaignWizardStep === 'function') {
          window.UI.updateCampaignWizardStep(AppState.campaignStep - 1, activeCtx);
        }
      });

      safeOn('btn-camp-save-draft', 'click', async () => {
        try {
          if (window.CampaignsModule && typeof window.CampaignsModule.submitCampaign === 'function') {
            await window.CampaignsModule.submitCampaign('draft', activeCtx);
          }
        } catch (err) {
          console.error(err);
        }
      });

      safeOn('btn-camp-publish', 'click', async () => {
        try {
          if (window.CampaignsModule && typeof window.CampaignsModule.submitCampaign === 'function') {
            await window.CampaignsModule.submitCampaign('active', activeCtx);
          }
        } catch (err) {
          console.error(err);
        }
      });

      safeOn('btn-toggle-campaigns-list', 'click', async () => {
        try {
          AppState.isCampaignsListOpen = !AppState.isCampaignsListOpen;
          const panel = document.getElementById('panel-campaigns-list');
          if (panel) panel.classList.toggle('hidden', !AppState.isCampaignsListOpen);
          updateToggleButtonsText(activeCtx);
          if (AppState.isCampaignsListOpen) {
            await activeCtx.refreshCampaigns();
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
