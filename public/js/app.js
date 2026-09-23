/**
 * Telegram Mini App - Main Interactive Core Controller (app.js)
 * Clean Modular Architecture for Link Shortener, Ads Platform & Wallet System
 */

// ==========================================
// 1. STATE & GLOBAL CONFIGURATION
// ==========================================
const API_BASE = window.location.protocol.startsWith('file')
  ? 'http://localhost:3000'
  : window.location.origin;

let authToken = localStorage.getItem('authToken');
let currentSessionId = null;
let bridgeToken = null;
let bridgeStartTime = Date.now();
let isUserAdmin = false;
let currentLang = 'ar';

const tg = window.Telegram?.WebApp;

let currentUserTelegramId = null;
const storedTelegramId = localStorage.getItem('telegramId');

if (tg?.initDataUnsafe?.user?.id) {
  currentUserTelegramId = String(tg.initDataUnsafe.user.id);
  localStorage.setItem('telegramId', currentUserTelegramId);
} else {
  currentUserTelegramId = storedTelegramId || null;
}

let rawUserLinksCache = [];
let bridgeDestinationUrl = null;
let currentShortCode = null;

// ==========================================
// 2. INTERNATIONALIZATION (i18n)
// ==========================================
const i18n = {
  ar: {
    copied: "تم النسخ بنجاح!",
    network_error: "خطأ في الاتصال بالشبكة",
    link_success_msg: "تم اختصار الرابط بنجاح!",
    btn_copy: "نسخ",
    cancel: "إلغاء",
    btn_edit: "تعديل",
    access_denied: "غير مصرح لك بالوصول للوحة التحكم",
    wallet_saved: "تم حفظ العنوان بنجاح",
    deposit_success: "تم تقديم طلب الشحن بنجاح! سيتم مراجعته قريباً.",
    withdraw_success: "تم تقديم طلب السحب بنجاح",
    ad_success: "تم إطلاق الحملة الإعلانية بنجاح!",
    delete_confirm: "هل أنت تأكد من حذف هذا الرابط؟",
    delete_success: "تم حذف الرابط بنجاح",
    enter_original_url: "يرجى إدخال الرابط الأصلي",
    failed_create_link: "فشل إنشاء الرابط المختصر",
    enter_wallet_addr: "يرجى إدخال عنوان المحفظة",
    enter_wallet_first: "يرجى إدخال وتحديد عنوان محفظة السحب أولاً",
    min_withdraw: "الحد الأدنى للسحب هو 30$",
    enter_ad_title: "يرجى إدخال عنوان الإعلان",
    enter_target_url: "يرجى إدخال رابط التوجيه",
    min_budget: "الحد الأدنى لميزانية الحملة هو $5",
    select_network: "يرجى اختيار شبكة الدفع",
    min_deposit: "الحد الأدنى للإيداع هو $1",
    enter_txid: "يرجى إدخال رمز المعاملة (TxID)",
    share_ref_text: "انضم إليّ في أفضل منصة لاختصار الروابط واكسب الأرباح بسهولة! 🚀",
    no_links: "لا توجد روابط مختصرة بعد.",
    no_ads: "لا توجد حملات إعلانية نشطة.",
    no_referrals: "لم تنضم أي إحالات عبر رابطك بعد.",
    no_withdraws: "لا توجد طلبات سحب سابقة."
  },
  en: {
    copied: "Copied successfully!",
    network_error: "Network connection error",
    link_success_msg: "Link shortened successfully!",
    btn_copy: "Copy",
    cancel: "Cancel",
    btn_edit: "Edit",
    access_denied: "Access denied to admin panel",
    wallet_saved: "Wallet address saved successfully",
    deposit_success: "Deposit request submitted successfully!",
    withdraw_success: "Withdrawal requested successfully!",
    ad_success: "Ad campaign launched successfully!",
    delete_confirm: "Are you sure you want to delete this link?",
    delete_success: "Link deleted successfully",
    enter_original_url: "Please enter original URL",
    failed_create_link: "Failed to create short link",
    enter_wallet_addr: "Please enter wallet address",
    enter_wallet_first: "Please define withdrawal wallet address first",
    min_withdraw: "Minimum withdrawal is $30",
    enter_ad_title: "Please enter ad title",
    enter_target_url: "Please enter target URL",
    min_budget: "Minimum campaign budget is $5",
    select_network: "Please select payment network",
    min_deposit: "Minimum deposit amount is $1",
    enter_txid: "Please enter transaction TxID / Hash",
    share_ref_text: "Join me on the best URL shortener platform & earn money! 🚀",
    no_links: "No shortened links found.",
    no_ads: "No active ad campaigns.",
    no_referrals: "No referrals registered yet.",
    no_withdraws: "No withdrawal history found."
  }
};

function t(key) {
  return i18n[currentLang]?.[key] || i18n['ar']?.[key] || key;
}

function applyLanguage(lang) {
  currentLang = lang && i18n[lang] ? lang : 'ar';
  document.documentElement.lang = currentLang;
  document.documentElement.dir = currentLang === 'ar' ? 'rtl' : 'ltr';
  localStorage.setItem('appLang', currentLang);
}

// ==========================================
// 3. TELEGRAM WEBAPP INTEGRATION
// ==========================================
function initTelegramWebApp() {
  if (!tg) return;

  try {
    tg.ready();
    tg.expand();

    if (tg.setHeaderColor) tg.setHeaderColor('secondary');
    if (tg.setBackgroundColor) tg.setBackgroundColor('bg_color');

    if (tg.MainButton) {
      tg.MainButton.setParams({
        is_visible: false,
        color: '#3b82f6',
        text_color: '#ffffff'
      });
    }

    if (tg.BackButton) {
      tg.BackButton.onClick(() => {
        switchTab('dashboard');
        tg.BackButton.hide();
      });
    }
  } catch (err) {
    console.warn('Telegram WebApp setup error:', err);
  }
}

function triggerHaptic(style = 'light') {
  try {
    if (tg && tg.isVersionAtLeast && tg.isVersionAtLeast('6.1') && tg.HapticFeedback) {
      tg.HapticFeedback.impactOccurred(style);
    }
  } catch (e) {}
}

