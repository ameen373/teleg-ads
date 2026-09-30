// public/js/language/i18n.js
(function () {
  const i18n = {
    currentLang: "ar",

    /**
     * التهيئة الأولية واكتشاف لغة المستخدم
     */
    init: function () {
      let savedLang = null;

      // 1. محاولة قراءة اللغة المحفوظة سابقتً في localStorage
      try {
        savedLang = localStorage.getItem("appLang");
      } catch (e) {
        console.warn("localStorage is inaccessible:", e);
      }

      if (savedLang === "ar" || savedLang === "en") {
        this.currentLang = savedLang;
      } else {
        // 2. الفحص من بيانات Telegram WebApp إذا توفرت
        const tgLang = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code;
        if (tgLang && typeof tgLang === "string") {
          this.currentLang = tgLang.toLowerCase().startsWith("ar") ? "ar" : "en";
        } else {
          // 3. اللغة الافتراضية للمنصة
          this.currentLang = "ar";
        }
      }

      // تطبيق اللغة وتحديث الاتجاه والعناصر
      this.applyLanguage(this.currentLang);
    },

    /**
     * دالة الترجمة البرمجية للحصول على النص بواسطة المفتاح
     * @param {string} key - مفتاح النص
     * @param {string} [fallback] - النص البديل في حال عدم وجود المفتاح
     */
    t: function (key, fallback) {
      const activeDict = this.currentLang === "en" ? window.en : window.ar;
      if (activeDict && activeDict[key] !== undefined) {
        return activeDict[key];
      }

      // البحث في قاموس اللغة الأخرى كخيار احتياطي
      const altDict = this.currentLang === "en" ? window.ar : window.en;
      if (altDict && altDict[key] !== undefined) {
        return altDict[key];
      }

      return fallback !== undefined ? fallback : key;
    },

    /**
     * تغيير لغة التطبيق وحفظها
     * @param {string} lang - 'ar' أو 'en'
     */
    setLanguage: function (lang) {
      if (lang !== "ar" && lang !== "en") return;
      this.currentLang = lang;

      try {
        localStorage.setItem("appLang", lang);
      } catch (e) {
        console.warn("Failed to save language to localStorage:", e);
      }

      this.applyLanguage(lang);
    },

    /**
     * تحديث عناصر DOM بالترجمات وضبط اتجاه الصفحة (RTL/LTR)
     */
    updateDOM: function () {
      const lang = this.currentLang;

      // تحديث خصائص lang و dir للغة والاتجاه تلقائياً
      document.documentElement.lang = lang;
      document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";

      if (document.body) {
        document.body.dir = lang === "ar" ? "rtl" : "ltr";
      }

      // 1. تحديث النصوص الداخلية للعناصر التي تحتوي على data-i18n
      document.querySelectorAll("[data-i18n]").forEach((el) => {
        const key = el.getAttribute("data-i18n");
        const translated = this.t(key);
        if (translated) {
          el.innerText = translated;
        }
      });

      // 2. تحديث خانات الإدخال (Placeholder) لـ data-i18n-placeholder أو data-i18n-ph
      document.querySelectorAll("[data-i18n-placeholder], [data-i18n-ph]").forEach((el) => {
        const key = el.getAttribute("data-i18n-placeholder") || el.getAttribute("data-i18n-ph");
        const translated = this.t(key);
        if (translated) {
          el.placeholder = translated;
        }
      });

      // 3. تحديث العناوين التوضيحية (Title) لـ data-i18n-title
      document.querySelectorAll("[data-i18n-title]").forEach((el) => {
        const key = el.getAttribute("data-i18n-title");
        const translated = this.t(key);
        if (translated) {
          el.title = translated;
        }
      });

      // 4. تحديث قيم الأزرار والإدخالات (Value) لـ data-i18n-val
      document.querySelectorAll("[data-i18n-val]").forEach((el) => {
        const key = el.getAttribute("data-i18n-val");
        const translated = this.t(key);
        if (translated) {
          el.value = translated;
        }
      });

      // 5. تحديث قائمة اختيار اللغة إن وجدت
      const langSelect = document.getElementById("language-select");
      if (langSelect) {
        langSelect.value = lang;
      }
    },

    /**
     * تطبيق اللغة وتحديث الاتجاه والعناصر
     */
    applyLanguage: function (lang) {
      if (lang) this.currentLang = lang;
      this.updateDOM();
    }
  };

  // إتاحة الكائن والدوال العامة على نطاق window
  window.i18n = i18n;

  window.t = function (key, fallback) {
    return i18n.t(key, fallback);
  };

  window.updateDOM = function () {
    i18n.updateDOM();
  };

  window.changeAppLanguage = function (lang) {
    i18n.setLanguage(lang);
  };

  window.applyLanguage = function (lang) {
    i18n.applyLanguage(lang);
  };

  // التشغيل التلقائي فور اكتمال تحميل عناصر الصفحة DOM
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      i18n.init();
    });
  } else {
    i18n.init();
  }
})();
