// public/js/app.js

document.addEventListener('DOMContentLoaded', () => {
  // ==========================================
  // Global State | حالة التطبيق العامة
  // ==========================================
  const state = {
    user: null,
    currentTab: 'home',
    links: [],
    campaigns: [],
    walletHistory: { deposits: [], withdrawals: [] }
  };

  // ==========================================
  // DOM Elements Selection | تحديد عناصر الواجهة
  // ==========================================
  const navTabs = document.querySelectorAll('.nav-tab');
  const viewSections = document.querySelectorAll('.view-section');

  // Dashboard Stats Elements
  const availableBalanceEl = document.getElementById('user-available-balance');
  const pendingBalanceEl = document.getElementById('user-pending-balance');
  const totalEarnedEl = document.getElementById('user-total-earned');
  const userDisplayNameEl = document.getElementById('user-display-name');

  // Forms
  const createLinkForm = document.getElementById('create-link-form');
  const createCampaignForm = document.getElementById('create-campaign-form');
  const depositForm = document.getElementById('deposit-form');
  const withdrawForm = document.getElementById('withdraw-form');

  // Calculation Inputs
  const withdrawAmountInput = document.getElementById('withdraw-amount');
  const withdrawNetCalcEl = document.getElementById('withdraw-net-calc');
  const withdrawFeeCalcEl = document.getElementById('withdraw-fee-calc');

  // Dynamic Lists & Tables
  const userLinksTableBody = document.getElementById('user-links-body');
  const userCampaignsList = document.getElementById('user-campaigns-list');
  const depositHistoryBody = document.getElementById('deposit-history-body');
  const withdrawHistoryBody = document.getElementById('withdraw-history-body');
  const referralLinkInput = document.getElementById('referral-link-input');
  const copyRefBtn = document.getElementById('copy-ref-btn');

  // ==========================================
  // Helper Functions | الدوال المساعدة
  // ==========================================

  /**
   * جلب ترويسات الطلبات الموحدة
   */
  function getHeaders() {
    const initData = window.TelegramApp ? window.TelegramApp.getInitData() : '';
    return {
      'Content-Type': 'application/json',
      'x-telegram-init-data': initData
    };
  }

  /**
   * إظهار / إخفاء مؤشر التحميل الرئيسي
   */
  function toggleLoader(show) {
    let loader = document.getElementById('global-app-loader');
    if (!loader && show) {
      loader = document.createElement('div');
      loader.id = 'global-app-loader';
      loader.className = 'global-loader-overlay';
      loader.innerHTML = '<div class="spinner"></div>';
      document.body.appendChild(loader);
    }
    if (loader) {
      loader.style.display = show ? 'flex' : 'none';
    }
  }

  /**
   * إشعار Toast تفاعلي
   */
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

  /**
   * تشغيل الاهتزاز عند التفاعل
   */
  function haptic(type = 'impact', style = 'medium') {
    if (window.TelegramApp && window.TelegramApp.triggerHaptic) {
      window.TelegramApp.triggerHaptic(type, style);
    }
  }

  // ==========================================
  // 1. Navigation Controller | إدارة التنقل
  // ==========================================
  function switchTab(targetTabId) {
    if (state.currentTab === targetTabId) return;

    state.currentTab = targetTabId;
    haptic('selection');

    // تحديث أزرار التنقل
    navTabs.forEach(tab => {
      if (tab.dataset.tab === targetTabId) {
        tab.classList.add('active');
      } else {
        tab.classList.remove('active');
      }
    });

    // التبديل بين الشاشات
    viewSections.forEach(section => {
      if (section.id === `${targetTabId}-section`) {
        section.classList.add('active-view');
        section.style.display = 'block';
      } else {
        section.classList.remove('active-view');
        section.style.display = 'none';
      }
    });

    // إعادة تحميل البيانات الخاصة بالشاشة المستهدفة
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
      const tabId = tab.dataset.tab;
      switchTab(tabId);
    });
  });

  // ==========================================
  // 2. Data Handlers & API Calls | جلب البيانات
  // ==========================================

  /**
   * جلب بيانات بروفايل المستخدم ورصيده
   */
  async function loadUserProfile() {
    try {
      const response = await fetch('/api/auth/me', { headers: getHeaders() });
      const result = await response.json();

      if (result.success) {
        state.user = result.data;
        updateUserUI();
      } else {
        showToast(result.message || 'فشل جلب بيانات البروفايل', 'error');
      }
    } catch (error) {
      console.error('[Load Profile Error]:', error);
    }
  }

  /**
   * تحديث واجهة البروفايل والأرصدة
   */
  function updateUserUI() {
    if (!state.user) return;

    const { available, pending, totalEarned } = state.user.balances;

    if (availableBalanceEl) availableBalanceEl.innerText = `$${available.toFixed(2)}`;
    if (pendingBalanceEl) pendingBalanceEl.innerText = `$${pending.toFixed(2)}`;
    if (totalEarnedEl) totalEarnedEl.innerText = `$${totalEarned.toFixed(2)}`;
    if (userDisplayNameEl) userDisplayNameEl.innerText = state.user.firstName || 'مستخدم';

    if (referralLinkInput && state.user.referralLink) {
      referralLinkInput.value = state.user.referralLink;
    }

    const defaultWalletInput = document.getElementById('default-wallet-address');
    if (defaultWalletInput && state.user.defaultWalletAddress) {
      defaultWalletInput.value = state.user.defaultWalletAddress;
    }
  }

  /**
   * جلب روابط المستخدم
   */
  async function loadUserLinks() {
    toggleLoader(true);
    try {
      const response = await fetch('/api/links', { headers: getHeaders() });
      const result = await response.json();

      if (result.success) {
        state.links = result.data;
        renderLinksTable();
      }
    } catch (error) {
      console.error('[Load Links Error]:', error);
    } finally {
      toggleLoader(false);
    }
  }

  /**
   * عرض جدول الروابط
   */
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
        <td>${link.totalClicks}</td>
        <td>${link.validImpressions}</td>
        <td>$${link.earningsGenerated.toFixed(4)}</td>
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

    // أحداث زر النسخ والتبديل
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

  /**
   * تفعيل/تعطيل رابط
   */
  async function toggleLinkStatus(id) {
    try {
      const response = await fetch(`/api/links/${id}/toggle`, {
        method: 'PATCH',
        headers: getHeaders()
      });
      const result = await response.json();

      if (result.success) {
        showToast(result.message, 'success');
        haptic('impact', 'light');
        loadUserLinks();
      } else {
        showToast(result.message, 'error');
      }
    } catch (error) {
      console.error('[Toggle Link Error]:', error);
    }
  }

  /**
   * جلب المعاملات المالية (إيداعات وسحوبات)
   */
  async function loadWalletHistory() {
    toggleLoader(true);
    try {
      const response = await fetch('/api/wallet/history', { headers: getHeaders() });
      const result = await response.json();

      if (result.success) {
        state.walletHistory = result.data;
        renderWalletHistory();
      }
    } catch (error) {
      console.error('[Load Wallet History Error]:', error);
    } finally {
      toggleLoader(false);
    }
  }

  /**
   * عرض سجل المحفظة
   */
  function renderWalletHistory() {
    if (depositHistoryBody) {
      depositHistoryBody.innerHTML = '';
      if (state.walletHistory.deposits.length === 0) {
        depositHistoryBody.innerHTML = '<tr><td colspan="4" style="text-align:center;">لا توجد عمليات إيداع</td></tr>';
      } else {
        state.walletHistory.deposits.forEach(dep => {
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
      if (state.walletHistory.withdrawals.length === 0) {
        withdrawHistoryBody.innerHTML = '<tr><td colspan="4" style="text-align:center;">لا توجد عمليات سحب</td></tr>';
      } else {
        state.walletHistory.withdrawals.forEach(wth => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>$${wth.amount.toFixed(2)}</td>
            <td>$${wth.netAmount.toFixed(2)}</td>
            <td><span class="status-${wth.status}">${wth.status}</span></td>
            <td>${new Date(wth.createdAt).toLocaleDateString('ar-EG')}</td>
          `;
          withdrawHistoryBody.appendChild(tr);
        });
      }
    }
  }

  /**
   * جلب حملات المستخدم
   */
  async function loadUserCampaigns() {
    toggleLoader(true);
    try {
      const response = await fetch('/api/campaigns', { headers: getHeaders() });
      const result = await response.json();

      if (result.success) {
        state.campaigns = result.data;
        renderCampaignsList();
      }
    } catch (error) {
      console.error('[Load Campaigns Error]:', error);
    } finally {
      toggleLoader(false);
    }
  }

  /**
   * عرض قائمة الحملات
   */
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
          <p>الميزانية الإجمالية: $${camp.totalBudget.toFixed(2)}</p>
          <p>الميزانية المتبقية: $${camp.remainingBudget.toFixed(2)}</p>
          <p>الظهور المحقق: ${camp.impressionsDelivered}</p>
        </div>
        <div class="campaign-actions">
          ${camp.status !== 'completed' ? `<button class="btn-sm toggle-camp-btn" data-id="${camp._id}">${camp.status === 'active' ? 'إيقاف مؤقت' : 'تنشيط'}</button>` : ''}
        </div>
      `;
      userCampaignsList.appendChild(card);
    });

    document.querySelectorAll('.toggle-camp-btn').forEach(btn => {
      btn.addEventListener('click', () => toggleCampaignStatus(btn.dataset.id));
    });
  }

  /**
   * إيقاف/تنشيط حملة إعلانية
   */
  async function toggleCampaignStatus(id) {
    try {
      const response = await fetch(`/api/campaigns/${id}/toggle`, {
        method: 'PATCH',
        headers: getHeaders()
      });
      const result = await response.json();

      if (result.success) {
        showToast(result.message, 'success');
        haptic('impact', 'light');
        loadUserCampaigns();
      } else {
        showToast(result.message, 'error');
      }
    } catch (error) {
      console.error('[Toggle Campaign Error]:', error);
    }
  }

  // ==========================================
  // 5. Realtime Calculation | حاسبة العمولات
  // ==========================================
  if (withdrawAmountInput) {
    withdrawAmountInput.addEventListener('input', () => {
      const amount = parseFloat(withdrawAmountInput.value) || 0;
      const feePercent = 0.03; // 3%
      const fee = amount * feePercent;
      const net = Math.max(0, amount - fee);

      if (withdrawFeeCalcEl) withdrawFeeCalcEl.innerText = `$${fee.toFixed(2)}`;
      if (withdrawNetCalcEl) withdrawNetCalcEl.innerText = `$${net.toFixed(2)}`;
    });
  }

  // ==========================================
  // 6. Forms Handling | ربط النماذج بالخلفية
  // ==========================================

  // نموذج إنشاء رابط مختصر
  if (createLinkForm) {
    createLinkForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const originalUrl = document.getElementById('link-original-url').value;
      const title = document.getElementById('link-title-input').value;

      toggleLoader(true);
      try {
        const response = await fetch('/api/links', {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({ originalUrl, title })
        });
        const result = await response.json();

        if (result.success) {
          showToast('تم إنشاء الرابط المختصر بنجاح', 'success');
          haptic('notification', 'success');
          createLinkForm.reset();
          loadUserLinks();
        } else {
          showToast(result.message || 'فشل إنشاء الرابط', 'error');
          haptic('notification', 'error');
        }
      } catch (error) {
        console.error('[Create Link Form Error]:', error);
      } finally {
        toggleLoader(false);
      }
    });
  }

  // نموذج تقديم طلب إيداع
  if (depositForm) {
    depositForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const amount = document.getElementById('deposit-amount').value;
      const network = document.getElementById('deposit-network').value;
      const txHash = document.getElementById('deposit-txhash').value;

      toggleLoader(true);
      try {
        const response = await fetch('/api/wallet/deposit', {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({ amount, network, txHash })
        });
        const result = await response.json();

        if (result.success) {
          showToast('تم تقديم طلب الإيداع بنجاح وهو قيد المراجعة', 'success');
          haptic('notification', 'success');
          depositForm.reset();
          loadWalletHistory();
        } else {
          showToast(result.message || 'فشل تقديم طلب الإيداع', 'error');
          haptic('notification', 'error');
        }
      } catch (error) {
        console.error('[Deposit Form Error]:', error);
      } finally {
        toggleLoader(false);
      }
    });
  }

  // نموذج تقديم طلب سحب
  if (withdrawForm) {
    withdrawForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const amount = document.getElementById('withdraw-amount').value;
      const walletAddress = document.getElementById('withdraw-wallet-address').value;

      toggleLoader(true);
      try {
        const response = await fetch('/api/wallet/withdraw', {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({ amount, walletAddress })
        });
        const result = await response.json();

        if (result.success) {
          showToast('تم تقديم طلب السحب بنجاح وخصم المبلغ من رصيدك', 'success');
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
      } catch (error) {
        console.error('[Withdraw Form Error]:', error);
      } finally {
        toggleLoader(false);
      }
    });
  }

  // نموذج إنشاء حملة إعلانية
  if (createCampaignForm) {
    createCampaignForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = document.getElementById('campaign-title').value;
      const targetUrl = document.getElementById('campaign-target-url').value;
      const bannerUrl = document.getElementById('campaign-banner-url').value;
      const totalBudget = document.getElementById('campaign-budget').value;

      toggleLoader(true);
      try {
        const response = await fetch('/api/campaigns', {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({ title, targetUrl, bannerUrl, totalBudget })
        });
        const result = await response.json();

        if (result.success) {
          showToast('تم إنشاء وإطلاق الحملة الإعلانية بنجاح', 'success');
          haptic('notification', 'success');
          createCampaignForm.reset();
          loadUserProfile();
          loadUserCampaigns();
        } else {
          showToast(result.message || 'فشل إنشاء الحملة', 'error');
          haptic('notification', 'error');
        }
      } catch (error) {
        console.error('[Create Campaign Form Error]:', error);
      } finally {
        toggleLoader(false);
      }
    });
  }

  // نسخ رابط الإحالة
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
  // Global App Initialization | بدء تشغيل التطبيق
  // ==========================================
  loadUserProfile();
});
