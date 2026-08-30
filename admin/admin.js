/**
 * Admin Panel Management Engine
 * Authenticated & Stealth Access Engine
 */

const API_BASE = window.location.protocol.startsWith('file') 
  ? 'http://localhost:3000' 
  : window.location.origin;

let authToken = localStorage.getItem('authToken') || localStorage.getItem('user_token');
let isUserAdmin = false;
const tg = window.Telegram?.WebApp;

function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function triggerHaptic(style = 'light') {
  try {
    if (tg && tg.isVersionAtLeast && tg.isVersionAtLeast('6.1') && tg.HapticFeedback) {
      tg.HapticFeedback.impactOccurred(style);
    }
  } catch (e) {}
}

function showToast(msg) {
  triggerHaptic('medium');
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.innerText = msg;
  toast.classList.add("show");
  setTimeout(() => { toast.classList.remove("show"); }, 3000);
}

async function safeFetch(endpoint, options = {}) {
  options.headers = options.headers || {};
  
  // إرسال توكين التوثيق دائماً لجميع طلبات الأدمن
  if (authToken) {
    options.headers['Authorization'] = `Bearer ${authToken}`;
  }
  if (tg && tg.initData) {
    options.headers['x-telegram-init-data'] = tg.initData;
  }
  
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const targetUrl = endpoint.startsWith('http') ? endpoint : `${API_BASE}${cleanEndpoint}`;
  
  try {
    const response = await fetch(targetUrl, options);
    if (response.status === 404) {
      // التعامل مع حالة التمويه والتوجيه التلقائي في حالة فشل الصلاحية
      document.body.innerHTML = '<h1>404 Not Found</h1><p>The requested URL was not found on this server.</p>';
      return null;
    }
    return response;
  } catch (err) {
    console.error("Fetch Network Error:", err);
    showToast("Network error. Please try again.");
    return null;
  }
}

async function verifyAdminAccess() {
  const res = await safeFetch('/api/auth/check');
  if (!res) return false;
  
  const data = await res.json();
  if (data && data.success && data.isAdmin) {
    isUserAdmin = true;
    return true;
  }
  
  // حجب الواجهة وإظهار صفحة 404 بديلة فوراً إذا لم يكن المستخدم مديراً
  document.body.innerHTML = '<h1>404 Not Found</h1><p>The requested URL was not found on this server.</p>';
  return false;
}