// ==========================================
// 4. UI UTILITIES & HELPERS
// ==========================================
function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function showToast(msg) {
  triggerHaptic('medium');
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.innerText = msg;
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3200);
}

function copyToClipboard(text) {
  if (!text) return;
  navigator.clipboard
    .writeText(text)
    .then(() => showToast(t('copied')))
    .catch(() => showToast(currentLang === 'ar' ? 'فشل النسخ تلقائياً' : 'Failed to copy'));
}

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

// ==========================================
// 5. SECURE HTTP CLIENT (safeFetch)
// ==========================================
async function safeFetch(endpoint, options = {}) {
  options.headers = options.headers || {};

  if (!currentUserTelegramId && tg?.initDataUnsafe?.user?.id) {
    currentUserTelegramId = String(tg.initDataUnsafe.user.id);
    localStorage.setItem('telegramId', currentUserTelegramId);
  }

  const initDataStr = window.Telegram?.WebApp?.initData || tg?.initData || '';

  if (initDataStr) {
    options.headers['Authorization'] = `Bearer ${initDataStr}`;
    options.headers['x-telegram-init-data'] = initDataStr;
    options.headers['telegram-init-data'] = initDataStr;
  } else if (authToken) {
    options.headers['Authorization'] = `Bearer ${authToken}`;
  }

  if (currentUserTelegramId) {
    options.headers['x-telegram-id'] = currentUserTelegramId;
    options.headers['telegram-id'] = currentUserTelegramId;
    options.headers['x-user-id'] = currentUserTelegramId;
    options.headers['user-id'] = currentUserTelegramId;
  }

  if (options.body && typeof options.body === 'object') {
    if (currentUserTelegramId && !options.body.userId && !options.body.telegramId) {
      options.body.userId = currentUserTelegramId;
      options.body.telegramId = currentUserTelegramId;
    }
    if (initDataStr && !options.body.initData) {
      options.body.initData = initDataStr;
    }
    options.body = JSON.stringify(options.body);
  }

  if (options.body && !options.headers['Content-Type']) {
    options.headers['Content-Type'] = 'application/json; charset=utf-8';
  }

  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  let targetUrl = endpoint.startsWith('http') ? endpoint : `${API_BASE}${cleanEndpoint}`;

  if (currentUserTelegramId && !targetUrl.includes('telegramId=') && !targetUrl.includes('userId=')) {
    const separator = targetUrl.includes('?') ? '&' : '?';
    targetUrl = `${targetUrl}${separator}telegramId=${encodeURIComponent(currentUserTelegramId)}&userId=${encodeURIComponent(currentUserTelegramId)}`;
  }

  try {
    const response = await fetch(targetUrl, options);
    return response;
  } catch (err) {
    console.error('Fetch Network Error:', err);
    showToast(t('network_error'));
    return null;
  }
}

// ==========================================
// 6. AUTHENTICATION & USER PROFILE
// ==========================================
function renderTelegramUser() {
  const u = tg?.initDataUnsafe?.user;
  const avatarContainer = document.getElementById('user-avatar-container');
  const nameElem = document.getElementById('user-display-name');
  const handleElem = document.getElementById('user-display-handle');
  const idElem = document.getElementById('user-tg-id');
  const premiumBadge = document.getElementById('user-premium-badge');

  if (u && u.id) {
    currentUserTelegramId = String(u.id);
    localStorage.setItem('telegramId', currentUserTelegramId);
    const fullName = `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username || 'Telegram User';

    if (nameElem) nameElem.innerText = fullName;
    if (handleElem) handleElem.innerText = u.username ? `@${u.username}` : '@no_username';
    if (idElem) idElem.innerText = `ID: ${u.id}`;

    if (premiumBadge) {
      premiumBadge.classList.toggle('hidden', !u.is_premium);
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
    if (savedLang && i18n[savedLang]) {
      currentLang = savedLang;
    } else if (u.language_code && i18n[u.language_code]) {
      currentLang = u.language_code === 'ar' ? 'ar' : 'en';
    } else {
      currentLang = 'ar';
    }
  } else {
    if (!currentUserTelegramId) {
      currentUserTelegramId = localStorage.getItem('telegramId') || '123456789';
    }
    if (nameElem) nameElem.innerText = 'Telegram User';
    if (handleElem) handleElem.innerText = '@user';
    if (idElem) idElem.innerText = `ID: ${currentUserTelegramId}`;
    if (avatarContainer) {
      avatarContainer.innerHTML = `<div class="user-avatar-placeholder">U</div>`;
    }
    if (!localStorage.getItem('appLang')) {
      currentLang = 'ar';
    }
  }

  applyLanguage(currentLang);
}

async function authLogin() {
  const startParam = tg?.initDataUnsafe?.start_param || null;
  const u = tg?.initDataUnsafe?.user || {};
  const initDataStr = window.Telegram?.WebApp?.initData || tg?.initData || '';

  try {
    const res = await safeFetch('/api/auth/login', {
      method: 'POST',
      body: {
        userId: currentUserTelegramId,
        telegramId: currentUserTelegramId,
        referrerId: startParam,
        firstName: u.first_name || '',
        lastName: u.last_name || '',
        username: u.username || '',
        photoUrl: u.photo_url || '',
        isPremium: !!u.is_premium,
        initData: initDataStr
      }
    });

    if (!res) return false;
    const data = await res.json().catch(() => ({}));

    if (data && (data.success || data.token)) {
      if (data.token) {
        authToken = data.token;
        localStorage.setItem('authToken', authToken);
      }

      if (data.user && data.user.telegramId) {
        currentUserTelegramId = String(data.user.telegramId);
        localStorage.setItem('telegramId', currentUserTelegramId);
      }

      if (data.isAdmin === true) {
        isUserAdmin = true;
        const adminBtn = document.getElementById('tab-btn-admin');
        if (adminBtn) adminBtn.style.display = 'flex';
      }

      if (data.depositWallets) {
        if (data.depositWallets.trc20) {
          const el = document.getElementById('addr-trc20');
          if (el) el.innerText = data.depositWallets.trc20;
        }
        if (data.depositWallets.bep20) {
          const el = document.getElementById('addr-bep20');
          if (el) el.innerText = data.depositWallets.bep20;
        }
      }

      if (data.botUrl) {
        const bLink = document.getElementById('official-bot-link');
        if (bLink) bLink.href = data.botUrl;
        const sBot = document.getElementById('support-bot-btn');
        if (sBot) sBot.href = data.botUrl;
      }
      if (data.officialChannelUrl) {
        const cLink = document.getElementById('official-channel-link');
        if (cLink) cLink.href = data.officialChannelUrl;
        const sChan = document.getElementById('support-channel-btn');
        if (sChan) sChan.href = data.officialChannelUrl;
      }
      if (data.supportUrl) {
        const sContact = document.getElementById('support-contact-btn');
        if (sContact) sContact.href = data.supportUrl;
      }

      return true;
    }
  } catch (e) {
    console.error('Auth error:', e);
  }
  return false;
}

async function loadUserData() {
  try {
    const res = await safeFetch('/api/user/data');
    if (res && res.ok) {
      const data = await res.json().catch(() => ({}));
      const u = data.user || {};

      const pendingBalElem = document.getElementById('pending-bal');
      const availBalElem = document.getElementById('avail-bal');
      const refEarnElem = document.getElementById('ref-earnings');

      if (pendingBalElem) pendingBalElem.innerText = `$${(u.pendingBalance || 0).toFixed(2)}`;
      if (availBalElem) availBalElem.innerText = `$${(u.availableBalance || 0).toFixed(2)}`;
      if (refEarnElem) refEarnElem.innerText = `$${(u.referralEarnings || 0).toFixed(2)}`;

      const refCountElem = document.getElementById('ref-count');
      if (refCountElem) {
        refCountElem.innerText = data.referralsCount || u.referralsCount || 0;
      }

      const refInput = document.getElementById('ref-link');
      const botUsername = (data.botUsername || 'Ads_telegabot').replace(/^@/, '');
      if (refInput) {
        refInput.value = `https://t.me/${botUsername}?start=${currentUserTelegramId}`;
      }

      const walletInput = document.getElementById('default-wallet');
      if (walletInput && u.defaultWallet) {
        walletInput.value = u.defaultWallet;
      }

      if (data.links && Array.isArray(data.links)) {
        rawUserLinksCache = data.links;
        renderUserLinks(rawUserLinksCache);
      }

      if (data.withdraws && Array.isArray(data.withdraws)) {
        renderWithdrawalsHistory(data.withdraws);
      }

      if (data.ads && Array.isArray(data.ads)) {
        renderUserAds(data.ads);
      }

      if (data.announcements && Array.isArray(data.announcements) && data.announcements.length > 0) {
        const anc = data.announcements[0];
        const ancBox = document.getElementById('announcement-box');
        if (ancBox && anc.title) {
          const ancTitle = document.getElementById('anc-title');
          const ancContent = document.getElementById('anc-content');
          if (ancTitle) ancTitle.innerText = anc.title;
          if (ancContent) ancContent.innerText = anc.content || anc.message || '';
          ancBox.classList.remove('hidden');
        }
      }

      if (data.isAdmin === true) {
        isUserAdmin = true;
        const adminBtn = document.getElementById('tab-btn-admin');
        if (adminBtn) adminBtn.style.display = 'flex';
      }
    }
  } catch (err) {
    console.error('Error loading user data:', err);
  }
}

