const API_BASE = window.location.protocol.startsWith('file') 
  ? 'http://localhost:3000' 
  : window.location.origin;

let currentLang = localStorage.getItem('appLang') || 'ar';
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

// حفظ initData احتياطياً في localStorage
if (window.Telegram?.WebApp?.initData) {
  localStorage.setItem('telegramInitData', window.Telegram.WebApp.initData);
}

const i18n = window.i18n || {
  ar: {
    copied: "تم النسخ بنجاح!",
    network_error: "خطأ في الاتصال بالشبكة",
    cancel: "إلغاء",
    btn_edit: "تعديل",
    btn_copy: "نسخ",
    link_success_msg: "تم اختصار الرابط بنجاح!"
  },
  en: {
    copied: "Copied successfully!",
    network_error: "Network connection error",
    cancel: "Cancel",
    btn_edit: "Edit",
    btn_copy: "Copy",
    link_success_msg: "Link shortened successfully!"
  }
};

let rawUserLinksCache = [];
let bridgeDestinationUrl = null;
let currentShortCode = null;

function applyLanguage(lang) {
  currentLang = lang || 'ar';
  localStorage.setItem('appLang', currentLang);
}

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

/**
 * دالة جلب البيانات الذكية (safeFetch)
 * تقوم بإرسال Telegram.WebApp.initData ذكياً في جميع الطلبات
 */
async function safeFetch(endpoint, options = {}) {
  options.headers = options.headers || {};
  
  if (!currentUserTelegramId && tg?.initDataUnsafe?.user?.id) {
    currentUserTelegramId = String(tg.initDataUnsafe.user.id);
    localStorage.setItem('telegramId', currentUserTelegramId);
  }

  // استخراج initData ذكياً من التليجرام أو تخزينه/استرجاعه من localStorage
  const initDataStr = window.Telegram?.WebApp?.initData || tg?.initData || localStorage.getItem('telegramInitData') || '';
  if (window.Telegram?.WebApp?.initData) {
    localStorage.setItem('telegramInitData', window.Telegram.WebApp.initData);
  }
  
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
    nameElem.innerText = fullName;
    handleElem.innerText = u.username ? `@${u.username}` : (fullName || `ID: ${u.id}`);
    idElem.innerText = `ID: ${u.id}`;

    if (u.is_premium && premiumBadge) {
      premiumBadge.classList.remove('hidden');
    }

    if (u.photo_url) {
      avatarContainer.innerHTML = `<img src="${escapeHTML(u.photo_url)}" class="user-avatar-img" alt="Avatar">`;
    } else {
      const letter = (u.first_name || 'U').charAt(0).toUpperCase();
      avatarContainer.innerHTML = `<div class="user-avatar-placeholder">${escapeHTML(letter)}</div>`;
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
    nameElem.innerText = 'Telegram User';
    handleElem.innerText = '@user';
    idElem.innerText = `ID: ${currentUserTelegramId}`;
    avatarContainer.innerHTML = `<div class="user-avatar-placeholder">U</div>`;
    if (!localStorage.getItem('appLang')) {
      currentLang = 'ar';
    }
  }

  applyLanguage(currentLang);
}

function shareReferralLink() {
  const refUrl = document.getElementById('ref-link').value;
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

  if (walletInput.hasAttribute('readonly')) {
    walletInput.removeAttribute('readonly');
    walletInput.focus();
    editBtn.innerText = i18n[currentLang]?.cancel || 'إلغاء';
    editBtn.className = "btn-small btn-danger";
    saveBtn.classList.remove('hidden');
  } else {
    walletInput.setAttribute('readonly', 'readonly');
    editBtn.innerText = i18n[currentLang]?.btn_edit || 'تعديل';
    editBtn.className = "btn-small btn-warning";
    saveBtn.classList.add('hidden');
  }
}

