import { ar } from './ar.js';
import { en } from './en.js';

export const ALL_19_LANGUAGES = [
  { code: 'en', label: '🇬🇧 English' },
  { code: 'zh', label: '🇨🇳 Chinese' },
  { code: 'hi', label: '🇮🇳 Hindi' },
  { code: 'es', label: '🇪🇸 Spanish' },
  { code: 'ar', label: '🇸🇦 Arabic' },
  { code: 'fr', label: '🇫🇷 French' },
  { code: 'bn', label: '🇧🇩 Bengali' },
  { code: 'pt', label: '🇵🇹 Portuguese' },
  { code: 'id', label: '🇮🇩 Indonesian' },
  { code: 'ur', label: '🇵🇰 Urdu' },
  { code: 'ru', label: '🇷🇺 Russian' },
  { code: 'de', label: '🇩🇪 German' },
  { code: 'ja', label: '🇯🇵 Japanese' },
  { code: 'pcm', label: '🇳🇬 Nigerian Pidgin' },
  { code: 'mr', label: '🇮🇳 Marathi' },
  { code: 'vi', label: '🇻🇳 Vietnamese' },
  { code: 'te', label: '🇮🇳 Telugu' },
  { code: 'sw', label: '🇰🇪 Swahili' },
  { code: 'tr', label: '🇹🇷 Turkish' }
];

const dictionaries = { ar, en };
let currentLang = 'en';

export function detectInitialLanguage(tgLangCode) {
  const saved = localStorage.getItem('telega_ads_lang');
  if (saved) return saved;
  const candidate = (tgLangCode || navigator.language || 'en').slice(0, 2).toLowerCase();
  if (candidate === 'ar') return 'ar';
  return 'en';
}

export function setLanguage(langCode) {
  currentLang = langCode || 'en';
  localStorage.setItem('telega_ads_lang', currentLang);
  const dict = dictionaries[currentLang] || dictionaries.en;

  document.documentElement.lang = currentLang;
  document.documentElement.dir = currentLang === 'ar' ? 'rtl' : 'ltr';

  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (dict[key]) {
      el.textContent = dict[key];
    }
  });
}

export function getLang() {
  return currentLang;
}

export function t(key) {
  const dict = dictionaries[currentLang] || dictionaries.en;
  return dict[key] || dictionaries.en[key] || key;
}
