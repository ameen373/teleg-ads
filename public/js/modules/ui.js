'use strict';

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

(function (window) {
  function showBannerToast(message, type = 'info', bannerId = 'channels-feedback-banner') {
    const box = document.getElementById(bannerId);
    if (!box) {
      return false;
    }

    box.className = `feedback-banner feedback-${type}`;
    box.textContent = message;
    box.classList.remove('hidden');
    return true;
  }

  function clearBannerFeedback(bannerId = 'channels-feedback-banner') {
    const box = document.getElementById(bannerId);
    if (box) {
      box.textContent = '';
      box.className = 'feedback-banner hidden';
    }
  }

  function getCampaignStatusBadge(status) {
    if (status === 'active') {
      return '<span class="status-badge badge-approved">🟢 نشطة</span>';
    }
    if (status === 'scheduled') {
      return '<span class="status-badge badge-pending">🕒 مجدولة</span>';
    }
    if (status === 'paused') {
      return '<span class="status-badge badge-warning">⏸ متوقفة (بحاجة لشحن/استئناف)</span>';
    }
    return `<span class="status-badge badge-neutral">${escapeHtml(status || 'غير معروف')}</span>`;
  }

  const UI = {
    escapeHtml,

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

    showToast(message, type = 'info', bannerId = 'channels-feedback-banner') {
      return showBannerToast(message, type, bannerId);
    },

    toast(message, type = 'info', bannerId = 'channels-feedback-banner') {
      return showBannerToast(message, type, bannerId);
    },

    clearFeedback(bannerId = 'channels-feedback-banner') {
      clearBannerFeedback(bannerId);
    },

    getCampaignStatusBadge,

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

      window.scrollTo({ top: 0, behavior: 'smooth' });
      this.haptic('light');
    },

    updateNavBadge(badgeId, count) {
      const badge = document.getElementById(badgeId);
      if (!badge) return;
      const num = Number(count) || 0;
      if (num > 0) {
        badge.textContent = num > 99 ? '99+' : num;
        badge.style.display = 'inline-block';
      } else {
        badge.style.display = 'none';
      }
    },

    renderUserHeader(user) {
      const fullName =
        [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || 'User';
      document.getElementById('user-name').textContent = fullName;
      document.getElementById('user-id').textContent = `ID: ${user.telegramId}`;

      const avatarEl = document.getElementById('user-avatar');
      const tgPhoto = window.Telegram?.WebApp?.initDataUnsafe?.user?.photo_url || user.photoUrl;

      if (tgPhoto) {
        avatarEl.innerHTML = `<img src="${escapeHtml(tgPhoto)}" alt="${escapeHtml(fullName)}" />`;
      } else {
        avatarEl.textContent = fullName.charAt(0).toUpperCase();
      }
    },

    renderHome(user, stats, transactions) {
      document.getElementById('home-earnings-balance').textContent = `$${user.balance.toFixed(2)}`;
      document.getElementById('home-ad-balance').textContent = `$${user.adBalance.toFixed(2)}`;
      document.getElementById('stat-market-channels').textContent = stats.activeChannels;
      document.getElementById('stat-my-channels').textContent = stats.userChannels;
      document.getElementById('stat-my-campaigns').textContent = stats.userCampaigns;

      // تحديث عدادات الإشعارات الذكية على الكبسولة السفلية
      this.updateNavBadge('nav-badge-channels', stats.userChannels);
      this.updateNavBadge('nav-badge-campaigns', stats.userCampaigns);

      const listEl = document.getElementById('home-transactions-list');
      if (!transactions || transactions.length === 0) {
        listEl.innerHTML = `<div class="empty-state">${window.I18n.t('no_data')}</div>`;
        return;
      }

      listEl.innerHTML = transactions
        .map((tx) => {
          const sign = tx.amount >= 0 ? '+' : '';
          return `
          <div class="list-item">
            <div class="item-main">
              <span class="item-title">${escapeHtml(tx.details || tx.type)}</span>
              <span class="item-sub">${escapeHtml(new Date(tx.createdAt).toLocaleDateString())}</span>
            </div>
            <div style="text-align: end;">
              <div class="item-title">${sign}$${tx.amount.toFixed(2)}</div>
              <span class="badge ${escapeHtml(tx.status)}">${escapeHtml(window.I18n.t('status_' + tx.status))}</span>
            </div>
          </div>
        `;
        })
        .join('');
    },
  };

  window.UI = UI;

  window.TelegaUI = Object.assign({}, window.TelegaUI || {}, {
    escapeHtml,
    notify: (message) => UI.notify(message),
    toast: (message, type = 'info', bannerId = 'channels-feedback-banner') =>
      showBannerToast(message, type, bannerId),
    showToast: (message, type = 'info', bannerId = 'channels-feedback-banner') =>
      showBannerToast(message, type, bannerId),
    clearFeedback: (bannerId = 'channels-feedback-banner') => clearBannerFeedback(bannerId),
    getCampaignStatusBadge,
  });
})(window);
