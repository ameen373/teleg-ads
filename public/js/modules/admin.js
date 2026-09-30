// public/js/modules/admin.js - Admin Dashboard & System Management Module

const API = typeof require !== 'undefined' ? require('./api.js') : (window.API || {});
const i18n = typeof require !== 'undefined' ? require('./i18n.js') : (window.i18n || {});

const AdminModule = {
  /**
   * دالة تأكيد صلاحيات الأدمن وإخفاء تبويب الإدارة تماماً إذا لم يكن المستخدم أدمن
   */
  checkAdminAccess: function() {
    const adminBtn = document.getElementById('tab-btn-admin') || document.getElementById('admin-tab-btn');
    const adminTab = document.getElementById('tab-admin') || document.getElementById('view-admin');

    if (!window.isUserAdmin) {
      if (adminBtn) adminBtn.style.display = 'none';
      if (adminTab) adminTab.style.display = 'none';
      return false;
    }

    if (adminBtn) adminBtn.style.display = 'flex';
    return true;
  },

  /**
   * تحميل بيانات لوحة تحكم الإدارة بالكامل
   */
  loadAdminData: async function() {
    if (!this.checkAdminAccess()) return;

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
      console.error("Admin data error:", err);
    }
  },

  /**
   * عرض الإحصائيات العامة
   */
  renderAdminStats: function(data) {
    const totalUsersEl = document.getElementById('admin-total-users');
    const totalPendingEl = document.getElementById('admin-total-pending');
    const totalPayoutsEl = document.getElementById('admin-total-payouts');
    const totalAdsEl = document.getElementById('admin-total-ads');

    if (totalUsersEl) totalUsersEl.innerText = data.totalUsers || (data.users ? data.users.length : 0);
    if (totalPendingEl) totalPendingEl.innerText = `$${(data.totalPendingBalance || 0).toFixed(2)}`;
    if (totalPayoutsEl) totalPayoutsEl.innerText = `$${(data.totalPayouts || 0).toFixed(2)}`;
    if (totalAdsEl) totalAdsEl.innerText = data.totalAds || (data.ads ? data.ads.length : 0);
  },

  /**
   * عرض طلبات الإيداع المعلقة
   */
  renderAdminDeposits: function(list) {
    const c = document.getElementById('admin-deposits-list');
    if (!c) return;
    if (!list || !list.length) { 
      c.innerHTML = '<p style="color:var(--text-muted); text-align:center; padding:10px;">لا توجد طلبات إيداع معلقة</p>'; 
      return; 
    }
    c.innerHTML = list.map(d => `
      <div style="background:#070a12; padding:10px; border-radius:10px; margin-bottom:8px; border:1px solid var(--card-border);">
        <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
          <span style="color:var(--text); font-weight:bold;">مستخدم: ${d.userId || d.telegramId}</span>
          <span style="color:var(--success); font-weight:bold;">$${(d.amount || 0).toFixed(2)}</span>
        </div>
        <div style="font-size:10px; color:var(--text-muted); word-break:break-all;"><b>شبكة:</b> ${d.network || 'USDT'} | <b>TxID:</b> ${d.txid || d.txHash}</div>
        <div style="margin-top:8px; display:flex; gap:6px;">
          <button class="btn-small btn-success" style="padding:2px 8px; font-size:11px;" onclick="window.AdminModule.processAdminAction('deposit', '${d._id}', 'approve')">قبول الشحن</button>
          <button class="btn-small btn-danger" style="padding:2px 8px; font-size:11px;" onclick="window.AdminModule.processAdminAction('deposit', '${d._id}', 'reject')">رفض</button>
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
      c.innerHTML = '<p style="color:var(--text-muted); text-align:center; padding:10px;">لا توجد طلبات سحب معلقة</p>'; 
      return; 
    }
    c.innerHTML = list.map(w => `
      <div style="background:#070a12; padding:10px; border-radius:10px; margin-bottom:8px; border:1px solid var(--card-border);">
        <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
          <span style="color:var(--text); font-weight:bold;">مستخدم: ${w.userId || w.telegramId}</span>
          <span style="color:var(--warning); font-weight:bold;">$${(w.amount || 0).toFixed(2)}</span>
        </div>
        <div style="font-size:10px; color:var(--text-muted); word-break:break-all;"><b>العنوان:</b> ${w.walletAddress || w.address || 'غ/م'}</div>
        <div style="margin-top:8px; display:flex; gap:6px;">
          <button class="btn-small btn-success" style="padding:2px 8px; font-size:11px;" onclick="window.AdminModule.processAdminAction('withdraw', '${w._id}', 'approve')">قبول وتحويل</button>
          <button class="btn-small btn-danger" style="padding:2px 8px; font-size:11px;" onclick="window.AdminModule.processAdminAction('withdraw', '${w._id}', 'reject')">رفض السحب</button>
        </div>
      </div>
    `).join('');
  },

  /**
   * عرض قائمة المستخدمين وإدارتهم
   */
  renderAdminUsers: function(users) {
    const c = document.getElementById('admin-users-list');
    if (!c) return;
    if (!users || !users.length) {
      c.innerHTML = '<p style="color:var(--text-muted); text-align:center; padding:10px;">لا يوجد مستخدمين</p>';
      return;
    }

    const escapeFn = window.UI ? window.UI.escapeHTML : (s => s);

    c.innerHTML = users.map(u => {
      const name = escapeFn(u.firstName || u.username || 'مستخدم');
      const tgId = u.telegramId;
      const avail = (u.availableBalance || 0).toFixed(2);
      const isBanned = u.isBanned === true;

      return `
        <div style="background:#070a12; padding:10px; border-radius:10px; margin-bottom:8px; border:1px solid var(--card-border); font-size:12px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <strong>${name} (ID: ${tgId})</strong>
            <span style="color:var(--success);">$${avail}</span>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px;">
            <div style="display:flex; gap:6px;">
              <button class="btn-small" style="font-size:10px; padding:2px 6px;" onclick="window.AdminModule.updateUserBalance('${tgId}')">تعديل الرصيد</button>
              <button class="btn-small ${isBanned ? 'btn-success' : 'btn-danger'}" style="font-size:10px; padding:2px 6px;" onclick="window.AdminModule.toggleUserBan('${tgId}', ${!isBanned})">
                ${isBanned ? 'إلغاء الحظر' : 'حظر'}
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  },

  /**
   * عرض قائمة الإعلانات المرفوعة بالنظام وإدارتها
   */
  renderAdminAds: function(ads) {
    const c = document.getElementById('admin-ads-list');
    if (!c) return;
    if (!ads || !ads.length) {
      c.innerHTML = '<p style="color:var(--text-muted); text-align:center; padding:10px;">لا توجد حملات إعلانية</p>';
      return;
    }

    const escapeFn = window.UI ? window.UI.escapeHTML : (s => s);

    c.innerHTML = ads.map(a => `
      <div style="background:#070a12; padding:10px; border-radius:10px; margin-bottom:8px; border:1px solid var(--card-border); font-size:11px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <strong style="font-size:12px; color:var(--text);">${escapeFn(a.title)}</strong>
          <span style="background:var(--accent); color:#fff; padding:2px 4px; border-radius:4px;">${(a.type || 'image').toUpperCase()}</span>
        </div>
        <div style="margin:4px 0; color:var(--text-muted); word-break:break-all;">🔗 ${escapeFn(a.targetUrl)}</div>
        <div style="display:flex; justify-content:space-between; margin-top:6px;">
          <span>الميزانية: $${(a.totalBudget || 0).toFixed(2)} | الحالة: ${a.status}</span>
          <div style="display:flex; gap:4px;">
            <button class="btn-small btn-danger" style="font-size:9px; padding:1px 5px;" onclick="window.AdminModule.processAdminAction('ad', '${a._id}', 'delete')">حذف</button>
          </div>
        </div>
      </div>
    `).join('');
  },

  /**
   * عرض جميع روابط الروابط في النظام
   */
  renderAdminLinks: function(links) {
    const c = document.getElementById('admin-links-list');
    if (!c) return;
    if (!links || !links.length) {
      c.innerHTML = '<p style="color:var(--text-muted); text-align:center; padding:10px;">لا توجد روابط في النظام</p>';
      return;
    }

    const escapeFn = window.UI ? window.UI.escapeHTML : (s => s);

    c.innerHTML = links.map(l => `
      <div style="background:#070a12; padding:10px; border-radius:10px; margin-bottom:8px; border:1px solid var(--card-border); font-size:11px;">
        <strong style="color:var(--text);">${escapeFn(l.title || l.shortCode)}</strong>
        <div style="color:var(--accent); word-break:break-all; margin:2px 0;">/r/${l.shortCode}</div>
        <div style="display:flex; justify-content:space-between; color:var(--text-muted); margin-top:4px;">
          <span>👁️ ${l.views || 0} زيارة</span>
          <span>الأرباح: $${(l.totalEarnings || 0).toFixed(4)}</span>
        </div>
      </div>
    `).join('');
  },

  /**
   * معالجة إجراءات الإدارة (قبول/رفض الإيداعات والمسحوبات والحملات)
   */
  processAdminAction: async function(type, id, action, extraData = {}) {
    const lang = window.UI ? window.UI.currentLang : (window.currentLang || 'ar');
    if (!confirm(lang === 'ar' ? 'هل أنت تأكد من تنفيذ هذا الإجراء؟' : 'Are you sure you want to perform this action?')) return;

    try {
      const apiInstance = window.API || API;
      const res = await apiInstance.safeFetch(`/api/admin/${type}/${action}`, {
        method: 'POST',
        body: { id, extraData }
      });

      if (res && res.ok) {
        if (window.UI && typeof window.UI.showToast === 'function') {
          window.UI.showToast(lang === 'ar' ? 'تم تنفيذ الإجراء بنجاح' : 'Action executed successfully');
        }
        await this.loadAdminData();
      } else {
        const data = await res.json().catch(() => null);
        if (window.UI && typeof window.UI.showToast === 'function') {
          window.UI.showToast(data?.error || (lang === 'ar' ? 'فشل تنفيذ الإجراء' : 'Failed to execute action'));
        }
      }
    } catch (err) {
      console.error("Admin action error:", err);
      if (window.UI && typeof window.UI.showToast === 'function') {
        window.UI.showToast(lang === 'ar' ? 'حدث خطأ أثناء الاتصال بالخادم' : 'Server error');
      }
    }
  },

  /**
   * تعديل رصيد مستخدم
   */
  updateUserBalance: async function(telegramId) {
    const amountStr = prompt('أدخل المبلغ المراد إضافته (أو خصمه برقم سالب):', '0');
    if (amountStr === null) return;

    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount === 0) return;

    try {
      const apiInstance = window.API || API;
      const res = await apiInstance.safeFetch('/api/admin/users/balance', {
        method: 'POST',
        body: { telegramId, amount }
      });

      if (res && res.ok) {
        if (window.UI && typeof window.UI.showToast === 'function') {
          window.UI.showToast('تم تعديل رصيد المستخدم بنجاح');
        }
        await this.loadAdminData();
      }
    } catch (err) {
      console.error("Error updating user balance:", err);
    }
  },

  /**
   * حظر أو إلغاء حظر مستخدم
   */
  toggleUserBan: async function(telegramId, isBanned) {
    try {
      const apiInstance = window.API || API;
      const res = await apiInstance.safeFetch('/api/admin/users/ban', {
        method: 'POST',
        body: { telegramId, isBanned }
      });

      if (res && res.ok) {
        if (window.UI && typeof window.UI.showToast === 'function') {
          window.UI.showToast(isBanned ? 'تم حظر المستخدم' : 'تم إلغاء حظر المستخدم');
        }
        await this.loadAdminData();
      }
    } catch (err) {
      console.error("Error toggling user ban:", err);
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
  window.renderAdminAds = AdminModule.renderAdminAds.bind(AdminModule);
  window.renderAdminLinks = AdminModule.renderAdminLinks.bind(AdminModule);
  window.processAdminAction = AdminModule.processAdminAction.bind(AdminModule);
  window.updateUserBalance = AdminModule.updateUserBalance.bind(AdminModule);
  window.toggleUserBan = AdminModule.toggleUserBan.bind(AdminModule);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = AdminModule;
}
