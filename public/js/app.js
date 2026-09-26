/**
 * Telegram Mini App & URL Shortener Platform
 * File: public/js/app.js
 * Comprehensive implementation including Auth, i18n, Telegram WebApp API, Wallet, Ads & Admin controls.
 */

const API_BASE = window.location.protocol.startsWith('file') 
  ? 'http://localhost:3000' 
  : window.location.origin;

let currentLang = 'ar';
let authToken = localStorage.getItem('authToken');
let currentSessionId = null;
let bridgeToken = null;
let bridgeStartTime = Date.now();
let isUserAdmin = false;

const tg = window.Telegram?.WebApp;

// Dictionary for Internationalization (i18n)
const i18n = {
  ar: {
    copied: "تم النسخ بنجاح!",
    copy_failed: "فشل النسخ تلقائياً",
    network_error: "خطأ في الاتصال بالشبكة",
    access_denied: "غير مصرح لك بالوصول للوحة التحكم",
    cancel: "إلغاء",
    btn_edit: "تعديل",
    btn_copy: "نسخ",
    link_success_msg: "تم اختصار الرابط بنجاح!",
    enter_orig_url: "يرجى إدخال الرابط الأصلي",
    create_link_fail: "فشل إنشاء الرابط المختصر",
    shorten_error: "حدث خطأ أثناء اختصار الرابط",
    no_links: "لا توجد روابط مختصرة بعد.",
    confirm_delete: "هل أنت تأكد من حذف هذا الرابط؟",
    link_deleted: "تم حذف الرابط بنجاح",
    delete_failed: "فشل حذف الرابط",
    select_network: "يرجى اختيار شبكة الدفع",
    min_deposit: "الحد الأدنى للإيداع هو $1",
    enter_txid: "يرجى إدخال رمز المعاملة (TxID)",
    deposit_success: "تم تقديم طلب الشحن بنجاح! سيتم مراجعته قريباً.",
    deposit_fail: "فشل تقديم طلب الشحن",
    enter_wallet: "يرجى إدخال عنوان المحفظة",
    wallet_saved: "تم حفظ العنوان بنجاح",
    wallet_save_fail: "فشل حفظ العنوان",
    min_withdraw: "الحد الأدنى للسحب هو 30$",
    withdraw_success: "تم تقديم طلب السحب بنجاح",
    withdraw_fail: "فشل تقديم طلب السحب",
    enter_ad_title: "يرجى إدخال عنوان الإعلان",
    enter_ad_url: "يرجى إدخال رابط التوجيه",
    min_ad_budget: "الحد الأدنى لميزانية الحملة هو $5",
    ad_success: "تم إطلاق الحملة الإعلانية بنجاح!",
    ad_fail: "فشل إنشاء الحملة الإعلانية",
    no_ads: "لا توجد حملات إعلانية نشطة.",
    no_referrals: "لم تنضم أي إحالات عبر رابطك بعد.",
    no_withdraws: "لا توجد طلبات سحب سابقة.",
    action_success: "تم تنفيذ الإجراء بنجاح",
    action_fail: "خطأ أثناء تنفيذ الإجراء",
    clicks: "زيارة",
    valid: "مؤكدة",
    delete: "حذف",
    approved: "مكتمل",
    rejected: "مرفوض",
    pending: "قيد المراجعة",
    share_ref_ar: "انضم إليّ في أفضل منصة لاختصار الروابط واكسب الأرباح بسهولة! 🚀",
    share_ref_en: "Join me on the best url shortener platform & earn money! 🚀"
  },
  en: {
    copied: "Copied successfully!",
    copy_failed: "Failed to copy",
    network_error: "Network connection error",
    access_denied: "Access denied to admin panel",
    cancel: "Cancel",
    btn_edit: "Edit",
    btn_copy: "Copy",
    link_success_msg: "Link shortened successfully!",
    enter_orig_url: "Please enter original URL",
    create_link_fail: "Failed to create short link",
    shorten_error: "An error occurred while shortening link",
    no_links: "No shortened links found.",
    confirm_delete: "Are you sure you want to delete this link?",
    link_deleted: "Link deleted successfully",
    delete_failed: "Failed to delete link",
    select_network: "Please select payment network",
    min_deposit: "Minimum deposit amount is $1",
    enter_txid: "Please enter transaction TxID / Hash",
    deposit_success: "Deposit request submitted successfully!",
    deposit_fail: "Failed to submit deposit request",
    enter_wallet: "Please enter wallet address",
    wallet_saved: "Wallet address saved",
    wallet_save_fail: "Failed to save address",
    min_withdraw: "Minimum withdrawal is $30",
    withdraw_success: "Withdrawal requested successfully",
    withdraw_fail: "Failed to request withdrawal",
    enter_ad_title: "Please enter ad title",
    enter_ad_url: "Please enter target URL",
    min_ad_budget: "Minimum campaign budget is $5",
    ad_success: "Ad campaign launched successfully!",
    ad_fail: "Failed to create ad campaign",
    no_ads: "No active ad campaigns.",
    no_referrals: "No referrals registered yet.",
    no_withdraws: "No withdrawal history found.",
    action_success: "Action performed successfully",
    action_fail: "Error performing action",
    clicks: "clicks",
    valid: "valid",
    delete: "Delete",
    approved: "Approved",
    rejected: "Rejected",
    pending: "Pending",
    share_ref_ar: "Join me on the best url shortener platform & earn money! 🚀",
    share_ref_en: "Join me on the best url shortener platform & earn money! 🚀"
  }
};

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

