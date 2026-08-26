/**
 * app.js - المكون الرئيسي لتشغيل المنطق البرمجي والترجمة والتفاعل
 */

const API_BASE = window.location.protocol.startsWith('file') 
  ? 'http://localhost:3000' 
  : window.location.origin;

let authToken = localStorage.getItem('authToken');
let currentSessionId = null;
let bridgeStartTime = Date.now();
let isUserAdmin = false;
const tg = window.Telegram?.WebApp;

document.addEventListener('DOMContentLoaded', () => {
  if (window.i18n) {
    window.i18n.init();
    const currentLang = window.i18n.getLanguage();
    const langSelect = document.getElementById('language-select');
    if (langSelect) {
      langSelect.value = currentLang;
    }
  }
  initializeApp();
});

window.switchTab = function(tabId) {
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
};

window.changeAppLanguage = function(lang) {
  if (window.i18n) window.i18n.setLanguage(lang);
  loadUserData();
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

window.handleNetworkChange = function(networkVal) {
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
};

window.switchWalletView = function(view) {
  triggerHaptic('light');
  const depBtn = document.getElementById('wallet-nav-deposit');
  const drawBtn = document.getElementById('wallet-nav-withdraw');
  const depView = document.getElementById('wallet-view-deposit');
  const drawView = document.getElementById('wallet-view-withdraw');

  if (depBtn) depBtn.classList.toggle('active', view === 'deposit');
  if (drawBtn) drawBtn.classList.toggle('active', view === 'withdraw');
  if (depView) depView.classList.toggle('hidden', view !== 'deposit');
  if (drawView) drawView.classList.toggle('hidden', view !== 'withdraw');
};

window.toggleInstructionsModal = function(show) {
  triggerHaptic('medium');
  const modal = document.getElementById('instructions-modal');
  if (modal) modal.classList.toggle('hidden', !show);
};

window.updateWithdrawCalculations = function() {
  const amtInput = document.getElementById('withdraw-amount');
  const feeBox = document.getElementById('withdraw-fee-box');
  if (!amtInput || !feeBox) return;

  const val = parseFloat(amtInput.value) || 0;
  if (val > 0) {
    feeBox.classList.remove('hidden');
    const fee = val * 0.10;
    const net = val - fee;

    document.getElementById('calc-req').innerText = `$${val.toFixed(2)}`;
    document.getElementById('calc-fee').innerText = `$${fee.toFixed(2)}`;
    document.getElementById('calc-net').innerText = `$${net.toFixed(2)}`;
  } else {
    feeBox.classList.add('hidden');
  }
};

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
    showToast(window.i18n ? window.i18n.t('network_error') : 'خطأ في الاتصال بالشبكة');
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
  const u = tg?.initDataUnsafe?.user;
  const avatarContainer = document.getElementById('user-avatar-container');
  const nameElem = document.getElementById('user-display-name');
  const handleElem = document.getElementById('user-display-handle');
  const premiumBadge = document.getElementById('user-premium-badge');

  if (u) {
    const fullName = `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username || 'Telegram User';
    if (nameElem) nameElem.innerText = fullName;
    if (handleElem) handleElem.innerText = u.username ? `@${u.username}` : '@no_username';

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
    if (savedLang && window.i18n) {
      window.i18n.setLanguage(savedLang);
    } else if (u.language_code && window.i18n) {
      window.i18n.setLanguage(u.language_code);
    } else if (window.i18n) {
      window.i18n.setLanguage('en');
    }
  } else {
    if (nameElem) nameElem.innerText = 'Demo User';
    if (handleElem) handleElem.innerText = '@demo_user';
    if (avatarContainer) avatarContainer.innerHTML = `<div class="user-avatar-placeholder">D</div>`;
    
    if (window.i18n) {
      if (!localStorage.getItem('appLang')) {
        window.i18n.setLanguage('en');
      } else {
        window.i18n.init();
      }
    }
  }
}

window.showToast = function(msg) {
  triggerHaptic('medium');
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.innerText = msg;
  toast.classList.add("show");
  setTimeout(() => { toast.classList.remove("show"); }, 3000);
};

window.copyToClipboard = function(text) {
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    showToast(window.i18n ? window.i18n.t('copied') : 'تم النسخ');
  }).catch(() => {
    showToast(window.i18n ? window.i18n.t('copy_failed') : 'فشل النسخ');
  });
};

window.shareReferralLink = function() {
  const refUrl = document.getElementById('ref-link')?.value;
  if (!refUrl) return;
  triggerHaptic('medium');
  const shareText = encodeURIComponent(window.i18n ? window.i18n.t('share_text') : '');
  const url = `https://t.me/share/url?url=${encodeURIComponent(refUrl)}&text=${shareText}`;
  
  if (tg && tg.openTelegramLink) {
    tg.openTelegramLink(url);
  } else {
    window.open(url, '_blank');
  }
};

window.toggleWalletEdit = function() {
  triggerHaptic('light');
  const walletInput = document.getElementById('default-wallet');
  const editBtn = document.getElementById('edit-wallet-btn');
  const saveBtn = document.getElementById('save-wallet-btn');
  if (!walletInput || !editBtn || !saveBtn) return;

  if (walletInput.hasAttribute('readonly')) {
    walletInput.removeAttribute('readonly');
    walletInput.focus();
    editBtn.innerText = window.i18n ? window.i18n.t('cancel') : 'إلغاء';
    editBtn.className = "btn-small btn-danger";
    saveBtn.classList.remove('hidden');
  } else {
    walletInput.setAttribute('readonly', 'readonly');
    editBtn.innerText = window.i18n ? window.i18n.t('btn_edit') : 'تعديل';
    editBtn.className = "btn-small btn-warning";
    saveBtn.classList.add('hidden');
  }
};

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
    showToast(window.i18n ? window.i18n.t('auth_failed') : 'فشل التسجيل');
  }
  return false;
}

