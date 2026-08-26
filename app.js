const API_BASE = window.location.protocol.startsWith('file') 
  ? 'http://localhost:3000' 
  : window.location.origin;

let authToken = localStorage.getItem('authToken');
let currentSessionId = null;
let bridgeStartTime = Date.now();
let isUserAdmin = false;
const tg = window.Telegram?.WebApp;

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

function getText(key, fallback = '') {
  if (typeof i18n !== 'undefined' && typeof currentLang !== 'undefined' && i18n[currentLang] && i18n[currentLang][key]) {
    return i18n[currentLang][key];
  }
  return fallback;
}

/* --- التحكم في التنقل وتحديد الأقسام --- */

// دالة الانتقال لفتح نافذة/قسم الإيداع فقط
function navigateToDepositSection() {
  triggerHaptic('light');
  const depositSection = document.getElementById('deposit-section');
  const shortenerSection = document.getElementById('shortener-section');

  if (depositSection) depositSection.classList.remove('hidden');
  if (shortenerSection) shortenerSection.classList.add('hidden');
}

// دالة الانتقال لصفحة اختصار الروابط والجسر
function navigateToShortenerSection() {
  const depositSection = document.getElementById('deposit-section');
  const shortenerSection = document.getElementById('shortener-section');

  if (depositSection) depositSection.classList.add('hidden');
  if (shortenerSection) shortenerSection.classList.remove('hidden');
}

function handleNetworkChange(networkVal) {
  triggerHaptic('light');
  const trcCard = document.getElementById('card-addr-trc20');
  const bepCard = document.getElementById('card-addr-bep20');

  if (trcCard) trcCard.classList.add('hidden');
  if (bepCard) bepCard.classList.add('hidden');

  if ((networkVal === 'USDT_TRC20' || networkVal === 'TRC20') && trcCard) {
    trcCard.classList.remove('hidden');
  } else if ((networkVal === 'USDT_BEP20' || networkVal === 'BEP20') && bepCard) {
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
  if (!amtInput) return;
  const val = parseFloat(amtInput.value) || 0;

  if (val > 0) {
    if (feeBox) feeBox.classList.remove('hidden');
    const fee = 3; 
    const net = Math.max(0, val - fee);

    const calcReq = document.getElementById('calc-req');
    const calcFee = document.getElementById('calc-fee');
    const calcNet = document.getElementById('calc-net');

    if (calcReq) calcReq.innerText = `$${val.toFixed(2)}`;
    if (calcFee) calcFee.innerText = `$${fee.toFixed(2)}`;
    if (calcNet) calcNet.innerText = `$${net.toFixed(2)}`;
  } else if (feeBox) {
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
    showToast(getText('network_error', 'Network error. Please try again.'));
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
    if (savedLang && typeof i18n !== 'undefined' && i18n[savedLang]) {
      currentLang = savedLang;
    } else if (u.language_code && typeof i18n !== 'undefined' && i18n[u.language_code]) {
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

  if (typeof applyLanguage === 'function') {
    applyLanguage(currentLang);
  }
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
    showToast(getText('copied', 'Copied!'));
  }).catch(() => {
    showToast(getText('copy_failed', 'Failed to copy'));
  });
}

function shareReferralLink() {
  const refInput = document.getElementById('ref-link');
  if (!refInput) return;
  const refUrl = refInput.value;
  if (!refUrl) return;
  triggerHaptic('medium');
  const shareText = encodeURIComponent(getText('share_ref_text', 'Join me on the best url shortener platform & earn money! 🚀'));
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
      editBtn.innerText = getText('cancel', 'Cancel');
      editBtn.className = "btn-small btn-danger";
    }
    if (saveBtn) saveBtn.classList.remove('hidden');
  } else {
    walletInput.setAttribute('readonly', 'readonly');
    if (editBtn) {
      editBtn.innerText = getText('btn_edit', 'Edit');
      editBtn.className = "btn-small btn-warning";
    }
    if (saveBtn) saveBtn.classList.add('hidden');
  }
}

