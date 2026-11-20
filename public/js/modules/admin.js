(function () {
  const AdminModule = {
    enableAdminAccess() {
      const adminNavBtn = document.getElementById('nav-admin-btn');
      if (adminNavBtn) {
        adminNavBtn.style.display = 'flex';
      }
    },

    async loadDashboard() {
      try {
        const data = await window.Api.getAdminDashboard();
        document.getElementById('admin-total-users').textContent = data.stats.totalUsers;
        document.getElementById('admin-pending-ch').textContent = data.stats.pendingChannelsCount;
        document.getElementById('admin-pending-tx').textContent = data.stats.pendingTransactionsCount;

        this.renderChannels(data.pendingChannels);
        this.renderCampaigns(data.pendingCampaigns);
        this.renderTransactions(data.pendingTransactions);
        this.renderLogs(data.securityLogs);
      } catch (err) {
        window.UI.notify(err.message);
      }
    },

    renderChannels(channels) {
      const listEl = document.getElementById('admin-channels-list');
      if (!channels || channels.length === 0) {
        listEl.innerHTML = `<div class="empty-state">${window.I18n.t('no_data')}</div>`;
        return;
      }

      listEl.innerHTML = channels.map((ch) => `
        <div class="list-item">
          <div class="item-main">
            <span class="item-title">@${ch.channelUsername} ($${ch.pricePerPost})</span>
            <span class="item-sub">Owner: ${ch.ownerId} • ${ch.subscribers} subs</span>
          </div>
          <div class="admin-actions">
            <button class="tg-btn sm success" onclick="AdminModule.handleChannel('${ch._id}', 'approved')">${window.I18n.t('approve')}</button>
            <button class="tg-btn sm danger" onclick="AdminModule.handleChannel('${ch._id}', 'rejected')">${window.I18n.t('reject')}</button>
          </div>
        </div>
      `).join('');
    },

    renderCampaigns(campaigns) {
      const listEl = document.getElementById('admin-campaigns-list');
      if (!campaigns || campaigns.length === 0) {
        listEl.innerHTML = `<div class="empty-state">${window.I18n.t('no_data')}</div>`;
        return;
      }

      listEl.innerHTML = campaigns.map((camp) => `
        <div class="list-item">
          <div class="item-main">
            <span class="item-title">${camp.title} ($${camp.budget})</span>
            <span class="item-sub">@${camp.channelId?.channelUsername || 'N/A'} • ${camp.targetUrl}</span>
          </div>
          <div class="admin-actions">
            <button class="tg-btn sm success" onclick="AdminModule.handleCampaign('${camp._id}')">${window.I18n.t('complete')}</button>
          </div>
        </div>
      `).join('');
    },

    renderTransactions(txs) {
      const listEl = document.getElementById('admin-tx-list');
      if (!txs || txs.length === 0) {
        listEl.innerHTML = `<div class="empty-state">${window.I18n.t('no_data')}</div>`;
        return;
      }

      listEl.innerHTML = txs.map((tx) => `
        <div class="list-item">
          <div class="item-main">
            <span class="item-title">${tx.type.toUpperCase()} ($${Math.abs(tx.amount)})</span>
            <span class="item-sub">User: ${tx.userId} • ${tx.details}</span>
          </div>
          <div class="admin-actions">
            <button class="tg-btn sm success" onclick="AdminModule.handleTx('${tx._id}', 'completed')">${window.I18n.t('approve')}</button>
            <button class="tg-btn sm danger" onclick="AdminModule.handleTx('${tx._id}', 'rejected')">${window.I18n.t('reject')}</button>
          </div>
        </div>
      `).join('');
    },

    renderLogs(logs) {
      const listEl = document.getElementById('admin-logs-list');
      if (!logs || logs.length === 0) {
        listEl.innerHTML = `<div class="empty-state">${window.I18n.t('no_data')}</div>`;
        return;
      }

      listEl.innerHTML = logs.map((log) => `
        <div class="list-item">
          <div class="item-main">
            <span class="item-title">${log.action}</span>
            <span class="item-sub">Actor: ${log.actorId} | ${log.details}</span>
          </div>
        </div>
      `).join('');
    },

    async handleChannel(id, action) {
      await window.Api.reviewChannel(id, action);
      await this.loadDashboard();
    },

    async handleCampaign(id) {
      await window.Api.completeCampaign(id);
      await this.loadDashboard();
    },

    async handleTx(id, action) {
      await window.Api.reviewTransaction(id, action);
      await this.loadDashboard();
    }
  };

  window.AdminModule = AdminModule;
})();
