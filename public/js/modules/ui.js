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

      window.scrollTo({ top: 0, behavior: 'smooth' });
      this.haptic('light');
    },

    formatUserIdentity(user = {}) {
      const firstName = (user.firstName || user.first_name || '').trim();
      const lastName = (user.lastName || user.last_name || '').trim();
      const fullName = [firstName, lastName].filter(Boolean).join(' ') || user.username || 'User';
      const rawUsername = (user.username || '').replace(/^@+/, '').trim();
      const usernameFormatted = rawUsername ? `@${rawUsername}` : window.I18n.t('no_username');
      const telegramId = String(user.telegramId || user.userId || user.id || '---');
      const rawLang = (user.languageCode || user.language_code || '').trim();
      const langFormatted = rawLang ? rawLang.toUpperCase() : 'EN';

      return {
        fullName,
        rawUsername,
        usernameFormatted,
        telegramId,
        langFormatted
      };
    },

    renderUserHeader(user) {
      const idInfo = this.formatUserIdentity(user);
      const nameEl = document.getElementById('user-name');
      const handleEl = document.getElementById('user-handle');
      const avatarEl = document.getElementById('user-avatar');

      if (nameEl) nameEl.textContent = idInfo.fullName;
      if (handleEl) {
        handleEl.textContent = `${idInfo.usernameFormatted} • ID: ${idInfo.telegramId}`;
      }

      if (avatarEl) {
        const tgPhoto = window.Telegram?.WebApp?.initDataUnsafe?.user?.photo_url || user.photoUrl;
        if (tgPhoto) {
          avatarEl.innerHTML = `<img src="${tgPhoto}" alt="${idInfo.fullName}" />`;
        } else {
          avatarEl.textContent = idInfo.fullName.charAt(0).toUpperCase() || 'U';
        }
      }
    },

    // الأقسام مفرغة كما طُلب
    renderHome() {},
    updateNavBadge() {}
  };

  window.UI = UI;
})();