async function checkAdminPermissions() {
  const userId = tg?.initDataUnsafe?.user?.id;
  const adminTabBtn = document.getElementById('tab-btn-admin');
  const adminTabContent = document.getElementById('tab-content-admin');
  const adminSection = document.getElementById('admin-section');

  const hideAdminUI = () => {
    isUserAdmin = false;
    if (adminTabBtn) adminTabBtn.style.display = 'none';
    if (adminTabContent) adminTabContent.style.display = 'none';
    if (adminSection) adminSection.style.display = 'none';
  };

  if (!userId) {
    hideAdminUI();
    return false;
  }

  try {
    const res = await safeFetch('/api/check-admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId })
    });

    if (!res) {
      hideAdminUI();
      return false;
    }

    const data = await res.json();
    if (data && data.isAdmin === true) {
      isUserAdmin = true;
      if (adminTabBtn) adminTabBtn.style.display = '';
      if (adminTabContent) adminTabContent.style.display = '';
      if (adminSection) adminSection.style.display = '';
      return true;
    } else {
      hideAdminUI();
      return false;
    }
  } catch (err) {
    console.error("Admin check failed:", err);
    hideAdminUI();
    return false;
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
      return true;
    }
  } catch (e) {
    console.error("Auth error:", e);
    showToast(getText('auth_failed', 'Authentication failed'));
  }
  return false;
}

