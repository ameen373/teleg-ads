(function () {
  /**
   * كائن إدارة الترجمات i18n الخاص بتطبيق telega-ads
   */
  const i18n = {
    currentLang: 'ar',

    /**
     * استكشاف لغة المستخدم المحددة تلقائياً من Telegram WebApp أو LocalStorage
     */
    getInitialLanguage: function () {
      let storedLang = null;
      try {
        storedLang = localStorage.getItem('appLang') || localStorage.getItem('app_lang');
      } catch (e) {
        console.warn('LocalStorage is not accessible:', e);
      }

      if (storedLang && (storedLang === 'ar' || storedLang === 'en')) {
        return storedLang;
      }

      // جلب اللغة من Telegram WebApp API
      let tgLang = null;
      if (
        window.Telegram &&
        window.Telegram.WebApp &&
        window.Telegram.WebApp.initDataUnsafe &&
        window.Telegram.WebApp.initDataUnsafe.user &&
        window.Telegram.WebApp.initDataUnsafe.user.language_code
      ) {
        tgLang = window.Telegram.WebApp.initDataUnsafe.user.language_code.toLowerCase();
      }

      if (tgLang && tgLang.startsWith('ar')) {
        return 'ar';
      } else if (tgLang) {
        return 'en';
      }

      return 'ar';
    },

    /**
     * جلب القاموس الخاص باللغة المحددة
     */
    getDictionary: function (lang) {
      const active = lang || this.currentLang;
      if (active === 'ar' && window.ar) return window.ar;
      if (active === 'en' && window.en) return window.en;
      return window.ar || {};
    },

    /**
     * دالة الترجمة البرمجية t(key)
     * @param {string} key - مفتاح النص
     * @param {string} [lang] - اختيار لغة معينة (اختياري)
     */
    t: function (key, lang) {
      const dict = this.getDictionary(lang);
      return dict[key] !== undefined ? dict[key] : key;
    },

    /**
     * تغيير لغة التطبيق وتحديث واجهة المستخدم
     * @param {string} lang - رمز اللغة ('ar' أو 'en')
     */
    setLanguage: function (lang) {
      const targetLang = (lang === 'en' || lang === 'ar') ? lang : 'ar';
      this.currentLang = targetLang;

      try {
        localStorage.setItem('appLang', targetLang);
      } catch (e) {
        console.warn('Unable to save language preference:', e);
      }

      // مزامنة المتغيرات العامة للتطبيق في حال وجود حالة (state)
      if (window.state) window.state.currentLang = targetLang;
      if (window.UI) window.UI.currentLang = targetLang;

      this.updateDOM();

      // إعادة تحميل بيانات المستخدم إن وجد المعالج
      if (typeof window.loadUserData === 'function') {
        window.loadUserData();
      }

      return targetLang;
    },

    /**
     * تحديث عناصر DOM التي تحتوي على data-i18n أو data-i18n-placeholder أو data-i18n-ph تلقائياً
     * وتغيير اتجاه الصفحة تلقائياً (RTL / LTR)
     */
    updateDOM: function () {
      const lang = this.currentLang;
      const dict = this.getDictionary(lang);

      // تحديث اتجاه ولغة المستند الرئيسية
      document.documentElement.lang = lang;
      document.documentElement.dir = (lang === 'ar') ? 'rtl' : 'ltr';

      if (document.body) {
        document.body.dir = (lang === 'ar') ? 'rtl' : 'ltr';
      }

      // تحديث عناصر القوائم المنسدلة للغات إن وجدت
      const langSelect = document.getElementById('language-select');
      if (langSelect) langSelect.value = lang;

      // 1. تحديث النصوص المباشرة للعناصر: data-i18n
      document.querySelectorAll('[data-i18n]').forEach(function (el) {
        const key = el.getAttribute('data-i18n');
        if (dict[key] !== undefined) {
          el.innerText = dict[key];
        }
      });

      // 2. تحديث خانات الإدخال: data-i18n-placeholder و data-i18n-ph
      document.querySelectorAll('[data-i18n-placeholder], [data-i18n-ph]').forEach(function (el) {
        const key = el.getAttribute('data-i18n-placeholder') || el.getAttribute('data-i18n-ph');
        if (dict[key] !== undefined) {
          el.placeholder = dict[key];
        }
      });

      // 3. تحديث العناوين التوضيحية: data-i18n-title
      document.querySelectorAll('[data-i18n-title]').forEach(function (el) {
        const key = el.getAttribute('data-i18n-title');
        if (dict[key] !== undefined) {
          el.title = dict[key];
        }
      });

      // 4. تحديث قيم أزرار الإدخال: data-i18n-val
      document.querySelectorAll('[data-i18n-val]').forEach(function (el) {
        const key = el.getAttribute('data-i18n-val');
        if (dict[key] !== undefined) {
          el.value = dict[key];
        }
      });
    },

    /**
     * التهيئة الأولية لنظام الترجمة
     */
    init: function () {
      const initialLang = this.getInitialLanguage();
      this.setLanguage(initialLang);
    }
  };

  // تصدير الكائن والنظائر العامة إلى نطاق window
  window.i18n = i18n;

  window.t = function (key, lang) {
    return window.i18n.t(key, lang);
  };

  window.updateDOM = function () {
    return window.i18n.updateDOM();
  };

  window.changeAppLanguage = function (lang) {
    return window.i18n.setLanguage(lang);
  };

  window.applyLanguage = function (lang) {
    return window.i18n.setLanguage(lang);
  };

  // التفعيل التلقائي عند اكتمال تحميل المستند
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      window.i18n.init();
    });
  } else {
    window.i18n.init();
  }
})();
