'use strict';

(function (window) {
  const SUPPORTED_LANGS = ['ar', 'en'];
  const DEFAULT_LANG = 'en';

  let currentLang = DEFAULT_LANG;

  function normalizeLang(rawLang) {
    if (!rawLang) {
      return DEFAULT_LANG;
    }
    const normalized = String(rawLang).trim().toLowerCase().slice(0, 2);
    return SUPPORTED_LANGS.includes(normalized) ? normalized : DEFAULT_LANG;
  }

  function resolveKey(obj, path) {
    if (!obj || typeof obj !== 'object' || !path) {
      return undefined;
    }
    if (Object.prototype.hasOwnProperty.call(obj, path)) {
      return obj[path];
    }
    return String(path)
      .split('.')
      .reduce(
        (acc, key) =>
          acc && Object.prototype.hasOwnProperty.call(acc, key) ? acc[key] : undefined,
        obj
      );
  }

  function detectLanguage(serverLang) {
    if (serverLang) {
      return normalizeLang(serverLang);
    }

    try {
      const tgLang =
        window.Telegram &&
        window.Telegram.WebApp &&
        window.Telegram.WebApp.initDataUnsafe &&
        window.Telegram.WebApp.initDataUnsafe.user &&
        window.Telegram.WebApp.initDataUnsafe.user.language_code;

      if (tgLang) {
        const normalized = String(tgLang).trim().toLowerCase().slice(0, 2);
        if (SUPPORTED_LANGS.includes(normalized)) {
          return normalized;
        }
      }
    } catch (err) {
      // تجاهل خطأ قراءة لغة تيليجرام
    }

    try {
      if (window.localStorage) {
        const saved = window.localStorage.getItem('telega_lang');
        if (saved && SUPPORTED_LANGS.includes(saved)) {
          return saved;
        }
      }
    } catch (err) {
      // تجاهل خطأ التخزين المحلي
    }

    try {
      const navLang = (navigator.language || '').trim().toLowerCase().slice(0, 2);
      if (SUPPORTED_LANGS.includes(navLang)) {
        return navLang;
      }
    } catch (err) {
      // تجاهل خطأ لغة المتصفح
    }

    return DEFAULT_LANG;
  }

  function applyTranslations(root = document) {
    const scope = root && typeof root.querySelectorAll === 'function' ? root : document;

    const nodes = scope.querySelectorAll('[data-i18n]');
    nodes.forEach((el) => {
      const key = el.getAttribute('data-i18n');
      const translated = t(key);
      if (typeof translated === 'string') {
        el.textContent = translated;
      }
    });

    const placeholders = scope.querySelectorAll('[data-i18n-placeholder]');
    placeholders.forEach((el) => {
      const key = el.getAttribute('data-i18n-placeholder');
      const translated = t(key);
      if (typeof translated === 'string') {
        el.setAttribute('placeholder', translated);
      }
    });
  }

  function setLanguage(lang) {
    const chosen = SUPPORTED_LANGS.includes(lang) ? lang : DEFAULT_LANG;
    currentLang = chosen;
    I18n.currentLang = chosen;

    try {
      if (window.localStorage) {
        window.localStorage.setItem('telega_lang', chosen);
      }
    } catch (err) {
      // تجاهل خطأ حفظ اللغة
    }

    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.lang = chosen;
      document.documentElement.dir = chosen === 'ar' ? 'rtl' : 'ltr';
    }

    applyTranslations(document);
    return currentLang;
  }

  function t(key, params = {}) {
    const nestedDict = window.TelegaTranslations || {};
    const activeNested = nestedDict[currentLang] || nestedDict[DEFAULT_LANG] || {};
    const fallbackNested = nestedDict[DEFAULT_LANG] || {};

    let value = resolveKey(activeNested, key);
    if (value === undefined) {
      value = resolveKey(fallbackNested, key);
    }

    if (value === undefined) {
      const flatDict = currentLang === 'ar' ? window.LANG_AR : window.LANG_EN;
      const flatFallback = window.LANG_EN || {};
      value = resolveKey(flatDict, key);
      if (value === undefined) {
        value = resolveKey(flatFallback, key);
      }
    }

    if (value === undefined) {
      return key;
    }

    if (typeof value !== 'string') {
      return value;
    }

    if (!params || typeof params !== 'object') {
      return value;
    }

    return value.replace(/\{(\w+)\}/g, (_, paramKey) =>
      Object.prototype.hasOwnProperty.call(params, paramKey)
        ? String(params[paramKey])
        : `{${paramKey}}`
    );
  }

  const I18n = {
    currentLang: DEFAULT_LANG,

    detectInitialLanguage(serverLang) {
      if (serverLang) {
        return normalizeLang(serverLang);
      }
      const tgUserLang = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code;
      const detected = tgUserLang || navigator.language || DEFAULT_LANG;
      if (String(detected).toLowerCase().startsWith('ar')) {
        return 'ar';
      }
      return DEFAULT_LANG;
    },

    setLanguage(lang) {
      return setLanguage(lang);
    },

    getLanguage() {
      return currentLang;
    },

    t(key, params = {}) {
      return t(key, params);
    },

    applyTranslations(root = document) {
      applyTranslations(root);
    },
  };

  currentLang = detectLanguage();
  I18n.currentLang = currentLang;

  window.I18n = I18n;
  window.TelegaI18n = {
    init: function () {
      return setLanguage(currentLang);
    },
    setLanguage,
    getLanguage: function () {
      return currentLang;
    },
    t,
    applyTranslations,
  };
})(window);
