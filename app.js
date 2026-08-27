/**
 * Telegram Mini App & Web Bridge Core Application Engine
 * Unified, Optimized & Ready for Production
 */

// 1. App State & Global Configurations
const APP = {
  apiBase: window.location.protocol.startsWith('file') ? 'http://localhost:3000' : window.location.origin,
  authToken: localStorage.getItem('authToken') || null,
  currentSessionId: null,
  bridgeStartTime: Date.now(),
  isUserAdmin: false,
  currentLang: localStorage.getItem('appLang') || 'ar',
  tg: window.Telegram?.WebApp || null,
};

// 2. Built-in Internationalization (Fallback + Extensible)
const i18n = window.i18n || {
  ar: {
    copied: "تم النسخ بنجاح!",
    network_error: "خطأ في الاتصال بالشباكة، يرجى المحاولة لاحقاً.",
    btn_edit: "تعديل",
    cancel: "إلغاء",
    btn_launch_ad: "إطلاق الحملة",
    go_button: "الانتقال إلى الرابط",
    btn_shorten: "اختصار الرابط",
    btn_submit_withdraw: "تأكيد طلب السحب",
    status_pending: "قيد المراجعة",
    status_completed: "مكتمل",
    status_rejected: "مرفوض",
    status_active: "نشط",
    status_disabled: "معطل",
    untitled_link: "رابط بدون عنوان"
  },
  en: {
    copied: "Copied to clipboard!",
    network_error: "Network error. Please try again.",
    btn_edit: "Edit",
    cancel: "Cancel",
    btn_launch_ad: "Launch Campaign",
    go_button: "Continue to Link",
    btn_shorten: "Shorten Link",
    btn_submit_withdraw: "Submit Withdrawal",
    status_pending: "Pending",
    status_completed: "Completed",
    status_rejected: "Rejected",
    status_active: "Active",
    status_disabled: "Disabled",
    untitled_link: "Untitled Link"
  }
};

// 3. Security & Utility Functions
function escapeHTML(str) {
  if (!str && str !== 0) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function triggerHaptic(style = 'light') {
  try {
    if (APP.tg?.isVersionAtLeast?.('6.1') && APP.tg?.HapticFeedback) {
      APP.tg.HapticFeedback.impactOccurred(style);
    }
  } catch (e) {
    // Graceful fallback for web views
  }
}

function getText(key, fallback = '') {
  const langDict = i18n[APP.currentLang] || i18n['en'];
  return langDict[key] || fallback || key;
}

function applyLanguage(lang) {
  if (i18n[lang]) {
    APP.currentLang = lang;
    localStorage.setItem('appLang', lang);
    document.querySelectorAll('[data-i18n]').forEach(elem => {
      const key = elem.getAttribute('data-i18n');
      if (i18n[lang][key]) {
        elem.innerText = i18n[lang][key];
      }
    });
  }
}

function showToast(msg) {
  triggerHaptic('medium');
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.innerText = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 3000);
}

function copyToClipboard(text) {
  if (!text) return;
  navigator.clipboard.writeText(text)
    .then(() => showToast(getText('copied')))
    .catch(() => showToast(APP.currentLang === 'ar' ? "فشل النسخ تلقائياً" : "Failed to copy"));
}

function setButtonLoading(btnId, isLoading, defaultTextHtml = '') {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  if (isLoading) {
    btn.disabled = true;
    btn.dataset.oldContent = btn.innerHTML;
    btn.innerHTML = `<div class="spinner"></div>`;
  } else {
    btn.disabled = false;
    btn.innerHTML = defaultTextHtml || btn.dataset.oldContent || '';
  }
}

