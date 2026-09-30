// Telega.ads - Main Application Controller (public/js/app.js)

// استيراد الوحدات بأسلوب CommonJS لتوافقية بيئات التجميع والترميز
if (typeof require !== 'undefined') {
  try {
    var i18n = require('./i18n.js');
    var UI = require('./ui.js');
    var API = require('./api.js');
    var ShortenerModule = require('./shortener.js');
    var AdsModule = require('./ads.js');
    var WalletModule = require('./wallet.js');
    var AdminModule = require('./admin.js');
  } catch (e) {
    // التجاوز في حالة التشغيل المباشر داخل متصفح الويب
  }
}

// -------------------------------------------------------------
// 1. معالج الأخطاء العام (Global Error Handlers)
// -------------------------------------------------------------
window.onerror = function (message, source, lineno, colno, error) {
  console.error('[App Global Error]:', message, 'at', source, 'line:', lineno, colno, error);
  if (window.UI && typeof window.UI.showToast === 'function') {
    const lang = window.UI.currentLang || 'ar';
    window.UI.showToast(lang === 'ar' ? 'حدث خطأ غير متوقع في النظام' : 'An unexpected error occurred');
  }
  return true; // منع توقف التطبيق أو انهياره
};

window.addEventListener('unhandledrejection', function (event) {
  console.error('[Unhandled Rejection]:', event.reason);
  if (window.UI && typeof window.UI.showToast === 'function') {
    const lang = window.UI.currentLang || 'ar';
    window.UI.showToast(lang === 'ar' ? 'خطأ في الاتصال بالشبكة أو الاستجابة' : 'Network/Promise rejection error');
  }
});

