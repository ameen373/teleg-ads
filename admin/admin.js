/**
 * Admin Panel Main Logic Engine
 * Unified, Secure & Full Control Center
 */

const API_BASE = window.location.protocol.startsWith('file') 
  ? 'http://localhost:3000' 
  : window.location.origin;

let authToken = localStorage.getItem('token') || null;
let adminStats = null;

// ==========================================
// 1. Helper API Request with Admin Headers
// ==========================================
async function fetchAdminAPI(endpoint, options = {}) {
  const headers = options.headers || {};
  
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }
  
  if (window.Telegram?.WebApp?.initData) {
    headers['x-telegram-init-data'] = window.Telegram.WebApp.initData;
  }
  
  if (!headers['Content-Type'] && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const config = {
    ...options,
    headers
  };

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, config);
    const data = await response.json();
    
    if (response.status === 401 || response.status === 403) {
      showToast('عذراً، لا تملك صلاحيات الأدمن للوصول إلى هذه اللوحة.', 'error');
      setTimeout(() => {
        window.location.href = '/';
      }, 2000);
      return { ok: false, status: response.status, data };
    }
    
    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    console.error('Admin API Request Error:', error);
    return { ok: false, status: 500, data: { success: false, error: 'تعذر الاتصال بالخادم.' } };
  }
}

// ==========================================
// 2. Notification Helper (Toast)
// ==========================================
function showToast(message, type = 'info') {
  let toastContainer = document.getElementById('toast-container');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';
    toastContainer.style.cssText = `
      position: fixed;
      top: 20px;
      right: 50%;
      transform: translateX(50%);
      z-index: 9999;
      display: flex;
      flex-direction: column;
      gap: 10px;
      pointer-events: none;
      width: 90%;
      max-width: 400px;
    `;
    document.body.appendChild(toastContainer);
  }

  const toast = document.createElement('div');
  const bgColor = type === 'error' ? '#ef4444' : type === 'success' ? '#10b981' : '#3b82f6';
  
  toast.style.cssText = `
    background: ${bgColor};
    color: #ffffff;
    padding: 12px 16px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    opacity: 0;
    transform: translateY(-20px);
    transition: all 0.3s ease;
    text-align: center;
    pointer-events: auto;
  `;
  
  toast.innerText = message;
  toastContainer.appendChild(toast);

  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
  });

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-20px)';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ==========================================
// 3. Admin Initialization
// ==========================================
async function initAdminPanel() {
  if (window.Telegram?.WebApp) {
    window.Telegram.WebApp.ready();
    window.Telegram.WebApp.expand();
  }

  await loadAdminDashboard();
}

async function loadAdminDashboard() {
  const res = await fetchAdminAPI('/api/admin/stats');
  if (res.ok && res.data.success) {
    adminStats = res.data;
    renderStatsOverview(res.data.stats || {});
    renderPendingDeposits(res.data.pendingDeposits || []);
    renderPendingWithdraws(res.data.pendingWithdraws || []);
    renderUsersList(res.data.users || []);
    renderSystemSettings(res.data.settings || {});
  } else {
    showToast(res.data?.error || 'فشل تحميل بيانات لوحة الإدارة.', 'error');
  }
}

// ==========================================
// 4. Render Admin Components
// ==========================================
function renderStatsOverview(stats) {
  const totalUsersEl = document.getElementById('stat-total-users');
  const totalBalanceEl = document.getElementById('stat-total-balance');
  const totalDepositsEl = document.getElementById('stat-total-deposits');
  const totalWithdrawsEl = document.getElementById('stat-total-withdraws');
  const activeAdsEl = document.getElementById('stat-active-ads');

  if (totalUsersEl) totalUsersEl.innerText = stats.totalUsers || 0;
  if (totalBalanceEl) totalBalanceEl.innerText = `$${(stats.totalUserBalance || 0).toFixed(2)}`;
  if (totalDepositsEl) totalDepositsEl.innerText = `$${(stats.totalDepositsApproved || 0).toFixed(2)}`;
  if (totalWithdrawsEl) totalWithdrawsEl.innerText = `$${(stats.totalWithdrawsApproved || 0).toFixed(2)}`;
  if (activeAdsEl) activeAdsEl.innerText = stats.activeAdsCount || 0;
}

