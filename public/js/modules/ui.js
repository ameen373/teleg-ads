/**
 * TelegaApp UI Module
 * File: public/js/modules/ui.js
 */
(function () {
  'use strict';

  window.TelegaApp = window.TelegaApp || {};

  const UI = {
    // ==========================================
    // 1. التهيئة والأحداث
    // ==========================================
    init: function () {
      this.bindNavEvents();
      this.bindModalEvents();
    },

    bindNavEvents: function () {
      const navItems = document.querySelectorAll('.nav-item');
      navItems.forEach((item) => {
        item.addEventListener('click', () => {
          const targetTab = item.getAttribute('data-tab');
          if (targetTab) {
            this.switchTab(targetTab);
          }
        });
      });
    },

    bindModalEvents: function () {
      document.querySelectorAll('.closeModal').forEach((btn) => {
        btn.addEventListener('click', () => {
          this.closeModal();
        });
      });

      document.getElementById('faq-open-btn')?.addEventListener('click', () => {
        this.openModal('faq-modal');
      });
    },

    // ==========================================
    // 2. التنقل وتبديل الشاشات
    // ==========================================
    switchTab: function (tabId) {
      document.querySelectorAll('.nav-item').forEach((el) => el.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach((el) => {
        el.classList.remove('active');
        el.classList.add('hidden');
      });

      const activeNav = document.querySelector(`.nav-item[data-tab="${tabId}"]`);
      const activeContent = document.getElementById(tabId);

      if (activeNav) activeNav.classList.add('active');
      if (activeContent) {
        activeContent.classList.add('active');
        activeContent.classList.remove('hidden');
      }

      // استدعاء الموديولات التابعة بأمان عند التنقل
      if (tabId === 'tab-home') {
        window.TelegaApp.shortener?.loadMyLinks?.();
        window.TelegaApp.ads?.loadActiveAds?.();
      } else if (tabId === 'tab-promote') {
        window.TelegaApp.ads?.loadMyCampaigns?.();
      } else if (tabId === 'tab-wallet') {
        window.TelegaApp.wallet?.loadTransactions?.();
        window.TelegaApp.wallet?.loadDepositHistory?.();
        window.TelegaApp.wallet?.loadWithdrawalHistory?.();
      } else if (tabId === 'tab-referral') {
        window.TelegaApp.wallet?.loadReferralData?.();
      } else if (tabId === 'tab-admin') {
        window.TelegaApp.admin?.loadAdminData?.();
      }
    },

    showTab: function (tabId) {
      this.switchTab(tabId);
    },

    showView: function (viewId) {
      document.querySelectorAll('.view').forEach((view) => view.classList.add('hidden'));
      const target = document.getElementById(viewId);
      if (target) target.classList.remove('hidden');
    },

    // ==========================================
    // 3. إدارة النوافذ المنبثقة (Modals)
    // ==========================================
    openModal: function (modalId) {
      const modal = document.getElementById(modalId);
      if (modal) {
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
      }
    },

    closeModal: function (modalId) {
      if (modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
          modal.classList.add('hidden');
          modal.style.display = 'none';
        }
      } else {
        document.querySelectorAll('.modal').forEach((m) => {
          m.classList.add('hidden');
          m.style.display = 'none';
        });
        const dynamicModal = document.getElementById('ui-modal');
        if (dynamicModal) dynamicModal.remove();
      }
    },

    showModal: function (modalIdOrHtml) {
      if (!modalIdOrHtml) return;

      const existingModal = document.getElementById(modalIdOrHtml);
      if (existingModal) {
        this.openModal(modalIdOrHtml);
      } else {
        let modal = document.getElementById('ui-modal');
        if (modal) modal.remove();

        modal = document.createElement('div');
        modal.id = 'ui-modal';
        modal.style.cssText =
          'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;z-index:1000;';
        modal.innerHTML = `
          <div style="background:var(--bg-card, #1e293b);padding:2rem;border-radius:12px;max-width:600px;width:90%;max-height:80vh;overflow-y:auto;position:relative;color:#fff;">
            <button onclick="document.getElementById('ui-modal').remove()" style="position:absolute;top:10px;left:10px;background:#f87171;color:#fff;border:none;border-radius:4px;padding:0.3rem 0.6rem;cursor:pointer;">إغلاق</button>
            ${modalIdOrHtml}
          </div>
        `;
        document.body.appendChild(modal);
      }
    },

    // ==========================================
    // 4. التنبيهات والإشعارات (Toasts & Alerts)
    // ==========================================
    showToast: function (message, duration = 3000) {
      let toast = document.getElementById('ui-toast');
      if (!toast) {
        toast = document.createElement('div');
        toast.id = 'ui-toast';
        toast.style.cssText =
          'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#1e293b;color:#fff;padding:10px 20px;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.3);z-index:9999;font-size:0.9rem;transition:opacity 0.3s ease;';
        document.body.appendChild(toast);
      }
      toast.textContent = message;
      toast.style.opacity = '1';

      setTimeout(() => {
        toast.style.opacity = '0';
      }, duration);
    },

    showAlert: function (message, isError = false) {
      this.showToast(message, isError ? 4000 : 3000);
    },

    notify: function (message, isError = false) {
      this.showAlert(message, isError);
    },

    // ==========================================
    // 5. أدوات وتنسيقات واجهة المستخدم
    // ==========================================
    formatCurrency: function (value) {
      return `$${Number(value || 0).toFixed(2)}`;
    },

    renderCard: function (title, val) {
      return `
        <div class="card" style="padding:1rem;background:var(--bg-card, #1e293b);border-radius:8px;margin-bottom:0.5rem;">
          <h3 style="font-size:0.9rem;color:#94a3b8;margin-bottom:0.4rem;">${title}</h3>
          <p style="font-size:1.2rem;font-weight:bold;margin:0;">${val}</p>
        </div>
      `;
    },

    renderRiskBadge: function (score = 0, category = 'low') {
      let color = '#22c55e'; // أخضر
      if (score > 70 || category === 'high') color = '#ef4444'; // أحمر
      else if (score > 30 || category === 'medium') color = '#f59e0b'; // برتقالي

      return `<span class="badge" style="background:${color};color:#fff;padding:2px 8px;border-radius:4px;font-size:0.75rem;">${score} (${category})</span>`;
    }
  };

  window.TelegaApp.ui = UI;
  window.UI = UI;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => UI.init());
  } else {
    UI.init();
  }
})();
