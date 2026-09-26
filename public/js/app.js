const API_BASE = window.location.protocol.startsWith('file') 
  ? 'http://localhost:3000' 
  : window.location.origin;

let authToken = localStorage.getItem('authToken');
let currentSessionId = null;
let bridgeToken = null;
let bridgeStartTime = Date.now();
let isUserAdmin = false;

const tg = window.Telegram?.WebApp;

let currentUserTelegramId = null;
let storedTelegramId = localStorage.getItem('telegramId');

if (tg?.initDataUnsafe?.user?.id) {
  currentUserTelegramId = String(tg.initDataUnsafe.user.id);
  localStorage.setItem('telegramId', currentUserTelegramId);
} else {
  currentUserTelegramId = storedTelegramId || null;
}

let currentLang = localStorage.getItem('appLang') || 'ar';

window.i18n = window.i18n || {
  ar: {
    copied: "تم النسخ بنجاح!",
    network_error: "خطأ في الاتصال بالشبكة",
    link_success_msg: "تم اختصار الرابط بنجاح!",
    btn_copy: "نسخ",
    cancel: "إلغاء",
    btn_edit: "تعديل"
  },
  en: {
    copied: "Copied successfully!",
    network_error: "Network connection error",
    link_success_msg: "Link shortened successfully!",
    btn_copy: "Copy",
    cancel: "Cancel",
    btn_edit: "Edit"
  }
};

const i18n = window.i18n;

let rawUserLinksCache = [];
let bridgeDestinationUrl = null;
let currentShortCode = null;

function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function triggerHaptic(style = 'light') {
  try {
    if (tg && tg.isVersionAtLeast && tg.isVersionAtLeast('6.1') && tg.HapticFeedback) {
      tg.HapticFeedback.impactOccurred(style);
    }
  } catch (e) {}
}

function showToast(msg) {
  triggerHaptic('medium');
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.innerText = msg;
  toast.classList.add("show");
  setTimeout(() => { toast.classList.remove("show"); }, 3200);
}

function copyToClipboard(text) {
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    showToast(i18n[currentLang]?.copied || "تم النسخ بنجاح!");
  }).catch(() => {
    showToast(currentLang === 'ar' ? "فشل النسخ تلقائياً" : "Failed to copy");
  });
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

function applyLanguage(lang) {
  currentLang = lang || currentLang || 'ar';
  localStorage.setItem('appLang', currentLang);
  document.documentElement.lang = currentLang;
  document.documentElement.dir = currentLang === 'ar' ? 'rtl' : 'ltr';
  
  document.querySelectorAll('[data-i18n]').forEach(elem => {
    const key = elem.getAttribute('data-i18n');
    if (i18n[currentLang] && i18n[currentLang][key]) {
      elem.innerText = i18n[currentLang][key];
    }
  });
}

async function safeFetch(endpoint, options = {}) {
  const fetchOptions = { ...options };
  fetchOptions.headers = { ...(fetchOptions.headers || {}) };

  if (!currentUserTelegramId && tg?.initDataUnsafe?.user?.id) {
    currentUserTelegramId = String(tg.initDataUnsafe.user.id);
    localStorage.setItem('telegramId', currentUserTelegramId);
  }

  const initDataStr = window.Telegram?.WebApp?.initData || tg?.initData || '';

  if (authToken) {
    fetchOptions.headers['Authorization'] = `Bearer ${authToken}`;
  } else if (initDataStr) {
    fetchOptions.headers['Authorization'] = `Bearer ${initDataStr}`;
  }

  if (initDataStr) {
    fetchOptions.headers['x-telegram-init-data'] = initDataStr;
    fetchOptions.headers['telegram-init-data'] = initDataStr;
  }

  if (currentUserTelegramId) {
    fetchOptions.headers['x-telegram-id'] = currentUserTelegramId;
    fetchOptions.headers['telegram-id'] = currentUserTelegramId;
    fetchOptions.headers['x-user-id'] = currentUserTelegramId;
    fetchOptions.headers['user-id'] = currentUserTelegramId;
  }

  if (fetchOptions.body && typeof fetchOptions.body === 'object') {
    const bodyObj = { ...fetchOptions.body };
    if (currentUserTelegramId) {
      if (!bodyObj.userId) bodyObj.userId = currentUserTelegramId;
      if (!bodyObj.telegramId) bodyObj.telegramId = currentUserTelegramId;
    }
    if (initDataStr && !bodyObj.initData) {
      bodyObj.initData = initDataStr;
    }
    fetchOptions.body = JSON.stringify(bodyObj);
  }

  if (fetchOptions.body && !fetchOptions.headers['Content-Type']) {
    fetchOptions.headers['Content-Type'] = 'application/json; charset=utf-8';
  }

  let cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  let targetUrl = endpoint.startsWith('http') ? endpoint : `${API_BASE}${cleanEndpoint}`;

  if (currentUserTelegramId && !targetUrl.includes('telegramId=') && !targetUrl.includes('userId=')) {
    const separator = targetUrl.includes('?') ? '&' : '?';
    targetUrl = `${targetUrl}${separator}telegramId=${encodeURIComponent(currentUserTelegramId)}&userId=${encodeURIComponent(currentUserTelegramId)}`;
  }

  try {
    const response = await fetch(targetUrl, fetchOptions);
    return response;
  } catch (err) {
    console.error("Fetch Network Error:", err);
    showToast(i18n[currentLang]?.network_error || "خطأ في الاتصال بالشبكة");
    return null;
  }
}