async function initializeApp() {
  renderTelegramUser();
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

    const appView = document.getElementById('app-view');
    const bridgeView = document.getElementById('bridge-view');
    if (appView && !window.location.pathname.includes('/r/')) {
      appView.classList.remove('hidden');
      if (bridgeView) bridgeView.classList.add('hidden');
    }

    isUserAdmin = !!data.isAdmin;
    const adminTabBtn = document.getElementById('tab-btn-admin');
    if (adminTabBtn) adminTabBtn.classList.toggle('hidden', !isUserAdmin);

    document.getElementById('pending-bal').innerText = `$${(data.user.pendingBalance || 0).toFixed(2)}`;
    document.getElementById('avail-bal').innerText = `$${(data.user.availableBalance || 0).toFixed(2)}`;
    document.getElementById('ref-earnings').innerText = `$${(data.user.referralEarnings || 0).toFixed(2)}`;
    
    const walletInput = document.getElementById('default-wallet');
    if (walletInput) walletInput.value = data.user.defaultWallet || '';
    
    if (walletInput) walletInput.setAttribute('readonly', 'readonly');
    const editWalletBtn = document.getElementById('edit-wallet-btn');
    if (editWalletBtn) {
      editWalletBtn.innerText = window.i18n ? window.i18n.t('btn_edit') : 'تعديل';
      editWalletBtn.className = "btn-small btn-warning";
    }
    const saveWalletBtn = document.getElementById('save-wallet-btn');
    if (saveWalletBtn) saveWalletBtn.classList.add('hidden');

    const botUsername = window.Telegram?.WebApp?.initDataUnsafe?.bot?.username || 'Ads_telegabot';
    const refLinkInput = document.getElementById('ref-link');
    if (refLinkInput) refLinkInput.value = `https://t.me/${botUsername}?start=${data.user._id}`;

    const ancBox = document.getElementById('announcement-box');
    if (ancBox) {
      if (data.announcements && data.announcements.length > 0) {
        ancBox.classList.remove('hidden');
        document.getElementById('anc-title').innerText = data.announcements[0].title;
        document.getElementById('anc-content').innerText = data.announcements[0].content;
      } else {
        ancBox.classList.add('hidden');
      }
    }

    const withdrawsContainer = document.getElementById('withdraws-list');
    if (withdrawsContainer) {
      if (!data.withdraws || data.withdraws.length === 0) {
        withdrawsContainer.innerHTML = window.i18n ? window.i18n.t('no_withdraw_history') : '';
      } else {
        withdrawsContainer.innerHTML = data.withdraws.map(w => {
          let statusColor = 'var(--warning)';
          let statusText = window.i18n ? window.i18n.t('status_pending') : 'قيد الانتظار';
          if (w.status === 'Completed') { statusColor = 'var(--success)'; statusText = window.i18n ? window.i18n.t('status_completed') : 'مكتمل'; }
          else if (w.status === 'Rejected') { statusColor = 'var(--danger)'; statusText = window.i18n ? window.i18n.t('status_rejected') : 'مرفوض'; }

          return `
          <div style="background: #0d1527; padding: 8px; margin-bottom: 6px; border-radius: 6px; border: 1px solid var(--border-color);">
            <div style="display: flex; justify-content: space-between;">
              <span>${window.i18n ? window.i18n.t('calc_req_label') : 'المطلب:'} <b>$${parseFloat(w.amount || 0).toFixed(2)}</b></span>
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
        linksContainer.innerHTML = window.i18n ? window.i18n.t('no_links_yet') : '';
      } else {
        linksContainer.innerHTML = data.links.map(l => {
          const shortUrl = `${API_BASE}/r/${l.shortCode}`;
          const statusColor = l.isActive ? 'var(--success)' : 'var(--danger)';
          const statusText = l.isActive ? (window.i18n ? window.i18n.t('status_active') : 'نشط') : (window.i18n ? window.i18n.t('status_disabled') : 'معطل');
          return `
          <div class="link-item" style="border-left: 3px solid ${statusColor}; border-right: 3px solid ${statusColor};">
            <div class="link-header">
              <b>${escapeHTML(l.title || (window.i18n ? window.i18n.t('untitled_link') : 'بدون عنوان'))}</b>
              <span style="font-size: 10px; color: ${statusColor};">${statusText}</span>
            </div>
            <div style="color:var(--text-muted); font-size:11px; margin-bottom:4px; word-break: break-all;">${escapeHTML(shortUrl)}</div>
            <div>${window.i18n ? window.i18n.t('views_label') : 'المشاهدات:'} <b>${l.views || 0}</b> | ${window.i18n ? window.i18n.t('valid_label') : 'الصحيحة:'} <b style="color:var(--success);">${l.validImpressions || 0}</b></div>
            <div class="link-actions">
              <button class="btn-small" onclick="copyToClipboard('${escapeHTML(shortUrl)}')">${window.i18n ? window.i18n.t('btn_copy') : 'نسخ'}</button>
              <button class="btn-small ${l.isActive ? 'btn-danger' : 'btn-warning'}" onclick="toggleLinkStatus('${l._id}')">${l.isActive ? (window.i18n ? window.i18n.t('btn_disable') : 'تعطيل') : (window.i18n ? window.i18n.t('btn_enable') : 'تفعيل')}</button>
            </div>
          </div>`;
        }).join('');
      }
    }

    const adsContainer = document.getElementById('ads-list');
    if (adsContainer) {
      if (!data.ads || data.ads.length === 0) {
        adsContainer.innerHTML = window.i18n ? window.i18n.t('no_ads_yet') : '';
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
            <div>${window.i18n ? window.i18n.t('remaining_budget') : 'المتبقي:'} <b style="color:var(--success);">$${(ad.remainingBudget || 0).toFixed(2)}</b> / $${parseFloat(ad.totalBudget || 0).toFixed(2)} | ${window.i18n ? window.i18n.t('views_label') : 'المشاهدات:'} <b>${ad.impressionsCount || 0}</b></div>
            <div class="ad-actions">
              ${ad.status !== 'completed' ? `<button class="btn-small ${ad.status === 'active' ? 'btn-warning' : 'btn-success'}" onclick="toggleAdStatus('${ad._id}')">${ad.status === 'active' ? (window.i18n ? window.i18n.t('btn_pause') : 'إيقاف') : (window.i18n ? window.i18n.t('btn_activate') : 'تفعيل')}</button>` : ''}
            </div>
          </div>`;
        }).join('');
      }
    }

  } catch (err) {
    console.error("Error loading user data:", err);
  }
}

