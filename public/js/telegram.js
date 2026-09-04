// public/js/telegram.js

(function () {
  'use strict';

  const TelegramApp = {
    initData: '',
    
    init: function () {
      if (window.Telegram && window.Telegram.WebApp) {
        const tg = window.Telegram.WebApp;
        tg.ready();
        tg.expand();
        this.initData = tg.initData || this.extractInitDataFromUrl() || '';
      } else {
        this.initData = this.extractInitDataFromUrl() || '';
      }
    },

    extractInitDataFromUrl: function () {
      const urlParams = new URLSearchParams(window.location.search);
      const hash = urlParams.get('tgWebAppData');
      if (hash) return decodeURIComponent(hash);
      
      if (window.location.hash && window.location.hash.includes('tgWebAppData=')) {
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        return decodeURIComponent(hashParams.get('tgWebAppData') || '');
      }
      return '';
    },

    getInitData: function () {
      if (!this.initData) {
        this.init();
      }
      return this.initData;
    },

    getUser: function () {
      if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initDataUnsafe) {
        return window.Telegram.WebApp.initDataUnsafe.user || null;
      }
      return null;
    },

    triggerHaptic: function (type = 'impact', style = 'medium') {
      try {
        if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.HapticFeedback) {
          const haptic = window.Telegram.WebApp.HapticFeedback;
          if (type === 'impact') {
            haptic.impactOccurred(style);
          } else if (type === 'notification') {
            haptic.notificationOccurred(style);
          } else if (type === 'selection') {
            haptic.selectionChanged();
          }
        }
      } catch (e) {
        // Haptic feedback fallback
      }
    },

    apiFetch: async function (url, options = {}) {
      const initData = this.getInitData();
      
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `tma ${initData}`,
        'x-telegram-init-data': initData,
        ...(options.headers || {})
      };

      try {
        const response = await fetch(url, {
          ...options,
          headers
        });

        const data = await response.json();
        
        if (!response.ok) {
          return {
            success: false,
            status: response.status,
            message: data.message || 'فشلت العملية'
          };
        }
        
        return data;
      } catch (err) {
        console.error('[TelegramApp apiFetch Error]:', err);
        return {
          success: false,
          status: 0,
          message: 'فشل الاتصال بالخادم، يرجى التحقق من الشبكة'
        };
      }
    }
  };

  TelegramApp.init();
  window.TelegramApp = TelegramApp;
})();
