/**
 * Telega.ads - Enterprise Shortener & Ad Network
 * Main Application Logic & API Manager
 */

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

let rawUserLinksCache = [];
let bridgeDestinationUrl = null;
let currentShortCode = null;

// --- Helper Utilities ---

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
  } catch (e) {
    // Ignore haptic feedback errors on unsupported platforms
  }
}

function showToast(msg) {
  triggerHaptic('medium');
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.innerText = msg;
  toast.classList.add("show");
  setTimeout(() => { 
    toast.classList.remove("show"); 
  }, 3200);
}

function copyToClipboard(text) {
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    showToast(t('copied', 'تم النسخ بنجاح!'));
  }).catch(() => {
    showToast(currentLang === 'ar' ? "فشل النسخ تلقائياً" : "Failed to copy");
  });
}

function shareReferralLink() {
  const refUrl = document.getElementById('ref-link').value;
  if (!refUrl) return;
  triggerHaptic('medium');
  const shareText = encodeURIComponent(
    currentLang === 'ar' 
      ? "انضم إليّ في أفضل منصة لاختصار الروابط واكسب الأرباح بسهولة! 🚀" 
      : "Join me on the best url shortener platform & earn money! 🚀"
  );
  const url = `https://t.me/share/url?url=${encodeURIComponent(refUrl)}&text=${shareText}`;
  
  if (tg && tg.openTelegramLink) {
    tg.openTelegramLink(url);
  } else {
    window.open(url, '_blank');
  }
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

// --- Navigation & UI View Switching ---

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
  document.getElementById('wallet-nav-deposit').classList.toggle('active', view === 'deposit');
  document.getElementById('wallet-nav-withdraw').classList.toggle('active', view === 'withdraw');

  document.getElementById('wallet-view-deposit').classList.toggle('hidden', view !== 'deposit');
  document.getElementById('wallet-view-withdraw').classList.toggle('hidden', view !== 'withdraw');
}

function toggleInstructionsModal(show) {
  triggerHaptic('medium');
  document.getElementById('instructions-modal').classList.toggle('hidden', !show);
}

function updateWithdrawCalculations() {
  const amtInput = document.getElementById('withdraw-amount');
  const feeBox = document.getElementById('withdraw-fee-box');
  const val = parseFloat(amtInput.value) || 0;

  if (val > 0) {
    feeBox.classList.remove('hidden');
    const fee = 3;
    const net = Math.max(0, val - fee);

    document.getElementById('calc-req').innerText = `$${val.toFixed(2)}`;
    document.getElementById('calc-fee').innerText = `$${fee.toFixed(2)}`;
    document.getElementById('calc-net').innerText = `$${net.toFixed(2)}`;
  } else {
    feeBox.classList.add('hidden');
  }
}

function toggleWalletEdit() {
  triggerHaptic('light');
  const walletInput = document.getElementById('default-wallet');
  const editBtn = document.getElementById('edit-wallet-btn');
  const saveBtn = document.getElementById('save-wallet-btn');

  if (walletInput.hasAttribute('readonly')) {
    walletInput.removeAttribute('readonly');
    walletInput.focus();
    editBtn.innerText = t('cancel', 'إلغاء');
    editBtn.className = "btn-small btn-danger";
    saveBtn.classList.remove('hidden');
  } else {
    walletInput.setAttribute('readonly', 'readonly');
    editBtn.innerText = t('btn_edit', 'تعديل');
    editBtn.className = "btn-small btn-warning";
    saveBtn.classList.add('hidden');
  }
}

