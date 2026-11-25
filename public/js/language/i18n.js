window.I18n = (function () {
  var currentLang = 'ar';

  function getDictionary() {
    return currentLang === 'en' ? window.LANG_EN : window.LANG_AR;
  }

  function applyLanguage(lang) {
    currentLang = lang === 'en' ? 'en' : 'ar';
    var dict = getDictionary();

    document.documentElement.lang = dict.lang;
    document.documentElement.dir = dict.dir;

    var toggleBtn = document.getElementById('lang-toggle-btn');
    if (toggleBtn) {
      toggleBtn.textContent = dict.toggleLabel;
    }

    var labels = document.querySelectorAll('[data-i18n]');
    labels.forEach(function (el) {
      var key = el.getAttribute('data-i18n');
      if (dict[key]) {
        el.textContent = dict[key];
      }
    });

    if (window.UI && typeof window.UI.refreshHeaderTitle === 'function') {
      window.UI.refreshHeaderTitle();
    }
  }

  function toggleLanguage() {
    applyLanguage(currentLang === 'ar' ? 'en' : 'ar');
  }

  function t(key) {
    var dict = getDictionary();
    return dict[key] || key;
  }

  return {
    applyLanguage: applyLanguage,
    toggleLanguage: toggleLanguage,
    t: t
  };
})();
