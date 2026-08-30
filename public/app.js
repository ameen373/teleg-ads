/**
 * Main Frontend Application Engine
 * Unified, Secure & Production-Ready
 */

const API_BASE = window.location.protocol.startsWith('file') 
  ? 'http://localhost:3000' 
  : window.location.origin;

let authToken = localStorage.getItem('authToken') || localStorage.getItem('user_token');
let currentSessionId = null;
let bridgeStartTime = Date.now();
let currentLang = localStorage.getItem('appLang') || 'en';
const tg = window.Telegram?.WebApp;

// قراءة بيانات المستخدم المباشرة من التليجرام
const currentTgUser = tg?.initDataUnsafe?.user || null;
const currentTgUserId = currentTgUser?.id ? Number(currentTgUser.id) : null;

const i18n = {
  en: {
    nav_home: "Home",
    nav_wallet: "Wallet",
    nav_ads: "Ads",
    nav_referral: "Referrals",
    nav_settings: "Settings",
    pending_bal: "Pending Balance",
    avail_bal: "Available Balance",
    create_link_title: "Shorten New Link",
    ph_link_title: "Title (Optional)",
    ph_link_url: "Original URL (https://...)",
    btn_shorten: "Shorten Link Now",
    my_links_title: "Your Links",
    withdraw_request_title: "Withdraw Earnings",
    wallet_addr_label: "Withdrawal Wallet (USDT TRC20)",
    btn_edit: "Edit",
    btn_save_wallet: "Save New Address",
    btn_submit_withdraw: "Request Withdrawal",
    withdraw_history: "Withdrawal History",
    create_ad_title: "Create New Ad Campaign",
    ad_rate_desc: "Ad Rate: $1.50 per 1,000 real impressions (CPM)",
    ph_ad_title: "Ad Title",
    ph_ad_target_url: "Target URL (https://...)",
    ph_ad_budget: "Total Budget (Min. $5)",
    btn_launch_ad: "Launch Ad Campaign",
    my_ads_title: "Your Ad Campaigns",
    ref_title: "Referral System (10%)",
    ref_desc: "Invite your friends and instantly earn 10% of their total revenues.",
    btn_share_ref: "Share Link via Telegram",
    total_ref_earnings: "Total Referral Earnings",
    lang_settings_title: "Language / تغيير اللغة",
    faq_title: "FAQ & Support",
    faq_q1: "How are earnings calculated?",
    faq_a1: "Earnings depend on ad revenue and are distributed proportionally based on verified visits.",
    faq_q2: "What is the 1-day pending period?",
    faq_a2: "It is a hold period to review traffic sources and prevent fraud before transferring earnings to available balance within 1 day.",
    support_text: "Contact technical support on Telegram:",
    loading: "Loading...",
    copied: "Copied successfully!",
    bridge_title: "Preparing your link...",
    bridge_desc: "Please wait while we redirect you to your destination",
    ad_loading: "Loading advertisement...",
    timer_text: "Button unlocks in:",
    seconds: "seconds",
    go_button: "Continue to Destination",
    cancel: "Cancel",
    network_error: "Network connection error. Please check your internet connection.",
    about_title: "ℹ️ About & Terms of Use",
    about_desc: "This bot is securely dedicated to shortening links and managing promotional campaigns safely. By using this platform, you agree to comply with our traffic quality guidelines and terms of service.",
    link_success_msg: "Link shortened successfully!",
    access_denied: "Access denied. You do not have administrator permissions."
  },
  ar: {
    nav_home: "الرئيسية",
    nav_wallet: "المحفظة",
    nav_ads: "الإعلانات",
    nav_referral: "الإحالات",
    nav_settings: "الإعدادات",
    pending_bal: "رصيد معلق (Pending)",
    avail_bal: "متاح للسحب (Available)",
    create_link_title: "اختصار رابط جديد",
    ph_link_title: "عنوان المعاينة (اختياري)",
    ph_link_url: "الرابط الأصلي (https://...)",
    btn_shorten: "اختصار الرابط الآن",
    my_links_title: "الروابط الخاصة بك",
    withdraw_request_title: "طلب سحب الأرباح",
    wallet_addr_label: "عنوان محفظة السحب (USDT TRC20)",
    btn_edit: "تعديل",
    btn_save_wallet: "حفظ العنوان الجديد",
    btn_submit_withdraw: "تقديم طلب السحب",
    withdraw_history: "سجل طلبات السحب",
    create_ad_title: "إنشاء حملة إعلانية جديدة",
    ad_rate_desc: "تكلفة الإعلان: $1.50 لكل 1,000 مشاهدة حقيقية (CPM)",
    ph_ad_title: "عنوان الإعلان",
    ph_ad_target_url: "رابط التوجيه (https://...)",
    ph_ad_budget: "الميزانية الإجمالية (الحد الأدنى 5$)",
    btn_launch_ad: "إطلاق الحملة الإعلانية",
    my_ads_title: "حملاتك الإعلانية",
    ref_title: "نظام الإحالة (10%)",
    ref_desc: "ادعُ أصدقاءك واحصل على 10% من إجمالي الأرباح التي يحققونها فورياً.",
    btn_share_ref: "مشاركة رابط الإحالة عبر تليجرام",
    total_ref_earnings: "إجمالي أرباح الإحالات",
    lang_settings_title: "تغيير اللغة / Language",
    faq_title: "الأسئلة الشائعة والدعم",
    faq_q1: "كيف يتم احتساب الأرباح؟",
    faq_a1: "تعتمد الأرباح على إيرادات الإعلانات وتوزع نسبياً حسب الزيارات الحقيقية المعتمدة.",
    faq_q2: "ما هي فترة الرصيد المعلق (يوم واحد)؟",
    faq_a2: "هي فترة أمان لمراجعة مصادر الحركة والتأكد من عدم وجود نقرات وهمية قبل تحويل الأرباح للرصيد المتاح خلال يوم واحد.",
    support_text: "للتواصل والدعم الفني عبر التليجرام:",
    loading: "جاري التحميل...",
    copied: "تم النسخ بنجاح!",
    bridge_title: "جاري تجهيز الرابط...",
    bridge_desc: "الرجاء الانتظار للتحويل التلقائي للجهة المطلوبة",
    ad_loading: "جاري تحميل الإعلان...",
    timer_text: "سيفعل الزر خلال:",
    seconds: "ثوانٍ",
    go_button: "الانتقال إلى الرابط الأصلي",
    cancel: "إلغاء",
    network_error: "تعذر الاتصال بالشبكة، يرجى التحقق من اتصال الإنترنت لديك.",
    about_title: "ℹ️ نبذة وشروط الاستخدام",
    about_desc: "هذا البوت مخصص لااختصار الروابط بأمان وإدارة الحملات الإعلانية بكفاءة عالية. باستخدامك لهذه المنصة، فإنك توافق على الالتزام بشروط الاستخدام وسياسة الجودة لدينا.",
    link_success_msg: "تم اختصار الرابط بنجاح!",
    access_denied: "عذراً، غير مصرح لك بالوصول إلى لوحة الإدارة."
  }
};

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