function renderPendingDeposits(deposits) {
  const container = document.getElementById('admin-deposits-list');
  if (!container) return;

  if (deposits.length === 0) {
    container.innerHTML = '<div class="empty-state">لا توجد طلبات إيداع معلقة حالياً.</div>';
    return;
  }

  container.innerHTML = deposits.map(dep => `
    <div class="admin-card">
      <div class="admin-card-header">
        <span><b>المستخدم:</b> ${escapeHtml(dep.username || dep.telegramId)}</span>
        <span class="badge warning">معلق</span>
      </div>
      <div class="admin-card-body">
        <p><b>المبلغ:</b> $${dep.amount.toFixed(2)}</p>
        <p><b>الشبكة:</b> ${dep.network}</p>
        <p><b>TxID:</b> <code class="txid-code">${escapeHtml(dep.txid)}</code></p>
        <p><small><b>التاريخ:</b> ${new Date(dep.createdAt).toLocaleString('ar-EG')}</small></p>
      </div>
      <div class="admin-card-actions">
        <button class="btn btn-success" onclick="processDeposit('${dep._id}', 'approve')">قبول الإيداع</button>
        <button class="btn btn-danger" onclick="processDeposit('${dep._id}', 'reject')">رفض الطلب</button>
      </div>
    </div>
  `).join('');
}

function renderPendingWithdraws(withdraws) {
  const container = document.getElementById('admin-withdraws-list');
  if (!container) return;

  if (withdraws.length === 0) {
    container.innerHTML = '<div class="empty-state">لا توجد طلبات سحب معلقة حالياً.</div>';
    return;
  }

  container.innerHTML = withdraws.map(w => `
    <div class="admin-card">
      <div class="admin-card-header">
        <span><b>المستخدم:</b> ${escapeHtml(w.username || w.telegramId)}</span>
        <span class="badge warning">معلق</span>
      </div>
      <div class="admin-card-body">
        <p><b>المبلغ:</b> $${w.amount.toFixed(2)}</p>
        <p><b>الشبكة:</b> ${w.network}</p>
        <p><b>المحفظة:</b> <code class="txid-code">${escapeHtml(w.walletAddress)}</code></p>
        <p><small><b>التاريخ:</b> ${new Date(w.createdAt).toLocaleString('ar-EG')}</small></p>
      </div>
      <div class="admin-card-actions">
        <button class="btn btn-success" onclick="processWithdraw('${w._id}', 'approve')">تأكيد تحويل السحب</button>
        <button class="btn btn-danger" onclick="processWithdraw('${w._id}', 'reject')">رفض وإعادة الرصيد</button>
      </div>
    </div>
  `).join('');
}

function renderUsersList(users) {
  const container = document.getElementById('admin-users-list');
  if (!container) return;

  if (users.length === 0) {
    container.innerHTML = '<div class="empty-state">لا يوجد مستخدمون مسجلون بعد.</div>';
    return;
  }

  container.innerHTML = users.map(u => `
    <div class="admin-card">
      <div class="admin-card-header">
        <span><b>${escapeHtml(u.username || 'مستخدم بدون اسم')}</b> (${u.telegramId})</span>
        <span class="badge ${u.isBanned ? 'danger' : 'success'}">${u.isBanned ? 'محظور' : 'نشط'}</span>
      </div>
      <div class="admin-card-body">
        <p><b>الرصيد المتاح:</b> $${(u.availableBalance || 0).toFixed(4)}</p>
        <p><b>الرصيد المعلق:</b> $${(u.pendingBalance || 0).toFixed(4)}</p>
        <p><b>الرتبة:</b> ${u.role === 'admin' ? '<b>أدمن</b>' : 'عضو'}</p>
      </div>
      <div class="admin-card-actions">
        <button class="btn btn-warning" onclick="promptAdjustBalance('${u._id}', ${u.availableBalance})">تعديل الرصيد</button>
        <button class="btn ${u.isBanned ? 'btn-success' : 'btn-danger'}" onclick="toggleUserBan('${u._id}', ${!u.isBanned})">
          ${u.isBanned ? 'فك الحظر' : 'حظر الحساب'}
        </button>
      </div>
    </div>
  `).join('');
}

function renderSystemSettings(settings) {
  const trcInput = document.getElementById('setting-trc20');
  const bepInput = document.getElementById('setting-bep20');
  const cpmInput = document.getElementById('setting-cpm');

  if (trcInput) trcInput.value = settings.depositWallets?.trc20 || '';
  if (bepInput) bepInput.value = settings.depositWallets?.bep20 || '';
  if (cpmInput) cpmInput.value = settings.defaultCpm || 2.0;
}

// ==========================================
// 5. Admin Actions & Operations
// ==========================================
async function processDeposit(depositId, action) {
  if (!confirm(`هل أنت تأكد من إتمام إجراء [${action === 'approve' ? 'موافقة' : 'رفض'}] هذا الإيداع؟`)) return;

  const res = await fetchAdminAPI('/api/admin/deposits/process', {
    method: 'POST',
    body: JSON.stringify({ depositId, action })
  });

  if (res.ok && res.data.success) {
    showToast('تمت معالجة طلب الإيداع بنجاح', 'success');
    loadAdminDashboard();
  } else {
    showToast(res.data?.error || 'فشلت معالجة الطلب.', 'error');
  }
}

