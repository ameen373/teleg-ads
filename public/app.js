/**
 * Telega.ads Platform Architecture
 * Mini App Client Engine - Public Application (v2.5)
 */

(function () {
  'use strict';

  // State Management
  const state = {
    token: localStorage.getItem('telega_token') || null,
    user: null,
    links: [],
    withdraws: [],
    announcements: [],
    ads: [],
    deposits: [],
    language: 'en',
    isAdmin: false,
    botUsername: '@Ads_telegabot',
    supportUsername: '@Te_AdsNs_bot',
    botUrl: 'https://t.me/Ads_telegabot',
    officialChannelUrl: 'https://t.me/ttelega_ads',
    supportUrl: 'https://t.me/Te_AdsNs_bot',
    depositWallets: {
      bep20: '',
      trc20: ''
    },
    activeTab: 'publisher',
    bridgeSession: null
  };

  // Telegram WebApp SDK Setup
  const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;

  if (tg) {
    tg.ready();
    tg.expand();
  }

  // Fetch API Helper with Auth Credentials
  async function apiRequest(endpoint, method = 'GET', data = null) {
    const headers = {
      'Content-Type': 'application/json'
    };

    if (state.token) {
      headers['Authorization'] = `Bearer ${state.token}`;
    }

    if (tg && tg.initData) {
      headers['x-telegram-init-data'] = tg.initData;
    }

    const options = {
      method,
      headers
    };

    if (data) {
      options.body = JSON.stringify(data);
    }

    try {
      const response = await fetch(endpoint, options);
      const resData = await response.json();

      if (!response.ok) {
        if (response.status === 401) {
          logout();
        }
        throw new Error(resData.error || 'حدث خطأ في الاتصال بالخادم');
      }

      return resData;
    } catch (err) {
      showToast(err.message, 'error');
      throw err;
    }
  }

  // Toast Notification System
  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerText = message;

    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('fade-out');
      toast.addEventListener('transitionend', () => toast.remove());
    }, 4000);
  }

  // Authentication & System Initialization
  async function initApp() {
    // Check if handling redirect short link (/r/:code)
    const path = window.location.pathname;
    if (path.startsWith('/r/')) {
      const code = path.split('/r/')[1];
      if (code) {
        handleShortLinkBridge(code);
        return;
      }
    }

    try {
      const initData = tg ? tg.initData : '';
      const referrerId = getUrlParameter('start') || getUrlParameter('ref') || null;

      const loginRes = await apiRequest('/api/auth/login', 'POST', {
        initData,
        referrerId
      });

      if (loginRes.success) {
        state.token = loginRes.token;
        localStorage.setItem('telega_token', loginRes.token);
        state.user = loginRes.user;
        state.language = loginRes.language || 'en';
        state.isAdmin = loginRes.isAdmin || false;
        state.botUsername = loginRes.botUsername || state.botUsername;
        state.supportUsername = loginRes.supportUsername || state.supportUsername;
        state.botUrl = loginRes.botUrl || state.botUrl;
        state.officialChannelUrl = loginRes.officialChannelUrl || state.officialChannelUrl;
        state.supportUrl = loginRes.supportUrl || state.supportUrl;
        state.depositWallets = loginRes.depositWallets || state.depositWallets;

        renderAdminButtonState();
        await loadUserData();
      }
    } catch (err) {
      console.error('Initialization Failed:', err);
    }
  }

  function renderAdminButtonState() {
    const adminTabBtn = document.getElementById('btn-admin-tab');
    if (adminTabBtn) {
      if (state.isAdmin) {
        adminTabBtn.style.display = 'flex';
      } else {
        adminTabBtn.style.display = 'none';
      }
    }
  }

  async function loadUserData() {
    try {
      const res = await apiRequest('/api/user/data', 'GET');
      if (res.success) {
        state.user = res.user;
        state.links = res.links || [];
        state.withdraws = res.withdraws || [];
        state.announcements = res.announcements || [];
        state.ads = res.ads || [];
        state.deposits = res.deposits || [];
        state.isAdmin = res.isAdmin || false;

        renderAdminButtonState();
        renderDashboard();
      }
    } catch (err) {
      console.error('Error loading user data:', err);
    }
  }

  function logout() {
    state.token = null;
    state.user = null;
    localStorage.removeItem('telega_token');
    window.location.reload();
  }

  // UI Rendering Core
  function renderDashboard() {
    if (!state.user) return;

    // Balances
    const availBalEl = document.getElementById('user-available-balance');
    const pendBalEl = document.getElementById('user-pending-balance');
    const refEarningsEl = document.getElementById('user-referral-earnings');

    if (availBalEl) availBalEl.innerText = `$${(state.user.availableBalance || 0).toFixed(4)}`;
    if (pendBalEl) pendBalEl.innerText = `$${(state.user.pendingBalance || 0).toFixed(4)}`;
    if (refEarningsEl) refEarningsEl.innerText = `$${(state.user.referralEarnings || 0).toFixed(4)}`;

    // Referral Link
    const refInput = document.getElementById('referral-link-input');
    if (refInput) {
      const refCode = state.user._id;
      refInput.value = `${state.botUrl}?start=${refCode}`;
    }

    // Wallets Display
    const trc20Addr = document.getElementById('wallet-trc20-address');
    const bep20Addr = document.getElementById('wallet-bep20-address');
    if (trc20Addr) trc20Addr.innerText = state.depositWallets.trc20 || 'Not Configured';
    if (bep20Addr) bep20Addr.innerText = state.depositWallets.bep20 || 'Not Configured';

    // Lists Rendering
    renderLinksList();
    renderAdsList();
    renderWithdrawsList();
    renderDepositsList();
    renderAnnouncements();
  }

  function renderLinksList() {
    const container = document.getElementById('publisher-links-container');
    if (!container) return;

    if (state.links.length === 0) {
      container.innerHTML = '<div class="empty-state">لا توجد روابط جديدة مُنشأة بعد.</div>';
      return;
    }

    container.innerHTML = state.links.map(link => `
      <div class="card item-card">
        <div class="card-header">
          <span class="card-title">${escapeHtml(link.title)}</span>
          <span class="badge ${link.isActive ? 'badge-success' : 'badge-danger'}">
            ${link.isActive ? 'نشط' : 'متوقف'}
          </span>
        </div>
        <div class="card-body">
          <p class="link-url"><strong>الرابط القصير:</strong> <a href="${link.shortUrl}" target="_blank">${link.shortUrl}</a></p>
          <p class="link-target"><strong>الوجهة:</strong> ${escapeHtml(link.targetUrl)}</p>
          <div class="stats-grid">
            <div><span>الزيارات:</span> <strong>${link.views || 0}</strong></div>
            <div><span>المؤهلة:</span> <strong>${link.validImpressions || 0}</strong></div>
            <div><span>CTR:</span> <strong>${link.ctr}%</strong></div>
          </div>
        </div>
        <div class="card-actions">
          <button class="btn btn-secondary btn-sm copy-btn" data-url="${link.shortUrl}">نسخ الرابط</button>
          <button class="btn btn-warning btn-sm toggle-link-btn" data-id="${link._id}">
            ${link.isActive ? 'إيقاف' : 'تفعيل'}
          </button>
        </div>
      </div>
    `).join('');

    // Attach Action Listeners
    container.querySelectorAll('.copy-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        copyToClipboard(btn.getAttribute('data-url'));
        showToast('تم نسخ الرابط بنجاح!', 'success');
      });
    });

    container.querySelectorAll('.toggle-link-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        try {
          const res = await apiRequest('/api/links/toggle', 'POST', { linkId: id });
          if (res.success) {
            showToast('تم تغيير حالة الرابط بنجاح');
            await loadUserData();
          }
        } catch (e) {}
      });
    });
  }

  function renderAdsList() {
    const container = document.getElementById('advertiser-ads-container');
    if (!container) return;

    if (state.ads.length === 0) {
      container.innerHTML = '<div class="empty-state">لا توجد حملات إعلانية نشطة حالياً.</div>';
      return;
    }

    container.innerHTML = state.ads.map(ad => `
      <div class="card item-card">
        <div class="card-header">
          <span class="card-title">${escapeHtml(ad.title)}</span>
          <span class="badge ${ad.status === 'active' ? 'badge-success' : ad.status === 'paused' ? 'badge-warning' : 'badge-secondary'}">
            ${ad.status}
          </span>
        </div>
        <div class="card-body">
          <p><strong>الرابط المستهدف:</strong> ${escapeHtml(ad.targetUrl)}</p>
          <div class="stats-grid">
            <div><span>الميزانية الكلية:</span> <strong>$${ad.totalBudget.toFixed(2)}</strong></div>
            <div><span>المتبقي:</span> <strong>$${ad.remainingBudget.toFixed(2)}</strong></div>
            <div><span>الظهور:</span> <strong>${ad.impressionsCount || 0}</strong></div>
          </div>
        </div>
        <div class="card-actions">
          ${ad.status !== 'completed' ? `
            <button class="btn btn-secondary btn-sm toggle-ad-btn" data-id="${ad._id}">
              ${ad.status === 'active' ? 'إيقاف مؤقت' : 'تشغيل'}
            </button>
          ` : '<span class="text-muted">مكتملة</span>'}
        </div>
      </div>
    `).join('');

    container.querySelectorAll('.toggle-ad-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        try {
          const res = await apiRequest('/api/ads/toggle', 'POST', { adId: id });
          if (res.success) {
            showToast('تم تغيير حالة الحملة الإعلانية');
            await loadUserData();
          }
        } catch (e) {}
      });
    });
  }

  function renderWithdrawsList() {
    const container = document.getElementById('withdraw-history-container');
    if (!container) return;

    if (state.withdraws.length === 0) {
      container.innerHTML = '<div class="empty-state">لا توجد عمليات سحب سابقة.</div>';
      return;
    }

    container.innerHTML = state.withdraws.map(w => `
      <div class="history-item">
        <div class="history-info">
          <span class="history-amount">$${w.amount.toFixed(2)} (${w.network})</span>
          <span class="history-date">${new Date(w.createdAt).toLocaleDateString()}</span>
        </div>
        <div class="history-status">
          <span class="badge ${w.status === 'approved' ? 'badge-success' : w.status === 'rejected' ? 'badge-danger' : 'badge-warning'}">
            ${w.status}
          </span>
        </div>
      </div>
    `).join('');
  }

  function renderDepositsList() {
    const container = document.getElementById('deposit-history-container');
    if (!container) return;

    if (state.deposits.length === 0) {
      container.innerHTML = '<div class="empty-state">لا توجد عمليات إيداع سابقة.</div>';
      return;
    }

    container.innerHTML = state.deposits.map(d => `
      <div class="history-item">
        <div class="history-info">
          <span class="history-amount">$${d.amount.toFixed(2)} (${d.network})</span>
          <span class="history-date">TxID: ${d.txid.substring(0, 10)}...</span>
        </div>
        <div class="history-status">
          <span class="badge ${d.status === 'approved' ? 'badge-success' : d.status === 'rejected' ? 'badge-danger' : 'badge-warning'}">
            ${d.status}
          </span>
        </div>
      </div>
    `).join('');
  }

  function renderAnnouncements() {
    const container = document.getElementById('announcements-container');
    if (!container) return;

    if (state.announcements.length === 0) {
      container.style.display = 'none';
      return;
    }

    container.style.display = 'block';
    container.innerHTML = state.announcements.map(a => `
      <div class="announcement-card">
        <h4>📢 ${escapeHtml(a.title)}</h4>
        <p>${escapeHtml(a.content)}</p>
      </div>
    `).join('');
  }

  // Event Listeners Setup
  function setupEventListeners() {
    // Navigation Tabs
    const tabButtons = document.querySelectorAll('.nav-tab');
    tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetTab = btn.getAttribute('data-tab');
        if (targetTab === 'admin' && !state.isAdmin) return;

        tabButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        const activeContent = document.getElementById(`tab-${targetTab}`);
        if (activeContent) activeContent.classList.add('active');

        state.activeTab = targetTab;
      });
    });

    // Create Short Link Form
    const createLinkForm = document.getElementById('create-link-form');
    if (createLinkForm) {
      createLinkForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const titleInput = document.getElementById('link-title-input');
        const urlInput = document.getElementById('link-url-input');

        try {
          const res = await apiRequest('/api/links', 'POST', {
            title: titleInput.value,
            targetUrl: urlInput.value
          });

          if (res.success) {
            showToast('تم إنشاء الرابط القصير بنجاح!', 'success');
            titleInput.value = '';
            urlInput.value = '';
            await loadUserData();
          }
        } catch (err) {}
      });
    }

    // Create Campaign Form
    const createAdForm = document.getElementById('create-ad-form');
    if (createAdForm) {
      createAdForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const title = document.getElementById('ad-title-input').value;
        const targetUrl = document.getElementById('ad-url-input').value;
        const totalBudget = document.getElementById('ad-budget-input').value;

        try {
          const res = await apiRequest('/api/ads', 'POST', { title, targetUrl, totalBudget });
          if (res.success) {
            showToast('تم إطلاق الحملة الإعلانية بنجاح!', 'success');
            createAdForm.reset();
            await loadUserData();
          }
        } catch (err) {}
      });
    }

    // Submit Deposit Form
    const depositForm = document.getElementById('deposit-form');
    if (depositForm) {
      depositForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const amount = document.getElementById('deposit-amount-input').value;
        const network = document.getElementById('deposit-network-select').value;
        const txid = document.getElementById('deposit-txid-input').value;

        try {
          const res = await apiRequest('/api/deposit', 'POST', { amount, network, txid });
          if (res.success) {
            showToast('تم تقديم طلب الإيداع بنجاح، بانتظار التأكيد.', 'success');
            depositForm.reset();
            await loadUserData();
          }
        } catch (err) {}
      });
    }

    // Withdraw Form
    const withdrawForm = document.getElementById('withdraw-form');
    if (withdrawForm) {
      withdrawForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const amount = document.getElementById('withdraw-amount-input').value;
        const network = document.getElementById('withdraw-network-select').value;
        const walletAddress = document.getElementById('withdraw-wallet-input').value;

        try {
          const res = await apiRequest('/api/withdraw', 'POST', { amount, network, walletAddress });
          if (res.success) {
            showToast('تم تقديم طلب السحب بنجاح!', 'success');
            withdrawForm.reset();
            await loadUserData();
          }
        } catch (err) {}
      });
    }

    // Copy Referral Link Button
    const copyRefBtn = document.getElementById('copy-referral-btn');
    if (copyRefBtn) {
      copyRefBtn.addEventListener('click', () => {
        const refInput = document.getElementById('referral-link-input');
        if (refInput && refInput.value) {
          copyToClipboard(refInput.value);
          showToast('تم نسخ رابط الإحالة الخاص بك!', 'success');
        }
      });
    }

    // Go To Dashboard Admin Panel Button
    const btnGoAdmin = document.getElementById('btn-go-admin-panel');
    if (btnGoAdmin) {
      btnGoAdmin.addEventListener('click', () => {
        if (state.isAdmin) {
          window.location.href = '/admin';
        } else {
          showToast('غير مصرح لك بالوصول للوحة الإدارة', 'error');
        }
      });
    }
  }

  // Short Link Traffic & Bridge Flow Handler
  async function handleShortLinkBridge(shortCode) {
    const bridgeContainer = document.getElementById('bridge-view');
    const appContainer = document.getElementById('app-view');

    if (appContainer) appContainer.style.display = 'none';
    if (bridgeContainer) bridgeContainer.style.display = 'block';

    try {
      const initRes = await fetch('/api/init-click', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ linkCode: shortCode })
      }).then(r => r.json());

      if (!initRes.success) {
        showToast(initRes.error || 'رابط غير صالح', 'error');
        return;
      }

      state.bridgeSession = initRes;
      renderBridgeAd(initRes);

    } catch (err) {
      console.error('Bridge error:', err);
    }
  }

  function renderBridgeAd(sessionData) {
    const timerEl = document.getElementById('bridge-timer');
    const actionBtn = document.getElementById('bridge-action-btn');
    let timeLeft = 5;

    const interval = setInterval(() => {
      timeLeft -= 1;
      if (timerEl) timerEl.innerText = `${timeLeft} ثوانٍ`;

      if (timeLeft <= 0) {
        clearInterval(interval);
        if (timerEl) timerEl.style.display = 'none';
        if (actionBtn) {
          actionBtn.disabled = false;
          actionBtn.innerText = 'متابعة إلى الرابط 👈';
        }
      }
    }, 1000);

    if (actionBtn) {
      actionBtn.addEventListener('click', async () => {
        actionBtn.disabled = true;
        actionBtn.innerText = 'جاري التحقق...';

        try {
          const impRes = await fetch('/api/impression', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId: sessionData.sessionId,
              bridgeToken: sessionData.bridgeToken,
              duration: 5
            })
          }).then(r => r.json());

          if (impRes.success && impRes.targetUrl) {
            window.location.href = impRes.targetUrl;
          } else {
            showToast('حدث خطأ أثناء التحويل للرابط الأصلي', 'error');
          }
        } catch (err) {
          showToast('فشل التحقق من الجلسة', 'error');
        }
      });
    }
  }

  // Utility Functions
  function copyToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text);
    } else {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      document.execCommand('copy');
      textArea.remove();
    }
  }

  function getUrlParameter(name) {
    name = name.replace(/[\[]/, '\\[').replace(/[\]]/, '\\]');
    const regex = new RegExp('[\\?&]' + name + '=([^&#]*)');
    const results = regex.exec(location.search);
    return results === null ? '' : decodeURIComponent(results[1].replace(/\+/g, ' '));
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Lifecycle Initialization Trigger
  document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    initApp();
  });

})();
