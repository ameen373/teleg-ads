import { state } from './state.js';
import { safeFetch } from './api.js';
import { escapeHTML, showToast } from './ui.js';

export async function loadAdminData() {
  if (!state.isUserAdmin) return;

  try {
    const res = await safeFetch('/api/admin/dashboard');
    if (res && res.ok) {
      const data = await res.json().catch(() => ({}));
      
      const totalUsers = document.getElementById('admin-total-users');
      const totalPending = document.getElementById('admin-total-pending');

      if (totalUsers) totalUsers.innerText = data.totalUsers || 0;
      if (totalPending) totalPending.innerText = `$${(data.totalPendingBalance || 0).toFixed(2)}`;

      if (data.pendingDeposits) renderAdminDeposits(data.pendingDeposits);
      if (data.pendingWithdraws) renderAdminWithdraws(data.pendingWithdraws);
      if (data.users) renderAdminUsers(data.users);
      if (data.links) renderAdminLinks(data.links);
      if (data.ads) renderAdminAds(data.ads);
    }
  } catch (err) {
    console.error("Admin data error:", err);
  }
}

export function renderAdminDeposits(list) {
  const c = document.getElementById('admin-deposits-list');
  if (!c) return;
  if (!list || !list.length) { c.innerHTML = '<p style="color:var(--text-muted);">لا توجد طلبات إيداع معلقة</p>'; return; }
  c.innerHTML = list.map(d => {
    const u = d.user || d;
    const fullName = escapeHTML(`${u.firstName || ''} ${u.lastName || ''}`.trim() || u.fullName || u.name || 'غير محدد');
    const username = u.username ? `@${escapeHTML(u.username.replace(/^@/, ''))}` : '@no_username';
    const tgId = escapeHTML(String(d.telegramId || d.userId || u.telegramId || '—'));

    return `
      <div style="background:#070a12; padding:10px; border-radius:10px; margin-bottom:8px; border:1px solid var(--card-border);">
        <div style="font-size:12px; margin-bottom:4px; color:var(--text);">
          <b>الاسم:</b> ${fullName} | <b>المعرف:</b> ${username} | <b>الآيدي:</b> ${tgId}
        </div>
        <div style="font-size:11px; margin-bottom:4px;"><b>المبلغ:</b> $${(d.amount || 0).toFixed(2)}</div>
        <div style="font-size:10px; color:var(--text-muted); word-break:break-all;"><b>TxID:</b> ${escapeHTML(d.txid || d.txHash || '')}</div>
        <div style="margin-top:6px;">
          <button class="btn-small btn-success" onclick="processAdminAction('deposit', '${d._id}', 'approve')">قبول</button>
          <button class="btn-small btn-danger" onclick="processAdminAction('deposit', '${d._id}', 'reject')">رفض</button>
        </div>
      </div>
    `;
  }).join('');
}

export function renderAdminWithdraws(list) {
  const c = document.getElementById('admin-withdraws-list');
  if (!c) return;
  if (!list || !list.length) { c.innerHTML = '<p style="color:var(--text-muted);">لا توجد طلبات سحب معلقة</p>'; return; }
  c.innerHTML = list.map(w => {
    const u = w.user || w;
    const fullName = escapeHTML(`${u.firstName || ''} ${u.lastName || ''}`.trim() || u.fullName || u.name || 'غير محدد');
    const username = u.username ? `@${escapeHTML(u.username.replace(/^@/, ''))}` : '@no_username';
    const tgId = escapeHTML(String(w.telegramId || w.userId || u.telegramId || '—'));

    return `
      <div style="background:#070a12; padding:10px; border-radius:10px; margin-bottom:8px; border:1px solid var(--card-border);">
        <div style="font-size:12px; margin-bottom:4px; color:var(--text);">
          <b>الاسم:</b> ${fullName} | <b>المعرف:</b> ${username} | <b>الآيدي:</b> ${tgId}
        </div>
        <div style="font-size:11px; margin-bottom:4px;"><b>المبلغ:</b> $${(w.amount || 0).toFixed(2)}</div>
        <div style="font-size:10px; color:var(--text-muted); word-break:break-all;"><b>المحفظة:</b> ${escapeHTML(w.wallet || '')}</div>
        <div style="margin-top:6px;">
          <button class="btn-small btn-success" onclick="processAdminAction('withdraw', '${w._id}', 'approve')">تأكيد الدفع</button>
          <button class="btn-small btn-danger" onclick="processAdminAction('withdraw', '${w._id}', 'reject')">إلغاء الطلب</button>
        </div>
      </div>
    `;
  }).join('');
}

export function renderAdminUsers(list) {
  const c = document.getElementById('admin-users-list');
  if (!c) return;
  if (!list || !list.length) { c.innerHTML = '<p style="color:var(--text-muted);">لا يوجد مستخدمون</p>'; return; }
  c.innerHTML = list.map(u => {
    const fullName = escapeHTML(`${u.firstName || ''} ${u.lastName || ''}`.trim() || u.fullName || u.name || 'غير محدد');
    const username = u.username ? `@${escapeHTML(u.username.replace(/^@/, ''))}` : '@no_username';
    const tgId = escapeHTML(String(u.telegramId || u.userId || u._id || '—'));

    return `
      <div style="background:#070a12; padding:10px; border-radius:8px; margin-bottom:6px; font-size:11px; border:1px solid var(--card-border);">
        <div style="margin-bottom:4px;"><b>الاسم:</b> ${fullName} | <b>المعرف:</b> ${username} | <b>الآيدي:</b> ${tgId}</div>
        <div style="color:var(--text-muted);"><b>المتاح:</b> $${(u.availableBalance||0).toFixed(2)} | <b>المعلق:</b> $${(u.pendingBalance||0).toFixed(2)}</div>
      </div>
    `;
  }).join('');
}

export function renderAdminLinks(list) {
  const c = document.getElementById('admin-links-list');
  if (!c) return;
  c.innerHTML = list.map(l => `
    <div style="background:#070a12; padding:8px; border-radius:8px; margin-bottom:6px; font-size:11px;">
      <b>كود:</b> ${l.shortCode} | <b>الزيارات:</b> ${l.views||0}
    </div>
  `).join('');
}

export function renderAdminAds(list) {
  const c = document.getElementById('admin-ads-list');
  if (!c) return;
  c.innerHTML = list.map(a => `
    <div style="background:#070a12; padding:8px; border-radius:8px; margin-bottom:6px; font-size:11px;">
      <b>عنوان:</b> ${escapeHTML(a.title)} | <b>الميزانية:</b> $${a.budget}
    </div>
  `).join('');
}

export async function processAdminAction(type, itemId, action) {
  try {
    const res = await safeFetch(`/api/admin/${type}/${action}`, {
      method: 'POST',
      body: { id: itemId }
    });
    if (res && res.ok) {
      showToast("تم تنفيذ الإجراء بنجاح");
      loadAdminData();
    }
  } catch (e) {
    showToast("خطأ أثناء تنفيذ الإجراء");
  }
}