window.toggleLinkStatus = async function(linkId) {
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
      showToast(data.isActive ? (window.i18n ? window.i18n.t('link_activated') : 'تم التفعيل') : (window.i18n ? window.i18n.t('link_disabled') : 'تم التعطيل'));
      loadUserData();
    }
  } catch (e) {
    showToast(window.i18n ? window.i18n.t('toggle_link_error') : 'خطأ');
  }
};

window.toggleAdStatus = async function(adId) {
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
      showToast(window.i18n ? window.i18n.t('ad_status_updated') : 'تم تحديث حالة الإعلان');
      loadUserData();
    }
  } catch (e) {
    showToast(window.i18n ? window.i18n.t('toggle_ad_error') : 'خطأ');
  }
};

window.createAdCampaign = async function() {
  const title = document.getElementById('ad-title')?.value;
  const targetUrl = document.getElementById('ad-target-url')?.value;
  const totalBudget = document.getElementById('ad-budget')?.value;

  if (!title || !targetUrl || !totalBudget) return showToast(window.i18n ? window.i18n.t('fill_ad_details') : 'يرجى ملء كافة البيانات');

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
      showToast(window.i18n ? window.i18n.t('ad_success') : 'تم إطلاق الحملة');
      document.getElementById('ad-title').value = '';
      document.getElementById('ad-target-url').value = '';
      document.getElementById('ad-budget').value = '';
      loadUserData();
    }
  } catch (e) {
    showToast(window.i18n ? window.i18n.t('ad_unexpected_error') : 'خطأ غير متوقع');
  } finally {
    setButtonLoading('btn-create-ad', false, `<span data-i18n="btn_launch_ad">${window.i18n ? window.i18n.t('btn_launch_ad') : 'إطلاق الحملة'}</span>`);
  }
};

