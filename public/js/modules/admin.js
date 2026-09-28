// Telega.ads - Admin Dashboard & System Management Module

window.AdminModule = {
  /**
   * تحميل بيانات لوحة تحكم الإدارة بالكامل
   */
  loadAdminData: async function() {
    if (!window.isUserAdmin) return;

    try {
      const data = await window.API.loadAdminData();
      if (data) {
        const totalUsersEl = document.getElementById('admin-total-users');
        const totalPendingEl = document.getElementById('admin-total-pending');

        if (totalUsersEl) totalUsersEl.innerText = data.totalUsers || 0;
        if (totalPendingEl) totalPendingEl.innerText = `$${(data.totalPendingBalance || 0).toFixed(2)}`;

        if (data.pendingDeposits) this.renderAdminDeposits(data.pendingDeposits);
        if (data.pendingWithdraws) this.renderAdminWithdraws(data.pendingWithdraws);
        if (data.users) this.renderAdminUsers(data.users);
        if (data.links) this.renderAdminLinks(data.links);
        if (data.ads) this.renderAdminAds(data.ads);
      }
    } catch (err) {
      console.error("Admin data error:", err);
    }
  },

  /**
   * عرض طلبات الإيداع المعلقة
   */
  renderAdminDeposits: function(list) {
    const c = document.getElementById('admin-deposits-list');
    if (!c) return;
    if (!list || !list.length) { 
      c.innerHTML = '<p style="color:var(--text-muted);">لا توجد طلبات إيداع معلقة</p>'; 
      return; 
    }
    c.innerHTML = list.map(d => `
      <div style="background:#070a12; padding:10px; border-radius:10px; margin-bottom:8px; border:1px solid var(--card-border);">
        <div><b>مستخدم:</b> ${d.userId} | <b>المبلغ:</b> $${d.amount}</div>
        <div style="font-size:10px; color:var(--text-muted); word-break:break-all;"><b>TxID:</b> ${d.txid || d.txHash}</div>
        <div style="margin-top:6px;">
          <button class="btn-small btn-success" onclick="window.AdminModule.processAdminAction('deposit', '${d._id}', 'approve')">قبول</button>
          <button class="btn-small btn-danger" onclick="window.AdminModule.processAdminAction('deposit', '${d._id}', 'reject')">رفض</button>
        </div>
      </div>
    `).join('');
  },

  /**
   * عرض طلبات السحب المعلقة
   */
  renderAdminWithdraws: function(list) {
    const c = document.getElementById('admin-withdraws-list');
    if (!c) return;
    if (!list || !list.length) { 
      c.innerHTML = '<p style="color:var(--text-muted);">لا توجد طلبات سحب معلقة</p>'; 
      return; 
    }
    c.innerHTML = list.map(w => `
      <div style="background:#070a12; padding:10px; border-radius:10px; margin-bottom:8px; border:1px solid var(--card-border);">
        <div><b>مستخدم:</b> ${w.userId} | <b>المبلغ:</b> $${w.amount}</div>
        <div style="font-size:10px; color:var(--text-muted); word-break:break-all;"><b>المحفظة:</b> ${w.wallet}</div>
        <div style="margin-top:6px;">
          <button class="btn-small btn-success" onclick="window.AdminModule.processAdminAction('withdraw', '${w._id}', 'approve')">تأكيد الدفع</button>
          <button class="btn-small btn-danger" onclick="window.AdminModule.processAdminAction('withdraw', '${w._id}', 'reject')">إلغاء الطلب</button>
        </div>
      </div>
    `).join('');
  },

  /**
   * عرض قائمة مستخدمي النظام
   */
  renderAdminUsers: function(list) {
    const c = document.getElementById('admin-users-list');
    if (!c) return;
    if (!list || !list.length) { 
      c.innerHTML = '<p style="color:var(--text-muted);">لا يوجد مستخدمين</p>'; 
      return; 
    }
    c.innerHTML = list.map(u => `
      <div style="background:#070a12; padding:8px; border-radius:8px; margin-bottom:6px; font-size:11px;">
        <b>ID:</b> ${u.telegramId} | <b>المتاح:</b> $${(u.availableBalance||0).toFixed(2)} | <b>المعلق:</b> $${(u.pendingBalance||0).toFixed(2)}
      </div>
    `).join('');
  },

  /**
   * عرض قائمة روابط المنصة
   */
  renderAdminLinks: function(list) {
    const c = document.getElementById('admin-links-list');
    if (!c) return;
    if (!list || !list.length) { 
      c.innerHTML = '<p style="color:var(--text-muted);">لا توجد روابط</p>'; 
      return; 
    }
    c.innerHTML = list.map(l => `
      <div style="background:#070a12; padding:8px; border-radius:8px; margin-bottom:6px; font-size:11px;">
        <b>كود:</b> ${l.shortCode} | <b>الزيارات:</b> ${l.views||0}
      </div>
    `).join('');
  },

  /**
   * عرض قائمة إعلانات المنصة
   */
  renderAdminAds: function(list) {
    const c = document.getElementById('admin-ads-list');
    if (!c) return;
    if (!list || !list.length) { 
      c.innerHTML = '<p style="color:var(--text-muted);">لا توجد إعلانات</p>'; 
      return; 
    }
    const escapeFn = window.UI ? window.UI.escapeHTML : (s => s);
    c.innerHTML = list.map(a => `
      <div style="background:#070a12; padding:8px; border-radius:8px; margin-bottom:6px; font-size:11px;">
        <b>عنوان:</b> ${escapeFn(a.title)} | <b>الميزانية:</b> $${a.budget}
      </div>
    `).join('');
  },

  /**
   * تنفيذ الإجراء الإداري على الطلبات
   */
  processAdminAction: async function(type, itemId, action) {
    try {
      let success = false;
      if (type === 'deposit') {
        success = await window.API.processAdminDeposit(itemId, action);
      } else if (type === 'withdraw') {
        success = await window.API.processAdminWithdraw(itemId, action);
      } else {
        const res = await window.API.safeFetch(`/api/admin/${type}/${action}`, {
          method: 'POST',
          body: { id: itemId }
        });
        success = res && res.ok;
      }

      if (success) {
        if (window.UI && typeof window.UI.showToast === 'function') {
          window.UI.showToast("تم تنفيذ الإجراء بنجاح");
        }
        await this.loadAdminData();
      } else {
        if (window.UI && typeof window.UI.showToast === 'function') {
          window.UI.showToast("فشل تنفيذ الإجراء");
        }
      }
    } catch (e) {
      if (window.UI && typeof window.UI.showToast === 'function') {
        window.UI.showToast("خطأ أثناء تنفيذ الإجراء");
      }
    }
  }
};

// Global standard helpers mapping for compatibility
window.loadAdminData = window.AdminModule.loadAdminData.bind(window.AdminModule);
window.renderAdminDeposits = window.AdminModule.renderAdminDeposits.bind(window.AdminModule);
window.renderAdminWithdraws = window.AdminModule.renderAdminWithdraws.bind(window.AdminModule);
window.renderAdminUsers = window.AdminModule.renderAdminUsers.bind(window.AdminModule);
window.renderAdminLinks = window.AdminModule.renderAdminLinks.bind(window.AdminModule);
window.renderAdminAds = window.AdminModule.renderAdminAds.bind(window.AdminModule);
window.processAdminAction = window.AdminModule.processAdminAction.bind(window.AdminModule);