function applyLanguage(lang) {
  if (!i18n[lang]) lang = 'ar';
  currentLang = lang;
  localStorage.setItem('appLang', currentLang);

  document.querySelectorAll('[data-i18n]').forEach(elem => {
    const key = elem.getAttribute('data-i18n');
    if (i18n[currentLang] && i18n[currentLang][key]) {
      elem.innerText = i18n[currentLang][key];
    }
  });

  const dir = currentLang === 'ar' ? 'rtl' : 'ltr';
  document.documentElement.setAttribute('dir', dir);
  document.documentElement.setAttribute('lang', currentLang);
}

function toggleLanguage() {
  const newLang = currentLang === 'ar' ? 'en' : 'ar';
  applyLanguage(newLang);
  showToast(newLang === 'ar' ? 'تم تغيير اللغة إلى العربية' : 'Language changed to English');
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
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(() => {
      showToast(i18n[currentLang]?.copied || "تم النسخ بنجاح!");
    }).catch(() => {
      fallbackCopyText(text);
    });
  } else {
    fallbackCopyText(text);
  }
}

function fallbackCopyText(text) {
  try {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-9999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    if (successful) {
      showToast(i18n[currentLang]?.copied || "تم النسخ بنجاح!");
    } else {
      showToast(i18n[currentLang]?.copy_failed || "فشل النسخ تلقائياً");
    }
  } catch (err) {
    showToast(i18n[currentLang]?.copy_failed || "فشل النسخ تلقائياً");
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
    showToast(i18n[currentLang]?.access_denied || "غير مصرح لك بالوصول للوحة التحكم");
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
  const navWit = document.getElementById('wallet-nav-withdraw');
  const viewDep = document.getElementById('wallet-view-deposit');
  const viewWit = document.getElementById('wallet-view-withdraw');

  if (navDep) navDep.classList.toggle('active', view === 'deposit');
  if (navWit) navWit.classList.toggle('active', view === 'withdraw');

  if (viewDep) viewDep.classList.toggle('hidden', view !== 'deposit');
  if (viewWit) viewWit.classList.toggle('hidden', view !== 'withdraw');
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

    if (premiumBadge && u.is_premium) {
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
  if (!refInput || !refInput.value) return;
  triggerHaptic('medium');
  const refUrl = refInput.value;
  const shareMsg = currentLang === 'ar' ? i18n.ar.share_ref_ar : i18n.en.share_ref_en;
  const shareText = encodeURIComponent(shareMsg);
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

  if (!walletInput) return;

  if (walletInput.hasAttribute('readonly')) {
    walletInput.removeAttribute('readonly');
    walletInput.focus();
    if (editBtn) {
      editBtn.innerText = i18n[currentLang].cancel;
      editBtn.className = "btn-small btn-danger";
    }
    if (saveBtn) saveBtn.classList.remove('hidden');
  } else {
    walletInput.setAttribute('readonly', 'readonly');
    if (editBtn) {
      editBtn.innerText = i18n[currentLang].btn_edit;
      editBtn.className = "btn-small btn-warning";
    }
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

      const pendElem = document.getElementById('pending-bal');
      const availElem = document.getElementById('avail-bal');
      const refEarnElem = document.getElementById('ref-earnings');

      if (pendElem) pendElem.innerText = `$${(u.pendingBalance || 0).toFixed(2)}`;
      if (availElem) availElem.innerText = `$${(u.availableBalance || 0).toFixed(2)}`;
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
          const titleElem = document.getElementById('anc-title');
          const contentElem = document.getElementById('anc-content');
          if (titleElem) titleElem.innerText = anc.title;
          if (contentElem) contentElem.innerText = anc.content || anc.message || '';
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

  if (!urlInput) return;

  const title = titleInput ? titleInput.value.trim() : '';
  let url = urlInput.value.trim();

  if (!url) {
    showToast(i18n[currentLang]?.enter_orig_url || 'يرجى إدخال الرابط الأصلي');
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
      const errorMsg = data.error || data.message || i18n[currentLang]?.create_link_fail || 'فشل إنشاء الرابط المختصر';
      showToast(errorMsg);
    }
  } catch (err) {
    console.error("Shorten Link Error:", err);
    showToast(err.message || i18n[currentLang]?.shorten_error || 'حدث خطأ أثناء اختصار الرابط');
  } finally {
    setButtonLoading('btn-create-link', false);
  }
}

function renderUserLinks(links) {
  const container = document.getElementById('links-list');
  if (!container) return;

  if (!links || links.length === 0) {
    container.innerHTML = `<p style="text-align:center; color: var(--text-muted); margin: 12px 0;">${i18n[currentLang]?.no_links || 'لا توجد روابط مختصرة بعد.'}</p>`;
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

    const clicksLabel = i18n[currentLang]?.clicks || 'زيارة';
    const validLabel = i18n[currentLang]?.valid || 'مؤكدة';
    const copyLabel = i18n[currentLang]?.btn_copy || 'نسخ';
    const deleteLabel = i18n[currentLang]?.delete || 'حذف';

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
          <span style="font-size: 11px; color: var(--text-muted);">👁️ ${clicks} ${clicksLabel} (${validImp} ${validLabel})</span>
          <div class="link-actions">
            <button class="btn-small" onclick="copyToClipboard('${formattedUrl}')">${copyLabel}</button>
            <button class="btn-small btn-danger" onclick="deleteLink('${linkId}')">${deleteLabel}</button>
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
  const confirmMsg = i18n[currentLang]?.confirm_delete || 'هل أنت تأكد من حذف هذا الرابط؟';
  if (!confirm(confirmMsg)) return;
  
  try {
    const res = await safeFetch(`/api/links/${linkId}`, { method: 'DELETE' });
    if (res) {
      const data = await res.json().catch(() => ({}));
      if (res.ok && (data.success || data.message)) {
        showToast(i18n[currentLang]?.link_deleted || 'تم حذف الرابط بنجاح');
        await loadUserData();
        await fetchUserLinks();
      } else {
        showToast(data.error || data.message || i18n[currentLang]?.delete_failed || 'فشل حذف الرابط');
      }
    }
  } catch (err) {
    showToast(err.message || i18n[currentLang]?.network_error || 'خطأ في الشبكة');
  }
}

async function requestDeposit() {
  const netInput = document.getElementById('deposit-network');
  const amtInput = document.getElementById('deposit-amount');
  const txInput = document.getElementById('deposit-txhash');

  const network = netInput ? netInput.value : '';
  const amountVal = amtInput ? amtInput.value : '';
  const txHashVal = txInput ? txInput.value.trim() : '';

  if (!network) {
    showToast(i18n[currentLang]?.select_network || 'يرجى اختيار شبكة الدفع');
    return;
  }
  const amount = parseFloat(amountVal);
  if (!amount || amount < 1) {
    showToast(i18n[currentLang]?.min_deposit || 'الحد الأدنى للإيداع هو $1');
    return;
  }
  if (!txHashVal || txHashVal.length < 5) {
    showToast(i18n[currentLang]?.enter_txid || 'يرجى إدخال رمز المعاملة (TxID)');
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
        showToast(i18n[currentLang]?.deposit_success || 'تم تقديم طلب الشحن بنجاح! سيتم مراجعته قريباً.');
        if (amtInput) amtInput.value = '';
        if (txInput) txInput.value = '';
        await loadUserData();
      } else {
        showToast(data.error || data.message || i18n[currentLang]?.deposit_fail || 'فشل تقديم طلب الشحن');
      }
    }
  } catch (err) {
    console.error("Deposit request error:", err);
    showToast(err.message || i18n[currentLang]?.deposit_fail || 'خطأ أثناء تقديم الطلب');
  } finally {
    setButtonLoading('btn-request-deposit', false);
  }
}

async function saveSettings() {
  const walletInput = document.getElementById('default-wallet');
  const walletAddr = walletInput ? walletInput.value.trim() : '';

  if (!walletAddr) {
    showToast(i18n[currentLang]?.enter_wallet || 'يرجى إدخال عنوان المحفظة');
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
        showToast(i18n[currentLang]?.wallet_saved || 'تم حفظ العنوان بنجاح');
        toggleWalletEdit();
        await loadUserData();
      } else {
        showToast(data.error || i18n[currentLang]?.wallet_save_fail || 'فشل حفظ العنوان');
      }
    }
  } catch (err) {
    showToast(err.message || i18n[currentLang]?.wallet_save_fail || 'خطأ أثناء الحفظ');
  }
}

