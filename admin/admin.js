/**
 * Telega.ads Platform Architecture
 * Admin Control Panel Engine - Admin Application (v2.5)
 */

(function () {
  'use strict';

  // Admin State Management
  const adminState = {
    token: localStorage.getItem('telega_token') || null,
    user: null,
    stats: {
      totalUsers: 0,
      totalLinks: 0,
      totalAds: 0,
      totalDepositsAmount: 0,
      totalWithdrawsAmount: 0
    },
    users: [],
    pendingDeposits: [],
    pendingWithdraws: [],
    ads: [],
    announcements: [],
    settings: {
      cpmRate: 1.5,
      minWithdraw: 5.0,
      refCommission: 0.10,
      bep20Wallet: '',
      trc20Wallet: ''
    },
    activeTab: 'overview'
  };

  // Telegram WebApp SDK Setup
  const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;

  if (tg) {
    tg.ready();
    tg.expand();
  }

  // API Request Helper with Security Auth Headers
  async function adminApiRequest(endpoint, method = 'GET', data = null) {
    const headers = {
      'Content-Type': 'application/json'
    };

    if (adminState.token) {
      headers['Authorization'] = `Bearer ${adminState.token}`;
    }

    if (tg && tg.initData) {
      headers['x-telegram-init-data'] = tg.initData;
    }

    const options = {
      method,
      headers
    };

    if (data) {
      options.body = JSON.stringify(data);
    }

    try {
      const response = await fetch(endpoint, options);
      const resData = await response.json();

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          showAccessDenied();
          throw new Error('غير مصرح لك بالوصول إلى لوحة الإدارة.');
        }
        throw new Error(resData.error || 'حدث خطأ في طلب الإدارة');
      }

      return resData;
    } catch (err) {
      showToast(err.message, 'error');
      throw err;
    }
  }

  // Toast Notification System
  function showToast(message, type = 'info') {
    const container = document.getElementById('admin-toast-container') || createToastContainer();

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerText = message;

    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('fade-out');
      toast.addEventListener('transitionend', () => toast.remove());
    }, 4000);
  }

  function createToastContainer() {
    const container = document.createElement('div');
    container.id = 'admin-toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
    return container;
  }

  function showAccessDenied() {
    const adminApp = document.getElementById('admin-app');
    const deniedView = document.getElementById('access-denied-view');

    if (adminApp) adminApp.style.display = 'none';
    if (deniedView) {
      deniedView.style.display = 'flex';
    } else {
      document.body.innerHTML = `
        <div style="display:flex; height:100vh; justify-content:center; align-items:center; flex-direction:column; text-align:center; padding:20px; font-family:sans-serif;">
          <h1 style="color:#e74c3c; font-size:48px; margin-bottom:10px;">403</h1>
          <h2 style="margin-bottom:15px;">تم رفض الوصول</h2>
          <p style="color:#7f8c8d; max-width:400px; margin-bottom:20px;">حسابك لا يملك صلاحيات مسؤول النظام (Admin) للوصول إلى هذه اللوحة.</p>
          <a href="/" style="background:#3498db; color:white; padding:10px 20px; text-decoration:none; border-radius:8px;">العودة للرئيسية</a>
        </div>
      `;
    }
  }

  // Initialization & Authorization Check
  async function initAdmin() {
    try {
      // First verify access via system check endpoint
      const checkRes = await adminApiRequest('/api/admin/check', 'GET');

      if (checkRes.success && checkRes.isAdmin) {
        adminState.user = checkRes.user;
        showAdminApp();
        await loadAdminData();
      } else {
        showAccessDenied();
      }
    } catch (err) {
      console.error('Admin Check Failed:', err);
    }
  }

  function showAdminApp() {
    const adminApp = document.getElementById('admin-app');
    const deniedView = document.getElementById('access-denied-view');

    if (deniedView) deniedView.style.display = 'none';
    if (adminApp) adminApp.style.display = 'block';
  }

  // Load All Admin Data
  async function loadAdminData() {
    try {
      const res = await adminApiRequest('/api/admin/dashboard-data', 'GET');
      if (res.success) {
        adminState.stats = res.stats || adminState.stats;
        adminState.users = res.users || [];
        adminState.pendingDeposits = res.pendingDeposits || [];
        adminState.pendingWithdraws = res.pendingWithdraws || [];
        adminState.ads = res.ads || [];
        adminState.announcements = res.announcements || [];
        adminState.settings = res.settings || adminState.settings;

        renderAdminDashboard();
      }
    } catch (err) {
      console.error('Failed to load admin dashboard data:', err);
    }
  }

  // Render UI Components
  function renderAdminDashboard() {
    // Render Statistics Cards
    const totalUsersEl = document.getElementById('stat-total-users');
    const totalLinksEl = document.getElementById('stat-total-links');
    const totalAdsEl = document.getElementById('stat-total-ads');
    const totalDepositsEl = document.getElementById('stat-total-deposits');
    const totalWithdrawsEl = document.getElementById('stat-total-withdraws');

    if (totalUsersEl) totalUsersEl.innerText = adminState.stats.totalUsers || 0;
    if (totalLinksEl) totalLinksEl.innerText = adminState.stats.totalLinks || 0;
    if (totalAdsEl) totalAdsEl.innerText = adminState.stats.totalAds || 0;
    if (totalDepositsEl) totalDepositsEl.innerText = `$${(adminState.stats.totalDepositsAmount || 0).toFixed(2)}`;
    if (totalWithdrawsEl) totalWithdrawsEl.innerText = `$${(adminState.stats.totalWithdrawsAmount || 0).toFixed(2)}`;

    // Render Sub-Sections
    renderPendingDeposits();
    renderPendingWithdraws();
    renderUsersList();
    renderAdsManagement();
    renderAnnouncementsList();
    populateSettingsForm();
  }

  // Pending Deposits List
  function renderPendingDeposits() {
    const container = document.getElementById('admin-deposits-container');
    if (!container) return;

    if (adminState.pendingDeposits.length === 0) {
      container.innerHTML = '<div class="empty-state">لا توجد طلبات إيداع معلقة حالياً.</div>';
      return;
    }

    container.innerHTML = adminState.pendingDeposits.map(dep => `
      <div class="admin-card-item">
        <div class="admin-card-info">
          <div><strong>المستخدم:</strong> ${escapeHtml(dep.user ? dep.user.username || dep.user.telegramId : dep.userId)}</div>
          <div><strong>المبلغ:</strong> $${dep.amount.toFixed(2)} (${dep.network})</div>
          <div><strong>TxID:</strong> <code class="code-block">${escapeHtml(dep.txid)}</code></div>
          <div><strong>التاريخ:</strong> ${new Date(dep.createdAt).toLocaleString()}</div>
        </div>
        <div class="admin-card-actions">
          <button class="btn btn-success btn-sm approve-deposit-btn" data-id="${dep._id}">قبول الإيداع</button>
          <button class="btn btn-danger btn-sm reject-deposit-btn" data-id="${dep._id}">رفض</button>
        </div>
      </div>
    `).join('');

    container.querySelectorAll('.approve-deposit-btn').forEach(btn => {
      btn.addEventListener('click', () => handleDepositAction(btn.getAttribute('data-id'), 'approve'));
    });

    container.querySelectorAll('.reject-deposit-btn').forEach(btn => {
      btn.addEventListener('click', () => handleDepositAction(btn.getAttribute('data-id'), 'reject'));
    });
  }

  async function handleDepositAction(depositId, action) {
    try {
      const res = await adminApiRequest(`/api/admin/deposits/${action}`, 'POST', { depositId });
      if (res.success) {
        showToast(action === 'approve' ? 'تمت موافقة الإيداع وإضافة الرصيد!' : 'تم رفض الإيداع.', 'success');
        await loadAdminData();
      }
    } catch (e) {}
  }

  // Pending Withdraws List
  function renderPendingWithdraws() {
    const container = document.getElementById('admin-withdraws-container');
    if (!container) return;

    if (adminState.pendingWithdraws.length === 0) {
      container.innerHTML = '<div class="empty-state">لا توجد طلبات سحب معلقة حالياً.</div>';
      return;
    }

    container.innerHTML = adminState.pendingWithdraws.map(w => `
      <div class="admin-card-item">
        <div class="admin-card-info">
          <div><strong>المستخدم:</strong> ${escapeHtml(w.user ? w.user.username || w.user.telegramId : w.userId)}</div>
          <div><strong>المبلغ المطلوب:</strong> $${w.amount.toFixed(2)}</div>
          <div><strong>الشبكة:</strong> ${w.network}</div>
          <div><strong>عنوان المحفظة:</strong> <code class="code-block">${escapeHtml(w.walletAddress)}</code></div>
          <div><strong>التاريخ:</strong> ${new Date(w.createdAt).toLocaleString()}</div>
        </div>
        <div class="admin-card-actions">
          <button class="btn btn-success btn-sm approve-withdraw-btn" data-id="${w._id}">تأكيد الدفع والسحب</button>
          <button class="btn btn-danger btn-sm reject-withdraw-btn" data-id="${w._id}">رفض وإعادة الرصيد</button>
        </div>
      </div>
    `).join('');

    container.querySelectorAll('.approve-withdraw-btn').forEach(btn => {
      btn.addEventListener('click', () => handleWithdrawAction(btn.getAttribute('data-id'), 'approve'));
    });

    container.querySelectorAll('.reject-withdraw-btn').forEach(btn => {
      btn.addEventListener('click', () => handleWithdrawAction(btn.getAttribute('data-id'), 'reject'));
    });
  }

  async function handleWithdrawAction(withdrawId, action) {
    try {
      const res = await adminApiRequest(`/api/admin/withdraws/${action}`, 'POST', { withdrawId });
      if (res.success) {
        showToast(action === 'approve' ? 'تمت إضافة طلب السحب كمكتمل بنجاح!' : 'تم رفض الطلب وإعادة الرصيد للحساب.', 'success');
        await loadAdminData();
      }
    } catch (e) {}
  }

  // Users List Management
  function renderUsersList() {
    const tbody = document.getElementById('admin-users-table-body');
    if (!tbody) return;

    if (adminState.users.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center">لا يوجد مستخدمين مسجلين بعد.</td></tr>';
      return;
    }

    tbody.innerHTML = adminState.users.map(u => `
      <tr>
        <td>${u.telegramId}</td>
        <td>${escapeHtml(u.username || 'بدون يوزر')}</td>
        <td>$${(u.availableBalance || 0).toFixed(2)}</td>
        <td>$${(u.pendingBalance || 0).toFixed(2)}</td>
        <td><span class="badge ${u.isBanned ? 'badge-danger' : 'badge-success'}">${u.isBanned ? 'محظور' : 'نشط'}</span></td>
        <td>${u.isAdmin ? '<span class="badge badge-warning">أدمن</span>' : 'مستخدم'}</td>
        <td>
          <button class="btn btn-secondary btn-sm edit-balance-btn" data-id="${u._id}" data-balance="${u.availableBalance}">تعديل الرصيد</button>
          <button class="btn ${u.isBanned ? 'btn-success' : 'btn-danger'} btn-sm toggle-ban-btn" data-id="${u._id}">
            ${u.isBanned ? 'إلغاء الحظر' : 'حظر'}
          </button>
        </td>
      </tr>
    `).join('');

    tbody.querySelectorAll('.toggle-ban-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const userId = btn.getAttribute('data-id');
        try {
          const res = await adminApiRequest('/api/admin/users/toggle-ban', 'POST', { userId });
          if (res.success) {
            showToast('تم تعديل حالة حظر المستخدم');
            await loadAdminData();
          }
        } catch (e) {}
      });
    });

    tbody.querySelectorAll('.edit-balance-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const userId = btn.getAttribute('data-id');
        const currentBal = btn.getAttribute('data-balance');
        const newBal = prompt('أدخل قيمة الرصيد المتاح الجديدة للمستخدم:', currentBal);

        if (newBal !== null && !isNaN(parseFloat(newBal))) {
          updateUserBalance(userId, parseFloat(newBal));
        }
      });
    });
  }

  async function updateUserBalance(userId, balance) {
    try {
      const res = await adminApiRequest('/api/admin/users/update-balance', 'POST', { userId, balance });
      if (res.success) {
        showToast('تم تحديث رصيد المستخدم بنجاح!', 'success');
        await loadAdminData();
      }
    } catch (e) {}
  }

  // Ads Management
  function renderAdsManagement() {
    const container = document.getElementById('admin-ads-container');
    if (!container) return;

    if (adminState.ads.length === 0) {
      container.innerHTML = '<div class="empty-state">لا توجد حملات إعلانية بالنظام.</div>';
      return;
    }

    container.innerHTML = adminState.ads.map(ad => `
      <div class="admin-card-item">
        <div class="admin-card-info">
          <div><strong>العنوان:</strong> ${escapeHtml(ad.title)}</div>
          <div><strong>الرابط:</strong> ${escapeHtml(ad.targetUrl)}</div>
          <div><strong>الميزانية الكلية / المتبقية:</strong> $${ad.totalBudget.toFixed(2)} / $${ad.remainingBudget.toFixed(2)}</div>
          <div><strong>الحالة:</strong> <span class="badge badge-info">${ad.status}</span></div>
        </div>
        <div class="admin-card-actions">
          <button class="btn btn-danger btn-sm delete-ad-btn" data-id="${ad._id}">حذف الحملة</button>
        </div>
      </div>
    `).join('');

    container.querySelectorAll('.delete-ad-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('هل أنت تأكد من رغبتك في حذف هذه الحملة؟')) return;
        const adId = btn.getAttribute('data-id');
        try {
          const res = await adminApiRequest('/api/admin/ads/delete', 'POST', { adId });
          if (res.success) {
            showToast('تم حذف الحملة الإعلانية', 'success');
            await loadAdminData();
          }
        } catch (e) {}
      });
    });
  }

  // Announcements Management
  function renderAnnouncementsList() {
    const container = document.getElementById('admin-announcements-list');
    if (!container) return;

    if (adminState.announcements.length === 0) {
      container.innerHTML = '<div class="empty-state">لا توجد إعلانات إدارية منشورة.</div>';
      return;
    }

    container.innerHTML = adminState.announcements.map(anc => `
      <div class="admin-card-item">
        <div class="admin-card-info">
          <div><strong>${escapeHtml(anc.title)}</strong></div>
          <div>${escapeHtml(anc.content)}</div>
          <div class="text-muted"><small>${new Date(anc.createdAt).toLocaleDateString()}</small></div>
        </div>
        <div class="admin-card-actions">
          <button class="btn btn-danger btn-sm delete-anc-btn" data-id="${anc._id}">حذف</button>
        </div>
      </div>
    `).join('');

    container.querySelectorAll('.delete-anc-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        try {
          const res = await adminApiRequest('/api/admin/announcements/delete', 'POST', { id });
          if (res.success) {
            showToast('تم حذف الإعلان الإداري');
            await loadAdminData();
          }
        } catch (e) {}
      });
    });
  }

  // Settings Management Form Fill
  function populateSettingsForm() {
    const cpmInput = document.getElementById('setting-cpm-rate');
    const minWithdrawInput = document.getElementById('setting-min-withdraw');
    const refCommInput = document.getElementById('setting-ref-commission');
    const bep20Input = document.getElementById('setting-bep20-wallet');
    const trc20Input = document.getElementById('setting-trc20-wallet');

    if (cpmInput) cpmInput.value = adminState.settings.cpmRate || 1.5;
    if (minWithdrawInput) minWithdrawInput.value = adminState.settings.minWithdraw || 5.0;
    if (refCommInput) refCommInput.value = adminState.settings.refCommission || 0.10;
    if (bep20Input) bep20Input.value = adminState.settings.bep20Wallet || '';
    if (trc20Input) trc20Input.value = adminState.settings.trc20Wallet || '';
  }

  // Setup Event Listeners
  function setupAdminEventListeners() {
    // Admin Navigation Tabs
    const tabs = document.querySelectorAll('.admin-nav-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const target = tab.getAttribute('data-tab');

        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        document.querySelectorAll('.admin-tab-content').forEach(c => c.classList.remove('active'));
        const targetContent = document.getElementById(`admin-tab-${target}`);
        if (targetContent) targetContent.classList.add('active');

        adminState.activeTab = target;
      });
    });

    // Broadcast Form Handler
    const broadcastForm = document.getElementById('admin-broadcast-form');
    if (broadcastForm) {
      broadcastForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const message = document.getElementById('broadcast-message-input').value;

        try {
          const res = await adminApiRequest('/api/admin/broadcast', 'POST', { message });
          if (res.success) {
            showToast(`تم إرسال الإذاعة بنجاح لـ ${res.sentCount} مستخدم!`, 'success');
            broadcastForm.reset();
          }
        } catch (err) {}
      });
    }

    // New Announcement Form Handler
    const ancForm = document.getElementById('admin-create-announcement-form');
    if (ancForm) {
      ancForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const title = document.getElementById('anc-title-input').value;
        const content = document.getElementById('anc-content-input').value;

        try {
          const res = await adminApiRequest('/api/admin/announcements', 'POST', { title, content });
          if (res.success) {
            showToast('تم إضافة الإعلان الإداري بنجاح!', 'success');
            ancForm.reset();
            await loadAdminData();
          }
        } catch (err) {}
      });
    }

    // Global System Settings Form Handler
    const settingsForm = document.getElementById('admin-settings-form');
    if (settingsForm) {
      settingsForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const settingsData = {
          cpmRate: parseFloat(document.getElementById('setting-cpm-rate').value),
          minWithdraw: parseFloat(document.getElementById('setting-min-withdraw').value),
          refCommission: parseFloat(document.getElementById('setting-ref-commission').value),
          bep20Wallet: document.getElementById('setting-bep20-wallet').value,
          trc20Wallet: document.getElementById('setting-trc20-wallet').value
        };

        try {
          const res = await adminApiRequest('/api/admin/settings', 'POST', settingsData);
          if (res.success) {
            showToast('تم حفظ إعدادات النظام وتحديث المحافظ بنجاح!', 'success');
            await loadAdminData();
          }
        } catch (err) {}
      });
    }

    // Refresh Data Button
    const refreshBtn = document.getElementById('admin-refresh-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', async () => {
        refreshBtn.classList.add('spinning');
        await loadAdminData();
        setTimeout(() => refreshBtn.classList.remove('spinning'), 500);
        showToast('تم تحديث البيانات بنجاح', 'info');
      });
    }
  }

  // Utilities
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Entry Point Trigger
  document.addEventListener('DOMContentLoaded', () => {
    setupAdminEventListeners();
    initAdmin();
  });

})();
