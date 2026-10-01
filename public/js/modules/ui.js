// public/js/modules/ui.js - UI Management Module

const API = typeof require !== 'undefined' ? require('./api.js') : (typeof window !== 'undefined' ? (window.API || {}) : {});

const UI = {
  currentLang: (function() {
    try {
      return (typeof localStorage !== 'undefined' && localStorage.getItem('appLang')) || 'ar';
    } catch (e) {
      return 'ar';
    }
  })(),

  toastTimeout: null,

  // --- 1. HTML Escaping & Haptics ---
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
      if (typeof window === 'undefined') return;
      const tg = window.Telegram?.WebApp;
      if (tg && tg.isVersionAtLeast && tg.isVersionAtLeast('6.1') && tg.HapticFeedback) {
        if (style === 'error' || style === 'warning') {
          tg.HapticFeedback.notificationOccurred(style);
        } else {
          tg.HapticFeedback.impactOccurred(style);
        }
      }
    } catch (e) {
      console.warn('[Haptic Error]:', e);
    }
  },

  // --- 2. Toast Notifications & Clipboard ---
  showToast: function(msg, type = 'info') {
    this.triggerHaptic(type === 'error' ? 'error' : 'medium');
    if (typeof document === 'undefined') return;

    const toast = document.getElementById("toast");
    if (!toast) {
      console.log(`[Toast ${type}]: ${msg}`);
      return;
    }

    toast.innerText = msg;
    toast.className = `toast show ${type}`;

    if (this.toastTimeout) {
      clearTimeout(this.toastTimeout);
    }

    this.toastTimeout = setTimeout(() => { 
      toast.classList.remove("show"); 
    }, 3200);
  },

  copyToClipboard: function(text) {
    if (!text) return;
    const lang = this.currentLang;
    const successMsg = lang === 'ar' ? "تم النسخ بنجاح!" : "Copied successfully!";
    const errorMsg = lang === 'ar' ? "فشل النسخ تلقائياً" : "Failed to copy";

    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        this.showToast(successMsg, 'success');
      }).catch(() => {
        this.fallbackCopyText(text, successMsg, errorMsg);
      });
    } else {
      this.fallbackCopyText(text, successMsg, errorMsg);
    }
  },

  fallbackCopyText: function(text, successMsg, errorMsg) {
    try {
      if (typeof document === 'undefined') return;
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.left = "-999999px";
      textArea.style.top = "-999999px";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      if (successful) {
        this.showToast(successMsg, 'success');
      } else {
        this.showToast(errorMsg, 'error');
      }
    } catch (err) {
      this.showToast(errorMsg, 'error');
    }
  },

  // --- 3. Loaders, Skeletons & Button States ---
  showLoading: function(containerId) {
    if (typeof document === 'undefined') return;
    const el = document.getElementById(containerId);
    if (!el) return;
    if (!el.dataset.oldHtml) {
      el.dataset.oldHtml = el.innerHTML;
    }
    el.innerHTML = `
      <div class="loader-container" style="display:flex; justify-content:center; align-items:center; padding:20px;">
        <div class="spinner" style="border: 3px solid rgba(255,255,255,0.1); border-top: 3px solid var(--primary-color, #3b82f6); border-radius: 50%; width: 24px; height: 24px; animation: spin 0.8s linear infinite;"></div>
      </div>
    `;
  },

  hideLoading: function(containerId) {
    if (typeof document === 'undefined') return;
    const el = document.getElementById(containerId);
    if (!el) return;
    if (el.dataset.oldHtml !== undefined) {
      el.innerHTML = el.dataset.oldHtml;
      delete el.dataset.oldHtml;
    }
  },

  showSkeleton: function(containerId, count = 3) {
    if (typeof document === 'undefined') return;
    const container = document.getElementById(containerId);
    if (!container) return;
    let skeletonHTML = '';
    for (let i = 0; i < count; i++) {
      skeletonHTML += `
        <div class="skeleton-card" style="background: rgba(255,255,255,0.05); padding: 12px; border-radius: 8px; margin-bottom: 8px; animation: pulse 1.5s infinite ease-in-out;">
          <div style="height: 14px; background: rgba(255,255,255,0.1); border-radius: 4px; width: 60%; margin-bottom: 8px;"></div>
          <div style="height: 10px; background: rgba(255,255,255,0.08); border-radius: 4px; width: 90%;"></div>
        </div>
      `;
    }
    container.innerHTML = skeletonHTML;
  },

  setButtonLoading: function(btnId, isLoading, originalText) {
    if (typeof document === 'undefined') return;
    const btn = document.getElementById(btnId);
    if (!btn) return;
    if (isLoading) {
      btn.disabled = true;
      if (!btn.dataset.oldContent) {
        btn.dataset.oldContent = btn.innerHTML;
      }
      btn.innerHTML = `<div class="spinner" style="display:inline-block; border: 2px solid rgba(255,255,255,0.2); border-top: 2px solid #fff; border-radius: 50%; width: 14px; height: 14px; animation: spin 0.8s linear infinite;"></div>`;
    } else {
      btn.disabled = false;
      btn.innerHTML = originalText || btn.dataset.oldContent || '';
      delete btn.dataset.oldContent;
    }
  },

  // --- 4. Modal Management ---
  showModal: function(modalId) {
    this.triggerHaptic('medium');
    if (typeof document === 'undefined') return;
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove('hidden');
      modal.style.display = 'flex';
    }
  },

  closeModal: function(modalId) {
    this.triggerHaptic('light');
    if (typeof document === 'undefined') return;
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.add('hidden');
      modal.style.display = 'none';
    }
  },

  toggleInstructionsModal: function(show) {
    if (show) {
      this.showModal('instructions-modal');
    } else {
      this.closeModal('instructions-modal');
    }
  },

  // --- 5. Navigation & View Handlers ---
  switchTab: function(tabName) {
    if (tabName === 'admin' && typeof window !== 'undefined' && !window.isUserAdmin) {
      this.showToast(this.currentLang === 'ar' ? "غير مصرح لك بالوصول للوحة التحكم" : "Access denied", 'error');
      return;
    }
    this.triggerHaptic('light');
    if (typeof document === 'undefined') return;

    const tabs = ['dashboard', 'wallet', 'ads', 'referral', 'settings', 'admin'];
    tabs.forEach(t => {
      const content = document.getElementById(`tab-content-${t}`);
      const btn = document.getElementById(`tab-btn-${t}`);
      if (content) content.classList.toggle('hidden', t !== tabName);
      if (btn) btn.classList.toggle('active', t === tabName);
    });

    if (typeof window !== 'undefined') {
      if (tabName === 'admin' && window.isUserAdmin && typeof window.loadAdminData === 'function') {
        window.loadAdminData();
      } else if (tabName === 'ads' && typeof window.fetchUserAds === 'function') {
        window.fetchUserAds();
      } else if (tabName === 'referral' && typeof window.fetchUserReferrals === 'function') {
        window.fetchUserReferrals();
      }
    }
  },

  handleNetworkChange: function(networkVal) {
    this.triggerHaptic('light');
    if (typeof document === 'undefined') return;

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
    if (typeof document === 'undefined') return;

    const navDep = document.getElementById('wallet-nav-deposit');
    const navWith = document.getElementById('wallet-nav-withdraw');
    const viewDep = document.getElementById('wallet-view-deposit');
    const viewWith = document.getElementById('wallet-view-withdraw');

    if (navDep) navDep.classList.toggle('active', view === 'deposit');
    if (navWith) navWith.classList.toggle('active', view === 'withdraw');

    if (viewDep) viewDep.classList.toggle('hidden', view !== 'deposit');
    if (viewWith) viewWith.classList.toggle('hidden', view !== 'withdraw');
  },

  updateWithdrawCalculations: function() {
    if (typeof document === 'undefined') return;
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

  // --- 6. Telegram User Integration ---
  renderTelegramUser: function() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    const tg = window.Telegram?.WebApp;
    if (tg) {
      try {
        tg.ready();
        tg.expand();
      } catch (e) {
        console.warn('[Telegram WebApp Ready Error]:', e);
      }
    }

    const u = tg?.initDataUnsafe?.user;
    const avatarContainer = document.getElementById('user-avatar-container');
    const nameElem = document.getElementById('user-display-name');
    const handleElem = document.getElementById('user-display-handle');
    const idElem = document.getElementById('user-tg-id');
    const premiumBadge = document.getElementById('user-premium-badge');

    if (u && u.id) {
      window.currentUserTelegramId = String(u.id);
      try {
        localStorage.setItem('telegramId', window.currentUserTelegramId);
      } catch (e) {}

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

      let savedLang = null;
      try {
        savedLang = localStorage.getItem('appLang');
      } catch (e) {}

      if (savedLang) {
        this.currentLang = savedLang;
      } else if (u.language_code) {
        this.currentLang = u.language_code === 'ar' ? 'ar' : 'en';
      }
    } else {
      if (!window.currentUserTelegramId) {
        let storedId = null;
        try {
          storedId = localStorage.getItem('telegramId');
        } catch (e) {}
        window.currentUserTelegramId = storedId || '123456789';
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
    if (typeof document === 'undefined') return;
    const refInput = document.getElementById('ref-link');
    if (!refInput) return;
    const refUrl = refInput.value;
    if (!refUrl) return;

    this.triggerHaptic('medium');
    const tg = typeof window !== 'undefined' ? window.Telegram?.WebApp : null;
    const shareText = encodeURIComponent(
      this.currentLang === 'ar'
        ? "انضم إليّ في أفضل منصة لاختصار الروابط واكسب الأرباح بسهولة! 🚀"
        : "Join me on the best url shortener platform & earn money! 🚀"
    );
    const url = `https://t.me/share/url?url=${encodeURIComponent(refUrl)}&text=${shareText}`;

    if (tg && tg.openTelegramLink) {
      tg.openTelegramLink(url);
    } else if (typeof window !== 'undefined') {
      window.open(url, '_blank');
    }
  },

  toggleWalletEdit: function() {
    this.triggerHaptic('light');
    if (typeof document === 'undefined') return;

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
    if (typeof document === 'undefined') return;
    const vAd = document.getElementById('video-popup-ad');
    if (vAd) vAd.classList.add('hidden');
  },

  adaptBridgeUI: function(targetUrl, linkTitle) {
    if (typeof document === 'undefined') return;

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
  },

  renderLinksList: function(links) {
    if (typeof document === 'undefined') return;
    const container = document.getElementById('links-list');
    if (!container) return;

    if (!links || links.length === 0) {
      container.innerHTML = `<p style="text-align:center; padding: 10px; color: var(--text-muted);">${this.currentLang === 'ar' ? 'لا توجد روابط حالياً' : 'No links found'}</p>`;
      return;
    }

    const apiBase = (typeof window !== 'undefined' && window.API_BASE) || API.API_BASE || '';
    let html = '';

    links.forEach(link => {
      const shortUrl = `${apiBase}/r/${link.code || link.shortCode}`;
      const linkId = link._id || link.code || '';
      html += `
        <div class="link-card" style="background: rgba(15,23,42,0.6); padding: 10px; border-radius: 10px; margin-bottom: 8px; border: 1px solid var(--card-border);">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <strong style="color:#fff; font-size:13px;">${this.escapeHTML(link.title || link.code || link.shortCode)}</strong>
            <span style="font-size:10px; color:var(--text-muted);">👁️ ${link.clicks || link.views || 0}</span>
          </div>
          <div style="display:flex; gap:6px; align-items:center; margin-top:6px;">
            <input type="text" value="${shortUrl}" readonly style="margin:0; font-size:11px; padding:4px 8px;">
            <button class="btn-small" onclick="window.UI.copyToClipboard('${shortUrl}')">${this.currentLang === 'ar' ? 'نسخ' : 'Copy'}</button>
            <button class="btn-small btn-danger" onclick="window.ShortenerModule ? window.ShortenerModule.deleteLink('${linkId}') : null">✕</button>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
  },

  // --- 7. UI Module Initialization ---
  init: function() {
    this.renderTelegramUser();
  }
};

// ربط جميع الدوال بالنطاق العالمي (window) للأمان والتوافقية مع الأحداث المباشرة من HTML
if (typeof window !== 'undefined') {
  window.UI = UI;
  window.escapeHTML = UI.escapeHTML.bind(UI);
  window.triggerHaptic = UI.triggerHaptic.bind(UI);
  window.showToast = UI.showToast.bind(UI);
  window.copyToClipboard = UI.copyToClipboard.bind(UI);
  window.showLoading = UI.showLoading.bind(UI);
  window.hideLoading = UI.hideLoading.bind(UI);
  window.showSkeleton = UI.showSkeleton.bind(UI);
  window.setButtonLoading = UI.setButtonLoading.bind(UI);
  window.showModal = UI.showModal.bind(UI);
  window.closeModal = UI.closeModal.bind(UI);
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
  window.renderLinksList = UI.renderLinksList.bind(UI);
}

// التصدير بنظام CommonJS
if (typeof module !== 'undefined' && module.exports) {
  module.exports = UI;
}
