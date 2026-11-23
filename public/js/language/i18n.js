(function () {
  const SUPPORTED_LANGS = ['ar', 'en'];

  const I18n = {
    currentLang: 'en',

    normalizeLang(raw) {
      if (!raw || typeof raw !== 'string') return null;
      const clean = raw.trim().toLowerCase();
      if (clean === 'ar' || clean.startsWith('ar-') || clean.startsWith('ar_')) {
        return 'ar';
      }
      if (clean === 'en' || clean.startsWith('en-') || clean.startsWith('en_')) {
        return 'en';
      }
      return null;
    },

    detectSmartLanguage(serverLang) {
      // 1. لغة محفوظة مسبقاً في السيرفر (إن وجدت وصحيحة)
      const fromServer = this.normalizeLang(serverLang);
      if (fromServer) return fromServer;

      // 2. لغة حساب المستخدم في تيليجرام
      const tgLang = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code;
      const fromTg = this.normalizeLang(tgLang);
      if (fromTg) return fromTg;

      // 3. لغات المتصفح / الجهاز
      const browserLangs = Array.isArray(navigator.languages) && navigator.languages.length
        ? navigator.languages
        : [navigator.language];

      for (const lang of browserLangs) {
        const matched = this.normalizeLang(lang);
        if (matched) return matched;
      }

      // 4. الافتراضي الإلزامي عند عدم التعرّف على اللغة: الإنجليزية
      return 'en';
    },

    setLanguage(lang) {
      const resolved = SUPPORTED_LANGS.includes(lang) ? lang : 'en';
      this.currentLang = resolved;
      document.documentElement.lang = resolved;
      document.documentElement.dir = resolved === 'ar' ? 'rtl' : 'ltr';
      this.applyTranslations();
    },

    t(key) {
      const dict = this.currentLang === 'ar' ? (window.LANG_AR || {}) : (window.LANG_EN || {});
      return dict[key] || window.LANG_EN?.[key] || key;
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
