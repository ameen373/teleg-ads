import { state, i18n } from '../state.js';
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
    const tg = state.tg || window.Telegram?.WebApp;
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

export function showModal(modalId) {
  triggerHaptic('medium');
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('hidden');
}

export function closeModal(modalId) {
  triggerHaptic('light');
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add('hidden');
}

export function toggleModal(modalId, show) {
  triggerHaptic('medium');
  const modal = document.getElementById(modalId);
  if (!modal) return;
  if (show === undefined) {
    modal.classList.toggle('hidden');
  } else if (show) {
    modal.classList.remove('hidden');
  } else {
    modal.classList.add('hidden');
  }
}

export function copyToClipboard(text) {
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    showToast(i18n[state.currentLang]?.copied || "تم النسخ بنجاح!");
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
  state.activeTab = tabName;
  const tabs = ['dashboard', 'home', 'wallet', 'ads', 'referral', 'settings', 'admin'];
  tabs.forEach(t => {
    const content = document.getElementById(`tab-content-${t}`);
    const btn = document.getElementById(`tab-btn-${t}`);
    if (content) content.classList.toggle('hidden', t !== tabName && (t !== 'home' || tabName !== 'dashboard'));
    if (btn) btn.classList.toggle('active', t === tabName || (t === 'home' && tabName === 'dashboard'));
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
  const depNav = document.getElementById('wallet-nav-deposit');
  const withNav = document.getElementById('wallet-nav-withdraw');
  const depView = document.getElementById('wallet-view-deposit');
  const withView = document.getElementById('wallet-view-withdraw');

  if (depNav) depNav.classList.toggle('active', view === 'deposit');
  if (withNav) withNav.classList.toggle('active', view === 'withdraw');

  if (depView) depView.classList.toggle('hidden', view !== 'deposit');
  if (withView) withView.classList.toggle('hidden', view !== 'withdraw');
}

export function toggleInstructionsModal(show) {
  toggleModal('instructions-modal', show);
}

export function updateWithdrawCalculations() {
  const amtInput = document.getElementById('withdraw-amount');
  const feeBox = document.getElementById('withdraw-fee-box');
  if (!amtInput) return;
  const val = parseFloat(amtInput.value) || 0;

  if (val > 0) {
    if (feeBox) feeBox.classList.remove('hidden');
    const fee = 3;
    const net = Math.max(0, val - fee);

    const reqElem = document.getElementById('calc-req');
    const feeElem = document.getElementById('calc-fee');
    const netElem = document.getElementById('calc-net');

    if (reqElem) reqElem.innerText = `$${val.toFixed(2)}`;
    if (feeElem) feeElem.innerText = `$${fee.toFixed(2)}`;
    if (netElem) netElem.innerText = `$${net.toFixed(2)}`;
  } else {
    if (feeBox) feeBox.classList.add('hidden');
  }
}

export function toggleWalletEdit() {
  triggerHaptic('light');
  const walletInput = document.getElementById('default-wallet');
  const editBtn = document.getElementById('edit-wallet-btn');
  const saveBtn = document.getElementById('save-wallet-btn');

  if (!walletInput || !editBtn) return;

  if (walletInput.hasAttribute('readonly')) {
    walletInput.removeAttribute('readonly');
    walletInput.focus();
    editBtn.innerText = i18n[state.currentLang]?.cancel || "إلغاء";
    editBtn.className = "btn-small btn-danger";
    if (saveBtn) saveBtn.classList.remove('hidden');
  } else {
    walletInput.setAttribute('readonly', 'readonly');
    editBtn.innerText = i18n[state.currentLang]?.btn_edit || "تعديل";
    editBtn.className = "btn-small btn-warning";
    if (saveBtn) saveBtn.classList.add('hidden');
  }
}
