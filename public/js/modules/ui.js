window.currentLang = localStorage.getItem('appLang') || 'ar';

function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
window.escapeHTML = escapeHTML;

function triggerHaptic(style = 'light') {
  try {
    const tg = window.Telegram?.WebApp;
    if (tg && tg.isVersionAtLeast && tg.isVersionAtLeast('6.1') && tg.HapticFeedback) {
      tg.HapticFeedback.impactOccurred(style);
    }
  } catch (e) {}
}
window.triggerHaptic = triggerHaptic;

function showToast(msg) {
  triggerHaptic('medium');
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.innerText = msg;
  toast.classList.add("show");
  setTimeout(() => { toast.classList.remove("show"); }, 3200);
}
window.showToast = showToast;

function copyToClipboard(text) {
  if (!text) return;
  const lang = window.currentLang || 'ar';
  const i18n = window.i18n || {};
  navigator.clipboard.writeText(text).then(() => {
    showToast(i18n[lang]?.copied || (lang === 'ar' ? "تم النسخ بنجاح!" : "Copied successfully!"));
  }).catch(() => {
    showToast(lang === 'ar' ? "فشل النسخ تلقائياً" : "Failed to copy");
  });
}
window.copyToClipboard = copyToClipboard;

function setButtonLoading(btnId, isLoading, originalText) {
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
window.setButtonLoading = setButtonLoading;

function switchTab(tabName) {
  const lang = window.currentLang || 'ar';
  if (tabName === 'admin' && !window.isUserAdmin) {
    showToast(lang === 'ar' ? "غير مصرح لك بالوصول للوحة التحكم" : "Access denied");
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

  if (tabName === 'admin' && window.isUserAdmin && typeof window.loadAdminData === 'function') {
    window.loadAdminData();
  } else if (tabName === 'ads' && typeof window.fetchUserAds === 'function') {
    window.fetchUserAds();
  } else if (tabName === 'referral' && typeof window.fetchUserReferrals === 'function') {
    window.fetchUserReferrals();
  }
}
window.switchTab = switchTab;

function handleNetworkChange(networkVal) {
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
window.handleNetworkChange = handleNetworkChange;

function switchWalletView(view) {
  triggerHaptic('light');
  const navDep = document.getElementById('wallet-nav-deposit');
  const navWith = document.getElementById('wallet-nav-withdraw');
  const viewDep = document.getElementById('wallet-view-deposit');
  const viewWith = document.getElementById('wallet-view-withdraw');

  if (navDep) navDep.classList.toggle('active', view === 'deposit');
  if (navWith) navWith.classList.toggle('active', view === 'withdraw');

  if (viewDep) viewDep.classList.toggle('hidden', view !== 'deposit');
  if (viewWith) viewWith.classList.toggle('hidden', view !== 'withdraw');
}
window.switchWalletView = switchWalletView;

function toggleInstructionsModal(show) {
  triggerHaptic('medium');
  const modal = document.getElementById('instructions-modal');
  if (modal) modal.classList.toggle('hidden', !show);
}
window.toggleInstructionsModal = toggleInstructionsModal;

function updateWithdrawCalculations() {
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
window.updateWithdrawCalculations = updateWithdrawCalculations;

function renderTelegramUser() {
  const tg = window.Telegram?.WebApp;
  const u = tg?.initDataUnsafe?.user;
  const avatarContainer = document.getElementById('user-avatar-container');
  const nameElem = document.getElementById('user-display-name');
  const handleElem = document.getElementById('user-display-handle');
  const idElem = document.getElementById('user-tg-id');
  const premiumBadge = document.getElementById('user-premium-badge');

  if (u && u.id) {
    window.currentUserTelegramId = String(u.id);
    localStorage.setItem('telegramId', window.currentUserTelegramId);
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
    const i18n = window.i18n || {};
    if (savedLang && i18n[savedLang]) {
      window.currentLang = savedLang;
    } else if (u.language_code && i18n[u.language_code]) {
      window.currentLang = u.language_code === 'ar' ? 'ar' : 'en';
    } else {
      window.currentLang = 'ar';
    }
  } else {
    if (!window.currentUserTelegramId) {
      window.currentUserTelegramId = localStorage.getItem('telegramId') || '123456789';
    }
    if (nameElem) nameElem.innerText = 'Telegram User';
    if (handleElem) handleElem.innerText = '@user';
    if (idElem) idElem.innerText = `ID: ${window.currentUserTelegramId}`;
    if (avatarContainer) avatarContainer.innerHTML = `<div class="user-avatar-placeholder">U</div>`;
    if (!localStorage.getItem('appLang')) {
      window.currentLang = 'ar';
    }
  }

  if (typeof window.applyLanguage === 'function') {
    window.applyLanguage(window.currentLang);
  }
}
window.renderTelegramUser = renderTelegramUser;

function shareReferralLink() {
  const refInput = document.getElementById('ref-link');
  if (!refInput) return;
  const refUrl = refInput.value;
  if (!refUrl) return;
  triggerHaptic('medium');
  const lang = window.currentLang || 'ar';
  const tg = window.Telegram?.WebApp;
  const shareText = encodeURIComponent(lang === 'ar' ? "انضم إليّ في أفضل منصة لاختصار الروابط واكسب الأرباح بسهولة! 🚀" : "Join me on the best url shortener platform & earn money! 🚀");
  const url = `https://t.me/share/url?url=${encodeURIComponent(refUrl)}&text=${shareText}`;
  
  if (tg && tg.openTelegramLink) {
    tg.openTelegramLink(url);
  } else {
    window.open(url, '_blank');
  }
}
window.shareReferralLink = shareReferralLink;

function toggleWalletEdit() {
  triggerHaptic('light');
  const walletInput = document.getElementById('default-wallet');
  const editBtn = document.getElementById('edit-wallet-btn');
  const saveBtn = document.getElementById('save-wallet-btn');
  if (!walletInput || !editBtn) return;

  const lang = window.currentLang || 'ar';
  const i18n = window.i18n || {};

  if (walletInput.hasAttribute('readonly')) {
    walletInput.removeAttribute('readonly');
    walletInput.focus();
    editBtn.innerText = i18n[lang]?.cancel || (lang === 'ar' ? 'إلغاء' : 'Cancel');
    editBtn.className = "btn-small btn-danger";
    if (saveBtn) saveBtn.classList.remove('hidden');
  } else {
    walletInput.setAttribute('readonly', 'readonly');
    editBtn.innerText = i18n[lang]?.btn_edit || (lang === 'ar' ? 'تعديل' : 'Edit');
    editBtn.className = "btn-small btn-warning";
    if (saveBtn) saveBtn.classList.add('hidden');
  }
}
window.toggleWalletEdit = toggleWalletEdit;
