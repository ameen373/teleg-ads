/**
 * Telegram Mini App Core Engine (Production Ready)
 * Architecture: ES6+, Async/Await, Modular State, Safe Injection Engine
 * Crypto Support: TRC20 & BEP20 Only
 */

(() => {
  'use strict';

  // --- APP STATE & CONFIGURATION ---
  const API_BASE = window.location.protocol.startsWith('file') 
    ? 'http://localhost:3000' 
    : window.location.origin;

  const state = {
    authToken: localStorage.getItem('authToken') || null,
    currentSessionId: null,
    bridgeStartTime: Date.now(),
    isUserAdmin: false,
    currentLang: localStorage.getItem('appLang') || 'en',
    i18n: {},
    isSubmitting: false,
    telegramUser: null
  };

  const tg = window.Telegram?.WebApp;

  // --- DOM ELEMENTS CACHE ---
  const $ = (id) => document.getElementById(id);

  // --- HELPER FUNCTIONS & UTILS ---
  function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function triggerHaptic(style = 'light') {
    try {
      if (tg?.isVersionAtLeast?.('6.1') && tg?.HapticFeedback) {
        tg.HapticFeedback.impactOccurred(style);
      }
    } catch (e) {
      // Graceful fallback for non-supported environments
    }
  }

  function showToast(msg) {
    triggerHaptic('medium');
    const toast = $('toast');
    if (!toast) return;
    toast.innerText = msg;
    toast.classList.add('show');
    setTimeout(() => { toast.classList.remove('show'); }, 3000);
  }

  function copyToClipboard(text) {
    if (!text) return;
    navigator.clipboard.writeText(text)
      .then(() => showToast(t('copied', 'Copied successfully!')))
      .catch(() => showToast(t('copy_failed', 'Failed to copy')));
  }

  function setButtonLoading(btnId, isLoading, originalText) {
    const btn = $(btnId);
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

  // --- INTERNATIONALIZATION (i18n) ENGINE ---
  async function loadTranslations(lang) {
    if (state.i18n[lang]) return;
    try {
      // تعديل مسار الترجمة ليعتمد على Root المسار بالسيرفر أو بروتوكول الملف المحلي
      const targetPath = window.location.protocol.startsWith('file:')
        ? `./${lang}.json`
        : `/${lang}.json`;

      const res = await fetch(targetPath);
      if (res.ok) {
        state.i18n[lang] = await res.json();
      } else {
        console.error(`Failed to load translation file: ${lang}.json`);
      }
    } catch (err) {
      console.error(`Error loading language ${lang}:`, err);
    }
  }

  function t(key, fallback = '') {
    return state.i18n[state.currentLang]?.[key] || fallback || key;
  }

  async function changeAppLanguage(lang) {
    state.currentLang = (lang === 'ar' || lang === 'en') ? lang : 'en';
    localStorage.setItem('appLang', state.currentLang);

    await loadTranslations(state.currentLang);
    applyLanguage(state.currentLang);

    if ($('app-view') && !$('app-view').classList.contains('hidden')) {
      loadUserData();
    }
  }

  function applyLanguage(lang) {
    const activeLang = (lang === 'ar' || lang === 'en') ? lang : 'en';
    document.documentElement.lang = activeLang;
    document.documentElement.dir = activeLang === 'ar' ? 'rtl' : 'ltr';
    document.body.style.direction = activeLang === 'ar' ? 'rtl' : 'ltr';

    const langSelect = $('language-select');
    if (langSelect) langSelect.value = activeLang;

    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (state.i18n[activeLang]?.[key]) {
        el.innerHTML = state.i18n[activeLang][key];
      }
    });

    document.querySelectorAll('[data-i18n-ph]').forEach(el => {
      const key = el.getAttribute('data-i18n-ph');
      if (state.i18n[activeLang]?.[key]) {
        el.placeholder = state.i18n[activeLang][key];
      }
    });
  }

  // --- SECURE API CLIENT ---
  async function safeFetch(endpoint, options = {}) {
    options.headers = options.headers || {};
    if (state.authToken) {
      options.headers['Authorization'] = `Bearer ${state.authToken}`;
    }

    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const targetUrl = endpoint.startsWith('http') ? endpoint : `${API_BASE}${cleanEndpoint}`;

    try {
      let response = await fetch(targetUrl, options);
      if (response.status === 401) {
        const reAuth = await authLogin();
        if (reAuth) {
          options.headers['Authorization'] = `Bearer ${state.authToken}`;
          response = await fetch(targetUrl, options);
        }
      }
      return response;
    } catch (err) {
      console.error('Fetch Network Error:', err);
      showToast(t('network_error', 'Network connection error. Please check your connection.'));
      return null;
    }
  }

  // --- AUTHENTICATION & INITIALIZATION ---
  async function authLogin() {
    const startParam = tg?.initDataUnsafe?.start_param || null;
    try {
      const res = await safeFetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(tg?.initData ? { 'x-telegram-init-data': tg.initData } : { 'x-demo-user-id': 'DEMO_USER_DEV' })
        },
        body: JSON.stringify({ referrerId: startParam, telegramUserInfo: tg?.initDataUnsafe?.user || {} })
      });

      if (!res) return false;
      const data = await res.json();
      if (data && data.token) {
        state.authToken = data.token;
        localStorage.setItem('authToken', state.authToken);
        state.isUserAdmin = !!data.isAdmin;
        return true;
      }
    } catch (e) {
      console.error('Auth error:', e);
      showToast(t('auth_failed', 'Authentication failed'));
    }
    return false;
  }

  async function renderTelegramUser() {
    const u = tg?.initDataUnsafe?.user;
    state.telegramUser = u;

    const avatarContainer = $('user-avatar-container');
    const nameElem = $('user-display-name');
    const handleElem = $('user-display-handle');
    const idElem = $('user-tg-id');
    const premiumBadge = $('user-premium-badge');

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
      if (savedLang) {
        state.currentLang = savedLang;
      } else if (u.language_code && (u.language_code === 'ar' || u.language_code === 'en')) {
        state.currentLang = u.language_code;
      }
    } else {
      if (nameElem) nameElem.innerText = 'Demo User';
      if (handleElem) handleElem.innerText = '@demo_user';
      if (idElem) idElem.innerText = 'ID: 000000000';
      if (avatarContainer) {
        avatarContainer.innerHTML = `<div class="user-avatar-placeholder">D</div>`;
      }
    }

    await changeAppLanguage(state.currentLang);
  }

  async function initializeApp() {
    try {
      if (!state.authToken) await authLogin();
      await loadUserData();
    } catch (err) {
      console.error('App init error:', err);
    }
  }

  // --- USER DATA & DASHBOARD RENDERER ---
  async function loadUserData() {
    try {
      const res = await safeFetch('/api/user/data');
      if (!res) return;
      const data = await res.json();
      if (!data || !data.user) return;

      state.isUserAdmin = !!data.isAdmin;
      const adminTabBtn = $('tab-btn-admin');
      if (adminTabBtn) adminTabBtn.classList.toggle('hidden', !state.isUserAdmin);

      if ($('pending-bal')) $('pending-bal').innerText = `$${(data.user.pendingBalance || 0).toFixed(2)}`;
      if ($('avail-bal')) $('avail-bal').innerText = `$${(data.user.availableBalance || 0).toFixed(2)}`;
      if ($('ref-earnings')) $('ref-earnings').innerText = `$${(data.user.referralEarnings || 0).toFixed(2)}`;
      
      const defaultWalletInput = $('default-wallet');
      if (defaultWalletInput) {
        defaultWalletInput.value = data.user.defaultWallet || '';
        defaultWalletInput.setAttribute('readonly', 'readonly');
      }

      const editWalletBtn = $('edit-wallet-btn');
      if (editWalletBtn) {
        editWalletBtn.innerText = t('btn_edit', 'Edit');
        editWalletBtn.className = 'btn-small btn-warning';
      }
      
      const saveWalletBtn = $('save-wallet-btn');
      if (saveWalletBtn) saveWalletBtn.classList.add('hidden');

      const botUsername = tg?.initDataUnsafe?.bot?.username || 'Ads_telegabot';
      if ($('ref-link')) {
        $('ref-link').value = `https://t.me/${botUsername}?start=${data.user._id}`;
      }

      // Announcements Rendering
      if (data.announcements && data.announcements.length > 0) {
        const ancBox = $('announcement-box');
        if (ancBox) {
          ancBox.classList.remove('hidden');
          if ($('anc-title')) $('anc-title').innerText = data.announcements[0].title;
          if ($('anc-content')) $('anc-content').innerText = data.announcements[0].content;
        }
      }

      // Withdrawals Render
      renderWithdrawalsList(data.withdraws || []);

      // Short Links Render
      renderLinksList(data.links || []);

      // Ad Campaigns Render
      renderAdsList(data.ads || []);

    } catch (err) {
      console.error('Error loading user data:', err);
    }
  }

  function renderWithdrawalsList(withdraws) {
    const container = $('withdraws-list');
    if (!container) return;

    if (withdraws.length === 0) {
      container.innerHTML = `<div class="empty-msg">${t('no_withdraw_history', 'No withdrawal history.')}</div>`;
      return;
    }

    container.innerHTML = withdraws.map(w => {
      let statusColor = 'var(--warning)';
      let statusText = t('status_pending', 'Pending');
      if (w.status === 'Completed') {
        statusColor = 'var(--success)';
        statusText = t('status_completed', 'Completed');
      } else if (w.status === 'Rejected') {
        statusColor = 'var(--danger)';
        statusText = t('status_rejected', 'Rejected');
      }

      return `
      <div style="background: #0d1527; padding: 10px; margin-bottom: 8px; border-radius: 8px; border: 1px solid var(--border-color);">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span>${t('calc_amount', 'Amount:')} <b>$${parseFloat(w.amount || 0).toFixed(2)}</b></span>
          <span style="color: ${statusColor}; font-weight: bold; font-size: 12px;">${statusText}</span>
        </div>
        <div style="color: var(--text-muted); font-size: 11px; margin-top: 4px; word-break: break-all;">${t('wallet_lbl', 'Wallet:')} <code>${escapeHTML(w.walletAddress)}</code></div>
        ${w.rejectReason ? `<div style="color: var(--danger); font-size: 11px; margin-top: 4px;">${t('reason_lbl', 'Reason:')} ${escapeHTML(w.rejectReason)}</div>` : ''}
      </div>`;
    }).join('');
  }

  function renderLinksList(links) {
    const container = $('links-list');
    if (!container) return;

    if (links.length === 0) {
      container.innerHTML = `<div class="empty-msg">${t('no_links', 'No short links created yet.')}</div>`;
      return;
    }

    container.innerHTML = links.map(l => {
      const shortUrl = `${API_BASE}/r/${l.shortCode}`;
      const statusColor = l.isActive ? 'var(--success)' : 'var(--danger)';
      const statusText = l.isActive ? t('status_active', 'Active') : t('status_disabled', 'Disabled');

      return `
      <div class="link-item" style="border-left: 4px solid ${statusColor};">
        <div class="link-header" style="display: flex; justify-content: space-between; align-items: center;">
          <b>${escapeHTML(l.title || t('untitled_link', 'Untitled Link'))}</b>
          <span style="font-size: 11px; color: ${statusColor}; font-weight: bold;">${statusText}</span>
        </div>
        <div style="color:var(--text-muted); font-size:11px; margin: 4px 0; word-break: break-all;">${escapeHTML(shortUrl)}</div>
        <div style="font-size: 12px;">${t('views_label', 'Views:')} <b>${l.views || 0}</b> | ${t('valid_label', 'Valid:')} <b style="color:var(--success);">${l.validImpressions || 0}</b></div>
        <div class="link-actions" style="margin-top: 8px; display: flex; gap: 6px;">
          <button class="btn-small" onclick="window.app.copyToClipboard('${escapeHTML(shortUrl)}')">${t('copy', 'Copy')}</button>
          <button class="btn-small ${l.isActive ? 'btn-danger' : 'btn-warning'}" onclick="window.app.toggleLinkStatus('${l._id}')">${l.isActive ? t('btn_disable', 'Disable') : t('btn_enable', 'Enable')}</button>
        </div>
      </div>`;
    }).join('');
  }

  function renderAdsList(ads) {
    const container = $('ads-list');
    if (!container) return;

    if (ads.length === 0) {
      container.innerHTML = `<div class="empty-msg">${t('no_ads', 'No active ad campaigns.')}</div>`;
      return;
    }

    container.innerHTML = ads.map(ad => {
      const statusColor = ad.status === 'active' ? 'var(--success)' : (ad.status === 'paused' ? 'var(--warning)' : 'var(--text-muted)');
      return `
      <div class="ad-item" style="border-left: 4px solid ${statusColor};">
        <div class="ad-header" style="display: flex; justify-content: space-between;">
          <b>${escapeHTML(ad.title)}</b>
          <span style="font-size: 11px; color: ${statusColor}; font-weight: bold;">${escapeHTML((ad.status || '').toUpperCase())}</span>
        </div>
        <div style="color:var(--text-muted); font-size:11px; margin: 4px 0; word-break: break-all;">${escapeHTML(ad.targetUrl)}</div>
        <div style="font-size: 12px;">${t('rem_budget_lbl', 'Remaining Budget:')} <b style="color:var(--success);">$${(ad.remainingBudget || 0).toFixed(2)}</b> / $${parseFloat(ad.totalBudget || 0).toFixed(2)} | ${t('views_label', 'Views:')} <b>${ad.impressionsCount || 0}</b></div>
        <div class="ad-actions" style="margin-top: 8px;">
          ${ad.status !== 'completed' ? `<button class="btn-small ${ad.status === 'active' ? 'btn-warning' : 'btn-success'}" onclick="window.app.toggleAdStatus('${ad._id}')">${ad.status === 'active' ? t('btn_pause', 'Pause') : t('btn_activate', 'Activate')}</button>` : ''}
        </div>
      </div>`;
    }).join('');
  }

  // --- USER UI ACTIONS & NETWORK HANDLING ---
  function handleNetworkChange(networkVal) {
    triggerHaptic('light');
    const trcCard = $('card-addr-trc20');
    const bepCard = $('card-addr-bep20');

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
    const navDeposit = $('wallet-nav-deposit');
    const navWithdraw = $('wallet-nav-withdraw');
    const viewDeposit = $('wallet-view-deposit');
    const viewWithdraw = $('wallet-view-withdraw');

    if (navDeposit) navDeposit.classList.toggle('active', view === 'deposit');
    if (navWithdraw) navWithdraw.classList.toggle('active', view === 'withdraw');
    if (viewDeposit) viewDeposit.classList.toggle('hidden', view !== 'deposit');
    if (viewWithdraw) viewWithdraw.classList.toggle('hidden', view !== 'withdraw');
  }

  function toggleInstructionsModal(show) {
    triggerHaptic('medium');
    const modal = $('instructions-modal');
    if (modal) modal.classList.toggle('hidden', !show);
  }

  function updateWithdrawCalculations() {
    const amtInput = $('withdraw-amount');
    const feeBox = $('withdraw-fee-box');
    if (!amtInput || !feeBox) return;

    const val = parseFloat(amtInput.value) || 0;

    if (val > 0) {
      feeBox.classList.remove('hidden');
      const fee = val * 0.10;
      const net = val - fee;

      if ($('calc-req')) $('calc-req').innerText = `$${val.toFixed(2)}`;
      if ($('calc-fee')) $('calc-fee').innerText = `$${fee.toFixed(2)}`;
      if ($('calc-net')) $('calc-net').innerText = `$${net.toFixed(2)}`;
    } else {
      feeBox.classList.add('hidden');
    }
  }

  function shareReferralLink() {
    const refUrlInput = $('ref-link');
    if (!refUrlInput || !refUrlInput.value) return;
    triggerHaptic('medium');
    
    const shareText = encodeURIComponent(t('share_ref_text', 'Join me on the best URL shortener platform & earn money! 🚀'));
    const url = `https://t.me/share/url?url=${encodeURIComponent(refUrlInput.value)}&text=${shareText}`;

    if (tg?.openTelegramLink) {
      tg.openTelegramLink(url);
    } else {
      window.open(url, '_blank');
    }
  }

  function toggleWalletEdit() {
    triggerHaptic('light');
    const walletInput = $('default-wallet');
    const editBtn = $('edit-wallet-btn');
    const saveBtn = $('save-wallet-btn');

    if (!walletInput || !editBtn || !saveBtn) return;

    if (walletInput.hasAttribute('readonly')) {
      walletInput.removeAttribute('readonly');
      walletInput.focus();
      editBtn.innerText = t('cancel', 'Cancel');
      editBtn.className = 'btn-small btn-danger';
      saveBtn.classList.remove('hidden');
    } else {
      walletInput.setAttribute('readonly', 'readonly');
      editBtn.innerText = t('btn_edit', 'Edit');
      editBtn.className = 'btn-small btn-warning';
      saveBtn.classList.add('hidden');
    }
  }

  // --- API MUTATION LOGIC ---
  async function handleShortenClick() {
    const title = $('link-title')?.value || '';
    const targetUrl = $('link-url')?.value || '';

    if (!targetUrl) return showToast(t('enter_orig_url', 'Please enter original URL'));

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
        showToast(t('link_success_msg', 'Link created successfully!'));
        if ($('link-title')) $('link-title').value = '';
        if ($('link-url')) $('link-url').value = '';
        loadUserData();
      }
    } catch (e) {
      showToast(t('unexpected_err', 'An unexpected error occurred'));
    } finally {
      setButtonLoading('btn-create-link', false, `<span data-i18n="btn_shorten">${t('btn_shorten', 'Shorten Link Now')}</span>`);
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
        showToast(data.isActive ? t('link_act_msg', 'Link activated') : t('link_dis_msg', 'Link disabled'));
        loadUserData();
      }
    } catch (e) {
      showToast(t('link_toggle_err', 'Error toggling link status'));
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
        showToast(t('ad_status_updated', 'Ad status updated'));
        loadUserData();
      }
    } catch (e) {
      showToast(t('ad_toggle_err', 'Error toggling ad status'));
    }
  }

  async function createAdCampaign() {
    const title = $('ad-title')?.value || '';
    const targetUrl = $('ad-target-url')?.value || '';
    const totalBudget = $('ad-budget')?.value || '';

    if (!title || !targetUrl || !totalBudget) return showToast(t('fill_ad_details', 'Please fill in all ad details'));

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
        showToast(t('ad_launch_success', 'Ad campaign launched successfully!'));
        if ($('ad-title')) $('ad-title').value = '';
        if ($('ad-target-url')) $('ad-target-url').value = '';
        if ($('ad-budget')) $('ad-budget').value = '';
        loadUserData();
      }
    } catch (e) {
      showToast(t('ad_launch_err', 'Unexpected error launching campaign'));
    } finally {
      setButtonLoading('btn-create-ad', false, `<span data-i18n="btn_launch_ad">${t('btn_launch_ad', 'Launch Ad Campaign')}</span>`);
    }
  }

  async function requestDeposit() {
    const amount = $('deposit-amount')?.value || '';
    const paymentMethod = $('deposit-network')?.value || '';
    const txHash = $('deposit-txhash')?.value || '';

    if (!paymentMethod) return showToast(t('select_net_err', 'Select deposit network first'));
    if (!amount || parseFloat(amount) <= 0) return showToast(t('enter_valid_dep', 'Enter a valid deposit amount'));
    if (!txHash || txHash.trim().length < 8) return showToast(t('enter_valid_txid', 'Enter valid TxID'));

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
        showToast(t('deposit_success', 'Deposit request submitted!'));
        if ($('deposit-amount')) $('deposit-amount').value = '';
        if ($('deposit-txhash')) $('deposit-txhash').value = '';
        if ($('deposit-network')) $('deposit-network').value = '';
        handleNetworkChange('');
        loadUserData();
      }
    } catch (e) {
      showToast(t('deposit_err', 'Error submitting deposit request'));
    } finally {
      setButtonLoading('btn-request-deposit', false, `<span data-i18n="btn_submit_deposit">${t('btn_submit_deposit', 'Submit Deposit Request')}</span>`);
    }
  }

  async function requestWithdrawal() {
    const amount = parseFloat($('withdraw-amount')?.value || 0);
    const walletAddress = $('default-wallet')?.value || '';

    if (!walletAddress) return showToast(t('enter_wallet_first', 'Please enter a wallet address first'));
    if (!amount || amount < 30) return showToast(t('min_withdraw_err', 'Minimum withdrawal is $30'));

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
        showToast(t('withdraw_success', 'Withdrawal requested successfully!'));
        if ($('withdraw-amount')) $('withdraw-amount').value = '';
        if ($('withdraw-fee-box')) $('withdraw-fee-box').classList.add('hidden');
        loadUserData();
      }
    } catch (e) {
      showToast(t('withdraw_proc_err', 'Error processing request'));
    } finally {
      setButtonLoading('btn-request-withdraw', false, `<span data-i18n="btn_submit_withdraw">${t('btn_submit_withdraw', 'Request Withdrawal')}</span>`);
    }
  }

  async function saveSettings() {
    const defaultWallet = $('default-wallet')?.value || '';
    if (!defaultWallet || defaultWallet.trim().length < 5) {
      return showToast(t('invalid_wallet_err', 'Invalid wallet address'));
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
        showToast(t('wallet_saved', 'Wallet saved successfully'));
        loadUserData();
      }
    } catch (e) {
      showToast(t('wallet_save_err', 'Error saving settings'));
    }
  }

  // --- BRIDGE VIEW & ADSTERRA INTERACTION ---
  async function initBridge() {
    const pathParts = window.location.pathname.split('/r/');
    const shortCode = pathParts[1];
    state.bridgeStartTime = Date.now();

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
          state.currentSessionId = data.sessionId;

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
    const timerElem = $('timer');
    const interval = setInterval(() => {
      timeLeft--;
      if (timerElem) timerElem.innerText = timeLeft;
      if (timeLeft <= 0) {
        clearInterval(interval);
        const goBtn = $('go-btn');
        if (goBtn) goBtn.disabled = false;
      }
    }, 1000);
  }

  function renderInternalAd(adData) {
    const container = $('ad-container');
    if (!container) return;
    container.innerHTML = `
      <div style="background: rgba(59, 130, 246, 0.1); border: 1px solid var(--accent); border-radius: 10px; padding: 16px; width: 100%; text-align: center;">
        <span style="font-size: 10px; color: var(--accent); background: rgba(59,130,246,0.2); padding: 2px 6px; border-radius: 4px;">${t('sponsored_ad', 'Sponsored Ad')}</span>
        <h3 style="margin: 8px 0; font-size: 16px; color: var(--text);">${escapeHTML(adData.title)}</h3>
        <a href="${escapeHTML(adData.targetUrl)}" target="_blank" rel="noopener noreferrer" style="display: inline-block; margin-top: 6px; padding: 8px 16px; background: var(--accent); color: #fff; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 12px;">${t('visit_ad', 'Visit Ad ↗')}</a>
      </div>
    `;
  }

  function renderFallbackAd() {
    const container = $('ad-container');
    if (container) {
      container.innerHTML = `<iframe src="https://adsterra.com/preview" width="100%" height="220" frameborder="0"></iframe>`;
    }
  }

  async function completeImpression() {
    triggerHaptic('medium');
    setButtonLoading('go-btn', true);
    const shortCode = window.location.pathname.split('/r/')[1];
    const duration = Math.floor((Date.now() - state.bridgeStartTime) / 1000);

    try {
      const res = await safeFetch('/api/impression', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ linkCode: shortCode, sessionId: state.currentSessionId, duration })
      });
      if (!res) return;
      const data = await res.json();
      if (data.targetUrl) {
        window.location.href = data.targetUrl;
      } else {
        setButtonLoading('go-btn', false, `<span data-i18n="go_button">${t('go_button', 'Continue to Destination')}</span>`);
        showToast(data.error || t('redirect_err', 'Redirection error'));
      }
    } catch (err) {
      setButtonLoading('go-btn', false, `<span data-i18n="go_button">${t('go_button', 'Continue to Destination')}</span>`);
      showToast(t('server_conn_err', 'Server connection failed'));
    }
  }

  // --- NAVIGATION TAB SWITCHER ---
  function switchTab(tabId) {
    if (tabId === 'admin' && !state.isUserAdmin) return;
    triggerHaptic('light');

    document.querySelectorAll('.tg-nav-dock button').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('#app-view > div[id^="tab-content-"]').forEach(c => c.classList.add('hidden'));

    const targetBtn = $(`tab-btn-${tabId}`);
    if (targetBtn) targetBtn.classList.add('active');

    const tabContent = $(`tab-content-${tabId}`);
    if (tabContent) tabContent.classList.remove('hidden');

    if (tabId === 'admin') {
      loadAdminData();
    }
  }

  // تصدير الدالة للنطاق العام بشكل مباشر لمنع ReferenceError من الـ HTML
  window.switchTab = switchTab;

  // --- ADMIN PANEL LOGIC ---
  async function loadAdminData() {
    try {
      const res = await safeFetch('/api/admin/dashboard-data');
      if (!res) return;
      const data = await res.json();
      if (data.error) return showToast(data.error);

      if ($('admin-total-users')) $('admin-total-users').innerText = data.stats?.totalUsers || 0;
      if ($('admin-total-pending')) $('admin-total-pending').innerText = `$${(data.stats?.totalPending || 0).toFixed(2)}`;

      const dList = $('admin-deposits-list');
      if (dList) {
        if (!data.deposits || data.deposits.length === 0) {
          dList.innerHTML = `<div class="empty-msg">${t('no_pending_deposits', 'No pending deposit requests.')}</div>`;
        } else {
          dList.innerHTML = data.deposits.map(d => `
            <div style="background:#0d1527; padding:8px; margin-bottom:6px; border-radius:6px; border: 1px solid var(--border-color);">
              ${t('user_lbl', 'User:')} <b>${escapeHTML(d.advertiserId?.username || d.advertiserId?.telegramId || t('unknown_user', 'Unknown'))}</b><br>
              ${t('amount_lbl', 'Amount:')} <b style="color:var(--success);">$${parseFloat(d.amount || 0).toFixed(2)}</b> | ${t('network_lbl', 'Network:')} <code>${escapeHTML(d.paymentMethod)}</code><br>
              ${t('txid_lbl', 'TxID:')} <code style="color: var(--warning); word-break: break-all;">${escapeHTML(d.txHash || 'N/A')}</code><br>
              <div style="margin-top: 6px; display: flex; gap: 4px;">
                <button class="btn-small btn-success" onclick="window.app.handleAdminDeposit('${d._id}', 'Completed')">${t('btn_approve', 'Approve')}</button>
                <button class="btn-small btn-danger" onclick="window.app.handleAdminDeposit('${d._id}', 'Rejected')">${t('btn_reject', 'Reject')}</button>
              </div>
            </div>
          `).join('');
        }
      }

      const wList = $('admin-withdraws-list');
      if (wList) {
        if (!data.withdraws || data.withdraws.length === 0) {
          wList.innerHTML = `<div class="empty-msg">${t('no_pending_withdraws', 'No pending withdrawal requests.')}</div>`;
        } else {
          wList.innerHTML = data.withdraws.map(w => `
            <div style="background:#0d1527; padding:8px; margin-bottom:6px; border-radius:6px; border: 1px solid var(--border-color);">
              ${t('user_lbl', 'User:')} <b>${escapeHTML(w.userId?.username || w.userId?.telegramId || t('unknown_user', 'Unknown'))}</b><br>
              ${t('amount_lbl', 'Amount:')} <b style="color:var(--success);">$${parseFloat(w.amount || 0).toFixed(2)}</b><br>
              ${t('wallet_lbl', 'Wallet:')} <code>${escapeHTML(w.walletAddress)}</code><br>
              <div style="margin-top: 6px; display: flex; gap: 4px;">
                <button class="btn-small btn-success" onclick="window.app.handleAdminWithdraw('${w._id}', 'Completed')">${t('btn_approve', 'Approve')}</button>
                <button class="btn-small btn-danger" onclick="window.app.handleAdminWithdraw('${w._id}', 'Rejected')">${t('btn_reject', 'Reject')}</button>
              </div>
            </div>
          `).join('');
        }
      }

      const uList = $('admin-users-list');
      if (uList) {
        if (!data.users || data.users.length === 0) {
          uList.innerHTML = `<div class="empty-msg">${t('no_users_found', 'No users found.')}</div>`;
        } else {
          uList.innerHTML = data.users.map(u => `
            <div style="background:#0d1527; padding:8px; margin-bottom:6px; border-radius:6px; display: flex; justify-content: space-between; align-items: center; border-left: 3px solid ${u.isBanned ? 'var(--danger)' : 'var(--success)'};">
              <div>
                <b>${escapeHTML(u.username || t('unknown_user', 'Unknown'))}</b> (${escapeHTML(String(u.telegramId || ''))})<br>
                <span style="color: var(--text-muted);">${t('avail_bal', 'Available Balance')}: $${(u.availableBalance || 0).toFixed(2)}</span>
              </div>
              <button class="btn-small ${u.isBanned ? 'btn-warning' : 'btn-danger'}" onclick="window.app.toggleUserBan('${u._id}')">
                ${u.isBanned ? t('btn_unban', 'Unban') : t('btn_ban', 'Ban')}
              </button>
            </div>
          `).join('');
        }
      }
    } catch (e) {
      showToast(t('admin_data_err', 'Failed to load admin data'));
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
        showToast(t('dep_req_updated', 'Deposit request updated'));
        loadAdminData();
      }
    } catch (e) {
      showToast(t('dep_action_err', 'Deposit action failed'));
    }
  }

  async function handleAdminWithdraw(withdrawId, action) {
    let rejectReason = '';
    if (action === 'Rejected') {
      rejectReason = prompt(t('reject_prompt', 'Rejection reason (shown to user):'));
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
        showToast(t('with_req_updated', 'Withdrawal request updated'));
        loadAdminData();
      }
    } catch (e) {
      showToast(t('action_failed', 'Action failed'));
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
        showToast(data.isBanned ? t('user_banned', 'User banned') : t('user_unbanned', 'User unbanned'));
        loadAdminData();
      }
    } catch (e) {
      showToast(t('ban_state_err', 'Error changing ban state'));
    }
  }

  async function distributeRevenue() {
    const totalRevenue = $('revenue-amount')?.value;
    if (!totalRevenue || parseFloat(totalRevenue) <= 0) return showToast(t('enter_valid_amount', 'Enter a valid amount'));

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
        showToast(data.message || t('rev_dist_success', 'Revenue distributed successfully'));
        if ($('revenue-amount')) $('revenue-amount').value = '';
      }
    } catch (e) {
      showToast(t('rev_dist_err', 'Error distributing revenue'));
    } finally {
      setButtonLoading('btn-distribute-rev', false, `<span data-i18n="btn_distribute_rev">${t('btn_distribute_rev', 'Distribute Revenue to Links')}</span>`);
    }
  }

  // --- INITIALIZATION & EVENT LISTENERS ---
  window.addEventListener('DOMContentLoaded', async () => {
    try {
      if (tg) {
        tg.ready();
        tg.expand();
      }
    } catch (e) {
      console.warn('Telegram WebApp initialization warning:', e);
    }

    await renderTelegramUser();

    if (window.location.pathname.startsWith('/r/')) {
      const bridgeView = $('bridge-view');
      if (bridgeView) bridgeView.classList.remove('hidden');
      initBridge();
    } else {
      const appView = $('app-view');
      if (appView) appView.classList.remove('hidden');
      initializeApp();
    }
  });

  // --- PUBLIC GLOBAL NAMESPACE EXPOSE ---
  window.app = {
    copyToClipboard,
    changeAppLanguage,
    handleNetworkChange,
    switchWalletView,
    toggleInstructionsModal,
    updateWithdrawCalculations,
    shareReferralLink,
    toggleWalletEdit,
    handleShortenClick,
    toggleLinkStatus,
    toggleAdStatus,
    createAdCampaign,
    requestDeposit,
    requestWithdrawal,
    saveSettings,
    completeImpression,
    switchTab,
    handleAdminDeposit,
    handleAdminWithdraw,
    toggleUserBan,
    distributeRevenue
  };

})();