// --- Central Safe Fetch API Wrapper ---

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

  const method = (options.method || 'GET').toUpperCase();

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
  
  let cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  let targetUrl = endpoint.startsWith('http') ? endpoint : `${API_BASE}${cleanEndpoint}`;

  if (currentUserTelegramId && !targetUrl.includes('telegramId=') && !targetUrl.includes('userId=')) {
    const separator = targetUrl.includes('?') ? '&' : '?';
    targetUrl = `${targetUrl}${separator}telegramId=${encodeURIComponent(currentUserTelegramId)}&userId=${encodeURIComponent(currentUserTelegramId)}`;
  }

  try {
    let response = await fetch(targetUrl, options);
    return response;
  } catch (err) {
    console.error("Fetch Network Error:", err);
    showToast(t('network_error', 'تعذر الاتصال بالشبكة، يرجى التحقق من اتصال الإنترنت لديك.'));
    return null;
  }
}

// --- User Profile & Telegram Context ---

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

    const savedLang = localStorage.getItem('appLang');
    if (savedLang && window.i18nDict && window.i18nDict[savedLang]) {
      currentLang = savedLang;
    } else if (u.language_code && window.i18nDict && window.i18nDict[u.language_code]) {
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

// --- Authentication & User Data ---

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
    console.error("Auth error:", e);
  }
  return false;
}

async function loadUserData() {
  try {
    const res = await safeFetch('/api/user/data');
    if (res && res.ok) {
      const data = await res.json().catch(() => ({}));
      const u = data.user || {};

      const pendingElem = document.getElementById('pending-bal');
      if (pendingElem) pendingElem.innerText = `$${(u.pendingBalance || 0).toFixed(2)}`;
      
      const availElem = document.getElementById('avail-bal');
      if (availElem) availElem.innerText = `$${(u.availableBalance || 0).toFixed(2)}`;

      const refEarningsElem = document.getElementById('ref-earnings');
      if (refEarningsElem) refEarningsElem.innerText = `$${(u.referralEarnings || 0).toFixed(2)}`;
      
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
    console.error("Error loading user data:", err);
  }
}

// --- Links Management ---

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
            <button class="btn-small" onclick="copyToClipboard('${formattedUrl}')">${t('btn_copy', 'نسخ')}</button>
            <button class="btn-small btn-danger" onclick="deleteLink('${linkId}')">${t('delete', 'حذف')}</button>
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

async function handleShortenClick(e) {
  if (e) e.preventDefault();
  const titleInput = document.getElementById('link-title');
  const urlInput = document.getElementById('link-url');

  const title = titleInput.value.trim();
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
      showToast(t('link_success_msg', 'تم اختصار الرابط بنجاح!'));
      titleInput.value = '';
      urlInput.value = '';
      
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

async function deleteLink(linkId) {
  if (!confirm(t('confirm_delete', 'هل أنت تأكد من حذف هذا الرابط؟'))) return;
  
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

// --- Wallet & Transactions Operations ---

async function requestDeposit() {
  const network = document.getElementById('deposit-network').value;
  const amountVal = document.getElementById('deposit-amount').value;
  const txHashVal = document.getElementById('deposit-txhash').value.trim();

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
        document.getElementById('deposit-amount').value = '';
        document.getElementById('deposit-txhash').value = '';
        await loadUserData();
      } else {
        showToast(data.error || data.message || (currentLang === 'ar' ? 'فشل تقديم طلب الشحن' : 'Failed to submit deposit request'));
      }
    }
  } catch (err) {
    console.error("Deposit request error:", err);
    showToast(currentLang === 'ar' ? 'حدث خطأ أثناء تقديم الطلب' : 'Error submitting deposit request');
  } finally {
    setButtonLoading('btn-request-deposit', false);
  }
}

