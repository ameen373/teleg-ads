// public/js/telegram.js

(function () {
  // التأكد من تحميل مكتبة Telegram WebApp
  const tg = window.Telegram?.WebApp;

  /**
   * 1. تهيئة تطبيق Telegram Mini App
   */
  function initTelegramApp() {
    if (tg) {
      tg.ready();
      tg.expand();
      
      // تعيين لون شريط العنوان ليتناسب مع المظهر
      if (tg.setHeaderColor) {
        tg.setHeaderColor('secondary');
      }
    } else {
      console.warn('Telegram WebApp library is not available.');
    }
  }

  /**
   * 2. استخراج بيانات الاعتماد (initData) لإرسالها في الترويسات للـ API
   * @returns {string} سلسلة initData الخام
   */
  function getInitData() {
    if (tg && tg.initData) {
      return tg.initData;
    }
    return '';
  }

  /**
   * 3. تشغيل ردود الفعل اللمسية (Haptic Feedback)
   * @param {string} type - نوع الاهتزاز ('impact', 'notification', 'selection')
   * @param {string} style - النمط الخاص بالنص أو الإشعار (مثال: 'light', 'medium', 'heavy' لـ impact أو 'error', 'success', 'warning' لـ notification)
   */
  function triggerHaptic(type = 'impact', style = 'medium') {
    if (!tg || !tg.HapticFeedback) return;

    try {
      switch (type) {
        case 'impact':
          tg.HapticFeedback.impactOccurred(style);
          break;
        case 'notification':
          tg.HapticFeedback.notificationOccurred(style);
          break;
        case 'selection':
        case 'selectionChanged':
          tg.HapticFeedback.selectionChanged();
          break;
        default:
          tg.HapticFeedback.impactOccurred('medium');
      }
    } catch (error) {
      console.error('[HapticFeedback Error]:', error);
    }
  }

  /**
   * 4. فتح الروابط الخارجية أو روابط تيليجرام
   * @param {string} url - الرابط المراد فتحه
   */
  function openTelegramLink(url) {
    if (!url) return;

    if (tg) {
      // إذا كان الرابط رابط تيليجرام داخلي (t.me أو tg://)
      if (url.startsWith('https://t.me/') || url.startsWith('http://t.me/') || url.startsWith('tg://')) {
        if (typeof tg.openTelegramLink === 'function') {
          tg.openTelegramLink(url);
        } else {
          window.open(url, '_blank');
        }
      } else {
        // إذا كان رابط ويب عادي
        if (typeof tg.openLink === 'function') {
          tg.openLink(url);
        } else {
          window.open(url, '_blank');
        }
      }
    } else {
      window.open(url, '_blank');
    }
  }

  // تشغيل التهيئة تلقائياً عند تحميل الملف
  initTelegramApp();

  // إتاحة الوظائف الكائنية والبيانات على نطاق window العام لاستخدامها في أجزاء التطبيق المختلفة
  window.TelegramApp = {
    tg,
    getInitData,
    triggerHaptic,
    openTelegramLink,
    getUser: function () {
      return tg?.initDataUnsafe?.user || null;
    }
  };
})();

