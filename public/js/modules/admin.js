/**
 * TelegaApp Admin Module
 * File: public/js/modules/admin.js
 */
(function () {
  'use strict';

  const getAPI = () => window.API || window.TelegaApp?.api || {};
  const getUI = () => window.UI || window.TelegaApp?.ui || {};
  const getI18n = () => window.I18n || window.TelegaApp?.i18n || { t: (key) => key };

  async function apiRequest(endpoint, method = 'GET', data = null) {
    if (window.TelegaApp?.api?.request) {
      return window.TelegaApp.api.request(endpoint, method, data);
    }
    const options = {
      method,
      headers: { 'Content-Type': 'application/json' }
    };
    if (data) options.body = JSON.stringify(data);
    const response = await fetch(endpoint, options);
    return response.json();
  }

  const AdminModule = {
    adminId: null,

    // --- التهيئة والتحقق من المشرف ---
    init: async function () {
      console.log('Telega Ads Engine Admin Module initialized');
      await this.checkAdminAuth();

      const configForm = document.getElementById('admin-config-form');
      if (configForm) {
        configForm.addEventListener('submit', async (e) => {
          e.preventDefault();
          await this.saveConfig();
        });
      }

      if (document.getElementById('adminTableBody')) {
        this.loadAdminCampaigns();
      }
    },

    checkAdminAuth: async function () {
      try {
        const configRes = await apiRequest('/api/config');
        if (configRes && configRes.success && configRes.config) {
          this.adminId = configRes.config.ADMIN_ID || configRes.config.adminId;
        }

        const currentUser = window.TelegaApp?.user || window.Telegram?.WebApp?.initDataUnsafe?.user;
        const currentTelegramId = currentUser?.id?.toString() || currentUser?.telegramId?.toString();

        if (this.adminId && currentTelegramId && currentTelegramId !== this.adminId.toString()) {
          console.warn('غير مصرح لك بالدخول إلى لوحة التحكم');
        }
      } catch (err) {
        console.error('Error verifying admin authorization:', err);
      }
    },

    // --- حفظ الإعدادات ---
    saveConfig: async function () {
      const data = {
        minWithdrawal: parseFloat(document.getElementById('cfg-min-withdraw')?.value || 0),
        cpcRate: parseFloat(document.getElementById('cfg-cpc')?.value || 0),
        shortenerCpc: parseFloat(document.getElementById('cfg-shortener-cpc')?.value || 0),
        referralCommissionRate: parseFloat(document.getElementById('cfg-ref-rate')?.value || 0),
        supportLink: document.getElementById('cfg-support')?.value.trim() || '',
        channelLink: document.getElementById('cfg-channel')?.value.trim() || ''
      };

      try {
        const api = getAPI();
        const res = api.saveAdminConfig ? await api.saveAdminConfig(data) : await apiRequest('/api/admin/config', 'POST', data);
        if (res && res.success) {
          const ui = getUI();
          if (ui.showToast) ui.showToast('تم حفظ إعدادات النظام بنجاح!');
          else if (ui.notify) ui.notify('تم حفظ إعدادات النظام بنجاح!');
          else alert('تم حفظ إعدادات النظام بنجاح!');
        }
      } catch (err) {
        console.error('Error saving admin config:', err);
        const ui = getUI();
        if (ui.showAlert) ui.showAlert('حدث خطأ أثناء حفظ الإعدادات', true);
      }
    },

    loadAdminData: async function () {
      try {
        const statsRes = await apiRequest('/api/admin/stats');
        if (statsRes && statsRes.success && statsRes.stats) {
          const s = statsRes.stats;
          const totalUsersEl = document.getElementById('admin-total-users');
          const totalAdsEl = document.getElementById('admin-total-ads');
          const totalLinksEl = document.getElementById('admin-total-links');
          const revenueEl = document.getElementById('admin-revenue');

          if (totalUsersEl) totalUsersEl.textContent = s.totalUsers || 0;
          if (totalAdsEl) totalAdsEl.textContent = s.totalAds || 0;
          if (totalLinksEl) totalLinksEl.textContent = s.totalLinks || 0;
          if (revenueEl) revenueEl.textContent = Number(s.platformRevenue || 0).toFixed(2);
        }

        const usersRes = await apiRequest('/api/admin/users');
        const usersList = document.getElementById('admin-users-list');
        if (usersRes && usersRes.success && usersList && Array.isArray(usersRes.users)) {
          usersList.innerHTML = usersRes.users.map(u => `
            <div class="list-item">
              <div class="list-item-info">
                <span class="list-item-title">${u.firstName || 'مستخدم'} (${u.telegramId || 'N/A'})</span>
                <span class="list-item-sub">الدور: ${u.role || '-'} | الرصيد: $${Number(u.balance || 0).toFixed(2)} | الحالة: ${u.accountStatus || 'active'}</span>
              </div>
            </div>
          `).join('');
        }

        const configRes = await apiRequest('/api/config');
        if (configRes && configRes.success && configRes.config) {
          const c = configRes.config;
          const minWithdrawEl = document.getElementById('cfg-min-withdraw');
          const cpcEl = document.getElementById('cfg-cpc');
          const shortenerCpcEl = document.getElementById('cfg-shortener-cpc');
          const refRateEl = document.getElementById('cfg-ref-rate');
          const supportEl = document.getElementById('cfg-support');
          const channelEl = document.getElementById('cfg-channel');

          if (minWithdrawEl) minWithdrawEl.value = c.minWithdrawal ?? '';
          if (cpcEl) cpcEl.value = c.cpcRate ?? '';
          if (shortenerCpcEl) shortenerCpcEl.value = c.shortenerCpc ?? '';
          if (refRateEl) refRateEl.value = c.referralCommissionRate ?? '';
          if (supportEl) supportEl.value = c.supportLink ?? '';
          if (channelEl) channelEl.value = c.channelLink ?? '';
        }
      } catch (err) {
        console.error('Error loading admin data:', err);
      }
    },

    // --- الحملات والإداريات ---
    loadAdminCampaigns: async function () {
      try {
        const api = getAPI();
        const res = api.getAdminCampaigns 
          ? await api.getAdminCampaigns() 
          : await apiRequest('/api/admin/campaigns');

        const tbody = document.getElementById('adminTableBody');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (!res || !res.campaigns) return;

        const ui = getUI();
        const formatCurrency = ui.formatCurrency || ((v) => `$${Number(v || 0).toFixed(2)}`);

        res.campaigns.forEach(c => {
          const tr = document.createElement('tr');
          const advertiser = c.advertiserId ? (c.advertiserId.username || c.advertiserId.telegramId) : 'N/A';
          const statusBadge = (c.status || '').replace(' Review', '');

          tr.innerHTML = `
            <td>${c.title || 'بدون عنوان'}</td>
            <td>${advertiser}</td>
            <td>${formatCurrency(c.totalBudget)}</td>
            <td><span class="badge badge-${statusBadge}">${c.status || ''}</span></td>
            <td>
              ${c.status === 'Pending Review' || c.status === 'Pending' ? `
                <button class="btn btn-success" style="padding:4px 8px; width:auto;" onclick="AdminModule.approve('${c._id || c.id}')">موافقة</button>
                <button class="btn btn-danger" style="padding:4px 8px; width:auto;" onclick="AdminModule.reject('${c._id || c.id}')">رفض</button>
              ` : '-'}
            </td>
          `;
          tbody.appendChild(tr);
        });
      } catch (err) {
        console.error('Admin fetch error:', err);
      }
    },

    approve: async function (id) {
      try {
        const api = getAPI();
        if (api.approveCampaign) {
          await api.approveCampaign(id);
        } else {
          await apiRequest(`/api/admin/campaigns/${id}/approve`, 'POST');
        }
        const ui = getUI();
        if (ui.notify) ui.notify('تمت الموافقة على الحملة');
        else if (ui.showToast) ui.showToast('تمت الموافقة على الحملة');
        else alert('تمت الموافقة على الحملة');

        this.loadAdminCampaigns();
      } catch (err) {
        const ui = getUI();
        if (ui.notify) ui.notify(err.message || 'حدث خطأ أثناء الموافقة', true);
        else alert(err.message || 'حدث خطأ أثناء الموافقة');
      }
    },

    reject: async function (id) {
      try {
        const api = getAPI();
        if (api.rejectCampaign) {
          await api.rejectCampaign(id);
        } else {
          await apiRequest(`/api/admin/campaigns/${id}/reject`, 'POST');
        }
        const ui = getUI();
        if (ui.notify) ui.notify('تم رفض الحملة وإعادة الرصيد للمعلن');
        else if (ui.showToast) ui.showToast('تم رفض الحملة وإعادة الرصيد للمعلن');
        else alert('تم رفض الحملة وإعادة الرصيد للمعلن');

        this.loadAdminCampaigns();
      } catch (err) {
        const ui = getUI();
        if (ui.notify) ui.notify(err.message || 'حدث خطأ أثناء الرفض', true);
        else alert(err.message || 'حدث خطأ أثناء الرفض');
      }
    },

    // --- Dashboard ---
    renderDashboard: async function (container) {
      if (!container) return;
      try {
        const api = getAPI();
        const data = api.getDashboard 
          ? await api.getDashboard() 
          : await apiRequest('/api/admin/dashboard');

        const i18n = getI18n();
        const ui = getUI();
        const renderCard = ui.renderCard || ((title, val) => `<div class="card"><h3>${title}</h3><p>${val}</p></div>`);

        container.innerHTML = `
          <h2>${i18n.t('dashboard', 'لوحة التحكم')}</h2>
          <div class="grid-metrics">
            ${renderCard(i18n.t('totalUsers', 'إجمالي المستخدمين'), data?.totalUsers || 0)}
            ${renderCard(i18n.t('activeUsers', 'المستخدمين النشطين'), data?.activeUsers || 0)}
            ${renderCard(i18n.t('publishers', 'الناشرين'), data?.publishers || 0)}
            ${renderCard(i18n.t('advertisers', 'المعلنين'), data?.advertisers || 0)}
            ${renderCard(i18n.t('totalViews', 'إجمالي المشاهدات'), data?.totalViews || 0)}
            ${renderCard(i18n.t('totalClicks', 'إجمالي النقرات'), data?.totalClicks || 0)}
            ${renderCard(i18n.t('earnings', 'الأرباح'), '$' + Number(data?.totalEarnings || 0).toFixed(2))}
            ${renderCard(i18n.t('platformRevenue', 'أرباح المنصة'), '$' + Number(data?.platformRevenue || 0).toFixed(2))}
            ${renderCard(i18n.t('deposits', 'إجمالي الإيداعات'), '$' + Number(data?.totalDeposits || 0).toFixed(2))}
            ${renderCard(i18n.t('withdrawals', 'إجمالي السحوبات'), '$' + Number(data?.totalWithdrawals || 0).toFixed(2))}
            ${renderCard(i18n.t('activeCampaigns', 'الحملات النشطة'), data?.activeCampaigns || 0)}
            ${renderCard(i18n.t('pendingEarnings', 'الأرباح المعلقة'), '$' + Number(data?.pendingEarnings || 0).toFixed(2))}
            ${renderCard(i18n.t('releasedEarnings', 'الأرباح المحررة'), '$' + Number(data?.releasedEarnings || 0).toFixed(2))}
            ${renderCard(i18n.t('fraudAlerts', 'تنبيهات الاحتيال'), data?.fraudAlerts || 0)}
          </div>
        `;
      } catch (err) {
        console.error('Error rendering dashboard:', err);
      }
    },

    // --- Withdrawals ---
    renderWithdrawals: async function (container) {
      if (!container) return;
      try {
        const api = getAPI();
        const requests = api.getWithdrawals 
          ? await api.getWithdrawals() 
          : await apiRequest('/api/admin/withdrawals');

        const ui = getUI();
        const renderRiskBadge = ui.renderRiskBadge || ((score, cat) => `<span class="badge">${score} (${cat})</span>`);

        const rows = (requests || []).map(r => {
          const reqId = r.id ? String(r.id) : '';
          const displayId = reqId.length > 6 ? reqId.slice(-6) : reqId;
          const wallet = (r.walletAddress || '').substring(0, 8);

          return `
            <tr>
              <td>${displayId}</td>
              <td>${r.userId || 'N/A'}</td>
              <td>${r.username || '-'}</td>
              <td>@${r.telegramUsername || '-'}</td>
              <td>$${r.amount || 0}</td>
              <td>$${r.fee || 0}</td>
              <td>$${r.netAmount || 0}</td>
              <td>${wallet}...</td>
              <td>${r.network || '-'}</td>
              <td>${r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '-'}</td>
              <td>${r.accountStatus || 'active'}</td>
              <td>${renderRiskBadge(r.riskScore || 0, r.riskCategory || 'low')}</td>
              <td>${r.adminNotes || '-'}</td>
              <td>
                <button class="btn-action btn-approve" onclick="AdminModule.processWithdrawal('${r.id}', 'approve')">موافقة</button>
                <button class="btn-action btn-reject" onclick="AdminModule.processWithdrawal('${r.id}', 'reject')">رفض</button>
              </td>
            </tr>
          `;
        }).join('');

        container.innerHTML = `
          <h2>قسم طلبات السحب</h2>
          <div class="table-container">
            <table>
              <thead>
                <tr>
                  <th>رقم الطلب</th><th>User ID</th><th>اسم المستخدم</th><th>Telegram</th>
                  <th>المبلغ</th><th>الرسوم</th><th>الصافي</th><th>العنوان</th>
                  <th>الشبكة</th><th>التاريخ</th><th>الحالة</th><th>Risk Score</th><th>ملاحظات</th><th>إجراءات</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        `;
      } catch (err) {
        console.error('Error rendering withdrawals:', err);
      }
    },

    processWithdrawal: async function (id, action) {
      try {
        const notes = prompt('أدخل ملاحظات الإدارة (اختياري):');
        const api = getAPI();
        if (api.handleWithdrawal) {
          await api.handleWithdrawal(id, action, notes);
        } else {
          await apiRequest(`/api/admin/withdrawals/${id}`, 'POST', { action, notes });
        }
        alert('تم تنفيذ الإجراء بنجاح');
        const mainContent = document.getElementById('main-content');
        if (mainContent) this.renderWithdrawals(mainContent);
      } catch (err) {
        console.error('Error processing withdrawal:', err);
        alert('حدث خطأ أثناء معالجة طلب السحب');
      }
    },

    // --- Deposits ---
    renderDeposits: async function (container) {
      if (!container) return;
      try {
        const api = getAPI();
        const deposits = api.getDeposits 
          ? await api.getDeposits() 
          : await apiRequest('/api/admin/deposits');

        const ui = getUI();
        const renderRiskBadge = ui.renderRiskBadge || ((score, cat) => `<span class="badge">${score} (${cat})</span>`);

        const rows = (deposits || []).map(d => {
          const wallet = (d.walletAddress || '').substring(0, 8);
          const txid = (d.txid || '').substring(0, 8);

          return `
            <tr>
              <td>${d.user || '-'}</td>
              <td>${d.telegramId || '-'}</td>
              <td>$${d.amount || 0}</td>
              <td>${d.network || '-'}</td>
              <td>${wallet}...</td>
              <td>${txid}...</td>
              <td>${d.createdAt ? new Date(d.createdAt).toLocaleDateString() : '-'}</td>
              <td>${d.accountStatus || 'active'}</td>
              <td>${renderRiskBadge(d.riskScore || 0, 'monitored')}</td>
              <td>${d.status || '-'}</td>
              <td>
                <button class="btn-action btn-approve" onclick="AdminModule.processDeposit('${d.id}', 'approve')">موافقة</button>
                <button class="btn-action btn-reject" onclick="AdminModule.processDeposit('${d.id}', 'reject')">رفض</button>
              </td>
            </tr>
          `;
        }).join('');

        container.innerHTML = `
          <h2>قسم طلبات الإيداع</h2>
          <div class="table-container">
            <table>
              <thead>
                <tr>
                  <th>المستخدم</th><th>Telegram ID</th><th>المبلغ</th><th>الشبكة</th>
                  <th>العنوان</th><th>TXID</th><th>التاريخ</th><th>حالة الحساب</th>
                  <th>Risk Score</th><th>الحالة</th><th>إجراءات</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        `;
      } catch (err) {
        console.error('Error rendering deposits:', err);
      }
    },

    processDeposit: async function (id, action) {
      try {
        let reason = '';
        if (action === 'reject') {
          reason = prompt('سبب الرفض:');
        }
        const api = getAPI();
        if (api.handleDeposit) {
          await api.handleDeposit(id, action, reason);
        } else {
          await apiRequest(`/api/admin/deposits/${id}`, 'POST', { action, reason });
        }
        alert('تم تحديث حالة الإيداع');
        const mainContent = document.getElementById('main-content');
        if (mainContent) this.renderDeposits(mainContent);
      } catch (err) {
        console.error('Error processing deposit:', err);
        alert('حدث خطأ أثناء معالجة طلب الإيداع');
      }
    },

    // --- Users ---
    renderUsers: async function (container) {
      if (!container) return;
      const i18n = getI18n();
      container.innerHTML = `
        <h2>إدارة المستخدمين</h2>
        <div style="margin-bottom: 1rem;">
          <input type="text" id="user-search-input" placeholder="${i18n.t('searchPlaceholder', 'بحث باسم المستخدم أو ID...')}" style="padding:0.6rem;width:300px;border-radius:6px;border:1px solid var(--border-color, #ccc);">
          <button class="btn-action btn-approve" onclick="AdminModule.searchUsers()">بحث</button>
        </div>
        <div id="users-results-table"></div>
      `;
      this.searchUsers();
    },

    searchUsers: async function () {
      try {
        const query = document.getElementById('user-search-input')?.value || '';
        const api = getAPI();
        const users = api.searchUsers 
          ? await api.searchUsers(query) 
          : await apiRequest(`/api/admin/users/search?q=${encodeURIComponent(query)}`);

        const resultsDiv = document.getElementById('users-results-table');
        if (!resultsDiv) return;

        const ui = getUI();
        const renderRiskBadge = ui.renderRiskBadge || ((score, cat) => `<span class="badge">${score} (${cat})</span>`);

        const rows = (users || []).map(u => `
          <tr>
            <td>${u.telegramId || '-'}</td>
            <td>@${u.username || '-'}</td>
            <td>${u.role || '-'}</td>
            <td>${u.status || '-'}</td>
            <td>${renderRiskBadge(u.riskScore || 0, u.riskCategory || 'low')}</td>
            <td>
              <button class="btn-action btn-approve" onclick="AdminModule.viewProfile('${u._id || u.id}')">فتح الملف</button>
            </td>
          </tr>
        `).join('');

        resultsDiv.innerHTML = `
          <div class="table-container">
            <table>
              <thead><tr><th>Telegram ID</th><th>Username</th><th>الرتبة</th><th>الحالة</th><th>Risk</th><th>إجراء</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        `;
      } catch (err) {
        console.error('Error searching users:', err);
      }
    },

    viewProfile: async function (userId) {
      try {
        const api = getAPI();
        const data = api.getUserProfile 
          ? await api.getUserProfile(userId) 
          : await apiRequest(`/api/admin/users/${userId}/profile`);

        if (!data || !data.user) return;
        const u = data.user;
        const stats = data.stats || {};
        const wallet = u.wallet || {};

        const html = `
          <h3>الملف الشخصي: ${u.firstName || ''} (@${u.username || 'N/A'})</h3>
          <p><strong>Telegram ID:</strong> ${u.telegramId || 'N/A'}</p>
          <p><strong>الأرباح الحالية:</strong> $${wallet.releasedEarnings || 0} (معلق: $${wallet.pendingEarnings || 0})</p>
          <p><strong>إجمالي المشاهدات:</strong> ${stats.totalViews || 0} | <strong>النقرات:</strong> ${stats.totalClicks || 0}</p>
          <hr>
          <h4>تغيير الحالة أو الصلاحيات</h4>
          <button class="btn-action btn-reject" onclick="AdminModule.setUserStatus('${u._id || u.id}', 'suspended')">تعليق الحساب</button>
          <button class="btn-action btn-reject" style="background:black;color:white;" onclick="AdminModule.setUserStatus('${u._id || u.id}', 'banned')">حظر الحساب</button>
          <button class="btn-action btn-approve" onclick="AdminModule.setUserStatus('${u._id || u.id}', 'active')">تنشيط الحساب</button>
        `;

        const ui = getUI();
        if (ui.showModal) ui.showModal(html);
        else alert(`الملف الشخصي:\n${u.firstName} (@${u.username})\nTelegram ID: ${u.telegramId}`);
      } catch (err) {
        console.error('Error viewing profile:', err);
      }
    },

    setUserStatus: async function (userId, status) {
      try {
        const api = getAPI();
        if (api.updateUserStatus) {
          await api.updateUserStatus(userId, status, null);
        } else {
          await apiRequest(`/api/admin/users/${userId}/status`, 'POST', { status });
        }
        alert('تم تحديث حالة المستخدم');
        if (window.TelegaApp?.ui?.closeModal) window.TelegaApp.ui.closeModal();
        this.searchUsers();
      } catch (err) {
        console.error('Error updating user status:', err);
        alert('حدث خطأ أثناء تحديث حالة المستخدم');
      }
    }
  };

  // تصدير الكائن عبر النطاقات العامة
  window.TelegaApp = window.TelegaApp || {};
  window.TelegaApp.admin = AdminModule;
  window.AdminModule = AdminModule;
})();