function handleNetworkChange(networkVal) {
  triggerHaptic('light');
  const trcCard = document.getElementById('card-addr-trc20');
  const bepCard = document.getElementById('card-addr-bep20');

  if (trcCard) trcCard.classList.add('hidden');
  if (bepCard) bepCard.classList.add('hidden');

  if (networkVal === 'USDT_TRC20' && trcCard) {
    trcCard.classList.remove('hidden');
  } else if (networkVal === 'USDT_BEP20' && bepCard) {
    bepCard.classList.remove('hidden');
  }
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

function updateWithdrawCalculations() {
  const amtInput = document.getElementById('withdraw-amount');
  const feeBox = document.getElementById('withdraw-fee-box');
  const val = parseFloat(amtInput?.value) || 0;

  if (val > 0 && feeBox) {
    feeBox.classList.remove('hidden');
    const fee = val * 0.10;
    const net = val - fee;

    document.getElementById('calc-req').innerText = `$${val.toFixed(2)}`;
    document.getElementById('calc-fee').innerText = `$${fee.toFixed(2)}`;
    document.getElementById('calc-net').innerText = `$${net.toFixed(2)}`;
  } else if (feeBox) {
    feeBox.classList.add('hidden');
  }
}

async function safeFetch(endpoint, options = {}) {
  options.headers = options.headers || {};
  
  // تمرير التوكين والـ Telegram InitData ومعرّف المستخدم المباشر في الـ Headers
  if (authToken) {
    options.headers['Authorization'] = `Bearer ${authToken}`;
  }
  if (tg?.initData) {
    options.headers['x-telegram-init-data'] = tg.initData;
  }
  if (currentTgUserId) {
    options.headers['x-telegram-id'] = String(currentTgUserId);
  }

  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const targetUrl = endpoint.startsWith('http') ? endpoint : `${API_BASE}${cleanEndpoint}`;

  try {
    let response = await fetch(targetUrl, options);
    
    // التعامل المخصص مع إعادة التوثيق 401
    if (response.status === 401) {
      const reAuth = await authLogin();
      if (reAuth) {
        options.headers['Authorization'] = `Bearer ${authToken}`;
        response = await fetch(targetUrl, options);
      }
    }

    // التعامل المخصص مع 403 (عدم وجود صلاحيات للأدمن)
    if (response.status === 403) {
      showToast(i18n[currentLang]?.access_denied || "Access Denied: Admin privileges required.");
      if (typeof renderUI === 'function') {
        renderUI(null); // إخفاء عناصر لوحة الأدمن
      }
      return null;
    }

    return response;
  } catch (err) {
    console.error("Fetch Network Error:", err);
    showToast(i18n[currentLang]?.network_error || "Network error. Please try again.");
    return null;
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

function renderTelegramUser() {
  const u = currentTgUser;
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
    if (savedLang && i18n[savedLang]) {
      currentLang = savedLang;
    } else if (u.language_code && i18n[u.language_code]) {
      currentLang = u.language_code;
    } else {
      currentLang = 'en';
    }
  } else {
    if (nameElem) nameElem.innerText = 'Demo User';
    if (handleElem) handleElem.innerText = '@demo_user';
    if (idElem) idElem.innerText = 'ID: 000000000';
    if (avatarContainer) avatarContainer.innerHTML = `<div class="user-avatar-placeholder">D</div>`;
    if (!localStorage.getItem('appLang')) {
      currentLang = 'en';
    }
  }

  applyLanguage(currentLang);
}

function changeAppLanguage(lang) {
  currentLang = i18n[lang] ? lang : 'en';
  localStorage.setItem('appLang', currentLang);
  applyLanguage(currentLang);
  loadUserData();
}

function applyLanguage(lang) {
  const activeLang = i18n[lang] ? lang : 'en';
  document.documentElement.lang = activeLang;
  document.documentElement.dir = activeLang === 'ar' ? 'rtl' : 'ltr';
  document.body.style.direction = activeLang === 'ar' ? 'rtl' : 'ltr';

  const langSelect = document.getElementById('language-select');
  if (langSelect) langSelect.value = activeLang;

  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (i18n[activeLang] && i18n[activeLang][key]) {
      el.innerText = i18n[activeLang][key];
    }
  });

  document.querySelectorAll('[data-i18n-ph]').forEach(el => {
    const key = el.getAttribute('data-i18n-ph');
    if (i18n[activeLang] && i18n[activeLang][key]) {
      el.placeholder = i18n[activeLang][key];
    }
  });
}