// ==========================================
// 7. NAVIGATION & TAB SWITCHING
// ==========================================
function switchTab(tabName) {
  if (tabName === 'admin' && !isUserAdmin) {
    showToast(t('access_denied'));
    return;
  }

  triggerHaptic('light');

  if (tg?.BackButton) {
    if (tabName !== 'dashboard') {
      tg.BackButton.show();
    } else {
      tg.BackButton.hide();
    }
  }

  const tabs = ['dashboard', 'wallet', 'ads', 'referral', 'settings', 'admin'];
  tabs.forEach((t) => {
    const content = document.getElementById(`tab-content-${t}`);
    const btn = document.getElementById(`tab-btn-${t}`);
    if (content) content.classList.toggle('hidden', t !== tabName);
    if (btn) btn.classList.toggle('active', t === tabName);
  });

  if (tabName === 'admin' && isUserAdmin) {
    loadAdminData();
  } else if (tabName === 'ads') {
    fetchUserAds();
  } else if (tabName === 'referral') {
    fetchUserReferrals();
  }
}

function switchWalletView(view) {
  triggerHaptic('light');
  const navDeposit = document.getElementById('wallet-nav-deposit');
  const navWithdraw = document.getElementById('wallet-nav-withdraw');
  const viewDeposit = document.getElementById('wallet-view-deposit');
  const viewWithdraw = document.getElementById('wallet-view-withdraw');

  if (navDeposit) navDeposit.classList.toggle('active', view === 'deposit');
  if (navWithdraw) navWithdraw.classList.toggle('active', view === 'withdraw');

  if (viewDeposit) viewDeposit.classList.toggle('hidden', view !== 'deposit');
  if (viewWithdraw) viewWithdraw.classList.toggle('hidden', view !== 'withdraw');
}

function toggleInstructionsModal(show) {
  triggerHaptic('medium');
  const modal = document.getElementById('instructions-modal');
  if (modal) modal.classList.toggle('hidden', !show);
}

// ==========================================
// 8. URL SHORTENER MODULE
// ==========================================
function formatShortUrl(link) {
  if (!link) return '';
  let rawUrl = link.shortUrl || link.shortLink || link.url;
  if (!rawUrl && link.shortCode) {
    rawUrl = `${API_BASE}/r/${link.shortCode}`;
  }
  if (!rawUrl) return '';

  rawUrl = rawUrl.replace(/^(https?:\/\/)+/i, 'https://');

  if (/^https?:\/\//i.test(rawUrl)) {
    return rawUrl;
  }
  rawUrl = rawUrl.replace(/^\/+/, '');
  return `https://${rawUrl}`;
}