window.requestDeposit = async function() {
  const amount = document.getElementById('deposit-amount')?.value;
  const paymentMethod = document.getElementById('deposit-network')?.value;
  const txHash = document.getElementById('deposit-txhash')?.value;

  if (!paymentMethod) return showToast(window.i18n ? window.i18n.t('select_network_first') : 'اختر الشبكة');
  if (!amount || amount <= 0) return showToast(window.i18n ? window.i18n.t('enter_valid_amount') : 'أدخل مبلغ صحيح');
  if (!txHash || txHash.trim().length < 8) return showToast(window.i18n ? window.i18n.t('enter_valid_txid') : 'أدخل رقم المعاملة');

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
      showToast(window.i18n ? window.i18n.t('deposit_success') : 'تم إرسال طلب الإيداع');
      document.getElementById('deposit-amount').value = '';
      document.getElementById('deposit-txhash').value = '';
      document.getElementById('deposit-network').value = '';
      handleNetworkChange('');
      loadUserData();
    }
  } catch (e) {
    showToast(window.i18n ? window.i18n.t('deposit_error') : 'حدث خطأ');
  } finally {
    setButtonLoading('btn-request-deposit', false, `<span data-i18n="btn_submit_deposit">${window.i18n ? window.i18n.t('btn_submit_deposit') : 'تأكيد الإيداع'}</span>`);
  }
};

