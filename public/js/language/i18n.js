/**
 * TelegaApp i18n Module - محرك الترجمة الموحد
 * File: public/js/language/i18n.js
 */

window.TelegaApp = window.TelegaApp || {};

(function () {
  'use strict';

  const SUPPORTED_LANGS = ['ar', 'en'];
  const DEFAULT_LANG = 'ar';
  const STORAGE_KEY = 'app_lang';

  const i18nModule = {
    currentLang: DEFAULT_LANG,

    /**
     * تهيئة محرك الترجمة وحفظ اللغة المحددة
     * @param {string} [userLang]
     */
    init: function (userLang) {
      const savedLang = localStorage.getItem(STORAGE_KEY);
      let lang = userLang || savedLang || document.documentElement.lang || DEFAULT_LANG;

      if (!SUPPORTED_LANGS.includes(lang)) {
        lang = DEFAULT_LANG;
      }

      this.setLanguage(lang);
    },

    /**
     * جلب قاموس الترجمة المتاح بمرونة
     * @param {string} lang 
     * @returns {Object}
     */
    getDictionary: function (lang) {
      const targetLang = lang || this.currentLang;

      // 1. الفحص في TelegaApp.translations
      if (window.TelegaApp && window.TelegaApp.translations && window.TelegaApp.translations[targetLang]) {
        return window.TelegaApp.translations[targetLang];
      }

      // 2. الفحص في المتغيرات العامة المتعددة (translationsAr / translationsEn)
      if (targetLang === 'ar' && window.translationsAr) return window.translationsAr;
      if (targetLang === 'en' && window.translationsEn) return window.translationsEn;

      // 3. الفحص في المتغيرات العامة البديلة (i18n_ar / i18n_en)
      if (targetLang === 'ar' && window.i18n_ar) return window.i18n_ar;
      if (targetLang === 'en' && window.i18n_en) return window.i18n_en;

      return {};
    },

    /**
     * تغيير اللغة الحالية وتحديث اتجاه الصفحة والعناصر
     * @param {string} lang 
     */
    setLanguage: function (lang) {
      if (!SUPPORTED_LANGS.includes(lang)) return;

      this.currentLang = lang;
      localStorage.setItem(STORAGE_KEY, lang);

      // تحديث اتجاه لغة الصفحة (RTL / LTR)
      document.documentElement.lang = lang;
      document.documentElement.dir = (lang === 'ar') ? 'rtl' : 'ltr';

      // تحديث رمز اللغة في الواجهة إن وجد
      const langCodeLabel = document.getElementById('current-lang-code');
      if (langCodeLabel) {
        langCodeLabel.textContent = lang.toUpperCase();
      }

      // تطبيق الترجمة على الشاشة
      this.translateDOM();
    },

    /**
     * جلب رمز اللغة الحالية
     * @returns {string}
     */
    getLang: function () {
      return this.currentLang;
    },

    /**
     * ترجمة مفتاح نصي محدد
     * @param {string} key 
     * @returns {string}
     */
    t: function (key) {
      if (!key) return '';

      const currentDict = this.getDictionary(this.currentLang);
      if (currentDict && currentDict[key] !== undefined) {
        return currentDict[key];
      }

      // محاولة البحث في اللغة البديلة (Fallback)
      const fallbackLang = this.currentLang === 'ar' ? 'en' : 'ar';
      const fallbackDict = this.getDictionary(fallbackLang);
      if (fallbackDict && fallbackDict[key] !== undefined) {
        return fallbackDict[key];
      }

      return key; // إرجاع المفتاح نفسه في حال عدم وجود ترجمة
    },

    /**
     * ترجمة كل العناصر الحاملة للخاصية [data-i18n]
     */
    translateDOM: function () {
      const elements = document.querySelectorAll('[data-i18n]');

      elements.forEach(el => {
        const key = el.getAttribute('data-i18n');
        const translation = this.t(key);

        if (!translation) return;

        // التعامل الذكي مع حقول الإدخال والـ Placeholders والأزرار
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
          if (['submit', 'button', 'reset'].includes(el.type)) {
            el.value = translation;
          } else if (el.hasAttribute('placeholder')) {
            el.placeholder = translation;
          } else {
            el.value = translation;
          }
        } else {
          el.textContent = translation;
        }
      });
    },

    // أسماء مستعارة (Aliases) لضمان عدم كسر أي كود قديم في تطبيقك
    updateDOM: function () {
      this.translateDOM();
    },

    applyTranslations: function () {
      this.translateDOM();
    }
  };

  // إسناد الكائن للواجهتين العامة المعتمدة في مشروعك
  window.TelegaApp.i18n = i18nModule;
  window.I18n = i18nModule;

})();