// 4. Core API Engine with Robust Authentication Routing
async function safeFetch(endpoint, options = {}) {
  options.headers = options.headers || {};
  if (APP.authToken) {
    options.headers['Authorization'] = `Bearer ${APP.authToken}`;
  }

  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const targetUrl = endpoint.startsWith('http') ? endpoint : `${APP.apiBase}${cleanEndpoint}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000); // 12-second network timeout
  options.signal = controller.signal;

  try {
    let response = await fetch(targetUrl, options);
    clearTimeout(timeoutId);

    if (response.status === 401) {
      const reAuthSuccess = await authLogin();
      if (reAuthSuccess) {
        options.headers['Authorization'] = `Bearer ${APP.authToken}`;
        response = await fetch(targetUrl, options);
      }
    }
    return response;
  } catch (err) {
    clearTimeout(timeoutId);
    console.error("Fetch Execution Error:", err);
    showToast(getText('network_error'));
    return null;
  }
}

// 5. User & Authentication Services
async function authLogin() {
  const startParam = APP.tg?.initDataUnsafe?.start_param || null;
  try {
    const res = await safeFetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(APP.tg?.initData ? { 'x-telegram-init-data': APP.tg.initData } : { 'x-demo-user-id': 'DEMO_USER_DEV' })
      },
      body: JSON.stringify({
        referrerId: startParam,
        telegramUserInfo: APP.tg?.initDataUnsafe?.user || {}
      })
    });
    if (!res) return false;
    const data = await res.json();
    if (data && data.token) {
      APP.authToken = data.token;
      localStorage.setItem('authToken', APP.authToken);
      APP.isUserAdmin = !!data.isAdmin;
      return true;
    }
  } catch (e) {
    console.error("Authentication Service Failed:", e);
    showToast(APP.currentLang === 'ar' ? "فشل الاتصال بمركز المصادقة" : "Authentication failed");
  }
  return false;
}

function renderTelegramUser() {
  const u = APP.tg?.initDataUnsafe?.user;
  const avatarContainer = document.getElementById('user-avatar-container');
  const nameElem = document.getElementById('user-display-name');
  const handleElem = document.getElementById('user-display-handle');
  const idElem = document.getElementById('user-tg-id');
  const premiumBadge = document.getElementById('user-premium-badge');

  if (u) {
    const fullName = `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username || 'Telegram User';
    if (nameElem) nameElem.innerText = fullName;
    if (handleElem) handleElem.innerText = u.username ? `@${u.username}` : '@no_username';
    if (idElem) idElem.innerText = `ID: ${u.id}`;

    if (premiumBadge) premiumBadge.classList.toggle('hidden', !u.is_premium);

    if (avatarContainer) {
      if (u.photo_url) {
        avatarContainer.innerHTML = `<img src="${escapeHTML(u.photo_url)}" class="user-avatar-img" alt="Avatar">`;
      } else {
        const letter = (u.first_name || 'U').charAt(0).toUpperCase();
        avatarContainer.innerHTML = `<div class="user-avatar-placeholder">${escapeHTML(letter)}</div>`;
      }
    }

    const savedLang = localStorage.getItem('appLang');
    if (savedLang && i18n[savedLang]) APP.currentLang = savedLang;
    else if (u.language_code && i18n[u.language_code]) APP.currentLang = u.language_code;
    else APP.currentLang = 'en';

  } else {
    if (nameElem) nameElem.innerText = 'Demo User';
    if (handleElem) handleElem.innerText = '@demo_user';
    if (idElem) idElem.innerText = 'ID: 000000000';
    if (avatarContainer) avatarContainer.innerHTML = `<div class="user-avatar-placeholder">D</div>`;
    if (!localStorage.getItem('appLang')) APP.currentLang = 'en';
  }

  applyLanguage(APP.currentLang);
}

// 6. UI Navigation & View Controls
function switchTab(tabId) {
  if (tabId === 'admin' && !APP.isUserAdmin) return;
  triggerHaptic('light');

  document.querySelectorAll('.tg-nav-dock button').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('#app-view > div[id^="tab-content-"]').forEach(c => c.classList.add('hidden'));

  const targetBtn = document.getElementById(`tab-btn-${tabId}`);
  if (targetBtn) targetBtn.classList.add('active');

  const tabContent = document.getElementById(`tab-content-${tabId}`);
  if (tabContent) tabContent.classList.remove('hidden');

  if (tabId === 'admin') loadAdminData();
}

function handleNetworkChange(networkVal) {
  triggerHaptic('light');
  const trcCard = document.getElementById('card-addr-trc20');
  const bepCard = document.getElementById('card-addr-bep20');

  if (trcCard) trcCard.classList.add('hidden');
  if (bepCard) bepCard.classList.add('hidden');

  if (networkVal === 'USDT_TRC20' && trcCard) trcCard.classList.remove('hidden');
  else if (networkVal === 'USDT_BEP20' && bepCard) bepCard.classList.remove('hidden');
}