async function authLogin() {
  const startParam = tg?.initDataUnsafe?.start_param || null;
  const u = tg?.initDataUnsafe?.user || {};
  const initDataStr = window.Telegram?.WebApp?.initData || tg?.initData || localStorage.getItem('telegramInitData') || '';

  try {
    const res = await safeFetch('/api/auth/login', {
      method: 'POST',
      body: { 
        userId: currentUserTelegramId,
        telegramId: currentUserTelegramId,
        referrerId: startParam,
        firstName: u.first_name || u.firstName || '',
        lastName: u.last_name || u.lastName || '',
        username: u.username || '',
        photoUrl: u.photo_url || u.photoUrl || '',
        isPremium: !!(u.is_premium || u.isPremium),
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

async function loadUserData() {
  try {
    const res = await safeFetch('/api/user/data');
    if (res && res.ok) {
      const data = await res.json().catch(() => ({}));
      const u = data.user || {};

      document.getElementById('pending-bal').innerText = `$${(u.pendingBalance || 0).toFixed(2)}`;
      document.getElementById('avail-bal').innerText = `$${(u.availableBalance || 0).toFixed(2)}`;
      document.getElementById('ref-earnings').innerText = `$${(u.referralEarnings || 0).toFixed(2)}`;
      
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
          document.getElementById('anc-title').innerText = anc.title;
          document.getElementById('anc-content').innerText = anc.content || anc.message || '';
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
      showToast(i18n[currentLang]?.link_success_msg || 'تم اختصار الرابط بنجاح!');
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
    showToast(err.message || (currentLang === 'ar' ? 'خطأ أثناء تقديم الطلب' : 'Error submitting request'));
  } finally {
    setButtonLoading('btn-request-deposit', false);
  }
}

async function saveSettings() {
  const walletAddr = document.getElementById('default-wallet').value.trim();
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
  const walletAddr = document.getElementById('default-wallet').value.trim();
  const amountVal = parseFloat(document.getElementById('withdraw-amount').value) || 0;

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
        document.getElementById('withdraw-amount').value = '';
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
  const title = document.getElementById('ad-title').value.trim();
  let targetUrl = document.getElementById('ad-target-url').value.trim();
  const budget = parseFloat(document.getElementById('ad-budget').value) || 0;

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
        document.getElementById('ad-title').value = '';
        document.getElementById('ad-target-url').value = '';
        document.getElementById('ad-budget').value = '';
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
    if (res) {
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
  }).join('');
}

async function loadAdminData() {
  if (!isUserAdmin) return;

  try {
    const res = await safeFetch('/api/admin/dashboard');
    if (res && res.ok) {
      const data = await res.json().catch(() => ({}));
      
      document.getElementById('admin-total-users').innerText = data.totalUsers || 0;
      document.getElementById('admin-total-pending').innerText = `$${(data.totalPendingBalance || 0).toFixed(2)}`;

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

/**
 * دالة معالجة واستخراج بيانات المستخدم الذكية للعرض في لوحة الإدارة
 * تضمن عرض الاسم الكامل، الـ Username، والـ Telegram ID مع البدائل الذكية
 */
function formatUserInfo(u) {
  if (!u) u = {};

  // استخراج معرف التليجرام
  const tgId = u.telegramId || u.userId || u.id || (typeof u === 'string' || typeof u === 'number' ? String(u) : '');

  // استخراج الاسم الأول واللقب
  const firstName = u.firstName || u.first_name || u.name || '';
  const lastName = u.lastName || u.last_name || '';
  let fullName = `${firstName} ${lastName}`.trim();
  if (!fullName && u.fullName) fullName = u.fullName;

  // استخراج اسم المستخدم (Username)
  let rawUsername = u.username || u.user_name || u.handle || '';
  if (rawUsername) {
    rawUsername = String(rawUsername).replace(/^@/, '').trim();
  }

  // معالجة اسم المستخدم ذكياً عند غيابه
  let usernameDisplay = '';
  if (rawUsername) {
    usernameDisplay = `@${rawUsername}`;
  } else if (fullName) {
    usernameDisplay = `${fullName}`;
  } else if (tgId) {
    usernameDisplay = `ID: ${tgId}`;
  } else {
    usernameDisplay = 'بدون اسم مستخدم';
  }

  // معالجة الاسم الكامل عند غيابه
  if (!fullName) {
    if (rawUsername) {
      fullName = `@${rawUsername}`;
    } else if (tgId) {
      fullName = `مستخدم (${tgId})`;
    } else {
      fullName = 'مستخدم غير معروف';
    }
  }

  return {
    fullName: escapeHTML(fullName),
    username: escapeHTML(usernameDisplay),
    telegramId: escapeHTML(String(tgId || 'غير محدد')),
    hasUsername: !!rawUsername
  };
}

function renderAdminDeposits(list) {
  const c = document.getElementById('admin-deposits-list');
  if (!c) return;
  if (!list || !list.length) { c.innerHTML = '<p style="color:var(--text-muted);">لا توجد طلبات إيداع معلقة</p>'; return; }
  
  c.innerHTML = list.map(d => {
    const userInfo = formatUserInfo(d.user || d);
    const amount = (d.amount || 0).toFixed(2);
    const txid = escapeHTML(d.txid || d.txHash || 'N/A');
    const network = escapeHTML(d.network || 'TRC20');

    return `
      <div style="background:#070a12; padding:10px; border-radius:10px; margin-bottom:8px; border:1px solid var(--card-border);">
        <div style="margin-bottom: 4px;">
          <strong style="color:var(--text); font-size:12px;">👤 الاسم: ${userInfo.fullName}</strong>
        </div>
        <div style="font-size:11px; color:var(--text-muted); margin-bottom: 4px;">
          <span><b>اسم المستخدم:</b> ${userInfo.username}</span> | 
          <span><b>آيدي تليجرام:</b> ${userInfo.telegramId}</span>
        </div>
        <div style="font-size:11px; color:var(--accent); margin-bottom: 4px;">
          <b>المبلغ:</b> $${amount} | <b>الشبكة:</b> ${network}
        </div>
        <div style="font-size:10px; color:var(--text-muted); word-break:break-all; margin-bottom: 6px;">
          <b>TxID:</b> ${txid}
        </div>
        <div style="margin-top:6px; display: flex; gap: 6px;">
          <button class="btn-small btn-success" onclick="processAdminAction('deposit', '${d._id}', 'approve')">قبول</button>
          <button class="btn-small btn-danger" onclick="processAdminAction('deposit', '${d._id}', 'reject')">رفض</button>
        </div>
      </div>
    `;
  }).join('');
}

function renderAdminWithdraws(list) {
  const c = document.getElementById('admin-withdraws-list');
  if (!c) return;
  if (!list || !list.length) { c.innerHTML = '<p style="color:var(--text-muted);">لا توجد طلبات سحب معلقة</p>'; return; }
  
  c.innerHTML = list.map(w => {
    const userInfo = formatUserInfo(w.user || w);
    const amount = (w.amount || 0).toFixed(2);
    const wallet = escapeHTML(w.wallet || 'N/A');

    return `
      <div style="background:#070a12; padding:10px; border-radius:10px; margin-bottom:8px; border:1px solid var(--card-border);">
        <div style="margin-bottom: 4px;">
          <strong style="color:var(--text); font-size:12px;">👤 الاسم: ${userInfo.fullName}</strong>
        </div>
        <div style="font-size:11px; color:var(--text-muted); margin-bottom: 4px;">
          <span><b>اسم المستخدم:</b> ${userInfo.username}</span> | 
          <span><b>آيدي تليجرام:</b> ${userInfo.telegramId}</span>
        </div>
        <div style="font-size:11px; color:var(--warning); margin-bottom: 4px;">
          <b>المبلغ:</b> $${amount}
        </div>
        <div style="font-size:10px; color:var(--text-muted); word-break:break-all; margin-bottom: 6px;">
          <b>المحفظة:</b> ${wallet}
        </div>
        <div style="margin-top:6px; display: flex; gap: 6px;">
          <button class="btn-small btn-success" onclick="processAdminAction('withdraw', '${w._id}', 'approve')">تأكيد الدفع</button>
          <button class="btn-small btn-danger" onclick="processAdminAction('withdraw', '${w._id}', 'reject')">إلغاء الطلب</button>
        </div>
      </div>
    `;
  }).join('');
}

function renderAdminUsers(list) {
  const c = document.getElementById('admin-users-list');
  if (!c) return;
  if (!list || !list.length) { c.innerHTML = '<p style="color:var(--text-muted);">لا يوجد مستخدمون</p>'; return; }

  c.innerHTML = list.map(u => {
    const userInfo = formatUserInfo(u);
    const avail = (u.availableBalance || 0).toFixed(2);
    const pending = (u.pendingBalance || 0).toFixed(2);

    return `
      <div style="background:#070a12; padding:10px; border-radius:10px; margin-bottom:6px; border:1px solid var(--card-border); font-size:11px;">
        <div style="margin-bottom: 3px;">
          <strong style="color:var(--text); font-size:12px;">👤 ${userInfo.fullName}</strong>
        </div>
        <div style="color:var(--text-muted); margin-bottom: 4px;">
          <span><b>المستخدم:</b> ${userInfo.username}</span> | 
          <span><b>ID:</b> ${userInfo.telegramId}</span>
        </div>
        <div style="color:var(--success);">
          <b>المتاح:</b> $${avail} | <b>المعلق:</b> $${pending}
        </div>
      </div>
    `;
  }).join('');
}

function renderAdminLinks(list) {
  const c = document.getElementById('admin-links-list');
  if (!c) return;
  c.innerHTML = list.map(l => `
    <div style="background:#070a12; padding:8px; border-radius:8px; margin-bottom:6px; font-size:11px;">
      <b>كود:</b> ${escapeHTML(l.shortCode)} | <b>الزيارات:</b> ${l.views||0}
    </div>
  `).join('');
}

function renderAdminAds(list) {
  const c = document.getElementById('admin-ads-list');
  if (!c) return;
  c.innerHTML = list.map(a => `
    <div style="background:#070a12; padding:8px; border-radius:8px; margin-bottom:6px; font-size:11px;">
      <b>عنوان:</b> ${escapeHTML(a.title)} | <b>الميزانية:</b> $${(a.budget||0).toFixed(2)}
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
      showToast("تم تنفيذ الإجراء بنجاح");
      loadAdminData();
    }
  } catch (e) {
    showToast("خطأ أثناء تنفيذ الإجراء");
  }
}

async function initBridgeView(code) {
  currentShortCode = code;
  document.getElementById('app-view').classList.add('hidden');
  document.getElementById('bridge-view').classList.remove('hidden');

  try {
    const res = await safeFetch(`/api/bridge/${code}`);
    if (res && res.ok) {
      const data = await res.json().catch(() => ({}));
      bridgeDestinationUrl = data.targetUrl || data.originalUrl || '/';
      bridgeToken = data.token || null;
      startBridgeTimer(5);
    } else {
      showToast("تعذر تحميل الرابط المطلوب");
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
});