function showToast(msg) {
  triggerHaptic('medium');
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.innerText = msg;
  toast.classList.add("show");
  setTimeout(() => { toast.classList.remove("show"); }, 3000);
}

function copyToClipboard(text) {
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    showToast(i18n[currentLang].copied);
  }).catch(() => {
    showToast(currentLang === 'ar' ? "فشل النسخ تلقائياً" : "Failed to copy");
  });
}

function shareReferralLink() {
  const refUrl = document.getElementById('ref-link')?.value;
  if (!refUrl) return;
  triggerHaptic('medium');
  const shareText = encodeURIComponent(currentLang === 'ar' ? "انضم إليّ في أفضل منصة لااختصار الروابط واكسب الأرباح بسهولة! 🚀" : "Join me on the best url shortener platform & earn money! 🚀");
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
    editBtn.innerText = i18n[currentLang].cancel;
    editBtn.className = "btn-small btn-danger";
    saveBtn?.classList.remove('hidden');
  } else {
    walletInput.setAttribute('readonly', 'readonly');
    editBtn.innerText = i18n[currentLang].btn_edit;
    editBtn.className = "btn-small btn-warning";
    saveBtn?.classList.add('hidden');
  }
}

async function authLogin() {
  const startParam = tg?.initDataUnsafe?.start_param || null;
  try {
    const res = await safeFetch('/api/auth/login', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ referrerId: startParam, telegramUserInfo: currentTgUser || {} })
    });
    if (!res) return false;
    const data = await res.json();
    if (data && data.token) {
      authToken = data.token;
      localStorage.setItem('authToken', authToken);
      localStorage.setItem('user_token', authToken);
      
      const role = data.isAdmin ? 'admin' : (data.role || 'user');
      localStorage.setItem('user_role', role);

      return true;
    }
  } catch (e) {
    console.error("Auth error:", e);
    showToast(currentLang === 'ar' ? "فشل الاتصال بمركز المصادقة" : "Authentication connection failed");
  }
  return false;
}

