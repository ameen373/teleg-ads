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

  if (view === 'withdraw' && typeof window.API?.fetchWithdrawals === 'function') {
    window.API.fetchWithdrawals().then(list => window.UI.renderWithdrawals(list));
  }
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
  } else {
    if (!window.currentUserTelegramId) {
      window.currentUserTelegramId = localStorage.getItem('telegramId') || '123456789';
    }
    if (nameElem) nameElem.innerText = 'Telegram User';
    if (handleElem) handleElem.innerText = '@user';
    if (idElem) idElem.innerText = `ID: ${window.currentUserTelegramId}`;
    if (avatarContainer) avatarContainer.innerHTML = `<div class="user-avatar-placeholder">U</div>`;
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

function onAdTypeChange() {
  const typeSelect = document.getElementById('ad-type');
  if (!typeSelect) return;
  const val = typeSelect.value;

  const mediaContainer = document.getElementById('container-media-url');
  const appContainer = document.getElementById('container-app-url');
  const gameContainer = document.getElementById('container-game-url');

  if (mediaContainer) mediaContainer.classList.add('hidden');
  if (appContainer) appContainer.classList.add('hidden');
  if (gameContainer) gameContainer.classList.add('hidden');

  if (val === 'image' || val === 'video') {
    if (mediaContainer) mediaContainer.classList.remove('hidden');
  } else if (val === 'app') {
    if (appContainer) appContainer.classList.remove('hidden');
  } else if (val === 'game') {
    if (gameContainer) gameContainer.classList.remove('hidden');
  }
}
window.onAdTypeChange = onAdTypeChange;

function closeVideoAd() {
  const vAd = document.getElementById('video-popup-ad');
  if (vAd) vAd.classList.add('hidden');
}
window.closeVideoAd = closeVideoAd;

function renderLinks(links) {
  const container = document.getElementById('links-list');
  if (!container) return;
  if (!links || links.length === 0) {
    container.innerHTML = `<p style="text-align:center; padding:10px;">لا توجد روابط حتى الآن.</p>`;
    return;
  }
  container.innerHTML = links.map(link => `
    <div class="link-item card" style="margin-bottom:10px; padding:10px;">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <strong style="font-size:13px; color:var(--text);">${escapeHTML(link.title || 'بدون عنوان')}</strong>
        <span style="font-size:11px; color:var(--accent);">👁️ ${link.views || 0}</span>
      </div>
      <div style="margin: 6px 0; font-size:11px; word-break:break-all;">
        <a href="${escapeHTML(link.shortUrl || link.url)}" target="_blank" style="color:var(--accent);">${escapeHTML(link.shortUrl || link.url)}</a>
      </div>
      <div style="display:flex; gap:6px;">
        <button class="btn-small" onclick="window.copyToClipboard('${escapeHTML(link.shortUrl || link.url)}')">نسخ</button>
        <button class="btn-small btn-danger" onclick="window.handleDeleteLink('${link.id || link._id}')">حذف</button>
      </div>
    </div>
  `).join('');
}

function renderAds(ads) {
  const container = document.getElementById('ads-list');
  if (!container) return;
  if (!ads || ads.length === 0) {
    container.innerHTML = `<p style="text-align:center; padding:10px;">لا توجد حملات إعلانية.</p>`;
    return;
  }
  container.innerHTML = ads.map(ad => `
    <div class="card" style="margin-bottom:10px; padding:10px;">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <strong>${escapeHTML(ad.title)}</strong>
        <span class="badge">${escapeHTML(ad.status || 'نشط')}</span>
      </div>
      <div style="font-size:11px; color:var(--text-muted); margin-top:4px;">
        الميزانية: $${ad.budget} | المشاهدات: ${ad.impressions || 0}
      </div>
    </div>
  `).join('');
}

function renderWithdrawals(withdrawals) {
  const container = document.getElementById('withdraws-list');
  if (!container) return;
  if (!withdrawals || withdrawals.length === 0) {
    container.innerHTML = `<p style="text-align:center; padding:10px;">لا توجد طلبات سحب سابقة.</p>`;
    return;
  }
  container.innerHTML = withdrawals.map(w => `
    <div class="card" style="margin-bottom:8px; padding:8px 12px; display:flex; justify-content:space-between; align-items:center;">
      <div>
        <div><b>$${(w.amount || 0).toFixed(2)}</b></div>
        <small style="color:var(--text-muted);">${new Date(w.createdAt || Date.now()).toLocaleDateString()}</small>
      </div>
      <span class="badge ${w.status === 'approved' ? 'btn-success' : w.status === 'rejected' ? 'btn-danger' : 'btn-warning'}">${escapeHTML(w.status)}</span>
    </div>
  `).join('');
}

function renderReferrals(refs) {
  const container = document.getElementById('ref-list');
  if (!container) return;
  if (!refs || refs.length === 0) {
    container.innerHTML = `<p style="text-align:center; padding:10px;">لا يوجد إحالات مسجلة عبر رابطك.</p>`;
    return;
  }
  container.innerHTML = refs.map(r => `
    <div class="card" style="margin-bottom:8px; padding:8px 12px; display:flex; justify-content:space-between; align-items:center;">
      <span>${escapeHTML(r.name || r.username || 'مستخدم')}</span>
      <small style="color:var(--success);">+$${(r.earned || 0).toFixed(2)}</small>
    </div>
  `).join('');
}

window.UI = {
  escapeHTML,
  triggerHaptic,
  showToast,
  copyToClipboard,
  setButtonLoading,
  switchTab,
  handleNetworkChange,
  switchWalletView,
  toggleInstructionsModal,
  updateWithdrawCalculations,
  renderTelegramUser,
  shareReferralLink,
  toggleWalletEdit,
  onAdTypeChange,
  closeVideoAd,
  renderLinks,
  renderAds,
  renderWithdrawals,
  renderReferrals
};