async function handleShortenClick(e) {
  if (e) e.preventDefault();
  const titleInput = document.getElementById('link-title');
  const urlInput = document.getElementById('link-url');

  if (!urlInput) return;

  const title = titleInput ? titleInput.value.trim() : '';
  let url = urlInput.value.trim();

  if (!url) {
    showToast(t('enter_original_url'));
    return;
  }

  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url;
  }

  setButtonLoading('btn-create-link', true);

  try {
    const payload = {
      userId: currentUserTelegramId,
      telegramId: currentUserTelegramId,
      title: title || 'Untitled Link',
      targetUrl: url,
      url: url,
      originalUrl: url
    };

    const res = await safeFetch('/api/shorten', {
      method: 'POST',
      body: payload
    });

    if (!res) {
      setButtonLoading('btn-create-link', false);
      return;
    }

    const data = await res.json().catch(() => ({}));

    if (res.ok && (data.success || data.link || data.shortCode)) {
      showToast(t('link_success_msg'));
      if (titleInput) titleInput.value = '';
      urlInput.value = '';

      const newLink = data.link || {
        _id: data._id || data.id || 'link_' + Date.now(),
        title: title || data.title || 'Untitled Link',
        originalUrl: url,
        targetUrl: url,
        shortCode: data.shortCode || data.code || '',
        shortUrl: data.shortUrl || data.shortLink || (data.shortCode ? `${API_BASE}/r/${data.shortCode}` : ''),
        views: 0,
        validImpressions: 0,
        totalEarnings: 0
      };

      if (!rawUserLinksCache) rawUserLinksCache = [];

      const existingIndex = rawUserLinksCache.findIndex(
        (l) =>
          (l._id && newLink._id && String(l._id) === String(newLink._id)) ||
          (l.shortCode && newLink.shortCode && l.shortCode === newLink.shortCode)
      );

      if (existingIndex !== -1) {
        rawUserLinksCache[existingIndex] = { ...rawUserLinksCache[existingIndex], ...newLink };
      } else {
        rawUserLinksCache.unshift(newLink);
      }

      renderUserLinks(rawUserLinksCache);
      await loadUserData();
      await fetchUserLinks();
    } else {
      const errorMsg = data.error || data.message || t('failed_create_link');
      showToast(errorMsg);
    }
  } catch (err) {
    console.error('Shorten Link Error:', err);
    showToast(err.message || t('failed_create_link'));
  } finally {
    setButtonLoading('btn-create-link', false);
  }
}

async function fetchUserLinks() {
  const linksContainer = document.getElementById('links-list');
  if (linksContainer && (!rawUserLinksCache || rawUserLinksCache.length === 0)) {
    linksContainer.innerHTML = `<div style="text-align:center; padding: 10px;"><div class="spinner"></div></div>`;
  }

  try {
    const res = await safeFetch('/api/links');
    if (res) {
      const data = await res.json().catch(() => null);
      if (data) {
        const links = Array.isArray(data) ? data : data.links || data.data || [];
        rawUserLinksCache = links;
        renderUserLinks(rawUserLinksCache);
        return rawUserLinksCache;
      }
    }
  } catch (err) {
    console.error('Error fetching user links:', err);
  }
  return [];
}

function renderUserLinks(links) {
  const container = document.getElementById('links-list');
  if (!container) return;

  if (!links || links.length === 0) {
    container.innerHTML = `<p style="text-align:center; color: var(--text-muted); margin: 12px 0;">${t('no_links')}</p>`;
    return;
  }

  container.innerHTML = links
    .map((link) => {
      const formattedUrl = formatShortUrl(link);
      const title = escapeHTML(link.title || link.shortCode || 'Untitled Link');
      const originalUrl = escapeHTML(link.originalUrl || link.targetUrl || link.url || '');
      const clicks = link.views || link.clicks || 0;
      const validImp = link.validImpressions || 0;
      const earnings = (link.totalEarnings || 0).toFixed(4);
      const linkId = link._id || link.id || link.shortCode;

      return `
      <div class="link-item">
        <div class="link-header">
          <strong style="font-size: 14px; color: var(--text);">${title}</strong>
          <span style="font-size: 11px; color: var(--success); font-weight: 700;">$${earnings}</span>
        </div>
        <div style="margin: 6px 0; font-size: 12px;">
          <a href="${formattedUrl}" target="_blank" rel="noopener" style="color: var(--accent); text-decoration: none; word-break: break-all; font-weight: 600;">${formattedUrl}</a>
        </div>
        <div style="font-size: 11px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 8px;">
          ↪ ${originalUrl}
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--card-border); padding-top: 8px; margin-top: 8px;">
          <span style="font-size: 11px; color: var(--text-muted);">👁️ ${clicks} ${currentLang === 'ar' ? 'زيارة' : 'clicks'} (${validImp} ${currentLang === 'ar' ? 'مؤكدة' : 'valid'})</span>
          <div class="link-actions">
            <button class="btn-small" onclick="copyToClipboard('${formattedUrl}')">${t('btn_copy')}</button>
            <button class="btn-small btn-danger" onclick="deleteLink('${linkId}')">${currentLang === 'ar' ? 'حذف' : 'Delete'}</button>
          </div>
        </div>
      </div>
    `;
    })
    .join('');
}

function filterUserLinks(term) {
  if (!rawUserLinksCache) return;
  const lower = term.toLowerCase().trim();
  if (!lower) {
    renderUserLinks(rawUserLinksCache);
    return;
  }
  const filtered = rawUserLinksCache.filter(
    (l) =>
      (l.title && l.title.toLowerCase().includes(lower)) ||
      (l.originalUrl && l.originalUrl.toLowerCase().includes(lower)) ||
      (l.targetUrl && l.targetUrl.toLowerCase().includes(lower)) ||
      (l.shortCode && l.shortCode.toLowerCase().includes(lower))
  );
  renderUserLinks(filtered);
}

async function deleteLink(linkId) {
  if (!confirm(t('delete_confirm'))) return;

  try {
    const res = await safeFetch(`/api/links/${linkId}`, { method: 'DELETE' });
    if (res) {
      const data = await res.json().catch(() => ({}));
      if (res.ok && (data.success || data.message)) {
        showToast(t('delete_success'));
        await loadUserData();
        await fetchUserLinks();
      } else {
        showToast(data.error || data.message || (currentLang === 'ar' ? 'فشل حذف الرابط' : 'Failed to delete link'));
      }
    }
  } catch (err) {
    showToast(err.message || t('network_error'));
  }
}

