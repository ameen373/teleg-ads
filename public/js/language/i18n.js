import { LANG_AR } from './ar.js';
import { LANG_EN } from './en.js';

let currentLang = 'ar';
let onLanguageChangeCallback = null;

function getDictionary() {
  return currentLang === 'en' ? LANG_EN : LANG_AR;
}

export function setOnLanguageChange(callback) {
  onLanguageChangeCallback = typeof callback === 'function' ? callback : null;
}

export function applyLanguage(lang) {
  currentLang = lang === 'en' ? 'en' : 'ar';
  const dict = getDictionary();

  document.documentElement.lang = dict.lang;
  document.documentElement.dir = dict.dir;

  const toggleBtn = document.getElementById('lang-toggle-btn');
  if (toggleBtn) {
    toggleBtn.textContent = dict.toggleLabel;
  }

  const labels = document.querySelectorAll('[data-i18n]');
  labels.forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (dict[key]) {
      el.textContent = dict[key];
    }
  });

  if (onLanguageChangeCallback) {
    onLanguageChangeCallback();
  }
}

export function toggleLanguage() {
  applyLanguage(currentLang === 'ar' ? 'en' : 'ar');
}

export function t(key) {
  const dict = getDictionary();
  return dict[key] || key;
}
