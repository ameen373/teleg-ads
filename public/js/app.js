/**
 * TelegaApp - Main Application Script
 * Cleaned, consolidated, and production-ready.
 */

window.TelegaApp = window.TelegaApp || {};
window.App = window.TelegaApp; // Compatibility alias

// System Configuration & User State Defaults
window.TelegaApp.config = window.TelegaApp.config || {
  botUsername: 'AdTelega_bot'
};

window.TelegaApp.user = window.TelegaApp.user || {
  telegramId: '123456789',
  username: 'DemoUser',
  firstName: 'User'
};

/**
 * Main Application Entry Point
 */
document.addEventListener('DOMContentLoaded', async () => {
  // 1. Initialize Telegram WebApp SDK
  if (window.Telegram?.WebApp) {
    try {
      window.Telegram.WebApp.ready();
      window.Telegram.WebApp.expand();
    } catch (err) {
      console.warn('Telegram WebApp SDK initialisation warning:', err);
    }
  }

  // 2. Extract Telegram User Context
  const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
  if (tgUser) {
    window.TelegaApp.user.telegramId = String(tgUser.id);
    window.TelegaApp.user.username = tgUser.username || '';
    window.TelegaApp.user.firstName = tgUser.first_name || '';
  }

  const userLang = tgUser?.language_code || 'ar';

  // 3. Initialize Modules & i18n
  initI18n(userLang);
  initModules();

  // 4. Unified Authentication & User Synchronization
  await handleAuthentication();

  // 5. Handle Routing and Ad Link Flows
  handleRoutingAndShortener();

  // 6. Bind DOM UI Event Listeners
  bindEventListeners();
});

/* ==========================================================================
   Helper Functions & Module Bridge
   ========================================================================== */

/**
 * Helper to fetch a module safely across different namespace standards
 */
function getModule(name, fallbackGlobalName) {
  return window.TelegaApp?.[name] || window[fallbackGlobalName] || null;
}

/**
 * Initialize all app modules if available
 */
function initModules() {
  const ui = getModule('ui', 'UI');
  const shortener = getModule('shortener', 'ShortenerModule');
  const ads = getModule('ads', 'AdsModule');
  const wallet = getModule('wallet', 'WalletModule');
  const admin = getModule('admin', 'AdminModule');

  ui?.init?.();
  shortener?.init?.();
  ads?.init?.();
  wallet?.init?.();
  admin?.init?.();
}

/**
 * Handles API Authentication, Configuration loading, and Balance Syncing
 */
async function handleAuthentication() {
  const api = window.TelegaApp?.api || window.API;
  const urlParams = new URLSearchParams(window.location.search);
  const startParam = urlParams.get('start') || urlParams.get('shortId') || window.Telegram?.WebApp?.initDataUnsafe?.start_param || null;

  if (!api) return;

  try {
    // 1. Fetch System Config (if supported by API)
    if (typeof api.getConfig === 'function') {
      const configRes = await api.getConfig();
      if (configRes?.success) {
        updateConfigUI(configRes);
      }
    }

    // 2. Authenticate User
    let authRes = null;

    if (typeof api.request === 'function') {
      authRes = await api.request('/api/user/sync', 'POST', {
        startParam,
        telegramId: window.TelegaApp.user.telegramId,
        username: window.TelegaApp.user.username,
        firstName: window.TelegaApp.user.firstName
      });
    } else if (typeof api.authTelegram === 'function') {
      authRes = await api.authTelegram({
        telegramId: window.TelegaApp.user.telegramId,
        username: window.TelegaApp.user.username,
        firstName: window.TelegaApp.user.firstName
      });
    }

    // 3. Process Auth Response
    if (authRes?.success) {
      if (authRes.token && api.setToken) {
        api.setToken(authRes.token);
      }

      const user = authRes.user || {};
      const ui = getModule('ui', 'UI');
      const wallet = getModule('wallet', 'WalletModule');

      if (ui?.updateUserData) ui.updateUserData(user);

      const userNameEl = document.getElementById('userNameDisplay');
      if (userNameEl && (user.firstName || user.username)) {
        userNameEl.textContent = user.firstName || user.username;
      }

      if (wallet?.updateBalances && (user.walletBalance !== undefined || user.pendingBalance !== undefined)) {
        wallet.updateBalances(user.walletBalance || 0, user.pendingBalance || 0);
      }

      if (authRes.config) {
        updateConfigUI(authRes.config);
      }

      const shortener = getModule('shortener', 'ShortenerModule');
      if (shortener?.loadUserLinks) {
        shortener.loadUserLinks();
      }
    }
  } catch (err) {
    console.error('Authentication or handshake error:', err);
  }
}

/**
 * Updates dynamic configuration elements in the DOM
 */
function updateConfigUI(config) {
  if (!config) return;

  if (config.supportLink) {
    const el = document.getElementById('support-link-btn');
    if (el) el.href = config.supportLink;
  }
  if (config.channelLink) {
    const el = document.getElementById('channel-link-btn');
    if (el) el.href = config.channelLink;
  }
  if (config.platformName) {
    const el = document.getElementById('brandNameText');
    if (el) el.textContent = config.platformName;
  }
  if (config.platformBotUrl) {
    const el = document.getElementById('brandBotLink');
    if (el) {
      el.href = config.platformBotUrl;
      el.textContent = config.platformBotUrl;
    }
  }
}