function switchWalletView(view) {
  triggerHaptic('light');
  document.getElementById('wallet-nav-deposit')?.classList.toggle('active', view === 'deposit');
  document.getElementById('wallet-nav-withdraw')?.classList.toggle('active', view === 'withdraw');

  document.getElementById('wallet-view-deposit')?.classList.toggle('hidden', view !== 'deposit');
  document.getElementById('wallet-view-withdraw')?.classList.toggle('hidden', view !== 'withdraw');
}

function toggleInstructionsModal(show) {
  triggerHaptic('medium');
  document.getElementById('instructions-modal')?.classList.toggle('hidden', !show);
}

function toggleWalletEdit() {
  triggerHaptic('light');
  const walletInput = document.getElementById('default-wallet');
  const editBtn = document.getElementById('edit-wallet-btn');
  const saveBtn = document.getElementById('save-wallet-btn');

  if (!walletInput) return;

  if (walletInput.hasAttribute('readonly')) {
    walletInput.removeAttribute('readonly');
    walletInput.focus();
    if (editBtn) {
      editBtn.innerText = getText('cancel');
      editBtn.className = "btn-small btn-danger";
    }
    if (saveBtn) saveBtn.classList.remove('hidden');
  } else {
    walletInput.setAttribute('readonly', 'readonly');
    if (editBtn) {
      editBtn.innerText = getText('btn_edit');
      editBtn.className = "btn-small btn-warning";
    }
    if (saveBtn) saveBtn.classList.add('hidden');
  }
}

function updateWithdrawCalculations() {
  const amtInput = document.getElementById('withdraw-amount');
  const feeBox = document.getElementById('withdraw-fee-box');
  const val = parseFloat(amtInput?.value) || 0;

  if (val > 0) {
    if (feeBox) feeBox.classList.remove('hidden');
    const fee = val * 0.10;
    const net = val - fee;

    document.getElementById('calc-req').innerText = `$${val.toFixed(2)}`;
    document.getElementById('calc-fee').innerText = `$${fee.toFixed(2)}`;
    document.getElementById('calc-net').innerText = `$${net.toFixed(2)}`;
  } else {
    if (feeBox) feeBox.classList.add('hidden');
  }
}

function shareReferralLink() {
  const refUrl = document.getElementById('ref-link')?.value;
  if (!refUrl) return;
  triggerHaptic('medium');
  const shareText = encodeURIComponent(
    APP.currentLang === 'ar'
      ? "انضم إليّ في أفضل منصة لاختصار الروابط واكسب الأرباح بسهولة! 🚀"
      : "Join me on the best url shortener platform & earn money! 🚀"
  );
  const url = `https://t.me/share/url?url=${encodeURIComponent(refUrl)}&text=${shareText}`;

  if (APP.tg?.openTelegramLink) APP.tg.openTelegramLink(url);
  else window.open(url, '_blank');
}

