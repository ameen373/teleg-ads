/**
 * Main Frontend Application Engine
 * Unified, Secure & Production-Ready (User Scope)
 */

(() => {
  'use strict';

  const API_BASE = window.location.protocol.startsWith('file') 
    ? 'http://localhost:3000' 
    : window.location.origin;

  let authToken = localStorage.getItem('token') || null;
  let userData = null;
  let appConfig = {
    botUsername: '@Ads_telegabot',
    supportUsername: '@Te_AdsNs_bot',
    botUrl: 'https://t.me/Ads_telegabot',
    officialChannelUrl: 'https://t.me/ttelega_ads',
    supportUrl: 'https://t.me/Te_AdsNs_bot',
    depositWallets: {
      bep20: '',
      trc20: ''
    }
  };

  // ==========================================
  // 1. Core API Request Helper
  // ==========================================
  async function fetchWithAuth(endpoint, options = {}) {
    try {
      const headers = options.headers || {};
      
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }
      
      if (window.Telegram?.WebApp?.initData) {
        headers['x-telegram-init-data'] = window.Telegram.WebApp.initData;
      }
      
      if (!headers['Content-Type'] && !(options.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
      }

      const config = {
        ...options,
        headers
      };

      const response = await fetch(`${API_BASE}${endpoint}`, config);
      const data = await response.json().catch(() => ({}));
      
      if (response.status === 401 || response.status === 403) {
        if (data.error && data.error.includes('banned')) {
          showToast('حسابك محظور. يرجى التواصل مع الدعم الفني.', 'error');
        }
      }
      
      return { ok: response.ok, status: response.status, data };
    } catch (error) {
      console.error('User API Request Error:', error);
      return { ok: false, status: 500, data: { success: false, error: 'تعذر الاتصال بالخادم. تحقق من اتصالك بالإنترنت.' } };
    }
  }

  // ==========================================
  // 2. UI Notifications (Toast)
  // ==========================================
  function showToast(message, type = 'info') {
    try {
      let toastContainer = document.getElementById('toast-container');
      if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toast-container';
        toastContainer.style.cssText = `
          position: fixed;
          top: 20px;
          right: 50%;
          transform: translateX(50%);
          z-index: 9999;
          display: flex;
          flex-direction: column;
          gap: 10px;
          pointer-events: none;
          width: 90%;
          max-width: 400px;
        `;
        document.body.appendChild(toastContainer);
      }

      const toast = document.createElement('div');
      const bgColor = type === 'error' ? '#ef4444' : type === 'success' ? '#10b981' : '#3b82f6';
      
      toast.style.cssText = `
        background: ${bgColor};
        color: #ffffff;
        padding: 12px 16px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 500;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        opacity: 0;
        transform: translateY(-20px);
        transition: all 0.3s ease;
        text-align: center;
        pointer-events: auto;
      `;
      
      toast.innerText = message;
      toastContainer.appendChild(toast);

      requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
      });

      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-20px)';
        setTimeout(() => toast.remove(), 300);
      }, 3500);
    } catch (err) {
      console.error('Error showing toast:', err);
    }
  }

  // ==========================================
  // 3. Authentication & Startup Handler
  // ==========================================
  async function initApp() {
    try {
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.ready();
        window.Telegram.WebApp.expand();
      }

      const initData = window.Telegram?.WebApp?.initData || '';
      
      const res = await fetchWithAuth('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ initData })
      });

      if (res.ok && res.data.success) {
        authToken = res.data.token;
        localStorage.setItem('token', authToken);
        
        if (res.data.botUsername) appConfig.botUsername = res.data.botUsername;
        if (res.data.supportUsername) appConfig.supportUsername = res.data.supportUsername;
        if (res.data.botUrl) appConfig.botUrl = res.data.botUrl;
        if (res.data.officialChannelUrl) appConfig.officialChannelUrl = res.data.officialChannelUrl;
        if (res.data.supportUrl) appConfig.supportUrl = res.data.supportUrl;
        if (res.data.depositWallets) appConfig.depositWallets = res.data.depositWallets;

        await loadUserData();
      } else {
        showToast(res.data?.error || 'تعذر تسجيل الدخول التلقائي، يتم التحميل كزائر.', 'error');
        renderHeaderInfo();
      }
    } catch (err) {
      console.error('Initialization error:', err);
      renderHeaderInfo();
    }
  }

  // ==========================================
  // 4. Load User Data & Render Dashboard
  // ==========================================
  async function loadUserData() {
    try {
      const res = await fetchWithAuth('/api/user/data');
      if (res.ok && res.data.success) {
        userData = res.data.user;
        
        if (res.data.depositWallets) appConfig.depositWallets = res.data.depositWallets;
        
        renderHeaderInfo();
        renderLinksList(res.data.links || []);
        renderWithdrawsList(res.data.withdraws || []);
        renderAdsList(res.data.ads || []);
        renderDepositsList(res.data.deposits || []);
        renderAnnouncements(res.data.announcements || []);
        
        checkAdminAccess(res.data.isAdmin);
      } else {
        showToast('تعذر تحميل بيانات حسابك.', 'error');
        renderHeaderInfo();
      }
    } catch (err) {
      console.error('Error loading user data:', err);
    }
  }

  function checkAdminAccess(isAdmin) {
    const adminBtn = document.getElementById('admin-panel-btn');
    const adminTab = document.getElementById('nav-admin');
    
    if (isAdmin) {
      if (adminBtn) adminBtn.style.display = 'flex';
      if (adminTab) adminTab.style.display = 'flex';
    } else {
      if (adminBtn) adminBtn.style.display = 'none';
      if (adminTab) adminTab.style.display = 'none';
    }
  }

  function renderHeaderInfo() {
    try {
      const balanceEl = document.getElementById('user-balance');
      const pendingEl = document.getElementById('user-pending');
      const usernameEl = document.getElementById('user-name');
      const refLinkEl = document.getElementById('referral-link');

      const availableBalance = userData?.availableBalance || 0;
      const pendingBalance = userData?.pendingBalance || 0;
      const username = userData?.username || (userData?.telegramId ? `User_${userData.telegramId}` : 'ضيف');

      if (balanceEl) balanceEl.innerText = `$${availableBalance.toFixed(4)}`;
      if (pendingEl) pendingEl.innerText = `$${pendingBalance.toFixed(4)}`;
      if (usernameEl) usernameEl.innerText = username;
      
      if (refLinkEl && userData) {
        const refUrl = `${appConfig.botUrl}?start=ref_${userData._id}`;
        refLinkEl.value = refUrl;
      }
      
      const walletInput = document.getElementById('setting-wallet');
      if (walletInput && userData?.defaultWallet) {
        walletInput.value = userData.defaultWallet;
      }
    } catch (err) {
      console.error('Error rendering header info:', err);
    }
  }

  // ==========================================
  // 5. Links Operations
  // ==========================================
  async function createShortLink() {
    try {
      const urlInput = document.getElementById('link-url-input');
      const titleInput = document.getElementById('link-title-input');
      const createBtn = document.getElementById('create-link-btn');

      const targetUrl = urlInput?.value?.trim();
      const title = titleInput?.value?.trim();

      if (!targetUrl) {
        showToast('يرجى أدخال الرابط المراد اختصاره', 'error');
        return;
      }

      if (createBtn) createBtn.disabled = true;

      const res = await fetchWithAuth('/api/links', {
        method: 'POST',
        body: JSON.stringify({ targetUrl, title })
      });

      if (createBtn) createBtn.disabled = false;

      if (res.ok && res.data.success) {
        showToast('تم إنشاء الرابط بنجاح!', 'success');
        if (urlInput) urlInput.value = '';
        if (titleInput) titleInput.value = '';
        loadUserData();
      } else {
        showToast(res.data?.error || 'حدث خطأ أثناء إنشاء الرابط.', 'error');
      }
    } catch (err) {
      console.error('Error creating short link:', err);
    }
  }

  function renderLinksList(links) {
    const container = document.getElementById('links-container');
    if (!container) return;

    if (!Array.isArray(links) || links.length === 0) {
      container.innerHTML = '<div class="empty-state">لا توجد روابط اختصار حتى الآن.</div>';
      return;
    }

    container.innerHTML = links.map(link => `
      <div class="card link-card">
        <div class="link-header">
          <span class="link-title">${escapeHtml(link.title || 'رابط بدون عنوان')}</span>
          <button class="status-badge ${link.isActive ? 'active' : 'paused'}" onclick="window.appEngine.toggleLinkStatus('${link._id}')">
            ${link.isActive ? 'نشط' : 'متوقف'}
          </button>
        </div>
        <div class="link-url-box">
          <input type="text" readonly value="${escapeHtml(link.shortUrl)}" id="short-${link._id}">
          <button onclick="window.appEngine.copyToClipboard('short-${link._id}')">نسخ</button>
        </div>
        <div class="link-stats">
          <span>الزيارات: <b>${link.views || 0}</b></span>
          <span>الشرعية: <b>${link.validImpressions || 0}</b></span>
          <span>CTR: <b>${link.ctr || '0.0'}%</b></span>
        </div>
      </div>
    `).join('');
  }

  async function toggleLinkStatus(linkId) {
    try {
      const res = await fetchWithAuth('/api/links/toggle', {
        method: 'POST',
        body: JSON.stringify({ linkId })
      });

      if (res.ok && res.data.success) {
        showToast('تم تغيير حالة الرابط', 'success');
        loadUserData();
      } else {
        showToast(res.data?.error || 'فشل تغيير حالة الرابط.', 'error');
      }
    } catch (err) {
      console.error('Error toggling link status:', err);
    }
  }

  // ==========================================
  // 6. Advertising Campaigns Operations
  // ==========================================
  async function createAdCampaign() {
    try {
      const titleInput = document.getElementById('ad-title-input');
      const urlInput = document.getElementById('ad-url-input');
      const budgetInput = document.getElementById('ad-budget-input');
      const btn = document.getElementById('create-ad-btn');

      const title = titleInput?.value?.trim();
      const targetUrl = urlInput?.value?.trim();
      const totalBudget = parseFloat(budgetInput?.value);

      if (!title || !targetUrl || isNaN(totalBudget)) {
        showToast('يرجى ملء جميع الحقول بشكل صحيح', 'error');
        return;
      }

      if (totalBudget < 5) {
        showToast('الحد الأدنى لميزانية الحملة هو $5', 'error');
        return;
      }

      if (btn) btn.disabled = true;

      const res = await fetchWithAuth('/api/ads', {
        method: 'POST',
        body: JSON.stringify({ title, targetUrl, totalBudget })
      });

      if (btn) btn.disabled = false;

      if (res.ok && res.data.success) {
        showToast('تم إطلاق الحملة الإعلانية بنجاح!', 'success');
        if (titleInput) titleInput.value = '';
        if (urlInput) urlInput.value = '';
        if (budgetInput) budgetInput.value = '';
        loadUserData();
      } else {
        showToast(res.data?.error || 'فشل إطلاق الحملة.', 'error');
      }
    } catch (err) {
      console.error('Error creating ad campaign:', err);
    }
  }

  function renderAdsList(ads) {
    const container = document.getElementById('ads-container');
    if (!container) return;

    if (!Array.isArray(ads) || ads.length === 0) {
      container.innerHTML = '<div class="empty-state">لا توجد حملات إعلانية حالية.</div>';
      return;
    }

    container.innerHTML = ads.map(ad => `
      <div class="card ad-card">
        <div class="ad-header">
          <span class="ad-title">${escapeHtml(ad.title)}</span>
          <button class="status-badge ${ad.status}" onclick="window.appEngine.toggleAdStatus('${ad._id}')">
            ${ad.status === 'active' ? 'نشطة' : ad.status === 'paused' ? 'متوقفة' : 'مكتملة'}
          </button>
        </div>
        <div class="ad-details">
          <div>الميزانية الكلية: <b>$${(ad.totalBudget || 0).toFixed(2)}</b></div>
          <div>المتبقي: <b>$${(ad.remainingBudget || 0).toFixed(2)}</b></div>
          <div>الظهور: <b>${ad.impressionsCount || 0}</b></div>
        </div>
      </div>
    `).join('');
  }

  async function toggleAdStatus(adId) {
    try {
      const res = await fetchWithAuth('/api/ads/toggle', {
        method: 'POST',
        body: JSON.stringify({ adId })
      });

      if (res.ok && res.data.success) {
        showToast('تم تحديث حالة الحملة', 'success');
        loadUserData();
      } else {
        showToast(res.data?.error || 'فشل تغيير حالة الحملة.', 'error');
      }
    } catch (err) {
      console.error('Error toggling ad status:', err);
    }
  }

  // ==========================================
  // 7. Deposit & Withdrawal Systems
  // ==========================================
  async function submitDepositRequest() {
    try {
      const amountInput = document.getElementById('deposit-amount');
      const networkSelect = document.getElementById('deposit-network');
      const txidInput = document.getElementById('deposit-txid');
      const btn = document.getElementById('submit-deposit-btn');

      const amount = parseFloat(amountInput?.value);
      const network = networkSelect?.value;
      const txid = txidInput?.value?.trim();

      if (isNaN(amount) || amount < 1) {
        showToast('الحد الأدنى للإيداع هو $1', 'error');
        return;
      }

      if (!txid) {
        showToast('يرجى إدخال رقم المعاملة (TxID)', 'error');
        return;
      }

      if (btn) btn.disabled = true;

      const res = await fetchWithAuth('/api/deposit', {
        method: 'POST',
        body: JSON.stringify({ amount, network, txid })
      });

      if (btn) btn.disabled = false;

      if (res.ok && res.data.success) {
        showToast('تم إرسال طلب الإيداع وهو قيد المراجعة الان.', 'success');
        if (amountInput) amountInput.value = '';
        if (txidInput) txidInput.value = '';
        loadUserData();
      } else {
        showToast(res.data?.error || 'فشل إرسال طلب الإيداع.', 'error');
      }
    } catch (err) {
      console.error('Error submitting deposit:', err);
    }
  }

  async function submitWithdrawRequest() {
    try {
      const amountInput = document.getElementById('withdraw-amount');
      const networkSelect = document.getElementById('withdraw-network');
      const walletInput = document.getElementById('withdraw-wallet');
      const btn = document.getElementById('submit-withdraw-btn');

      const amount = parseFloat(amountInput?.value);
      const network = networkSelect?.value;
      const walletAddress = walletInput?.value?.trim();

      if (isNaN(amount) || amount < 30) {
        showToast('الحد الأدنى للسحب هو $30', 'error');
        return;
      }

      if (!walletAddress) {
        showToast('يرجى أدخال عنوان المحفظة بشكل صحيح', 'error');
        return;
      }

      if (btn) btn.disabled = true;

      const res = await fetchWithAuth('/api/withdraw', {
        method: 'POST',
        body: JSON.stringify({ amount, network, walletAddress })
      });

      if (btn) btn.disabled = false;

      if (res.ok && res.data.success) {
        showToast('تم إرسال طلب السحب بنجاح!', 'success');
        if (amountInput) amountInput.value = '';
        loadUserData();
      } else {
        showToast(res.data?.error || 'فشل إرسال طلب السحب.', 'error');
      }
    } catch (err) {
      console.error('Error submitting withdraw:', err);
    }
  }

  function renderWithdrawsList(withdraws) {
    const container = document.getElementById('withdraws-container');
    if (!container) return;

    if (!Array.isArray(withdraws) || withdraws.length === 0) {
      container.innerHTML = '<div class="empty-state">لا توجد عمليات سحب سابقة.</div>';
      return;
    }

    container.innerHTML = withdraws.map(w => `
      <div class="transaction-item">
        <div>
          <div><b>$${(w.amount || 0).toFixed(2)}</b> (${escapeHtml(w.network || 'USDT')})</div>
          <small>${new Date(w.createdAt || Date.now()).toLocaleDateString('ar-EG')}</small>
        </div>
        <span class="status-badge ${w.status}">
          ${w.status === 'approved' ? 'مكتمل' : w.status === 'rejected' ? 'مرفوض' : 'قيد الانتظار'}
        </span>
      </div>
    `).join('');
  }

  function renderDepositsList(deposits) {
    const container = document.getElementById('deposits-container');
    if (!container) return;

    if (!Array.isArray(deposits) || deposits.length === 0) {
      container.innerHTML = '<div class="empty-state">لا توجد عمليات إيداع سابقة.</div>';
      return;
    }

    container.innerHTML = deposits.map(d => `
      <div class="transaction-item">
        <div>
          <div><b>$${(d.amount || 0).toFixed(2)}</b> (${escapeHtml(d.network || 'USDT')})</div>
          <small>${new Date(d.createdAt || Date.now()).toLocaleDateString('ar-EG')}</small>
        </div>
        <span class="status-badge ${d.status}">
          ${d.status === 'approved' ? 'مقبول' : d.status === 'rejected' ? 'مرفوض' : 'قيد الانتظار'}
        </span>
      </div>
    `).join('');
  }

  // ==========================================
  // 8. Settings & Utilities
  // ==========================================
  async function saveUserSettings() {
    try {
      const walletInput = document.getElementById('setting-wallet');
      const walletAddress = walletInput?.value?.trim();

      const res = await fetchWithAuth('/api/user/settings', {
        method: 'POST',
        body: JSON.stringify({ defaultWallet: walletAddress })
      });

      if (res.ok && res.data.success) {
        showToast('تم حفظ الإعدادات بنجاح', 'success');
        loadUserData();
      } else {
        showToast('فشل حفظ الإعدادات.', 'error');
      }
    } catch (err) {
      console.error('Error saving settings:', err);
    }
  }

  function renderAnnouncements(announcements) {
    const container = document.getElementById('announcements-container');
    if (!container) return;

    if (!Array.isArray(announcements) || announcements.length === 0) {
      container.style.display = 'none';
      return;
    }

    container.style.display = 'block';
    container.innerHTML = announcements.map(a => `
      <div class="announcement-banner">
        📢 <b>${escapeHtml(a.title)}</b>: ${escapeHtml(a.message)}
      </div>
    `).join('');
  }

  function copyToClipboard(elementId) {
    const input = document.getElementById(elementId);
    if (!input) return;

    input.select();
    input.setSelectionRange(0, 99999);

    if (navigator.clipboard) {
      navigator.clipboard.writeText(input.value).then(() => {
        showToast('تم النسخ إلى الحافظة!', 'success');
      }).catch(() => {
        document.execCommand('copy');
        showToast('تم النسخ إلى الحافظة!', 'success');
      });
    } else {
      document.execCommand('copy');
      showToast('تم النسخ إلى الحافظة!', 'success');
    }
  }

  function escapeHtml(text) {
    if (!text) return '';
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function switchTab(tabId) {
    const tabs = document.querySelectorAll('.tab-content');
    const navItems = document.querySelectorAll('.nav-item');

    tabs.forEach(tab => tab.classList.remove('active'));
    navItems.forEach(item => item.classList.remove('active'));

    const targetTab = document.getElementById(tabId);
    const targetNav = document.getElementById(`nav-${tabId}`);

    if (targetTab) targetTab.classList.add('active');
    if (targetNav) targetNav.classList.add('active');
  }

  function openAdminPanel() {
    window.location.href = '/admin';
  }

  // Bind methods to window under appEngine namespace
  window.appEngine = {
    initApp,
    createShortLink,
    toggleLinkStatus,
    createAdCampaign,
    toggleAdStatus,
    submitDepositRequest,
    submitWithdrawRequest,
    saveUserSettings,
    copyToClipboard,
    switchTab,
    openAdminPanel
  };

  // Expose global shorthand functions for inline onclick handlers
  window.switchTab = switchTab;
  window.openAdminPanel = openAdminPanel;
  window.copyToClipboard = copyToClipboard;
  window.toggleLinkStatus = toggleLinkStatus;
  window.toggleAdStatus = toggleAdStatus;

  // ==========================================
  // 9. Document DOM Ready Listener
  // ==========================================
  document.addEventListener('DOMContentLoaded', () => {
    // Check if user dashboard elements exist before initializing
    if (document.getElementById('user-balance') || document.getElementById('links-container')) {
      initApp();

      const networkSelect = document.getElementById('deposit-network');
      if (networkSelect) {
        networkSelect.addEventListener('change', (e) => {
          const walletBox = document.getElementById('deposit-address-display');
          const val = e.target.value;
          if (walletBox) {
            if (val === 'BEP20') walletBox.innerText = appConfig.depositWallets.bep20 || 'لم يتم تحديده';
            else if (val === 'TRC20') walletBox.innerText = appConfig.depositWallets.trc20 || 'لم يتم تحديده';
          }
        });
      }
    }
  });

})();
