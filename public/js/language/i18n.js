const translations = { ar, en };
let currentLanguage = 'en';

function initI18n() {
  let userLang = 'en';
  if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initDataUnsafe && window.Telegram.WebApp.initDataUnsafe.user) {
    userLang = window.Telegram.WebApp.initDataUnsafe.user.language_code || 'en';
  }
  currentLanguage = userLang.startsWith('ar') ? 'ar' : 'en';
  applyTranslations();
}

function applyTranslations() {
  const langData = translations[currentLanguage] || translations['en'];
  document.querySelectorAll('[data-i18n]').forEach(element => {
    const key = element.getAttribute('data-i18n');
    if (langData[key]) {
      element.innerText = langData[key];
    }
  });
  document.documentElement.lang = currentLanguage;
  document.documentElement.dir = currentLanguage === 'ar' ? 'rtl' : 'ltr';
}

function toggleLanguage() {
  currentLanguage = currentLanguage === 'ar' ? 'en' : 'ar';
  applyTranslations();
}
