/**
 * TelegaApp - API Module
 * File: public/js/modules/api.js
 */
(function () {
  'use strict';

  // ضمان وجود الكائن العام للـ App
  window.TelegaApp = window.TelegaApp || {};

  const API = {
    baseUrl: '',
    token: localStorage.getItem('jwt_token') || '',

    /**
     * حفظ وتحديث توكن الـ JWT
     */
    setToken: function (newToken) {
      this.token = newToken || '';
      if (newToken) {
        localStorage.setItem('jwt_token', newToken);
      } else {
        localStorage.removeItem('jwt_token');
      }
    },

    /**
     * جلب بيانات InitData الخاصة بتليجرام
     */
    getInitData: function () {
      return window.Telegram?.WebApp?.initData || '';
    },

    /**
     * دالة الطلبات البرمجية المركزية مع معالجة الأخطاء والتنبيه عبر UI
     */
    request: async function (endpoint, method = 'GET', data = null, customHeaders = {}) {
      const headers = {
        'Content-Type': 'application/json',
        'x-telegram-init-data': this.getInitData(),
        ...customHeaders
      };

      // إضافة توكن المصادقة إن وجد
      if (this.token) {
        headers['Authorization'] = `Bearer ${this.token}`;
      }

      // هيدرات احتياطية للمستخدم من تليجرام
      if (window.Telegram?.WebApp?.initDataUnsafe?.user) {
        const user = window.Telegram.WebApp.initDataUnsafe.user;
        headers['x-telegram-id'] = user.id.toString();
        headers['x-telegram-username'] = user.username || user.first_name || '';
      }

      const config = {
        method,
        headers
      };

      if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE')) {
        config.body = JSON.stringify(data);
      }

      try {
        const response = await fetch(`${this.baseUrl}${endpoint}`, config);
        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || result.message || 'فشل الطلب البرمجي');
        }

        return result;
      } catch (err) {
        console.error(`API Error [${endpoint}]:`, err.message);
        if (window.TelegaApp?.ui?.showToast) {
          window.TelegaApp.ui.showToast(err.message || 'حدث خطأ في الاتصال بالسيرفر');
        } else if (window.TelegaApp?.ui?.showAlert) {
          window.TelegaApp.ui.showAlert(err.message || 'حدث خطأ في الاتصال بالسيرفر', true);
        }
        throw err;
      }
    },

    // ==========================================
    // 1. الإعدادات والمصادقة (Auth & Config)
    // ==========================================
    getConfig: function () { return this.request('/api/config'); },
    authTelegram: function (data) { return this.request('/api/auth/telegram', 'POST', data); },
    getMe: function () { return this.request('/api/user/me'); },

    // ==========================================
    // 2. المحفظة والعمليات (Wallet & Ledger)
    // ==========================================
    getWalletInfo: function () { return this.request('/api/wallet/info'); },
    getDepositAddresses: function () { return this.request('/api/wallet/deposit-addresses'); },
    saveWalletAddress: function (address) { return this.request('/api/wallet/address', 'POST', { address }); },
    deposit: function (data) { return this.request('/api/wallet/deposit', 'POST', typeof data === 'object' ? data : { amount: data }); },
    withdraw: function (amount) { return this.request('/api/wallet/withdraw', 'POST', { amount }); },
    getTransactions: function () { return this.request('/api/wallet/transactions'); },
    getWithdrawalsHistory: function () { return this.request('/api/wallet/withdrawals'); },
    getDepositsHistory: function () { return this.request('/api/wallet/deposits'); },
    getReferralStats: function () { return this.request('/api/referrals/stats'); },
    getLedger: function () { return this.request('/api/wallet/ledger'); },

    // ==========================================
    // 3. الحملات الإعلانية والتفاعل (Ads)
    // ==========================================
    getCampaigns: function () { return this.request('/api/campaigns'); },
    createCampaign: function (data) { return this.request('/api/campaigns', 'POST', data); },
    submitCampaign: function (id) { return this.request(`/api/campaigns/${id}/submit`, 'POST'); },
    pauseCampaign: function (id) { return this.request(`/api/campaigns/${id}/pause`, 'POST'); },
    resumeCampaign: function (id) { return this.request(`/api/campaigns/${id}/resume`, 'POST'); },
    cancelCampaign: function (id) { return this.request(`/api/campaigns/${id}/cancel`, 'POST'); },
    serveAd: function () { return this.request('/api/ads/serve'); },
    clickAd: function (campaignId, publisherId) { return this.request('/api/ads/click', 'POST', { campaignId, publisherId }); },
    getActiveAds: function () { return this.request('/api/ads/active'); },
    getMyAds: function () { return this.request('/api/ads/my-ads'); },

    // ==========================================
    // 4. اختصار الروابط (URL Shortener)
    // ==========================================
    shorten: function (originalUrl) { return this.request('/api/shortener/shorten', 'POST', { originalUrl }); },
    createLink: function (data) { return this.request('/api/links/create', 'POST', data); },
    getShortLinks: function (telegramId) { 
      return telegramId ? this.request(`/api/links?telegramId=${telegramId}`) : this.request('/api/shortener/links'); 
    },
    deleteLink: function (shortId, data) { return this.request(`/api/links/${shortId}`, 'DELETE', data); },
    getLinkStats: function (shortId) { return this.request(`/api/links/stats/${shortId}`); },

    // ==========================================
    // 5. لوحة التحكم والإدارة (Admin Panel)
    // ==========================================
    getDashboard: function () { return this.request('/api/admin/dashboard'); },
    getAdminStats: function () { return this.request('/api/admin/stats'); },
    getAdminUsers: function () { return this.request('/api/admin/users'); },
    getAdminCampaigns: function () { return this.request('/api/admin/campaigns'); },
    approveCampaign: function (id) { return this.request(`/api/admin/campaigns/${id}/approve`, 'POST'); },
    rejectCampaign: function (id) { return this.request(`/api/admin/campaigns/${id}/reject`, 'POST'); },
    getWithdrawals: function () { return this.request('/api/admin/withdrawals'); },
    handleWithdrawal: function (id, action, adminNotes) { return this.request('/api/admin/withdrawals/action', 'POST', { id, action, adminNotes }); },
    getDeposits: function () { return this.request('/api/admin/deposits'); },
    handleDeposit: function (id, action, rejectionReason) { return this.request('/api/admin/deposits/action', 'POST', { id, action, rejectionReason }); },
    searchUsers: function (query) { return this.request(`/api/admin/users/search?query=${encodeURIComponent(query)}`); },
    getUserProfile: function (id) { return this.request(`/api/admin/users/profile/${id}`); },
    updateUserStatus: function (userId, status, role) { return this.request('/api/admin/users/status', 'POST', { userId, status, role }); },
    saveAdminConfig: function (data) { return this.request('/api/admin/config', 'POST', data); },
    getAds: function () { return this.request('/api/admin/ads'); },
    manageAd: function (payload) { return this.request('/api/admin/ads/manage', 'POST', payload); }
  };

  // ربط الكائن بالأسماء العامة المتوافقة مع التطبيق
  window.TelegaApp.api = API;
  window.API = API;
})();
