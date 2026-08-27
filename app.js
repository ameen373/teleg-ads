// ==========================================
// TELEGA.ADS - Production-Ready Client Core v4.0
// Fully Unified, Highly Optimized & Fast
// ==========================================

const API_BASE = window.location.protocol.startsWith('file') 
  ? 'http://localhost:3000' 
  : window.location.origin;

let authToken = localStorage.getItem('authToken');
let bridgeBridgeToken = null;
let currentSessionId = null;
let bridgeStartTime = Date.now();
let isUserAdmin = false;
let currentLang = localStorage.getItem('appLang') || 'en';
const tg = window.Telegram?.WebApp;

const i18n = {
  ar: {
    copied: "تم النسخ بنجاح!",
    network_error: "خطأ في الشبكة. يجدر التحقق من الاتصال والمحاولة مجدداً.",
    btn_edit: "تعديل",
    cancel: "إلغاء",
    close: "إغلاق",
    go_button: "متابعة الرابط ↗",
    btn_shorten: "اختصار الرابط الآن",
    btn_launch_ad: "إطلاق الحملة الإعلانية",
    btn_submit_withdraw: "تأكيد طلب السحب",
    btn_submit_deposit: "تأكيد وإرسال طلب الشحن",
    link_success_msg: "تم إنشاء الرابط المختصر بنجاح!",
    guide_title: "دليل الشحن ورمز المعاملة (TxID)",
    guide_step1: "اختر الشبكة: حدد (USDT TRC20 أو BEP20) لمشاهدة عنوان المحفظة ثم اضغط نسخ.",
    guide_step2: "تحويل الأموال: افتح محفظتك (Binance, Trust Wallet, OKX) وقم بإرسال المبلغ للعنوان المنسوخ.",
    guide_step3: "نسخ رمز العملية (TxID): بعد نجاح التحويل قم بنسخ الـ TxHash / TxID الخاص بالمعاملة.",
    guide_example: "صيغة رمز المعاملة (TxID) التجريبية:",
    guide_step4: "إرسال الطلب: عد هنا، أدخل المبلغ المحول ورمز المعاملة ثم اضغط تأكيد وإرسال.",
    bridge_title: "جاري تجهيز الرابط الخاص بك...",
    bridge_desc: "يرجى الانتظار لحين إعادة التوجيه للوجهة المطلوبة",
    ad_loading: "جاري تحميل الإعلان...",
    timer_text: "سيتم فتح الزر خلال:",
    seconds: "ثوانٍ",
    official_channel: "القناة الرسمية",
    about_title: "ℹ️ عن المنصة وشروط الاستخدام",
    about_desc: "هذا البوت مخصص بأمان لاختصار الروابط وإدارة الحملات الإعلانية. باستخدامك للمنصة فإنك توافق على الالتزام بشروط الخدمة وجودة الزيارات.",
    create_link_title: "اختصار رابط جديد",
    ph_link_title: "عنوان الرابط (اختياري)",
    ph_link_url: "الرابط الأصلي (https://...)",
    my_links_title: "روابطك المُختصرة",
    loading: "جاري التحميل...",
    pending_bal: "الرصيد المعلق",
    avail_bal: "الرصيد المتاح",
    btn_deposit_tab: "شحن المحفظة",
    btn_withdraw_tab: "سحب الأرباح",
    deposit_title: "شحن الرصيد (USDT)",
    btn_guide: "❓ دليل الشحن",
    select_network: "اختر شبكة الإيداع:",
    opt_choose_net: "-- اختر الشبكة لعرض العنوان --",
    lbl_trc20: "عنوان إيداع USDT - TRC20 (Tron):",
    lbl_bep20: "عنوان إيداع USDT - BEP20 (BNB Smart Chain):",
    btn_copy: "نسخ",
    submit_proof: "إرسال إثبات الشحن:",
    ph_dep_amount: "المبلغ المودع ($)",
    ph_dep_txid: "رمز المعاملة TxID / TxHash",
    withdraw_request_title: "سحب الأرباح",
    wallet_addr_label: "محفظة السحب (USDT TRC20)",
    btn_save_wallet: "حفظ العنوان الجديد",
    ph_withdraw_amount: "المبلغ (الحد الأدنى 30$)",
    calc_amt: "المبلغ:",
    calc_fee: "الرسوم (10%):",
    calc_net: "الصافي:",
    withdraw_history: "سجل السحوبات",
    create_ad_title: "إنشاء حملة إعلانية جديدة",
    ad_rate_desc: "سعر الإعلان: $1.50 لكل 1,000 ظهور حقيقي (CPM)",
    ph_ad_title: "عنوان الإعلان",
    ph_ad_target_url: "رابط الوجهة (https://...)",
    ph_ad_budget: "إجمالي الميزانية (الحد الأدنى 5$)",
    my_ads_title: "حملاتك الإعلانية",
    ref_title: "نظام الإحالة (10%)",
    ref_desc: "قم بدعوة أصدقائك واكسب فوراً 10% من إجمالي أرباحهم.",
    btn_share_ref: "مشاركة الرابط عبر تليجرام",
    total_ref_earnings: "إجمالي أرباح الإحالة",
    lang_settings_title: "Language / تغيير اللغة",
    faq_title: "الأسئلة الشائعة والدعم الفني",
    faq_q1: "كيف يتم حساب الأرباح؟",
    faq_a1: "تعتمد الأرباح على العائدات الإعلانية ويتم توزيعها تناسبياً بناءً على الزيارات المؤكدة.",
    faq_q2: "ما هي فترة التعليق لمدة 1 يوم؟",
    faq_a2: "هي فترة مراجعة لفحص مصادر الزيارات ومنع الاحتيال قبل تحويل الأرباح للرصيد المتاح خلال 24 ساعة.",
    support_text: "تواصل مع الدعم الفني عبر تليجرام:",
    btn_bot: "🤖 البوت الرسمي",
    btn_channel: "📢 القناة الرسمية",
    btn_support: "🎧 الدعم الفني",
    adm_total_users: "إجمالي المستخدمين",
    adm_total_pending: "إجمالي المعلق",
    adm_pending_dep: "طلبات الشحن المعلقة",
    adm_pending_withdraw: "طلبات السحب المعلقة",
    adm_user_mgmt: "إدارة المستخدمين",
    nav_home: "الرئيسية",
    nav_wallet: "المحفظة",
    nav_ads: "الإعلانات",
    nav_referral: "الإحالات",
    nav_settings: "الإعدادات"
  },
  en: {
    copied: "Copied successfully!",
    network_error: "Network error. Please check your connection and try again.",
    btn_edit: "Edit",
    cancel: "Cancel",
    close: "Close",
    go_button: "Continue to Link ↗",
    btn_shorten: "Shorten Link Now",
    btn_launch_ad: "Launch Ad Campaign",
    btn_submit_withdraw: "Submit Withdrawal Request",
    btn_submit_deposit: "Submit Deposit Request",
    link_success_msg: "Short link created successfully!",
    guide_title: "Deposit & TxID Guide",
    guide_step1: "Select Network: Choose (USDT TRC20 or BEP20) to view your deposit address, then click Copy.",
    guide_step2: "Transfer Funds: Open your wallet (Binance, Trust Wallet, OKX, etc.) and send USDT to the copied address.",
    guide_step3: "Copy Transaction Hash (TxID): After the transfer succeeds, copy the TxHash / TxID.",
    guide_example: "Example TxID format:",
    guide_step4: "Submit Request: Return here, enter the deposit amount and TxID, then click Submit Deposit Request.",
    bridge_title: "Preparing your link...",
    bridge_desc: "Please wait while we redirect you to your destination",
    ad_loading: "Loading advertisement...",
    timer_text: "Button unlocks in:",
    seconds: "seconds",
    official_channel: "Official Channel",
    about_title: "ℹ️ About & Terms of Use",
    about_desc: "This bot is securely dedicated to shortening links and managing promotional campaigns safely. By using this platform, you agree to comply with our traffic quality guidelines and terms of service.",
    create_link_title: "Shorten New Link",
    ph_link_title: "Title (Optional)",
    ph_link_url: "Original URL (https://...)",
    my_links_title: "Your Links",
    loading: "Loading...",
    pending_bal: "Pending Balance",
    avail_bal: "Available Balance",
    btn_deposit_tab: "Deposit",
    btn_withdraw_tab: "Withdraw",
    deposit_title: "Deposit Funds (USDT)",
    btn_guide: "❓ Deposit Guide",
    select_network: "Select Deposit Network:",
    opt_choose_net: "-- Choose Network to View Address --",
    lbl_trc20: "USDT - TRC20 (Tron) Deposit Address:",
    lbl_bep20: "USDT - BEP20 (BNB Smart Chain) Deposit Address:",
    btn_copy: "Copy",
    submit_proof: "Submit Deposit Proof:",
    ph_dep_amount: "Deposited Amount ($)",
    ph_dep_txid: "Transaction TxID / TxHash",
    withdraw_request_title: "Withdraw Earnings",
    wallet_addr_label: "Withdrawal Wallet (USDT TRC20)",
    btn_save_wallet: "Save New Address",
    ph_withdraw_amount: "Amount (Min. $30)",
    calc_amt: "Amount:",
    calc_fee: "Fee (10%):",
    calc_net: "Net:",
    withdraw_history: "Withdrawal History",
    create_ad_title: "Create New Ad Campaign",
    ad_rate_desc: "Ad Rate: $1.50 per 1,000 real impressions (CPM)",
    ph_ad_title: "Ad Title",
    ph_ad_target_url: "Target URL (https://...)",
    ph_ad_budget: "Total Budget (Min. $5)",
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
    btn_bot: "🤖 Official Bot",
    btn_channel: "📢 Official Channel",
    btn_support: "🎧 Support",
    adm_total_users: "Total Users",
    adm_total_pending: "Total Pending",
    adm_pending_dep: "Pending Deposit Requests",
    adm_pending_withdraw: "Pending Withdrawal Requests",
    adm_user_mgmt: "User Management",
    nav_home: "Home",
    nav_wallet: "Wallet",
    nav_ads: "Ads",
    nav_referral: "Referrals",
    nav_settings: "Settings"
  }
};

