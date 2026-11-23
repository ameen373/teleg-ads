(function () {
  function resolveDictionaries() {
    const arDict =
      (typeof window !== 'undefined' && (window.AR_TRANSLATIONS || window.LANG_AR)) ||
      (typeof AR_TRANSLATIONS !== 'undefined' ? AR_TRANSLATIONS : {});
    const enDict =
      (typeof window !== 'undefined' && (window.EN_TRANSLATIONS || window.LANG_EN)) ||
      (typeof EN_TRANSLATIONS !== 'undefined' ? EN_TRANSLATIONS : {});
    return { ar: arDict, en: enDict };
  }

  const I18N = {
    currentLang:
      (typeof localStorage !== 'undefined' && localStorage.getItem('telega_lang')) || 'ar',

    get dictionaries() {
      return resolveDictionaries();
    },

    detectInitialLanguage(serverLang) {
      const savedLang =
        typeof localStorage !== 'undefined' ? localStorage.getItem('telega_lang') : null;
      if (savedLang === 'ar' || savedLang === 'en') {
        return savedLang;
      }
      const tgUserLang =
        typeof window !== 'undefined'
          ? window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code
          : null;
      const navLang = typeof navigator !== 'undefined' ? navigator.language : null;
      const detected = serverLang || tgUserLang || navLang || 'ar';
      if (String(detected).toLowerCase().startsWith('ar')) {
        return 'ar';
      }
      return 'en';
    },

    t(key) {
      const dicts = resolveDictionaries();
      const activeDict = dicts[this.currentLang] || dicts.ar || {};
      const fallbackEn = dicts.en || {};
      const fallbackAr = dicts.ar || {};
      return activeDict[key] || fallbackEn[key] || fallbackAr[key] || key;
    },

    applyDirection() {
      if (typeof document === 'undefined') return;
      const htmlEl = document.documentElement;
      htmlEl.lang = this.currentLang;
      htmlEl.dir = this.currentLang === 'ar' ? 'rtl' : 'ltr';
    },

    translateDOM() {
      if (typeof document === 'undefined') return;
      document.querySelectorAll('[data-i18n]').forEach((el) => {
        const key = el.getAttribute('data-i18n');
        el.textContent = this.t(key);
      });

      document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
        const key = el.getAttribute('data-i18n-placeholder');
        el.placeholder = this.t(key);
      });
    },

    applyTranslations() {
      this.translateDOM();
    },

    setLanguage(lang) {
      if (lang !== 'ar' && lang !== 'en') return;
      this.currentLang = lang;
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('telega_lang', lang);
      }
      this.applyDirection();
      this.translateDOM();
    },

    toggleLanguage() {
      const nextLang = this.currentLang === 'ar' ? 'en' : 'ar';
      this.setLanguage(nextLang);
      return nextLang;
    }
  };

  if (typeof window !== 'undefined') {
    window.I18N = I18N;
    window.I18n = I18N;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = I18N;
  }
})();