// ==========================================
// 9. WALLET & FINANCE MODULE
// ==========================================
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

function updateWithdrawCalculations() {
  const amtInput = document.getElementById('withdraw-amount');
  const feeBox = document.getElementById('withdraw-fee-box');
  if (!amtInput || !feeBox) return;

  const val = parseFloat(amtInput.value) || 0;

  if (val > 0) {
    feeBox.classList.remove('hidden');
    const fee = 3;
    const net = Math.max(0, val - fee);

    const calcReq = document.getElementById('calc-req');
    const calcFee = document.getElementById('calc-fee');
    const calcNet = document.getElementById('calc-net');

    if (calcReq) calcReq.innerText = `$${val.toFixed(2)}`;
    if (calcFee) calcFee.innerText = `$${fee.toFixed(2)}`;
    if (calcNet) calcNet.innerText = `$${net.toFixed(2)}`;
  } else {
    feeBox.classList.add('hidden');
  }
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
      editBtn.innerText = t('cancel');
      editBtn.className = 'btn-small btn-danger';
    }
    if (saveBtn) saveBtn.classList.remove('hidden');
  } else {
    walletInput.setAttribute('readonly', 'readonly');
    if (editBtn) {
      editBtn.innerText = t('btn_edit');
      editBtn.className = 'btn-small btn-warning';
    }
    if (saveBtn) saveBtn.classList.add('hidden');
  }
}

async function saveSettings() {
  const walletInput = document.getElementById('default-wallet');
  const walletAddr = walletInput ? walletInput.value.trim() : '';

  if (!walletAddr) {
    showToast(t('enter_wallet_addr'));
    return;
  }

  try {
    const res = await safeFetch('/api/user/settings', {
      method: 'POST',
      body: {
        userId: currentUserTelegramId,
        telegramId: currentUserTelegramId,
        defaultWallet: walletAddr
      }
    });

    if (res) {
      const data = await res.json().catch(() => ({}));
      if (res.ok && (data.success || data.user)) {
        showToast(t('wallet_saved'));
        toggleWalletEdit();
        await loadUserData();
      } else {
        showToast(data.error || (currentLang === 'ar' ? 'فشل حفظ العنوان' : 'Failed to save address'));
      }
    }
  } catch (err) {
    showToast(err.message || (currentLang === 'ar' ? 'خطأ أثناء الحفظ' : 'Error saving settings'));
  }
}

async function requestDeposit() {
  const networkElem = document.getElementById('deposit-network');
  const amountElem = document.getElementById('deposit-amount');
  const txHashElem = document.getElementById('deposit-txhash');

  const network = networkElem ? networkElem.value : '';
  const amountVal = amountElem ? amountElem.value : '';
  const txHashVal = txHashElem ? txHashElem.value.trim() : '';

  if (!network) {
    showToast(t('select_network'));
    return;
  }
  const amount = parseFloat(amountVal);
  if (!amount || amount < 1) {
    showToast(t('min_deposit'));
    return;
  }
  if (!txHashVal || txHashVal.length < 5) {
    showToast(t('enter_txid'));
    return;
  }

  setButtonLoading('btn-request-deposit', true);

  try {
    const res = await safeFetch('/api/deposit', {
      method: 'POST',
      body: {
        userId: currentUserTelegramId,
        telegramId: currentUserTelegramId,
        network: network,
        amount: amount,
        txid: txHashVal,
        txHash: txHashVal
      }
    });

    if (res) {
      const data = await res.json().catch(() => ({}));
      if (res.ok && (data.success || data.deposit)) {
        showToast(t('deposit_success'));
        if (amountElem) amountElem.value = '';
        if (txHashElem) txHashElem.value = '';
        await loadUserData();
      } else {
        showToast(data.error || data.message || (currentLang === 'ar' ? 'فشل تقديم طلب الشحن' : 'Failed to submit deposit request'));
      }
    }
  } catch (err) {
    console.error('Deposit request error:', err);
    showToast(err.message || (currentLang === 'ar' ? 'خطأ أثناء تقديم الطلب' : 'Error submitting request'));
  } finally {
    setButtonLoading('btn-request-deposit', false);
  }
}

async function requestWithdrawal() {
  const walletInput = document.getElementById('default-wallet');
  const amountInput = document.getElementById('withdraw-amount');

  const walletAddr = walletInput ? walletInput.value.trim() : '';
  const amountVal = amountInput ? parseFloat(amountInput.value) || 0 : 0;

  if (!walletAddr) {
    showToast(t('enter_wallet_first'));
    return;
  }

  if (amountVal < 30) {
    showToast(t('min_withdraw'));
    return;
  }

  setButtonLoading('btn-request-withdraw', true);

  try {
    const res = await safeFetch('/api/withdraw', {
      method: 'POST',
      body: {
        userId: currentUserTelegramId,
        telegramId: currentUserTelegramId,
        amount: amountVal,
        wallet: walletAddr
      }
    });

    if (res) {
      const data = await res.json().catch(() => ({}));
      if (res.ok && (data.success || data.withdraw)) {
        showToast(t('withdraw_success'));
        if (amountInput) amountInput.value = '';
        updateWithdrawCalculations();
        await loadUserData();
      } else {
        showToast(data.error || data.message || (currentLang === 'ar' ? 'فشل تقديم طلب السحب' : 'Failed to request withdrawal'));
      }
    }
  } catch (err) {
    showToast(err.message || (currentLang === 'ar' ? 'خطأ في عملية السحب' : 'Error processing withdrawal'));
  } finally {
    setButtonLoading('btn-request-withdraw', false);
  }
}

