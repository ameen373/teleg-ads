import { state } from '../state.js';
import { safeFetch } from './api.js';
import { showToast, escapeHTML } from './ui.js';

export async function loadAdminData() {
  if (!state.isUserAdmin) return;

  try {
    const res = await safeFetch('/api/admin/overview');
    if (res && res.ok) {
      const data = await res.json().catch(() => ({}));
      
      const totalUsers = document.getElementById('admin-total-users');
      const totalPending = document.getElementById('admin-total-pending');

      if (totalUsers) totalUsers.innerText = data.totalUsers || 0;
      if (totalPending) totalPending.innerText = `$${Number(data.totalPendingBalance || 0).toFixed(2)}`;

      fetchAdminDeposits();
      fetchAdminWithdraws();
      fetchAdminUsers();
      fetchAdminLinks();
      fetchAdminAds();
    }
  } catch (err) {
    console.error("Admin load error:", err);
  }
}

export async function fetchAdminDeposits() {
  const container = document.getElementById('admin-deposits-list');
  if (!container) return;

  try {
    const res = await safeFetch('/api/admin/deposits');
    if (res && res.ok) {
      const list = await res.json().catch(() => []);
      if (list.length === 0) {
        container.innerHTML = `<p style="color:var(--text-muted); text-align:center;">لا توجد طلبات إيداع معلقة</p>`;
        return;
      }
      container.innerHTML = list.map(d => `
        <div style="padding:8px 0; border-bottom:1px solid var(--card-border); font-size:12px;">
          <div><b>مستخدم:</b> ${d.userId} | <b>مبلغ:</b> $${d.amount} (${d.network})</div>
          <div style="word-break:break-all; color:var(--text-muted);"><b>TxID:</b> ${escapeHTML(d.txHash)}</div>
          <div style="margin-top:6px; display:flex; gap:6px;">
            <button class="btn-small btn-success" onclick="approveDeposit('${d._id}')">قبول</button>
            <button class="btn-small btn-danger" onclick="rejectDeposit('${d._id}')">رفض</button>
          </div>
        </div>
      `).join('');
    }
  } catch (err) {}
}

export async function approveDeposit(id) {
  const res = await safeFetch(`/api/admin/deposits/${id}/approve`, { method: 'POST' });
  if (res && res.ok) {
    showToast("تم قبول طلب الإيداع");
    fetchAdminDeposits();
  }
}

export async function rejectDeposit(id) {
  const res = await safeFetch(`/api/admin/deposits/${id}/reject`, { method: 'POST' });
  if (res && res.ok) {
    showToast("تم رفض طلب الإيداع");
    fetchAdminDeposits();
  }
}

export async function fetchAdminWithdraws() {
  const container = document.getElementById('admin-withdraws-list');
  if (!container) return;

  try {
    const res = await safeFetch('/api/admin/withdrawals');
    if (res && res.ok) {
      const list = await res.json().catch(() => []);
      if (list.length === 0) {
        container.innerHTML = `<p style="color:var(--text-muted); text-align:center;">لا توجد طلبات سحب معلقة</p>`;
        return;
      }
      container.innerHTML = list.map(w => `
        <div style="padding:8px 0; border-bottom:1px solid var(--card-border); font-size:12px;">
          <div><b>مستخدم:</b> ${w.userId} | <b>مبلغ:</b> $${w.amount}</div>
          <div style="margin-top:6px; display:flex; gap:6px;">
            <button class="btn-small btn-success" onclick="approveWithdraw('${w._id}')">موافقة وتأكيد</button>
            <button class="btn-small btn-danger" onclick="rejectWithdraw('${w._id}')">رفض وإعادة</button>
          </div>
        </div>
      `).join('');
    }
  } catch (err) {}
}

export async function approveWithdraw(id) {
  const res = await safeFetch(`/api/admin/withdrawals/${id}/approve`, { method: 'POST' });
  if (res && res.ok) {
    showToast("تم تأكيد السحب");
    fetchAdminWithdraws();
  }
}

export async function rejectWithdraw(id) {
  const res = await safeFetch(`/api/admin/withdrawals/${id}/reject`, { method: 'POST' });
  if (res && res.ok) {
    showToast("تم رفض السحب");
    fetchAdminWithdraws();
  }
}

export async function fetchAdminUsers() {
  const container = document.getElementById('admin-users-list');
  if (!container) return;
  try {
    const res = await safeFetch('/api/admin/users');
    if (res && res.ok) {
      const list = await res.json().catch(() => []);
      container.innerHTML = list.slice(0, 10).map(u => `
        <div style="padding:6px 0; border-bottom:1px solid var(--card-border); font-size:11px; display:flex; justify-style:space-between; align-items:center;">
          <span>👤 ${escapeHTML(u.firstName || u.username || u.telegramId)}</span>
          <span>💰 $${Number(u.balance || 0).toFixed(2)}</span>
        </div>
      `).join('');
    }
  } catch (e) {}
}

export async function fetchAdminLinks() {
  const container = document.getElementById('admin-links-list');
  if (!container) return;
  try {
    const res = await safeFetch('/api/admin/links');
    if (res && res.ok) {
      const list = await res.json().catch(() => []);
      container.innerHTML = list.slice(0, 10).map(l => `
        <div style="padding:6px 0; border-bottom:1px solid var(--card-border); font-size:11px;">
          🔗 <b>${escapeHTML(l.title || l.shortCode)}</b> (👁️ ${l.views || 0})
        </div>
      `).join('');
    }
  } catch (e) {}
}

export async function fetchAdminAds() {
  const container = document.getElementById('admin-ads-list');
  if (!container) return;
  try {
    const res = await safeFetch('/api/admin/ads');
    if (res && res.ok) {
      const list = await res.json().catch(() => []);
      container.innerHTML = list.slice(0, 10).map(a => `
        <div style="padding:6px 0; border-bottom:1px solid var(--card-border); font-size:11px;">
          📢 <b>${escapeHTML(a.title)}</b> ($${a.budget})
        </div>
      `).join('');
    }
  } catch (e) {}
}