function switchTab(tabName) {
  if (tabName === 'admin' && !isUserAdmin) {
    showToast(currentLang === 'ar' ? "غير مصرح لك بالوصول للوحة التحكم" : "Access denied");
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

  if (tabName === 'admin' && isUserAdmin) {
    loadAdminData();
  } else if (tabName === 'ads') {
    fetchUserAds();
  } else if (tabName === 'referral') {
    fetchUserReferrals();
  }
}

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

function toggleInstructionsModal(show) {
  triggerHaptic('medium');
  const modal = document.getElementById('instructions-modal');
  if (modal) modal.classList.toggle('hidden', !show);
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

    const reqEl = document.getElementById('calc-req');
    const feeEl = document.getElementById('calc-fee');
    const netEl = document.getElementById('calc-net');

    if (reqEl) reqEl.innerText = `$${val.toFixed(2)}`;
    if (feeEl) feeEl.innerText = `$${fee.toFixed(2)}`;
    if (netEl) netEl.innerText = `$${net.toFixed(2)}`;
  } else {
    feeBox.classList.add('hidden');
  }
}

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
      if (u.is_premium) {
        premiumBadge.classList.remove('hidden');
      } else {
        premiumBadge.classList.add('hidden');
      }
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
    if (avatarContainer) avatarContainer.innerHTML = `<div class="user-avatar-placeholder">U</div>`;
    if (!localStorage.getItem('appLang')) {
      currentLang = 'ar';
    }
  }

  applyLanguage(currentLang);
}

function shareReferralLink() {
  const refInput = document.getElementById('ref-link');
  const refUrl = refInput ? refInput.value : '';
  if (!refUrl) return;
  triggerHaptic('medium');
  const shareText = encodeURIComponent(currentLang === 'ar' ? "انضم إليّ في أفضل منصة لاختصار الروابط واكسب الأرباح بسهولة! 🚀" : "Join me on the best url shortener platform & earn money! 🚀");
  const url = `https://t.me/share/url?url=${encodeURIComponent(refUrl)}&text=${shareText}`;
  
  if (tg && tg.openTelegramLink) {
    tg.openTelegramLink(url);
  } else {
    window.open(url, '_blank');
  }
}

