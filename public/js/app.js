(function () {
  const App = {
    user: null,

    async init() {
      const tg = window.Telegram?.WebApp;
      if (tg) {
        tg.ready();
        tg.expand();
      }

      // كشف ذكي فوري للغة قبل الاتصال بالسيرفر (والافتراضي الإنجليزية عند عدم التعرّف)
      const initialLang = window.I18n.detectSmartLanguage();
      window.I18n.setLanguage(initialLang);

      this.bindNavigation();
      this.bindLanguageToggle();

      window.ChannelsModule.init();
      window.CampaignsModule.init();
      window.WalletModule.init();

      try {
        await this.refreshUserData();
        await Promise.all([
          window.ChannelsModule.load(),
          window.CampaignsModule.load()
        ]);
      } catch (err) {
        window.UI.notify(err.message);
      } finally {
        window.UI.hideLoader();
      }
    },

    async refreshUserData() {
      const data = await window.Api.getMe();
      this.user = data.user;

      const syncedLang = window.I18n.detectSmartLanguage(this.user.languageCode);
      window.I18n.setLanguage(syncedLang);

      window.UI.renderUserHeader(this.user);
      window.WalletModule.render(this.user);

      if (this.user.isAdmin === true) {
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

          window.UI.switchView(target);

          if (target === 'view-channels') await window.ChannelsModule.load();
          if (target === 'view-campaigns') await window.CampaignsModule.load();
          if (target === 'view-admin' && this.user?.isAdmin) await window.AdminModule.loadDashboard();
        });
      });
    },

    bindLanguageToggle() {
      const toggleBtn = document.getElementById('lang-toggle-btn');
      if (!toggleBtn) return;

      toggleBtn.addEventListener('click', async () => {
        const nextLang = window.I18n.currentLang === 'ar' ? 'en' : 'ar';
        window.I18n.setLanguage(nextLang);
        window.UI.renderUserHeader(this.user || {});
        window.UI.haptic('light');
        try {
          await window.Api.updateLanguage(nextLang);
          await this.refreshUserData();
        } catch (err) {
          console.error(err);
        }
      });
    }
  };

  window.App = App;
  document.addEventListener('DOMContentLoaded', () => App.init());
})();