// 7. Core Business Operations (UserData, Links, Ads, Withdrawals)
async function loadUserData() {
  try {
    const res = await safeFetch('/api/user/data');
    if (!res) return;
    const data = await res.json();
    if (!data || !data.user) return;

    APP.isUserAdmin = !!data.isAdmin;
    document.getElementById('tab-btn-admin')?.classList.toggle('hidden', !APP.isUserAdmin);

    document.getElementById('pending-bal').innerText = `$${(data.user.pendingBalance || 0).toFixed(2)}`;
    document.getElementById('avail-bal').innerText = `$${(data.user.availableBalance || 0).toFixed(2)}`;
    document.getElementById('ref-earnings').innerText = `$${(data.user.referralEarnings || 0).toFixed(2)}`;
    
    const walletInput = document.getElementById('default-wallet');
    if (walletInput) {
      walletInput.value = data.user.defaultWallet || '';
      walletInput.setAttribute('readonly', 'readonly');
    }
    
    const editBtn = document.getElementById('edit-wallet-btn');
    if (editBtn) {
      editBtn.innerText = getText('btn_edit');
      editBtn.className = "btn-small btn-warning";
    }
    document.getElementById('save-wallet-btn')?.classList.add('hidden');

    const botUsername = APP.tg?.initDataUnsafe?.bot?.username || 'Ads_telegabot';
    const refInput = document.getElementById('ref-link');
    if (refInput) refInput.value = `https://t.me/${botUsername}?start=${data.user._id}`;

    // Render Announcements
    if (data.announcements && data.announcements.length > 0) {
      document.getElementById('announcement-box')?.classList.remove('hidden');
      document.getElementById('anc-title').innerText = data.announcements[0].title;
      document.getElementById('anc-content').innerText = data.announcements[0].content;
    }

    // Render Withdraw History
    const withdrawsContainer = document.getElementById('withdraws-list');
    if (withdrawsContainer) {
      if (!data.withdraws || data.withdraws.length === 0) {
        withdrawsContainer.innerHTML = APP.currentLang === 'ar' ? 'لا توجد طلبات سحب سابقة.' : 'No withdrawal history.';
      } else {
        withdrawsContainer.innerHTML = data.withdraws.map(w => {
          let statusColor = 'var(--warning)';
          let statusText = getText('status_pending');
          if (w.status === 'Completed') { statusColor = 'var(--success)'; statusText = getText('status_completed'); }
          else if (w.status === 'Rejected') { statusColor = 'var(--danger)'; statusText = getText('status_rejected'); }

          return `
          <div style="background: #0d1527; padding: 8px; margin-bottom: 6px; border-radius: 6px; border: 1px solid var(--border-color);">
            <div style="display: flex; justify-content: space-between;">
              <span>Amount: <b>$${parseFloat(w.amount || 0).toFixed(2)}</b></span>
              <span style="color: ${statusColor}; font-weight: bold;">${statusText}</span>
            </div>
            <div style="color: var(--text-muted); font-size: 11px; margin-top: 2px; word-break: break-all;">Wallet: ${escapeHTML(w.walletAddress)}</div>
            ${w.rejectReason ? `<div style="color: var(--danger); font-size: 11px; margin-top: 2px;">Reason: ${escapeHTML(w.rejectReason)}</div>` : ''}
          </div>`;
        }).join('');
      }
    }

    // Render User Links
    const linksContainer = document.getElementById('links-list');
    if (linksContainer) {
      if (!data.links || data.links.length === 0) {
        linksContainer.innerHTML = APP.currentLang === 'ar' ? 'لا توجد روابط مُختصرة حالياً.' : 'No short links created yet.';
      } else {
        linksContainer.innerHTML = data.links.map(l => {
          const shortUrl = `${APP.apiBase}/r/${l.shortCode}`;
          const statusColor = l.isActive ? 'var(--success)' : 'var(--danger)';
          const statusText = l.isActive ? getText('status_active') : getText('status_disabled');
          return `
          <div class="link-item" style="border-left: 3px solid ${statusColor}; border-right: 3px solid ${statusColor};">
            <div class="link-header">
              <b>${escapeHTML(l.title || getText('untitled_link'))}</b>
              <span style="font-size: 10px; color: ${statusColor};">${statusText}</span>
            </div>
            <div style="color:var(--text-muted); font-size:11px; margin-bottom:4px; word-break: break-all;">${escapeHTML(shortUrl)}</div>
            <div>Views: <b>${l.views || 0}</b> | Valid: <b style="color:var(--success);">${l.validImpressions || 0}</b></div>
            <div class="link-actions">
              <button class="btn-small" onclick="copyToClipboard('${escapeHTML(shortUrl)}')">Copy</button>
              <button class="btn-small ${l.isActive ? 'btn-danger' : 'btn-warning'}" onclick="toggleLinkStatus('${l._id}')">${l.isActive ? (APP.currentLang === 'ar' ? 'تعطيل' : 'Disable') : (APP.currentLang === 'ar' ? 'تفعيل' : 'Enable')}</button>
            </div>
          </div>`;
        }).join('');
      }
    }

    // Render User Ads
    const adsContainer = document.getElementById('ads-list');
    if (adsContainer) {
      if (!data.ads || data.ads.length === 0) {
        adsContainer.innerHTML = APP.currentLang === 'ar' ? 'لا توجد حملات إعلانية نشطة حالياً.' : 'No active ad campaigns.';
      } else {
        adsContainer.innerHTML = data.ads.map(ad => {
          let statusColor = ad.status === 'active' ? 'var(--success)' : (ad.status === 'paused' ? 'var(--warning)' : 'var(--text-muted)');
          return `
          <div class="ad-item" style="border-left: 3px solid ${statusColor};">
            <div class="ad-header">
              <b>${escapeHTML(ad.title)}</b>
              <span style="font-size: 10px; color: ${statusColor};">${escapeHTML(ad.status ? ad.status.toUpperCase() : '')}</span>
            </div>
            <div style="color:var(--text-muted); font-size:11px; margin-bottom:4px; word-break: break-all;">${escapeHTML(ad.targetUrl)}</div>
            <div>Remaining Budget: <b style="color:var(--success);">$${(ad.remainingBudget || 0).toFixed(2)}</b> / $${parseFloat(ad.totalBudget || 0).toFixed(2)} | Views: <b>${ad.impressionsCount || 0}</b></div>
            <div class="ad-actions">
              ${ad.status !== 'completed' ? `<button class="btn-small ${ad.status === 'active' ? 'btn-warning' : 'btn-success'}" onclick="toggleAdStatus('${ad._id}')">${ad.status === 'active' ? (APP.currentLang === 'ar' ? 'إيقاف مؤقت' : 'Pause') : (APP.currentLang === 'ar' ? 'تفعيل' : 'Activate')}</button>` : ''}
            </div>
          </div>`;
        }).join('');
      }
    }

  } catch (err) {
    console.error("Error Loading User Data Component:", err);
  }
}

