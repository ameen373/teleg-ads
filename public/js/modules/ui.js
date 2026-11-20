(function () {
  const UI = {
    notify(message) {
      if (window.Telegram?.WebApp?.showAlert) {
        window.Telegram.WebApp.showAlert(message);
      } else {
        alert(message);
      }
    },

    haptic(type = 'light') {
      if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.impactOccurred(type);
      }
    },

    hideLoader() {
      const loader = document.getElementById('loader');
      if (loader) loader.classList.add('hidden');
    },

    switchView(targetId) {
      document.querySelectorAll('.view-section').forEach((sec) => {
        sec.classList.remove('active');
        if (sec.id === 'view-admin' && targetId !== 'view-admin') {
          sec.style.display = 'none';
        }
      });

      const targetSection = document.getElementById(targetId);
      if (targetSection) {
        if (targetId === 'view-admin') {
          targetSection.style.display = 'block';
        }
        targetSection.classList.add('active');
      }

      document.querySelectorAll('.nav-item').forEach((btn) => {
        btn.classList.toggle('active', btn.getAttribute('data-target') === targetId);
      });

      this.haptic('light');
    },

    renderUserHeader(user) {
      const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || 'User';
      document.getElementById('user-name').textContent = fullName;
      document.getElementById('user-id').textContent = `ID: ${user.telegramId}`;
      document.getElementById('user-avatar').textContent = fullName.charAt(0).toUpperCase();
    },

    renderHome(user, stats, transactions) {
      document.getElementById('home-earnings-balance').textContent = `$${user.balance.toFixed(2)}`;
      document.getElementById('home-ad-balance').textContent = `$${user.adBalance.toFixed(2)}`;
      document.getElementById('stat-market-channels').textContent = stats.activeChannels;
      document.getElementById('stat-my-channels').textContent = stats.userChannels;
      document.getElementById('stat-my-campaigns').textContent = stats.userCampaigns;

      const listEl = document.getElementById('home-transactions-list');
      if (!transactions || transactions.length === 0) {
        listEl.innerHTML = `<div class="empty-state">${window.I18n.t('no_data')}</div>`;
        return;
      }

      listEl.innerHTML = transactions.map((tx) => {
        const sign = tx.amount >= 0 ? '+' : '';
        return `
          <div class="list-item">
            <div class="item-main">
              <span class="item-title">${tx.details || tx.type}</span>
              <span class="item-sub">${new Date(tx.createdAt).toLocaleDateString()}</span>
            </div>
            <div style="text-align: end;">
              <div class="item-title">${sign}$${tx.amount.toFixed(2)}</div>
              <span class="badge ${tx.status}">${window.I18n.t('status_' + tx.status)}</span>
            </div>
          </div>
        `;
      }).join('');
    }
  };

  window.UI = UI;
})();