window.completeImpression = async function() {
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
      setButtonLoading('go-btn', false, `<span data-i18n="go_button">${window.i18n ? window.i18n.t('go_button') : 'متابعة'}</span>`);
      showToast(data.error || (window.i18n ? window.i18n.t('redirect_error') : 'خطأ'));
    }
  } catch (err) {
    setButtonLoading('go-btn', false, `<span data-i18n="go_button">${window.i18n ? window.i18n.t('go_button') : 'متابعة'}</span>`);
    showToast(window.i18n ? window.i18n.t('server_error') : 'خطأ في السيرفر');
  }
};

window.handleShortenClick = async function() {
  const title = document.getElementById('link-title')?.value;
  const targetUrl = document.getElementById('link-url')?.value;

  if (!targetUrl) {
    showToast(window.i18n ? window.i18n.t('enter_original_url') : 'أدخل الرابط الأصل');
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
      showToast(window.i18n ? window.i18n.t('link_success_msg') : 'تم اختصار الرابط');
      document.getElementById('link-title').value = '';
      document.getElementById('link-url').value = '';
      loadUserData();
    }
  } catch (e) {
    showToast(window.i18n ? window.i18n.t('unexpected_error') : 'خطأ غير متوقع');
  } finally {
    setButtonLoading('btn-create-link', false, `<span data-i18n="btn_shorten">${window.i18n ? window.i18n.t('btn_shorten') : 'اختصار الآن'}</span>`);
  }
};

window.requestWithdrawal = async function() {
  const amount = parseFloat(document.getElementById('withdraw-amount')?.value);
  const walletAddress = document.getElementById('default-wallet')?.value;

  if (!walletAddress) return showToast(window.i18n ? window.i18n.t('enter_wallet_first') : 'حدد المحفظة');
  if (!amount || amount < 30) return showToast(window.i18n ? window.i18n.t('min_withdraw_error') : 'الحد الأدنى 30$');

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
      showToast(window.i18n ? window.i18n.t('withdraw_success') : 'تم إرسال طلب السحب');
      document.getElementById('withdraw-amount').value = '';
      document.getElementById('withdraw-fee-box').classList.add('hidden');
      loadUserData();
    }
  } catch (e) {
    showToast(window.i18n ? window.i18n.t('withdraw_process_error') : 'حدث خطأ');
  } finally {
    setButtonLoading('btn-request-withdraw', false, `<span data-i18n="btn_submit_withdraw">${window.i18n ? window.i18n.t('btn_submit_withdraw') : 'إرسال طلب السحب'}</span>`);
  }
};

window.saveSettings = async function() {
  const defaultWallet = document.getElementById('default-wallet')?.value;
  if (!defaultWallet || defaultWallet.trim().length < 5) {
    return showToast(window.i18n ? window.i18n.t('invalid_wallet') : 'محفظة غير صالحة');
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
      showToast(window.i18n ? window.i18n.t('wallet_saved') : 'تم حفظ المحفظة');
      loadUserData();
    }
  } catch (e) {
    showToast(window.i18n ? window.i18n.t('settings_save_error') : 'خطأ عند الحفظ');
  }
};

window.handleAdminDeposit = async function(depositId, status) {
  triggerHaptic('medium');
  try {
    const res = await safeFetch('/api/admin/deposit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ depositId, status })
    });
    if (!res) return;
    const data = await res.json();
    if (data.error) showToast(data.error);
    else {
      showToast('Deposit updated successfully');
      loadAdminData();
    }
  } catch (e) {
    showToast(window.i18n ? window.i18n.t('unexpected_error') : 'خطأ');
  }
};

