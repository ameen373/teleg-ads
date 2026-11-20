(function () {
  const I18n = {
    currentLang: 'en',

    detectInitialLanguage(serverLang) {
      const tgUserLang = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code;
      const detected = serverLang || tgUserLang || navigator.language || 'en';
      if (String(detected).toLowerCase().startsWith('ar')) {
        return 'ar';
      }
      return 'en';
    },

    setLanguage(lang) {
      this.currentLang = lang === 'ar' ? 'ar' : 'en';
      document.documentElement.lang = this.currentLang;
      document.documentElement.dir = this.currentLang === 'ar' ? 'rtl' : 'ltr';
      this.applyTranslations();
    },

    t(key) {
      const dict = this.currentLang === 'ar' ? window.LANG_AR : window.LANG_EN;
      return dict[key] || window.LANG_EN[key] || key;
    },

    applyTranslations() {
      document.querySelectorAll('[data-i18n]').forEach((el) => {
        const key = el.getAttribute('data-i18n');
        el.textContent = this.t(key);
      });

      document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
        const key = el.getAttribute('data-i18n-placeholder');
        el.placeholder = this.t(key);
      });
    }
  };

  window.I18n = I18n;
})();