async function initializeApp() {
  try {
    if (!authToken) await authLogin();
    await loadUserData();
  } catch (err) {
    console.error("App init error:", err);
  }
}

async function loadUserData() {
  try {
    const res = await safeFetch('/api/user/data');
    if (!res) return;
    const data = await res.json();
    if (!data || !data.user) return;

    if (typeof renderUI === 'function') {
      renderUI(data.user);
    }

    if (document.getElementById('pending-bal')) document.getElementById('pending-bal').innerText = `$${(data.user.pendingBalance || 0).toFixed(2)}`;
    if (document.getElementById('avail-bal')) document.getElementById('avail-bal').innerText = `$${(data.user.availableBalance || 0).toFixed(2)}`;
    if (document.getElementById('ref-earnings')) document.getElementById('ref-earnings').innerText = `$${(data.user.referralEarnings || 0).toFixed(2)}`;
    
    const walletInput = document.getElementById('default-wallet');
    if (walletInput) {
      walletInput.value = data.user.defaultWallet || '';
      walletInput.setAttribute('readonly', 'readonly');
    }

    const editBtn = document.getElementById('edit-wallet-btn');
    if (editBtn) {
      editBtn.innerText = i18n[currentLang].btn_edit;
      editBtn.className = "btn-small btn-warning";
    }
    document.getElementById('save-wallet-btn')?.classList.add('hidden');

    const botUsername = window.Telegram?.WebApp?.initDataUnsafe?.bot?.username || 'Ads_telegabot';
    const refInput = document.getElementById('ref-link');
    if (refInput) refInput.value = `https://t.me/${botUsername}?start=${data.user._id}`;

    if (data.announcements && data.announcements.length > 0) {
      document.getElementById('announcement-box')?.classList.remove('hidden');
      if (document.getElementById('anc-title')) document.getElementById('anc-title').innerText = data.announcements[0].title;
      if (document.getElementById('anc-content')) document.getElementById('anc-content').innerText = data.announcements[0].content;
    }

    const withdrawsContainer = document.getElementById('withdraws-list');
    if (withdrawsContainer) {
      if (!data.withdraws || data.withdraws.length === 0) {
        withdrawsContainer.innerHTML = currentLang === 'ar' ? 'لا توجد طلبات سحب سابقة.' : 'No withdrawal history.';
      } else {
        withdrawsContainer.innerHTML = data.withdraws.map(w => {
          let statusColor = 'var(--warning)';
          let statusText = currentLang === 'ar' ? 'قيد المراجعة' : 'Pending';
          if (w.status === 'Completed') { statusColor = 'var(--success)'; statusText = currentLang === 'ar' ? 'مكتمل' : 'Completed'; }
          else if (w.status === 'Rejected') { statusColor = 'var(--danger)'; statusText = currentLang === 'ar' ? 'مرفوض' : 'Rejected'; }

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

    const linksContainer = document.getElementById('links-list');
    if (linksContainer) {
      if (!data.links || data.links.length === 0) {
        linksContainer.innerHTML = currentLang === 'ar' ? 'لا توجد روابط مُختصرة حالياً.' : 'No short links created yet.';
      } else {
        linksContainer.innerHTML = data.links.map(l => {
          const shortUrl = `${API_BASE}/r/${l.shortCode}`;
          const statusColor = l.isActive ? 'var(--success)' : 'var(--danger)';
          const statusText = l.isActive ? (currentLang === 'ar' ? 'نشط' : 'Active') : (currentLang === 'ar' ? 'معطل' : 'Disabled');
          return `
          <div class="link-item" style="border-left: 3px solid ${statusColor}; border-right: 3px solid ${statusColor};">
            <div class="link-header">
              <b>${escapeHTML(l.title || (currentLang === 'ar' ? 'رابط بدون عنوان' : 'Untitled Link'))}</b>
              <span style="font-size: 10px; color: ${statusColor};">${statusText}</span>
            </div>
            <div style="color:var(--text-muted); font-size:11px; margin-bottom:4px; word-break: break-all;">${escapeHTML(shortUrl)}</div>
            <div>Views: <b>${l.views || 0}</b> | Valid: <b style="color:var(--success);">${l.validImpressions || 0}</b></div>
            <div class="link-actions">
              <button class="btn-small" onclick="copyToClipboard('${escapeHTML(shortUrl)}')">Copy</button>
              <button class="btn-small ${l.isActive ? 'btn-danger' : 'btn-warning'}" onclick="toggleLinkStatus('${l._id}')">${l.isActive ? (currentLang === 'ar' ? 'تعطيل' : 'Disable') : (currentLang === 'ar' ? 'تفعيل' : 'Enable')}</button>
            </div>
          </div>`;
        }).join('');
      }
    }

    const adsContainer = document.getElementById('ads-list');
    if (adsContainer) {
      if (!data.ads || data.ads.length === 0) {
        adsContainer.innerHTML = currentLang === 'ar' ? 'لا توجد حملات إعلانية نشطة حالياً.' : 'No active ad campaigns.';
      } else {
        adsContainer.innerHTML = data.ads.map(ad => {
          let statusColor = ad.status === 'active' ? 'var(--success)' : (ad.status === 'paused' ? 'var(--warning)' : 'var(--text-muted)');
          return `
          <div class="ad-item" style="border-left: 3px solid ${statusColor};">
            <div class="ad-header">
              <b>${escapeHTML(ad.title)}</b>
              <span style="font-size: 10px; color: ${statusColor};">${escapeHTML(ad.status.toUpperCase())}</span>
            </div>
            <div style="color:var(--text-muted); font-size:11px; margin-bottom:4px; word-break: break-all;">${escapeHTML(ad.targetUrl)}</div>
            <div>Remaining Budget: <b style="color:var(--success);">$${(ad.remainingBudget || 0).toFixed(2)}</b> / $${parseFloat(ad.totalBudget || 0).toFixed(2)} | Views: <b>${ad.impressionsCount || 0}</b></div>
            <div class="ad-actions">
              ${ad.status !== 'completed' ? `<button class="btn-small ${ad.status === 'active' ? 'btn-warning' : 'btn-success'}" onclick="toggleAdStatus('${ad._id}')">${ad.status === 'active' ? (currentLang === 'ar' ? 'إيقاف مؤقت' : 'Pause') : (currentLang === 'ar' ? 'تفعيل' : 'Activate')}</button>` : ''}
            </div>
          </div>`;
        }).join('');
      }
    }

  } catch (err) {
    console.error("Error loading user data:", err);
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
      showToast(data.isActive ? (currentLang === 'ar' ? "تم تفعيل الرابط" : "Link activated") : (currentLang === 'ar' ? "تم تعطيل الرابط" : "Link disabled"));
      loadUserData();
    }
  } catch (e) {
    showToast(currentLang === 'ar' ? "خطأ أثناء تغيير حالة الرابط" : "Error toggling link status");
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
      showToast(currentLang === 'ar' ? "تم تحديث حالة الحملة الإعلانية" : "Ad status updated");
      loadUserData();
    }
  } catch (e) {
    showToast(currentLang === 'ar' ? "خطأ أثناء تعديل حالة الإعلان" : "Error toggling ad status");
  }
}

async function createAdCampaign() {
  const title = document.getElementById('ad-title')?.value;
  const targetUrl = document.getElementById('ad-target-url')?.value;
  const totalBudget = document.getElementById('ad-budget')?.value;

  if (!title || !targetUrl || !totalBudget) return showToast(currentLang === 'ar' ? "يرجى ملء جميع البيانات المطلوب الإعلان عنها" : "Please fill in all ad details");

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
      showToast(currentLang === 'ar' ? "تم إنشاء الحملة الإعلانية وإطلاقها بنجاح!" : "Ad campaign launched successfully!");
      if (document.getElementById('ad-title')) document.getElementById('ad-title').value = '';
      if (document.getElementById('ad-target-url')) document.getElementById('ad-target-url').value = '';
      if (document.getElementById('ad-budget')) document.getElementById('ad-budget').value = '';
      loadUserData();
    }
  } catch (e) {
    showToast(currentLang === 'ar' ? "حدث خطأ غير متوقع أثناء إطلاق الحملة" : "Unexpected error launching campaign");
  } finally {
    setButtonLoading('btn-create-ad', false, `<span data-i18n="btn_launch_ad">${i18n[currentLang].btn_launch_ad}</span>`);
  }
}