async function handleShortenClick() {
  const title = document.getElementById('link-title')?.value;
  const targetUrl = document.getElementById('link-url')?.value;

  if (!targetUrl) return showToast(APP.currentLang === 'ar' ? "يرجى إدخال الرابط الأصلي بشكل صحيح" : "Please enter valid URL");

  triggerHaptic('light');
  setButtonLoading('btn-create-link', true);

  try {
    const res = await safeFetch('/api/links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, targetUrl })
    });
    if (!res) return;
    const data = await res.json();
    if (data.error) showToast(data.error);
    else {
      showToast(APP.currentLang === 'ar' ? "تم إنشاء الرابط بنجاح!" : "Link created successfully!");
      document.getElementById('link-title').value = '';
      document.getElementById('link-url').value = '';
      await loadUserData();
    }
  } catch (e) {
    showToast(APP.currentLang === 'ar' ? "حدث خطأ غير متوقع" : "Unexpected error");
  } finally {
    setButtonLoading('btn-create-link', false, `<span data-i18n="btn_shorten">${getText('btn_shorten')}</span>`);
  }
}

async function toggleLinkStatus(linkId) {
  triggerHaptic('light');
  try {
    const res = await safeFetch('/api/links/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ linkId })
    });
    if (!res) return;
    const data = await res.json();
    if (data.error) showToast(data.error);
    else {
      showToast(data.isActive ? (APP.currentLang === 'ar' ? "تم تفعيل الرابط" : "Link activated") : (APP.currentLang === 'ar' ? "تم تعطيل الرابط" : "Link disabled"));
      await loadUserData();
    }
  } catch (e) {
    showToast(APP.currentLang === 'ar' ? "خطأ أثناء تغيير حالة الرابط" : "Error toggling link status");
  }
}

async function createAdCampaign() {
  const title = document.getElementById('ad-title')?.value;
  const targetUrl = document.getElementById('ad-target-url')?.value;
  const totalBudget = document.getElementById('ad-budget')?.value;

  if (!title || !targetUrl || !totalBudget) return showToast(APP.currentLang === 'ar' ? "يرجى ملء جميع البيانات المطلوبة" : "Please fill in all details");

  triggerHaptic('medium');
  setButtonLoading('btn-create-ad', true);

  try {
    const res = await safeFetch('/api/ads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, targetUrl, totalBudget })
    });
    if (!res) return;
    const data = await res.json();
    if (data.error) showToast(data.error);
    else {
      showToast(APP.currentLang === 'ar' ? "تم إنشاء الحملة بنجاح!" : "Ad campaign launched!");
      document.getElementById('ad-title').value = '';
      document.getElementById('ad-target-url').value = '';
      document.getElementById('ad-budget').value = '';
      await loadUserData();
    }
  } catch (e) {
    showToast(APP.currentLang === 'ar' ? "خطأ أثناء إطلاق الحملة" : "Error launching campaign");
  } finally {
    setButtonLoading('btn-create-ad', false, `<span data-i18n="btn_launch_ad">${getText('btn_launch_ad')}</span>`);
  }
}