async function requestWithdrawal() {
  const walletInput = document.getElementById('default-wallet');
  const amountInput = document.getElementById('withdraw-amount');
  const wallet = walletInput.value.trim();
  const amount = parseFloat(amountInput.value);

  if (!wallet) {
    showToast(currentLang === 'ar' ? 'يرجى إدخال عنوان محفظة السحب أولاً' : 'Please set a withdrawal wallet address first');
    toggleWalletEdit();
    return;
  }

  if (!amount || amount < 30) {
    showToast(currentLang === 'ar' ? 'الحد الأدنى للسحب هو $30' : 'Minimum withdrawal amount is $30');
    return;
  }

  setButtonLoading('btn-request-withdraw', true);

  try {
    const res = await safeFetch('/api/withdraw', {
      method: 'POST',
      body: {
        userId: currentUserTelegramId,
        telegramId: currentUserTelegramId,
        network: 'TRC20',
        walletAddress: wallet,
        amount: amount
      }
    });

    if (res) {
      const data = await res.json().catch(() => ({}));
      if (res.ok && (data.success || data.withdraw)) {
        showToast(currentLang === 'ar' ? 'تم تقديم طلب السحب بنجاح' : 'Withdrawal requested successfully');
        amountInput.value = '';
        updateWithdrawCalculations();
        await loadUserData();
      } else {
        showToast(data.error || data.message || (currentLang === 'ar' ? 'فشل طلب السحب' : 'Failed to request withdrawal'));
      }
    }
  } catch (err) {
    console.error("Withdrawal request error:", err);
    showToast(currentLang === 'ar' ? 'حدث خطأ أثناء تقديم طلب السحب' : 'Error requesting withdrawal');
  } finally {
    setButtonLoading('btn-request-withdraw', false);
  }
}

async function saveSettings() {
  const walletInput = document.getElementById('default-wallet');
  const wallet = walletInput.value.trim();

  if (!wallet) {
    showToast(currentLang === 'ar' ? 'يرجى إدخال عنوان المحفظة' : 'Please enter wallet address');
    return;
  }

  setButtonLoading('save-wallet-btn', true);

  try {
    const res = await safeFetch('/api/user/settings', {
      method: 'POST',
      body: {
        userId: currentUserTelegramId,
        defaultWallet: wallet,
        language: currentLang
      }
    });

    if (res) {
      const data = await res.json().catch(() => ({}));
      if (res.ok && (data.success || data.message)) {
        showToast(currentLang === 'ar' ? 'تم حفظ عنوان المحفظة بنجاح' : 'Wallet address saved successfully');
        toggleWalletEdit();
      } else {
        showToast(data.error || data.message || (currentLang === 'ar' ? 'فشل حفظ المحفظة' : 'Failed to save wallet address'));
      }
    }
  } catch (err) {
    console.error("Save settings error:", err);
    showToast(currentLang === 'ar' ? 'خطأ في الاتصال' : 'Network error');
  } finally {
    setButtonLoading('save-wallet-btn', false);
  }
}

// --- Advertising Operations ---

async function createAdCampaign() {
  const title = document.getElementById('ad-title').value.trim();
  const targetUrl = document.getElementById('ad-target-url').value.trim();
  const budget = parseFloat(document.getElementById('ad-budget').value);

  if (!title || !targetUrl || isNaN(budget) || budget < 5) {
    showToast(currentLang === 'ar' ? 'يرجى تعبئة كافة الحقول (الحد الأدنى للميزانية $5)' : 'Please fill all fields (Min budget $5)');
    return;
  }

  setButtonLoading('btn-create-ad', true);

  try {
    const res = await safeFetch('/api/ads', {
      method: 'POST',
      body: {
        userId: currentUserTelegramId,
        telegramId: currentUserTelegramId,
        title: title,
        targetUrl: targetUrl,
        totalBudget: budget
      }
    });

    if (res) {
      const data = await res.json().catch(() => ({}));
      if (res.ok && (data.success || data.ad)) {
        showToast(currentLang === 'ar' ? 'تم إنشاء الحملة الإعلانية بنجاح' : 'Ad campaign created successfully');
        document.getElementById('ad-title').value = '';
        document.getElementById('ad-target-url').value = '';
        document.getElementById('ad-budget').value = '';
        await fetchUserAds();
        await loadUserData();
      } else {
        showToast(data.error || data.message || (currentLang === 'ar' ? 'فشل إنشاء الحملة الإعلانية' : 'Failed to create ad campaign'));
      }
    }
  } catch (err) {
    console.error("Create ad error:", err);
    showToast(currentLang === 'ar' ? 'خطأ في الاتصال' : 'Network error');
  } finally {
    setButtonLoading('btn-create-ad', false);
  }
}

