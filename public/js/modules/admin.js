// وحدة لوحة التحكم والموافقات الإدارية وتصفية الإعلانات والروابط والمستخدمين

(function () {
  /**
   * تحميل بيانات لوحة المسؤول بالكامل
   */
  async function loadAdminData() {
    if (!window.isUserAdmin) return;

    try {
      let data = null;
      if (window.API && typeof window.API.get === 'function') {
        data = await window.API.get('/api/admin/dashboard');
      } else if (typeof window.safeFetch === 'function') {
        const res = await window.safeFetch('/api/admin/dashboard');
        if (res && res.ok) data = await res.json().catch(() => ({}));
      }

      if (data) {
        const totalUsersEl = document.getElementById('admin-total-users');
        const totalPendingEl = document.getElementById('admin-total-pending');

        if (totalUsersEl) totalUsersEl.innerText = data.totalUsers || 0;
        if (totalPendingEl) totalPendingEl.innerText = `$${Number(data.totalPendingBalance || 0).toFixed(2)}`;

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

  /**
   * عرض طلبات الإيداع المعلقة
   */
  function renderAdminDeposits(list) {
    const c = document.getElementById('admin-deposits-list');
    if (!c) return;
    if (!list || !list.length) { 
      c.innerHTML = '<p style="color:var(--text-muted); font-size: 12px; text-align: center;">لا توجد طلبات إيداع معلقة</p>'; 
      return; 
    }
    c.innerHTML = list.map(d => {
      const depId = d._id || d.id;
      const tx = d.txid || d.txHash || 'N/A';
      return `
        <div style="background:#070a12; padding:10px; border-radius:10px; margin-bottom:8px; border:1px solid var(--card-border);">
          <div style="font-size:12px; color:var(--text);"><b>مستخدم:</b> ${d.userId || d.telegramId} | <b>المبلغ:</b> <span style="color:var(--success);">$${d.amount}</span></div>
          <div style="font-size:10px; color:var(--text-muted); word-break:break-all; margin: 4px 0;"><b>TxID:</b> ${tx}</div>
          <div style="margin-top:6px; display:flex; gap:6px;">
            <button class="btn-small btn-success" onclick="processAdminAction('deposit', '${depId}', 'approve')">قبول</button>
            <button class="btn-small btn-danger" onclick="processAdminAction('deposit', '${depId}', 'reject')">رفض</button>
          </div>
        </div>
      `;
    }).join('');
  }

  /**
   * عرض طلبات السحب المعلقة
   */
  function renderAdminWithdraws(list) {
    const c = document.getElementById('admin-withdraws-list');
    if (!c) return;
    if (!list || !list.length) { 
      c.innerHTML = '<p style="color:var(--text-muted); font-size: 12px; text-align: center;">لا توجد طلبات سحب معلقة</p>'; 
      return; 
    }
    c.innerHTML = list.map(w => {
      const withId = w._id || w.id;
      return `
        <div style="background:#070a12; padding:10px; border-radius:10px; margin-bottom:8px; border:1px solid var(--card-border);">
          <div style="font-size:12px; color:var(--text);"><b>مستخدم:</b> ${w.userId || w.telegramId} | <b>المبلغ:</b> <span style="color:var(--warning);">$${w.amount}</span></div>
          <div style="font-size:10px; color:var(--text-muted); word-break:break-all; margin: 4px 0;"><b>المحفظة:</b> ${w.wallet}</div>
          <div style="margin-top:6px; display:flex; gap:6px;">
            <button class="btn-small btn-success" onclick="processAdminAction('withdraw', '${withId}', 'approve')">تأكيد الدفع</button>
            <button class="btn-small btn-danger" onclick="processAdminAction('withdraw', '${withId}', 'reject')">إلغاء الطلب</button>
          </div>
        </div>
      `;
    }).join('');
  }

  /**
   * عرض إدارة المستخدمين
   */
  function renderAdminUsers(list) {
    const c = document.getElementById('admin-users-list');
    if (!c) return;
    if (!list || !list.length) { 
      c.innerHTML = '<p style="color:var(--text-muted); font-size: 12px; text-align: center;">لا يوجد مستخدمين</p>'; 
      return; 
    }
    c.innerHTML = list.map(u => {
      const userId = u._id || u.telegramId;
      const isBlocked = u.isBlocked || u.status === 'blocked';
      return `
        <div style="background:#070a12; padding:10px; border-radius:8px; margin-bottom:6px; font-size:11px; display:flex; justify-style:space-between; align-items:center; border:1px solid var(--card-border);">
          <div>
            <b>ID:</b> ${u.telegramId} | <b>المتاح:</b> $${Number(u.availableBalance||0).toFixed(2)} | <b>المعلق:</b> $${Number(u.pendingBalance||0).toFixed(2)}
          </div>
          <div>
            <button class="btn-small ${isBlocked ? 'btn-success' : 'btn-danger'}" onclick="processAdminAction('user', '${userId}', '${isBlocked ? 'unblock' : 'block'}')">
              ${isBlocked ? 'إلغاء الحظر' : 'حظر'}
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  /**
   * عرض الروابط وإدارتها
   */
  function renderAdminLinks(list) {
    const c = document.getElementById('admin-links-list');
    if (!c) return;
    if (!list || !list.length) { 
      c.innerHTML = '<p style="color:var(--text-muted); font-size: 12px; text-align: center;">لا توجد روابط</p>'; 
      return; 
    }
    c.innerHTML = list.map(l => {
      const linkId = l._id || l.shortCode;
      return `
        <div style="background:#070a12; padding:8px; border-radius:8px; margin-bottom:6px; font-size:11px; display:flex; justify-content:space-between; align-items:center; border:1px solid var(--card-border);">
          <div>
            <b>كود:</b> ${l.shortCode} | <b>الزيارات:</b> ${l.views||0} | <b>الرابط:</b> ${l.originalUrl || l.targetUrl || ''}
          </div>
          <button class="btn-small btn-danger" onclick="processAdminAction('link', '${linkId}', 'delete')">حذف المخالف</button>
        </div>
      `;
    }).join('');
  }

  /**
   * عرض الإعلانات وإدارتها
   */
  function renderAdminAds(list) {
    const c = document.getElementById('admin-ads-list');
    if (!c) return;
    if (!list || !list.length) { 
      c.innerHTML = '<p style="color:var(--text-muted); font-size: 12px; text-align: center;">لا توجد إعلانات</p>'; 
      return; 
    }
    const escapeHTML = (str) => {
      if (window.UI && typeof window.UI.escapeHTML === 'function') return window.UI.escapeHTML(str);
      return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    };

    c.innerHTML = list.map(a => {
      const adId = a._id || a.id;
      return `
        <div style="background:#070a12; padding:8px; border-radius:8px; margin-bottom:6px; font-size:11px; display:flex; justify-content:space-between; align-items:center; border:1px solid var(--card-border);">
          <div>
            <b>عنوان:</b> ${escapeHTML(a.title)} | <b>الميزانية:</b> $${a.budget || a.totalBudget || 0}
          </div>
          <button class="btn-small btn-danger" onclick="processAdminAction('ad', '${adId}', 'delete')">حذف الإعلان</button>
        </div>
      `;
    }).join('');
  }

  /**
   * تنفيذ الإجراءات الإدارية الموحدة
   */
  async function processAdminAction(type, itemId, action) {
    const showToast = (msg, typeMsg = 'info') => {
      if (window.UI && typeof window.UI.showToast === 'function') window.UI.showToast(msg, typeMsg);
      else if (typeof window.showToast === 'function') window.showToast(msg);
      else alert(msg);
    };

    try {
      let resOk = false;
      const payload = { id: itemId, type, action };

      if (window.API && typeof window.API.post === 'function') {
        const res = await window.API.post(`/api/admin/${type}/${action}`, payload);
        resOk = !!(res && (res.success || res.ok));
      } else if (typeof window.safeFetch === 'function') {
        const res = await window.safeFetch(`/api/admin/${type}/${action}`, {
          method: 'POST',
          body: payload
        });
        resOk = !!(res && res.ok);
      }

      if (resOk) {
        showToast("تم تنفيذ الإجراء الإداري بنجاح", 'success');
        await loadAdminData();
      } else {
        showToast("فشل تنفيذ الإجراء", 'error');
      }
    } catch (e) {
      showToast("خطأ أثناء تنفيذ الإجراء", 'error');
    }
  }

  // تصدير الكائن العام والمكونات للواجهة
  const AdminModule = {
    loadAdminData,
    renderAdminDeposits,
    renderAdminWithdraws,
    renderAdminUsers,
    renderAdminLinks,
    renderAdminAds,
    processAdminAction
  };

  window.AdminModule = AdminModule;
  window.loadAdminData = loadAdminData;
  window.renderAdminDeposits = renderAdminDeposits;
  window.renderAdminWithdraws = renderAdminWithdraws;
  window.renderAdminUsers = renderAdminUsers;
  window.renderAdminLinks = renderAdminLinks;
  window.renderAdminAds = renderAdminAds;
  window.processAdminAction = processAdminAction;
})();
