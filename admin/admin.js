/**
 * Admin Panel Management Engine
 * Independent, Safe & Production-Ready (Admin Scope)
 */

(() => {
  'use strict';

  const ADMIN_IDS = 0; // يمكنك إضافة Telegram ID الخاص بك هنا اختياريًا للمطابقة المباشرة

  const API_BASE = window.location.protocol.startsWith('file') 
    ? 'http://localhost:3000' 
    : window.location.origin;

  let authToken = localStorage.getItem('authToken') || localStorage.getItem('token') || localStorage.getItem('user_token');
  let isUserAdmin = false;
  const tg = window.Telegram?.WebApp;

  const currentTgUser = tg?.initDataUnsafe?.user || null;
  const currentTgUserId = currentTgUser?.id ? Number(currentTgUser.id) : null;

  function escapeHtml(text) {
    if (!text) return '';
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function showToast(msg, type = 'info') {
    if (window.appEngine && typeof window.appEngine.copyToClipboard === 'function') {
      // Use core toast if available
    }
    let toast = document.getElementById("toast");
    if (toast) {
      toast.innerText = msg;
      toast.className = `show ${type}`;
      setTimeout(() => { toast.classList.remove("show"); }, 3000);
    }
  }

  async function safeFetchAdmin(endpoint, options = {}) {
    options.headers = options.headers || {};
    authToken = localStorage.getItem('authToken') || localStorage.getItem('token') || localStorage.getItem('user_token');
    
    if (authToken) {
      options.headers['Authorization'] = `Bearer ${authToken}`;
    }
    if (tg?.initData) {
      options.headers['x-telegram-init-data'] = tg.initData;
    }
    if (!options.headers['Content-Type'] && !(options.body instanceof FormData)) {
      options.headers['Content-Type'] = 'application/json';
    }

    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const targetUrl = endpoint.startsWith('http') ? endpoint : `${API_BASE}${cleanEndpoint}`;

    try {
      const res = await fetch(targetUrl, options);
      const data = await res.json().catch(() => ({}));
      return { ok: res.ok, status: res.status, data };
    } catch (err) {
      console.error("Admin Fetch Error:", err);
      return { ok: false, status: 500, data: null };
    }
  }

  function checkAndRenderAdmin(userData = null) {
    const adminPanelBtn = document.getElementById('admin-banner-shortcut') || document.getElementById('admin-panel-btn');
    const adminTabBtn = document.getElementById('tab-btn-admin') || document.getElementById('nav-admin');
    const adminSection = document.getElementById('tab-content-admin') || document.getElementById('admin-section');

    const isDirectAdmin = Boolean(
      ADMIN_IDS > 0 && 
      currentTgUserId && 
      currentTgUserId === ADMIN_IDS
    );

    const isBackendAdmin = Boolean(
      userData && (userData.role === 'admin' || userData.isAdmin === true)
    );

    isUserAdmin = isDirectAdmin || isBackendAdmin;

    if (adminSection) {
      adminSection.style.display = isUserAdmin ? 'block' : 'none';
    }
    if (adminPanelBtn) {
      adminPanelBtn.style.display = isUserAdmin ? 'flex' : 'none';
    }
    if (adminTabBtn) {
      adminTabBtn.classList.toggle('hidden', !isUserAdmin);
      adminTabBtn.style.display = isUserAdmin ? 'flex' : 'none';
    }

    if (isUserAdmin) {
      loadAdminDashboardData();
    }
  }

  async function loadAdminDashboardData() {
    if (!isUserAdmin) return;
    try {
      const res = await safeFetchAdmin('/api/admin/dashboard-data');
      if (!res.ok || !res.data) return;

      const data = res.data;

      // Stats
      const totalUsersEl = document.getElementById('admin-total-users') || document.getElementById('stat-total-users');
      if (totalUsersEl) totalUsersEl.innerText = data.stats?.totalUsers || 0;

      const pendingEl = document.getElementById('admin-total-pending') || document.getElementById('stat-total-balance');
      if (pendingEl) pendingEl.innerText = `$${(data.stats?.totalPending || data.stats?.totalUserBalance || 0).toFixed(2)}`;

      // Render Pending Deposits
      renderDepositsList(data.deposits || data.pendingDeposits || []);

      // Render Pending Withdrawals
      renderWithdrawsList(data.withdraws || data.pendingWithdraws || []);

      // Render Users
      renderUsersList(data.users || []);

    } catch (e) {
      console.error("Error loading admin dashboard:", e);
    }
  }

  function renderDepositsList(deposits) {
    const dList = document.getElementById('admin-deposits-list');
    if (!dList) return;

    if (!Array.isArray(deposits) || deposits.length === 0) {
      dList.innerHTML = '<div style="padding:8px; color:var(--text-muted); font-size:12px;">لا توجد طلبات إيداع معلقة.</div>';
      return;
    }

    dList.innerHTML = deposits.map(d => `
      <div style="background:#0d1527; padding:8px; margin-bottom:6px; border-radius:6px; border: 1px solid var(--border-color); font-size:12px;">
        المستخدم: <b>${escapeHtml(d.advertiserId?.username || d.username || d.telegramId || 'مجهول')}</b><br>
        المبلغ: <b style="color:#10b981;">$${parseFloat(d.amount || 0).toFixed(2)}</b> | الشبكة: <code>${escapeHtml(d.paymentMethod || d.network || 'TRC20')}</code><br>
        TxID: <code style="color: #f59e0b; word-break: break-all;">${escapeHtml(d.txHash || d.txid || 'N/A')}</code><br>
        <div style="margin-top: 6px; display: flex; gap: 4px;">
          <button class="btn-small" style="background:#10b981; color:#fff; border:none; padding:4px 8px; border-radius:4px;" onclick="window.adminEngine.handleAdminDeposit('${d._id}', 'Completed')">موافقة</button>
          <button class="btn-small" style="background:#ef4444; color:#fff; border:none; padding:4px 8px; border-radius:4px;" onclick="window.adminEngine.handleAdminDeposit('${d._id}', 'Rejected')">رفض</button>
        </div>
      </div>
    `).join('');
  }

  function renderWithdrawsList(withdraws) {
    const wList = document.getElementById('admin-withdraws-list');
    if (!wList) return;

    if (!Array.isArray(withdraws) || withdraws.length === 0) {
      wList.innerHTML = '<div style="padding:8px; color:var(--text-muted); font-size:12px;">لا توجد طلبات سحب معلقة.</div>';
      return;
    }

    wList.innerHTML = withdraws.map(w => `
      <div style="background:#0d1527; padding:8px; margin-bottom:6px; border-radius:6px; border: 1px solid var(--border-color); font-size:12px;">
        المستخدم: <b>${escapeHtml(w.userId?.username || w.username || w.telegramId || 'مجهول')}</b><br>
        المبلغ: <b style="color:#10b981;">$${parseFloat(w.amount || 0).toFixed(2)}</b><br>
        المحفظة: <code>${escapeHtml(w.walletAddress)}</code><br>
        <div style="margin-top: 6px; display: flex; gap: 4px;">
          <button class="btn-small" style="background:#10b981; color:#fff; border:none; padding:4px 8px; border-radius:4px;" onclick="window.adminEngine.handleAdminWithdraw('${w._id}', 'Completed')">موافقة</button>
          <button class="btn-small" style="background:#ef4444; color:#fff; border:none; padding:4px 8px; border-radius:4px;" onclick="window.adminEngine.handleAdminWithdraw('${w._id}', 'Rejected')">رفض</button>
        </div>
      </div>
    `).join('');
  }

  function renderUsersList(users) {
    const uList = document.getElementById('admin-users-list');
    if (!uList) return;

    if (!Array.isArray(users) || users.length === 0) {
      uList.innerHTML = '<div style="padding:8px; color:var(--text-muted); font-size:12px;">لا يوجد مستخدمون مسجلون.</div>';
      return;
    }

    uList.innerHTML = users.map(u => `
      <div style="background:#0d1527; padding:8px; margin-bottom:6px; border-radius:6px; display: flex; justify-content: space-between; align-items: center; border-left: 3px solid ${u.isBanned ? '#ef4444' : '#10b981'}; font-size:12px;">
        <div>
          <b>${escapeHtml(u.username || 'بدون اسم')}</b> (${escapeHtml(String(u.telegramId || ''))})<br>
          <span style="color: var(--text-muted);">المتاح: $${(u.availableBalance || 0).toFixed(2)}</span>
        </div>
        <button class="btn-small" style="background:${u.isBanned ? '#f59e0b' : '#ef4444'}; color:#fff; border:none; padding:4px 8px; border-radius:4px;" onclick="window.adminEngine.toggleUserBan('${u._id}')">
          ${u.isBanned ? 'فك الحظر' : 'حظر'}
        </button>
      </div>
    `).join('');
  }

  async function handleAdminDeposit(depositId, action) {
    const res = await safeFetchAdmin('/api/admin/deposit/action', {
      method: 'POST',
      body: JSON.stringify({ depositId, action })
    });
    if (res.ok) {
      showToast("تم تحديث حالة طلب الإيداع", 'success');
      loadAdminDashboardData();
    }
  }

  async function handleAdminWithdraw(withdrawId, action) {
    let rejectReason = '';
    if (action === 'Rejected') {
      rejectReason = prompt("سبب الرفض (سيظهر للمستخدم):");
      if (rejectReason === null) return;
    }

    const res = await safeFetchAdmin('/api/admin/withdraw/action', {
      method: 'POST',
      body: JSON.stringify({ withdrawId, action, rejectReason })
    });
    if (res.ok) {
      showToast("تم تحديث حالة طلب السحب", 'success');
      loadAdminDashboardData();
    }
  }

  async function toggleUserBan(userId) {
    const res = await safeFetchAdmin('/api/admin/user/toggle-ban', {
      method: 'POST',
      body: JSON.stringify({ userId })
    });
    if (res.ok) {
      showToast("تم تغيير حالة حظر المستخدم", 'success');
      loadAdminDashboardData();
    }
  }

  window.adminEngine = {
    checkAndRenderAdmin,
    loadAdminDashboardData,
    handleAdminDeposit,
    handleAdminWithdraw,
    toggleUserBan
  };

  document.addEventListener('DOMContentLoaded', () => {
    checkAndRenderAdmin(null);
  });

})();