function applyLanguage(lang) {
  currentLang = i18n[lang] ? lang : 'en';
  localStorage.setItem('appLang', currentLang);
  document.documentElement.setAttribute('dir', currentLang === 'ar' ? 'rtl' : 'ltr');
  document.documentElement.setAttribute('lang', currentLang);

  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (i18n[currentLang] && i18n[currentLang][key]) {
      el.innerText = i18n[currentLang][key];
    }
  });

  document.querySelectorAll('[data-i18n-ph]').forEach(el => {
    const key = el.getAttribute('data-i18n-ph');
    if (i18n[currentLang] && i18n[currentLang][key]) {
      el.setAttribute('placeholder', i18n[currentLang][key]);
    }
  });

  const langSelect = document.getElementById('language-select');
  if (langSelect) langSelect.value = currentLang;
}

function changeAppLanguage(lang) {
  applyLanguage(lang);
  saveSettings();
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

function updateWithdrawCalculations() {
  const amtInput = document.getElementById('withdraw-amount');
  const feeBox = document.getElementById('withdraw-fee-box');
  if (!amtInput || !feeBox) return;

  const val = parseFloat(amtInput.value) || 0;
  if (val > 0) {
    feeBox.classList.remove('hidden');
    const fee = val * 0.10;
    const net = val - fee;

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

async function safeFetch(endpoint, options = {}) {
  options.headers = options.headers || {};
  if (authToken) {
    options.headers['Authorization'] = `Bearer ${authToken}`;
  }
  
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const targetUrl = endpoint.startsWith('http') ? endpoint : `${API_BASE}${cleanEndpoint}`;
  
  try {
    let response = await fetch(targetUrl, options);
    if (response.status === 401 && !endpoint.includes('/api/auth/login')) {
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

function setButtonLoading(btnId, isLoading, originalContent = '') {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  if (isLoading) {
    btn.disabled = true;
    btn.dataset.oldContent = btn.innerHTML;
    btn.innerHTML = `<div class="spinner"></div>`;
  } else {
    btn.disabled = false;
    btn.innerHTML = originalContent || btn.dataset.oldContent || '';
  }
}

function renderTelegramUser() {
  const u = tg?.initDataUnsafe?.user;
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
  } else {
    if (nameElem) nameElem.innerText = 'Demo User';
    if (handleElem) handleElem.innerText = '@demo_user';
    if (idElem) idElem.innerText = 'ID: 000000000';
    if (avatarContainer) avatarContainer.innerHTML = `<div class="user-avatar-placeholder">D</div>`;
  }

  applyLanguage(currentLang);
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
  const refLinkInput = document.getElementById('ref-link');
  if (!refLinkInput) return;
  const refUrl = refLinkInput.value;
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
  if (!walletInput || !editBtn || !saveBtn) return;

  if (walletInput.hasAttribute('readonly')) {
    walletInput.removeAttribute('readonly');
    walletInput.focus();
    editBtn.innerText = i18n[currentLang].cancel;
    editBtn.className = "btn-small btn-danger mt-0 w-auto";
    saveBtn.classList.remove('hidden');
  } else {
    walletInput.setAttribute('readonly', 'readonly');
    editBtn.innerText = i18n[currentLang].btn_edit;
    editBtn.className = "btn-small btn-warning mt-0 w-auto";
    saveBtn.classList.add('hidden');
  }
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
      body: JSON.stringify({ referrerId: startParam, telegramUserInfo: tg?.initDataUnsafe?.user || {} })
    });
    if (!res) return false;
    const data = await res.json();
    if (data && data.token) {
      authToken = data.token;
      localStorage.setItem('authToken', authToken);
      isUserAdmin = !!data.isAdmin;
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

    isUserAdmin = !!data.isAdmin;
    const adminTabBtn = document.getElementById('tab-btn-admin');
    if (adminTabBtn) adminTabBtn.classList.toggle('hidden', !isUserAdmin);

    const pendingBal = document.getElementById('pending-bal');
    const availBal = document.getElementById('avail-bal');
    const refEarnings = document.getElementById('ref-earnings');
    const defaultWallet = document.getElementById('default-wallet');

    if (pendingBal) pendingBal.innerText = `$${(data.user.pendingBalance || 0).toFixed(2)}`;
    if (availBal) availBal.innerText = `$${(data.user.availableBalance || 0).toFixed(2)}`;
    if (refEarnings) refEarnings.innerText = `$${(data.user.referralEarnings || 0).toFixed(2)}`;
    
    if (defaultWallet) {
      defaultWallet.value = data.user.defaultWallet || '';
      defaultWallet.setAttribute('readonly', 'readonly');
    }

    if (data.depositWallets) {
      const addrTrc = document.getElementById('addr-trc20');
      const addrBep = document.getElementById('addr-bep20');
      if (addrTrc) addrTrc.innerText = data.depositWallets.trc20;
      if (addrBep) addrBep.innerText = data.depositWallets.bep20;
    }

    const editWalletBtn = document.getElementById('edit-wallet-btn');
    const saveWalletBtn = document.getElementById('save-wallet-btn');
    if (editWalletBtn) {
      editWalletBtn.innerText = i18n[currentLang].btn_edit;
      editWalletBtn.className = "btn-small btn-warning mt-0 w-auto";
    }
    if (saveWalletBtn) saveWalletBtn.classList.add('hidden');

    const botUsername = data.botUsername || 'Ads_telegabot';
    const refLinkInput = document.getElementById('ref-link');
    if (refLinkInput) refLinkInput.value = `https://t.me/${botUsername.replace('@', '')}?start=${data.user._id}`;

    const announcementBox = document.getElementById('announcement-box');
    if (data.announcements && data.announcements.length > 0 && announcementBox) {
      announcementBox.classList.remove('hidden');
      const ancTitle = document.getElementById('anc-title');
      const ancContent = document.getElementById('anc-content');
      if (ancTitle) ancTitle.innerText = data.announcements[0].title;
      if (ancContent) ancContent.innerText = data.announcements[0].content;
    }

    const withdrawsContainer = document.getElementById('withdraws-list');
    if (withdrawsContainer) {
      if (!data.withdraws || data.withdraws.length === 0) {
        withdrawsContainer.innerHTML = currentLang === 'ar' ? 'لا توجد طلبات سحب سابقة.' : 'No withdrawal history.';
      } else {
        withdrawsContainer.innerHTML = data.withdraws.map(w => {
          let statusColor = 'var(--warning)';
          let statusText = currentLang === 'ar' ? 'قيد المراجعة' : 'Pending';
          if (w.status === 'approved' || w.status === 'Completed') { statusColor = 'var(--success)'; statusText = currentLang === 'ar' ? 'مكتمل' : 'Completed'; }
          else if (w.status === 'rejected' || w.status === 'Rejected') { statusColor = 'var(--danger)'; statusText = currentLang === 'ar' ? 'مرفوض' : 'Rejected'; }

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
          const shortUrl = l.shortUrl || `${API_BASE}/r/${l.shortCode}`;
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
          <div class="ad-item" style="border-left: 3px solid ${statusColor}; border-right: 3px solid ${statusColor};">
            <div class="ad-header">
              <b>${escapeHTML(ad.title)}</b>
              <span style="font-size: 10px; color: ${statusColor};">${escapeHTML(String(ad.status).toUpperCase())}</span>
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
  const titleInput = document.getElementById('ad-title');
  const targetUrlInput = document.getElementById('ad-target-url');
  const budgetInput = document.getElementById('ad-budget');

  if (!titleInput || !targetUrlInput || !budgetInput) return;
  const title = titleInput.value;
  const targetUrl = targetUrlInput.value;
  const totalBudget = budgetInput.value;

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
      titleInput.value = '';
      targetUrlInput.value = '';
      budgetInput.value = '';
      loadUserData();
    }
  } catch (e) {
    showToast(currentLang === 'ar' ? "حدث خطأ غير متوقع أثناء إطلاق الحملة" : "Unexpected error launching campaign");
  } finally {
    setButtonLoading('btn-create-ad', false, `<span data-i18n="btn_launch_ad">${i18n[currentLang].btn_launch_ad}</span>`);
  }
}

async function requestDeposit() {
  const amountInput = document.getElementById('deposit-amount');
  const networkInput = document.getElementById('deposit-network');
  const txHashInput = document.getElementById('deposit-txhash');

  if (!amountInput || !networkInput || !txHashInput) return;
  const amount = amountInput.value;
  const network = networkInput.value;
  const txid = txHashInput.value;

  if (!network) return showToast(currentLang === 'ar' ? "يرجى تحديد نوع الشبكة أولاً" : "Select deposit network first");
  if (!amount || amount <= 0) return showToast(currentLang === 'ar' ? "يرجى إدخال مبلغ الشحن الصحيح" : "Enter a valid deposit amount");
  if (!txid || txid.trim().length < 8) return showToast(currentLang === 'ar' ? "يرجى إدخال رمز العملية TxID الخاص بالمعاملة" : "Enter valid TxID");

  triggerHaptic('medium');
  setButtonLoading('btn-request-deposit', true);

  try {
    const res = await safeFetch('/api/deposit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, network, txid })
    });
    if (!res) return;
    const data = await res.json();
    if (data.error) showToast(data.error);
    else {
      showToast(currentLang === 'ar' ? "تم إرسال طلب الشحن بنجاح!" : "Deposit request submitted!");
      amountInput.value = '';
      txHashInput.value = '';
      networkInput.value = '';
      handleNetworkChange('');
      loadUserData();
    }
  } catch (e) {
    showToast(currentLang === 'ar' ? "خطأ أثناء تقديم طلب الشحن" : "Error submitting deposit request");
  } finally {
    setButtonLoading('btn-request-deposit', false, `<span data-i18n="btn_submit_deposit">${i18n[currentLang].btn_submit_deposit}</span>`);
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
        bridgeBridgeToken = data.bridgeToken;

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
  const duration = Math.floor((Date.now() - bridgeStartTime) / 1000);

  try {
    const res = await safeFetch('/api/impression', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: currentSessionId, bridgeToken: bridgeBridgeToken, duration })
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
  const titleInput = document.getElementById('link-title');
  const targetUrlInput = document.getElementById('link-url');
  if (!targetUrlInput) return;

  const title = titleInput ? titleInput.value : '';
  const targetUrl = targetUrlInput.value;

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
      if (titleInput) titleInput.value = '';
      targetUrlInput.value = '';
      loadUserData();
    }
  } catch (e) {
    showToast(currentLang === 'ar' ? "حدث خطأ غير متوقع" : "An unexpected error occurred");
  } finally {
    setButtonLoading('btn-create-link', false, `<span data-i18n="btn_shorten">${i18n[currentLang].btn_shorten}</span>`);
  }
}

async function requestWithdrawal() {
  const amtInput = document.getElementById('withdraw-amount');
  const walletInput = document.getElementById('default-wallet');
  if (!amtInput || !walletInput) return;

  const amount = parseFloat(amtInput.value);
  const walletAddress = walletInput.value;

  if (!walletAddress) return showToast(currentLang === 'ar' ? "يرجى إدخال عنوان محفظة السحب أولاً" : "Please enter a wallet address first");
  if (!amount || amount < 30) return showToast(currentLang === 'ar' ? "الحد الأدنى للسحب هو 30$" : "Minimum withdrawal is $30");

  triggerHaptic('medium');
  setButtonLoading('btn-request-withdraw', true);

  try {
    const res = await safeFetch('/api/withdraw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, walletAddress, network: 'TRC20' })
    });
    if (!res) return;
    const data = await res.json();
    if (data.error) showToast(data.error);
    else {
      showToast(currentLang === 'ar' ? "تم تقديم طلب السحب بنجاح!" : "Withdrawal requested successfully!");
      amtInput.value = '';
      const feeBox = document.getElementById('withdraw-fee-box');
      if (feeBox) feeBox.classList.add('hidden');
      loadUserData();
    }
  } catch (e) {
    showToast(currentLang === 'ar' ? "خطأ أثناء معالجة الطلب" : "Error processing request");
  } finally {
    setButtonLoading('btn-request-withdraw', false, `<span data-i18n="btn_submit_withdraw">${i18n[currentLang].btn_submit_withdraw}</span>`);
  }
}

async function saveSettings() {
  const walletInput = document.getElementById('default-wallet');
  const defaultWallet = walletInput ? walletInput.value : undefined;

  triggerHaptic('light');
  try {
    const res = await safeFetch('/api/user/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ defaultWallet, language: currentLang })
    });
    if (!res) return;
    const data = await res.json();
    if (data.error) showToast(data.error);
    else {
      showToast(currentLang === 'ar' ? "تم حفظ الإعدادات بنجاح" : "Settings saved successfully");
      loadUserData();
    }
  } catch (e) {
    showToast(currentLang === 'ar' ? "خطأ أثناء حفظ الإعدادات" : "Error saving settings");
  }
}

function switchTab(tabId) {
  if (tabId === 'admin' && !isUserAdmin) return;
  triggerHaptic('light');

  document.querySelectorAll('.tg-nav-dock button').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('#app-view > div[id^="tab-content-"]').forEach(c => c.classList.add('hidden'));
  
  const targetBtn = document.getElementById(`tab-btn-${tabId}`);
  if (targetBtn) targetBtn.classList.add('active');
  
  const tabContent = document.getElementById(`tab-content-${tabId}`);
  if (tabContent) tabContent.classList.remove('hidden');

  if (tabId === 'admin') {
    loadAdminData();
  }
}

async function loadAdminData() {
  try {
    const res = await safeFetch('/api/admin/dashboard-data');
    if (!res) return;
    const data = await res.json();
    if (data.error) return showToast(data.error);

    const totalUsersElem = document.getElementById('admin-total-users');
    const totalPendingElem = document.getElementById('admin-total-pending');
    if (totalUsersElem) totalUsersElem.innerText = data.stats?.totalUsers || 0;
    if (totalPendingElem) totalPendingElem.innerText = `$${(data.stats?.totalPending || 0).toFixed(2)}`;

    const dList = document.getElementById('admin-deposits-list');
    if (dList) {
      if (!data.deposits || data.deposits.length === 0) dList.innerHTML = 'No pending deposit requests.';
      else {
        dList.innerHTML = data.deposits.map(d => `
          <div style="background:#0d1527; padding:8px; margin-bottom:6px; border-radius:6px; border: 1px solid var(--border-color);">
            User: <b>${escapeHTML(d.advertiserId?.username || d.advertiserId?.telegramId || 'Unknown')}</b><br>
            Amount: <b style="color:var(--success);">$${parseFloat(d.amount || 0).toFixed(2)}</b> | Network: <code>${escapeHTML(d.network || d.paymentMethod)}</code><br>
            TxID: <code style="color: var(--warning); word-break: break-all;">${escapeHTML(d.txid || d.txHash || 'N/A')}</code><br>
            <div style="margin-top: 6px; display: flex; gap: 4px;">
              <button class="btn-small btn-success" onclick="handleAdminDeposit('${d._id}', 'approved')">Approve</button>
              <button class="btn-small btn-danger" onclick="handleAdminDeposit('${d._id}', 'rejected')">Reject</button>
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
              <button class="btn-small btn-success" onclick="handleAdminWithdraw('${w._id}', 'approved')">Approve</button>
              <button class="btn-small btn-danger" onclick="handleAdminWithdraw('${w._id}', 'rejected')">Reject</button>
            </div>
          </div>
        `).join('');
      }
    }

    const uList = document.getElementById('admin-users-list');
    if (uList) {
      if (!data.users || data.users.length === 0) uList.innerHTML = 'No users found.';
      else {
        uList.innerHTML = data.users.map(u => `
          <div style="background:#0d1527; padding:8px; margin-bottom:6px; border-radius:6px; display: flex; justify-content: space-between; align-items: center; border-left: 3px solid ${u.isBanned ? 'var(--danger)' : 'var(--success)'}; border-right: 3px solid ${u.isBanned ? 'var(--danger)' : 'var(--success)'};">
            <div>
              <b>${escapeHTML(u.username || 'Unknown')}</b> (${escapeHTML(String(u.telegramId || ''))})<br>
              <span style="color: var(--text-muted);">Available: $${(u.availableBalance || 0).toFixed(2)}</span>
            </div>
            <button class="btn-small ${u.isBanned ? 'btn-warning' : 'btn-danger'}" onclick="toggleUserBan('${u._id}')">
              ${u.isBanned ? 'Unban' : 'Ban'}
            </button>
          </div>
        `).join('');
      }
    }
  } catch (e) {
    showToast("Failed to load admin data");
  }
}

async function handleAdminDeposit(depositId, action) {
  let reason = '';
  if (action === 'rejected') {
    reason = prompt("Rejection reason:") || 'Does not meet criteria';
  }

  triggerHaptic('medium');
  try {
    const res = await safeFetch('/api/admin/deposit/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ depositId, action, reason })
    });
    if (!res) return;
    const data = await res.json();
    if (data.error) showToast(data.error);
    else {
      showToast("Deposit request updated");
      loadAdminData();
    }
  } catch (e) {
    showToast("Deposit action failed");
  }
}

async function handleAdminWithdraw(withdrawId, action) {
  let reason = '';
  if (action === 'rejected') {
    reason = prompt("Rejection reason (shown to user):");
    if (reason === null) return;
  }

  triggerHaptic('medium');
  try {
    const res = await safeFetch('/api/admin/withdraw/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ withdrawId, action, reason })
    });
    if (!res) return;
    const data = await res.json();
    if (data.error) showToast(data.error);
    else {
      showToast("Withdrawal request updated");
      loadAdminData();
    }
  } catch (e) {
    showToast("Action failed");
  }
}

async function toggleUserBan(userId) {
  triggerHaptic('medium');
  try {
    const res = await safeFetch('/api/admin/user/toggle-ban', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId })
    });
    if (!res) return;
    const data = await res.json();
    if (data.error) showToast(data.error);
    else {
      showToast(data.isBanned ? "User banned" : "User unbanned");
      loadAdminData();
    }
  } catch (e) {
    showToast("Error changing ban state");
  }
}

window.addEventListener('DOMContentLoaded', () => {
  try {
    if (tg) {
      tg.ready();
      tg.expand();
    }
  } catch (e) {
    console.warn("Telegram WebApp API ready error:", e);
  }
  
  applyLanguage(currentLang);
  renderTelegramUser();

  const bridgeView = document.getElementById('bridge-view');
  const appView = document.getElementById('app-view');

  if (window.location.pathname.startsWith('/r/')) {
    if (bridgeView) bridgeView.classList.remove('hidden');
    initBridge();
  } else {
    if (appView) appView.classList.remove('hidden');
    initializeApp();
  }
});