async function initializeApp() {
  try {
    if (!authToken) await authLogin();
    await checkAdminPermissions();
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

    if (data.isAdmin !== undefined) {
      if (!data.isAdmin) {
        const adminTabBtn = document.getElementById('tab-btn-admin');
        const adminTabContent = document.getElementById('tab-content-admin');
        if (adminTabBtn) adminTabBtn.style.display = 'none';
        if (adminTabContent) adminTabContent.style.display = 'none';
      }
    }

    const pBal = document.getElementById('pending-bal');
    const aBal = document.getElementById('avail-bal');
    const rEarn = document.getElementById('ref-earnings');
    const defWallet = document.getElementById('default-wallet');

    if (pBal) pBal.innerText = `$${(data.user.pendingBalance || 0).toFixed(2)}`;
    if (aBal) aBal.innerText = `$${(data.user.availableBalance || 0).toFixed(2)}`;
    if (rEarn) rEarn.innerText = `$${(data.user.referralEarnings || 0).toFixed(2)}`;
    if (defWallet) {
      defWallet.value = data.user.defaultWallet || '';
      defWallet.setAttribute('readonly', 'readonly');
    }
    
    const editBtn = document.getElementById('edit-wallet-btn');
    const saveBtn = document.getElementById('save-wallet-btn');
    if (editBtn) {
      editBtn.innerText = getText('btn_edit', 'Edit');
      editBtn.className = "btn-small btn-warning";
    }
    if (saveBtn) saveBtn.classList.add('hidden');

    const botUsername = window.Telegram?.WebApp?.initDataUnsafe?.bot?.username || 'Ads_telegabot';
    const refLinkInput = document.getElementById('ref-link');
    if (refLinkInput) {
      refLinkInput.value = `https://t.me/${botUsername}?start=${data.user._id}`;
    }

    if (data.announcements && data.announcements.length > 0) {
      const ancBox = document.getElementById('announcement-box');
      const ancTitle = document.getElementById('anc-title');
      const ancContent = document.getElementById('anc-content');
      if (ancBox) ancBox.classList.remove('hidden');
      if (ancTitle) ancTitle.innerText = data.announcements[0].title;
      if (ancContent) ancContent.innerText = data.announcements[0].content;
    }

    const withdrawsContainer = document.getElementById('withdraws-list');
    if (withdrawsContainer) {
      if (!data.withdraws || data.withdraws.length === 0) {
        withdrawsContainer.innerHTML = getText('no_withdrawals', 'No withdrawal history.');
      } else {
        withdrawsContainer.innerHTML = data.withdraws.map(w => {
          let statusColor = 'var(--warning)';
          let statusText = getText('status_pending', 'Pending');
          if (w.status === 'approved' || w.status === 'Completed') { 
            statusColor = 'var(--success)'; 
            statusText = getText('status_completed', 'Completed'); 
          } else if (w.status === 'rejected' || w.status === 'Rejected') { 
            statusColor = 'var(--danger)'; 
            statusText = getText('status_rejected', 'Rejected'); 
          }

          return `
          <div style="background: #0d1527; padding: 8px; margin-bottom: 6px; border-radius: 6px; border: 1px solid var(--border-color);">
            <div style="display: flex; justify-content: space-between;">
              <span>Amount: <b>$${parseFloat(w.amount || 0).toFixed(2)}</b></span>
              <span style="color: ${statusColor}; font-weight: bold;">${statusText}</span>
            </div>
            <div style="color: var(--text-muted); font-size: 11px; margin-top: 2px; word-break: break-all;">Wallet: ${escapeHTML(w.walletAddress || w.details)}</div>
            ${w.rejectReason ? `<div style="color: var(--danger); font-size: 11px; margin-top: 2px;">Reason: ${escapeHTML(w.rejectReason)}</div>` : ''}
          </div>`;
        }).join('');
      }
    }

    const linksContainer = document.getElementById('links-list');
    if (linksContainer) {
      if (!data.links || data.links.length === 0) {
        linksContainer.innerHTML = getText('no_links', 'No short links created yet.');
      } else {
        linksContainer.innerHTML = data.links.map(l => {
          const shortUrl = `${API_BASE}/r/${l.shortCode}`;
          const statusColor = l.isActive ? 'var(--success)' : 'var(--danger)';
          const statusText = l.isActive ? getText('status_active', 'Active') : getText('status_disabled', 'Disabled');
          return `
          <div class="link-item" style="border-left: 3px solid ${statusColor}; border-right: 3px solid ${statusColor};">
            <div class="link-header">
              <b>${escapeHTML(l.title || getText('untitled_link', 'Untitled Link'))}</b>
              <span style="font-size: 10px; color: ${statusColor};">${statusText}</span>
            </div>
            <div style="color:var(--text-muted); font-size:11px; margin-bottom:4px; word-break: break-all;">${escapeHTML(shortUrl)}</div>
            <div>Views: <b>${l.views || 0}</b> | Valid: <b style="color:var(--success);">${l.validImpressions || 0}</b></div>
            <div class="link-actions">
              <button class="btn-small" onclick="copyToClipboard('${escapeHTML(shortUrl)}')">${getText('copy', 'Copy')}</button>
              <button class="btn-small ${l.isActive ? 'btn-danger' : 'btn-warning'}" onclick="toggleLinkStatus('${l._id}')">${l.isActive ? getText('btn_disable', 'Disable') : getText('btn_enable', 'Enable')}</button>
            </div>
          </div>`;
        }).join('');
      }
    }

    const adsContainer = document.getElementById('ads-list');
    if (adsContainer) {
      if (!data.ads || data.ads.length === 0) {
        adsContainer.innerHTML = getText('no_ads', 'No active ad campaigns.');
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
              ${ad.status !== 'completed' ? `<button class="btn-small ${ad.status === 'active' ? 'btn-warning' : 'btn-success'}" onclick="toggleAdStatus('${ad._id}')">${ad.status === 'active' ? getText('btn_pause', 'Pause') : getText('btn_activate', 'Activate')}</button>` : ''}
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
      showToast(data.isActive ? getText('link_activated', 'Link activated') : getText('link_disabled', 'Link disabled'));
      loadUserData();
    }
  } catch (e) {
    showToast(getText('error_toggle_link', 'Error toggling link status'));
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
      showToast(getText('ad_status_updated', 'Ad status updated'));
      loadUserData();
    }
  } catch (e) {
    showToast(getText('error_toggle_ad', 'Error toggling ad status'));
  }
}