async function toggleAdStatus(adId) {
  triggerHaptic('light');
  try {
    const res = await safeFetch('/api/ads/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adId })
    });
    if (!res) return;
    const data = await res.json();
    if (data.error) showToast(data.error);
    else {
      showToast(APP.currentLang === 'ar' ? "تم تحديث حالة الحملة الإعلانية" : "Ad status updated");
      await loadUserData();
    }
  } catch (e) {
    showToast(APP.currentLang === 'ar' ? "خطأ أثناء تعديل حالة الإعلان" : "Error toggling ad status");
  }
}

async function requestDeposit() {
  const amount = document.getElementById('deposit-amount')?.value;
  const paymentMethod = document.getElementById('deposit-network')?.value;
  const txHash = document.getElementById('deposit-txhash')?.value;

  if (!paymentMethod) return showToast(APP.currentLang === 'ar' ? "يرجى تحديد نوع الشبكة أولاً" : "Select deposit network");
  if (!amount || amount <= 0) return showToast(APP.currentLang === 'ar' ? "يرجى إدخال مبلغ الشحن الصحيح" : "Enter a valid amount");
  if (!txHash || txHash.trim().length < 8) return showToast(APP.currentLang === 'ar' ? "يرجى إدخال رمز المعاملة TxID بشكل صحيح" : "Enter valid TxID");

  triggerHaptic('medium');
  setButtonLoading('btn-request-deposit', true);

  try {
    const res = await safeFetch('/api/deposit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, paymentMethod, txHash })
    });
    if (!res) return;
    const data = await res.json();
    if (data.error) showToast(data.error);
    else {
      showToast(APP.currentLang === 'ar' ? "تم إرسال طلب الشحن بنجاح!" : "Deposit submitted!");
      document.getElementById('deposit-amount').value = '';
      document.getElementById('deposit-txhash').value = '';
      document.getElementById('deposit-network').value = '';
      handleNetworkChange('');
      await loadUserData();
    }
  } catch (e) {
    showToast(APP.currentLang === 'ar' ? "خطأ أثناء تقديم طلب الشحن" : "Error submitting deposit");
  } finally {
    setButtonLoading('btn-request-deposit', false, `<span>${APP.currentLang === 'ar' ? 'تأكيد وإرسال طلب الشحن' : 'Submit Deposit Request'}</span>`);
  }
}

async function requestWithdrawal() {
  const amount = parseFloat(document.getElementById('withdraw-amount')?.value);
  const walletAddress = document.getElementById('default-wallet')?.value;

  if (!walletAddress) return showToast(APP.currentLang === 'ar' ? "يرجى إدخال عنوان محفظة السحب أولاً" : "Enter wallet address");
  if (!amount || amount < 30) return showToast(APP.currentLang === 'ar' ? "الحد الأدنى للسحب هو 30$" : "Minimum withdrawal is $30");

  triggerHaptic('medium');
  setButtonLoading('btn-request-withdraw', true);

  try {
    const res = await safeFetch('/api/withdraw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, walletAddress })
    });
    if (!res) return;
    const data = await res.json();
    if (data.error) showToast(data.error);
    else {
      showToast(APP.currentLang === 'ar' ? "تم تقديم طلب السحب بنجاح!" : "Withdrawal requested!");
      document.getElementById('withdraw-amount').value = '';
      document.getElementById('withdraw-fee-box')?.classList.add('hidden');
      await loadUserData();
    }
  } catch (e) {
    showToast(APP.currentLang === 'ar' ? "خطأ أثناء معالجة الطلب" : "Error processing withdrawal");
  } finally {
    setButtonLoading('btn-request-withdraw', false, `<span data-i18n="btn_submit_withdraw">${getText('btn_submit_withdraw')}</span>`);
  }
}

async function saveSettings() {
  const defaultWallet = document.getElementById('default-wallet')?.value;
  if (!defaultWallet || defaultWallet.trim().length < 5) {
    return showToast(APP.currentLang === 'ar' ? "عنوان المحفظة غير صالح" : "Invalid wallet address");
  }
  triggerHaptic('light');
  try {
    const res = await safeFetch('/api/user/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ defaultWallet })
    });
    if (!res) return;
    const data = await res.json();
    if (data.error) showToast(data.error);
    else {
      showToast(APP.currentLang === 'ar' ? "تم حفظ المحفظة بنجاح" : "Wallet saved successfully");
      await loadUserData();
    }
  } catch (e) {
    showToast(APP.currentLang === 'ar' ? "خطأ أثناء حفظ الإعدادات" : "Error saving settings");
  }
}

