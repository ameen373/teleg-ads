/**
 * Main Frontend Application Engine
 * Unified, Secure, Robust & Self-Healing (User Scope)
 */

(() => {
  'use strict';

  const API_BASE = window.location.protocol.startsWith('file') 
    ? 'http://localhost:3000' 
    : window.location.origin;

  let authToken = localStorage.getItem('authToken') || localStorage.getItem('token') || localStorage.getItem('user_token') || null;
  let userData = null;
  let currentSessionId = null;
  let bridgeStartTime = Date.now();
  let currentLang = localStorage.getItem('appLang') || 'ar';
  
  const tg = window.Telegram?.WebApp;
  const currentTgUser = tg?.initDataUnsafe?.user || null;

  let appConfig = {
    botUsername: 'Ads_telegabot',
    supportUsername: 'Te_AdsNs_bot',
    botUrl: 'https://t.me/Ads_telegabot',
    depositWallets: { bep20: '', trc20: '' }
  };

  const i18n = {
    ar: {
      network_error: "تعذر الاتصال بالشبكة، يرجى التحقق من الاتصال.",
      copied: "تم النسخ بنجاح!",
      link_success: "تم إنشاء الرابط بنجاح!",
      ad_success: "تم إطلاق الحملة بنجاح!",
      deposit_success: "تم إرسال طلب الإيداع وهو قيد المراجعة!",
      withdraw_success: "تم تقديم طلب السحب بنجاح!",
      settings_saved: "تم حفظ الإعدادات بنجاح!"
    },
    en: {
      network_error: "Network error. Please check your connection.",
      copied: "Copied successfully!",
      link_success: "Link created successfully!",
      ad_success: "Ad campaign launched successfully!",
      deposit_success: "Deposit request submitted successfully!",
      withdraw_success: "Withdrawal requested successfully!",
      settings_saved: "Settings saved successfully!"
    }
  };

  // Safe DOM Helper
  function safeSetText(id, text) {
    const el = document.getElementById(id);
    if (el) el.innerText = text;
  }

  function safeSetValue(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val;
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

  function triggerHaptic(style = 'light') {
    try {
      if (tg && tg.isVersionAtLeast && tg.isVersionAtLeast('6.1') && tg.HapticFeedback) {
        tg.HapticFeedback.impactOccurred(style);
      }
    } catch (e) {}
  }

  function showToast(message, type = 'info') {
    triggerHaptic('medium');
    let toast = document.getElementById("toast");
    if (toast) {
      toast.innerText = message;
      toast.className = `show ${type}`;
      setTimeout(() => { toast.classList.remove("show"); }, 3500);
      return;
    }

    let toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.id = 'toast-container';
      toastContainer.style.cssText = `
        position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
        z-index: 9999; display: flex; flex-direction: column; gap: 8px;
        width: 90%; max-width: 380px; pointer-events: none;
      `;
      document.body.appendChild(toastContainer);
    }

    const toastEl = document.createElement('div');
    const bgColor = type === 'error' ? '#ef4444' : type === 'success' ? '#10b981' : '#3b82f6';
    toastEl.style.cssText = `
      background: ${bgColor}; color: #ffffff; padding: 10px 14px;
      border-radius: 8px; font-size: 13px; text-align: center;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2); pointer-events: auto;
      transition: all 0.3s ease; opacity: 0; transform: translateY(-10px);
    `;
    toastEl.innerText = message;
    toastContainer.appendChild(toastEl);

    requestAnimationFrame(() => {
      toastEl.style.opacity = '1';
      toastEl.style.transform = 'translateY(0)';
    });

    setTimeout(() => {
      toastEl.style.opacity = '0';
      toastEl.style.transform = 'translateY(-10px)';
      setTimeout(() => toastEl.remove(), 300);
    }, 3500);
  }

  async function fetchWithAuth(endpoint, options = {}) {
    options.headers = options.headers || {};
    if (authToken) {
      options.headers['Authorization'] = `Bearer ${authToken}`;
    }
    if (tg?.initData) {
      options.headers['x-telegram-init-data'] = tg.initData;
    }
    if (!options.headers['Content-Type'] && !(options.body instanceof FormData)) {
      options.headers['Content-Type'] = 'application/json';
    }

    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const targetUrl = endpoint.startsWith('http') ? endpoint : `${API_BASE}${cleanEndpoint}`;

    try {
      let response = await fetch(targetUrl, options);
      if (response.status === 401) {
        const reAuth = await authLogin();
        if (reAuth) {
          options.headers['Authorization'] = `Bearer ${authToken}`;
          response = await fetch(targetUrl, options);
        }
      }
      const data = await response.json().catch(() => ({}));
      return { ok: response.ok, status: response.status, data };
    } catch (err) {
      console.error("API Fetch Error:", err);
      showToast(i18n[currentLang]?.network_error || "Network connection error", 'error');
      return { ok: false, status: 500, data: null };
    }
  }

  async function authLogin() {
    const startParam = tg?.initDataUnsafe?.start_param || null;
    try {
      const res = await fetchWithAuth('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ referrerId: startParam, telegramUserInfo: currentTgUser || {}, initData: tg?.initData || '' })
      });

      if (res.ok && res.data) {
        authToken = res.data.token || res.data.authToken;
        if (authToken) {
          localStorage.setItem('authToken', authToken);
          localStorage.setItem('token', authToken);
          localStorage.setItem('user_token', authToken);
        }
        return true;
      }
    } catch (e) {
      console.error("Auth Exception:", e);
    }
    return false;
  }

  async function initializeApp() {
    try {
      if (!authToken) await authLogin();
      await loadUserData();
    } catch (err) {
      console.error("App Initialization Error:", err);
    }
  }

  async function loadUserData() {
    try {
      const res = await fetchWithAuth('/api/user/data');
      if (!res.ok || !res.data) return;

      const data = res.data;
      userData = data.user || data;

      // Update Header & Financial Stats Safe Elements
      safeSetText('pending-bal', `$${(userData.pendingBalance || 0).toFixed(2)}`);
      safeSetText('user-pending', `$${(userData.pendingBalance || 0).toFixed(2)}`);
      safeSetText('avail-bal', `$${(userData.availableBalance || 0).toFixed(2)}`);
      safeSetText('user-balance', `$${(userData.availableBalance || 0).toFixed(2)}`);
      safeSetText('ref-earnings', `$${(userData.referralEarnings || 0).toFixed(2)}`);

      // Wallet Input Sync
      safeSetValue('default-wallet', userData.defaultWallet || '');
      safeSetValue('setting-wallet', userData.defaultWallet || '');

      // Referral Link Sync
      const botName = tg?.initDataUnsafe?.bot?.username || appConfig.botUsername;
      const refUrl = `https://t.me/${botName}?start=${userData._id || userData.id || ''}`;
      safeSetValue('ref-link', refUrl);
      safeSetValue('referral-link', refUrl);

      // Render Modules safely
      renderLinksList(data.links || userData.links || []);
      renderAdsList(data.ads || userData.ads || []);
      renderWithdrawsList(data.withdraws || userData.withdraws || []);
      renderDepositsList(data.deposits || userData.deposits || []);

      // Trigger Admin Check safely inside Admin Engine if loaded
      if (window.adminEngine && typeof window.adminEngine.checkAndRenderAdmin === 'function') {
        window.adminEngine.checkAndRenderAdmin(data);
      }
    } catch (err) {
      console.error("Error loading user data:", err);
    }
  }

  function renderLinksList(links) {
    const container = document.getElementById('links-list') || document.getElementById('links-container');
    if (!container) return;

    if (!Array.isArray(links) || links.length === 0) {
      container.innerHTML = '<div class="empty-state" style="padding:15px; text-align:center; color:var(--text-muted);">لا توجد روابط مُختصرة حالياً.</div>';
      return;
    }

    container.innerHTML = links.map(l => {
      const shortUrl = l.shortUrl || `${API_BASE}/r/${l.shortCode}`;
      const isActive = l.isActive !== false;
      const statusColor = isActive ? '#10b981' : '#ef4444';
      return `
      <div class="link-item" style="border-left: 3px solid ${statusColor}; background: rgba(255,255,255,0.03); padding: 10px; border-radius: 8px; margin-bottom: 8px;">
        <div style="display:flex; justify-content:space-between; font-weight:bold;">
          <span>${escapeHtml(l.title || 'رابط بدون عنوان')}</span>
          <span style="color: ${statusColor}; font-size:11px;">${isActive ? 'نشط' : 'معطل'}</span>
        </div>
        <div style="font-size:11px; color:var(--text-muted); margin: 4px 0; word-break: break-all;">${escapeHtml(shortUrl)}</div>
        <div style="font-size:12px; margin-bottom:6px;">الزيارات: <b>${l.views || 0}</b> | المعتمدة: <b style="color:#10b981;">${l.validImpressions || 0}</b></div>
        <div style="display:flex; gap:6px;">
          <button class="btn-small" style="padding:4px 10px;" onclick="window.appEngine.copyToClipboard('${escapeHtml(shortUrl)}')">نسخ</button>
          <button class="btn-small" style="padding:4px 10px; background:${isActive ? '#f59e0b':'#10b981'}; color:#fff; border:none; border-radius:4px;" onclick="window.appEngine.toggleLinkStatus('${l._id}')">${isActive ? 'تعطيل' : 'تفعيل'}</button>
        </div>
      </div>`;
    }).join('');
  }

  function renderAdsList(ads) {
    const container = document.getElementById('ads-list') || document.getElementById('ads-container');
    if (!container) return;

    if (!Array.isArray(ads) || ads.length === 0) {
      container.innerHTML = '<div class="empty-state" style="padding:15px; text-align:center; color:var(--text-muted);">لا توجد حملات إعلانية نشطة حالياً.</div>';
      return;
    }

    container.innerHTML = ads.map(ad => `
      <div class="ad-item" style="background: rgba(255,255,255,0.03); padding: 10px; border-radius: 8px; margin-bottom: 8px;">
        <div style="display:flex; justify-content:space-between; font-weight:bold;">
          <span>${escapeHtml(ad.title)}</span>
          <span style="font-size:11px; color:#3b82f6;">${escapeHtml((ad.status || 'active').toUpperCase())}</span>
        </div>
        <div style="font-size:11px; color:var(--text-muted); margin:4px 0; word-break:break-all;">${escapeHtml(ad.targetUrl)}</div>
        <div style="font-size:12px;">الميزانية المتبقية: <b style="color:#10b981;">$${(ad.remainingBudget || 0).toFixed(2)}</b> / $${parseFloat(ad.totalBudget || 0).toFixed(2)}</div>
        <div style="margin-top:6px;">
          ${ad.status !== 'completed' ? `<button class="btn-small" style="padding:4px 10px; background:#f59e0b; color:#fff; border:none; border-radius:4px;" onclick="window.appEngine.toggleAdStatus('${ad._id}')">تغيير الحالة</button>` : ''}
        </div>
      </div>`;
    }).join('');
  }

  function renderWithdrawsList(withdraws) {
    const container = document.getElementById('withdraws-list') || document.getElementById('withdraws-container');
    if (!container) return;

    if (!Array.isArray(withdraws) || withdraws.length === 0) {
      container.innerHTML = '<div class="empty-state" style="padding:10px; text-align:center; color:var(--text-muted);">لا توجد عمليات سحب سابقة.</div>';
      return;
    }

    container.innerHTML = withdraws.map(w => `
      <div style="background: rgba(255,255,255,0.03); padding: 8px; border-radius: 6px; margin-bottom: 6px; font-size: 12px;">
        <div style="display:flex; justify-content:space-between;">
          <span>المبلغ: <b>$${parseFloat(w.amount || 0).toFixed(2)}</b></span>
          <span style="font-weight:bold; color:${w.status === 'Completed' || w.status === 'approved' ? '#10b981' : w.status === 'Rejected' || w.status === 'rejected' ? '#ef4444' : '#f59e0b'};">${w.status}</span>
        </div>
        <div style="color:var(--text-muted); font-size:10px; margin-top:2px; word-break:break-all;">المحفظة: ${escapeHtml(w.walletAddress)}</div>
      </div>`).join('');
  }

  function renderDepositsList(deposits) {
    const container = document.getElementById('deposits-container');
    if (!container) return;

    if (!Array.isArray(deposits) || deposits.length === 0) {
      container.innerHTML = '<div class="empty-state" style="padding:10px; text-align:center; color:var(--text-muted);">لا توجد عمليات إيداع سابقة.</div>';
      return;
    }

    container.innerHTML = deposits.map(d => `
      <div style="background: rgba(255,255,255,0.03); padding: 8px; border-radius: 6px; margin-bottom: 6px; font-size: 12px;">
        <div style="display:flex; justify-content:space-between;">
          <span>المبلغ: <b>$${parseFloat(d.amount || 0).toFixed(2)}</b></span>
          <span style="font-weight:bold; color:${d.status === 'Completed' || d.status === 'approved' ? '#10b981' : '#f59e0b'};">${d.status}</span>
        </div>
        <div style="color:var(--text-muted); font-size:10px; margin-top:2px;">TxID: ${escapeHtml(d.txHash || d.txid || 'N/A')}</div>
      </div>`).join('');
  }

  // Action Operations
  async function handleShortenClick() {
    const title = document.getElementById('link-title')?.value || document.getElementById('link-title-input')?.value;
    const targetUrl = document.getElementById('link-url')?.value || document.getElementById('link-url-input')?.value;

    if (!targetUrl) return showToast("يرجى إدخال الرابط الأصلي بوضوح", 'error');

    triggerHaptic('light');
    const res = await fetchWithAuth('/api/links', {
      method: 'POST',
      body: JSON.stringify({ title, targetUrl })
    });

    if (res.ok && !res.data.error) {
      showToast(i18n[currentLang]?.link_success || "تم إنشاء الرابط بنجاح!", 'success');
      safeSetValue('link-title', '');
      safeSetValue('link-url', '');
      safeSetValue('link-title-input', '');
      safeSetValue('link-url-input', '');
      loadUserData();
    } else {
      showToast(res.data?.error || "حدث خطأ أثناء اختصار الرابط", 'error');
    }
  }

  async function toggleLinkStatus(linkId) {
    triggerHaptic('light');
    const res = await fetchWithAuth('/api/links/toggle', {
      method: 'POST',
      body: JSON.stringify({ linkId })
    });
    if (res.ok) loadUserData();
  }

  async function toggleAdStatus(adId) {
    triggerHaptic('light');
    const res = await fetchWithAuth('/api/ads/toggle', {
      method: 'POST',
      body: JSON.stringify({ adId })
    });
    if (res.ok) loadUserData();
  }

  async function createAdCampaign() {
    const title = document.getElementById('ad-title')?.value || document.getElementById('ad-title-input')?.value;
    const targetUrl = document.getElementById('ad-target-url')?.value || document.getElementById('ad-url-input')?.value;
    const totalBudget = document.getElementById('ad-budget')?.value || document.getElementById('ad-budget-input')?.value;

    if (!title || !targetUrl || !totalBudget) return showToast("يرجى إكمال بيانات الإعلان", 'error');

    triggerHaptic('medium');
    const res = await fetchWithAuth('/api/ads', {
      method: 'POST',
      body: JSON.stringify({ title, targetUrl, totalBudget })
    });

    if (res.ok && !res.data.error) {
      showToast(i18n[currentLang]?.ad_success || "تم إطلاق الحملة بنجاح!", 'success');
      loadUserData();
    } else {
      showToast(res.data?.error || "خطأ أثناء إنشاء الحملة", 'error');
    }
  }

  async function requestWithdrawal() {
    const amount = parseFloat(document.getElementById('withdraw-amount')?.value);
    const walletAddress = document.getElementById('default-wallet')?.value || document.getElementById('setting-wallet')?.value;

    if (!walletAddress) return showToast("يرجى كتابة عنوان محفظة السحب أولاً", 'error');
    if (!amount || amount < 30) return showToast("الحد الأدنى للسحب هو 30$", 'error');

    triggerHaptic('medium');
    const res = await fetchWithAuth('/api/withdraw', {
      method: 'POST',
      body: JSON.stringify({ amount, walletAddress })
    });

    if (res.ok && !res.data.error) {
      showToast(i18n[currentLang]?.withdraw_success || "تم تقديم طلب السحب بنجاح!", 'success');
      safeSetValue('withdraw-amount', '');
      loadUserData();
    } else {
      showToast(res.data?.error || "خطأ أثناء معالجة الطلب", 'error');
    }
  }

  function copyToClipboard(textOrId) {
    let textToCopy = textOrId;
    const el = document.getElementById(textOrId);
    if (el) textToCopy = el.value || el.innerText;

    if (!textToCopy) return;
    navigator.clipboard.writeText(textToCopy).then(() => {
      showToast(i18n[currentLang]?.copied || "تم النسخ بنجاح!", 'success');
    }).catch(() => {
      showToast("فشل النسخ تلقائياً", 'error');
    });
  }

  function switchTab(tabId) {
    triggerHaptic('light');
    document.querySelectorAll('.tg-nav-dock button, .nav-item').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('#app-view > div[id^="tab-content-"], .tab-content').forEach(c => c.classList.add('hidden'));

    const targetBtn = document.getElementById(`tab-btn-${tabId}`) || document.getElementById(`nav-${tabId}`);
    if (targetBtn) targetBtn.classList.add('active');

    const tabContent = document.getElementById(`tab-content-${tabId}`) || document.getElementById(tabId);
    if (tabContent) tabContent.classList.remove('hidden');
  }

  // Global Binding
  window.appEngine = {
    initApp: initializeApp,
    handleShortenClick,
    createShortLink: handleShortenClick,
    toggleLinkStatus,
    createAdCampaign,
    toggleAdStatus,
    requestWithdrawal,
    submitWithdrawRequest: requestWithdrawal,
    copyToClipboard,
    switchTab
  };

  window.switchTab = switchTab;
  window.copyToClipboard = copyToClipboard;
  window.toggleLinkStatus = toggleLinkStatus;
  window.toggleAdStatus = toggleAdStatus;

  // Safe Page Ready Loader
  document.addEventListener('DOMContentLoaded', async () => {
    try {
      if (tg) {
        tg.ready();
        tg.expand();
      }
    } catch (e) {}

    await initializeApp();
  });

})();