async function loadAdminData() {
  if (!isUserAdmin) return;
  try {
    const res = await safeFetch('/api/admin/dashboard-data');
    if (!res) return;
    const data = await res.json();
    if (data.error) return showToast(data.error);

    if (document.getElementById('admin-total-users')) document.getElementById('admin-total-users').innerText = data.stats?.totalUsers || 0;
    if (document.getElementById('admin-total-pending')) document.getElementById('admin-total-pending').innerText = `$${(data.stats?.totalPending || 0).toFixed(2)}`;

    const dList = document.getElementById('admin-deposits-list');
    if (dList) {
      if (!data.deposits || data.deposits.length === 0) dList.innerHTML = 'No pending deposit requests.';
      else {
        dList.innerHTML = data.deposits.map(d => `
          <div style="background:#0d1527; padding:8px; margin-bottom:6px; border-radius:6px; border: 1px solid var(--border-color);">
            User: <b>${escapeHTML(d.advertiserId?.username || d.advertiserId?.telegramId || 'Unknown')}</b><br>
            Amount: <b style="color:var(--success);">$${parseFloat(d.amount || 0).toFixed(2)}</b> | Network: <code>${escapeHTML(d.network || d.paymentMethod)}</code><br>
            TxID: <code style="color: var(--warning); word-break: break-all;">${escapeHTML(d.txid || d.txHash || 'N/A')}</code><br>
            <div style="margin-top: 6px; display: flex; gap: 4px;">
              <button class="btn-small btn-success" onclick="handleAdminDeposit('${d._id}', 'Completed')">Approve</button>
              <button class="btn-small btn-danger" onclick="handleAdminDeposit('${d._id}', 'Rejected')">Reject</button>
            </div>
          </div>
        `).join('');
      }
    }

    const wList = document.getElementById('admin-withdraws-list');
    if (wList) {
      if (!data.withdraws || data.withdraws.length === 0) wList.innerHTML = 'No pending withdrawal requests.';
      else {
        wList.innerHTML = data.withdraws.map(w => `
          <div style="background:#0d1527; padding:8px; margin-bottom:6px; border-radius:6px; border: 1px solid var(--border-color);">
            User: <b>${escapeHTML(w.userId?.username || w.userId?.telegramId || 'Unknown')}</b><br>
            Amount: <b style="color:var(--success);">$${parseFloat(w.amount || 0).toFixed(2)}</b><br>
            Wallet: <code>${escapeHTML(w.walletAddress)}</code><br>
            <div style="margin-top: 6px; display: flex; gap: 4px;">
              <button class="btn-small btn-success" onclick="handleAdminWithdraw('${w._id}', 'Completed')">Approve</button>
              <button class="btn-small btn-danger" onclick="handleAdminWithdraw('${w._id}', 'Rejected')">Reject</button>
            </div>
          </div>
        `).join('');
      }
    }

    const uList = document.getElementById('admin-users-list');
    if (uList) {
      if (!data.users || data.users.length === 0) uList.innerHTML = 'No users found.';
      else {
        uList.innerHTML = data.users.map(u => `
          <div style="background:#0d1527; padding:8px; margin-bottom:6px; border-radius:6px; display: flex; justify-content: space-between; align-items: center; border-left: 3px solid ${u.isBanned ? 'var(--danger)' : 'var(--success)'};">
            <div>
              <b>${escapeHTML(u.username || 'Unknown')}</b> (${escapeHTML(String(u.telegramId || ''))})<br>
              <span style="color: var(--text-muted);">Available: $${(u.availableBalance || 0).toFixed(2)}</span>
            </div>
            <button class="btn-small ${u.isBanned ? 'btn-warning' : 'btn-danger'}" onclick="toggleUserBan('${u._id}')">
              ${u.isBanned ? 'Unban' : 'Ban'}
            </button>
          </div>
        `).join('');
      }
    }
  } catch (e) {
    showToast("Failed to load admin data");
  }
}

async function handleAdminDeposit(depositId, action) {
  triggerHaptic('medium');
  try {
    const res = await safeFetch('/api/admin/deposit/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ depositId, action })
    });
    if (!res) return;
    const data = await res.json();
    if (data.error) showToast(data.error);
    else {
      showToast("Deposit request updated");
      loadAdminData();
    }
  } catch (e) {
    showToast("Deposit action failed");
  }
}

async function handleAdminWithdraw(withdrawId, action) {
  let rejectReason = '';
  if (action === 'Rejected') {
    rejectReason = prompt("Rejection reason (shown to user):");
    if (rejectReason === null) return;
  }

  triggerHaptic('medium');
  try {
    const res = await safeFetch('/api/admin/withdraw/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ withdrawId, action, rejectReason })
    });
    if (!res) return;
    const data = await res.json();
    if (data.error) showToast(data.error);
    else {
      showToast("Withdrawal request updated");
      loadAdminData();
    }
  } catch (e) {
    showToast("Action failed");
  }
}

async function toggleUserBan(userId) {
  triggerHaptic('medium');
  try {
    const res = await safeFetch('/api/admin/user/toggle-ban', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId })
    });
    if (!res) return;
    const data = await res.json();
    if (data.error) showToast(data.error);
    else {
      showToast(data.isBanned ? "User banned" : "User unbanned");
      loadAdminData();
    }
  } catch (e) {
    showToast("Error changing ban state");
  }
}

window.addEventListener('DOMContentLoaded', async () => {
  if (tg) {
    tg.ready();
    tg.expand();
  }
  
  const authorized = await verifyAdminAccess();
  if (authorized) {
    loadAdminData();
  }
});
