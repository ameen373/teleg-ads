import { LANG_AR } from './ar.js';
import { LANG_EN } from './en.js';

const STORAGE_KEY = 'telega_ads_lang';
const SUPPORTED_NOW = ['ar', 'en'];
const DEFAULT_FALLBACK = 'en';

const FUTURE_LANGUAGES = [
  { code: 'zh', label: 'Chinese', flag: '🇨🇳' },
  { code: 'hi', label: 'Hindi', flag: '🇮🇳' },
  { code: 'es', label: 'Spanish', flag: '🇪🇸' },
  { code: 'fr', label: 'French', flag: '🇫🇷' },
  { code: 'bn', label: 'Bengali', flag: '🇧🇩' },
  { code: 'pt', label: 'Portuguese', flag: '🇵🇹' },
  { code: 'id', label: 'Indonesian', flag: '🇮🇩' },
  { code: 'ur', label: 'Urdu', flag: '🇵🇰' },
  { code: 'ru', label: 'Russian', flag: '🇷🇺' },
  { code: 'de', label: 'German', flag: '🇩🇪' },
  { code: 'ja', label: 'Japanese', flag: '🇯🇵' },
  { code: 'pcm', label: 'Nigerian Pidgin', flag: '🇳🇬' },
  { code: 'mr', label: 'Marathi', flag: '🇮🇳' },
  { code: 'vi', label: 'Vietnamese', flag: '🇻🇳' },
  { code: 'te', label: 'Telugu', flag: '🇮🇳' },
  { code: 'sw', label: 'Swahili', flag: '🇰🇪' },
  { code: 'tr', label: 'Turkish', flag: '🇹🇷' }
];

const ACTIVE_LANGUAGES = [
  { code: 'en', label: 'English', flag: '🇬🇧', dir: 'ltr' },
  { code: 'ar', label: 'العربية', flag: '🇸🇦', dir: 'rtl' }
];

function normalizeLang(rawLang) {
  if (!rawLang || typeof rawLang !== 'string') return DEFAULT_FALLBACK;
  const clean = rawLang.trim().toLowerCase().split(/[-_]/)[0];
  if (SUPPORTED_NOW.includes(clean)) return clean;
  return DEFAULT_FALLBACK;
}

function detectTelegramLanguage() {
  try {
    const tgUser =
      window.Telegram &&
      window.Telegram.WebApp &&
      window.Telegram.WebApp.initDataUnsafe &&
      window.Telegram.WebApp.initDataUnsafe.user;

    if (tgUser && tgUser.language_code) {
      return normalizeLang(tgUser.language_code);
    }

    const browserLang =
      navigator.language || (navigator.languages && navigator.languages[0]);
    return normalizeLang(browserLang);
  } catch (err) {
    console.error('i18n detectTelegramLanguage error:', err);
    return DEFAULT_FALLBACK;
  }
}

function applyAccountSectionLabel(dict, lang) {
  const accountLabel = lang === 'ar' ? 'حسابي' : 'My Account';
  const homeKeys = ['home', 'nav_home', 'main', 'dashboard'];

  homeKeys.forEach((k) => {
    if (dict && dict[k] === 'الرئيسية') {
      dict[k] = accountLabel;
    }
  });

  if (typeof document !== 'undefined') {
    const labels = document.querySelectorAll('[data-i18n]');
    labels.forEach((el) => {
      const key = el.getAttribute('data-i18n');
      const currentText = (el.textContent || '').trim();
      if (
        currentText === 'الرئيسية' ||
        (key && homeKeys.includes(key) && currentText === 'الرئيسية')
      ) {
        el.textContent = accountLabel;
      }
    });
  }
}

function resolveKeyFromDict(dict, key) {
  if (!dict || typeof key !== 'string') return undefined;
  if (Object.prototype.hasOwnProperty.call(dict, key)) {
    return dict[key];
  }
  return key
    .split('.')
    .reduce(
      (acc, part) => (acc && acc[part] !== undefined ? acc[part] : undefined),
      dict
    );
}

class I18nEngine {
  constructor() {
    this.dictionaries = {};
    this.currentLang = 'ar';
    this.listeners = [];
    this.legacyCallback = null;

    if (typeof LANG_AR !== 'undefined') {
      this.registerDictionary('ar', LANG_AR);
    }
    if (typeof LANG_EN !== 'undefined') {
      this.registerDictionary('en', LANG_EN);
    }
  }

  registerDictionary(langCode, dict) {
    const normalized = normalizeLang(langCode);
    const safeDict = dict && typeof dict === 'object' ? { ...dict } : {};
    applyAccountSectionLabel(safeDict, normalized);
    this.dictionaries[normalized] = safeDict;
  }

  getDictionary(lang = this.currentLang) {
    const resolved = normalizeLang(lang);
    return (
      this.dictionaries[resolved] ||
      this.dictionaries[DEFAULT_FALLBACK] ||
      {}
    );
  }