// 8. Dynamic Shortener Bridge & Impression Engine
async function initBridge() {
  const pathParts = window.location.pathname.split('/r/');
  const shortCode = pathParts[1];
  APP.bridgeStartTime = Date.now();

  try {
    const res = await safeFetch('/api/init-click', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ linkCode: shortCode })
    });
    if (res) {
      const data = await res.json();
      if (data.error) showToast(data.error);
      else {
        APP.currentSessionId = data.sessionId;
        if (data.adSource === 'internal' && data.adData) {
          renderInternalAd(data.adData);
        } else if (window.Adsgram && data.blockId) {
          window.Adsgram.init({ blockId: data.blockId }).show().catch(() => renderFallbackAd());
        } else {
          renderFallbackAd();
        }
      }
    } else {
      renderFallbackAd();
    }
  } catch (err) {
    renderFallbackAd();
  }

  let timeLeft = 5;
  const timerElem = document.getElementById('timer');
  const goBtn = document.getElementById('go-btn');
  const interval = setInterval(() => {
    timeLeft--;
    if (timerElem) timerElem.innerText = timeLeft;
    if (timeLeft <= 0) {
      clearInterval(interval);
      if (goBtn) goBtn.disabled = false;
    }
  }, 1000);
}

function renderInternalAd(adData) {
  const container = document.getElementById('ad-container');
  if (!container) return;
  container.innerHTML = `
    <div style="background: rgba(59, 130, 246, 0.1); border: 1px solid var(--accent); border-radius: 10px; padding: 16px; width: 100%; text-align: center;">
      <span style="font-size: 10px; color: var(--accent); background: rgba(59,130,246,0.2); padding: 2px 6px; border-radius: 4px;">Sponsored Ad</span>
      <h3 style="margin: 8px 0; font-size: 16px; color: var(--text);">${escapeHTML(adData.title)}</h3>
      <a href="${escapeHTML(adData.targetUrl)}" target="_blank" rel="noopener noreferrer" style="display: inline-block; margin-top: 6px; padding: 8px 16px; background: var(--accent); color: #fff; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 12px;">Visit Ad ↗</a>
    </div>
  `;
}

function renderFallbackAd() {
  const container = document.getElementById('ad-container');
  if (!container) return;
  container.innerHTML = `<iframe src="https://adsterra.com/preview" width="100%" height="220" frameborder="0"></iframe>`;
}

async function completeImpression() {
  triggerHaptic('medium');
  setButtonLoading('go-btn', true);
  const shortCode = window.location.pathname.split('/r/')[1];
  const duration = Math.floor((Date.now() - APP.bridgeStartTime) / 1000);

  try {
    const res = await safeFetch('/api/impression', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ linkCode: shortCode, sessionId: APP.currentSessionId, duration })
    });
    if (!res) return;
    const data = await res.json();
    if (data.targetUrl) {
      window.location.href = data.targetUrl;
    } else {
      setButtonLoading('go-btn', false, `<span data-i18n="go_button">${getText('go_button')}</span>`);
      showToast(data.error || (APP.currentLang === 'ar' ? "خطأ أثناء عملية التوجيه" : "Redirection error"));
    }
  } catch (err) {
    setButtonLoading('go-btn', false, `<span data-i18n="go_button">${getText('go_button')}</span>`);
    showToast(APP.currentLang === 'ar' ? "فشل الاتصال بالخادم" : "Server connection failed");
  }
}