function toggleWalletEdit() {
  triggerHaptic('light');
  const walletInput = document.getElementById('default-wallet');
  const editBtn = document.getElementById('edit-wallet-btn');
  const saveBtn = document.getElementById('save-wallet-btn');

  if (!walletInput || !editBtn) return;

  if (walletInput.hasAttribute('readonly')) {
    walletInput.removeAttribute('readonly');
    walletInput.focus();
    editBtn.innerText = i18n[currentLang]?.cancel || (currentLang === 'ar' ? 'إلغاء' : 'Cancel');
    editBtn.className = "btn-small btn-danger";
    if (saveBtn) saveBtn.classList.remove('hidden');
  } else {
    walletInput.setAttribute('readonly', 'readonly');
    editBtn.innerText = i18n[currentLang]?.btn_edit || (currentLang === 'ar' ? 'تعديل' : 'Edit');
    editBtn.className = "btn-small btn-warning";
    if (saveBtn) saveBtn.classList.add('hidden');
  }
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
    if (data && (data.success || data.token || data.user)) {
      if (data.token) {
        authToken = data.token;
        localStorage.setItem('authToken', authToken);
      }

      const userObj = data.user || data.data || data;
      if (userObj && (userObj.telegramId || userObj.userId || userObj.id)) {
        currentUserTelegramId = String(userObj.telegramId || userObj.userId || userObj.id);
        localStorage.setItem('telegramId', currentUserTelegramId);
      }

      if (data.isAdmin === true || userObj.isAdmin === true || userObj.role === 'admin') {
        isUserAdmin = true;
        const adminBtn = document.getElementById('tab-btn-admin');
        if (adminBtn) adminBtn.style.display = 'flex';
      }

      const depositWallets = data.depositWallets || userObj.depositWallets;
      if (depositWallets) {
        if (depositWallets.trc20) {
          const el = document.getElementById('addr-trc20');
          if (el) el.innerText = depositWallets.trc20;
        }
        if (depositWallets.bep20) {
          const el = document.getElementById('addr-bep20');
          if (el) el.innerText = depositWallets.bep20;
        }
      }

      const botUrl = data.botUrl || userObj.botUrl;
      if (botUrl) {
        const bLink = document.getElementById('official-bot-link');
        if (bLink) bLink.href = botUrl;
        const sBot = document.getElementById('support-bot-btn');
        if (sBot) sBot.href = botUrl;
      }
      
      const channelUrl = data.officialChannelUrl || userObj.officialChannelUrl;
      if (channelUrl) {
        const cLink = document.getElementById('official-channel-link');
        if (cLink) cLink.href = channelUrl;
        const sChan = document.getElementById('support-channel-btn');
        if (sChan) sChan.href = channelUrl;
      }
      
      const supportUrl = data.supportUrl || userObj.supportUrl;
      if (supportUrl) {
        const sContact = document.getElementById('support-contact-btn');
        if (sContact) sContact.href = supportUrl;
      }

      return true;
    }
  } catch (e) {
    console.error("Auth error:", e);
  }
  return false;
}

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

async function fetchUserLinks() {
  const linksContainer = document.getElementById('links-list');
  if (linksContainer && (!rawUserLinksCache || rawUserLinksCache.length === 0)) {
    linksContainer.innerHTML = `<div style="text-align:center; padding: 10px;"><div class="spinner"></div></div>`;
  }
  
  try {
    const res = await safeFetch('/api/links');
    if (res && res.ok) {
      const data = await res.json().catch(() => null);
      if (data) {
        const links = Array.isArray(data) ? data : (data.links || data.data || []);
        rawUserLinksCache = links;
        renderUserLinks(rawUserLinksCache);
        return rawUserLinksCache;
      }
    }
  } catch (err) {
    console.error("Error fetching user links:", err);
  }
  return [];
}

async function loadUserData() {
  try {
    let res = await safeFetch('/api/user/data');
    if (!res || !res.ok) {
      res = await safeFetch('/api/user');
    }
    
    if (res && res.ok) {
      const data = await res.json().catch(() => ({}));
      const u = data.user || data.data || data.account || data || {};

      const pendingBal = u.pendingBalance ?? u.pending_balance ?? u.pending ?? 0;
      const availBal = u.availableBalance ?? u.balance ?? u.available_balance ?? 0;
      const refEarn = u.referralEarnings ?? u.refEarnings ?? u.referral_earnings ?? 0;

      const pendingEl = document.getElementById('pending-bal');
      if (pendingEl) pendingEl.innerText = `$${Number(pendingBal).toFixed(2)}`;

      const availEl = document.getElementById('avail-bal');
      if (availEl) availEl.innerText = `$${Number(availBal).toFixed(2)}`;

      const refEarnEl = document.getElementById('ref-earnings');
      if (refEarnEl) refEarnEl.innerText = `$${Number(refEarn).toFixed(2)}`;
      
      const refCountElem = document.getElementById('ref-count');
      if (refCountElem) {
        refCountElem.innerText = data.referralsCount ?? data.refCount ?? u.referralsCount ?? u.referralCount ?? 0;
      }

      const refInput = document.getElementById('ref-link');
      const botUsername = (data.botUsername || u.botUsername || 'Ads_telegabot').replace(/^@/, '');
      if (refInput) {
        const refId = currentUserTelegramId || u.telegramId || u.id || '';
        refInput.value = `https://t.me/${botUsername}?start=${refId}`;
      }

      const walletInput = document.getElementById('default-wallet');
      const walletVal = u.defaultWallet || u.wallet || u.walletAddress || '';
      if (walletInput && walletVal) {
        walletInput.value = walletVal;
      }

      const userLinks = data.links || u.links;
      if (userLinks && Array.isArray(userLinks)) {
        rawUserLinksCache = userLinks;
        renderUserLinks(rawUserLinksCache);
      }

      const withdrawsList = data.withdraws || data.withdrawals || u.withdraws;
      if (withdrawsList && Array.isArray(withdrawsList)) {
        renderWithdrawalsHistory(withdrawsList);
      }

      const adsList = data.ads || u.ads;
      if (adsList && Array.isArray(adsList)) {
        renderUserAds(adsList);
      }

      if (data.announcements && Array.isArray(data.announcements) && data.announcements.length > 0) {
        const anc = data.announcements[0];
        const ancBox = document.getElementById('announcement-box');
        const ancTitle = document.getElementById('anc-title');
        const ancContent = document.getElementById('anc-content');
        if (ancBox && anc && (anc.title || anc.content || anc.message)) {
          if (ancTitle) ancTitle.innerText = anc.title || '';
          if (ancContent) ancContent.innerText = anc.content || anc.message || '';
          ancBox.classList.remove('hidden');
        }
      }

      if (data.isAdmin === true || u.isAdmin === true || u.role === 'admin') {
        isUserAdmin = true;
        const adminBtn = document.getElementById('tab-btn-admin');
        if (adminBtn) adminBtn.style.display = 'flex';
      }
    }
  } catch (err) {
    console.error("Error loading user data:", err);
  }
}