window.handleAdminWithdraw = async function(withdrawId, status) {
  triggerHaptic('medium');
  try {
    const res = await safeFetch('/api/admin/withdraw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ withdrawId, status })
    });
    if (!res) return;
    const data = await res.json();
    if (data.error) showToast(data.error);
    else {
      showToast('Withdraw updated successfully');
      loadAdminData();
    }
  } catch (e) {
    showToast(window.i18n ? window.i18n.t('unexpected_error') : 'خطأ');
  }
};

async function loadAdminData() {
  try {
    const res = await safeFetch('/api/admin/dashboard-data');
    if (!res) return;
    const data = await res.json();
    if (data.error) return showToast(data.error);

    document.getElementById('admin-total-users').innerText = data.stats?.totalUsers || 0;
    document.getElementById('admin-total-pending').innerText = `$${(data.stats?.totalPending || 0).toFixed(2)}`;

    const dList = document.getElementById('admin-deposits-list');
    if (dList) {
      if (!data.deposits || data.deposits.length === 0) dList.innerHTML = window.i18n ? window.i18n.t('no_pending_deposits') : '';
      else {
        dList.innerHTML = data.deposits.map(d => `
          <div style="background:#0d1527; padding:8px; margin-bottom:6px; border-radius:6px; border: 1px solid var(--border-color);">
            User: <b>${escapeHTML(d.advertiserId?.username || d.advertiserId?.telegramId || 'Unknown')}</b><br>
            Amount: <b style="color:var(--success);">$${parseFloat(d.amount || 0).toFixed(2)}</b> | Network: <code>${escapeHTML(d.paymentMethod)}</code><br>
            TxID: <code style="color: var(--warning); word-break: break-all;">${escapeHTML(d.txHash || 'N/A')}</code><br>
            <div style="margin-top: 6px; display: flex; gap: 4px;">
              <button class="btn-small btn-success" onclick="handleAdminDeposit('${d._id}', 'Completed')">${window.i18n ? window.i18n.t('approve_btn') : 'موافقة'}</button>
              <button class="btn-small btn-danger" onclick="handleAdminDeposit('${d._id}', 'Rejected')">${window.i18n ? window.i18n.t('reject_btn') : 'رفض'}</button>
            </div>
          </div>
        `).join('');
      }
    }

    const wList = document.getElementById('admin-withdraws-list');
    if (wList) {
      if (!data.withdraws || data.withdraws.length === 0) wList.innerHTML = window.i18n ? window.i18n.t('no_pending_withdraws') : '';
      else {
        wList.innerHTML = data.withdraws.map(w => `
          <div style="background:#0d1527; padding:8px; margin-bottom:6px; border-radius:6px; border: 1px solid var(--border-color);">
            User: <b>${escapeHTML(w.userId?.username || w.userId?.telegramId || 'Unknown')}</b><br>
            Amount: <b style="color:var(--success);">$${parseFloat(w.amount || 0).toFixed(2)}</b><br>
            Wallet: <code>${escapeHTML(w.walletAddress)}</code><br>
            <div style="margin-top: 6px; display: flex; gap: 4px;">
              <button class="btn-small btn-success" onclick="handleAdminWithdraw('${w._id}', 'Completed')">${window.i18n ? window.i18n.t('approve_btn') : 'موافقة'}</button>
              <button class="btn-small btn-danger" onclick="handleAdminWithdraw('${w._id}', 'Rejected')">${window.i18n ? window.i18n.t('reject_btn') : 'رفض'}</button>
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
          <div style="background:#0d1527; padding:8px; margin-bottom:6px; border-radius:6px; display: flex; justify-content: space-between; align-items: center; border-left: 3px solid ${u.isBanned ? 'var(--danger)' : 'var(--success)'};">
            <div>
              <b>${escapeHTML(u.username || 'Unknown')}</b> (${escapeHTML(String(u.telegramId || ''))})<br>
              <span style="color: var(--text-muted);">Available: $${(u.availableBalance || 0).toFixed(2)}</span>
            </div>
          </div>
        `).join('');
      }
    }
  } catch (err) {
    console.error("Admin data load error:", err);
  }
}
