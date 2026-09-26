// ==========================================
// Module: ui.js
// Description: DOM interactions, modals, toasts, language rendering, and UI view switching
// ==========================================

import { currentLang, i18n, isUserAdmin, setCurrentLang } from './state.js';
import { triggerHaptic } from './telegram.js';

export function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function showToast(msg) {
  triggerHaptic('medium');
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.innerText = msg;
  toast.classList.add("show");
  setTimeout(() => { toast.classList.remove("show"); }, 3200);
}

export function copyToClipboard(text) {
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    showToast(i18n[currentLang]?.copied || "تم النسخ بنجاح!");
  }).catch(() => {
    showToast(i18n[currentLang]?.copy_failed || "فشل النسخ تلقائياً");
  });
}

// Explicitly bind copyToClipboard to window object for inline HTML triggers
window.copyToClipboard = copyToClipboard;

export function setButtonLoading(btnId, isLoading, originalText) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  if (isLoading) {
    btn.disabled = true;
    btn.dataset.oldContent = btn.innerHTML;
    btn.innerHTML = `<div class="spinner"></div>`;
  } else {
    btn.disabled = false;
    btn.innerHTML = originalText || btn.dataset.oldContent || '';
  }
}

export function switchTab(tabName) {
  if (tabName === 'admin' && !isUserAdmin) {
    showToast(i18n[currentLang]?.access_denied || "غير مصرح لك بالوصول للوحة التحكم");
    return;
  }
  triggerHaptic('light');
  const tabs = ['dashboard', 'wallet', 'ads', 'referral', 'settings', 'admin'];
  tabs.forEach(t => {
    const content = document.getElementById(`tab-content-${t}`);
    const btn = document.getElementById(`tab-btn-${t}`);
    if (content) content.classList.toggle('hidden', t !== tabName);
    if (btn) btn.classList.toggle('active', t === tabName);
  });

  if (tabName === 'admin' && isUserAdmin && typeof window.loadAdminData === 'function') {
    window.loadAdminData();
  } else if (tabName === 'ads' && typeof window.fetchUserAds === 'function') {
    window.fetchUserAds();
  } else if (tabName === 'referral' && typeof window.fetchUserReferrals === 'function') {
    window.fetchUserReferrals();
  }
}

export function handleNetworkChange(networkVal) {
  triggerHaptic('light');
  const trcCard = document.getElementById('card-addr-trc20');
  const bepCard = document.getElementById('card-addr-bep20');

  if (trcCard) trcCard.classList.add('hidden');
  if (bepCard) bepCard.classList.add('hidden');

  if (networkVal === 'TRC20' && trcCard) {
    trcCard.classList.remove('hidden');
  } else if (networkVal === 'BEP20' && bepCard) {
    bepCard.classList.remove('hidden');
  }
}

export function switchWalletView(view) {
  triggerHaptic('light');
  const depBtn = document.getElementById('wallet-nav-deposit');
  const withBtn = document.getElementById('wallet-nav-withdraw');
  const depView = document.getElementById('wallet-view-deposit');
  const withView = document.getElementById('wallet-view-withdraw');

  if (depBtn) depBtn.classList.toggle('active', view === 'deposit');
  if (withBtn) withBtn.classList.toggle('active', view === 'withdraw');

  if (depView) depView.classList.toggle('hidden', view !== 'deposit');
  if (withView) withView.classList.toggle('hidden', view !== 'withdraw');
}

export function toggleInstructionsModal(show) {
  triggerHaptic('medium');
  const modal = document.getElementById('instructions-modal');
  if (modal) modal.classList.toggle('hidden', !show);
}

export function applyLanguage(lang) {
  if (!i18n[lang]) return;
  setCurrentLang(lang);
  
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';

  const elements = document.querySelectorAll('[data-i18n]');
  elements.forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (i18n[lang] && i18n[lang][key]) {
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        el.placeholder = i18n[lang][key];
      } else {
        el.innerText = i18n[lang][key];
      }
    }
  });
}