function renderWithdrawalsHistory(withdraws) {
  const container = document.getElementById('withdraws-list');
  if (!container) return;

  if (!withdraws || withdraws.length === 0) {
    container.innerHTML = `<p style="text-align:center; color: var(--text-muted); margin: 10px 0;">${t('no_withdraws')}</p>`;
    return;
  }

  container.innerHTML = withdraws
    .map((w) => {
      const isOk = w.status === 'completed' || w.status === 'approved';
      const isFail = w.status === 'rejected';
      const statusClass = isOk ? 'color: var(--success);' : isFail ? 'color: var(--danger);' : 'color: var(--warning);';
      const statusText = isOk
        ? currentLang === 'ar' ? 'مكتمل' : 'Approved'
        : isFail
        ? currentLang === 'ar' ? 'مرفوض' : 'Rejected'
        : currentLang === 'ar' ? 'قيد المراجعة' : 'Pending';
      const dateStr = new Date(w.createdAt || Date.now()).toLocaleDateString();

      return `
      <div style="background: #0f172a; padding: 12px; border-radius: 12px; border: 1px solid var(--card-border); margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <strong style="font-size: 13px; color: var(--text);">$${(w.amount || 0).toFixed(2)}</strong>
          <small style="display: block; color: var(--text-muted); font-size: 10px;">${dateStr}</small>
        </div>
        <span style="font-size: 12px; font-weight: bold; ${statusClass}">${statusText}</span>
      </div>
    `;
    })
    .join('');
}

// ==========================================
// 10. AD CAMPAIGNS MODULE
// ==========================================
async function createAdCampaign() {
  const titleElem = document.getElementById('ad-title');
  const targetElem = document.getElementById('ad-target-url');
  const budgetElem = document.getElementById('ad-budget');

  const title = titleElem ? titleElem.value.trim() : '';
  let targetUrl = targetElem ? targetElem.value.trim() : '';
  const budget = budgetElem ? parseFloat(budgetElem.value) || 0 : 0;

  if (!title) {
    showToast(t('enter_ad_title'));
    return;
  }

  if (!targetUrl) {
    showToast(t('enter_target_url'));
    return;
  }

  if (!/^https?:\/\//i.test(targetUrl)) {
    targetUrl = 'https://' + targetUrl;
  }

  if (budget < 5) {
    showToast(t('min_budget'));
    return;
  }

  setButtonLoading('btn-create-ad', true);

  try {
    const res = await safeFetch('/api/ads/create', {
      method: 'POST',
      body: {
        userId: currentUserTelegramId,
        telegramId: currentUserTelegramId,
        title: title,
        targetUrl: targetUrl,
        budget: budget
      }
    });

    if (res) {
      const data = await res.json().catch(() => ({}));
      if (res.ok && (data.success || data.ad)) {
        showToast(t('ad_success'));
        if (titleElem) titleElem.value = '';
        if (targetElem) targetElem.value = '';
        if (budgetElem) budgetElem.value = '';
        await fetchUserAds();
        await loadUserData();
      } else {
        showToast(data.error || (currentLang === 'ar' ? 'فشل إنشاء الحملة الإعلانية' : 'Failed to create ad campaign'));
      }
    }
  } catch (err) {
    showToast(err.message || (currentLang === 'ar' ? 'خطأ أثناء إنشاء الحملة' : 'Error creating campaign'));
  } finally {
    setButtonLoading('btn-create-ad', false);
  }
}

async function fetchUserAds() {
  const container = document.getElementById('ads-list');
  if (container) {
    container.innerHTML = `<div style="text-align:center; padding: 10px;"><div class="spinner"></div></div>`;
  }

  try {
    const res = await safeFetch('/api/ads');
    if (res) {
      const data = await res.json().catch(() => null);
      if (data) {
        const ads = Array.isArray(data) ? data : data.ads || data.data || [];
        renderUserAds(ads);
        return ads;
      }
    }
  } catch (err) {
    console.error('Error fetching user ads:', err);
  }
  return [];
}

function renderUserAds(ads) {
  const container = document.getElementById('ads-list');
  if (!container) return;

  if (!ads || ads.length === 0) {
    container.innerHTML = `<p style="text-align:center; color: var(--text-muted); margin: 12px 0;">${t('no_ads')}</p>`;
    return;
  }

  container.innerHTML = ads
    .map((ad) => {
      const title = escapeHTML(ad.title || 'Untitled Ad');
      const targetUrl = escapeHTML(ad.targetUrl || ad.url || '');
      const budget = (ad.budget || 0).toFixed(2);
      const spent = (ad.spent || ad.totalSpent || 0).toFixed(2);
      const impressions = ad.impressions || ad.views || 0;

      return `
      <div class="ad-item">
        <div class="ad-header">
          <strong style="font-size: 14px; color: var(--text);">${title}</strong>
          <span style="font-size: 11px; color: var(--accent); font-weight: 700;">$${spent} / $${budget}</span>
        </div>
        <div style="margin: 6px 0; font-size: 11px; color: var(--text-muted); word-break: break-all;">
          🔗 ${targetUrl}
        </div>
        <div style="font-size: 11px; color: var(--text-muted); margin-top: 8px; border-top: 1px solid var(--card-border); padding-top: 8px;">
          👁️ ${impressions} ${currentLang === 'ar' ? 'مشاهدة حقيقية' : 'impressions'}
        </div>
      </div>
    `;
    })
    .join('');
}

// ==========================================
// 11. REFERRAL SYSTEM MODULE
// ==========================================
function shareReferralLink() {
  const refInput = document.getElementById('ref-link');
  const refUrl = refInput ? refInput.value : '';
  if (!refUrl) return;

  triggerHaptic('medium');
  const shareText = encodeURIComponent(t('share_ref_text'));
  const url = `https://t.me/share/url?url=${encodeURIComponent(refUrl)}&text=${shareText}`;

  if (tg && tg.openTelegramLink) {
    tg.openTelegramLink(url);
  } else {
    window.open(url, '_blank');
  }
}

async function fetchUserReferrals() {
  const container = document.getElementById('ref-list');
  if (container) {
    container.innerHTML = `<div style="text-align:center; padding: 10px;"><div class="spinner"></div></div>`;
  }

  try {
    const res = await safeFetch('/api/referrals');
    if (res) {
      const data = await res.json().catch(() => null);
      if (data) {
        const referrals = Array.isArray(data) ? data : data.referrals || data.data || [];
        renderUserReferrals(referrals);
      }
    }
  } catch (err) {
    console.error('Error fetching referrals:', err);
  }
}