// 9. Administrative Control Panel Engine
async function loadAdminData() {
  try {
    const res = await safeFetch('/api/admin/dashboard-data');
    if (!res) return;
    const data = await res.json();
    if (data.error) return showToast(data.error);

    const usersElem = document.getElementById('admin-total-users');
    const pendingElem = document.getElementById('admin-total-pending');
    if (usersElem) usersElem.innerText = data.stats?.totalUsers || 0;
    if (pendingElem) pendingElem.innerText = `$${(data.stats?.totalPending || 0).toFixed(2)}`;

    const dList = document.getElementById('admin-deposits-list');
    if (dList) {
      if (!data.deposits || data.deposits.length === 0) dList.innerHTML = 'No pending deposit requests.';
      else {
        dList.innerHTML = data.deposits.map(d => `
          <div style="background:#0d1527; padding:8px; margin-bottom:6px; border-radius:6px; border: 1px solid var(--border-color);">
            User: <b>${escapeHTML(d.advertiserId?.username || d.advertiserId?.telegramId || 'Unknown')}</b><br>
            Amount: <b style="color:var(--success);">$${parseFloat(d.amount || 0).toFixed(2)}</b> | Network: <code>${escapeHTML(d.paymentMethod)}</code><br>
            TxID: <code style="color: var(--warning); word-break: break-all;">${escapeHTML(d.txHash || 'N/A')}</code><br>
            <div style="margin-top: 6px; display: flex; gap: 4px;">
              <button class="btn-small btn-success" onclick="handleAdminDeposit('${d._id}', 'Completed')">Approve</button>
              <button class="btn-small btn-danger" onclick="handleAdminDeposit('${d._id}', 'Rejected')">Reject</button>
            </div>
          </div>
        `).join('');
      }
    }

    const wList = document.getElementById('admin-withdraws-list');
    if (wList) {
      if (!data.withdraws || data.withdraws.length === 0) wList.innerHTML = 'No pending withdrawal requests.';
      else {
        wList.innerHTML = data.withdraws.map(w => `
          <div style="background:#0d1527; padding:8px; margin-bottom:6px; border-radius:6px; border: 1px solid var(--border-color);">
            User: <b>${escapeHTML(w.userId?.username || w.userId?.telegramId || 'Unknown')}</b><br>
            Amount: <b style="color:var(--success);">$${parseFloat(w.amount || 0).toFixed(2)}</b><br>
            Wallet: <code>${escapeHTML(w.walletAddress)}</code><br>
            <div style="margin-top: 6px; display: flex; gap: 4px;">
              <button class="btn-small btn-success" onclick="handleAdminWithdraw('${w._id}', 'Completed')">Approve</button>
              <button class="btn-small btn-danger" onclick="handleAdminWithdraw('${w._id}', 'Rejected')">Reject</button>
            </div>
          </div>
        `).join('');
      }
    }
  } catch (err) {
    console.error("Error Loading Admin Dashboard Data:", err);
  }
}

async function handleAdminDeposit(depositId, status) {
  triggerHaptic('medium');
  try {
    const res = await safeFetch('/api/admin/deposit/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ depositId, status })
    });
    if (!res) return;
    const data = await res.json();
    if (data.error) showToast(data.error);
    else {
      showToast(APP.currentLang === 'ar' ? "تم تحديث طلب الشحن" : "Deposit status updated");
      await loadAdminData();
    }
  } catch (e) {
    showToast(APP.currentLang === 'ar' ? "حدث خطأ في عملية الإشراف" : "Admin action error");
  }
}

async function handleAdminWithdraw(withdrawId, status) {
  triggerHaptic('medium');
  try {
    const res = await safeFetch('/api/admin/withdraw/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ withdrawId, status })
    });
    if (!res) return;
    const data = await res.json();
    if (data.error) showToast(data.error);
    else {
      showToast(APP.currentLang === 'ar' ? "تم تحديث طلب السحب" : "Withdrawal status updated");
      await loadAdminData();
    }
  } catch (e) {
    showToast(APP.currentLang === 'ar' ? "حدث خطأ في عملية الإشراف" : "Admin action error");
  }
}

// 10. Core Application Lifecycle Initialization
async function initializeApp() {
  try {
    if (APP.tg) {
      APP.tg.ready();
      APP.tg.expand();
    }

    renderTelegramUser();

    if (!APP.authToken) {
      await authLogin();
    }

    if (window.location.pathname.includes('/r/')) {
      document.getElementById('bridge-view')?.classList.remove('hidden');
      await initBridge();
    } else {
      document.getElementById('app-view')?.classList.remove('hidden');
      await loadUserData();
    }
  } catch (err) {
    console.error("Initialization Failed:", err);
  }
}

// DOM Lifecycle Entrypoint
document.addEventListener('DOMContentLoaded', initializeApp);
