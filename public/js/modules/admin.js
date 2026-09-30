// public/js/modules/admin.js - Admin Dashboard & System Management Module

(function() {
  // جلب كائن الـ API بأمان مع التوافق بين المتصفح و Node.js
  function getAPI() {
    if (typeof window !== 'undefined' && window.API) return window.API;
    if (typeof require !== 'undefined') {
      try { return require('./api.js'); } catch (e) {}
    }
    return {};
  }

  // جلب كائن الـ i18n بأمان
  function getI18n() {
    if (typeof window !== 'undefined' && window.i18n) return window.i18n;
    if (typeof require !== 'undefined') {
      try { return require('./i18n.js'); } catch (e) {}
    }
    return { t: function(key, fallback) { return fallback || key; } };
  }

  // دالة حماية النصوص وتفادي ثغرات XSS والأخطاء البرمجية
  function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    if (window.UI && typeof window.UI.escapeHTML === 'function') {
      return window.UI.escapeHTML(String(str));
    }
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // تنسيق اسم/معرف المستخدم بأمان
  function formatUserIdentifier(user) {
    if (!user) return 'غير معروف';
    if (typeof user === 'object') {
      return user.username ? `@${user.username}` : (user.telegramId || user.id || user._id || 'مستخدم');
    }
    return user;
  }

  const AdminModule = {
    /**
     * التحقق من صلاحيات الأدمن وتحديث حالة الواجهة وعرض عناصر الإدارة
     * @param {Object} [user] - كائن المستخدم الاختياري
     * @returns {boolean} - true إذا كان المستخدم أدمن
     */
    checkAdminStatus: function(user) {
      const u = user || (typeof window !== 'undefined' ? window.currentUser : null);
      const isAdmin = !!(
        u && (
          u.isAdmin === true || 
          u.role === 'admin' || 
          u.is_admin === true || 
          u.type === 'admin'
        )
      );

      if (typeof window !== 'undefined') {
        window.isUserAdmin = isAdmin;
        this.toggleAdminUI(isAdmin);
      }

      return isAdmin;
    },

    /**
     * إظهار أو إخفاء عناصر تبويب وقسم الإدارة في واجهة المستخدم (DOM)
     * @param {boolean} show - إظهار أم إخفاء
     */
    toggleAdminUI: function(show) {
      if (typeof document === 'undefined') return;

      // معرفات الأزرار والتبويبات المقترنة بقسم الإدارة في views.html
      const adminElements = [
        'admin-tab',
        'admin-tab-btn',
        'admin-nav-btn',
        'admin-section',
        'admin-link',
        'nav-admin'
      ];

      adminElements.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
          el.style.display = show ? '' : 'none';
          if (show) {
            el.classList.remove('hidden', 'd-none');
          }
        }
      });

      // الكلاسات العامة المخصصة للأدمن فقط
      const adminOnlyNodes = document.querySelectorAll('.admin-only');
      adminOnlyNodes.forEach(el => {
        el.style.display = show ? '' : 'none';
        if (show) {
          el.classList.remove('hidden', 'd-none');
        }
      });
    },

    /**
     * تهيئة وحدة الإدارة عند تحميل التطبيق
     */
    init: async function() {
      if (this.checkAdminStatus()) {
        await this.loadAdminData();
      }
    },

    /**
     * تحميل بيانات لوحة تحكم الإدارة بالكامل
     */
    loadAdminData: async function() {
      if (!this.checkAdminStatus()) {
        console.warn("User is not admin or admin check failed.");
        return;
      }

      try {
        const api = getAPI();
        if (typeof api.loadAdminData !== 'function') {
          console.error("API.loadAdminData function is missing!");
          return;
        }

        const data = await api.loadAdminData();
        if (data) {
          const totalUsersEl = document.getElementById('admin-total-users');
          const totalPendingEl = document.getElementById('admin-total-pending');

          if (totalUsersEl) {
            totalUsersEl.innerText = data.totalUsers !== undefined ? data.totalUsers : (data.users ? data.users.length : 0);
          }
          if (totalPendingEl) {
            const pendingVal = data.totalPendingBalance !== undefined ? data.totalPendingBalance : 0;
            totalPendingEl.innerText = `$${Number(pendingVal).toFixed(2)}`;
          }

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
     * عرض طلبات الإيداع المعلقة
     */
    renderAdminDeposits: function(list) {
      const c = document.getElementById('admin-deposits-list');
      if (!c) return;
      if (!list || !Array.isArray(list) || list.length === 0) { 
        c.innerHTML = '<p style="color:var(--text-muted, #8a99ad); padding: 10px; text-align: center;">لا توجد طلبات إيداع معلقة</p>'; 
        return; 
      }

      c.innerHTML = list.map(d => {
        const userDisplay = escapeHTML(formatUserIdentifier(d.userId || d.user));
        const amount = Number(d.amount || 0).toFixed(2);
        const tx = escapeHTML(d.txid || d.txHash || d.hash || 'غير متوفر');
        const id = d._id || d.id;

        return `
          <div style="background:#070a12; padding:10px; border-radius:10px; margin-bottom:8px; border:1px solid var(--card-border, #1e293b);">
            <div><b>مستخدم:</b> ${userDisplay} | <b>المبلغ:</b> $${amount}</div>
            <div style="font-size:10px; color:var(--text-muted, #8a99ad); word-break:break-all; margin-top:4px;"><b>TxID:</b> ${tx}</div>
            <div style="margin-top:8px; display:flex; gap:6px;">
              <button class="btn-small btn-success" style="padding:4px 10px; cursor:pointer;" onclick="window.AdminModule.processAdminAction('deposit', '${id}', 'approve')">قبول</button>
              <button class="btn-small btn-danger" style="padding:4px 10px; cursor:pointer;" onclick="window.AdminModule.processAdminAction('deposit', '${id}', 'reject')">رفض</button>
            </div>
          </div>
        `;
      }).join('');
    },

    /**
     * عرض طلبات السحب المعلقة
     */
    renderAdminWithdraws: function(list) {
      const c = document.getElementById('admin-withdraws-list');
      if (!c) return;
      if (!list || !Array.isArray(list) || list.length === 0) { 
        c.innerHTML = '<p style="color:var(--text-muted, #8a99ad); padding: 10px; text-align: center;">لا توجد طلبات سحب معلقة</p>'; 
        return; 
      }

      c.innerHTML = list.map(w => {
        const userDisplay = escapeHTML(formatUserIdentifier(w.userId || w.user));
        const amount = Number(w.amount || 0).toFixed(2);
        const wallet = escapeHTML(w.wallet || w.address || w.account || 'غير محدد');
        const id = w._id || w.id;

        return `
          <div style="background:#070a12; padding:10px; border-radius:10px; margin-bottom:8px; border:1px solid var(--card-border, #1e293b);">
            <div><b>مستخدم:</b> ${userDisplay} | <b>المبلغ:</b> $${amount}</div>
            <div style="font-size:10px; color:var(--text-muted, #8a99ad); word-break:break-all; margin-top:4px;"><b>المحفظة:</b> ${wallet}</div>
            <div style="margin-top:8px; display:flex; gap:6px;">
              <button class="btn-small btn-success" style="padding:4px 10px; cursor:pointer;" onclick="window.AdminModule.processAdminAction('withdraw', '${id}', 'approve')">تأكيد الدفع</button>
              <button class="btn-small btn-danger" style="padding:4px 10px; cursor:pointer;" onclick="window.AdminModule.processAdminAction('withdraw', '${id}', 'reject')">إلغاء الطلب</button>
            </div>
          </div>
        `;
      }).join('');
    },

    /**
     * عرض قائمة مستخدمي النظام
     */
    renderAdminUsers: function(list) {
      const c = document.getElementById('admin-users-list');
      if (!c) return;
      if (!list || !Array.isArray(list) || list.length === 0) { 
        c.innerHTML = '<p style="color:var(--text-muted, #8a99ad); padding: 10px; text-align: center;">لا يوجد مستخدمين</p>'; 
        return; 
      }

      c.innerHTML = list.map(u => {
        const tgId = escapeHTML(u.telegramId || u.id || u._id);
        const name = escapeHTML(u.username ? `@${u.username}` : (u.firstName || ''));
        const available = Number(u.availableBalance || u.balance || 0).toFixed(2);
        const pending = Number(u.pendingBalance || 0).toFixed(2);

        return `
          <div style="background:#070a12; padding:8px; border-radius:8px; margin-bottom:6px; font-size:11px; border:1px solid var(--card-border, #1e293b);">
            <b>ID:</b> ${tgId} ${name ? `(${name})` : ''} | <b>المتاح:</b> $${available} | <b>المعلق:</b> $${pending}
          </div>
        `;
      }).join('');
    },

    /**
     * عرض قائمة روابط المنصة
     */
    renderAdminLinks: function(list) {
      const c = document.getElementById('admin-links-list');
      if (!c) return;
      if (!list || !Array.isArray(list) || list.length === 0) { 
        c.innerHTML = '<p style="color:var(--text-muted, #8a99ad); padding: 10px; text-align: center;">لا توجد روابط</p>'; 
        return; 
      }

      c.innerHTML = list.map(l => {
        const code = escapeHTML(l.shortCode || l.code || l.alias || 'بدون كود');
        const views = l.views || l.clicks || 0;
        const target = escapeHTML(l.targetUrl || l.originalUrl || '');

        return `
          <div style="background:#070a12; padding:8px; border-radius:8px; margin-bottom:6px; font-size:11px; border:1px solid var(--card-border, #1e293b);">
            <b>كود:</b> ${code} | <b>الزيارات:</b> ${views} ${target ? `| <span style="color:var(--text-muted, #8a99ad);">${target.substring(0, 30)}...</span>` : ''}
          </div>
        `;
      }).join('');
    },

    /**
     * عرض قائمة إعلانات المنصة
     */
    renderAdminAds: function(list) {
      const c = document.getElementById('admin-ads-list');
      if (!c) return;
      if (!list || !Array.isArray(list) || list.length === 0) { 
        c.innerHTML = '<p style="color:var(--text-muted, #8a99ad); padding: 10px; text-align: center;">لا توجد إعلانات</p>'; 
        return; 
      }

      c.innerHTML = list.map(a => {
        const title = escapeHTML(a.title || 'بدون عنوان');
        const budget = Number(a.budget || 0).toFixed(2);
        const status = escapeHTML(a.status || 'نشط');

        return `
          <div style="background:#070a12; padding:8px; border-radius:8px; margin-bottom:6px; font-size:11px; border:1px solid var(--card-border, #1e293b);">
            <b>عنوان:</b> ${title} | <b>الميزانية:</b> $${budget} | <b>الحالة:</b> ${status}
          </div>
        `;
      }).join('');
    },

    /**
     * تنفيذ الإجراء الإداري على الطلبات
     */
    processAdminAction: async function(type, itemId, action) {
      try {
        let success = false;
        const api = getAPI();

        if (type === 'deposit' && typeof api.processAdminDeposit === 'function') {
          success = await api.processAdminDeposit(itemId, action);
        } else if (type === 'withdraw' && typeof api.processAdminWithdraw === 'function') {
          success = await api.processAdminWithdraw(itemId, action);
        } else if (typeof api.safeFetch === 'function') {
          const res = await api.safeFetch(`/api/admin/${type}/${action}`, {
            method: 'POST',
            body: JSON.stringify ? JSON.stringify({ id: itemId }) : { id: itemId }
          });
          success = res && (res.ok || res.success);
        }

        const msg = success ? "تم تنفيذ الإجراء بنجاح" : "فشل تنفيذ الإجراء";
        if (window.UI && typeof window.UI.showToast === 'function') {
          window.UI.showToast(msg);
        } else if (typeof alert !== 'undefined') {
          alert(msg);
        }

        if (success) {
          await this.loadAdminData();
        }
      } catch (e) {
        console.error("Admin action error:", e);
        const errMsg = "خطأ أثناء تنفيذ الإجراء";
        if (window.UI && typeof window.UI.showToast === 'function') {
          window.UI.showToast(errMsg);
        } else if (typeof alert !== 'undefined') {
          alert(errMsg);
        }
      }
    }
  };

  // تصدير النطاق العام (window) لضمان توافق واستدعاء الدوال من أي مكان
  if (typeof window !== 'undefined') {
    window.AdminModule = AdminModule;
    window.checkAdminStatus = AdminModule.checkAdminStatus.bind(AdminModule);
    window.toggleAdminUI = AdminModule.toggleAdminUI.bind(AdminModule);
    window.initAdmin = AdminModule.init.bind(AdminModule);
    window.loadAdminData = AdminModule.loadAdminData.bind(AdminModule);
    window.renderAdminDeposits = AdminModule.renderAdminDeposits.bind(AdminModule);
    window.renderAdminWithdraws = AdminModule.renderAdminWithdraws.bind(AdminModule);
    window.renderAdminUsers = AdminModule.renderAdminUsers.bind(AdminModule);
    window.renderAdminLinks = AdminModule.renderAdminLinks.bind(AdminModule);
    window.renderAdminAds = AdminModule.renderAdminAds.bind(AdminModule);
    window.processAdminAction = AdminModule.processAdminAction.bind(AdminModule);
  }

  // دعم التصدير بنظام CommonJS للبيئات الخلفية بدون استخدام كلمات import/export
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = AdminModule;
  }
})();
