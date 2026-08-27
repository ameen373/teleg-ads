const i18n = {
  ar: typeof arTranslations !== 'undefined' ? arTranslations : {},
  en: typeof enTranslations !== 'undefined' ? enTranslations : {}
};

let currentLang = localStorage.getItem('appLang') || 'en';

function applyLanguage(lang) {
  const activeLang = i18n[lang] ? lang : 'en';
  currentLang = activeLang;
  
  document.documentElement.lang = activeLang;
  document.documentElement.dir = activeLang === 'ar' ? 'rtl' : 'ltr';
  document.body.style.direction = activeLang === 'ar' ? 'rtl' : 'ltr';

  const langSelect = document.getElementById('language-select');
  if (langSelect) langSelect.value = activeLang;

  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (i18n[activeLang] && i18n[activeLang][key]) {
      el.innerText = i18n[activeLang][key];
    }
  });

  document.querySelectorAll('[data-i18n-ph]').forEach(el => {
    const key = el.getAttribute('data-i18n-ph');
    if (i18n[activeLang] && i18n[activeLang][key]) {
      el.placeholder = i18n[activeLang][key];
    }
  });
}

function changeAppLanguage(lang) {
  currentLang = i18n[lang] ? lang : 'en';
  localStorage.setItem('appLang', currentLang);
  applyLanguage(currentLang);
  if (typeof loadUserData === 'function') {
    loadUserData();
  }
}
