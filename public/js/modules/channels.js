(function () {
  const ChannelsModule = {
    init() {
      const form = document.getElementById('add-channel-form');
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          const payload = {
            channelUsername: document.getElementById('ch-username').value,
            title: document.getElementById('ch-title').value,
            subscribers: document.getElementById('ch-subs').value,
            pricePerPost: document.getElementById('ch-price').value
          };
          await window.Api.addChannel(payload);
          form.reset();
          window.UI.haptic('medium');
          await this.load();
          await window.App.refreshUserData();
        } catch (err) {
          window.UI.notify(err.message);
        }
      });
    },

    async load() {
      const data = await window.Api.getChannels();
      this.renderMyChannels(data.myChannels);
      window.CampaignsModule.populateChannelSelect(data.marketplaceChannels);
    },

    renderMyChannels(channels) {
      const listEl = document.getElementById('my-channels-list');
      if (!channels || channels.length === 0) {
        listEl.innerHTML = `<div class="empty-state">${window.I18n.t('no_data')}</div>`;
        return;
      }

      listEl.innerHTML = channels.map((ch) => `
        <div class="list-item">
          <div class="item-main">
            <span class="item-title">${ch.title} (@${ch.channelUsername})</span>
            <span class="item-sub">${ch.subscribers.toLocaleString()} subs • $${ch.pricePerPost}/post</span>
          </div>
          <span class="badge ${ch.status}">${window.I18n.t('status_' + ch.status)}</span>
        </div>
      `).join('');
    }
  };

  window.ChannelsModule = ChannelsModule;
})();
