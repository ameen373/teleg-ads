(function () {
  const CampaignsModule = {
    init() {
      const form = document.getElementById('create-campaign-form');
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          const payload = {
            channelId: document.getElementById('camp-channel-select').value,
            title: document.getElementById('camp-title').value,
            adText: document.getElementById('camp-text').value,
            targetUrl: document.getElementById('camp-url').value
          };
          await window.Api.createCampaign(payload);
          form.reset();
          window.UI.haptic('medium');
          await this.load();
          await window.App.refreshUserData();
        } catch (err) {
          window.UI.notify(err.message);
        }
      });
    },

    populateChannelSelect(channels) {
      const select = document.getElementById('camp-channel-select');
      const placeholder = `<option value="">${window.I18n.t('select_channel')}</option>`;
      if (!channels || channels.length === 0) {
        select.innerHTML = placeholder;
        return;
      }
      const options = channels.map((ch) =>
        `<option value="${ch._id}">${ch.title} (@${ch.channelUsername}) - $${ch.pricePerPost}</option>`
      ).join('');
      select.innerHTML = placeholder + options;
    },

    async load() {
      const data = await window.Api.getCampaigns();
      const listEl = document.getElementById('my-campaigns-list');
      if (!data.campaigns || data.campaigns.length === 0) {
        listEl.innerHTML = `<div class="empty-state">${window.I18n.t('no_data')}</div>`;
        return;
      }

      listEl.innerHTML = data.campaigns.map((camp) => {
        const chName = camp.channelId ? `@${camp.channelId.channelUsername}` : 'Channel';
        return `
          <div class="list-item">
            <div class="item-main">
              <span class="item-title">${camp.title} (${chName})</span>
              <span class="item-sub">$${camp.budget.toFixed(2)} • ${camp.targetUrl}</span>
            </div>
            <span class="badge ${camp.status}">${window.I18n.t('status_' + camp.status)}</span>
          </div>
        `;
      }).join('');
    }
  };

  window.CampaignsModule = CampaignsModule;
})();