/**
 * Directs flow based on URL parameters (Short links vs Dashboard)
 */
function handleRoutingAndShortener() {
  const urlParams = new URLSearchParams(window.location.search);
  const startParam = urlParams.get('start') || urlParams.get('shortId');
  const ads = getModule('ads', 'AdsModule');
  const ui = getModule('ui', 'UI');

  if (startParam && ads?.startAdFlow) {
    ads.startAdFlow(startParam);
  } else {
    if (ui?.switchTab) {
      ui.switchTab('tab-home');
    } else if (ui?.showTab) {
      ui.showTab('adsTabContent');
    }
  }
}

/**
 * Bind all DOM events safely with existence checks
 */
function bindEventListeners() {
  // --- Language Switchers ---
  const langToggleBtn = document.getElementById('lang-toggle-btn');
  if (langToggleBtn) {
    langToggleBtn.addEventListener('click', () => {
      const i18n = getI18n();
      const currentLang = i18n?.currentLang || 'ar';
      const nextLang = currentLang === 'ar' ? 'en' : 'ar';
      setLanguage(nextLang);
      refreshActiveTab();
    });
  }

  const btnAr = document.getElementById('btn-ar');
  if (btnAr) {
    btnAr.addEventListener('click', () => {
      setLanguage('ar');
      refreshActiveTab();
    });
  }

  const btnEn = document.getElementById('btn-en');
  if (btnEn) {
    btnEn.addEventListener('click', () => {
      setLanguage('en');
      refreshActiveTab();
    });
  }

  // --- Wallet Operations ---
  const netSelect = document.getElementById('deposit-network-select');
  if (netSelect) {
    netSelect.addEventListener('change', () => {
      const wallet = getModule('wallet', 'WalletModule');
      wallet?.updateDepositAddressDisplay?.();
    });
  }

  const withdrawInput = document.getElementById('withdraw-amount');
  if (withdrawInput) {
    withdrawInput.addEventListener('input', () => {
      const wallet = getModule('wallet', 'WalletModule');
      wallet?.calculateWithdrawalSummary?.();
    });
  }

  const guideBtn = document.getElementById('toggle-deposit-guide');
  const guidePanel = document.getElementById('deposit-guide-panel');
  if (guideBtn && guidePanel) {
    guideBtn.addEventListener('click', () => {
      guidePanel.classList.toggle('hidden');
    });
  }

  // --- Navigation Buttons ---
  setupNavigation();
}

/**
 * Set up Admin / Dashboard tab navigation
 */
function setupNavigation() {
  const navButtons = document.querySelectorAll('.nav-btn');
  const mainContent = document.getElementById('main-content');
  if (!navButtons.length || !mainContent) return;

  navButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const targetBtn = e.currentTarget;
      const tabName = targetBtn.getAttribute('data-tab');

      navButtons.forEach(b => b.classList.remove('active'));
      targetBtn.classList.add('active');

      renderTabContent(tabName, mainContent);
    });
  });

  // Initial render for currently active tab
  const activeBtn = document.querySelector('.nav-btn.active') || navButtons[0];
  if (activeBtn) {
    const initialTab = activeBtn.getAttribute('data-tab');
    renderTabContent(initialTab, mainContent);
  }
}

/**
 * Render tab views based on target tab name
 */
function renderTabContent(tabName, container) {
  if (!container || !tabName) return;

  const admin = getModule('admin', 'AdminModule');
  const ads = getModule('ads', 'AdsModule');

  switch (tabName) {
    case 'dashboard':
      admin?.renderDashboard?.(container);
      break;
    case 'withdrawals':
      admin?.renderWithdrawals?.(container);
      break;
    case 'deposits':
      admin?.renderDeposits?.(container);
      break;
    case 'users':
      admin?.renderUsers?.(container);
      break;
    case 'ads':
      ads?.renderAdsManagement?.(container);
      break;
  }
}

/**
 * Helper to get active I18n module
 */
function getI18n() {
  return window.TelegaApp?.i18n || window.I18n || null;
}

/**
 * Change active language safely
 */
function setLanguage(lang) {
  const i18n = getI18n();
  if (i18n) {
    if (typeof i18n.setLanguage === 'function') {
      i18n.setLanguage(lang);
    } else if (typeof i18n.init === 'function') {
      i18n.init(lang);
    }
    i18n.currentLang = lang;
  }

  const api = window.TelegaApp?.api || window.API;
  if (api?.request) {
    api.request('/api/user/language', 'POST', { language: lang }).catch(() => {});
  }
}

/**
 * Initialize I18n module
 */
function initI18n(lang) {
  const i18n = getI18n();
  if (i18n) {
    if (typeof i18n.init === 'function') {
      i18n.init(lang);
    } else if (typeof i18n.setLanguage === 'function') {
      i18n.setLanguage(lang);
    }
    i18n.currentLang = lang;
  }
}

/**
 * Refresh current active tab view after language switch
 */
function refreshActiveTab() {
  const activeBtn = document.querySelector('.nav-btn.active');
  const mainContent = document.getElementById('main-content');
  if (activeBtn && mainContent) {
    const currentTab = activeBtn.getAttribute('data-tab');
    renderTabContent(currentTab, mainContent);
  }
}
