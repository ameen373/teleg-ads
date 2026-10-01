// public/js/modules/admin.js - Admin Dashboard & System Management Module

const API = typeof require !== 'undefined' ? require('./api.js') : (typeof window !== 'undefined' && window.API ? window.API : {});
const i18n = typeof require !== 'undefined' ? require('./i18n.js') : (typeof window !== 'undefined' && window.i18n ? window.i18n : {});

const AdminModule = {
  /**
   * إظهار زر وقسم الإدارة في الواجهة
   */
  showAdminTab: function() {
    try {
      const adminNavBtn = document.getElementById('tab-btn-admin') || document.getElementById('admin-nav-btn');
      if (adminNavBtn) {
        adminNavBtn.classList.remove('hidden');
        adminNavBtn.style.display = 'flex';
      }
      const adminView = document.getElementById('view-admin') || document.getElementById('admin-view');
      if (adminView) {
        adminView.classList.remove('hidden');
      }
    } catch (err) {
      console.error("Error showing admin tab:", err);
    }
  },

  /**
   * تحميل نظرة عامة وبيانات لوحة تحكم الإدارة (Alias)
   */
  loadOverview: async function() {
    return await this.loadAdminData();
  },

  /**
   * تحميل بيانات لوحة تحكم الإدارة بالكامل
   */
  loadAdminData: async function() {
    if (typeof window !== 'undefined' && !window.isUserAdmin) return;

    try {
      const apiInstance = (typeof window !== 'undefined' && window.API) ? window.API : API;
      if (!apiInstance || typeof apiInstance.loadAdminData !== 'function') return;

      const data = await apiInstance.loadAdminData();
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
          <button class="btn-small btn-success" onclick="(window.Admin || window.AdminModule).processAdminAction('deposit', '${d._id}', 'approve')">قبول</button>
          <button class="btn-small btn-danger" onclick="(window.Admin || window.AdminModule).processAdminAction('deposit', '${d._id}', 'reject')">رفض</button>
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
          <button class="btn-small btn-success" onclick="(window.Admin || window.AdminModule).processAdminAction('withdraw', '${w._id}', 'approve')">تأكيد الدفع</button>
          <button class="btn-small btn-danger" onclick="(window.Admin || window.AdminModule).processAdminAction('withdraw', '${w._id}', 'reject')">إلغاء الطلب</button>
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
    const escapeFn = (typeof window !== 'undefined' && window.UI && typeof window.UI.escapeHTML === 'function') ? window.UI.escapeHTML : (s => s);
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
      const apiInstance = (typeof window !== 'undefined' && window.API) ? window.API : API;

      if (type === 'deposit' && typeof apiInstance.processAdminDeposit === 'function') {
        success = await apiInstance.processAdminDeposit(itemId, action);
      } else if (type === 'withdraw' && typeof apiInstance.processAdminWithdraw === 'function') {
        success = await apiInstance.processAdminWithdraw(itemId, action);
      } else if (typeof apiInstance.safeFetch === 'function') {
        const res = await apiInstance.safeFetch(`/api/admin/${type}/${action}`, {
          method: 'POST',
          body: { id: itemId }
        });
        success = res && res.ok;
      }

      if (success) {
        if (typeof window !== 'undefined' && window.UI && typeof window.UI.showToast === 'function') {
          window.UI.showToast("تم تنفيذ الإجراء بنجاح");
        }
        await this.loadAdminData();
      } else {
        if (typeof window !== 'undefined' && window.UI && typeof window.UI.showToast === 'function') {
          window.UI.showToast("فشل تنفيذ الإجراء");
        }
      }
    } catch (e) {
      console.error("Process admin action error:", e);
      if (typeof window !== 'undefined' && window.UI && typeof window.UI.showToast === 'function') {
        window.UI.showToast("خطأ أثناء تنفيذ الإجراء");
      }
    }
  },

  /**
   * حفظ إعدادات لوحة التحكم
   */
  saveSettings: async function() {
    try {
      const apiInstance = (typeof window !== 'undefined' && window.API) ? window.API : API;
      const settingsData = {};
      
      const cpmInput = document.getElementById('admin-cpm-rate');
      if (cpmInput) settingsData.cpmRate = parseFloat(cpmInput.value) || 0;

      let res = null;
      if (typeof apiInstance.saveAdminSettings === 'function') {
        res = await apiInstance.saveAdminSettings(settingsData);
      } else if (typeof apiInstance.safeFetch === 'function') {
        res = await apiInstance.safeFetch('/api/admin/settings', {
          method: 'POST',
          body: settingsData
        });
      }

      if (res && (res.ok || res.success)) {
        if (typeof window !== 'undefined' && window.UI && typeof window.UI.showToast === 'function') {
          window.UI.showToast("تم حفظ الإعدادات بنجاح");
        }
      } else {
        if (typeof window !== 'undefined' && window.UI && typeof window.UI.showToast === 'function') {
          window.UI.showToast("فشل حفظ الإعدادات");
        }
      }
    } catch (err) {
      console.error("Save admin settings error:", err);
      if (typeof window !== 'undefined' && window.UI && typeof window.UI.showToast === 'function') {
        window.UI.showToast("خطأ أثناء حفظ الإعدادات");
      }
    }
  }
};

// الربط العام للبيئة ومتصفح شبكة الإنترنت
if (typeof window !== 'undefined') {
  window.AdminModule = AdminModule;
  window.Admin = AdminModule;
  window.showAdminTab = AdminModule.showAdminTab.bind(AdminModule);
  window.loadOverview = AdminModule.loadOverview.bind(AdminModule);
  window.loadAdminData = AdminModule.loadAdminData.bind(AdminModule);
  window.renderAdminDeposits = AdminModule.renderAdminDeposits.bind(AdminModule);
  window.renderAdminWithdraws = AdminModule.renderAdminWithdraws.bind(AdminModule);
  window.renderAdminUsers = AdminModule.renderAdminUsers.bind(AdminModule);
  window.renderAdminLinks = AdminModule.renderAdminLinks.bind(AdminModule);
  window.renderAdminAds = AdminModule.renderAdminAds.bind(AdminModule);
  window.processAdminAction = AdminModule.processAdminAction.bind(AdminModule);
  window.saveAdminSettings = AdminModule.saveSettings.bind(AdminModule);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = AdminModule;
}
