// public/js/app.js

document.addEventListener('DOMContentLoaded', () => {
  // ==========================================
  // Global State
  // ==========================================
  const state = {
    user: null,
    currentTab: 'home',
    links: [],
    campaigns: [],
    walletHistory: { deposits: [], withdrawals: [] }
  };

  // ==========================================
  // DOM Elements
  // ==========================================
  const navTabs = document.querySelectorAll('.nav-tab');
  const viewSections = document.querySelectorAll('.view-section');

  const availableBalanceEl = document.getElementById('user-available-balance');
  const pendingBalanceEl = document.getElementById('user-pending-balance');
  const totalEarnedEl = document.getElementById('user-total-earned');
  const userDisplayNameEl = document.getElementById('user-display-name');
  const userTelegramIdEl = document.getElementById('user-telegram-id');
  const userAvatarInitialEl = document.getElementById('user-avatar-initial');

  const createLinkForm = document.getElementById('create-link-form');
  const createCampaignForm = document.getElementById('create-campaign-form');
  const depositForm = document.getElementById('deposit-form');
  const withdrawForm = document.getElementById('withdraw-form');

  const withdrawAmountInput = document.getElementById('withdraw-amount');
  const withdrawNetCalcEl = document.getElementById('withdraw-net-calc');
  const withdrawFeeCalcEl = document.getElementById('withdraw-fee-calc');

  const userLinksTableBody = document.getElementById('user-links-body');
  const userCampaignsList = document.getElementById('user-campaigns-list');
  const depositHistoryBody = document.getElementById('deposit-history-body');
  const withdrawHistoryBody = document.getElementById('withdraw-history-body');
  const referralLinkInput = document.getElementById('referral-link-input');
  const copyRefBtn = document.getElementById('copy-ref-btn');

  // ==========================================
  // Helper Functions
  // ==========================================

  function toggleLoader(show) {
    let loader = document.getElementById('global-app-loader');
    if (loader) {
      loader.style.display = show ? 'flex' : 'none';
    }
  }

  function showToast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.style.cssText = 'position: fixed; bottom: 75px; left: 50%; transform: translateX(-50%); z-index: 9999; display: flex; flex-direction: column; gap: 8px; width: 90%; max-width: 400px; pointer-events: none;';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast-message toast-${type}`;
    toast.style.cssText = `
      padding: 12px 16px;
      border-radius: 8px;
      color: #fff;
      font-size: 14px;
      text-align: center;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      transition: all 0.3s ease;
      opacity: 0;
      transform: translateY(10px);
      pointer-events: auto;
      background-color: ${type === 'success' ? '#2e7d32' : type === 'error' ? '#c62828' : '#0288d1'};
    `;
    toast.innerText = message;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0)';
    }, 10);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }

  function haptic(type = 'impact', style = 'medium') {
    if (window.TelegramApp && window.TelegramApp.triggerHaptic) {
      window.TelegramApp.triggerHaptic(type, style);
    }
  }

  // ==========================================
  // 1. Navigation Controller
  // ==========================================
  function switchTab(targetTabId) {
    if (state.currentTab === targetTabId) return;

    state.currentTab = targetTabId;
    haptic('selection');

    navTabs.forEach(tab => {
      if (tab.dataset.tab === targetTabId) {
        tab.classList.add('active');
      } else {
        tab.classList.remove('active');
      }
    });

    viewSections.forEach(section => {
      if (section.id === `${targetTabId}-section`) {
        section.classList.add('active-view');
        section.style.display = 'block';
      } else {
        section.classList.remove('active-view');
        section.style.display = 'none';
      }
    });

    switch (targetTabId) {
      case 'links':
        loadUserLinks();
        break;
      case 'wallet':
        loadWalletHistory();
        break;
      case 'campaigns':
        loadUserCampaigns();
        break;
      case 'home':
      default:
        loadUserProfile();
        break;
    }
  }

  navTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      switchTab(tab.dataset.tab);
    });
  });

  // ==========================================
  // 2. Data Handlers & API Calls
  // ==========================================

  /**
   * جلب بيانات بروفايل المستخدم فور الفتح وتحديث الهيدر والأرصدة
   */
  async function loadUserProfile() {
    if (!window.TelegramApp || !window.TelegramApp.apiFetch) return;

    const result = await window.TelegramApp.apiFetch('/api/auth/me');

    if (result && result.success) {
      state.user = result.data;
      updateUserUI();
    } else {
      console.warn('[Load Profile Warning]:', result.message);
    }
  }

  /**
   * تحديث شاشة العرض ومعلومات المستخدم بالكامل
   */
  function updateUserUI() {
    if (!state.user) return;

    const { available = 0, pending = 0, totalEarned = 0 } = state.user.balances || {};

    if (availableBalanceEl) availableBalanceEl.innerText = `$${available.toFixed(2)}`;
    if (pendingBalanceEl) pendingBalanceEl.innerText = `$${pending.toFixed(2)}`;
    if (totalEarnedEl) totalEarnedEl.innerText = `$${totalEarned.toFixed(2)}`;

    const name = state.user.firstName || 'مستخدم';
    if (userDisplayNameEl) userDisplayNameEl.innerText = name;
    if (userTelegramIdEl) userTelegramIdEl.innerText = `ID: ${state.user.telegramId || '-------'}`;
    if (userAvatarInitialEl) userAvatarInitialEl.innerText = name.charAt(0).toUpperCase();

    if (referralLinkInput && state.user.referralLink) {
      referralLinkInput.value = state.user.referralLink;
    }

    const defaultWalletInput = document.getElementById('default-wallet-address');
    if (defaultWalletInput && state.user.defaultWalletAddress) {
      defaultWalletInput.value = state.user.defaultWalletAddress;
    }

    if (state.user.role === 'admin') {
      const adminTab = document.getElementById('admin-nav-tab');
      if (adminTab) adminTab.style.display = 'flex';
    }
  }

  /**
   * جلب الروابط المختصرة
   */
  async function loadUserLinks() {
    toggleLoader(true);
    const result = await window.TelegramApp.apiFetch('/api/links');
    toggleLoader(false);

    if (result.success) {
      state.links = result.data || [];
      renderLinksTable();
    }
  }

  function renderLinksTable() {
    if (!userLinksTableBody) return;
    userLinksTableBody.innerHTML = '';

    if (state.links.length === 0) {
      userLinksTableBody.innerHTML = '<tr><td colspan="6" style="text-align:center;">لا توجد روابط مختصرة حالياً</td></tr>';
      return;
    }

    const host = window.location.origin;

    state.links.forEach(link => {
      const fullShortUrl = `${host}/b/${link.code}`;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${link.code}</strong></td>
        <td>${link.totalClicks || 0}</td>
        <td>${link.validImpressions || 0}</td>
        <td>$${(link.earningsGenerated || 0).toFixed(4)}</td>
        <td>
          <span class="status-badge ${link.isActive ? 'active' : 'disabled'}">
            ${link.isActive ? 'نشط' : 'معطل'}
          </span>
        </td>
        <td>
          <button class="btn-sm copy-btn" data-url="${fullShortUrl}">نسخ</button>
          <button class="btn-sm toggle-link-btn" data-id="${link._id}">${link.isActive ? 'تعطيل' : 'تفعيل'}</button>
        </td>
      `;
      userLinksTableBody.appendChild(tr);
    });

    document.querySelectorAll('.copy-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        navigator.clipboard.writeText(btn.dataset.url);
        showToast('تم نسخ الرابط إلى الحافظة', 'success');
        haptic('notification', 'success');
      });
    });

    document.querySelectorAll('.toggle-link-btn').forEach(btn => {
      btn.addEventListener('click', () => toggleLinkStatus(btn.dataset.id));
    });
  }

  async function toggleLinkStatus(id) {
    const result = await window.TelegramApp.apiFetch(`/api/links/${id}/toggle`, { method: 'PATCH' });
    if (result.success) {
      showToast(result.message || 'تم تحديث حالة الرابط', 'success');
      haptic('impact', 'light');
      loadUserLinks();
    } else {
      showToast(result.message || 'فشل تغيير الحالة', 'error');
    }
  }

  /**
   * جلب سجل المحفظة
   */
  async function loadWalletHistory() {
    toggleLoader(true);
    const result = await window.TelegramApp.apiFetch('/api/wallet/history');
    toggleLoader(false);

    if (result.success) {
      state.walletHistory = result.data || { deposits: [], withdrawals: [] };
      renderWalletHistory();
    }
  }

  function renderWalletHistory() {
    if (depositHistoryBody) {
      depositHistoryBody.innerHTML = '';
      const deposits = state.walletHistory.deposits || [];
      if (deposits.length === 0) {
        depositHistoryBody.innerHTML = '<tr><td colspan="4" style="text-align:center;">لا توجد عمليات إيداع</td></tr>';
      } else {
        deposits.forEach(dep => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>$${dep.amount.toFixed(2)}</td>
            <td>${dep.network}</td>
            <td><span class="status-${dep.status}">${dep.status}</span></td>
            <td>${new Date(dep.createdAt).toLocaleDateString('ar-EG')}</td>
          `;
          depositHistoryBody.appendChild(tr);
        });
      }
    }

    if (withdrawHistoryBody) {
      withdrawHistoryBody.innerHTML = '';
      const withdrawals = state.walletHistory.withdrawals || [];
      if (withdrawals.length === 0) {
        withdrawHistoryBody.innerHTML = '<tr><td colspan="4" style="text-align:center;">لا توجد عمليات سحب</td></tr>';
      } else {
        withdrawals.forEach(wth => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>$${wth.amount.toFixed(2)}</td>
            <td>$${(wth.netAmount || wth.amount).toFixed(2)}</td>
            <td><span class="status-${wth.status}">${wth.status}</span></td>
            <td>${new Date(wth.createdAt).toLocaleDateString('ar-EG')}</td>
          `;
          withdrawHistoryBody.appendChild(tr);
        });
      }
    }
  }

  /**
   * جلب الحملات الإعلانية
   */
  async function loadUserCampaigns() {
    toggleLoader(true);
    const result = await window.TelegramApp.apiFetch('/api/campaigns');
    toggleLoader(false);

    if (result.success) {
      state.campaigns = result.data || [];
      renderCampaignsList();
    }
  }

  function renderCampaignsList() {
    if (!userCampaignsList) return;
    userCampaignsList.innerHTML = '';

    if (state.campaigns.length === 0) {
      userCampaignsList.innerHTML = '<p style="text-align:center; padding: 20px;">لا توجد حملات إعلانية نشطة</p>';
      return;
    }

    state.campaigns.forEach(camp => {
      const card = document.createElement('div');
      card.className = 'campaign-card';
      card.innerHTML = `
        <div class="campaign-header">
          <h4>${camp.title}</h4>
          <span class="status-badge ${camp.status}">${camp.status}</span>
        </div>
        <div class="campaign-body">
          <p>الميزانية الإجمالية: $${(camp.totalBudget || 0).toFixed(2)}</p>
          <p>الميزانية المتبقية: $${(camp.remainingBudget || 0).toFixed(2)}</p>
          <p>الظهور المحقق: ${camp.impressionsDelivered || 0}</p>
        </div>
      `;
      userCampaignsList.appendChild(card);
    });
  }

  // ==========================================
  // 3. Calculator & Forms Events
  // ==========================================

  if (withdrawAmountInput) {
    withdrawAmountInput.addEventListener('input', () => {
      const amount = parseFloat(withdrawAmountInput.value) || 0;
      const fee = amount * 0.03;
      const net = Math.max(0, amount - fee);

      if (withdrawFeeCalcEl) withdrawFeeCalcEl.innerText = `$${fee.toFixed(2)}`;
      if (withdrawNetCalcEl) withdrawNetCalcEl.innerText = `$${net.toFixed(2)}`;
    });
  }

  if (createLinkForm) {
    createLinkForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const originalUrl = document.getElementById('link-original-url').value;
      const title = document.getElementById('link-title-input').value;

      toggleLoader(true);
      const result = await window.TelegramApp.apiFetch('/api/links', {
        method: 'POST',
        body: JSON.stringify({ originalUrl, title })
      });
      toggleLoader(false);

      if (result.success) {
        showToast('تم إنشاء الرابط المختصر بنجاح', 'success');
        haptic('notification', 'success');
        createLinkForm.reset();
        loadUserLinks();
      } else {
        showToast(result.message || 'فشل إنشاء الرابط', 'error');
        haptic('notification', 'error');
      }
    });
  }

  if (depositForm) {
    depositForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const amount = document.getElementById('deposit-amount').value;
      const network = document.getElementById('deposit-network').value;
      const txHash = document.getElementById('deposit-txhash').value;

      toggleLoader(true);
      const result = await window.TelegramApp.apiFetch('/api/wallet/deposit', {
        method: 'POST',
        body: JSON.stringify({ amount, network, txHash })
      });
      toggleLoader(false);

      if (result.success) {
        showToast('تم تقديم طلب الإيداع بنجاح', 'success');
        haptic('notification', 'success');
        depositForm.reset();
        loadWalletHistory();
      } else {
        showToast(result.message || 'فشل طلب الإيداع', 'error');
        haptic('notification', 'error');
      }
    });
  }

  if (withdrawForm) {
    withdrawForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const amount = document.getElementById('withdraw-amount').value;
      const walletAddress = document.getElementById('withdraw-wallet-address').value;

      toggleLoader(true);
      const result = await window.TelegramApp.apiFetch('/api/wallet/withdraw', {
        method: 'POST',
        body: JSON.stringify({ amount, walletAddress })
      });
      toggleLoader(false);

      if (result.success) {
        showToast('تم تقديم طلب السحب بنجاح', 'success');
        haptic('notification', 'success');
        withdrawForm.reset();
        if (withdrawFeeCalcEl) withdrawFeeCalcEl.innerText = '$0.00';
        if (withdrawNetCalcEl) withdrawNetCalcEl.innerText = '$0.00';
        loadUserProfile();
        loadWalletHistory();
      } else {
        showToast(result.message || 'فشل تقديم طلب السحب', 'error');
        haptic('notification', 'error');
      }
    });
  }

  if (createCampaignForm) {
    createCampaignForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = document.getElementById('campaign-title').value;
      const targetUrl = document.getElementById('campaign-target-url').value;
      const bannerUrl = document.getElementById('campaign-banner-url').value;
      const totalBudget = document.getElementById('campaign-budget').value;

      toggleLoader(true);
      const result = await window.TelegramApp.apiFetch('/api/campaigns', {
        method: 'POST',
        body: JSON.stringify({ title, targetUrl, bannerUrl, totalBudget })
      });
      toggleLoader(false);

      if (result.success) {
        showToast('تم إطلاق الحملة الإعلانية بنجاح', 'success');
        haptic('notification', 'success');
        createCampaignForm.reset();
        loadUserProfile();
        loadUserCampaigns();
      } else {
        showToast(result.message || 'فشل إنشاء الحملة', 'error');
        haptic('notification', 'error');
      }
    });
  }

  if (copyRefBtn && referralLinkInput) {
    copyRefBtn.addEventListener('click', () => {
      if (referralLinkInput.value) {
        navigator.clipboard.writeText(referralLinkInput.value);
        showToast('تم نسخ رابط الإحالة الخاص بك', 'success');
        haptic('notification', 'success');
      }
    });
  }

  // ==========================================
  // Initialization
  // ==========================================
  loadUserProfile();
});