async function createAdCampaign() {
  const title = document.getElementById('ad-title')?.value;
  const targetUrl = document.getElementById('ad-target-url')?.value;
  const totalBudget = document.getElementById('ad-budget')?.value;

  if (!title || !targetUrl || !totalBudget) return showToast(getText('fill_all_fields', 'Please fill in all ad details'));

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
      showToast(getText('ad_created_success', 'Ad campaign launched successfully!'));
      if (document.getElementById('ad-title')) document.getElementById('ad-title').value = '';
      if (document.getElementById('ad-target-url')) document.getElementById('ad-target-url').value = '';
      if (document.getElementById('ad-budget')) document.getElementById('ad-budget').value = '';
      loadUserData();
    }
  } catch (e) {
    showToast(getText('error_launch_ad', 'Unexpected error launching campaign'));
  } finally {
    setButtonLoading('btn-create-ad', false, `<span data-i18n="btn_launch_ad">${getText('btn_launch_ad', 'Launch Ad Campaign')}</span>`);
  }
}

async function requestDeposit() {
  const amountInput = document.getElementById('deposit-amount');
  const networkInput = document.getElementById('deposit-network');
  const txHashInput = document.getElementById('deposit-txhash');

  const amount = parseFloat(amountInput?.value);
  const network = networkInput?.value?.trim();
  const txid = txHashInput?.value?.trim();

  if (!network) {
    return showToast(getText('select_network_first', 'Select deposit network first'));
  }
  if (!amount || isNaN(amount) || amount <= 0) {
    return showToast(getText('invalid_deposit_amount', 'Enter a valid deposit amount'));
  }
  if (!txid || txid.length < 8) {
    return showToast(getText('invalid_txid', 'Enter valid TxID hash'));
  }

  triggerHaptic('medium');
  setButtonLoading('btn-request-deposit', true);

  try {
    const res = await safeFetch('/api/deposit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount,
        network,
        paymentMethod: network,
        txid,
        txHash: txid,
        details: `Network: ${network}, TxID: ${txid}`
      })
    });

    if (!res) return;
    const data = await res.json();

    if (data.error || data.message && res.status >= 400) {
      showToast(data.error || data.message || getText('deposit_failed', 'Deposit request failed'));
    } else {
      showToast(getText('deposit_submitted', 'Deposit request submitted successfully!'));
      if (amountInput) amountInput.value = '';
      if (txHashInput) txHashInput.value = '';
      if (networkInput) networkInput.value = '';
      handleNetworkChange('');
      loadUserData();
    }
  } catch (e) {
    console.error("Deposit Error:", e);
    showToast(getText('error_submitting_deposit', 'Error submitting deposit request'));
  } finally {
    setButtonLoading('btn-request-deposit', false, `<span>${getText('submit_deposit', 'Submit Deposit Request')}</span>`);
  }
}

