/**
 * TelegaApp UI Module
 * Integrated & Cleaned Version (No duplications, no conflicts, null-safe)
 */
window.TelegaApp = window.TelegaApp || {};

window.TelegaApp.ui = {
  // 1. Initialization & Events
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
        document.querySelectorAll('.modal').forEach((m) => m.classList.add('hidden'));
        const dynamicModal = document.getElementById('ui-modal');
        if (dynamicModal) dynamicModal.remove();
      });
    });

    document.getElementById('faq-open-btn')?.addEventListener('click', () => {
      this.openModal('faq-modal');
    });
  },

  // 2. Navigation & View Switching
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

    // Safely trigger sub-modules if present
    if (tabId === 'tab-home') {
      window.TelegaApp.shortener?.loadMyLinks?.();
      window.TelegaApp.ads?.loadActiveAds?.();
    } else if (tabId === 'tab-promote') {
      window.TelegaApp.ads?.loadMyCampaigns?.();
    } else if (tabId === 'tab-wallet') {
      window.TelegaApp.wallet?.loadTransactions?.();
    } else if (tabId === 'tab-referral') {
      window.TelegaApp.wallet?.loadReferrals?.();
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

  // 3. Modal Management
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

  // Handles showing existing modal element OR dynamic HTML overlay
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
          <button onclick="document.getElementById('ui-modal').remove()" style="position:absolute;top:10px;left:10px;background:#f87171;color:#fff;border:none;border-radius:4px;padding:0.3rem 0.6rem;cursor:pointer;">✕</button>
          ${modalIdOrHtml}
        </div>
      `;
      document.body.appendChild(modal);
    }
  },

  // 4. Notifications & Alerts
  showToast: function (message) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 3500);
  },

  showAlert: function (message, isError = false) {
    const alertBox = document.getElementById('alert-box');
    if (!alertBox) {
      this.showToast(message);
      return;
    }
    alertBox.textContent = message;
    alertBox.style.color = isError ? '#f87171' : '#4ade80';
    alertBox.classList.remove('hidden');

    setTimeout(() => {
      alertBox.classList.add('hidden');
    }, 4000);
  },

  notify: function (message, isError = false) {
    const alertBox = document.getElementById('alert-box');
    if (alertBox) {
      this.showAlert(message, isError);
    } else {
      this.showToast(message);
    }
  },

  // 5. User Data Processing (Null-safe)
  updateUserData: function (user) {
    if (!user) return;

    const setSafeText = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };

    const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim();
    const initial = user.firstName ? user.firstName.charAt(0).toUpperCase() : '?';
    const balance = typeof user.balance === 'number' ? user.balance.toFixed(2) : '0.00';
    const earned = typeof user.totalEarned === 'number' ? user.totalEarned.toFixed(2) : '0.00';
    const spent = typeof user.totalSpent === 'number' ? user.totalSpent.toFixed(2) : '0.00';

    setSafeText('header-user-name', fullName);
    setSafeText('header-user-role', user.role || '');
    setSafeText('user-avatar', initial);

    setSafeText('home-balance', balance);
    setSafeText('home-earned', earned);
    setSafeText('home-spent', spent);
    setSafeText('wallet-balance', balance);

    setSafeText('profile-avatar', initial);
    setSafeText('profile-full-name', fullName);
    setSafeText('profile-username', user.username ? `@${user.username}` : 'N/A');
    setSafeText('profile-id', user.telegramId || 'N/A');
    setSafeText('profile-reg-date', user.registeredAt ? new Date(user.registeredAt).toLocaleDateString() : 'N/A');

    const botUsername = 'TelegaAdsBot';
    const refLink = `https://t.me/${botUsername}?start=${user.telegramId || ''}`;
    const refInput = document.getElementById('referral-link-input');
    if (refInput) refInput.value = refLink;

    const adminNav = document.getElementById('admin-nav-item');
    if (adminNav) {
      if (user.isAdmin) {
        adminNav.classList.remove('hidden');
      } else {
        adminNav.classList.add('hidden');
      }
    }
  },

  // 6. Utility Formatting & Renderers
  formatCurrency: function (num) {
    return '$' + parseFloat(num || 0).toFixed(2);
  },

  formatDate: function (dateStr) {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleString();
  },

  renderCard: function (title, value) {
    return `
      <div class="card">
        <h4>${title}</h4>
        <div class="metric">${value}</div>
      </div>
    `;
  },

  renderRiskBadge: function (score, category) {
    return `<span class="badge ${category}">Score: ${score} (${category})</span>`;
  }
};

// Global Alias for Backward Compatibility
window.UI = window.TelegaApp.ui;
