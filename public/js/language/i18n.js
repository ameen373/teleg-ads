// توحيد القاموس العام لمنع أخطاء إعادة التعريف والتضارب
window.i18n = {
  ar: typeof ar !== 'undefined' ? ar : {},
  en: typeof en !== 'undefined' ? en : {}
};

let currentLang = localStorage.getItem('appLang') || 'ar';

window.changeAppLanguage = function(lang) {
  currentLang = window.i18n[lang] ? lang : 'ar';
  localStorage.setItem('appLang', currentLang);
  
  if (window.state) {
    window.state.currentLang = currentLang;
  }
  
  window.applyLanguage(currentLang);
  
  if (typeof window.loadUserData === 'function') {
    window.loadUserData();
  }
};

window.applyLanguage = function(lang) {
  const activeLang = window.i18n[lang] ? lang : 'ar';
  document.documentElement.lang = activeLang;
  document.documentElement.dir = activeLang === 'ar' ? 'rtl' : 'ltr';
  if (document.body) {
    document.body.style.direction = activeLang === 'ar' ? 'rtl' : 'ltr';
  }

  const langSelect = document.getElementById('language-select');
  if (langSelect) langSelect.value = activeLang;

  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (window.i18n[activeLang] && window.i18n[activeLang][key]) {
      el.innerText = window.i18n[activeLang][key];
    }
  });

  document.querySelectorAll('[data-i18n-ph]').forEach(el => {
    const key = el.getAttribute('data-i18n-ph');
    if (window.i18n[activeLang] && window.i18n[activeLang][key]) {
      el.placeholder = window.i18n[activeLang][key];
    }
  });
};

document.addEventListener('DOMContentLoaded', () => {
  window.applyLanguage(currentLang);
});
