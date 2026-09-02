// public/js/telegram.js

(function () {
  const tg = window.Telegram?.WebApp;

  /**
   * 1. تهيئة تطبيق Telegram Mini App
   */
  function initTelegramApp() {
    if (tg) {
      tg.ready();
      tg.expand();
      if (tg.setHeaderColor) {
        tg.setHeaderColor('secondary');
      }
    } else {
      console.warn('Telegram WebApp SDK is not available.');
    }
  }

  /**
   * 2. استخراج initData بشكل مباشر وآمن
   * @returns {string}
   */
  function getInitData() {
    return tg?.initData || '';
  }

  /**
   * 3. دالة الطلبات الموحدة (Fetch Wrapper)
   * ترفق x-telegram-init-data و Authorization تلقائياً مع كل طلب
   */
  async function apiFetch(url, options = {}) {
    const initData = getInitData();
    const headers = {
      'Content-Type': 'application/json',
      'x-telegram-init-data': initData,
      'Authorization': `tma ${initData}`,
      ...(options.headers || {})
    };

    const config = {
      ...options,
      headers
    };

    try {
      const response = await fetch(url, config);
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        return {
          success: false,
          status: response.status,
          message: data.message || `خطأ في الطلب (${response.status})`
        };
      }

      return data;
    } catch (error) {
      console.error(`[API Fetch Error - ${url}]:`, error);
      return {
        success: false,
        status: 0,
        message: 'تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت.'
      };
    }
  }

  /**
   * 4. تشغيل ردود الفعل اللمسية (Haptic Feedback)
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
          tg.HapticFeedback.selectionChanged();
          break;
        default:
          tg.HapticFeedback.impactOccurred('medium');
      }
    } catch (error) {
      console.error('[Haptic Error]:', error);
    }
  }

  /**
   * 5. فتح الروابط الخارجيّة
   */
  function openTelegramLink(url) {
    if (!url) return;
    if (tg) {
      if (url.startsWith('https://t.me/') || url.startsWith('http://t.me/') || url.startsWith('tg://')) {
        if (typeof tg.openTelegramLink === 'function') {
          tg.openTelegramLink(url);
        } else {
          window.open(url, '_blank');
        }
      } else {
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

  // تشغيل التهيئة تلقائياً
  initTelegramApp();

  // تصدير الكائن على نطاق window
  window.TelegramApp = {
    tg,
    getInitData,
    apiFetch,
    triggerHaptic,
    openTelegramLink,
    getUser: function () {
      return tg?.initDataUnsafe?.user || null;
    }
  };
})();
