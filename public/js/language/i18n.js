const ar = typeof window !== 'undefined' && window.ar ? window.ar : require('./ar');
const en = typeof window !== 'undefined' && window.en ? window.en : require('./en');

const i18nDictionary = {
  ar: ar || {},
  en: en || {}
};

if (typeof window !== 'undefined') {
  window.i18n = i18nDictionary;
}

let currentLang = (typeof localStorage !== 'undefined' && localStorage.getItem('appLang')) || 'ar';

function changeAppLanguage(lang) {
  try {
    currentLang = i18nDictionary[lang] ? lang : 'ar';
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('appLang', currentLang);
    }

    if (typeof window !== 'undefined' && window.state) {
      window.state.currentLang = currentLang;
    }

    applyLanguage(currentLang);

    if (typeof window !== 'undefined' && typeof window.loadUserData === 'function') {
      window.loadUserData();
    }
  } catch (err) {
    console.error("i18n changeAppLanguage Error:", err);
  }
}

function applyLanguage(lang) {
  try {
    if (typeof document === 'undefined') return;

    const activeLang = i18nDictionary[lang] ? lang : 'ar';
    document.documentElement.lang = activeLang;
    document.documentElement.dir = activeLang === 'ar' ? 'rtl' : 'ltr';

    if (document.body) {
      document.body.style.direction = activeLang === 'ar' ? 'rtl' : 'ltr';
    }

    const langSelect = document.getElementById('language-select');
    if (langSelect) {
      langSelect.value = activeLang;
    }

    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (i18nDictionary[activeLang] && i18nDictionary[activeLang][key] !== undefined) {
        el.innerText = i18nDictionary[activeLang][key];
      }
    });

    document.querySelectorAll('[data-i18n-ph]').forEach(el => {
      const key = el.getAttribute('data-i18n-ph');
      if (i18nDictionary[activeLang] && i18nDictionary[activeLang][key] !== undefined) {
        el.placeholder = i18nDictionary[activeLang][key];
      }
    });
  } catch (err) {
    console.error("i18n applyLanguage Error:", err);
  }
}

if (typeof window !== 'undefined') {
  window.changeAppLanguage = changeAppLanguage;
  window.applyLanguage = applyLanguage;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      applyLanguage(currentLang);
    });
  } else {
    applyLanguage(currentLang);
  }
}

module.exports = {
  i18n: i18nDictionary,
  getCurrentLang: () => currentLang,
  changeAppLanguage,
  applyLanguage
};
