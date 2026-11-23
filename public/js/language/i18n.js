(function () {
  const I18n = {
    currentLang: 'en',

    normalizeLang(code) {
      if (!code) return null;
      const clean = String(code).trim().toLowerCase();
      if (clean === 'ar' || clean.startsWith('ar-')) return 'ar';
      if (clean === 'en' || clean.startsWith('en-')) return 'en';
      return 'en';
    },

    detectInitialLanguage(serverLang) {
      const candidates = [
        serverLang,
        window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code,
        ...(Array.isArray(navigator.languages) ? navigator.languages : []),
        navigator.language
      ];

      for (const candidate of candidates) {
        if (!candidate) continue;
        const clean = String(candidate).trim().toLowerCase();
        if (clean === 'ar' || clean.startsWith('ar-')) {
          return 'ar';
        }
      }

      return 'en';
    },

    setLanguage(lang) {
      this.currentLang = this.normalizeLang(lang) || 'en';
      document.documentElement.lang = this.currentLang;
      document.documentElement.dir = this.currentLang === 'ar' ? 'rtl' : 'ltr';
      this.applyTranslations();
    },

    t(key) {
      const dict = this.currentLang === 'ar' ? window.LANG_AR : window.LANG_EN;
      return dict?.[key] || window.LANG_EN?.[key] || key;
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
