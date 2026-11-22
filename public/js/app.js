'use strict';

(function (window, document) {
  let isBootstrapped = false;

  const App = {
    user: null,

    getBotUsername() {
      if (window.TelegaAppState && window.TelegaAppState.botUsername) {
        return window.TelegaAppState.botUsername;
      }
      if (window.AppState && window.AppState.botUsername) {
        return window.AppState.botUsername;
      }
      return 'adTelega_bot';
    },

    getReferralUrl(userId) {
      const uid =
        userId ||
        (window.TelegaApi && typeof window.TelegaApi.getCurrentUserId === 'function'
          ? window.TelegaApi.getCurrentUserId()
          : null) ||
        (this.user && (this.user.id || this.user.userId)) ||
        'publisher';

      return `https://t.me/${this.getBotUsername()}?start=ref_${encodeURIComponent(uid)}`;
    },

    initTelegaSubmodules() {
      if (window.TelegaI18n && typeof window.TelegaI18n.init === 'function') {
        window.TelegaI18n.init();
      }

      if (window.TelegaChannelsModule && typeof window.TelegaChannelsModule.init === 'function') {
        window.TelegaChannelsModule.init();
      }
    },

    bootstrap() {
      if (isBootstrapped) {
        return;
      }
      isBootstrapped = true;

      this.initTelegaSubmodules();

      if (window.TelegaCampaignsModule && typeof window.TelegaCampaignsModule.init === 'function') {
        window.TelegaCampaignsModule.init();
      }
    },

    async init() {
      this.bootstrap();

      const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
      if (tg) {
        if (typeof tg.ready === 'function') {
          tg.ready();
        }
        if (typeof tg.expand === 'function') {
          tg.expand();
        }
      }

      if (window.I18n) {
        const initialLang = window.I18n.detectInitialLanguage();
        window.I18n.setLanguage(initialLang);
      }

      this.bindNavigation();
      this.bindLanguageToggle();

      if (window.ChannelsModule && typeof window.ChannelsModule.init === 'function') {
        window.ChannelsModule.init();
      }
      if (window.CampaignsModule && typeof window.CampaignsModule.init === 'function') {
        window.CampaignsModule.init();
      }
      if (window.WalletModule && typeof window.WalletModule.init === 'function') {
        window.WalletModule.init();
      }

      try {
        await this.refreshUserData();
        await Promise.all([
          window.ChannelsModule && typeof window.ChannelsModule.load === 'function'
            ? window.ChannelsModule.load()
            : Promise.resolve(),
          window.CampaignsModule && typeof window.CampaignsModule.load === 'function'
            ? window.CampaignsModule.load()
            : Promise.resolve(),
        ]);
      } catch (err) {
        if (window.UI && typeof window.UI.notify === 'function') {
          window.UI.notify(err && err.message ? err.message : String(err));
        } else {
          console.error(err);
        }
      } finally {
        if (window.UI && typeof window.UI.hideLoader === 'function') {
          window.UI.hideLoader();
        }
      }
    },

    async refreshUserData() {
      if (!window.Api || typeof window.Api.getMe !== 'function') {
        return;
      }

      const data = await window.Api.getMe();
      this.user = data.user;

      if (window.I18n) {
        const syncedLang = window.I18n.detectInitialLanguage(
          this.user ? this.user.languageCode : undefined
        );
        window.I18n.setLanguage(syncedLang);
      }

      if (window.UI) {
        if (typeof window.UI.renderUserHeader === 'function') {
          window.UI.renderUserHeader(this.user);
        }
        if (typeof window.UI.renderHome === 'function') {
          window.UI.renderHome(this.user, data.stats, data.transactions);
        }
      }

      if (window.WalletModule && typeof window.WalletModule.render === 'function') {
        window.WalletModule.render(this.user);
      }

      if (
        this.user &&
        this.user.isAdmin === true &&
        window.AdminModule &&
        typeof window.AdminModule.enableAdminAccess === 'function'
      ) {
        window.AdminModule.enableAdminAccess();
      }
    },

    bindNavigation() {
      document.querySelectorAll('.nav-item').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const target = btn.getAttribute('data-target');
          if (!target) return;

          if (target === 'view-admin' && (!this.user || !this.user.isAdmin)) {
            return;
          }

          if (window.UI && typeof window.UI.switchView === 'function') {
            window.UI.switchView(target);
          }

          if (
            target === 'view-channels' &&
            window.ChannelsModule &&
            typeof window.ChannelsModule.load === 'function'
          ) {
            await window.ChannelsModule.load();
          }

          if (
            target === 'view-campaigns' &&
            window.CampaignsModule &&
            typeof window.CampaignsModule.load === 'function'
          ) {
            await window.CampaignsModule.load();
          }

          if (
            target === 'view-admin' &&
            this.user &&
            this.user.isAdmin &&
            window.AdminModule &&
            typeof window.AdminModule.loadDashboard === 'function'
          ) {
            await window.AdminModule.loadDashboard();
          }
        });
      });
    },

    bindLanguageToggle() {
      const toggleBtn = document.getElementById('lang-toggle-btn');
      if (!toggleBtn) return;

      toggleBtn.addEventListener('click', async () => {
        const currentLang = window.I18n ? window.I18n.currentLang : 'ar';
        const nextLang = currentLang === 'ar' ? 'en' : 'ar';

        if (window.I18n && typeof window.I18n.setLanguage === 'function') {
          window.I18n.setLanguage(nextLang);
        }

        if (window.UI && typeof window.UI.haptic === 'function') {
          window.UI.haptic('light');
        }

        try {
          if (window.Api && typeof window.Api.updateLanguage === 'function') {
            await window.Api.updateLanguage(nextLang);
          }
          await this.refreshUserData();
        } catch (err) {
          console.error(err);
        }
      });
    },
  };

  window.App = App;

  window.TelegaApp = Object.assign({}, window.TelegaApp || {}, {
    init: () => App.init(),
    bootstrap: () => App.bootstrap(),
    getBotUsername: (userId) => App.getBotUsername(userId),
    getReferralUrl: (userId) => App.getReferralUrl(userId),
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => App.init(), { once: true });
  } else {
    App.init();
  }
})(window, document);