async function fetchUserAds() {
  const adsListContainer = document.getElementById('ads-list');
  try {
    const res = await safeFetch('/api/user/ads');
    if (res) {
      const data = await res.json().catch(() => null);
      if (data && data.ads) {
        renderUserAds(data.ads);
      } else if (Array.isArray(data)) {
        renderUserAds(data);
      } else {
        if (adsListContainer) {
          adsListContainer.innerHTML = `<p style="text-align:center; color: var(--text-muted);">${currentLang === 'ar' ? 'لا توجد حملات إعلانية حالياً' : 'No ad campaigns found'}</p>`;
        }
      }
    }
  } catch (e) {
    console.error("Error fetching ads:", e);
  }
}

function renderUserAds(ads) {
  const container = document.getElementById('ads-list');
  if (!container) return;
  if (!ads || ads.length === 0) {
    container.innerHTML = `<p style="text-align:center; color: var(--text-muted);">${currentLang === 'ar' ? 'لا توجد حملات إعلانية حالياً' : 'No ad campaigns found'}</p>`;
    return;
  }
  container.innerHTML = ads.map(ad => `
    <div class="ad-item">
      <div class="ad-header">
        <strong>${escapeHTML(ad.title)}</strong>
        <span class="user-badge">${t('status_' + (ad.status || 'active').toLowerCase(), ad.status || 'Active')}</span>
      </div>
      <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 4px; word-break: break-all;">
        ${escapeHTML(ad.targetUrl)}
      </div>
      <div style="display: flex; justify-content: space-between; font-size: 11px; margin-top: 6px;">
        <span>${currentLang === 'ar' ? 'الميزانية' : 'Budget'}: $${(ad.totalBudget || ad.budget || 0).toFixed(2)}</span>
        <span>${t('views', 'المشاهدات')}: ${ad.impressionsCount || ad.impressions || 0}</span>
      </div>
    </div>
  `).join('');
}

// --- Referral Operations ---

async function fetchUserReferrals() {
  try {
    const res = await safeFetch('/api/user/referrals');
    if (res && res.ok) {
      const data = await res.json().catch(() => ({}));
      if (data.referralsCount !== undefined) {
        const el = document.getElementById('ref-count');
        if (el) el.innerText = data.referralsCount;
      }
      if (data.referralEarnings !== undefined) {
        const el = document.getElementById('ref-earnings');
        if (el) el.innerText = `$${(data.referralEarnings || 0).toFixed(2)}`;
      }
      if (data.referralLink) {
        const el = document.getElementById('ref-link');
        if (el) el.value = data.referralLink;
      }
      if (data.referrals && Array.isArray(data.referrals)) {
        renderReferralsList(data.referrals);
      }
    }
  } catch (err) {
    console.error("Error fetching referrals:", err);
  }
}

function renderReferralsList(list) {
  const container = document.getElementById('ref-list');
  if (!container) return;
  if (!list || list.length === 0) {
    container.innerHTML = `<p style="text-align:center; color: var(--text-muted); margin: 8px 0;">${currentLang === 'ar' ? 'لا توجد إحالات بعد.' : 'No referrals yet.'}</p>`;
    return;
  }
  container.innerHTML = list.map(item => `
    <div style="background: #070a12; padding: 10px 12px; border-radius: 10px; margin-bottom: 8px; border: 1px solid var(--card-border); font-size: 12px; display: flex; justify-content: space-between; align-items: center;">
      <div>
        <strong style="color: var(--text);">${escapeHTML(item.username || item.firstName || ('User ' + (item.telegramId || '').slice(-4)))}</strong>
        <div style="font-size: 10px; color: var(--text-muted);">ID: ${item.telegramId || '-'}</div>
      </div>
      <span style="color: var(--success); font-weight: bold;">+$${(item.referralEarnings || 0).toFixed(2)}</span>
    </div>
  `).join('');
}

