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

const dictionaries = { en, ar };
let currentLang = "en";

export function detectSmartLanguage(tgUserLangCode) {
  try {
    const saved = localStorage.getItem("telega_ads_lang");
    if (saved && dictionaries[saved]) {
      return saved;
    }

    if (tgUserLangCode) {
      const normalized = tgUserLangCode.toLowerCase().split("-")[0];
      if (dictionaries[normalized]) {
        return normalized;
      }
    }

    const browserLang = (navigator.language || "en").toLowerCase().split("-")[0];
    if (dictionaries[browserLang]) {
      return browserLang;
    }

    return "en";
  } catch {
    return "en";
  }
}

export function setLanguage(langCode) {
  const target = dictionaries[langCode] ? langCode : "en";
  currentLang = target;
  try {
    localStorage.setItem("telega_ads_lang", target);
  } catch {
    // Storage restricted fallback
  }
  applyTranslations();
  return target;
}

export function getCurrentLanguage() {
  return currentLang;
}

export function t(key) {
  const dict = dictionaries[currentLang] || dictionaries.en;
  return dict[key] || dictionaries.en[key] || key;
}

export function applyTranslations() {
  const dict = dictionaries[currentLang] || dictionaries.en;
  document.documentElement.lang = currentLang;
  document.documentElement.dir = dict.dir;

  const flagEl = document.getElementById("current-flag");
  if (flagEl) {
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
}
