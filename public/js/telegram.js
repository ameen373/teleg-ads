// public/js/telegram.js

(function () {
  'use strict';

  const tg = window.Telegram?.WebApp;

  /**
   * 1. تهيئة تطبيق Telegram Mini App
   */
  function initTelegramApp() {
    if (!tg) {
      console.warn('[Telegram WebApp] SDK غير متاح. يرجى الفتح من داخل تطبيق تيليجرام.');
      return;
    }

    try {
      tg.ready();
      tg.expand();
      if (typeof tg.setHeaderColor === 'function') {
        tg.setHeaderColor('secondary');
      }
    } catch (err) {
      console.error('[Telegram Init Error]:', err);
    }
  }

  /**
   * 2. استخراج initData بأمان من الكائن المتاح
   * @returns {string}
   */
  function getInitData() {
    return tg?.initData || '';
  }

  /**
   * 3. دالة الطلبات الموحدة (Fetch Wrapper)
   * ترفق x-telegram-init-data و Authorization تلقائياً
   * @param {string} url 
   * @param {object} options 
   * @returns {Promise<object>}
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
   * 4. ردود الفعل اللمسية (Haptic Feedback)
   * @param {string} type 
   * @param {string} style 
   */
  function triggerHaptic(type = 'impact', style = 'medium') {
    if (!tg?.HapticFeedback) return;
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
   * 5. فتح الروابط الخارجية داخل أو خارج تيليجرام
   * @param {string} url 
   */
  function openTelegramLink(url) {
    if (!url) return;

    if (tg) {
      const isTgScheme = url.startsWith('https://t.me/') || url.startsWith('http://t.me/') || url.startsWith('tg://');
      if (isTgScheme && typeof tg.openTelegramLink === 'function') {
        tg.openTelegramLink(url);
      } else if (typeof tg.openLink === 'function') {
        tg.openLink(url);
      } else {
        window.open(url, '_blank');
      }
    } else {
      window.open(url, '_blank');
    }
  }

  // تشغيل التهيئة تلقائياً
  initTelegramApp();

  // تصدير الكائن العام
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