function renderWithdrawalsHistory(list) {
  const container = document.getElementById('withdraws-list');
  if (!container) return;
  if (!list || list.length === 0) {
    container.innerHTML = `<p style="text-align:center; color: var(--text-muted); margin: 8px 0;">${currentLang === 'ar' ? 'لا توجد طلبات سحب سابقة' : 'No withdrawal history'}</p>`;
    return;
  }
  container.innerHTML = list.map(item => {
    const statusKey = 'status_' + (item.status || 'pending').toLowerCase();
    const statusLabel = t(statusKey, item.status || 'pending');
    return `
      <div style="background: #070a12; padding: 10px 12px; border-radius: 10px; margin-bottom: 8px; border: 1px solid var(--card-border); font-size: 12px;">
        <div style="display: flex; justify-content: space-between;">
          <strong style="color: var(--text);">$${(item.amount || 0).toFixed(2)}</strong>
          <span style="color: ${item.status === 'approved' || item.status === 'completed' ? 'var(--success)' : item.status === 'rejected' || item.status === 'failed' ? 'var(--danger)' : 'var(--warning)'}; font-weight: bold;">${statusLabel}</span>
        </div>
        <div style="font-size: 10px; color: var(--text-muted); margin-top: 4px; word-break: break-all;">
          ${escapeHTML(item.walletAddress || item.wallet || item.address || '')}
        </div>
      </div>
    `;
  }).join('');
}

// --- Admin Dashboard Panel ---

async function loadAdminData() {
  if (!isUserAdmin) return;
  try {
    const res = await safeFetch('/api/admin/dashboard-data');
    if (res && res.ok) {
      const data = await res.json().catch(() => ({}));
      const userCountElem = document.getElementById('admin-total-users');
      if (userCountElem) {
        userCountElem.innerText = data.stats?.totalUsers || data.users?.length || 0;
      }
      const pendingElem = document.getElementById('admin-total-pending');
      if (pendingElem) {
        pendingElem.innerText = `$${(data.stats?.totalPending || 0).toFixed(2)}`;
      }
      
      if (data.deposits) renderAdminDeposits(data.deposits);
      if (data.withdraws) renderAdminWithdrawals(data.withdraws);
      if (data.users) renderAdminUsers(data.users);
      if (data.links) renderAdminLinks(data.links);
      if (data.ads) renderAdminAds(data.ads);
    }
  } catch (err) {
    console.error("Error loading admin data:", err);
  }
}

function renderAdminDeposits(deposits) {
  const container = document.getElementById('admin-deposits-list');
  if (!container) return;
  if (!deposits || deposits.length === 0) {
    container.innerHTML = `<p style="color: var(--text-muted);">${currentLang === 'ar' ? 'لا توجد طلبات إيداع معلقة' : 'No pending deposits'}</p>`;
    return;
  }
  container.innerHTML = deposits.map(d => `
    <div style="background: #070a12; padding: 10px; border-radius: 10px; margin-bottom: 8px; border: 1px solid var(--card-border);">
      <div>User: <b>${d.advertiserTelegramId || d.telegramId || d.userId}</b> | Network: <b>${d.network}</b> | Amount: <b style="color:var(--success);">$${d.amount}</b></div>
      <div style="font-size: 10px; color: var(--text-muted); word-break: break-all; margin: 4px 0;">TxID: ${escapeHTML(d.txid || d.txHash)}</div>
      <div style="display: flex; gap: 6px; margin-top: 6px;">
        <button class="btn-small btn-success" onclick="processAdminDeposit('${d._id || d.id}', 'approve')">Approve</button>
        <button class="btn-small btn-danger" onclick="processAdminDeposit('${d._id || d.id}', 'reject')">Reject</button>
      </div>
    </div>
  `).join('');
}

