// ==========================================
// Module: telegram.js
// Description: Telegram WebApp SDK initialization and interactions
// ==========================================

import { 
  currentUserTelegramId, 
  currentLang, 
  i18n, 
  setCurrentUserTelegramId, 
  setCurrentLang 
} from './state.js';
import { escapeHTML, applyLanguage } from './ui.js';

export const tg = window.Telegram?.WebApp;

export function triggerHaptic(style = 'light') {
  try {
    if (tg && tg.isVersionAtLeast && tg.isVersionAtLeast('6.1') && tg.HapticFeedback) {
      tg.HapticFeedback.impactOccurred(style);
    }
  } catch (e) {
    console.warn("Haptic Feedback error:", e);
  }
}

export function renderTelegramUser() {
  const u = tg?.initDataUnsafe?.user;
  const avatarContainer = document.getElementById('user-avatar-container');
  const nameElem = document.getElementById('user-display-name');
  const handleElem = document.getElementById('user-display-handle');
  const idElem = document.getElementById('user-tg-id');
  const premiumBadge = document.getElementById('user-premium-badge');

  if (u && u.id) {
    setCurrentUserTelegramId(String(u.id));
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
    if (savedLang && i18n[savedLang]) {
      setCurrentLang(savedLang);
    } else if (u.language_code && i18n[u.language_code]) {
      setCurrentLang(u.language_code === 'ar' ? 'ar' : 'en');
    } else {
      setCurrentLang('ar');
    }
  } else {
    let fallbackId = currentUserTelegramId;
    if (!fallbackId) {
      fallbackId = localStorage.getItem('telegramId') || '123456789';
      setCurrentUserTelegramId(fallbackId);
    }
    if (nameElem) nameElem.innerText = 'Telegram User';
    if (handleElem) handleElem.innerText = '@user';
    if (idElem) idElem.innerText = `ID: ${fallbackId}`;
    if (avatarContainer) avatarContainer.innerHTML = `<div class="user-avatar-placeholder">U</div>`;
    if (!localStorage.getItem('appLang')) {
      setCurrentLang('ar');
    }
  }

  applyLanguage(currentLang);
}

export function shareReferralLink() {
  const refLinkInput = document.getElementById('ref-link');
  const refUrl = refLinkInput ? refLinkInput.value : '';
  if (!refUrl) return;
  
  triggerHaptic('medium');
  const shareText = encodeURIComponent(i18n[currentLang]?.share_text || "انضم إليّ في أفضل منصة لاختصار الروابط واكسب الأرباح بسهولة! 🚀");
  const url = `https://t.me/share/url?url=${encodeURIComponent(refUrl)}&text=${shareText}`;
  
  if (tg && tg.openTelegramLink) {
    tg.openTelegramLink(url);
  } else {
    window.open(url, '_blank');
  }
}
