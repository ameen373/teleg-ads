// public/js/modules/admin.js - Admin Dashboard & System Management Module

const API = typeof require !== 'undefined' ? require('./api.js') : (window.API || {});
const i18n = typeof require !== 'undefined' ? require('./i18n.js') : (window.i18n || {});

const AdminModule = {
  /**
   * تأكيد صلاحيات الأدمن مع إخفاء تبويبات الإدارة تماماً إذا لم يكن مستخدماً مخولاً
   */
  checkAdminAccess: async function() {
    const adminTabBtn = document.getElementById('tab-btn-admin');
    const adminTabSection = document.getElementById('tab-admin');
    const adminElements = document.querySelectorAll('.admin-only');

    try {
      const apiInstance = window.API || API;
      let isAdmin = window.isUserAdmin === true;

      if (typeof apiInstance.checkAdminStatus === 'function') {
        const res = await apiInstance.checkAdminStatus();
        isAdmin = !!(res && (res.isAdmin || res.success));
      }

      window.isUserAdmin = isAdmin;

      if (!isAdmin) {
        if (adminTabBtn) adminTabBtn.style.display = 'none';
        if (adminTabSection) adminTabSection.classList.add('hidden');
        adminElements.forEach(el => { if (el) el.style.display = 'none'; });
        return false;
      } else {
        if (adminTabBtn) adminTabBtn.style.display = 'flex';
        adminElements.forEach(el => { if (el) el.style.display = ''; });
        return true;
      }
    } catch (err) {
      console.warn("Admin check failed:", err);
      window.isUserAdmin = false;
      if (adminTabBtn) adminTabBtn.style.display = 'none';
      if (adminTabSection) adminTabSection.classList.add('hidden');
      adminElements.forEach(el => { if (el) el.style.display = 'none'; });
      return false;
    }
  },

  /**
   * جلب وتحميل جميع الإحصائيات وبيانات التحكم بالإدارة
   */
  loadAdminData: async function() {
    const hasAccess = await this.checkAdminAccess();
    if (!hasAccess) return;

    try {
      const apiInstance = window.API || API;
      const data = await apiInstance.loadAdminData();
      if (data) {
        this.renderAdminStats(data);
        if (data.pendingDeposits) this.renderAdminDeposits(data.pendingDeposits);
        if (data.pendingWithdraws) this.renderAdminWithdraws(data.pendingWithdraws);
        if (data.users) this.renderAdminUsers(data.users);
        if (data.links) this.renderAdminLinks(data.links);
        if (data.ads) this.renderAdminAds(data.ads);
      }
    } catch (err) {
      console.error("Admin data loading error:", err);
    }
  },

  /**
   * عرض الإحصائيات العامة للمنصة
   */
  renderAdminStats: function(data) {
    const totalUsersEl = document.getElementById('admin-total-users');
    const totalPendingEl = document.getElementById('admin-total-pending');
    const totalRevenueEl = document.getElementById('admin-total-revenue');
    const totalLinksEl = document.getElementById('admin-total-links');

    if (totalUsersEl) totalUsersEl.innerText = data.totalUsers || 0;
    if (totalPendingEl) totalPendingEl.innerText = `$${(data.totalPendingBalance || 0).toFixed(2)}`;
    if (totalRevenueEl) totalRevenueEl.innerText = `$${(data.totalRevenue || data.totalDeposits || 0).toFixed(2)}`;
    if (totalLinksEl) totalLinksEl.innerText = data.totalLinks || 0;
  },

  /**
   * عرض طلبات الإيداع المعلقة وإدارتها
   */
  renderAdminDeposits: function(list) {
    const c = document.getElementById('admin-deposits-list');
    if (!c) return;
    if (!list || !list.length) { 
      c.innerHTML = '<p style="color:var(--text-muted); font-size: 12px; text-align: center; padding: 8px;">لا توجد طلبات إيداع معلقة</p>'; 
      return; 
    }
    c.innerHTML = list.map(d => `
      <div style="background:#070a12; padding:10px; border-radius:10px; margin-bottom:8px; border:1px solid var(--card-border);">
        <div style="font-size:12px;"><b>مستخدم:</b> ${d.userId || d.telegramId} | <b>المبلغ:</b> <span style="color:var(--success); font-weight:bold;">$${d.amount}</span></div>
        <div style="font-size:10px; color:var(--text-muted); word-break:break-all; margin: 4px 0;"><b>TxID:</b> ${d.txid || d.txHash}</div>
        <div style="display:flex; gap:6px; margin-top:6px;">
          <button class="btn-small btn-success" style="padding: 3px 10px; font-size:11px;" onclick="window.AdminModule.processAdminAction('deposit', '${d._id}', 'approve')">قبول الإيداع</button>
          <button class="btn-small btn-danger" style="padding: 3px 10px; font-size:11px;" onclick="window.AdminModule.processAdminAction('deposit', '${d._id}', 'reject')">رفض الطلب</button>
        </div>
      </div>
    `).join('');
  },

  /**
   * عرض طلبات السحب المعلقة وإدارتها
   */
  renderAdminWithdraws: function(list) {
    const c = document.getElementById('admin-withdraws-list');
    if (!c) return;
    if (!list || !list.length) { 
      c.innerHTML = '<p style="color:var(--text-muted); font-size: 12px; text-align: center; padding: 8px;">لا توجد طلبات سحب معلقة</p>'; 
      return; 
    }
    c.innerHTML = list.map(w => `
      <div style="background:#070a12; padding:10px; border-radius:10px; margin-bottom:8px; border:1px solid var(--card-border);">
        <div style="font-size:12px;"><b>مستخدم:</b> ${w.userId || w.telegramId} | <b>المبلغ:</b> <span style="color:var(--warning); font-weight:bold;">$${w.amount}</span></div>
        <div style="font-size:10px; color:var(--text-muted); word-break:break-all; margin: 4px 0;"><b>المحفظة:</b> ${w.wallet || w.walletAddress}</div>
        <div style="display:flex; gap:6px; margin-top:6px;">
          <button class="btn-small btn-success" style="padding: 3px 10px; font-size:11px;" onclick="window.AdminModule.processAdminAction('withdraw', '${w._id}', 'approve')">تأكيد الدفع</button>
          <button class="btn-small btn-danger" style="padding: 3px 10px; font-size:11px;" onclick="window.AdminModule.processAdminAction('withdraw', '${w._id}', 'reject')">إلغاء الطلب</button>
        </div>
      </div>
    `).join('');
  },

  /**
   * عرض وإدارة قائمة مستخدمي النظام
   */
  renderAdminUsers: function(list) {
    const c = document.getElementById('admin-users-list');
    if (!c) return;
    if (!list || !list.length) { 
      c.innerHTML = '<p style="color:var(--text-muted); font-size: 12px; text-align: center;">لا يوجد مستخدمين registrados</p>'; 
      return; 
    }
    const escapeFn = window.UI ? window.UI.escapeHTML : (s => s);
    c.innerHTML = list.map(u => `
      <div style="background:#070a12; padding:8px; border-radius:8px; margin-bottom:6px; font-size:11px; display:flex; justify-content:space-between; align-items:center;">
        <div>
          <b>ID:</b> ${u.telegramId} (${escapeFn(u.firstName || u.username || 'User')})<br/>
          <small style="color:var(--text-muted);">متاح: $${(u.availableBalance||0).toFixed(2)} | معلق: $${(u.pendingBalance||0).toFixed(2)}</small>
        </div>
        <button class="btn-small" style="font-size:10px;" onclick="window.AdminModule.viewUserDetails('${u.telegramId}')">التفاصيل</button>
      </div>
    `).join('');
  },

  /**
   * عرض وتتبع كافة روابط المنصة
   */
  renderAdminLinks: function(list) {
    const c = document.getElementById('admin-links-list');
    if (!c) return;
    if (!list || !list.length) { 
      c.innerHTML = '<p style="color:var(--text-muted); font-size: 12px; text-align: center;">لا توجد روابط مسجلة</p>'; 
      return; 
    }
    c.innerHTML = list.map(l => `
      <div style="background:#070a12; padding:8px; border-radius:8px; margin-bottom:6px; font-size:11px;">
        <b>الكود:</b> ${l.shortCode} | <b>الزيارات:</b> ${l.views||0} | <b>الأرباح:</b> $${(l.totalEarnings||0).toFixed(3)}
      </div>
    `).join('');
  },

  /**
   * عرض ومراجعة الحملات الإعلانية على مستوى المنصة
   */
  renderAdminAds: function(list) {
    const c = document.getElementById('admin-ads-list');
    if (!c) return;
    if (!list || !list.length) { 
      c.innerHTML = '<p style="color:var(--text-muted); font-size: 12px; text-align: center;">لا توجد إعلانات</p>'; 
      return; 
    }
    const escapeFn = window.UI ? window.UI.escapeHTML : (s => s);
    c.innerHTML = list.map(a => `
      <div style="background:#070a12; padding:8px; border-radius:8px; margin-bottom:6px; font-size:11px;">
        <div style="display:flex; justify-content:space-between;">
          <b>${escapeFn(a.title)}</b>
          <span style="color:var(--accent); font-weight:bold;">$${a.totalBudget || a.budget || 0}</span>
        </div>
        <div style="margin-top:4px; display:flex; gap:4px;">
          <button class="btn-small btn-danger" style="font-size:9px; padding:2px 6px;" onclick="window.AdminModule.processAdminAction('campaign', '${a._id}', 'reject')">إيقاف إجباري</button>
        </div>
      </div>
    `).join('');
  },

  /**
   * عرض تفاصيل مستخدم معين
   */
  viewUserDetails: function(telegramId) {
    if (window.UI && typeof window.UI.showToast === 'function') {
      window.UI.showToast(`معرف المستخدم: ${telegramId}`);
    }
  },

  /**
   * تنفيذ الإجراء الإداري (قبول/رفض طلبات السحب، الإيداع، والحملات)
   */
  processAdminAction: async function(type, itemId, action) {
    try {
      let success = false;
      const apiInstance = window.API || API;

      if (type === 'deposit') {
        success = await apiInstance.processAdminDeposit(itemId, action);
      } else if (type === 'withdraw') {
        success = await apiInstance.processAdminWithdraw(itemId, action);
      } else {
        const res = await apiInstance.safeFetch(`/api/admin/${type}/${action}`, {
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
          window.UI.showToast("فشل تنفيذ الإجراء الإداري");
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
if (typeof window !== 'undefined') {
  window.AdminModule = AdminModule;
  window.checkAdminAccess = AdminModule.checkAdminAccess.bind(AdminModule);
  window.loadAdminData = AdminModule.loadAdminData.bind(AdminModule);
  window.renderAdminStats = AdminModule.renderAdminStats.bind(AdminModule);
  window.renderAdminDeposits = AdminModule.renderAdminDeposits.bind(AdminModule);
  window.renderAdminWithdraws = AdminModule.renderAdminWithdraws.bind(AdminModule);
  window.renderAdminUsers = AdminModule.renderAdminUsers.bind(AdminModule);
  window.renderAdminLinks = AdminModule.renderAdminLinks.bind(AdminModule);
  window.renderAdminAds = AdminModule.renderAdminAds.bind(AdminModule);
  window.processAdminAction = AdminModule.processAdminAction.bind(AdminModule);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = AdminModule;
}
