// public/js/modules/admin.js
// Telega.ads - Admin Dashboard & System Management Module

(function () {
  'use strict';

  /**
   * دالة حماية من ثغرات XSS لتعقيم النصوص
   */
  function escapeHTML(str) {
    if (window.UI && typeof window.UI.escapeHTML === 'function') {
      return window.UI.escapeHTML(str);
    }
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * إظهار الإشعارات التنبيهية عبر UI أو Console
   */
  function notify(message, type) {
    if (window.UI && typeof window.UI.showToast === 'function') {
      window.UI.showToast(message, type);
    } else {
      console.log('[Admin Notification]', message);
    }
  }

  /**
   * تنسيق وإظهار معرّف المستخدم سواء كان String أو Object
   */
  function formatUserIdentifier(user) {
    if (!user) return 'غير معروف';
    if (typeof user === 'object') {
      return escapeHTML(user.username || user.telegramId || user.first_name || user._id || 'مستخدم');
    }
    return escapeHTML(user);
  }

  const AdminModule = {
    /**
     * تحميل بيانات لوحة تحكم الإدارة بالكامل
     */
    loadAdminData: async function () {
      const isAdmin = window.isUserAdmin || 
                      (window.currentUser && window.currentUser.isAdmin) || 
                      (window.user && window.user.isAdmin);

      if (!isAdmin) {
        console.warn("المستخدم ليس مسؤولاً أو لم يتم تحميل حالة الأدمن بعد.");
        return;
      }

      if (!window.API || typeof window.API.loadAdminData !== 'function') {
        console.error("وحدة API أو الدالة API.loadAdminData غير متوفرة.");
        return;
      }

      try {
        const data = await window.API.loadAdminData();
        if (data) {
          const totalUsersEl = document.getElementById('admin-total-users');
          const totalPendingEl = document.getElementById('admin-total-pending');

          if (totalUsersEl) {
            totalUsersEl.innerText = data.totalUsers !== undefined ? data.totalUsers : 0;
          }
          if (totalPendingEl) {
            totalPendingEl.innerText = `$${(data.totalPendingBalance || 0).toFixed(2)}`;
          }

          if (data.pendingDeposits) this.renderAdminDeposits(data.pendingDeposits);
          if (data.pendingWithdraws) this.renderAdminWithdraws(data.pendingWithdraws);
          if (data.users) this.renderAdminUsers(data.users);
          if (data.links) this.renderAdminLinks(data.links);
          if (data.ads) this.renderAdminAds(data.ads);
        }
      } catch (err) {
        console.error("خطأ أثناء تحميل بيانات الإدارة:", err);
        notify("حدث خطأ أثناء تحميل بيانات الإدارة", "error");
      }
    },

    /**
     * عرض طلبات الإيداع المعلقة
     */
    renderAdminDeposits: function (list) {
      const c = document.getElementById('admin-deposits-list');
      if (!c) return;

      if (!Array.isArray(list) || !list.length) { 
        c.innerHTML = '<p style="color:var(--text-muted);">لا توجد طلبات إيداع معلقة</p>'; 
        return; 
      }

      c.innerHTML = list.map(d => {
        const userStr = formatUserIdentifier(d.userId);
        const txStr = escapeHTML(d.txid || d.txHash || 'بدون هاش');
        const amountStr = (typeof d.amount === 'number') ? d.amount.toFixed(2) : escapeHTML(d.amount);
        const idStr = escapeHTML(d._id);

        return `
          <div style="background:#070a12; padding:10px; border-radius:10px; margin-bottom:8px; border:1px solid var(--card-border);">
            <div><b>مستخدم:</b> ${userStr} | <b>المبلغ:</b> $${amountStr}</div>
            <div style="font-size:10px; color:var(--text-muted); word-break:break-all;"><b>TxID:</b> ${txStr}</div>
            <div style="margin-top:6px;">
              <button class="btn-small btn-success" onclick="window.AdminModule.processAdminAction('deposit', '${idStr}', 'approve')">قبول</button>
              <button class="btn-small btn-danger" onclick="window.AdminModule.processAdminAction('deposit', '${idStr}', 'reject')">رفض</button>
            </div>
          </div>
        `;
      }).join('');
    },

    /**
     * عرض طلبات السحب المعلقة
     */
    renderAdminWithdraws: function (list) {
      const c = document.getElementById('admin-withdraws-list');
      if (!c) return;

      if (!Array.isArray(list) || !list.length) { 
        c.innerHTML = '<p style="color:var(--text-muted);">لا توجد طلبات سحب معلقة</p>'; 
        return; 
      }

      c.innerHTML = list.map(w => {
        const userStr = formatUserIdentifier(w.userId);
        const walletStr = escapeHTML(w.wallet || 'غير محدد');
        const amountStr = (typeof w.amount === 'number') ? w.amount.toFixed(2) : escapeHTML(w.amount);
        const idStr = escapeHTML(w._id);

        return `
          <div style="background:#070a12; padding:10px; border-radius:10px; margin-bottom:8px; border:1px solid var(--card-border);">
            <div><b>مستخدم:</b> ${userStr} | <b>المبلغ:</b> $${amountStr}</div>
            <div style="font-size:10px; color:var(--text-muted); word-break:break-all;"><b>المحفظة:</b> ${walletStr}</div>
            <div style="margin-top:6px;">
              <button class="btn-small btn-success" onclick="window.AdminModule.processAdminAction('withdraw', '${idStr}', 'approve')">تأكيد الدفع</button>
              <button class="btn-small btn-danger" onclick="window.AdminModule.processAdminAction('withdraw', '${idStr}', 'reject')">إلغاء الطلب</button>
            </div>
          </div>
        `;
      }).join('');
    },

    /**
     * عرض قائمة مستخدمي النظام
     */
    renderAdminUsers: function (list) {
      const c = document.getElementById('admin-users-list');
      if (!c) return;

      if (!Array.isArray(list) || !list.length) { 
        c.innerHTML = '<p style="color:var(--text-muted);">لا يوجد مستخدمين</p>'; 
        return; 
      }

      c.innerHTML = list.map(u => {
        const tgId = escapeHTML(u.telegramId || u.username || u._id || 'غير معروف');
        const avail = (u.availableBalance || 0).toFixed(2);
        const pend = (u.pendingBalance || 0).toFixed(2);

        return `
          <div style="background:#070a12; padding:8px; border-radius:8px; margin-bottom:6px; font-size:11px;">
            <b>ID:</b> ${tgId} | <b>المتاح:</b> $${avail} | <b>المعلق:</b> $${pend}
          </div>
        `;
      }).join('');
    },

    /**
     * عرض قائمة روابط المنصة
     */
    renderAdminLinks: function (list) {
      const c = document.getElementById('admin-links-list');
      if (!c) return;

      if (!Array.isArray(list) || !list.length) { 
        c.innerHTML = '<p style="color:var(--text-muted);">لا توجد روابط</p>'; 
        return; 
      }

      c.innerHTML = list.map(l => {
        const code = escapeHTML(l.shortCode || l.alias || 'بدون كود');
        const views = l.views !== undefined ? l.views : (l.clicks || 0);

        return `
          <div style="background:#070a12; padding:8px; border-radius:8px; margin-bottom:6px; font-size:11px;">
            <b>كود:</b> ${code} | <b>الزيارات:</b> ${views}
          </div>
        `;
      }).join('');
    },

    /**
     * عرض قائمة إعلانات المنصة
     */
    renderAdminAds: function (list) {
      const c = document.getElementById('admin-ads-list');
      if (!c) return;

      if (!Array.isArray(list) || !list.length) { 
        c.innerHTML = '<p style="color:var(--text-muted);">لا توجد إعلانات</p>'; 
        return; 
      }

      c.innerHTML = list.map(a => {
        const title = escapeHTML(a.title || 'بدون عنوان');
        const budget = (typeof a.budget === 'number') ? a.budget.toFixed(2) : escapeHTML(a.budget || 0);

        return `
          <div style="background:#070a12; padding:8px; border-radius:8px; margin-bottom:6px; font-size:11px;">
            <b>عنوان:</b> ${title} | <b>الميزانية:</b> $${budget}
          </div>
        `;
      }).join('');
    },

    /**
     * تنفيذ الإجراء الإداري على الطلبات
     */
    processAdminAction: async function (type, itemId, action) {
      if (!window.API) {
        console.error("وحدة API غير متوفرة.");
        notify("خطأ: تعذر الاتصال بـ API", "error");
        return;
      }

      try {
        let success = false;
        if (type === 'deposit') {
          if (typeof window.API.processAdminDeposit === 'function') {
            success = await window.API.processAdminDeposit(itemId, action);
          } else if (typeof window.API.safeFetch === 'function') {
            const res = await window.API.safeFetch(`/api/admin/deposits/${action}`, {
              method: 'POST',
              body: JSON.stringify({ id: itemId })
            });
            success = res && (res.ok || res.success);
          }
        } else if (type === 'withdraw') {
          if (typeof window.API.processAdminWithdraw === 'function') {
            success = await window.API.processAdminWithdraw(itemId, action);
          } else if (typeof window.API.safeFetch === 'function') {
            const res = await window.API.safeFetch(`/api/admin/withdraws/${action}`, {
              method: 'POST',
              body: JSON.stringify({ id: itemId })
            });
            success = res && (res.ok || res.success);
          }
        } else {
          if (typeof window.API.safeFetch === 'function') {
            const res = await window.API.safeFetch(`/api/admin/${type}/${action}`, {
              method: 'POST',
              body: JSON.stringify({ id: itemId })
            });
            success = res && (res.ok || res.success);
          }
        }

        if (success) {
          notify("تم تنفيذ الإجراء بنجاح", "success");
          await this.loadAdminData();
        } else {
          notify("فشل تنفيذ الإجراء", "error");
        }
      } catch (e) {
        console.error("خطأ أثناء تنفيذ الإجراء الإداري:", e);
        notify("خطأ أثناء تنفيذ الإجراء", "error");
      }
    }
  };

  // تصدير الكائن والدوال إلى النطاق العام Window مباشرة
  window.AdminModule = AdminModule;
  window.loadAdminData = AdminModule.loadAdminData.bind(AdminModule);
  window.renderAdminDeposits = AdminModule.renderAdminDeposits.bind(AdminModule);
  window.renderAdminWithdraws = AdminModule.renderAdminWithdraws.bind(AdminModule);
  window.renderAdminUsers = AdminModule.renderAdminUsers.bind(AdminModule);
  window.renderAdminLinks = AdminModule.renderAdminLinks.bind(AdminModule);
  window.renderAdminAds = AdminModule.renderAdminAds.bind(AdminModule);
  window.processAdminAction = AdminModule.processAdminAction.bind(AdminModule);

})();
