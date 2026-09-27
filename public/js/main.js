// public/js/main.js
import * as UI from './modules/ui.js';
import * as Auth from './modules/auth.js';
import * as Ads from './modules/ads.js';
import * as Shortener from './modules/shortener.js';
import * as Wallet from './modules/wallet.js';
import * as User from './modules/user.js';
import * as Admin from './modules/admin.js';

// ربط جميع الموديولات والدوال المطلوبة بالنطاق العام window 
// هذا يضمن تشغيل كافة أزرار onclick="..." في صفحات HTML بشكل مباشر بدون تعديل ملفات HTML
Object.assign(window, UI, Auth, Ads, Shortener, Wallet, User, Admin);

// نقطة الانطلاق الرئيسية عند تحميل الواجهة (DOMContentLoaded)
document.addEventListener('DOMContentLoaded', async () => {
  // 1. تهيئة واجهة تلجرام والتوثيق
  await Auth.initApp();
  
  // 2. التحقق من مسارات الإحالة أو الجسر الإعلاني (Bridge View)
  const pathParts = window.location.pathname.split('/');
  if (pathParts.length >= 3 && pathParts[1] === 'r') {
    const code = pathParts[2];
    if (code && typeof Shortener.initBridgeView === 'function') {
      Shortener.initBridgeView(code);
      return;
    }
  }

  // 3. تحميل بيانات المستخدم والروابط الخاصة به
  if (typeof User.loadUserData === 'function') {
    await User.loadUserData();
  }
  if (typeof Shortener.fetchUserLinks === 'function') {
    await Shortener.fetchUserLinks();
  }
});