function renderUserReferrals(referrals) {
  const container = document.getElementById('ref-list');
  if (!container) return;

  if (!referrals || referrals.length === 0) {
    container.innerHTML = `<p style="text-align:center; color: var(--text-muted); margin: 12px 0;">${t('no_referrals')}</p>`;
    return;
  }

  container.innerHTML = referrals
    .map((ref) => {
      const name = escapeHTML(ref.firstName || ref.username || 'User');
      const earnings = (ref.earnedAmount || ref.contribution || 0).toFixed(2);
      const dateStr = new Date(ref.createdAt || Date.now()).toLocaleDateString();

      return `
      <div style="background: #0f172a; padding: 12px; border-radius: 12px; border: 1px solid var(--card-border); margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <strong style="font-size: 13px; color: var(--text);">${name}</strong>
          <small style="display: block; color: var(--text-muted); font-size: 10px;">${dateStr}</small>
        </div>
        <span style="font-size: 12px; color: var(--success); font-weight: bold;">+$${earnings}</span>
      </div>
    `;
    })
    .join('');
}

// ==========================================
// 12. ADMIN PANEL MODULE
// ==========================================
async function loadAdminData() {
  if (!isUserAdmin) return;

  try {
    const res = await safeFetch('/api/admin/dashboard');
    if (res && res.ok) {
      const data = await res.json().catch(() => ({}));

      const uCount = document.getElementById('admin-total-users');
      const pBal = document.getElementById('admin-total-pending');

      if (uCount) uCount.innerText = data.totalUsers || 0;
      if (pBal) pBal.innerText = `$${(data.totalPendingBalance || 0).toFixed(2)}`;

      if (data.pendingDeposits) renderAdminDeposits(data.pendingDeposits);
      if (data.pendingWithdraws) renderAdminWithdraws(data.pendingWithdraws);
      if (data.users) renderAdminUsers(data.users);
      if (data.links) renderAdminLinks(data.links);
      if (data.ads) renderAdminAds(data.ads);
    }
  } catch (err) {
    console.error('Admin data error:', err);
  }
}

function renderAdminDeposits(list) {
  const c = document.getElementById('admin-deposits-list');
  if (!c) return;
  if (!list.length) {
    c.innerHTML = '<p style="color:var(--text-muted);">لا توجد طلبات إيداع معلقة</p>';
    return;
  }
  c.innerHTML = list
    .map(
      (d) => `
    <div style="background:#070a12; padding:10px; border-radius:10px; margin-bottom:8px; border:1px solid var(--card-border);">
      <div><b>مستخدم:</b> ${d.userId} | <b>المبلغ:</b> $${d.amount}</div>
      <div style="font-size:10px; color:var(--text-muted); word-break:break-all;"><b>TxID:</b> ${d.txid || d.txHash}</div>
      <div style="margin-top:6px;">
        <button class="btn-small btn-success" onclick="processAdminAction('deposit', '${d._id}', 'approve')">قبول</button>
        <button class="btn-small btn-danger" onclick="processAdminAction('deposit', '${d._id}', 'reject')">رفض</button>
      </div>
    </div>
  `
    )
    .join('');
}

function renderAdminWithdraws(list) {
  const c = document.getElementById('admin-withdraws-list');
  if (!c) return;
  if (!list.length) {
    c.innerHTML = '<p style="color:var(--text-muted);">لا توجد طلبات سحب معلقة</p>';
    return;
  }
  c.innerHTML = list
    .map(
      (w) => `
    <div style="background:#070a12; padding:10px; border-radius:10px; margin-bottom:8px; border:1px solid var(--card-border);">
      <div><b>مستخدم:</b> ${w.userId} | <b>المبلغ:</b> $${w.amount}</div>
      <div style="font-size:10px; color:var(--text-muted); word-break:break-all;"><b>المحفظة:</b> ${w.wallet}</div>
      <div style="margin-top:6px;">
        <button class="btn-small btn-success" onclick="processAdminAction('withdraw', '${w._id}', 'approve')">تأكيد الدفع</button>
        <button class="btn-small btn-danger" onclick="processAdminAction('withdraw', '${w._id}', 'reject')">إلغاء الطلب</button>
      </div>
    </div>
  `
    )
    .join('');
}

function renderAdminUsers(list) {
  const c = document.getElementById('admin-users-list');
  if (!c) return;
  c.innerHTML = list
    .map(
      (u) => `
    <div style="background:#070a12; padding:8px; border-radius:8px; margin-bottom:6px; font-size:11px;">
      <b>ID:</b> ${u.telegramId} | <b>المتاح:</b> $${(u.availableBalance || 0).toFixed(2)} | <b>المعلق:</b> $${(u.pendingBalance || 0).toFixed(2)}
    </div>
  `
    )
    .join('');
}

function renderAdminLinks(list) {
  const c = document.getElementById('admin-links-list');
  if (!c) return;
  c.innerHTML = list
    .map(
      (l) => `
    <div style="background:#070a12; padding:8px; border-radius:8px; margin-bottom:6px; font-size:11px;">
      <b>كود:</b> ${l.shortCode} | <b>الزيارات:</b> ${l.views || 0}
    </div>
  `
    )
    .join('');
}

function renderAdminAds(list) {
  const c = document.getElementById('admin-ads-list');
  if (!c) return;
  c.innerHTML = list
    .map(
      (a) => `
    <div style="background:#070a12; padding:8px; border-radius:8px; margin-bottom:6px; font-size:11px;">
      <b>عنوان:</b> ${escapeHTML(a.title)} | <b>الميزانية:</b> $${a.budget}
    </div>
  `
    )
    .join('');
}

async function processAdminAction(type, itemId, action) {
  try {
    const res = await safeFetch(`/api/admin/${type}/${action}`, {
      method: 'POST',
      body: { id: itemId }
    });
    if (res && res.ok) {
      showToast('تم تنفيذ الإجراء بنجاح');
      loadAdminData();
    }
  } catch (e) {
    showToast('خطأ أثناء تنفيذ الإجراء');
  }
}

// ==========================================
// 13. BRIDGE LANDING PAGE MODULE
// ==========================================
async function initBridgeView(code) {
  currentShortCode = code;

  const appView = document.getElementById('app-view');
  const bridgeView = document.getElementById('bridge-view');

  if (appView) appView.classList.add('hidden');
  if (bridgeView) bridgeView.classList.remove('hidden');

  try {
    const res = await safeFetch(`/api/bridge/${code}`);
    if (res && res.ok) {
      const data = await res.json().catch(() => ({}));
      bridgeDestinationUrl = data.targetUrl || data.originalUrl || '/';
      bridgeToken = data.token || null;
      bridgeStartTime = Date.now();
      startBridgeTimer(5);
    } else {
      showToast('تعذر تحميل الرابط المطلوب');
    }
  } catch (err) {
    console.error('Bridge init error:', err);
  }
}

