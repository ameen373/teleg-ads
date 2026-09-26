// js/modules/auth.js
import { state } from '../state.js';
import { safeFetch } from './api.js';
import { escapeHTML } from './ui.js';

export function renderTelegramUser() {
  const u = state.tg?.initDataUnsafe?.user;
  const avatarContainer = document.getElementById('user-avatar-container');
  const nameElem = document.getElementById('user-display-name');
  const handleElem = document.getElementById('user-display-handle');
  const idElem = document.getElementById('user-tg-id');
  const premiumBadge = document.getElementById('user-premium-badge');

  if (u && u.id) {
    state.currentUserTelegramId = String(u.id);
    localStorage.setItem('telegramId', state.currentUserTelegramId);
    const fullName = `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username || 'Telegram User';
    if (nameElem) nameElem.innerText = fullName;
    if (handleElem) handleElem.innerText = u.username ? `@${u.username}` : '@no_username';
    if (idElem) idElem.innerText = `ID: ${u.id}`;

    if (u.is_premium && premiumBadge) {
      premiumBadge.classList.remove('hidden');
    }

    if (avatarContainer) {
      if (u.photo_url) {
        avatarContainer.innerHTML = `<img src="${escapeHTML(u.photo_url)}" class="user-avatar-img" alt="Avatar">`;
      } else {
        const letter = (u.first_name || 'U').charAt(0).toUpperCase();
        avatarContainer.innerHTML = `<div class="user-avatar-placeholder">${escapeHTML(letter)}</div>`;
      }
    }

    const savedLang = localStorage.getItem('appLang');
    if (savedLang && window.i18n[savedLang]) {
      state.currentLang = savedLang;
    } else if (u.language_code && window.i18n[u.language_code]) {
      state.currentLang = u.language_code === 'ar' ? 'ar' : 'en';
    } else {
      state.currentLang = 'ar';
    }
  } else {
    if (!state.currentUserTelegramId) {
      state.currentUserTelegramId = localStorage.getItem('telegramId') || '123456789';
    }
    if (nameElem) nameElem.innerText = 'Telegram User';
    if (handleElem) handleElem.innerText = '@user';
    if (idElem) idElem.innerText = `ID: ${state.currentUserTelegramId}`;
    if (avatarContainer) {
      avatarContainer.innerHTML = `<div class="user-avatar-placeholder">U</div>`;
    }
    if (!localStorage.getItem('appLang')) {
      state.currentLang = 'ar';
    }
  }

  if (typeof window.applyLanguage === 'function') {
    window.applyLanguage(state.currentLang);
  }
}

export async function authLogin() {
  const startParam = state.tg?.initDataUnsafe?.start_param || null;
  const u = state.tg?.initDataUnsafe?.user || {};
  const initDataStr = window.Telegram?.WebApp?.initData || state.tg?.initData || '';

  try {
    const res = await safeFetch('/api/auth/login', {
      method: 'POST',
      body: { 
        userId: state.currentUserTelegramId,
        telegramId: state.currentUserTelegramId,
        referrerId: startParam,
        firstName: u.first_name || '',
        lastName: u.last_name || '',
        username: u.username || '',
        photoUrl: u.photo_url || '',
        isPremium: !!u.is_premium,
        initData: initDataStr
      }
    });
    if (!res) return false;
    const data = await res.json().catch(() => ({}));
    if (data && (data.success || data.token)) {
      if (data.token) {
        state.authToken = data.token;
        localStorage.setItem('authToken', state.authToken);
      }

      if (data.user && data.user.telegramId) {
        state.currentUserTelegramId = String(data.user.telegramId);
        localStorage.setItem('telegramId', state.currentUserTelegramId);
      }

      if (data.isAdmin === true) {
        state.isUserAdmin = true;
        const adminBtn = document.getElementById('tab-btn-admin');
        if (adminBtn) adminBtn.style.display = 'flex';
      }

      if (data.depositWallets) {
        if (data.depositWallets.trc20) {
          const el = document.getElementById('addr-trc20');
          if (el) el.innerText = data.depositWallets.trc20;
        }
        if (data.depositWallets.bep20) {
          const el = document.getElementById('addr-bep20');
          if (el) el.innerText = data.depositWallets.bep20;
        }
      }

      if (data.botUrl) {
        const bLink = document.getElementById('official-bot-link');
        if (bLink) bLink.href = data.botUrl;
        const sBot = document.getElementById('support-bot-btn');
        if (sBot) sBot.href = data.botUrl;
      }
      if (data.officialChannelUrl) {
        const cLink = document.getElementById('official-channel-link');
        if (cLink) cLink.href = data.officialChannelUrl;
        const sChan = document.getElementById('support-channel-btn');
        if (sChan) sChan.href = data.officialChannelUrl;
      }
      if (data.supportUrl) {
        const sContact = document.getElementById('support-contact-btn');
        if (sContact) sContact.href = data.supportUrl;
      }

      return true;
    }
  } catch (e) {
    console.error("Auth error:", e);
  }
  return false;
}
