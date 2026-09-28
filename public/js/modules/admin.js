// public/js/modules/admin.js

async function loadAdminData() {
  if (!isUserAdmin) return;

  try {
    const res = await safeFetch('/api/admin/dashboard');
    if (res && res.ok) {
      const data = await res.json().catch(() => ({}));
      
      const totalUsersElem = document.getElementById('admin-total-users');
      const totalPendingElem = document.getElementById('admin-total-pending');

      if (totalUsersElem) totalUsersElem.innerText = data.totalUsers || 0;
      if (totalPendingElem) totalPendingElem.innerText = `$${(data.totalPendingBalance || 0).toFixed(2)}`;

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

function renderAdminDeposits(list) {
  const c = document.getElementById('admin-deposits-list');
  if (!c) return;
  if (!list || !list.length) { c.innerHTML = '<p style="color:var(--text-muted);">لا توجد طلبات إيداع معلقة</p>'; return; }
  c.innerHTML = list.map(d => `
    <div style="background:#070a12; padding:10px; border-radius:10px; margin-bottom:8px; border:1px solid var(--card-border);">
      <div><b>مستخدم:</b> ${d.userId} | <b>المبلغ:</b> $${d.amount}</div>
      <div style="font-size:10px; color:var(--text-muted); word-break:break-all;"><b>TxID:</b> ${d.txid || d.txHash}</div>
      <div style="margin-top:6px;">
        <button class="btn-small btn-success" onclick="processAdminAction('deposit', '${d._id}', 'approve')">قبول</button>
        <button class="btn-small btn-danger" onclick="processAdminAction('deposit', '${d._id}', 'reject')">رفض</button>
      </div>
    </div>
  `).join('');
}

function renderAdminWithdraws(list) {
  const c = document.getElementById('admin-withdraws-list');
  if (!c) return;
  if (!list || !list.length) { c.innerHTML = '<p style="color:var(--text-muted);">لا توجد طلبات سحب معلقة</p>'; return; }
  c.innerHTML = list.map(w => `
    <div style="background:#070a12; padding:10px; border-radius:10px; margin-bottom:8px; border:1px solid var(--card-border);">
      <div><b>مستخدم:</b> ${w.userId} | <b>المبلغ:</b> $${w.amount}</div>
      <div style="font-size:10px; color:var(--text-muted); word-break:break-all;"><b>المحفظة:</b> ${w.wallet}</div>
      <div style="margin-top:6px;">
        <button class="btn-small btn-success" onclick="processAdminAction('withdraw', '${w._id}', 'approve')">تأكيد الدفع</button>
        <button class="btn-small btn-danger" onclick="processAdminAction('withdraw', '${w._id}', 'reject')">إلغاء الطلب</button>
      </div>
    </div>
  `).join('');
}

function renderAdminUsers(list) {
  const c = document.getElementById('admin-users-list');
  if (!c) return;
  if (!list) return;
  c.innerHTML = list.map(u => `
    <div style="background:#070a12; padding:8px; border-radius:8px; margin-bottom:6px; font-size:11px;">
      <b>ID:</b> ${u.telegramId} | <b>المتاح:</b> $${(u.availableBalance||0).toFixed(2)} | <b>المعلق:</b> $${(u.pendingBalance||0).toFixed(2)}
    </div>
  `).join('');
}

function renderAdminLinks(list) {
  const c = document.getElementById('admin-links-list');
  if (!c) return;
  if (!list) return;
  c.innerHTML = list.map(l => `
    <div style="background:#070a12; padding:8px; border-radius:8px; margin-bottom:6px; font-size:11px;">
      <b>كود:</b> ${l.shortCode} | <b>الزيارات:</b> ${l.views||0}
    </div>
  `).join('');
}

function renderAdminAds(list) {
  const c = document.getElementById('admin-ads-list');
  if (!c) return;
  if (!list) return;
  c.innerHTML = list.map(a => `
    <div style="background:#070a12; padding:8px; border-radius:8px; margin-bottom:6px; font-size:11px;">
      <b>عنوان:</b> ${escapeHTML(a.title)} | <b>الميزانية:</b> $${a.budget}
    </div>
  `).join('');
}

async function processAdminAction(type, itemId, action) {
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