function startBridgeTimer(seconds) {
  let timeLeft = seconds;
  const timerElem = document.getElementById('timer');
  const btn = document.getElementById('go-btn');

  if (timerElem) timerElem.innerText = timeLeft;
  if (btn) btn.disabled = true;

  const interval = setInterval(() => {
    timeLeft--;
    if (timerElem) timerElem.innerText = timeLeft;
    if (timeLeft <= 0) {
      clearInterval(interval);
      if (btn) btn.disabled = false;
    }
  }, 1000);
}

async function completeImpression() {
  if (!bridgeDestinationUrl) return;

  setButtonLoading('go-btn', true);

  try {
    await safeFetch('/api/bridge/complete', {
      method: 'POST',
      body: {
        shortCode: currentShortCode,
        token: bridgeToken,
        duration: Math.round((Date.now() - bridgeStartTime) / 1000)
      }
    });
  } catch (e) {
    console.error('Complete impression error:', e);
  } finally {
    window.location.href = bridgeDestinationUrl;
  }
}

// ==========================================
// 14. EVENT LISTENERS & APPLICATION INITIALIZATION
// ==========================================
function bindDOMEventListeners() {
  // Shorten Link Action
  const btnCreateLink = document.getElementById('btn-create-link');
  if (btnCreateLink) {
    btnCreateLink.addEventListener('click', handleShortenClick);
  }

  const shortenForm = document.getElementById('shorten-form');
  if (shortenForm) {
    shortenForm.addEventListener('submit', handleShortenClick);
  }

  // Filter links
  const searchInput = document.getElementById('search-links-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => filterUserLinks(e.target.value));
  }

  // Deposit Actions
  const btnDeposit = document.getElementById('btn-request-deposit');
  if (btnDeposit) {
    btnDeposit.addEventListener('click', requestDeposit);
  }

  const depositNetworkSelect = document.getElementById('deposit-network');
  if (depositNetworkSelect) {
    depositNetworkSelect.addEventListener('change', (e) => handleNetworkChange(e.target.value));
  }

  // Withdraw Actions
  const btnWithdraw = document.getElementById('btn-request-withdraw');
  if (btnWithdraw) {
    btnWithdraw.addEventListener('click', requestWithdrawal);
  }

  const withdrawAmtInput = document.getElementById('withdraw-amount');
  if (withdrawAmtInput) {
    withdrawAmtInput.addEventListener('input', updateWithdrawCalculations);
  }

  // Wallet Edit Actions
  const editWalletBtn = document.getElementById('edit-wallet-btn');
  if (editWalletBtn) {
    editWalletBtn.addEventListener('click', toggleWalletEdit);
  }

  const saveWalletBtn = document.getElementById('save-wallet-btn');
  if (saveWalletBtn) {
    saveWalletBtn.addEventListener('click', saveSettings);
  }

  // Ads Action
  const btnCreateAd = document.getElementById('btn-create-ad');
  if (btnCreateAd) {
    btnCreateAd.addEventListener('click', createAdCampaign);
  }

  // Referral Actions
  const shareRefBtn = document.getElementById('share-ref-btn');
  if (shareRefBtn) {
    shareRefBtn.addEventListener('click', shareReferralLink);
  }

  const copyRefBtn = document.getElementById('copy-ref-btn');
  if (copyRefBtn) {
    copyRefBtn.addEventListener('click', () => {
      const refInput = document.getElementById('ref-link');
      if (refInput && refInput.value) copyToClipboard(refInput.value);
    });
  }

  // Bridge View Go Action
  const goBtn = document.getElementById('go-btn');
  if (goBtn) {
    goBtn.addEventListener('click', completeImpression);
  }

  // Navigation Tab Listeners
  const navTabs = ['dashboard', 'wallet', 'ads', 'referral', 'settings', 'admin'];
  navTabs.forEach((tab) => {
    const btn = document.getElementById(`tab-btn-${tab}`);
    if (btn) {
      btn.addEventListener('click', () => switchTab(tab));
    }
  });

  // Wallet View Sub-navigation
  const navDeposit = document.getElementById('wallet-nav-deposit');
  if (navDeposit) {
    navDeposit.addEventListener('click', () => switchWalletView('deposit'));
  }

  const navWithdraw = document.getElementById('wallet-nav-withdraw');
  if (navWithdraw) {
    navWithdraw.addEventListener('click', () => switchWalletView('withdraw'));
  }

  // Instructions Modal Close
  const modalClose = document.getElementById('modal-close-btn');
  if (modalClose) {
    modalClose.addEventListener('click', () => toggleInstructionsModal(false));
  }
}

// Expose functions globally for legacy inline HTML onclick compatibility
window.switchTab = switchTab;
window.switchWalletView = switchWalletView;
window.handleNetworkChange = handleNetworkChange;
window.toggleInstructionsModal = toggleInstructionsModal;
window.toggleWalletEdit = toggleWalletEdit;
window.saveSettings = saveSettings;
window.copyToClipboard = copyToClipboard;
window.shareReferralLink = shareReferralLink;
window.deleteLink = deleteLink;
window.processAdminAction = processAdminAction;
window.completeImpression = completeImpression;
window.requestDeposit = requestDeposit;
window.requestWithdrawal = requestWithdrawal;
window.createAdCampaign = createAdCampaign;
window.handleShortenClick = handleShortenClick;

// Primary App Initialization
document.addEventListener('DOMContentLoaded', async () => {
  initTelegramWebApp();
  renderTelegramUser();
  bindDOMEventListeners();

  await authLogin();

  const pathParts = window.location.pathname.split('/');
  if (pathParts.length >= 3 && pathParts[1] === 'r') {
    const code = pathParts[2];
    if (code) {
      initBridgeView(code);
      return;
    }
  }

  await loadUserData();
  await fetchUserLinks();
});