async function requestWithdrawal() {
  const amountInput = document.getElementById('withdraw-amount');
  const networkInput = document.getElementById('withdraw-network');
  const walletInput = document.getElementById('withdraw-wallet') || document.getElementById('default-wallet');

  const amount = parseFloat(amountInput?.value);
  const network = networkInput?.value?.trim() || 'TRC20';
  const walletAddress = walletInput?.value?.trim();

  if (!walletAddress) {
    return showToast(getText('enter_wallet_first', 'Please enter a wallet address first'));
  }
  if (!amount || isNaN(amount) || amount < 30) {
    return showToast(getText('min_withdraw_30', 'Minimum withdrawal is $30'));
  }

  triggerHaptic('medium');
  setButtonLoading('btn-request-withdraw', true);

  try {
    const res = await safeFetch('/api/withdraw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount,
        network,
        walletAddress,
        details: `Network: ${network}, Wallet: ${walletAddress}`
      })
    });

    if (!res) return;
    const data = await res.json();

    if (data.error || data.message && res.status >= 400) {
      showToast(data.error || data.message || getText('withdraw_failed', 'Withdrawal request failed'));
    } else {
      showToast(getText('withdraw_submitted', 'Withdrawal requested successfully!'));
      if (amountInput) amountInput.value = '';
      const feeBox = document.getElementById('withdraw-fee-box');
      if (feeBox) feeBox.classList.add('hidden');
      loadUserData();
    }
  } catch (e) {
    console.error("Withdraw Error:", e);
    showToast(getText('error_withdraw_request', 'Error processing request'));
  } finally {
    setButtonLoading('btn-request-withdraw', false, `<span data-i18n="btn_submit_withdraw">${getText('btn_submit_withdraw', 'Request Withdrawal')}</span>`);
  }
}

async function initBridge() {
  navigateToShortenerSection();

  const pathParts = window.location.pathname.split('/r/');
  const shortCode = pathParts[1];
  bridgeStartTime = Date.now();

  const goBtn = document.getElementById('go-btn');
  if (goBtn) goBtn.disabled = true;

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
      if (goBtn) goBtn.disabled = false;
    }
  }, 1000);
}

function renderInternalAd(adData) {
  const adContainer = document.getElementById('ad-container');
  if (!adContainer) return;
  adContainer.innerHTML = `
    <div style="background: rgba(59, 130, 246, 0.1); border: 1px solid var(--accent); border-radius: 10px; padding: 16px; width: 100%; text-align: center;">
      <span style="font-size: 10px; color: var(--accent); background: rgba(59,130,246,0.2); padding: 2px 6px; border-radius: 4px;">Sponsored Ad</span>
      <h3 style="margin: 8px 0; font-size: 16px; color: var(--text);">${escapeHTML(adData.title)}</h3>
      <a href="${escapeHTML(adData.targetUrl)}" target="_blank" rel="noopener noreferrer" style="display: inline-block; margin-top: 6px; padding: 8px 16px; background: var(--accent); color: #fff; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 12px;">Visit Ad ↗</a>
    </div>
  `;
}

function renderFallbackAd() {
  const adContainer = document.getElementById('ad-container');
  if (!adContainer) return;
  adContainer.innerHTML = `<iframe src="https://adsterra.com/preview" width="100%" height="220" frameborder="0"></iframe>`;
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
      setButtonLoading('go-btn', false, `<span data-i18n="go_button">${getText('go_button', 'Continue')}</span>`);
      showToast(data.error || getText('redirect_error', 'Redirection error'));
    }
  } catch (err) {
    setButtonLoading('go-btn', false, `<span data-i18n="go_button">${getText('go_button', 'Continue')}</span>`);
    showToast(getText('server_conn_failed', 'Server connection failed'));
  }
}

async function handleShortenClick() {
  const title = document.getElementById('link-title')?.value;
  const targetUrl = document.getElementById('link-url')?.value;

  if (!targetUrl) {
    showToast(getText('enter_original_url', 'Please enter original URL'));
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
      showToast(getText('link_success_msg', 'Link created successfully!'));
      if (document.getElementById('link-title')) document.getElementById('link-title').value = '';
      if (document.getElementById('link-url')) document.getElementById('link-url').value = '';
      loadUserData();
    }
  } catch (e) {
    showToast(getText('unexpected_error', 'An unexpected error occurred'));
  } finally {
    setButtonLoading('btn-create-link', false, `<span data-i18n="btn_shorten">${getText('btn_shorten', 'Shorten Link Now')}</span>`);
  }
}