async function handleShortenClick(e) {
  if (e) e.preventDefault();
  const titleInput = document.getElementById('link-title');
  const urlInput = document.getElementById('link-url');

  if (!urlInput) return;

  const title = titleInput ? titleInput.value.trim() : '';
  let url = urlInput.value.trim();

  if (!url) {
    showToast(currentLang === 'ar' ? 'يرجى إدخال الرابط الأصلي' : 'Please enter original URL');
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
      showToast(i18n[currentLang]?.link_success_msg || 'تم اختصار الرابط بنجاح!');
      if (titleInput) titleInput.value = '';
      if (urlInput) urlInput.value = '';
      
      const newLink = data.link || {
        _id: data._id || data.id || ('link_' + Date.now()),
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
      
      const existingIndex = rawUserLinksCache.findIndex(l => 
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
      const errorMsg = data.error || data.message || (currentLang === 'ar' ? 'فشل إنشاء الرابط المختصر' : 'Failed to create short link');
      showToast(errorMsg);
    }
  } catch (err) {
    console.error("Shorten Link Error:", err);
    showToast(err.message || (currentLang === 'ar' ? 'حدث خطأ أثناء اختصار الرابط' : 'An error occurred while shortening link'));
  } finally {
    setButtonLoading('btn-create-link', false);
  }
}

function renderUserLinks(links) {
  const container = document.getElementById('links-list');
  if (!container) return;

  if (!links || links.length === 0) {
    container.innerHTML = `<p style="text-align:center; color: var(--text-muted); margin: 12px 0;">${currentLang === 'ar' ? 'لا توجد روابط مختصرة بعد.' : 'No shortened links found.'}</p>`;
    return;
  }

  container.innerHTML = links.map(link => {
    const formattedUrl = formatShortUrl(link);
    const title = escapeHTML(link.title || link.shortCode || 'Untitled Link');
    const originalUrl = escapeHTML(link.originalUrl || link.targetUrl || link.url || '');
    const clicks = link.views || link.clicks || 0;
    const validImp = link.validImpressions || 0;
    const earnings = (link.totalEarnings || link.earnings || 0).toFixed(4);
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
            <button class="btn-small" onclick="copyToClipboard('${formattedUrl}')">${i18n[currentLang]?.btn_copy || 'نسخ'}</button>
            <button class="btn-small btn-danger" onclick="deleteLink('${linkId}')">${currentLang === 'ar' ? 'حذف' : 'Delete'}</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function filterUserLinks(term) {
  if (!rawUserLinksCache) return;
  const lower = term.toLowerCase().trim();
  if (!lower) {
    renderUserLinks(rawUserLinksCache);
    return;
  }
  const filtered = rawUserLinksCache.filter(l => 
    (l.title && l.title.toLowerCase().includes(lower)) ||
    (l.originalUrl && l.originalUrl.toLowerCase().includes(lower)) ||
    (l.targetUrl && l.targetUrl.toLowerCase().includes(lower)) ||
    (l.shortCode && l.shortCode.toLowerCase().includes(lower))
  );
  renderUserLinks(filtered);
}

async function deleteLink(linkId) {
  if (!confirm(currentLang === 'ar' ? 'هل أنت تأكد من حذف هذا الرابط؟' : 'Are you sure you want to delete this link?')) return;
  
  try {
    const res = await safeFetch(`/api/links/${linkId}`, { method: 'DELETE' });
    if (res) {
      const data = await res.json().catch(() => ({}));
      if (res.ok && (data.success || data.message)) {
        showToast(currentLang === 'ar' ? 'تم حذف الرابط بنجاح' : 'Link deleted successfully');
        await loadUserData();
        await fetchUserLinks();
      } else {
        showToast(data.error || data.message || (currentLang === 'ar' ? 'فشل حذف الرابط' : 'Failed to delete link'));
      }
    }
  } catch (err) {
    showToast(err.message || (currentLang === 'ar' ? 'خطأ في الشبكة' : 'Network error'));
  }
}

async function requestDeposit() {
  const netEl = document.getElementById('deposit-network');
  const amtEl = document.getElementById('deposit-amount');
  const txEl = document.getElementById('deposit-txhash');

  const network = netEl ? netEl.value : '';
  const amountVal = amtEl ? amtEl.value : '';
  const txHashVal = txEl ? txEl.value.trim() : '';

  if (!network) {
    showToast(currentLang === 'ar' ? 'يرجى اختيار شبكة الدفع' : 'Please select payment network');
    return;
  }
  const amount = parseFloat(amountVal);
  if (!amount || amount < 1) {
    showToast(currentLang === 'ar' ? 'الحد الأدنى للإيداع هو $1' : 'Minimum deposit amount is $1');
    return;
  }
  if (!txHashVal || txHashVal.length < 5) {
    showToast(currentLang === 'ar' ? 'يرجى إدخال رمز المعاملة (TxID)' : 'Please enter transaction TxID / Hash');
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
        showToast(currentLang === 'ar' ? 'تم تقديم طلب الشحن بنجاح! سيتم مراجعته قريباً.' : 'Deposit request submitted successfully!');
        if (amtEl) amtEl.value = '';
        if (txEl) txEl.value = '';
        await loadUserData();
      } else {
        showToast(data.error || data.message || (currentLang === 'ar' ? 'فشل تقديم طلب الشحن' : 'Failed to submit deposit request'));
      }
    }
  } catch (err) {
    console.error("Deposit request error:", err);
    showToast(err.message || (currentLang === 'ar' ? 'خطأ أثناء تقديم الطلب' : 'Error submitting request'));
  } finally {
    setButtonLoading('btn-request-deposit', false);
  }
}

async function saveSettings() {
  const walletInput = document.getElementById('default-wallet');
  const walletAddr = walletInput ? walletInput.value.trim() : '';
  if (!walletAddr) {
    showToast(currentLang === 'ar' ? 'يرجى إدخال عنوان المحفظة' : 'Please enter wallet address');
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
        showToast(currentLang === 'ar' ? 'تم حفظ العنوان بنجاح' : 'Wallet address saved');
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

async function requestWithdrawal() {
  const walletInput = document.getElementById('default-wallet');
  const amtInput = document.getElementById('withdraw-amount');

  const walletAddr = walletInput ? walletInput.value.trim() : '';
  const amountVal = amtInput ? parseFloat(amtInput.value) || 0 : 0;

  if (!walletAddr) {
    showToast(currentLang === 'ar' ? 'يرجى إدخال وتحديد عنوان محفظة السحب أولاً' : 'Please define withdrawal wallet address first');
    return;
  }

  if (amountVal < 30) {
    showToast(currentLang === 'ar' ? 'الحد الأدنى للسحب هو 30$' : 'Minimum withdrawal is $30');
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
        showToast(currentLang === 'ar' ? 'تم تقديم طلب السحب بنجاح' : 'Withdrawal requested successfully');
        if (amtInput) amtInput.value = '';
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
    container.innerHTML = `<p style="text-align:center; color: var(--text-muted); margin: 10px 0;">${currentLang === 'ar' ? 'لا توجد طلبات سحب سابقة.' : 'No withdrawal history found.'}</p>`;
    return;
  }

  container.innerHTML = withdraws.map(w => {
    const statusClass = w.status === 'completed' || w.status === 'approved' ? 'color: var(--success);' : w.status === 'rejected' ? 'color: var(--danger);' : 'color: var(--warning);';
    const statusText = w.status === 'completed' || w.status === 'approved' ? (currentLang === 'ar' ? 'مكتمل' : 'Approved') : w.status === 'rejected' ? (currentLang === 'ar' ? 'مرفوض' : 'Rejected') : (currentLang === 'ar' ? 'قيد المراجعة' : 'Pending');
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
  }).join('');
}

async function createAdCampaign() {
  const titleInput = document.getElementById('ad-title');
  const targetUrlInput = document.getElementById('ad-target-url');
  const budgetInput = document.getElementById('ad-budget');

  const title = titleInput ? titleInput.value.trim() : '';
  let targetUrl = targetUrlInput ? targetUrlInput.value.trim() : '';
  const budget = budgetInput ? parseFloat(budgetInput.value) || 0 : 0;

  if (!title) {
    showToast(currentLang === 'ar' ? 'يرجى إدخال عنوان الإعلان' : 'Please enter ad title');
    return;
  }

  if (!targetUrl) {
    showToast(currentLang === 'ar' ? 'يرجى إدخال رابط التوجيه' : 'Please enter target URL');
    return;
  }

  if (!/^https?:\/\//i.test(targetUrl)) {
    targetUrl = 'https://' + targetUrl;
  }

  if (budget < 5) {
    showToast(currentLang === 'ar' ? 'الحد الأدنى لميزانية الحملة هو $5' : 'Minimum campaign budget is $5');
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
        showToast(currentLang === 'ar' ? 'تم إطلاق الحملة الإعلانية بنجاح!' : 'Ad campaign launched successfully!');
        if (titleInput) titleInput.value = '';
        if (targetUrlInput) targetUrlInput.value = '';
        if (budgetInput) budgetInput.value = '';
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
    if (res && res.ok) {
      const data = await res.json().catch(() => null);
      if (data) {
        const ads = Array.isArray(data) ? data : (data.ads || data.data || []);
        renderUserAds(ads);
        return ads;
      }
    }
  } catch (err) {
    console.error("Error fetching user ads:", err);
  }
  return [];
}

function renderUserAds(ads) {
  const container = document.getElementById('ads-list');
  if (!container) return;

  if (!ads || ads.length === 0) {
    container.innerHTML = `<p style="text-align:center; color: var(--text-muted); margin: 12px 0;">${currentLang === 'ar' ? 'لا توجد حملات إعلانية نشطة.' : 'No active ad campaigns.'}</p>`;
    return;
  }

  container.innerHTML = ads.map(ad => {
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
  }).join('');
}

async function fetchUserReferrals() {
  const container = document.getElementById('ref-list');
  if (container) {
    container.innerHTML = `<div style="text-align:center; padding: 10px;"><div class="spinner"></div></div>`;
  }

  try {
    const res = await safeFetch('/api/referrals');
    if (res && res.ok) {
      const data = await res.json().catch(() => null);
      if (data) {
        const referrals = Array.isArray(data) ? data : (data.referrals || data.data || []);
        renderUserReferrals(referrals);
      }
    }
  } catch (err) {
    console.error("Error fetching referrals:", err);
  }
}

function renderUserReferrals(referrals) {
  const container = document.getElementById('ref-list');
  if (!container) return;

  if (!referrals || referrals.length === 0) {
    container.innerHTML = `<p style="text-align:center; color: var(--text-muted); margin: 12px 0;">${currentLang === 'ar' ? 'لم تنضم أي إحالات عبر رابطك بعد.' : 'No referrals registered yet.'}</p>`;
    return;
  }

  container.innerHTML = referrals.map(ref => {
    const name = escapeHTML(ref.firstName || ref.first_name || ref.username || 'User');
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
  }).join('');
}

async function loadAdminData() {
  if (!isUserAdmin) return;

  try {
    const res = await safeFetch('/api/admin/dashboard');
    if (res && res.ok) {
      const data = await res.json().catch(() => ({}));
      
      const totalUsersEl = document.getElementById('admin-total-users');
      const totalPendingEl = document.getElementById('admin-total-pending');

      if (totalUsersEl) totalUsersEl.innerText = data.totalUsers ?? data.usersCount ?? 0;
      if (totalPendingEl) totalPendingEl.innerText = `$${Number(data.totalPendingBalance || 0).toFixed(2)}`;

      if (data.pendingDeposits) renderAdminDeposits(data.pendingDeposits);
      if (data.pendingWithdraws) renderAdminWithdraws(data.pendingWithdraws);
      if (data.users) renderAdminUsers(data.users);
      if (data.links) renderAdminLinks(data.links);
      if (data.ads) renderAdminAds(data.ads);
    }
  } catch (err) {
    console.error("Admin data error:", err);
  }
}

function renderAdminDeposits(list) {
  const c = document.getElementById('admin-deposits-list');
  if (!c) return;
  if (!list || !list.length) { c.innerHTML = `<p style="color:var(--text-muted);">${currentLang === 'ar' ? 'لا توجد طلبات إيداع معلقة' : 'No pending deposits'}</p>`; return; }
  c.innerHTML = list.map(d => {
    const u = d.user || d;
    const fullName = escapeHTML(`${u.firstName || u.first_name || ''} ${u.lastName || u.last_name || ''}`.trim() || u.fullName || u.name || 'غير محدد');
    const username = u.username ? `@${escapeHTML(u.username.replace(/^@/, ''))}` : '@no_username';
    const tgId = escapeHTML(String(d.telegramId || d.userId || u.telegramId || '—'));

    return `
      <div style="background:#070a12; padding:10px; border-radius:10px; margin-bottom:8px; border:1px solid var(--card-border);">
        <div style="font-size:12px; margin-bottom:4px; color:var(--text);">
          <b>${currentLang === 'ar' ? 'الاسم' : 'Name'}:</b> ${fullName} | <b>${currentLang === 'ar' ? 'المعرف' : 'Username'}:</b> ${username} | <b>${currentLang === 'ar' ? 'الآيدي' : 'ID'}:</b> ${tgId}
        </div>
        <div style="font-size:11px; margin-bottom:4px;"><b>${currentLang === 'ar' ? 'المبلغ' : 'Amount'}:</b> $${(d.amount || 0).toFixed(2)}</div>
        <div style="font-size:10px; color:var(--text-muted); word-break:break-all;"><b>TxID:</b> ${escapeHTML(d.txid || d.txHash || '')}</div>
        <div style="margin-top:6px;">
          <button class="btn-small btn-success" onclick="processAdminAction('deposit', '${d._id}', 'approve')">${currentLang === 'ar' ? 'قبول' : 'Approve'}</button>
          <button class="btn-small btn-danger" onclick="processAdminAction('deposit', '${d._id}', 'reject')">${currentLang === 'ar' ? 'رفض' : 'Reject'}</button>
        </div>
      </div>
    `;
  }).join('');
}

function renderAdminWithdraws(list) {
  const c = document.getElementById('admin-withdraws-list');
  if (!c) return;
  if (!list || !list.length) { c.innerHTML = `<p style="color:var(--text-muted);">${currentLang === 'ar' ? 'لا توجد طلبات سحب معلقة' : 'No pending withdrawals'}</p>`; return; }
  c.innerHTML = list.map(w => {
    const u = w.user || w;
    const fullName = escapeHTML(`${u.firstName || u.first_name || ''} ${u.lastName || u.last_name || ''}`.trim() || u.fullName || u.name || 'غير محدد');
    const username = u.username ? `@${escapeHTML(u.username.replace(/^@/, ''))}` : '@no_username';
    const tgId = escapeHTML(String(w.telegramId || w.userId || u.telegramId || '—'));

    return `
      <div style="background:#070a12; padding:10px; border-radius:10px; margin-bottom:8px; border:1px solid var(--card-border);">
        <div style="font-size:12px; margin-bottom:4px; color:var(--text);">
          <b>${currentLang === 'ar' ? 'الاسم' : 'Name'}:</b> ${fullName} | <b>${currentLang === 'ar' ? 'المعرف' : 'Username'}:</b> ${username} | <b>${currentLang === 'ar' ? 'الآيدي' : 'ID'}:</b> ${tgId}
        </div>
        <div style="font-size:11px; margin-bottom:4px;"><b>${currentLang === 'ar' ? 'المبلغ' : 'Amount'}:</b> $${(w.amount || 0).toFixed(2)}</div>
        <div style="font-size:10px; color:var(--text-muted); word-break:break-all;"><b>${currentLang === 'ar' ? 'المحفظة' : 'Wallet'}:</b> ${escapeHTML(w.wallet || '')}</div>
        <div style="margin-top:6px;">
          <button class="btn-small btn-success" onclick="processAdminAction('withdraw', '${w._id}', 'approve')">${currentLang === 'ar' ? 'تأكيد الدفع' : 'Approve'}</button>
          <button class="btn-small btn-danger" onclick="processAdminAction('withdraw', '${w._id}', 'reject')">${currentLang === 'ar' ? 'إلغاء الطلب' : 'Reject'}</button>
        </div>
      </div>
    `;
  }).join('');
}

function renderAdminUsers(list) {
  const c = document.getElementById('admin-users-list');
  if (!c) return;
  if (!list || !list.length) { c.innerHTML = `<p style="color:var(--text-muted);">${currentLang === 'ar' ? 'لا يوجد مستخدمون' : 'No users found'}</p>`; return; }
  c.innerHTML = list.map(u => {
    const fullName = escapeHTML(`${u.firstName || u.first_name || ''} ${u.lastName || u.last_name || ''}`.trim() || u.fullName || u.name || 'غير محدد');
    const username = u.username ? `@${escapeHTML(u.username.replace(/^@/, ''))}` : '@no_username';
    const tgId = escapeHTML(String(u.telegramId || u.userId || u.id || u._id || '—'));
    const avail = (u.availableBalance ?? u.balance ?? 0).toFixed(2);
    const pend = (u.pendingBalance ?? u.pending ?? 0).toFixed(2);

    return `
      <div style="background:#070a12; padding:10px; border-radius:8px; margin-bottom:6px; font-size:11px; border:1px solid var(--card-border);">
        <div style="margin-bottom:4px;"><b>${currentLang === 'ar' ? 'الاسم' : 'Name'}:</b> ${fullName} | <b>${currentLang === 'ar' ? 'المعرف' : 'Username'}:</b> ${username} | <b>${currentLang === 'ar' ? 'الآيدي' : 'ID'}:</b> ${tgId}</div>
        <div style="color:var(--text-muted);"><b>${currentLang === 'ar' ? 'المتاح' : 'Available'}:</b> $${avail} | <b>${currentLang === 'ar' ? 'المعلق' : 'Pending'}:</b> $${pend}</div>
      </div>
    `;
  }).join('');
}

function renderAdminLinks(list) {
  const c = document.getElementById('admin-links-list');
  if (!c) return;
  if (!list || !list.length) { c.innerHTML = `<p style="color:var(--text-muted);">${currentLang === 'ar' ? 'لا توجد روابط' : 'No links found'}</p>`; return; }
  c.innerHTML = list.map(l => `
    <div style="background:#070a12; padding:8px; border-radius:8px; margin-bottom:6px; font-size:11px;">
      <b>كود:</b> ${escapeHTML(l.shortCode || '')} | <b>الزيارات:</b> ${l.views || 0}
    </div>
  `).join('');
}

function renderAdminAds(list) {
  const c = document.getElementById('admin-ads-list');
  if (!c) return;
  if (!list || !list.length) { c.innerHTML = `<p style="color:var(--text-muted);">${currentLang === 'ar' ? 'لا توجد إعلانات' : 'No ads found'}</p>`; return; }
  c.innerHTML = list.map(a => `
    <div style="background:#070a12; padding:8px; border-radius:8px; margin-bottom:6px; font-size:11px;">
      <b>عنوان:</b> ${escapeHTML(a.title || '')} | <b>الميزانية:</b> $${a.budget || 0}
    </div>
  `).join('');
}

async function processAdminAction(type, itemId, action) {
  try {
    const res = await safeFetch(`/api/admin/${type}/${action}`, {
      method: 'POST',
      body: { id: itemId }
    });
    if (res && res.ok) {
      showToast(currentLang === 'ar' ? "تم تنفيذ الإجراء بنجاح" : "Action executed successfully");
      loadAdminData();
    }
  } catch (e) {
    showToast(currentLang === 'ar' ? "خطأ أثناء تنفيذ الإجراء" : "Error executing action");
  }
}

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
      startBridgeTimer(5);
    } else {
      showToast(currentLang === 'ar' ? "تعذر تحميل الرابط المطلوب" : "Failed to load requested link");
    }
  } catch (err) {
    console.error("Bridge init error:", err);
  }
}

function startBridgeTimer(seconds) {
  let timeLeft = seconds;
  const timerElem = document.getElementById('timer');
  const btn = document.getElementById('go-btn');

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
    console.error("Complete impression error:", e);
  } finally {
    window.location.href = bridgeDestinationUrl;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    if (tg && typeof tg.ready === 'function') {
      tg.ready();
      tg.expand();
    }

    renderTelegramUser();
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
  } catch (err) {
    console.error("Initialization error:", err);
  }
});
