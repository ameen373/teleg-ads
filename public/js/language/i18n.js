const arDict = typeof require !== 'undefined' ? (function() { try { return require('./ar.js'); } catch(e) { return null; } })() : null;
const enDict = typeof require !== 'undefined' ? (function() { try { return require('./en.js'); } catch(e) { return null; } })() : null;

if (typeof window !== 'undefined') {
  window.i18n = {
    ar: (window.ar || arDict || {}),
    en: (window.en || enDict || {})
  };
}

const i18nManager = {
  getCurrentLang: function() {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem('appLang') || 'ar';
    }
    return 'ar';
  },

  setCurrentLang: function(lang) {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('appLang', lang);
    }
  },

  getTranslations: function(lang) {
    const activeLang = lang || this.getCurrentLang();
    let dictionary = { ar: {}, en: {} };

    if (typeof window !== 'undefined' && window.i18n) {
      dictionary = window.i18n;
    } else {
      dictionary = { ar: arDict || {}, en: enDict || {} };
    }

    return dictionary[activeLang] || dictionary.ar || {};
  },

  t: function(key, lang) {
    const translations = this.getTranslations(lang);
    return translations[key] || key;
  },

  changeAppLanguage: function(lang) {
    const activeLang = (lang === 'en' || lang === 'ar') ? lang : 'ar';
    this.setCurrentLang(activeLang);

    if (typeof window !== 'undefined') {
      if (window.state) {
        window.state.currentLang = activeLang;
      }
      if (window.UI) {
        window.UI.currentLang = activeLang;
      }

      this.applyLanguage(activeLang);

      if (typeof window.loadUserData === 'function') {
        window.loadUserData();
      }
    }
    return activeLang;
  },

  applyLanguage: function(lang) {
    if (typeof document === 'undefined') return;

    const activeLang = (lang === 'en' || lang === 'ar') ? lang : this.getCurrentLang();
    const translations = this.getTranslations(activeLang);

    document.documentElement.lang = activeLang;
    document.documentElement.dir = activeLang === 'ar' ? 'rtl' : 'ltr';

    if (document.body) {
      document.body.style.direction = activeLang === 'ar' ? 'rtl' : 'ltr';
    }

    const langSelect = document.getElementById('language-select');
    if (langSelect) langSelect.value = activeLang;

    // تحديث النصوص
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (translations[key] !== undefined) {
        el.innerText = translations[key];
      }
    });

    // تحديث خانات الإدخال Placeholder
    document.querySelectorAll('[data-i18n-ph]').forEach(el => {
      const key = el.getAttribute('data-i18n-ph');
      if (translations[key] !== undefined) {
        el.placeholder = translations[key];
      }
    });

    // تحديث العناوين التوضيحية Title
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      const key = el.getAttribute('data-i18n-title');
      if (translations[key] !== undefined) {
        el.title = translations[key];
      }
    });

    // تحديث قيم الأزرار Value
    document.querySelectorAll('[data-i18n-val]').forEach(el => {
      const key = el.getAttribute('data-i18n-val');
      if (translations[key] !== undefined) {
        el.value = translations[key];
      }
    });
  }
};

if (typeof window !== 'undefined') {
  window.changeAppLanguage = function(lang) {
    return i18nManager.changeAppLanguage(lang);
  };

  window.applyLanguage = function(lang) {
    return i18nManager.applyLanguage(lang);
  };

  window.t = function(key, lang) {
    return i18nManager.t(key, lang);
  };

  document.addEventListener('DOMContentLoaded', () => {
    i18nManager.applyLanguage(i18nManager.getCurrentLang());
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = i18nManager;
}
