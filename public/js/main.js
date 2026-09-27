import { state } from './state.js';
import * as Auth from './modules/auth.js';
import * as UI from './modules/ui.js';
import * as Ads from './modules/ads.js';
import * as Wallet from './modules/wallet.js';
import * as Shortener from './modules/shortener.js';
import * as User from './modules/user.js';
import * as Admin from './modules/admin.js';

// تصدير الوحدات للنطاق العام (Global Window) لربط الأحداث مع عناصر HTML
[Auth, UI, Ads, Wallet, Shortener, User, Admin].forEach(mod => {
  if (mod) Object.assign(window, mod);
});
window.state = state;

// دالة البدء الرئيسية
async function startApp() {
  try {
    // 1. تهيئة المصادقة أولاً
    if (typeof Auth.initApp === 'function') {
      await Auth.initApp();
    }

    // 2. التحقق من روابط التوجيه المباشر (Shortener Bridge)
    const pathParts = window.location.pathname.split('/');
    if (pathParts.length >= 3 && pathParts[1] === 'r') {
      const code = pathParts[2];
      if (code && typeof Shortener.initBridgeView === 'function') {
        Shortener.initBridgeView(code);
        return;
      }
    }

    // 3. تحميل بيانات المستخدم والروابط
    if (typeof User.loadUserData === 'function') {
      await User.loadUserData();
    }

    if (typeof Shortener.fetchUserLinks === 'function') {
      await Shortener.fetchUserLinks();
    }

    // 4. التبديل إلى الواجهة الرئيسية
    if (typeof UI.switchTab === 'function') {
      UI.switchTab('home');
    }
  } catch (error) {
    console.error('حدث خطأ أثناء تشغيل التطبيق:', error);
  }
}

// معالجة حالة التحميل لتفادي مشكلة Race Condition في ES Modules
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startApp);
} else {
  startApp();
}