async function processWithdraw(withdrawId, action) {
  if (!confirm(`هل أنت تأكد من إتمام إجراء [${action === 'approve' ? 'موافقة' : 'رفض'}] هذا السحب؟`)) return;

  const res = await fetchAdminAPI('/api/admin/withdraws/process', {
    method: 'POST',
    body: JSON.stringify({ withdrawId, action })
  });

  if (res.ok && res.data.success) {
    showToast('تمت معالجة طلب السحب بنجاح', 'success');
    loadAdminDashboard();
  } else {
    showToast(res.data?.error || 'فشلت معالجة الطلب.', 'error');
  }
}

async function promptAdjustBalance(userId, currentBalance) {
  const newBalanceStr = prompt('أدخل قيمة الرصيد المتاح الجديد للمستخدم ($):', currentBalance);
  if (newBalanceStr === null) return;

  const newBalance = parseFloat(newBalanceStr);
  if (isNaN(newBalance) || newBalance < 0) {
    showToast('يرجى إدخال مبلغ صحيح', 'error');
    return;
  }

  const res = await fetchAdminAPI('/api/admin/users/balance', {
    method: 'POST',
    body: JSON.stringify({ userId, newBalance })
  });

  if (res.ok && res.data.success) {
    showToast('تم تحديث رصيد المستخدم بنجاح', 'success');
    loadAdminDashboard();
  } else {
    showToast(res.data?.error || 'فشل تحديث الرصيد.', 'error');
  }
}

async function toggleUserBan(userId, shouldBan) {
  const actionText = shouldBan ? 'حظر' : 'فك حظر';
  if (!confirm(`هل أنت متأكد من ${actionText} هذا المستخدم؟`)) return;

  const res = await fetchAdminAPI('/api/admin/users/ban', {
    method: 'POST',
    body: JSON.stringify({ userId, isBanned: shouldBan })
  });

  if (res.ok && res.data.success) {
    showToast(`تم ${actionText} المستخدم بنجاح`, 'success');
    loadAdminDashboard();
  } else {
    showToast(res.data?.error || 'فشلت العملية.', 'error');
  }
}

async function saveAdminSettings() {
  const trc20 = document.getElementById('setting-trc20')?.value?.trim();
  const bep20 = document.getElementById('setting-bep20')?.value?.trim();
  const defaultCpm = parseFloat(document.getElementById('setting-cpm')?.value);

  const res = await fetchAdminAPI('/api/admin/settings', {
    method: 'POST',
    body: JSON.stringify({
      depositWallets: { trc20, bep20 },
      defaultCpm
    })
  });

  if (res.ok && res.data.success) {
    showToast('تم حفظ إعدادات النظام بنجاح', 'success');
    loadAdminDashboard();
  } else {
    showToast(res.data?.error || 'فشل حفظ الإعدادات.', 'error');
  }
}

async function createBroadcastAnnouncement() {
  const titleInput = document.getElementById('announcement-title');
  const messageInput = document.getElementById('announcement-message');

  const title = titleInput?.value?.trim();
  const message = messageInput?.value?.trim();

  if (!title || !message) {
    showToast('يرجى إدخال عنوان ونص الإعلان', 'error');
    return;
  }

  const res = await fetchAdminAPI('/api/admin/announcements', {
    method: 'POST',
    body: JSON.stringify({ title, message })
  });

  if (res.ok && res.data.success) {
    showToast('تم نشر الإعلان بنجاح للجميع!', 'success');
    if (titleInput) titleInput.value = '';
    if (messageInput) messageInput.value = '';
  } else {
    showToast(res.data?.error || 'فشل نشر الإعلان.', 'error');
  }
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function switchAdminTab(tabId) {
  const tabs = document.querySelectorAll('.admin-tab-content');
  const navs = document.querySelectorAll('.admin-nav-item');

  tabs.forEach(tab => tab.classList.remove('active'));
  navs.forEach(nav => nav.classList.remove('active'));

  const targetTab = document.getElementById(tabId);
  const targetNav = document.getElementById(`admin-nav-${tabId}`);

  if (targetTab) targetTab.classList.add('active');
  if (targetNav) targetNav.classList.add('active');
}

// Back to User Dashboard
function goToUserDashboard() {
  window.location.href = '/';
}

// ==========================================
// 6. DOM Listener Initialization
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  initAdminPanel();
});