async function saveSettings() {
  const defaultWallet = document.getElementById('default-wallet')?.value;
  if (!defaultWallet || defaultWallet.trim().length < 5) {
    return showToast(getText('invalid_wallet', 'Invalid wallet address'));
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
      showToast(getText('wallet_saved', 'Wallet saved successfully'));
      loadUserData();
    }
  } catch (e) {
    showToast(getText('error_saving_settings', 'Error saving settings'));
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
  if (!isUserAdmin) return;
  try {
    const res = await safeFetch('/api/admin/dashboard-data');
    if (!res) return;
    const data = await res.json();
    if (data.error) return showToast(data.error);

    const totalUsers = document.getElementById('admin-total-users');
    const totalPending = document.getElementById('admin-total-pending');

    if (totalUsers) totalUsers.innerText = data.stats?.totalUsers || 0;
    if (totalPending) totalPending.innerText = `$${(data.stats?.totalPending || 0).toFixed(2)}`;

    const dList = document.getElementById('admin-deposits-list');
    if (dList) {
      if (!data.deposits || data.deposits.length === 0) dList.innerHTML = 'No pending deposit requests.';
      else {
        dList.innerHTML = data.deposits.map(d => `
          <div style="background:#0d1527; padding:8px; margin-bottom:6px; border-radius:6px; border: 1px solid var(--border-color);">
            User: <b>${escapeHTML(d.advertiserId?.username || d.advertiserId?.telegramId || 'Unknown')}</b><br>
            Amount: <b style="color:var(--success);">$${parseFloat(d.amount || 0).toFixed(2)}</b> | Network: <code>${escapeHTML(d.paymentMethod || d.network)}</code><br>
            TxID: <code style="color: var(--warning); word-break: break-all;">${escapeHTML(d.txHash || d.txid || 'N/A')}</code><br>
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
            Wallet: <code>${escapeHTML(w.walletAddress || w.details)}</code><br>
            <div style="margin-top: 6px; display: flex; gap: 4px;">
              <button class="btn-small btn-success" onclick="handleAdminWithdraw('${w._id}', 'Completed')">Approve</button>
              <button class="btn-small btn-danger" onclick="handleAdminWithdraw('${w._id}', 'Rejected')">Reject</button>
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
  triggerHaptic('medium');
  try {
    const res = await safeFetch('/api/admin/deposit/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ depositId, action })
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
  let rejectReason = '';
  if (action === 'Rejected') {
    rejectReason = prompt("Rejection reason (shown to user):");
    if (rejectReason === null) return;
  }

  triggerHaptic('medium');
  try {
    const res = await safeFetch('/api/admin/withdraw/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ withdrawId, action, rejectReason })
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

async function distributeRevenue() {
  const totalRevenue = document.getElementById('revenue-amount')?.value;
  if (!totalRevenue || totalRevenue <= 0) return showToast("Enter a valid amount");

  triggerHaptic('medium');
  setButtonLoading('btn-distribute-rev', true);

  try {
    const res = await safeFetch('/api/admin/distribute-revenue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ totalRevenue })
    });
    if (!res) return;
    const data = await res.json();
    if (data.error) showToast(data.error);
    else {
      showToast(data.message || "Revenue distributed successfully");
      if (document.getElementById('revenue-amount')) document.getElementById('revenue-amount').value = '';
    }
  } catch (e) {
    showToast("Error distributing revenue");
  } finally {
    setButtonLoading('btn-distribute-rev', false, 'Distribute Revenue to Links');
  }
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
  
  if (typeof initI18n === 'function') {
    await initI18n();
  }
  
  renderTelegramUser();

  if (window.location.pathname.startsWith('/r/')) {
    const bridgeView = document.getElementById('bridge-view');
    if (bridgeView) bridgeView.classList.remove('hidden');
    initBridge();
  } else {
    const appView = document.getElementById('app-view');
    if (appView) appView.classList.remove('hidden');
    initializeApp();
  }
});
