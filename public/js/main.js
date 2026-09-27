import { state } from './state.js';
import * as Auth from './modules/auth.js';
import * as UI from './modules/ui.js';
import * as Ads from './modules/ads.js';
import * as Wallet from './modules/wallet.js';
import * as Shortener from './modules/shortener.js';
import * as User from './modules/user.js';
import * as Admin from './modules/admin.js';

// تصدير كافة الوحدات والدوال للنطاق العام (Global Window) للتفاعل المباشر مع عناصر HTML
const modules = [Auth, UI, Ads, Wallet, Shortener, User, Admin];
modules.forEach(mod => {
  if (mod) Object.assign(window, mod);
});
window.state = state;

// دالة إعداد مستمعي الأحداث لعناصر HTML (Event Listeners)
function setupEventListeners() {
  // نموذج اختصار الرابط
  const shortenForm = document.getElementById('shorten-form');
  if (shortenForm) {
    shortenForm.addEventListener('submit', Shortener.handleShortenClick);
  }

  // فلترة والبحث في الروابط
  const linkSearch = document.getElementById('link-search-input');
  if (linkSearch) {
    linkSearch.addEventListener('input', (e) => Shortener.filterUserLinks(e.target.value));
  }

  // إدخال مبلغ السحب وحساب العمولة
  const withdrawInput = document.getElementById('withdraw-amount');
  if (withdrawInput) {
    withdrawInput.addEventListener('input', UI.updateWithdrawCalculations);
  }

  // تغيير شبكة الإيداع
  const depositNet = document.getElementById('deposit-network');
  if (depositNet) {
    depositNet.addEventListener('change', (e) => UI.handleNetworkChange(e.target.value));
  }

  // زر الانتقال من الجسر إلى الوجهة النهائية
  const goBtn = document.getElementById('go-btn');
  if (goBtn) {
    goBtn.addEventListener('click', Shortener.completeImpression);
  }
}

// دالة البدء الرئيسية للتطبيق
async function startApp() {
  try {
    // 1. تهيئة المصادقة وتجهيز بيانات Telegram
    if (typeof Auth.initApp === 'function') {
      await Auth.initApp();
    }

    // 2. فحص ما إذا كانت الصفحة عبارة عن رابط مختصر (Shortener Bridge Path)
    const pathParts = window.location.pathname.split('/');
    if (pathParts.length >= 3 && pathParts[1] === 'r') {
      const code = pathParts[2];
      if (code && typeof Shortener.initBridgeView === 'function') {
        Shortener.initBridgeView(code);
        return;
      }
    }

    // 3. تحميل بيانات المستخدم والروابط المخزنة
    if (typeof User.loadUserData === 'function') {
      await User.loadUserData();
    }

    if (typeof Shortener.fetchUserLinks === 'function') {
      await Shortener.fetchUserLinks();
    }

    // 4. ربط مستمعي الأحداث
    setupEventListeners();

    // 5. التبديل للواجهة الرئيسية (Dashboard/Home)
    if (typeof UI.switchTab === 'function') {
      UI.switchTab('dashboard');
    }
  } catch (error) {
    console.error('حدث خطأ أثناء تشغيل التطبيق:', error);
  }
}

// ضمان تشغيل السكربت بعد اكتمال تحميل DOM وتفادي مشكلة Race Condition
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startApp);
} else {
  startApp();
}
