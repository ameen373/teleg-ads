import { state, tg, setCurrentUserTelegramId, setCurrentLang } from './state.js';
import { loadAdminData } from './admin.js';
import { fetchUserAds } from './ads.js';
import { fetchUserReferrals } from './user.js';

export function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function triggerHaptic(style = 'light') {
  try {
    if (tg && tg.isVersionAtLeast && tg.isVersionAtLeast('6.1') && tg.HapticFeedback) {
      tg.HapticFeedback.impactOccurred(style);
    }
  } catch (e) {}
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
  const i18n = window.i18n;
  navigator.clipboard.writeText(text).then(() => {
    showToast(i18n?.[state.currentLang]?.copied || (state.currentLang === 'ar' ? "تم النسخ بنجاح!" : "Copied successfully!"));
  }).catch(() => {
    showToast(state.currentLang === 'ar' ? "فشل النسخ تلقائياً" : "Failed to copy");
  });
}

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
  if (tabName === 'admin' && !state.isUserAdmin) {
    showToast(state.currentLang === 'ar' ? "غير مصرح لك بالوصول للوحة التحكم" : "Access denied");
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

  if (tabName === 'admin' && state.isUserAdmin) {
    loadAdminData();
  } else if (tabName === 'ads') {
    fetchUserAds();
  } else if (tabName === 'referral') {
    fetchUserReferrals();
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
  const depositNav = document.getElementById('wallet-nav-deposit');
  const withdrawNav = document.getElementById('wallet-nav-withdraw');
  const depositView = document.getElementById('wallet-view-deposit');
  const withdrawView = document.getElementById('wallet-view-withdraw');

  if (depositNav) depositNav.classList.toggle('active', view === 'deposit');
  if (withdrawNav) withdrawNav.classList.toggle('active', view === 'withdraw');

  if (depositView) depositView.classList.toggle('hidden', view !== 'deposit');
  if (withdrawView) withdrawView.classList.toggle('hidden', view !== 'withdraw');
}

export function toggleInstructionsModal(show) {
  triggerHaptic('medium');
  const modal = document.getElementById('instructions-modal');
  if (modal) {
    modal.classList.toggle('hidden', !show);
  }
}

export function updateWithdrawCalculations() {
  const amtInput = document.getElementById('withdraw-amount');
  const feeBox = document.getElementById('withdraw-fee-box');
  if (!amtInput || !feeBox) return;

  const val = parseFloat(amtInput.value) || 0;

  if (val > 0) {
    feeBox.classList.remove('hidden');
    const fee = 3;
    const net = Math.max(0, val - fee);

    const calcReq = document.getElementById('calc-req');
    const calcFee = document.getElementById('calc-fee');
    const calcNet = document.getElementById('calc-net');

    if (calcReq) calcReq.innerText = `$${val.toFixed(2)}`;
    if (calcFee) calcFee.innerText = `$${fee.toFixed(2)}`;
    if (calcNet) calcNet.innerText = `$${net.toFixed(2)}`;
  } else {
    feeBox.classList.add('hidden');
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
    setCurrentUserTelegramId(u.id);
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
    const i18n = window.i18n;
    if (savedLang && i18n && i18n[savedLang]) {
      setCurrentLang(savedLang);
    } else if (u.language_code && i18n && i18n[u.language_code]) {
      setCurrentLang(u.language_code === 'ar' ? 'ar' : 'en');
    } else {
      setCurrentLang('ar');
    }
  } else {
    if (!state.currentUserTelegramId) {
      setCurrentUserTelegramId(localStorage.getItem('telegramId') || '123456789');
    }
    if (nameElem) nameElem.innerText = 'Telegram User';
    if (handleElem) handleElem.innerText = '@user';
    if (idElem) idElem.innerText = `ID: ${state.currentUserTelegramId}`;
    if (avatarContainer) {
      avatarContainer.innerHTML = `<div class="user-avatar-placeholder">U</div>`;
    }
    if (!localStorage.getItem('appLang')) {
      setCurrentLang('ar');
    }
  }

  if (typeof window.applyLanguage === 'function') {
    window.applyLanguage(state.currentLang);
  }
}

export function toggleWalletEdit() {
  triggerHaptic('light');
  const walletInput = document.getElementById('default-wallet');
  const editBtn = document.getElementById('edit-wallet-btn');
  const saveBtn = document.getElementById('save-wallet-btn');

  if (!walletInput || !editBtn || !saveBtn) return;

  const i18n = window.i18n;

  if (walletInput.hasAttribute('readonly')) {
    walletInput.removeAttribute('readonly');
    walletInput.focus();
    editBtn.innerText = i18n?.[state.currentLang]?.cancel || (state.currentLang === 'ar' ? "إلغاء" : "Cancel");
    editBtn.className = "btn-small btn-danger";
    saveBtn.classList.remove('hidden');
  } else {
    walletInput.setAttribute('readonly', 'readonly');
    editBtn.innerText = i18n?.[state.currentLang]?.btn_edit || (state.currentLang === 'ar' ? "تعديل" : "Edit");
    editBtn.className = "btn-small btn-warning";
    saveBtn.classList.add('hidden');
  }
}

export function changeAppLanguage(langVal) {
  if (langVal && ['ar', 'en'].includes(langVal)) {
    setCurrentLang(langVal);
    if (typeof window.applyLanguage === 'function') {
      window.applyLanguage(langVal);
    }
  }
}
