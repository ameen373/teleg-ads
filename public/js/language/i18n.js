(function () {
  function resolveDictionaries(ctx) {
    try {
      const ctxDicts = ctx && ctx.dictionaries && typeof ctx.dictionaries === 'object' ? ctx.dictionaries : null;
      const arDict =
        (ctxDicts && ctxDicts.ar) ||
        (typeof window !== 'undefined' &&
          (window.AR_TRANSLATIONS || window.LANG_AR || window.TELEGA_LANG_AR)) ||
        (typeof AR_TRANSLATIONS !== 'undefined' ? AR_TRANSLATIONS : {});
      const enDict =
        (ctxDicts && ctxDicts.en) ||
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

  function getSavedLanguage(ctx) {
    try {
      if (ctx && ctx.state && (ctx.state.lang === 'ar' || ctx.state.lang === 'en')) {
        return ctx.state.lang;
      }
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

  function saveLanguage(lang, ctx) {
    try {
      if (lang !== 'ar' && lang !== 'en') return;
      if (ctx && ctx.state && typeof ctx.state === 'object') {
        ctx.state.lang = lang;
      }
      if (typeof localStorage !== 'undefined') {
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

    detectInitialLanguage(serverLang, ctx) {
      try {
        const savedLang = getSavedLanguage(ctx);
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

    t(key, ctx) {
      if (!key) return '';
      try {
        const dicts = resolveDictionaries(ctx);
        const activeLang = (ctx && ctx.lang) || this.currentLang;
        const activeDict = dicts[activeLang] || dicts.ar || {};
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

    applyDirection(ctx) {
      if (typeof document === 'undefined' || !document.documentElement) return;
      try {
        const activeLang = (ctx && ctx.lang) || this.currentLang;
        const htmlEl = document.documentElement;
        htmlEl.lang = activeLang;
        htmlEl.dir = activeLang === 'ar' ? 'rtl' : 'ltr';
      } catch (err) {
        console.error(err);
      }
    },

    translateDOM(ctx) {
      if (typeof document === 'undefined') return;
      try {
        const root = ctx && ctx.root && typeof ctx.root.querySelectorAll === 'function' ? ctx.root : document;
        root.querySelectorAll('[data-i18n]').forEach((el) => {
          const key = el.getAttribute('data-i18n');
          if (key) {
            el.textContent = this.t(key, ctx);
          }
        });

        root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
          const key = el.getAttribute('data-i18n-placeholder');
          if (key) {
            el.placeholder = this.t(key, ctx);
          }
        });
      } catch (err) {
        console.error(err);
      }
    },

    applyTranslations(ctx) {
      this.translateDOM(ctx);
    },

    setLanguage(lang, ctx) {
      if (lang !== 'ar' && lang !== 'en') return;
      try {
        this.currentLang = lang;
        saveLanguage(lang, ctx);
        this.applyDirection(ctx);
        this.translateDOM(ctx);
      } catch (err) {
        console.error(err);
      }
    },

    applyLanguage(lang, ctx) {
      this.setLanguage(lang === 'en' ? 'en' : 'ar', ctx);
    },

    getLang(ctx) {
      return (ctx && ctx.lang) || this.currentLang;
    },

    toggleLanguage(ctx) {
      try {
        const nextLang = this.getLang(ctx) === 'ar' ? 'en' : 'ar';
        this.setLanguage(nextLang, ctx);
        return nextLang;
      } catch (err) {
        console.error(err);
        return this.getLang(ctx);
      }
    }
  };

  I18N.currentLang = I18N.detectInitialLanguage();

  if (typeof window !== 'undefined') {
    window.I18N = I18N;
    window.TelegaI18n = {
      applyLanguage: (lang, ctx) => I18N.applyLanguage(lang, ctx),
      t: (key, ctx) => I18N.t(key, ctx),
      getLang: (ctx) => I18N.getLang(ctx)
    };
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = I18N;
  }
})();