  init(preferredLang) {
    try {
      let saved = null;
      try {
        saved = localStorage.getItem(STORAGE_KEY);
      } catch (storageErr) {
        console.error('i18n localStorage read error:', storageErr);
      }

      const chosen = preferredLang || saved || detectTelegramLanguage() || 'ar';
      this.setLanguage(chosen, { persist: Boolean(preferredLang || saved) });
      return this.currentLang;
    } catch (err) {
      console.error('i18n init error:', err);
      this.setLanguage('ar', { persist: false });
      return this.currentLang;
    }
  }

  setLanguage(langCode, options = { persist: true }) {
    try {
      const resolved = langCode === 'en' || langCode === 'ar' ? langCode : normalizeLang(langCode);
      this.currentLang = resolved;

      if (options && options.persist) {
        try {
          localStorage.setItem(STORAGE_KEY, resolved);
        } catch (storageErr) {
          console.error('i18n localStorage write error:', storageErr);
        }
      }

      const dict = this.getDictionary(resolved);
      const dir = dict.dir || (resolved === 'ar' ? 'rtl' : 'ltr');

      if (typeof document !== 'undefined') {
        document.documentElement.lang = dict.lang || resolved;
        document.documentElement.dir = dir;
        document.documentElement.setAttribute('lang', dict.lang || resolved);
        document.documentElement.setAttribute('dir', dir);

        if (document.body) {
          document.body.setAttribute('dir', dir);
          document.body.classList.toggle('rtl', dir === 'rtl');
          document.body.classList.toggle('ltr', dir === 'ltr');
        }

        const toggleBtn = document.getElementById('lang-toggle-btn');
        if (toggleBtn && dict.toggleLabel) {
          toggleBtn.textContent = dict.toggleLabel;
        }

        const labels = document.querySelectorAll('[data-i18n]');
        labels.forEach((el) => {
          const key = el.getAttribute('data-i18n');
          const translated = resolveKeyFromDict(dict, key);
          if (translated !== undefined && translated !== null) {
            el.textContent = translated;
          }
        });

        applyAccountSectionLabel(dict, resolved);
      }

      if (typeof this.legacyCallback === 'function') {
        try {
          this.legacyCallback(this.currentLang, dir);
        } catch (cbErr) {
          console.error('i18n legacy callback error:', cbErr);
        }
      }

      this.listeners.forEach((fn) => {
        try {
          fn(this.currentLang, dir);
        } catch (err) {
          console.error('i18n listener error:', err);
        }
      });

      return this.currentLang;
    } catch (err) {
      console.error('i18n setLanguage error:', err);
      return this.currentLang;
    }
  }

  resetToAutoDetect() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (storageErr) {
      console.error('i18n localStorage remove error:', storageErr);
    }
    return this.setLanguage(detectTelegramLanguage(), { persist: false });
  }

  t(key, params = {}) {
    try {
      const activeDict =
        this.dictionaries[this.currentLang] ||
        this.dictionaries[DEFAULT_FALLBACK] ||
        {};
      const fallbackDict = this.dictionaries[DEFAULT_FALLBACK] || {};

      let value = resolveKeyFromDict(activeDict, key);
      if (value === undefined) {
        value = resolveKeyFromDict(fallbackDict, key);
      }
      if (value === undefined) {
        value = key;
      }

      if (typeof value === 'string' && value.trim() === 'الرئيسية') {
        value = this.currentLang === 'ar' ? 'حسابي' : 'My Account';
      }

      if (typeof value !== 'string') return value;

      return value.replace(/\{\{(\w+)\}\}/g, (_, token) =>
        params[token] !== undefined ? String(params[token]) : `{{${token}}}`
      );
    } catch (err) {
      console.error('i18n t() error:', err);
      return key;
    }
  }

  onChange(callback) {
    if (typeof callback === 'function') {
      this.listeners.push(callback);
    }
  }

  setLegacyCallback(callback) {
    this.legacyCallback = typeof callback === 'function' ? callback : null;
  }

  getAvailableLanguages() {
    return ACTIVE_LANGUAGES;
  }

  getUpcomingLanguages() {
    return FUTURE_LANGUAGES;
  }
}

const i18nEngine = new I18nEngine();

export function setOnLanguageChange(callback) {
  i18nEngine.setLegacyCallback(callback);
}

export function applyLanguage(lang) {
  return i18nEngine.setLanguage(lang, { persist: true });
}

export function toggleLanguage() {
  return applyLanguage(i18nEngine.currentLang === 'ar' ? 'en' : 'ar');
}

export function t(key, params = {}) {
  return i18nEngine.t(key, params);
}

if (typeof window !== 'undefined') {
  window.i18n = i18nEngine;
}

export default i18nEngine;