function renderAdminWithdrawals(withdrawals) {
  const container = document.getElementById('admin-withdraws-list');
  if (!container) return;
  if (!withdrawals || withdrawals.length === 0) {
    container.innerHTML = `<p style="color: var(--text-muted);">${currentLang === 'ar' ? 'لا توجد طلبات سحب معلقة' : 'No pending withdrawals'}</p>`;
    return;
  }
  container.innerHTML = withdrawals.map(w => `
    <div style="background: #070a12; padding: 10px; border-radius: 10px; margin-bottom: 8px; border: 1px solid var(--card-border);">
      <div>User: <b>${w.telegramId || w.userId}</b> | Amount: <b style="color:var(--warning);">$${w.amount}</b></div>
      <div style="font-size: 10px; color: var(--text-muted); word-break: break-all; margin: 4px 0;">Wallet: ${escapeHTML(w.walletAddress || w.wallet)}</div>
      <div style="display: flex; gap: 6px; margin-top: 6px;">
        <button class="btn-small btn-success" onclick="processAdminWithdrawal('${w._id || w.id}', 'approve')">Approve</button>
        <button class="btn-small btn-danger" onclick="processAdminWithdrawal('${w._id || w.id}', 'reject')">Reject</button>
      </div>
    </div>
  `).join('');
}

function renderAdminUsers(users) {
  const container = document.getElementById('admin-users-list');
  if (!container) return;
  if (!users || users.length === 0) {
    container.innerHTML = `<p style="color: var(--text-muted);">No users data</p>`;
    return;
  }
  container.innerHTML = users.slice(0, 20).map(u => `
    <div style="padding: 6px 0; border-bottom: 1px solid var(--card-border); font-size: 11px;">
      ID: <b>${u.telegramId || u._id}</b> | Name: <b>${escapeHTML(u.username || u.firstName || 'N/A')}</b> | Bal: <b style="color:var(--success);">$${(u.availableBalance || 0).toFixed(2)}</b>
    </div>
  `).join('');
}

function renderAdminLinks(links) {
  const container = document.getElementById('admin-links-list');
  if (!container) return;
  if (!links || links.length === 0) {
    container.innerHTML = `<p style="color: var(--text-muted);">No links found</p>`;
    return;
  }
  container.innerHTML = links.slice(0, 15).map(l => `
    <div style="padding: 6px 0; border-bottom: 1px solid var(--card-border); font-size: 11px;">
      Code: <b>${l.shortCode}</b> | Views: <b>${l.views || 0}</b> | Owner: <b>${l.publisherTelegramId || l.telegramId || 'N/A'}</b>
    </div>
  `).join('');
}

function renderAdminAds(ads) {
  const container = document.getElementById('admin-ads-list');
  if (!container) return;
  if (!ads || ads.length === 0) {
    container.innerHTML = `<p style="color: var(--text-muted);">No ads found</p>`;
    return;
  }
  container.innerHTML = ads.slice(0, 15).map(a => `
    <div style="padding: 6px 0; border-bottom: 1px solid var(--card-border); font-size: 11px;">
      Title: <b>${escapeHTML(a.title)}</b> | Budget: <b>$${a.totalBudget || a.budget}</b> | Status: <b>${a.status}</b>
    </div>
  `).join('');
}

async function processAdminDeposit(depositId, action) {
  try {
    const res = await safeFetch(`/api/admin/deposits/${action}`, {
      method: 'POST',
      body: { depositId }
    });
    if (res && res.ok) {
      showToast(`Deposit ${action}d successfully`);
      loadAdminData();
    }
  } catch (e) {
    console.error("Process deposit error:", e);
  }
}

async function processAdminWithdrawal(withdrawId, action) {
  try {
    const res = await safeFetch(`/api/admin/withdraws/${action}`, {
      method: 'POST',
      body: { withdrawId }
    });
    if (res && res.ok) {
      showToast(`Withdrawal ${action}d successfully`);
      loadAdminData();
    }
  } catch (e) {
    console.error("Process withdrawal error:", e);
  }
}

