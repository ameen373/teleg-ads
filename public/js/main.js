import { state } from './state.js';
import * as Auth from './modules/auth.js';
import * as UI from './modules/ui.js';
import * as Ads from './modules/ads.js';
import * as Wallet from './modules/wallet.js';
import * as Shortener from './modules/shortener.js';
import * as User from './modules/user.js';
import * as Admin from './modules/admin.js';

// تصدير كافة الوحدات والدوال للنطاق العام (Global Window) للتفاعل المباشر مع أحداث HTML
const modules = [Auth, UI, Ads, Wallet, Shortener, User, Admin];
modules.forEach(mod => {
  if (mod) {
    Object.keys(mod).forEach(key => {
      window[key] = mod[key];
    });
  }
});
window.state = state;

// دالة إعداد مستمعي الأحداث لعناصر HTML (Event Listeners)
function setupEventListeners() {
  const shortenBtn = document.getElementById('btn-create-link');
  if (shortenBtn && typeof Shortener.handleShortenClick === 'function') {
    shortenBtn.addEventListener('click', Shortener.handleShortenClick);
  }

  const shortenForm = document.getElementById('shorten-form');
  if (shortenForm && typeof Shortener.handleShortenClick === 'function') {
    shortenForm.addEventListener('submit', Shortener.handleShortenClick);
  }

  const linkSearch = document.getElementById('search-links-input') || document.getElementById('link-search-input');
  if (linkSearch && typeof Shortener.filterUserLinks === 'function') {
    linkSearch.addEventListener('input', (e) => Shortener.filterUserLinks(e.target.value));
  }

  const withdrawInput = document.getElementById('withdraw-amount');
  if (withdrawInput && typeof UI.updateWithdrawCalculations === 'function') {
    withdrawInput.addEventListener('input', UI.updateWithdrawCalculations);
  }

  const depositNet = document.getElementById('deposit-network');
  if (depositNet && typeof UI.handleNetworkChange === 'function') {
    depositNet.addEventListener('change', (e) => UI.handleNetworkChange(e.target.value));
  }

  const goBtn = document.getElementById('go-btn');
  if (goBtn && typeof Shortener.completeImpression === 'function') {
    goBtn.addEventListener('click', Shortener.completeImpression);
  }
}

// دالة البدء الرئيسية للتطبيق
async function startApp() {
  try {
    setupEventListeners();

    if (typeof Auth.initApp === 'function') {
      await Auth.initApp();
    }

    const pathParts = window.location.pathname.split('/');
    if (pathParts.length >= 3 && pathParts[1] === 'r') {
      const code = pathParts[2];
      if (code && typeof Shortener.initBridgeView === 'function') {
        await Shortener.initBridgeView(code);
        return;
      }
    }

    if (typeof User.loadUserData === 'function') {
      await User.loadUserData();
    }

    if (typeof Shortener.fetchUserLinks === 'function') {
      await Shortener.fetchUserLinks();
    }

    if (typeof UI.switchTab === 'function') {
      UI.switchTab('dashboard');
    }
  } catch (error) {
    console.error('حدث خطأ أثناء تشغيل التطبيق:', error);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startApp);
} else {
  startApp();
}
