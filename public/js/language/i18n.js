import { en } from "./en.js";
import { ar } from "./ar.js";

export const SUPPORTED_LANGUAGES = [
  { code: "en", label: "English", flag: "🇬🇧", active: true },
  { code: "ar", label: "العربية", flag: "🇸🇦", active: true },
  { code: "zh", label: "Chinese", flag: "🇨🇳", active: false },
  { code: "hi", label: "Hindi", flag: "🇮🇳", active: false },
  { code: "es", label: "Spanish", flag: "🇪🇸", active: false },
  { code: "fr", label: "French", flag: "🇫🇷", active: false },
  { code: "bn", label: "Bengali", flag: "🇧🇩", active: false },
  { code: "pt", label: "Portuguese", flag: "🇵🇹", active: false },
  { code: "id", label: "Indonesian", flag: "🇮🇩", active: false },
  { code: "ur", label: "Urdu", flag: "🇵🇰", active: false },
  { code: "ru", label: "Russian", flag: "🇷🇺", active: false },
  { code: "de", label: "German", flag: "🇩🇪", active: false },
  { code: "ja", label: "Japanese", flag: "🇯🇵", active: false },
  { code: "pcm", label: "Nigerian Pidgin", flag: "🇳🇬", active: false },
  { code: "mr", label: "Marathi", flag: "🇮🇳", active: false },
  { code: "vi", label: "Vietnamese", flag: "🇻🇳", active: false },
  { code: "te", label: "Telugu", flag: "🇮🇳", active: false },
  { code: "sw", label: "Swahili", flag: "🇰🇪", active: false },
  { code: "tr", label: "Turkish", flag: "🇹🇷", active: false }
];

const STORAGE_KEY = "telega_ads_lang";
const FALLBACK_LANG = "ar";
const dictionaries = { ar, en };

let currentLang = readSavedLang() || FALLBACK_LANG;

function readSavedLang() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved && dictionaries[saved] ? saved : null;
  } catch {
    return null;
  }
}

function writeSavedLang(langCode) {
  try {
    localStorage.setItem(STORAGE_KEY, langCode);
  } catch {
    // Storage restricted fallback (e.g. Telegram WebApp / private mode)
  }
}

function resolveDir(langCode, dict) {
  if (dict && (dict.dir === "rtl" || dict.dir === "ltr")) {
    return dict.dir;
  }
  return langCode === "ar" ? "rtl" : "ltr";
}

export function detectSmartLanguage(tgUserLangCode) {
  const saved = readSavedLang();
  if (saved) {
    currentLang = saved;
    return saved;
  }

  try {
    if (tgUserLangCode) {
      const normalized = tgUserLangCode.toLowerCase().split("-")[0];
      if (dictionaries[normalized]) {
        currentLang = normalized;
        return normalized;
      }
    }

    const browserLang = (navigator.language || "").toLowerCase().split("-")[0];
    if (dictionaries[browserLang]) {
      currentLang = browserLang;
      return browserLang;
    }
  } catch {
    // Ignore environment access errors
  }

  currentLang = FALLBACK_LANG;
  return FALLBACK_LANG;
}

export function setLanguage(langCode) {
  const target = dictionaries[langCode] ? langCode : FALLBACK_LANG;
  currentLang = target;
  writeSavedLang(target);
  applyTranslations();
  return target;
}

export function setLang(langCode) {
  return setLanguage(langCode);
}

export function getCurrentLanguage() {
  return currentLang;
}

export function getLang() {
  return getCurrentLanguage();
}

export function t(key) {
  const activeDict = dictionaries[currentLang] || dictionaries[FALLBACK_LANG];
  const fallbackDict = dictionaries[FALLBACK_LANG];
  return activeDict[key] ?? fallbackDict[key] ?? key;
}

export function applyTranslations() {
  const dict = dictionaries[currentLang] || dictionaries[FALLBACK_LANG];

  document.documentElement.lang = currentLang;
  document.documentElement.dir = resolveDir(currentLang, dict);

  const flagEl = document.getElementById("current-flag");
  if (flagEl && dict.flag) {
    flagEl.textContent = dict.flag;
  }

  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (key) {
      el.textContent = t(key);
    }
  });

  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const key = el.getAttribute("data-i18n-placeholder");
    if (key) {
      el.setAttribute("placeholder", t(key));
    }
  });

  const langBtn = document.getElementById("langToggleBtn");
  if (langBtn) {
    langBtn.textContent = currentLang === "ar" ? "EN" : "AR";
  }
}