async function requestWithdrawal() {
  const walletInput = document.getElementById('default-wallet');
  const amtInput = document.getElementById('withdraw-amount');

  const walletAddr = walletInput ? walletInput.value.trim() : '';
  const amountVal = parseFloat(amtInput ? amtInput.value : 0) || 0;

  if (!walletAddr) {
    showToast(i18n[currentLang]?.enter_wallet || 'يرجى إدخال وتحديد عنوان محفظة السحب أولاً');
    return;
  }

  if (amountVal < 30) {
    showToast(i18n[currentLang]?.min_withdraw || 'الحد الأدنى للسحب هو 30$');
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
        showToast(i18n[currentLang]?.withdraw_success || 'تم تقديم طلب السحب بنجاح');
        if (amtInput) amtInput.value = '';
        updateWithdrawCalculations();
        await loadUserData();
      } else {
        showToast(data.error || data.message || i18n[currentLang]?.withdraw_fail || 'فشل تقديم طلب السحب');
      }
    }
  } catch (err) {
    showToast(err.message || i18n[currentLang]?.withdraw_fail || 'خطأ في عملية السحب');
  } finally {
    setButtonLoading('btn-request-withdraw', false);
  }
}

function renderWithdrawalsHistory(withdraws) {
  const container = document.getElementById('withdraws-list');
  if (!container) return;

  if (!withdraws || withdraws.length === 0) {
    container.innerHTML = `<p style="text-align:center; color: var(--text-muted); margin: 10px 0;">${i18n[currentLang]?.no_withdraws || 'لا توجد طلبات سحب سابقة.'}</p>`;
    return;
  }

  container.innerHTML = withdraws.map(w => {
    const isApproved = w.status === 'completed' || w.status === 'approved';
    const isRejected = w.status === 'rejected';
    
    const statusClass = isApproved ? 'color: var(--success);' : isRejected ? 'color: var(--danger);' : 'color: var(--warning);';
    const statusText = isApproved ? (i18n[currentLang]?.approved || 'مكتمل') : isRejected ? (i18n[currentLang]?.rejected || 'مرفوض') : (i18n[currentLang]?.pending || 'قيد المراجعة');
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
  const targetInput = document.getElementById('ad-target-url');
  const budgetInput = document.getElementById('ad-budget');

  const title = titleInput ? titleInput.value.trim() : '';
  let targetUrl = targetInput ? targetInput.value.trim() : '';
  const budget = parseFloat(budgetInput ? budgetInput.value : 0) || 0;

  if (!title) {
    showToast(i18n[currentLang]?.enter_ad_title || 'يرجى إدخال عنوان الإعلان');
    return;
  }

  if (!targetUrl) {
    showToast(i18n[currentLang]?.enter_ad_url || 'يرجى إدخال رابط التوجيه');
    return;
  }

  if (!/^https?:\/\//i.test(targetUrl)) {
    targetUrl = 'https://' + targetUrl;
  }

  if (budget < 5) {
    showToast(i18n[currentLang]?.min_ad_budget || 'الحد الأدنى لميزانية الحملة هو $5');
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
        showToast(i18n[currentLang]?.ad_success || 'تم إطلاق الحملة الإعلانية بنجاح!');
        if (titleInput) titleInput.value = '';
        if (targetInput) targetInput.value = '';
        if (budgetInput) budgetInput.value = '';
        await fetchUserAds();
        await loadUserData();
      } else {
        showToast(data.error || i18n[currentLang]?.ad_fail || 'فشل إنشاء الحملة الإعلانية');
      }
    }
  } catch (err) {
    showToast(err.message || i18n[currentLang]?.ad_fail || 'خطأ أثناء إنشاء الحملة');
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
    container.innerHTML = `<p style="text-align:center; color: var(--text-muted); margin: 12px 0;">${i18n[currentLang]?.no_ads || 'لا توجد حملات إعلانية نشطة.'}</p>`;
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
    container.innerHTML = `<p style="text-align:center; color: var(--text-muted); margin: 12px 0;">${i18n[currentLang]?.no_referrals || 'لم تنضم أي إحالات عبر رابطك بعد.'}</p>`;
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
      
      const totalUsersEl = document.getElementById('admin-total-users');
      const totalPendingEl = document.getElementById('admin-total-pending');

      if (totalUsersEl) totalUsersEl.innerText = data.totalUsers || 0;
      if (totalPendingEl) totalPendingEl.innerText = `$${(data.totalPendingBalance || 0).toFixed(2)}`;

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
  if (!list || !list.length) { c.innerHTML = '<p style="color:var(--text-muted);">لا توجد طلبات إيداع معلقة</p>'; return; }
  c.innerHTML = list.map(d => {
    const u = d.user || d;
    const fullName = escapeHTML(`${u.firstName || ''} ${u.lastName || ''}`.trim() || u.fullName || u.name || 'غير محدد');
    const username = u.username ? `@${escapeHTML(u.username.replace(/^@/, ''))}` : '@no_username';
    const tgId = escapeHTML(String(d.telegramId || d.userId || u.telegramId || '—'));

    return `
      <div style="background:#070a12; padding:10px; border-radius:10px; margin-bottom:8px; border:1px solid var(--card-border);">
        <div style="font-size:12px; margin-bottom:4px; color:var(--text);">
          <b>الاسم:</b> ${fullName} | <b>المعرف:</b> ${username} | <b>الآيدي:</b> ${tgId}
        </div>
        <div style="font-size:11px; margin-bottom:4px;"><b>المبلغ:</b> $${(d.amount || 0).toFixed(2)}</div>
        <div style="font-size:10px; color:var(--text-muted); word-break:break-all;"><b>TxID:</b> ${escapeHTML(d.txid || d.txHash || '')}</div>
        <div style="margin-top:6px;">
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
    const u = w.user || w;
    const fullName = escapeHTML(`${u.firstName || ''} ${u.lastName || ''}`.trim() || u.fullName || u.name || 'غير محدد');
    const username = u.username ? `@${escapeHTML(u.username.replace(/^@/, ''))}` : '@no_username';
    const tgId = escapeHTML(String(w.telegramId || w.userId || u.telegramId || '—'));

    return `
      <div style="background:#070a12; padding:10px; border-radius:10px; margin-bottom:8px; border:1px solid var(--card-border);">
        <div style="font-size:12px; margin-bottom:4px; color:var(--text);">
          <b>الاسم:</b> ${fullName} | <b>المعرف:</b> ${username} | <b>الآيدي:</b> ${tgId}
        </div>
        <div style="font-size:11px; margin-bottom:4px;"><b>المبلغ:</b> $${(w.amount || 0).toFixed(2)}</div>
        <div style="font-size:10px; color:var(--text-muted); word-break:break-all;"><b>المحفظة:</b> ${escapeHTML(w.wallet || '')}</div>
        <div style="margin-top:6px;">
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
    const fullName = escapeHTML(`${u.firstName || ''} ${u.lastName || ''}`.trim() || u.fullName || u.name || 'غير محدد');
    const username = u.username ? `@${escapeHTML(u.username.replace(/^@/, ''))}` : '@no_username';
    const tgId = escapeHTML(String(u.telegramId || u.userId || u._id || '—'));

    return `
      <div style="background:#070a12; padding:10px; border-radius:8px; margin-bottom:6px; font-size:11px; border:1px solid var(--card-border);">
        <div style="margin-bottom:4px;"><b>الاسم:</b> ${fullName} | <b>المعرف:</b> ${username} | <b>الآيدي:</b> ${tgId}</div>
        <div style="color:var(--text-muted);"><b>المتاح:</b> $${(u.availableBalance||0).toFixed(2)} | <b>المعلق:</b> $${(u.pendingBalance||0).toFixed(2)}</div>
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
      <b>عنوان:</b> ${escapeHTML(a.title)} | <b>الميزانية:</b> $${a.budget}
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
      showToast(i18n[currentLang]?.action_success || "تم تنفيذ الإجراء بنجاح");
      loadAdminData();
    } else {
      showToast(i18n[currentLang]?.action_fail || "خطأ أثناء تنفيذ الإجراء");
    }
  } catch (e) {
    showToast(i18n[currentLang]?.action_fail || "خطأ أثناء تنفيذ الإجراء");
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
      bridgeStartTime = Date.now();
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
    console.error("Complete impression error:", e);
  } finally {
    window.location.href = bridgeDestinationUrl;
  }
}

// Global Window Exports for inline onclick handlers
window.copyToClipboard = copyToClipboard;
window.deleteLink = deleteLink;
window.processAdminAction = processAdminAction;
window.switchTab = switchTab;
window.switchWalletView = switchWalletView;
window.handleNetworkChange = handleNetworkChange;
window.toggleInstructionsModal = toggleInstructionsModal;
window.toggleWalletEdit = toggleWalletEdit;
window.saveSettings = saveSettings;
window.shareReferralLink = shareReferralLink;
window.createAdCampaign = createAdCampaign;
window.handleShortenClick = handleShortenClick;
window.requestDeposit = requestDeposit;
window.requestWithdrawal = requestWithdrawal;
window.filterUserLinks = filterUserLinks;
window.completeImpression = completeImpression;
window.toggleLanguage = toggleLanguage;

document.addEventListener('DOMContentLoaded', async () => {
  if (tg) {
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
});
