// public/js/admin.js

(function () {
  'use strict';

  const AdminPanel = {
    initialized: false,

    init: async function () {
      if (this.initialized) return;
      this.initialized = true;

      await this.loadSystemStats();
      await this.loadPendingDeposits();
      await this.loadPendingWithdrawals();
      await this.loadUsersList();
    },

    loadSystemStats: async function () {
      const result = await window.TelegramApp.apiFetch('/api/admin/stats');
      if (result && result.success) {
        const stats = result.data || {};
        const totalUsers = document.getElementById('stat-total-users');
        const totalLinks = document.getElementById('stat-total-links');
        const pendingDeposits = document.getElementById('stat-pending-deposits');
        const pendingWithdrawals = document.getElementById('stat-pending-withdrawals');
        const systemEarned = document.getElementById('stat-system-earned');

        if (totalUsers) totalUsers.innerText = stats.totalUsers || 0;
        if (totalLinks) totalLinks.innerText = stats.totalLinks || 0;
        if (pendingDeposits) pendingDeposits.innerText = stats.pendingDeposits || 0;
        if (pendingWithdrawals) pendingWithdrawals.innerText = stats.pendingWithdrawals || 0;
        if (systemEarned) systemEarned.innerText = `$${Number(stats.systemEarned || 0).toFixed(2)}`;
      }
    },

    loadPendingDeposits: async function () {
      const depositsBody = document.getElementById('admin-deposits-body');
      if (!depositsBody) return;

      const result = await window.TelegramApp.apiFetch('/api/admin/deposits/pending');
      if (result && result.success && Array.isArray(result.data) && result.data.length > 0) {
        depositsBody.innerHTML = '';
        result.data.forEach(dep => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>${dep.telegramId || 'مستخدم'}</td>
            <td>$${Number(dep.amount).toFixed(2)}</td>
            <td style="font-size: 0.75rem;">${dep.txHash ? dep.txHash.substring(0, 10) + '...' : '-'}</td>
            <td>
              <button class="btn-sm btn-success action-dep-btn" data-id="${dep._id}" data-action="approve">قبول</button>
              <button class="btn-sm btn-danger action-dep-btn" data-id="${dep._id}" data-action="reject">رفض</button>
            </td>
          `;
          depositsBody.appendChild(tr);
        });

        depositsBody.querySelectorAll('.action-dep-btn').forEach(btn => {
          btn.addEventListener('click', () => this.handleDepositAction(btn.dataset.id, btn.dataset.action));
        });
      } else {
        depositsBody.innerHTML = '<tr><td colspan="4" class="text-center">لا توجد طلبات إيداع معلقة</td></tr>';
      }
    },

    handleDepositAction: async function (id, action) {
      const result = await window.TelegramApp.apiFetch(`/api/admin/deposits/${id}/${action}`, { method: 'POST' });
      if (result && result.success) {
        this.loadSystemStats();
        this.loadPendingDeposits();
      }
    },

    loadPendingWithdrawals: async function () {
      const withdrawalsBody = document.getElementById('admin-withdrawals-body');
      if (!withdrawalsBody) return;

      const result = await window.TelegramApp.apiFetch('/api/admin/withdrawals/pending');
      if (result && result.success && Array.isArray(result.data) && result.data.length > 0) {
        withdrawalsBody.innerHTML = '';
        result.data.forEach(wth => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>${wth.telegramId || 'مستخدم'}</td>
            <td>$${Number(wth.netAmount || wth.amount).toFixed(2)}</td>
            <td style="font-size: 0.75rem;">${wth.walletAddress ? wth.walletAddress.substring(0, 8) + '...' : '-'}</td>
            <td>
              <button class="btn-sm btn-success action-wth-btn" data-id="${wth._id}" data-action="approve">قبول</button>
              <button class="btn-sm btn-danger action-wth-btn" data-id="${wth._id}" data-action="reject">رفض</button>
            </td>
          `;
          withdrawalsBody.appendChild(tr);
        });

        withdrawalsBody.querySelectorAll('.action-wth-btn').forEach(btn => {
          btn.addEventListener('click', () => this.handleWithdrawalAction(btn.dataset.id, btn.dataset.action));
        });
      } else {
        withdrawalsBody.innerHTML = '<tr><td colspan="4" class="text-center">لا توجد طلبات سحب معلقة</td></tr>';
      }
    },

    handleWithdrawalAction: async function (id, action) {
      const result = await window.TelegramApp.apiFetch(`/api/admin/withdrawals/${id}/${action}`, { method: 'POST' });
      if (result && result.success) {
        this.loadSystemStats();
        this.loadPendingWithdrawals();
      }
    },

    loadUsersList: async function () {
      const usersBody = document.getElementById('admin-users-body');
      if (!usersBody) return;

      const result = await window.TelegramApp.apiFetch('/api/admin/users');
      if (result && result.success && Array.isArray(result.data) && result.data.length > 0) {
        usersBody.innerHTML = '';
        result.data.forEach(u => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>${u.telegramId}</td>
            <td>${u.firstName || 'مستخدم'}</td>
            <td>
              <span class="status-badge ${u.isBanned ? 'disabled' : 'active'}">
                ${u.isBanned ? 'محظور' : 'نشط'}
              </span>
            </td>
            <td>
              <button class="btn-sm ${u.isBanned ? 'btn-success' : 'btn-danger'} toggle-ban-btn" data-id="${u._id}" data-banned="${u.isBanned}">
                ${u.isBanned ? 'فك الحظر' : 'حظر'}
              </button>
            </td>
          `;
          usersBody.appendChild(tr);
        });

        usersBody.querySelectorAll('.toggle-ban-btn').forEach(btn => {
          btn.addEventListener('click', () => this.toggleUserBan(btn.dataset.id, btn.dataset.banned === 'true'));
        });
      } else {
        usersBody.innerHTML = '<tr><td colspan="4" class="text-center">لا يوجد مستخدمون حالياً</td></tr>';
      }
    },

    toggleUserBan: async function (userId, isCurrentlyBanned) {
      const endpoint = `/api/admin/users/${userId}/${isCurrentlyBanned ? 'unban' : 'ban'}`;
      const result = await window.TelegramApp.apiFetch(endpoint, { method: 'POST' });
      if (result && result.success) {
        this.loadUsersList();
      }
    }
  };

  window.AdminPanel = AdminPanel;
})();