// -------------------------------------------------------------
// 2. الكائن التشغيلي الرئيسي للواجهة والتطبيق (App Engine)
// -------------------------------------------------------------
window.App = {
  activeTab: 'dashboard',

  /**
   * دالة التفاعل اللمسي (Haptic Feedback) لـ Telegram Mini App
   */
  triggerHaptic: function (type = 'impact', style = 'light') {
    try {
      const tg = window.Telegram?.WebApp;
      if (!tg || !tg.HapticFeedback) return;

      if (type === 'impact') {
        tg.HapticFeedback.impactOccurred(style);
      } else if (type === 'notification') {
        tg.HapticFeedback.notificationOccurred(style);
      } else if (type === 'selection') {
        tg.HapticFeedback.selectionChanged();
      }
    } catch (err) {
      console.warn('Haptic Feedback Error:', err);
    }
  },

  /**
   * تهيئة بيئة Telegram Mini App المدمجة
   */
  initTelegramWebApp: function () {
    try {
      const tg = window.Telegram?.WebApp;
      if (tg) {
        tg.ready();
        tg.expand();

        if (typeof tg.setHeaderColor === 'function') tg.setHeaderColor('secondary');
        if (typeof tg.setBackgroundColor === 'function') tg.setBackgroundColor('bg_color');
        if (typeof tg.enableClosingConfirmation === 'function') tg.enableClosingConfirmation();
      }
    } catch (error) {
      console.error('Telegram WebApp initialization error:', error);
    }
  },

  /**
   * التحكم بظهور تبويب الإدارة عند التحقق من صلاحيات المدير
   */
  setupAdminRole: function (isAdmin) {
    const adminTabBtn = document.getElementById('tab-btn-admin');
    const adminElements = document.querySelectorAll('.admin-only');

    window.isUserAdmin = !!isAdmin;

    if (isAdmin) {
      if (adminTabBtn) adminTabBtn.style.display = 'flex';
      adminElements.forEach(el => { if (el) el.style.display = ''; });

      if (window.AdminModule && typeof window.AdminModule.checkAdminAccess === 'function') {
        window.AdminModule.checkAdminAccess();
      }
    } else {
      if (adminTabBtn) adminTabBtn.style.display = 'none';
      adminElements.forEach(el => { if (el) el.style.display = 'none'; });

      const adminTabSection = document.getElementById('tab-admin');
      if (adminTabSection) adminTabSection.classList.add('hidden');
    }
  },

  /**
   * نظام التنقل الديناميكي بين التبويبات (Tab Switching) دون إعادة تحميل الصفحة
   */
  switchTab: function (targetTabId) {
    if (!targetTabId) return;

    this.activeTab = targetTabId;
    this.triggerHaptic('selection');

    const allTabs = ['dashboard', 'wallet', 'ads', 'referral', 'settings', 'admin'];

    allTabs.forEach(tabId => {
      const btn = document.getElementById(`tab-btn-${tabId}`);
      const section = document.getElementById(`tab-${tabId}`);

      if (btn) {
        if (tabId === targetTabId) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      }

      if (section) {
        if (tabId === targetTabId) {
          section.classList.remove('hidden');
        } else {
          section.classList.add('hidden');
        }
      }
    });

    // تحديث وتحميل البيانات الحية الخاصة بالتبويب المفتوح
    if (targetTabId === 'dashboard' || targetTabId === 'wallet') {
      if (window.WalletModule && typeof window.WalletModule.loadUserData === 'function') {
        window.WalletModule.loadUserData();
      }
      if (window.ShortenerModule && typeof window.ShortenerModule.fetchUserLinks === 'function') {
        window.ShortenerModule.fetchUserLinks();
      }
    } else if (targetTabId === 'ads') {
      if (window.AdsModule && typeof window.AdsModule.fetchUserAds === 'function') {
        window.AdsModule.fetchUserAds();
      }
    } else if (targetTabId === 'referral') {
      if (window.WalletModule && typeof window.WalletModule.fetchUserReferrals === 'function') {
        window.WalletModule.fetchUserReferrals();
      }
    } else if (targetTabId === 'admin') {
      if (window.isUserAdmin && window.AdminModule && typeof window.AdminModule.loadAdminData === 'function') {
        window.AdminModule.loadAdminData();
      }
    }
  },

  /**
   * ربط أحداث الملاحة والمستمعين بين أزرار التبويبات
   */
  initTabNavigation: function () {
    const navTabs = ['dashboard', 'wallet', 'ads', 'referral', 'settings', 'admin'];

    navTabs.forEach(tabId => {
      const btn = document.getElementById(`tab-btn-${tabId}`);
      if (btn) {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          this.switchTab(tabId);
        });
      }
    });
  },

  /**
   * تهيئة منطق صفحة التحويل والجسر المقتطع (/r/:code)
   */
  initBridgeLogic: async function (code) {
    if (window.ShortenerModule && typeof window.ShortenerModule.initBridgeView === 'function') {
      await window.ShortenerModule.initBridgeView(code);
    }
  },

  /**
   * ربط كافة أحداث الواجهة العامة والأزرار مع الوحدات المخصصة
   */
  bindEventListeners: function () {
    // 1. اختصار رابط جديد
    const btnCreateLink = document.getElementById('btn-create-link');
    if (btnCreateLink) {
      btnCreateLink.addEventListener('click', (e) => {
        this.triggerHaptic('impact', 'medium');
        if (window.ShortenerModule && typeof window.ShortenerModule.handleShortenClick === 'function') {
          window.ShortenerModule.handleShortenClick(e);
        }
      });
    }

    // 2. البحث والتصفية للروابط
    const searchInput = document.getElementById('search-links-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        if (window.ShortenerModule && typeof window.ShortenerModule.filterUserLinks === 'function') {
          window.ShortenerModule.filterUserLinks(e.target.value);
        }
      });
    }

    // 3. تقديم طلب إيداع
    const btnDeposit = document.getElementById('btn-request-deposit');
    if (btnDeposit) {
      btnDeposit.addEventListener('click', (e) => {
        e.preventDefault();
        this.triggerHaptic('impact', 'medium');
        if (window.WalletModule && typeof window.WalletModule.requestDeposit === 'function') {
          window.WalletModule.requestDeposit();
        }
      });
    }

    // 4. تقديم طلب سحب
    const btnWithdraw = document.getElementById('btn-request-withdraw');
    if (btnWithdraw) {
      btnWithdraw.addEventListener('click', (e) => {
        e.preventDefault();
        this.triggerHaptic('impact', 'medium');
        if (window.WalletModule && typeof window.WalletModule.requestWithdrawal === 'function') {
          window.WalletModule.requestWithdrawal();
        }
      });
    }

    // 5. حفظ عنوان المحفظة الافتراضية
    const btnSaveWallet = document.getElementById('save-wallet-btn');
    if (btnSaveWallet) {
      btnSaveWallet.addEventListener('click', (e) => {
        e.preventDefault();
        this.triggerHaptic('impact', 'medium');
        if (window.WalletModule && typeof window.WalletModule.saveSettings === 'function') {
          window.WalletModule.saveSettings();
        }
      });
    }

    // 6. إنشاء حملة إعلانية
    const btnCreateAd = document.getElementById('btn-create-ad');
    if (btnCreateAd) {
      btnCreateAd.addEventListener('click', (e) => {
        e.preventDefault();
        this.triggerHaptic('impact', 'heavy');
        if (window.AdsModule && typeof window.AdsModule.createAdCampaign === 'function') {
          window.AdsModule.createAdCampaign();
        }
      });
    }

    // 7. تغيير نوع الإعلان
    const adTypeSelect = document.getElementById('ad-type');
    if (adTypeSelect) {
      adTypeSelect.addEventListener('change', () => {
        this.triggerHaptic('selection');
        if (window.AdsModule && typeof window.AdsModule.onAdTypeChange === 'function') {
          window.AdsModule.onAdTypeChange();
        }
      });
    }

    // 8. اختيار لغة التطبيق
    const languageSelect = document.getElementById('language-select');
    if (languageSelect) {
      languageSelect.addEventListener('change', (e) => {
        this.triggerHaptic('selection');
        const lang = e.target.value;
        if (window.i18n && typeof window.i18n.setLanguage === 'function') {
          window.i18n.setLanguage(lang);
        }
      });
    }

    // 9. مشاركة رابط الإحالة عبر تليجرام
    const btnShareRef = document.getElementById('btn-share-ref');
    if (btnShareRef) {
      btnShareRef.addEventListener('click', () => {
        this.triggerHaptic('impact', 'light');
        if (window.UI && typeof window.UI.shareReferralLink === 'function') {
          window.UI.shareReferralLink();
        }
      });
    }
  },

  /**
   * نقطة الانطلاق الرئيسية والبدء لتشغيل التطبيق بالكامل
   */
  init: async function () {
    try {
      // 1. تهيئة بيئة تليجرام المدمجة
      this.initTelegramWebApp();

      // 2. تهيئة اللغة وترجمة واجهة المستخدم
      if (window.i18n && typeof window.i18n.init === 'function') {
        window.i18n.init();
      }

      // 3. عرض بيانات المستخدم الأولية للواجهة
      if (window.UI && typeof window.UI.renderTelegramUser === 'function') {
        window.UI.renderTelegramUser();
      }

      // 4. مصادقة المستخدم وجلب بيانات الملف الشخصي والصلاحيات
      let user = null;
      try {
        const apiInstance = window.API || (typeof require !== 'undefined' ? require('./api.js') : {});
        if (typeof apiInstance.getProfile === 'function') {
          user = await apiInstance.getProfile();
        } else if (typeof apiInstance.getDashboardData === 'function') {
          const dashData = await apiInstance.getDashboardData();
          user = dashData ? (dashData.user || dashData) : null;
        }
      } catch (authErr) {
        console.error("Authentication/Profile Fetch Error:", authErr);
      }

      // 5. التحقق من صلاحيات المدير واستحقاق لوحة الإدارة
      const isAdmin = !!(user && (user.role === 'admin' || user.isAdmin === true));
      this.setupAdminRole(isAdmin);

      // 6. التحقق من مسارات صفحات التحويل والجسر (/r/:code)
      const pathParts = window.location.pathname.split('/');
      if (pathParts.length >= 3 && pathParts[1] === 'r') {
        const shortCode = pathParts[2];
        if (shortCode) {
          await this.initBridgeLogic(shortCode);
          return;
        }
      }

      // 7. تهيئة الملاحة بين التبويبات وربط الأحداث
      this.initTabNavigation();
      this.bindEventListeners();

      // 8. تحميل البيانات التشغيلية للوحة التحكم الرئيسية
      if (window.WalletModule && typeof window.WalletModule.loadUserData === 'function') {
        await window.WalletModule.loadUserData();
      }

      if (window.ShortenerModule && typeof window.ShortenerModule.fetchUserLinks === 'function') {
        await window.ShortenerModule.fetchUserLinks();
      }

    } catch (err) {
      console.error('Critical boot error in App.init:', err);
    }
  }
};

// -------------------------------------------------------------
// 3. تشغيل التطبيق فور اكتمال تحميل مستند الـ DOM
// -------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  window.App.init();
});

// تصدير الكود لدعم نظام الوحدات CommonJS
if (typeof module !== 'undefined' && module.exports) {
  module.exports = window.App;
}