async function requestDeposit() {
  const amount = document.getElementById('deposit-amount')?.value;
  const paymentMethod = document.getElementById('deposit-network')?.value;
  const txHash = document.getElementById('deposit-txhash')?.value;

  if (!paymentMethod) return showToast(currentLang === 'ar' ? "يرجى تحديد نوع الشبكة أولاً" : "Select deposit network first");
  if (!amount || amount <= 0) return showToast(currentLang === 'ar' ? "يرجى إدخال مبلغ الشحن الصحيح" : "Enter a valid deposit amount");
  if (!txHash || txHash.trim().length < 8) return showToast(currentLang === 'ar' ? "يرجى إدخال رمز العملية TxID الخاص بالمعاملة" : "Enter valid TxID");

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
      showToast(currentLang === 'ar' ? "تم إرسال طلب الشحن بنجاح!" : "Deposit request submitted!");
      if (document.getElementById('deposit-amount')) document.getElementById('deposit-amount').value = '';
      if (document.getElementById('deposit-txhash')) document.getElementById('deposit-txhash').value = '';
      if (document.getElementById('deposit-network')) document.getElementById('deposit-network').value = '';
      handleNetworkChange('');
      loadUserData();
    }
  } catch (e) {
    showToast(currentLang === 'ar' ? "خطأ أثناء تقديم طلب الشحن" : "Error submitting deposit request");
  } finally {
    setButtonLoading('btn-request-deposit', false, `<span>${currentLang === 'ar' ? 'تأكيد وإرسال طلب الشحن' : 'Submit Deposit Request'}</span>`);
  }
}

