import ar from './ar.js';
import en from './en.js';

const translations = { ar, en };

class I18nManager {
  constructor() {
    this.currentLang = localStorage.getItem('appLang') || 'ar';
  }

  init() {
    this.applyLanguage(this.currentLang);
  }

  setLanguage(lang) {
    if (!translations[lang]) lang = 'en';
    this.currentLang = lang;
    localStorage.setItem('appLang', lang);
    this.applyLanguage(lang);
  }

  getLanguage() {
    return this.currentLang;
  }

  t(key, fallback = '') {
    return translations[this.currentLang]?.[key] || translations['en']?.[key] || fallback || key;
  }

  applyLanguage(lang) {
    const activeLang = translations[lang] ? lang : 'en';
    this.currentLang = activeLang;

    document.documentElement.lang = activeLang;
    document.documentElement.dir = activeLang === 'ar' ? 'rtl' : 'ltr';
    document.body.style.direction = activeLang === 'ar' ? 'rtl' : 'ltr';

    const langSelect = document.getElementById('language-select');
    if (langSelect) langSelect.value = activeLang;

    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      const translation = this.t(key);
      if (translation) {
        el.innerText = translation;
      }
    });

    document.querySelectorAll('[data-i18n-ph]').forEach(el => {
      const key = el.getAttribute('data-i18n-ph');
      const translation = this.t(key);
      if (translation) {
        el.placeholder = translation;
      }
    });
  }
}

export const i18n = new I18nManager();
