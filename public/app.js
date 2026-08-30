/**
 * Main Frontend Application Engine
 * Next-Gen Ultra-Secure, Intelligent & Production-Ready (Telegram Mini App Scope)
 */

(() => {
  'use strict';

  // ==========================================
  // 0. Environment & State Management
  // ==========================================
  const API_BASE = window.location.protocol.startsWith('file') 
    ? 'http://localhost:3000' 
    : window.location.origin;

  const tg = window.Telegram?.WebApp;
  const currentTgUser = tg?.initDataUnsafe?.user || null;

  let authToken = localStorage.getItem('token') || localStorage.getItem('authToken') || null;
  let userData = null;
  let currentLang = localStorage.getItem('appLang') || (currentTgUser?.language_code === 'ar' ? 'ar' : 'en');

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
  // 1. Internationalization System (i18n)
  // ==========================================
  const i18n = {
    ar: {
      user_banned: "حسابك محظور. يرجى التواصل مع الدعم الفني.",
      network_error: "تعذر الاتصال بالخادم. تحقق من اتصالك بالإنترنت.",
      login_failed: "تعذر تسجيل الدخول التلقائي، يتم التحميل كزائر.",
      load_user_err: "تعذر تحميل بيانات حسابك.",
      enter_link_err: "يرجى إدخال الرابط المراد اختصاره بشكل صحيح",
      link_created: "تم إنشاء الرابط بنجاح!",
      link_toggle_ok: "تم تغيير حالة الرابط بنجاح",
      fill_ad_err: "يرجى ملء جميع الحقول بشكل صحيح",
      min_ad_budget: "الحد الأدنى لميزانية الحملة هو $5",
      ad_created: "تم إطلاق الحملة الإعلانية بنجاح!",
      ad_toggle_ok: "تم تحديث حالة الحملة الإعلانية",
      min_deposit_err: "الحد الأدنى للإيداع هو $1",
      enter_txid_err: "يرجى إدخال رقم المعاملة (TxID)",
      deposit_sent: "تم إرسال طلب الإيداع وهو قيد المراجعة الآن.",
      min_withdraw_err: "الحد الأدنى للسحب هو $30",
      enter_wallet_err: "يرجى إدخال عنوان المحفظة بشكل صحيح",
      withdraw_sent: "تم إرسال طلب السحب بنجاح!",
      settings_saved: "تم حفظ الإعدادات بنجاح",
      copied: "تم النسخ إلى الحافظة!",
      copy_failed: "فشل النسخ تلقائياً",
      status_active: "نشط",
      status_paused: "متوقف",
      status_completed: "مكتمل",
      status_approved: "مقبول",
      status_rejected: "مرفوض",
      status_pending: "قيد الانتظار",
      no_links: "لا توجد روابط اختصار حتى الآن.",
      no_ads: "لا توجد حملات إعلانية حالية.",
      no_withdraws: "لا توجد عمليات سحب سابقة.",
      no_deposits: "لا توجد عمليات إيداع سابقة.",
      untitled_link: "رابط بدون عنوان",
      guest: "ضيف",
      not_set: "لم يتم تحديده"
    },
    en: {
      user_banned: "Your account is banned. Please contact support.",
      network_error: "Network connection error. Please check your internet.",
      login_failed: "Automatic login failed, loading as guest.",
      load_user_err: "Failed to load your user data.",
      enter_link_err: "Please enter a valid URL to shorten.",
      link_created: "Short link created successfully!",
      link_toggle_ok: "Link status updated successfully.",
      fill_ad_err: "Please fill in all campaign fields correctly.",
      min_ad_budget: "Minimum ad campaign budget is $5",
      ad_created: "Ad campaign launched successfully!",
      ad_toggle_ok: "Ad campaign status updated.",
      min_deposit_err: "Minimum deposit amount is $1",
      enter_txid_err: "Please enter Transaction ID (TxID)",
      deposit_sent: "Deposit request submitted and currently under review.",
      min_withdraw_err: "Minimum withdrawal amount is $30",
      enter_wallet_err: "Please enter a valid wallet address",
      withdraw_sent: "Withdrawal request submitted successfully!",
      settings_saved: "Settings saved successfully",
      copied: "Copied to clipboard!",
      copy_failed: "Failed to copy automatically",
      status_active: "Active",
      status_paused: "Paused",
      status_completed: "Completed",
      status_approved: "Approved",
      status_rejected: "Rejected",
      status_pending: "Pending",
      no_links: "No short links found yet.",
      no_ads: "No active ad campaigns.",
      no_withdraws: "No withdrawal history.",
      no_deposits: "No deposit history.",
      untitled_link: "Untitled Link",
      guest: "Guest",
      not_set: "Not set"
    }
  };

  function getText(key) {
    return i18n[currentLang]?.[key] || i18n['ar'][key] || key;
  }

  function applyLanguage(lang) {
    currentLang = i18n[lang] ? lang : 'ar';
    localStorage.setItem('appLang', currentLang);
    document.documentElement.lang = currentLang;
    document.documentElement.dir = currentLang === 'ar' ? 'rtl' : 'ltr';
    document.body.style.direction = currentLang === 'ar' ? 'rtl' : 'ltr';

    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (i18n[currentLang][key]) el.innerText = i18n[currentLang][key];
    });

    document.querySelectorAll('[data-i18n-ph]').forEach(el => {
      const key = el.getAttribute('data-i18n-ph');
      if (i18n[currentLang][key]) el.placeholder = i18n[currentLang][key];
    });
  }

  // ==========================================
  // 2. Telegram Hardware & Haptic Engine
  // ==========================================
  function triggerHaptic(style = 'light') {
    try {
      if (tg?.isVersionAtLeast?.('6.1') && tg.HapticFeedback) {
        if (['light', 'medium', 'heavy', 'rigid', 'soft'].includes(style)) {
          tg.HapticFeedback.impactOccurred(style);
        } else if (['error', 'success', 'warning'].includes(style)) {
          tg.HapticFeedback.notificationOccurred(style);
        }
      }
    } catch (e) {
      console.warn('Haptic feedback unavailable:', e);
    }
  }

  // ==========================================
  // 3. UI Helpers (Toast & Loading States)
  // ==========================================
  function showToast(message, type = 'info') {
    triggerHaptic(type === 'error' ? 'error' : type === 'success' ? 'success' : 'light');
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

  function setButtonLoading(btn, isLoading, fallbackText = '') {
    const button = typeof btn === 'string' ? document.getElementById(btn) : btn;
    if (!button) return;

    if (isLoading) {
      button.disabled = true;
      button.dataset.originalText = button.innerHTML;
      button.innerHTML = '<span class="spinner" style="display:inline-block; width:14px; height:14px; border:2px solid #fff; border-top-color:transparent; border-radius:50%; animation:spin 0.6s linear infinite;"></span>';
    } else {
      button.disabled = false;
      button.innerHTML = fallbackText || button.dataset.originalText || '';
    }
  }

  // Inject CSS Keyframe for Spinner dynamically
  if (!document.getElementById('engine-dynamic-styles')) {
    const styleElem = document.createElement('style');
    styleElem.id = 'engine-dynamic-styles';
    styleElem.innerHTML = `@keyframes spin { to { transform: rotate(360deg); } }`;
    document.head.appendChild(styleElem);
  }

  // ==========================================
  // 4. Ultra-Secure API Core & Auto Re-Auth
  // ==========================================
  async function fetchWithAuth(endpoint, options = {}, isRetry = false) {
    try {
      const headers = options.headers || {};
      
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }
      
      if (tg?.initData) {
        headers['x-telegram-init-data'] = tg.initData;
      }
      
      if (!headers['Content-Type'] && !(options.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
      }

      const config = { ...options, headers };
      const response = await fetch(`${API_BASE}${endpoint}`, config);
      const data = await response.json().catch(() => ({}));
      
      if (response.status === 401 && !isRetry) {
        const relogged = await initApp(true);
        if (relogged) {
          return fetchWithAuth(endpoint, options, true);
        }
      }

      if (response.status === 403 || (response.status === 401 && data.error?.includes('banned'))) {
        showToast(getText('user_banned'), 'error');
      }
      
      return { ok: response.ok, status: response.status, data };
    } catch (error) {
      console.error('User API Request Error:', error);
      return { ok: false, status: 500, data: { success: false, error: getText('network_error') } };
    }
  }

  // ==========================================
  // 5. Authentication & Application Setup
  // ==========================================
  async function initApp(isSilentRetry = false) {
    try {
      if (tg) {
        tg.ready();
        tg.expand();
      }

      const startParam = tg?.initDataUnsafe?.start_param || null;
      const initData = tg?.initData || '';
      
      const res = await fetchWithAuth('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ 
          initData, 
          referrerId: startParam,
          telegramUserInfo: currentTgUser || {} 
        })
      });

      if (res.ok && res.data.success) {
        authToken = res.data.token;
        localStorage.setItem('token', authToken);
        localStorage.setItem('authToken', authToken);
        
        if (res.data.botUsername) appConfig.botUsername = res.data.botUsername;
        if (res.data.supportUsername) appConfig.supportUsername = res.data.supportUsername;
        if (res.data.botUrl) appConfig.botUrl = res.data.botUrl;
        if (res.data.officialChannelUrl) appConfig.officialChannelUrl = res.data.officialChannelUrl;
        if (res.data.supportUrl) appConfig.supportUrl = res.data.supportUrl;
        if (res.data.depositWallets) appConfig.depositWallets = res.data.depositWallets;

        if (!isSilentRetry) {
          applyLanguage(currentLang);
          await loadUserData();
        }
        return true;
      } else {
        if (!isSilentRetry) {
          showToast(res.data?.error || getText('login_failed'), 'error');
          applyLanguage(currentLang);
          renderHeaderInfo();
        }
        return false;
      }
    } catch (err) {
      console.error('Initialization error:', err);
      if (!isSilentRetry) renderHeaderInfo();
      return false;
    }
  }

  // ==========================================
  // 6. User Data & Dashboard Management
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
        
        checkAdminAccess(res.data.isAdmin || userData?.role === 'admin');
      } else {
        showToast(getText('load_user_err'), 'error');
        renderHeaderInfo();
      }
    } catch (err) {
      console.error('Error loading user data:', err);
    }
  }

  function checkAdminAccess(isAdmin) {
    const adminBtn = document.getElementById('admin-panel-btn');
    const adminTab = document.getElementById('nav-admin');
    
    const displayStyle = isAdmin ? 'flex' : 'none';
    if (adminBtn) adminBtn.style.display = displayStyle;
    if (adminTab) adminTab.style.display = displayStyle;
  }

  function renderHeaderInfo() {
    try {
      const balanceEl = document.getElementById('user-balance');
      const pendingEl = document.getElementById('user-pending');
      const usernameEl = document.getElementById('user-name');
      const refLinkEl = document.getElementById('referral-link');
      const avatarBox = document.getElementById('user-avatar-container');

      const availableBalance = userData?.availableBalance || 0;
      const pendingBalance = userData?.pendingBalance || 0;
      
      const displayName = currentTgUser 
        ? `${currentTgUser.first_name || ''} ${currentTgUser.last_name || ''}`.trim() || currentTgUser.username
        : (userData?.username || (userData?.telegramId ? `User_${userData.telegramId}` : getText('guest')));

      if (balanceEl) balanceEl.innerText = `$${availableBalance.toFixed(4)}`;
      if (pendingEl) pendingEl.innerText = `$${pendingBalance.toFixed(4)}`;
      if (usernameEl) usernameEl.innerText = displayName;
      
      if (avatarBox) {
        if (currentTgUser?.photo_url) {
          avatarBox.innerHTML = `<img src="${escapeHtml(currentTgUser.photo_url)}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;" alt="Avatar">`;
        } else {
          const letter = (displayName || 'U').charAt(0).toUpperCase();
          avatarBox.innerHTML = `<div style="width:100%; height:100%; border-radius:50%; background:#3b82f6; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:bold;">${escapeHtml(letter)}</div>`;
        }
      }

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
  // 7. Operations: Links Management
  // ==========================================
  async function createShortLink() {
    const urlInput = document.getElementById('link-url-input');
    const titleInput = document.getElementById('link-title-input');
    const createBtn = document.getElementById('create-link-btn');

    const targetUrl = urlInput?.value?.trim();
    const title = titleInput?.value?.trim();

    if (!targetUrl || !targetUrl.startsWith('http')) {
      showToast(getText('enter_link_err'), 'error');
      return;
    }

    triggerHaptic('medium');
    setButtonLoading(createBtn, true);

    const res = await fetchWithAuth('/api/links', {
      method: 'POST',
      body: JSON.stringify({ targetUrl, title })
    });

    setButtonLoading(createBtn, false);

    if (res.ok && res.data.success) {
      showToast(getText('link_created'), 'success');
      if (urlInput) urlInput.value = '';
      if (titleInput) titleInput.value = '';
      loadUserData();
    } else {
      showToast(res.data?.error || getText('network_error'), 'error');
    }
  }

  function renderLinksList(links) {
    const container = document.getElementById('links-container');
    if (!container) return;

    if (!Array.isArray(links) || links.length === 0) {
      container.innerHTML = `<div class="empty-state">${getText('no_links')}</div>`;
      return;
    }

    container.innerHTML = links.map(link => `
      <div class="card link-card">
        <div class="link-header">
          <span class="link-title">${escapeHtml(link.title || getText('untitled_link'))}</span>
          <button class="status-badge ${link.isActive ? 'active' : 'paused'}" onclick="window.appEngine.toggleLinkStatus('${link._id}')">
            ${link.isActive ? getText('status_active') : getText('status_paused')}
          </button>
        </div>
        <div class="link-url-box">
          <input type="text" readonly value="${escapeHtml(link.shortUrl)}" id="short-${link._id}">
          <button onclick="window.appEngine.copyToClipboard('short-${link._id}')">${currentLang === 'ar' ? 'نسخ' : 'Copy'}</button>
        </div>
        <div class="link-stats">
          <span>${currentLang === 'ar' ? 'الزيارات' : 'Views'}: <b>${link.views || 0}</b></span>
          <span>${currentLang === 'ar' ? 'الشرعية' : 'Valid'}: <b>${link.validImpressions || 0}</b></span>
          <span>CTR: <b>${link.ctr || '0.0'}%</b></span>
        </div>
      </div>
    `).join('');
  }

  async function toggleLinkStatus(linkId) {
    triggerHaptic('light');
    try {
      const res = await fetchWithAuth('/api/links/toggle', {
        method: 'POST',
        body: JSON.stringify({ linkId })
      });

      if (res.ok && res.data.success) {
        showToast(getText('link_toggle_ok'), 'success');
        loadUserData();
      } else {
        showToast(res.data?.error || getText('network_error'), 'error');
      }
    } catch (err) {
      console.error('Error toggling link status:', err);
    }
  }

  // ==========================================
  // 8. Operations: Ad Campaigns
  // ==========================================
  async function createAdCampaign() {
    const titleInput = document.getElementById('ad-title-input');
    const urlInput = document.getElementById('ad-url-input');
    const budgetInput = document.getElementById('ad-budget-input');
    const btn = document.getElementById('create-ad-btn');

    const title = titleInput?.value?.trim();
    const targetUrl = urlInput?.value?.trim();
    const totalBudget = parseFloat(budgetInput?.value);

    if (!title || !targetUrl || isNaN(totalBudget)) {
      showToast(getText('fill_ad_err'), 'error');
      return;
    }

    if (totalBudget < 5) {
      showToast(getText('min_ad_budget'), 'error');
      return;
    }

    triggerHaptic('medium');
    setButtonLoading(btn, true);

    const res = await fetchWithAuth('/api/ads', {
      method: 'POST',
      body: JSON.stringify({ title, targetUrl, totalBudget })
    });

    setButtonLoading(btn, false);

    if (res.ok && res.data.success) {
      showToast(getText('ad_created'), 'success');
      if (titleInput) titleInput.value = '';
      if (urlInput) urlInput.value = '';
      if (budgetInput) budgetInput.value = '';
      loadUserData();
    } else {
      showToast(res.data?.error || getText('network_error'), 'error');
    }
  }

  function renderAdsList(ads) {
    const container = document.getElementById('ads-container');
    if (!container) return;

    if (!Array.isArray(ads) || ads.length === 0) {
      container.innerHTML = `<div class="empty-state">${getText('no_ads')}</div>`;
      return;
    }

    container.innerHTML = ads.map(ad => `
      <div class="card ad-card">
        <div class="ad-header">
          <span class="ad-title">${escapeHtml(ad.title)}</span>
          <button class="status-badge ${ad.status}" onclick="window.appEngine.toggleAdStatus('${ad._id}')">
            ${ad.status === 'active' ? getText('status_active') : ad.status === 'paused' ? getText('status_paused') : getText('status_completed')}
          </button>
        </div>
        <div class="ad-details">
          <div>${currentLang === 'ar' ? 'الميزانية' : 'Budget'}: <b>$${(ad.totalBudget || 0).toFixed(2)}</b></div>
          <div>${currentLang === 'ar' ? 'المتبقي' : 'Remaining'}: <b>$${(ad.remainingBudget || 0).toFixed(2)}</b></div>
          <div>${currentLang === 'ar' ? 'الظهور' : 'Views'}: <b>${ad.impressionsCount || 0}</b></div>
        </div>
      </div>
    `).join('');
  }

  async function toggleAdStatus(adId) {
    triggerHaptic('light');
    try {
      const res = await fetchWithAuth('/api/ads/toggle', {
        method: 'POST',
        body: JSON.stringify({ adId })
      });

      if (res.ok && res.data.success) {
        showToast(getText('ad_toggle_ok'), 'success');
        loadUserData();
      } else {
        showToast(res.data?.error || getText('network_error'), 'error');
      }
    } catch (err) {
      console.error('Error toggling ad status:', err);
    }
  }

  // ==========================================
  // 9. Operations: Deposit & Withdrawal
  // ==========================================
  async function submitDepositRequest() {
    const amountInput = document.getElementById('deposit-amount');
    const networkSelect = document.getElementById('deposit-network');
    const txidInput = document.getElementById('deposit-txid');
    const btn = document.getElementById('submit-deposit-btn');

    const amount = parseFloat(amountInput?.value);
    const network = networkSelect?.value;
    const txid = txidInput?.value?.trim();

    if (isNaN(amount) || amount < 1) {
      showToast(getText('min_deposit_err'), 'error');
      return;
    }

    if (!txid) {
      showToast(getText('enter_txid_err'), 'error');
      return;
    }

    triggerHaptic('medium');
    setButtonLoading(btn, true);

    const res = await fetchWithAuth('/api/deposit', {
      method: 'POST',
      body: JSON.stringify({ amount, network, txid })
    });

    setButtonLoading(btn, false);

    if (res.ok && res.data.success) {
      showToast(getText('deposit_sent'), 'success');
      if (amountInput) amountInput.value = '';
      if (txidInput) txidInput.value = '';
      loadUserData();
    } else {
      showToast(res.data?.error || getText('network_error'), 'error');
    }
  }

  async function submitWithdrawRequest() {
    const amountInput = document.getElementById('withdraw-amount');
    const networkSelect = document.getElementById('withdraw-network');
    const walletInput = document.getElementById('withdraw-wallet') || document.getElementById('setting-wallet');
    const btn = document.getElementById('submit-withdraw-btn');

    const amount = parseFloat(amountInput?.value);
    const network = networkSelect?.value || 'USDT_TRC20';
    const walletAddress = walletInput?.value?.trim();

    if (isNaN(amount) || amount < 30) {
      showToast(getText('min_withdraw_err'), 'error');
      return;
    }

    if (!walletAddress) {
      showToast(getText('enter_wallet_err'), 'error');
      return;
    }

    triggerHaptic('medium');
    setButtonLoading(btn, true);

    const res = await fetchWithAuth('/api/withdraw', {
      method: 'POST',
      body: JSON.stringify({ amount, network, walletAddress })
    });

    setButtonLoading(btn, false);

    if (res.ok && res.data.success) {
      showToast(getText('withdraw_sent'), 'success');
      if (amountInput) amountInput.value = '';
      loadUserData();
    } else {
      showToast(res.data?.error || getText('network_error'), 'error');
    }
  }

  function renderWithdrawsList(withdraws) {
    const container = document.getElementById('withdraws-container');
    if (!container) return;

    if (!Array.isArray(withdraws) || withdraws.length === 0) {
      container.innerHTML = `<div class="empty-state">${getText('no_withdraws')}</div>`;
      return;
    }

    container.innerHTML = withdraws.map(w => `
      <div class="transaction-item">
        <div>
          <div><b>$${(w.amount || 0).toFixed(2)}</b> (${escapeHtml(w.network || 'USDT')})</div>
          <small>${new Date(w.createdAt || Date.now()).toLocaleDateString(currentLang === 'ar' ? 'ar-EG' : 'en-US')}</small>
        </div>
        <span class="status-badge ${w.status}">
          ${w.status === 'approved' || w.status === 'Completed' ? getText('status_approved') : w.status === 'rejected' || w.status === 'Rejected' ? getText('status_rejected') : getText('status_pending')}
        </span>
      </div>
    `).join('');
  }

  function renderDepositsList(deposits) {
    const container = document.getElementById('deposits-container');
    if (!container) return;

    if (!Array.isArray(deposits) || deposits.length === 0) {
      container.innerHTML = `<div class="empty-state">${getText('no_deposits')}</div>`;
      return;
    }

    container.innerHTML = deposits.map(d => `
      <div class="transaction-item">
        <div>
          <div><b>$${(d.amount || 0).toFixed(2)}</b> (${escapeHtml(d.network || 'USDT')})</div>
          <small>${new Date(d.createdAt || Date.now()).toLocaleDateString(currentLang === 'ar' ? 'ar-EG' : 'en-US')}</small>
        </div>
        <span class="status-badge ${d.status}">
          ${d.status === 'approved' ? getText('status_approved') : d.status === 'rejected' ? getText('status_rejected') : getText('status_pending')}
        </span>
      </div>
    `).join('');
  }

  // ==========================================
  // 10. Direct Native Telegram Social Sharing
  // ==========================================
  function shareReferralLink() {
    triggerHaptic('medium');
    const refInput = document.getElementById('referral-link');
    const refUrl = refInput?.value || `${appConfig.botUrl}?start=ref_${userData?._id || ''}`;
    
    const shareText = currentLang === 'ar'
      ? "انضم إليّ في أفضل منصة لاختصار الروابط وتحقيق الأرباح بسهولة! 🚀"
      : "Join me on the best url shortener platform & earn money easily! 🚀";

    const telegramShareUrl = `https://t.me/share/url?url=${encodeURIComponent(refUrl)}&text=${encodeURIComponent(shareText)}`;

    if (tg?.openTelegramLink) {
      tg.openTelegramLink(telegramShareUrl);
    } else {
      window.open(telegramShareUrl, '_blank');
    }
  }

  // ==========================================
  // 11. Utilities & Auxiliary Handlers
  // ==========================================
  async function saveUserSettings() {
    const walletInput = document.getElementById('setting-wallet');
    const walletAddress = walletInput?.value?.trim();

    triggerHaptic('light');

    const res = await fetchWithAuth('/api/user/settings', {
      method: 'POST',
      body: JSON.stringify({ defaultWallet: walletAddress })
    });

    if (res.ok && res.data.success) {
      showToast(getText('settings_saved'), 'success');
      loadUserData();
    } else {
      showToast(res.data?.error || getText('network_error'), 'error');
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
        📢 <b>${escapeHtml(a.title)}</b>: ${escapeHtml(a.message || a.content)}
      </div>
    `).join('');
  }

  function copyToClipboard(elementId) {
    const input = typeof elementId === 'string' ? document.getElementById(elementId) : elementId;
    if (!input) return;

    const valToCopy = input.value || input.innerText;

    if (navigator.clipboard) {
      navigator.clipboard.writeText(valToCopy).then(() => {
        showToast(getText('copied'), 'success');
      }).catch(() => {
        showToast(getText('copy_failed'), 'error');
      });
    } else {
      try {
        input.select?.();
        document.execCommand('copy');
        showToast(getText('copied'), 'success');
      } catch (e) {
        showToast(getText('copy_failed'), 'error');
      }
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
    triggerHaptic('light');

    const tabs = document.querySelectorAll('.tab-content');
    const navItems = document.querySelectorAll('.nav-item');

    tabs.forEach(tab => tab.classList.add('hidden', 'disabled'));
    tabs.forEach(tab => tab.classList.remove('active'));

    navItems.forEach(item => item.classList.remove('active'));

    const targetTab = document.getElementById(tabId) || document.getElementById(`tab-content-${tabId}`);
    const targetNav = document.getElementById(`nav-${tabId}`) || document.getElementById(`tab-btn-${tabId}`);

    if (targetTab) {
      targetTab.classList.remove('hidden', 'disabled');
      targetTab.classList.add('active');
    }
    if (targetNav) targetNav.classList.add('active');
  }

  function switchLanguage(lang) {
    triggerHaptic('light');
    applyLanguage(lang);
    if (userData) renderHeaderInfo();
  }

  function openAdminPanel() {
    triggerHaptic('medium');
    window.location.href = '/admin';
  }

  // ==========================================
  // 12. Global Namespace & Shorthands Export
  // ==========================================
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
    switchLanguage,
    shareReferralLink,
    openAdminPanel
  };

  // Expose convenient global shorthands for inline onclick attributes
  window.switchTab = switchTab;
  window.switchLanguage = switchLanguage;
  window.openAdminPanel = openAdminPanel;
  window.copyToClipboard = copyToClipboard;
  window.toggleLinkStatus = toggleLinkStatus;
  window.toggleAdStatus = toggleAdStatus;
  window.shareReferralLink = shareReferralLink;

  // ==========================================
  // 13. DOM Ready & Event Subscriptions
  // ==========================================
  document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('user-balance') || document.getElementById('links-container') || document.getElementById('app-view')) {
      initApp();

      const networkSelect = document.getElementById('deposit-network');
      if (networkSelect) {
        networkSelect.addEventListener('change', (e) => {
          triggerHaptic('light');
          const walletBox = document.getElementById('deposit-address-display');
          const val = e.target.value;
          if (walletBox) {
            if (val === 'BEP20' || val === 'USDT_BEP20') {
              walletBox.innerText = appConfig.depositWallets.bep20 || getText('not_set');
            } else if (val === 'TRC20' || val === 'USDT_TRC20') {
              walletBox.innerText = appConfig.depositWallets.trc20 || getText('not_set');
            }
          }
        });
      }
    }
  });

})();