// --- Bridge Page & Traffic Verification ---

function checkBridgeMode() {
  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get('code') || urlParams.get('r') || (window.location.pathname.startsWith('/r/') ? window.location.pathname.split('/r/')[1] : null);

  if (code) {
    const appView = document.getElementById('app-view');
    const bridgeView = document.getElementById('bridge-view');
    if (appView) appView.classList.add('hidden');
    if (bridgeView) bridgeView.classList.remove('hidden');
    currentShortCode = code;
    initBridgePage(code);
  }
}

async function initBridgePage(code) {
  try {
    const res = await safeFetch('/api/init-click', {
      method: 'POST',
      body: { linkCode: code }
    });
    if (res && res.ok) {
      const data = await res.json();
      if (data.success) {
        currentSessionId = data.sessionId;
        bridgeToken = data.bridgeToken;
        bridgeStartTime = Date.now();
        
        if (data.adData) {
          const adContainer = document.getElementById('ad-container');
          if (adContainer) {
            adContainer.innerHTML = `
              <div style="padding: 14px; text-align: center;">
                <span class="user-badge" style="margin-bottom: 8px;">إعلان ممول / Sponsored Ad</span>
                <h3 style="margin: 8px 0; color: var(--accent); font-size: 16px;">${escapeHTML(data.adData.title)}</h3>
                <a href="${escapeHTML(data.adData.targetUrl)}" target="_blank" class="btn-small" style="margin-top: 10px; text-decoration: none; display: inline-block;">زيارة الإعلان / Visit Ad</a>
              </div>
            `;
          }
        } else if (data.blockId && window.Adsgram) {
          try {
            const AdController = window.Adsgram.init({ blockId: String(data.blockId) });
            AdController.show();
          } catch (adErr) {
            console.log("Adsgram display error:", adErr);
          }
        }

        startBridgeTimer(5);
      } else {
        showToast(data.error || (currentLang === 'ar' ? "الرابط غير صالح أو معطل" : "Invalid link"));
      }
    } else {
      showToast(currentLang === 'ar' ? "الرابط غير موجود أو معطل" : "Link not found");
    }
  } catch (err) {
    console.error("Bridge init error:", err);
  }
}

function startBridgeTimer(seconds) {
  let timeLeft = seconds;
  const timerElem = document.getElementById('timer');
  const goBtn = document.getElementById('go-btn');

  const interval = setInterval(() => {
    timeLeft--;
    if (timerElem) timerElem.innerText = timeLeft;
    if (timeLeft <= 0) {
      clearInterval(interval);
      if (goBtn) {
        goBtn.disabled = false;
        goBtn.classList.add('btn-success');
      }
    }
  }, 1000);
}

async function completeImpression() {
  if (!currentSessionId || !bridgeToken) {
    showToast(currentLang === 'ar' ? "الجلسة غير صالحة" : "Invalid session");
    return;
  }

  const duration = Math.round((Date.now() - bridgeStartTime) / 1000);
  setButtonLoading('go-btn', true);

  try {
    const res = await safeFetch('/api/impression', {
      method: 'POST',
      body: {
        sessionId: currentSessionId,
        bridgeToken: bridgeToken,
        duration: duration
      }
    });

    if (res && res.ok) {
      const data = await res.json();
      if (data.targetUrl) {
        window.location.href = data.targetUrl;
        return;
      }
    }
  } catch (e) {
    console.error("Error logging impression:", e);
  } finally {
    setButtonLoading('go-btn', false);
  }
}

// --- Application Lifecycle Initialization ---

async function initializeApp() {
  if (tg) {
    tg.ready();
    tg.expand();
  }

  renderTelegramUser();
  await authLogin();

  await loadUserData();
  await fetchUserLinks();

  checkBridgeMode();
}

document.addEventListener('DOMContentLoaded', () => {
  initializeApp();
});