async function initBridge() {
  const pathParts = window.location.pathname.split('/r/');
  const shortCode = pathParts[1];
  bridgeStartTime = Date.now();

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
        currentSessionId = data.sessionId;

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
  const interval = setInterval(() => {
    timeLeft--;
    if (timerElem) timerElem.innerText = timeLeft;
    if (timeLeft <= 0) {
      clearInterval(interval);
      const goBtn = document.getElementById('go-btn');
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
  const duration = Math.floor((Date.now() - bridgeStartTime) / 1000);

  try {
    const res = await safeFetch('/api/impression', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ linkCode: shortCode, sessionId: currentSessionId, duration })
    });
    if (!res) return;
    const data = await res.json();
    if (data.targetUrl) {
      window.location.href = data.targetUrl;
    } else {
      setButtonLoading('go-btn', false, `<span data-i18n="go_button">${i18n[currentLang].go_button}</span>`);
      showToast(data.error || (currentLang === 'ar' ? "خطأ أثناء عملية التوجيه" : "Redirection error"));
    }
  } catch (err) {
    setButtonLoading('go-btn', false, `<span data-i18n="go_button">${i18n[currentLang].go_button}</span>`);
    showToast(currentLang === 'ar' ? "فشل الاتصال بالخادم" : "Server connection failed");
  }
}

