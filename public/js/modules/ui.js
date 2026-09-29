// public/js/modules/ui.js
// Telega.ads - UI Management Module (ES Module)

import i18n from './i18n.js';

export const UI = {
  currentLang: localStorage.getItem('appLang') || 'ar',

  escapeHTML: function(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },

  triggerHaptic: function(style = 'light') {
    try {
      const tg = window.Telegram?.WebApp;
      if (tg && tg.isVersionAtLeast && tg.isVersionAtLeast('6.1') && tg.HapticFeedback) {
        tg.HapticFeedback.impactOccurred(style);
      }
    } catch (e) {
      console.warn('Haptic feedback error:', e);
    }
  },

  showToast: function(msg) {
    this.triggerHaptic('medium');
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.innerText = msg;
    toast.classList.add("show");
    setTimeout(() => { toast.classList.remove("show"); }, 3200);
  },

  copyToClipboard: function(text) {
    if (!text) return;
    const lang = this.currentLang;
    navigator.clipboard.writeText(text).then(() => {
      this.showToast(lang === 'ar' ? "تم النسخ بنجاح!" : "Copied successfully!");
    }).catch(() => {
      this.showToast(lang === 'ar' ? "فشل النسخ تلقائياً" : "Failed to copy");
    });
  },

  setButtonLoading: function(btnId, isLoading, originalText) {
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
  },

  switchTab: function(tabName) {
    if (tabName === 'admin' && !window.isUserAdmin) {
      this.showToast(this.currentLang === 'ar' ? "غير مصرح لك بالوصول للوحة التحكم" : "Access denied");
      return;
    }
    this.triggerHaptic('light');
    const tabs = ['dashboard', 'wallet', 'ads', 'referral', 'settings', 'admin'];
    tabs.forEach(t => {
      const content = document.getElementById(`tab-content-${t}`);
      const btn = document.getElementById(`tab-btn-${t}`);
      if (content) content.classList.toggle('hidden', t !== tabName);
      if (btn) btn.classList.toggle('active', t === tabName);
    });

    if (tabName === 'admin' && window.isUserAdmin && typeof window.AdminModule?.loadAdminData === 'function') {
      window.AdminModule.loadAdminData();
    } else if (tabName === 'ads' && typeof window.AdsModule?.fetchUserAds === 'function') {
      window.AdsModule.fetchUserAds();
    } else if (tabName === 'referral' && typeof window.WalletModule?.fetchUserReferrals === 'function') {
      window.WalletModule.fetchUserReferrals();
    }
  },

  handleNetworkChange: function(networkVal) {
    this.triggerHaptic('light');
    const trcCard = document.getElementById('card-addr-trc20');
    const bepCard = document.getElementById('card-addr-bep20');

    if (trcCard) trcCard.classList.add('hidden');
    if (bepCard) bepCard.classList.add('hidden');

    if (networkVal === 'TRC20' && trcCard) {
      trcCard.classList.remove('hidden');
    } else if (networkVal === 'BEP20' && bepCard) {
      bepCard.classList.remove('hidden');
    }
  },

  switchWalletView: function(view) {
    this.triggerHaptic('light');
    const navDep = document.getElementById('wallet-nav-deposit');
    const navWith = document.getElementById('wallet-nav-withdraw');
    const viewDep = document.getElementById('wallet-view-deposit');
    const viewWith = document.getElementById('wallet-view-withdraw');

    if (navDep) navDep.classList.toggle('active', view === 'deposit');
    if (navWith) navWith.classList.toggle('active', view === 'withdraw');

    if (viewDep) viewDep.classList.toggle('hidden', view !== 'deposit');
    if (viewWith) viewWith.classList.toggle('hidden', view !== 'withdraw');
  },

  toggleInstructionsModal: function(show) {
    this.triggerHaptic('medium');
    const modal = document.getElementById('instructions-modal');
    if (modal) modal.classList.toggle('hidden', !show);
  },

  updateWithdrawCalculations: function() {
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
  },

  renderTelegramUser: function() {
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
          avatarContainer.innerHTML = `<img src="${this.escapeHTML(u.photo_url)}" class="user-avatar-img" alt="Avatar">`;
        } else {
          const letter = (u.first_name || 'U').charAt(0).toUpperCase();
          avatarContainer.innerHTML = `<div class="user-avatar-placeholder">${this.escapeHTML(letter)}</div>`;
        }
      }

      const savedLang = localStorage.getItem('appLang');
      if (savedLang) {
        this.currentLang = savedLang;
      } else if (u.language_code) {
        this.currentLang = u.language_code === 'ar' ? 'ar' : 'en';
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

    if (typeof window.applyLanguage === 'function') {
      window.applyLanguage(this.currentLang);
    }
  },

  shareReferralLink: function() {
    const refInput = document.getElementById('ref-link');
    if (!refInput) return;
    const refUrl = refInput.value;
    if (!refUrl) return;
    this.triggerHaptic('medium');
    const tg = window.Telegram?.WebApp;
    const shareText = encodeURIComponent(this.currentLang === 'ar' ? "انضم إليّ في أفضل منصة لاختصار الروابط واكسب الأرباح بسهولة! 🚀" : "Join me on the best url shortener platform & earn money! 🚀");
    const url = `https://t.me/share/url?url=${encodeURIComponent(refUrl)}&text=${shareText}`;
    
    if (tg && tg.openTelegramLink) {
      tg.openTelegramLink(url);
    } else {
      window.open(url, '_blank');
    }
  },

  toggleWalletEdit: function() {
    this.triggerHaptic('light');
    const walletInput = document.getElementById('default-wallet');
    const editBtn = document.getElementById('edit-wallet-btn');
    const saveBtn = document.getElementById('save-wallet-btn');
    if (!walletInput || !editBtn) return;

    if (walletInput.hasAttribute('readonly')) {
      walletInput.removeAttribute('readonly');
      walletInput.focus();
      editBtn.innerText = this.currentLang === 'ar' ? 'إلغاء' : 'Cancel';
      editBtn.className = "btn-small btn-danger";
      if (saveBtn) saveBtn.classList.remove('hidden');
    } else {
      walletInput.setAttribute('readonly', 'readonly');
      editBtn.innerText = this.currentLang === 'ar' ? 'تعديل' : 'Edit';
      editBtn.className = "btn-small btn-warning";
      if (saveBtn) saveBtn.classList.add('hidden');
    }
  },

  closeVideoAd: function() {
    const vAd = document.getElementById('video-popup-ad');
    if (vAd) vAd.classList.add('hidden');
  },

  adaptBridgeUI: function(targetUrl, linkTitle) {
    const vMode = document.getElementById('bridge-video-mode');
    const aMode = document.getElementById('bridge-app-mode');
    const gMode = document.getElementById('bridge-general-mode');
    const goBtnText = document.getElementById('go-btn-text');

    if (!targetUrl) return;
    const urlLower = targetUrl.toLowerCase();

    const isVideo = /(youtube\.com|youtu\.be|vimeo\.com|tiktok\.com|dailymotion\.com|\.mp4|\.m3u8|\.webm|video)/i.test(urlLower);
    const isApp = /(play\.google\.com|apps\.apple\.com|\.apk|mediafire\.com|mega\.nz|drive\.google\.com|app|game|download)/i.test(urlLower) && !isVideo;

    if (vMode) vMode.classList.add('hidden');
    if (aMode) aMode.classList.add('hidden');
    if (gMode) gMode.classList.add('hidden');

    if (isVideo) {
      if (vMode) vMode.classList.remove('hidden');
      const vTitle = document.getElementById('video-title-display');
      if (vTitle && linkTitle) vTitle.innerText = linkTitle;
      if (goBtnText) goBtnText.innerText = '▶ مشاهدة الفيديو الآن';
    } else if (isApp) {
      if (aMode) aMode.classList.remove('hidden');
      const aTitle = document.getElementById('app-title-display');
      if (aTitle && linkTitle) aTitle.innerText = linkTitle;
      if (goBtnText) goBtnText.innerText = '🚀 تحميل التطبيق / انتقال';
    } else {
      if (gMode) gMode.classList.remove('hidden');
      if (goBtnText) goBtnText.innerText = 'الانتقال إلى الرابط الأصلي';
    }
  }
};

window.UI = UI;
window.escapeHTML = UI.escapeHTML.bind(UI);
window.triggerHaptic = UI.triggerHaptic.bind(UI);
window.showToast = UI.showToast.bind(UI);
window.copyToClipboard = UI.copyToClipboard.bind(UI);
window.setButtonLoading = UI.setButtonLoading.bind(UI);
window.switchTab = UI.switchTab.bind(UI);
window.handleNetworkChange = UI.handleNetworkChange.bind(UI);
window.switchWalletView = UI.switchWalletView.bind(UI);
window.toggleInstructionsModal = UI.toggleInstructionsModal.bind(UI);
window.updateWithdrawCalculations = UI.updateWithdrawCalculations.bind(UI);
window.renderTelegramUser = UI.renderTelegramUser.bind(UI);
window.shareReferralLink = UI.shareReferralLink.bind(UI);
window.toggleWalletEdit = UI.toggleWalletEdit.bind(UI);
window.closeVideoAd = UI.closeVideoAd.bind(UI);
window.adaptBridgeUI = UI.adaptBridgeUI.bind(UI);

export default UI;
