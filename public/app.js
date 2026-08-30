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
    link_success_msg: "Link shortened successfully!"
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
    link_success_msg: "تم اختصار الرابط بنجاح!"
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

async function safeFetch(endpoint, options = {}) {
  options.headers = options.headers || {};
  if (authToken) {
    options.headers['Authorization'] = `Bearer ${authToken}`;
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

async function authLogin() {
  const startParam = tg?.initDataUnsafe?.start_param || null;
  try {
    const res = await safeFetch('/api/auth/login', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        ...(tg?.initData ? {'x-telegram-init-data': tg.initData} : {'x-demo-user-id': 'DEMO_USER_DEV'}) 
      },
      body: JSON.stringify({ referrerId: startParam, telegramUserInfo: currentTgUser || {} })
    });
    if (!res) return false;
    const data = await res.json();
    if (data && data.token) {
      authToken = data.token;
      localStorage.setItem('authToken', authToken);
      localStorage.setItem('user_token', authToken);
      return true;
    }
  } catch (e) {
    console.error("Auth error:", e);
  }
  return false;
}

// التحكم الديناميكي بإظهار أو إخفاء عناصر واجهة الإدارة حسب الخادم حصراً
function handleAdminUIElements(isAdmin) {
  const adminBtn = document.getElementById('admin-btn');
  const adminTabBtn = document.getElementById('tab-btn-admin');
  const adminShortcut = document.getElementById('admin-banner-shortcut');

  if (adminBtn) adminBtn.style.display = isAdmin ? 'block' : 'none';
  if (adminShortcut) adminShortcut.style.display = isAdmin ? 'block' : 'none';
  if (adminTabBtn) {
    if (isAdmin) {
      adminTabBtn.classList.remove('hidden');
    } else {
      adminTabBtn.classList.add('hidden');
    }
  }
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

    // التعامل مع عناصر الإدارة من الاستجابة الموثقة للسيرفر
    handleAdminUIElements(Boolean(data.isAdmin));

    if (document.getElementById('pending-bal')) document.getElementById('pending-bal').innerText = `$${(data.user.pendingBalance || 0).toFixed(2)}`;
    if (document.getElementById('avail-bal')) document.getElementById('avail-bal').innerText = `$${(data.user.availableBalance || 0).toFixed(2)}`;
    if (document.getElementById('ref-earnings')) document.getElementById('ref-earnings').innerText = `$${(data.user.referralEarnings || 0).toFixed(2)}`;
    
    const walletInput = document.getElementById('default-wallet');
    if (walletInput) {
      walletInput.value = data.user.defaultWallet || '';
      walletInput.setAttribute('readonly', 'readonly');
    }

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
          if (w.status === 'Completed' || w.status === 'approved') { statusColor = 'var(--success)'; statusText = currentLang === 'ar' ? 'مكتمل' : 'Completed'; }
          else if (w.status === 'Rejected' || w.status === 'rejected') { statusColor = 'var(--danger)'; statusText = currentLang === 'ar' ? 'مرفوض' : 'Rejected'; }

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

  } catch (err) {
    console.error("Error loading user data:", err);
  }
}

window.addEventListener('DOMContentLoaded', async () => {
  try {
    if (tg) {
      tg.ready();
      tg.expand();
    }
  } catch (e) {}
  
  renderTelegramUser();

  if (!window.location.pathname.startsWith('/r/')) {
    document.getElementById('app-view')?.classList.remove('hidden');
    await initializeApp();
  }
});