async function handleShortenClick() {
  const title = document.getElementById('link-title')?.value;
  const targetUrl = document.getElementById('link-url')?.value;

  if (!targetUrl) {
    showToast(currentLang === 'ar' ? "يرجى إدخال الرابط الأصلي بشكل صحيح" : "Please enter original URL");
    return;
  }

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
    if (data.error) {
      showToast(data.error);
    } else {
      showToast(i18n[currentLang].link_success_msg || "Link created successfully!");
      if (document.getElementById('link-title')) document.getElementById('link-title').value = '';
      if (document.getElementById('link-url')) document.getElementById('link-url').value = '';
      loadUserData();
    }
  } catch (e) {
    showToast(currentLang === 'ar' ? "حدث خطأ غير متوقع" : "An unexpected error occurred");
  } finally {
    setButtonLoading('btn-create-link', false, `<span data-i18n="btn_shorten">${i18n[currentLang].btn_shorten}</span>`);
  }
}

async function requestWithdrawal() {
  const amount = parseFloat(document.getElementById('withdraw-amount')?.value);
  const walletAddress = document.getElementById('default-wallet')?.value;

  if (!walletAddress) return showToast(currentLang === 'ar' ? "يرجى إدخال عنوان محفظة السحب أولاً" : "Please enter a wallet address first");
  if (!amount || amount < 30) return showToast(currentLang === 'ar' ? "الحد الأدنى للسحب هو 30$" : "Minimum withdrawal is $30");

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
      showToast(currentLang === 'ar' ? "تم تقديم طلب السحب بنجاح!" : "Withdrawal requested successfully!");
      if (document.getElementById('withdraw-amount')) document.getElementById('withdraw-amount').value = '';
      document.getElementById('withdraw-fee-box')?.classList.add('hidden');
      loadUserData();
    }
  } catch (e) {
    showToast(currentLang === 'ar' ? "خطأ أثناء معالجة الطلب" : "Error processing request");
  } finally {
    setButtonLoading('btn-request-withdraw', false, `<span data-i18n="btn_submit_withdraw">${i18n[currentLang].btn_submit_withdraw}</span>`);
  }
}

async function saveSettings() {
  const defaultWallet = document.getElementById('default-wallet')?.value;
  if (!defaultWallet || defaultWallet.trim().length < 5) {
    return showToast(currentLang === 'ar' ? "عنوان المحفظة غير صالح" : "Invalid wallet address");
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
      showToast(currentLang === 'ar' ? "تم حفظ المحفظة بنجاح" : "Wallet saved successfully");
      loadUserData();
    }
  } catch (e) {
    showToast(currentLang === 'ar' ? "خطأ أثناء حفظ الإعدادات" : "Error saving settings");
  }
}

function switchTab(tabId) {
  triggerHaptic('light');

  document.querySelectorAll('.tg-nav-dock button').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('#app-view > div[id^="tab-content-"]').forEach(c => c.classList.add('hidden'));
  
  const targetBtn = document.getElementById(`tab-btn-${tabId}`);
  if (targetBtn) targetBtn.classList.add('active');
  
  const tabContent = document.getElementById(`tab-content-${tabId}`);
  if (tabContent) tabContent.classList.remove('hidden');
}

window.addEventListener('DOMContentLoaded', async () => {
  try {
    if (tg) {
      tg.ready();
      tg.expand();
    }
  } catch (e) {
    console.warn("Telegram WebApp API ready error:", e);
  }
  
  renderTelegramUser();

  if (window.location.pathname.startsWith('/r/')) {
    document.getElementById('bridge-view')?.classList.remove('hidden');
    initBridge();
  } else {
    document.getElementById('app-view')?.classList.remove('hidden');
    await initializeApp();
  }
});
