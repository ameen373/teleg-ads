(function () {
  function resolveDictionaries() {
    try {
      const arDict =
        (typeof window !== 'undefined' &&
          (window.AR_TRANSLATIONS || window.LANG_AR || window.TELEGA_LANG_AR)) ||
        (typeof AR_TRANSLATIONS !== 'undefined' ? AR_TRANSLATIONS : {});
      const enDict =
        (typeof window !== 'undefined' &&
          (window.EN_TRANSLATIONS || window.LANG_EN || window.TELEGA_LANG_EN)) ||
        (typeof EN_TRANSLATIONS !== 'undefined' ? EN_TRANSLATIONS : {});
      return {
        ar: arDict && typeof arDict === 'object' ? arDict : {},
        en: enDict && typeof enDict === 'object' ? enDict : {}
      };
    } catch (err) {
      console.error(err);
      return { ar: {}, en: {} };
    }
  }

  function getSavedLanguage() {
    try {
      if (typeof localStorage !== 'undefined') {
        const savedLang = localStorage.getItem('telega_lang');
        if (savedLang === 'ar' || savedLang === 'en') {
          return savedLang;
        }
      }
    } catch (err) {
      console.error(err);
    }
    return null;
  }

  function saveLanguage(lang) {
    try {
      if (typeof localStorage !== 'undefined' && (lang === 'ar' || lang === 'en')) {
        localStorage.setItem('telega_lang', lang);
      }
    } catch (err) {
      console.error(err);
    }
  }

  const I18N = {
    currentLang: getSavedLanguage() || 'ar',

    get dictionaries() {
      return resolveDictionaries();
    },

    detectInitialLanguage(serverLang) {
      try {
        const savedLang = getSavedLanguage();
        if (savedLang === 'ar' || savedLang === 'en') {
          return savedLang;
        }
        const tgUserLang =
          typeof window !== 'undefined'
            ? window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code
            : null;
        const navLang =
          typeof navigator !== 'undefined'
            ? navigator.language || navigator.userLanguage
            : null;
        const detected = serverLang || tgUserLang || navLang || 'ar';
        if (String(detected).toLowerCase().startsWith('ar')) {
          return 'ar';
        }
        return 'en';
      } catch (err) {
        console.error(err);
        return 'ar';
      }
    },

    t(key) {
      if (!key) return '';
      try {
        const dicts = resolveDictionaries();
        const activeDict = dicts[this.currentLang] || dicts.ar || {};
        const fallbackEn = dicts.en || {};
        const fallbackAr = dicts.ar || {};
        if (Object.prototype.hasOwnProperty.call(activeDict, key) && activeDict[key] !== undefined) {
          return activeDict[key];
        }
        if (Object.prototype.hasOwnProperty.call(fallbackEn, key) && fallbackEn[key] !== undefined) {
          return fallbackEn[key];
        }
        if (Object.prototype.hasOwnProperty.call(fallbackAr, key) && fallbackAr[key] !== undefined) {
          return fallbackAr[key];
        }
      } catch (err) {
        console.error(err);
      }
      return key;
    },

    applyDirection() {
      if (typeof document === 'undefined' || !document.documentElement) return;
      try {
        const htmlEl = document.documentElement;
        htmlEl.lang = this.currentLang;
        htmlEl.dir = this.currentLang === 'ar' ? 'rtl' : 'ltr';
      } catch (err) {
        console.error(err);
      }
    },

    translateDOM() {
      if (typeof document === 'undefined') return;
      try {
        document.querySelectorAll('[data-i18n]').forEach((el) => {
          const key = el.getAttribute('data-i18n');
          if (key) {
            el.textContent = this.t(key);
          }
        });

        document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
          const key = el.getAttribute('data-i18n-placeholder');
          if (key) {
            el.placeholder = this.t(key);
          }
        });
      } catch (err) {
        console.error(err);
      }
    },

    applyTranslations() {
      this.translateDOM();
    },

    setLanguage(lang) {
      if (lang !== 'ar' && lang !== 'en') return;
      try {
        this.currentLang = lang;
        saveLanguage(lang);
        this.applyDirection();
        this.translateDOM();
      } catch (err) {
        console.error(err);
      }
    },

    applyLanguage(lang) {
      this.setLanguage(lang === 'en' ? 'en' : 'ar');
    },

    getLang() {
      return this.currentLang;
    },

    toggleLanguage() {
      try {
        const nextLang = this.currentLang === 'ar' ? 'en' : 'ar';
        this.setLanguage(nextLang);
        return nextLang;
      } catch (err) {
        console.error(err);
        return this.currentLang;
      }
    }
  };

  I18N.currentLang = I18N.detectInitialLanguage();

  if (typeof window !== 'undefined') {
    window.I18N = I18N;
    window.I18n = I18N;
    window.TelegaI18n = {
      applyLanguage: (lang) => I18N.applyLanguage(lang),
      t: (key) => I18N.t(key),
      getLang: () => I18N.getLang()
    };
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = I18N;
  }
})();
