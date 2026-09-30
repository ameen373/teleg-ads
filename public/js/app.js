// Telega.ads - Main Application Controller (public/js/app.js)

// استيراد الوحدات باستخدام نظام CommonJS لحالات بيئات البناء والتجميع (Bundlers)
if (typeof require !== 'undefined') {
  try {
    var i18nModule = require('./i18n.js');
    var uiModule = require('./ui.js');
    var apiModule = require('./api.js');
    var shortenerModule = require('./shortener.js');
    var adsModule = require('./ads.js');
    var walletModule = require('./wallet.js');
    var adminModule = require('./admin.js');
  } catch (e) {
    // التجاوز في حالة التشغيل المباشر عبر المتصفح
  }
}

window.App = {
  currentUser: null,

  // 1. معالجة الأخطاء العامة لمنع توقف التطبيق عند الاستثناءات غير المتوقعة (window.onerror و unhandledrejection)
  setupGlobalErrorHandling: function() {
    window.onerror = function(message, source, lineno, colno, error) {
      console.error('[Global Error Caught]:', message, 'at', source, 'line:', lineno, 'col:', colno, error);
      try {
        if (window.UI && typeof window.UI.showToast === 'function') {
          const lang = window.UI.currentLang || 'ar';
          const msg = (lang === 'ar') ? 'حدث خطأ غير متوقع في التطبيق' : 'An unexpected error occurred';
          window.UI.showToast(msg);
        }
      } catch (e) {
        // التجاوز في حالة عدم اكتمال تحميل الواجهة
      }
      return true; // يمنع توقف التطبيق وتعطله
    };

    window.addEventListener('unhandledrejection', function(event) {
      console.error('[Unhandled Promise Rejection]:', event.reason);
      try {
        if (window.UI && typeof window.UI.showToast === 'function') {
          const lang = window.UI.currentLang || 'ar';
          const msg = (lang === 'ar') ? 'حدث خطأ في معالجة إحدى العمليات' : 'A promise rejection occurred';
          window.UI.showToast(msg);
        }
      } catch (e) {
        // التجاوز
      }
    });
  },

  // 2. دالة الاستجابة اللمسية (Haptic Feedback) عبر التليجرام
  triggerHaptic: function(type = 'impact', style = 'light') {
    try {
      const tg = window.Telegram?.WebApp;
      if (!tg || !tg.HapticFeedback) return;

      if (type === 'impact') {
        tg.HapticFeedback.impactOccurred(style);
      } else if (type === 'notification') {
        tg.HapticFeedback.notificationOccurred(style);
      } else if (type === 'selection') {
        tg.HapticFeedback.selectionChanged();
      }
    } catch (err) {
      console.error('Haptic Feedback Error:', err);
    }
  },

  // 3. تهيئة واجهة الجسر للروابط المقتطعة (/r/:code)
  initBridgeLogic: async function(code) {
    try {
      const appView = document.getElementById('app-view');
      const bridgeView = document.getElementById('bridge-view');

      if (appView) appView.classList.add('hidden');
      if (bridgeView) bridgeView.classList.remove('hidden');

      const linkInfo = await window.API?.getBridgeLinkInfo(code);
      if (!linkInfo || !linkInfo.targetUrl) {
        const msg = (window.UI?.currentLang === 'ar') ? "الرابط غير صالح أو غير موجود" : "Invalid link";
        window.UI?.showToast(msg);
        return;
      }

      window.UI?.adaptBridgeUI(linkInfo.targetUrl, linkInfo.title);

      let timeLeft = 5;
      const timerElem = document.getElementById('timer');
      const progressBar = document.getElementById('timer-progress-bar');
      const goBtn = document.getElementById('go-btn');

      const interval = setInterval(() => {
        timeLeft--;
        if (timerElem) timerElem.innerText = timeLeft;
        if (progressBar) progressBar.style.width = `${((5 - timeLeft) / 5) * 100}%`;

        if (timeLeft <= 0) {
          clearInterval(interval);
          if (goBtn) {
            goBtn.disabled = false;
            goBtn.onclick = async () => {
              this.triggerHaptic('impact', 'medium');
              window.UI?.setButtonLoading('go-btn', true);
              await window.API?.recordBridgeImpression(code, linkInfo.impressionToken);
              window.location.href = linkInfo.targetUrl;
            };
          }
        }
      }, 1000);
    } catch (error) {
      console.error('Bridge logic error:', error);
    }
  },

  // 4. حذف رابط مقتطع
  deleteLink: async function(linkId) {
    try {
      this.triggerHaptic('impact', 'medium');
      const confirmMsg = (window.UI?.currentLang === 'ar') ? "هل أنت تأكد من حذف هذا الرابط؟" : "Delete this link?";
      if (!confirm(confirmMsg)) return;

      const success = await window.API?.deleteLink(linkId);
      if (success) {
        this.triggerHaptic('notification', 'success');
        const toastMsg = (window.UI?.currentLang === 'ar') ? "تم حذف الرابط بنجاح" : "Link deleted";
        window.UI?.showToast(toastMsg);
        this.loadUserLinks();
      }
    } catch (error) {
      console.error('Delete link error:', error);
    }
  },

  // 5. تحميل قائمة روابط المستخدم
  loadUserLinks: async function(search = '') {
    try {
      if (window.Shortener && typeof window.Shortener.loadLinks === 'function') {
        await window.Shortener.loadLinks(search);
      } else if (window.API && typeof window.API.getUserLinks === 'function') {
        const links = await window.API.getUserLinks(search);
        window.UI?.renderLinksList(links);
      }
    } catch (error) {
      console.error('Load user links error:', error);
    }
  },

  // 6. تحميل بيانات لوحة التحكم الرئيسية
  loadDashboard: async function() {
    try {
      if (!window.API || typeof window.API.getDashboardData !== 'function') return;
      const data = await window.API.getDashboardData();
      if (!data) return;

      const pendingBal = document.getElementById('pending-bal');
      const availBal = document.getElementById('avail-bal');
      const refCount = document.getElementById('ref-count');
      const refEarnings = document.getElementById('ref-earnings');
      const refLinkInput = document.getElementById('ref-link');
      const defaultWallet = document.getElementById('default-wallet');

      if (pendingBal && data.pendingBalance !== undefined) pendingBal.innerText = `$${data.pendingBalance.toFixed(2)}`;
      if (availBal && data.availableBalance !== undefined) availBal.innerText = `$${data.availableBalance.toFixed(2)}`;
      if (refCount && data.referralCount !== undefined) refCount.innerText = data.referralCount;
      if (refEarnings && data.referralEarnings !== undefined) refEarnings.innerText = `$${data.referralEarnings.toFixed(2)}`;
      if (refLinkInput && data.referralCode) refLinkInput.value = `https://t.me/Ads_telegabot?start=${data.referralCode}`;
      if (defaultWallet && data.walletAddress) defaultWallet.value = data.walletAddress;

      if (data.announcement) {
        const ancBox = document.getElementById('announcement-box');
        const ancTitle = document.getElementById('anc-title');
        const ancContent = document.getElementById('anc-content');
        if (ancBox && ancTitle && ancContent) {
          ancTitle.innerText = data.announcement.title || '';
          ancContent.innerText = data.announcement.content || '';
          ancBox.classList.remove('hidden');
        }
      }

      // تمرير البيانات للوحدات المخصصة
      if (window.Wallet && typeof window.Wallet.updateBalances === 'function') {
        window.Wallet.updateBalances(data);
      }

      // التحقق من صلاحيات المسؤول
      if ((data.isAdmin || data.role === 'admin') && window.Admin) {
        this.enableAdminTab();
      }
    } catch (error) {
      console.error('Load dashboard error:', error);
    }
  },

  // 7. حل مشكلة الإدارة: إظهار زر/تبويب الإدارة وتحميل Module الإدارة
  enableAdminTab: function() {
    try {
      const adminBtn = document.getElementById('tab-btn-admin');
      if (adminBtn) {
        adminBtn.classList.remove('hidden');
        adminBtn.style.display = 'flex';
      }

      if (window.Admin) {
        if (typeof window.Admin.showAdminTab === 'function') {
          window.Admin.showAdminTab();
        }
        if (typeof window.Admin.init === 'function') {
          window.Admin.init();
        }
      }
    } catch (err) {
      console.error('Enable Admin Tab Error:', err);
    }
  },

  // 8. إعداد الملاحة بين التبويبات (Tab Switching)
  setupTabNavigation: function() {
    const navDockTabs = ['dashboard', 'wallet', 'ads', 'referral', 'settings', 'admin'];
    navDockTabs.forEach(tab => {
      const btn = document.getElementById(`tab-btn-${tab}`);
      if (btn) {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          this.switchTab(tab);
        });
      }
    });
  },

  // التبديل بين التبويبات وتغيير المحتوى ديناميكياً بدون إعادة تحميل الصفحة
  switchTab: function(tabName) {
    try {
      this.triggerHaptic('selection');

      // 1. تبديل الرؤية عبر UI
      if (window.UI && typeof window.UI.switchTab === 'function') {
        window.UI.switchTab(tabName);
      } else {
        const sections = document.querySelectorAll('.tab-content');
        sections.forEach(sec => sec.classList.add('hidden'));

        const activeSection = document.getElementById(`tab-content-${tabName}`) || document.getElementById(`view-${tabName}`);
        if (activeSection) {
          activeSection.classList.remove('hidden');
        }

        const navButtons = document.querySelectorAll('.nav-tab-btn');
        navButtons.forEach(btn => btn.classList.remove('active'));

        const currentBtn = document.getElementById(`tab-btn-${tabName}`);
        if (currentBtn) {
          currentBtn.classList.add('active');
        }
      }

      // 2. تحديث المحتوى الديناميكي للتبويب المحدد بدون إعادة تحميل الصفحة
      this.refreshTabContent(tabName);
    } catch (error) {
      console.error('Switch tab error:', error);
    }
  },

  // تحديث محتوى التبويب المختار تلقائياً
  refreshTabContent: async function(tabName) {
    try {
      switch (tabName) {
        case 'dashboard':
          await this.loadDashboard();
          await this.loadUserLinks();
          break;
        case 'wallet':
          if (window.Wallet && typeof window.Wallet.loadWalletData === 'function') {
            await window.Wallet.loadWalletData();
          } else {
            await this.loadDashboard();
          }
          break;
        case 'ads':
          if (window.Ads && typeof window.Ads.loadCampaigns === 'function') {
            await window.Ads.loadCampaigns();
          }
          break;
        case 'referral':
          await this.loadDashboard();
          break;
        case 'settings':
          break;
        case 'admin':
          if (window.Admin && typeof window.Admin.loadOverview === 'function') {
            await window.Admin.loadOverview();
          }
          break;
        default:
          break;
      }
    } catch (err) {
      console.error(`Error refreshing tab content (${tabName}):`, err);
    }
  },

  // 9. ربط جميع أحداث العناصر والأزرار
  bindEventListeners: function() {
    // 1. إنشاء رابط مقتطع
    const btnCreateLink = document.getElementById('btn-create-link');
    if (btnCreateLink) {
      btnCreateLink.addEventListener('click', async (e) => {
        e.preventDefault();
        this.triggerHaptic('impact', 'medium');
        const titleInput = document.getElementById('link-title');
        const urlInput = document.getElementById('link-url');

        if (!urlInput || !urlInput.value) {
          const msg = (window.UI?.currentLang === 'ar') ? "يرجى إدخال الرابط الأصلي" : "Please enter original URL";
          window.UI?.showToast(msg);
          return;
        }

        window.UI?.setButtonLoading('btn-create-link', true);
        const res = await window.API?.createShortLink(titleInput.value, urlInput.value);
        window.UI?.setButtonLoading('btn-create-link', false);

        if (res) {
          this.triggerHaptic('notification', 'success');
          const msg = (window.UI?.currentLang === 'ar') ? "تم اختصار الرابط بنجاح!" : "Link shortened!";
          window.UI?.showToast(msg);
          if (titleInput) titleInput.value = '';
          if (urlInput) urlInput.value = '';
          this.loadUserLinks();
        }
      });
    }

    // 2. البحث في الروابط
    const searchLinksInput = document.getElementById('search-links-input');
    if (searchLinksInput) {
      searchLinksInput.addEventListener('input', (e) => {
        this.loadUserLinks(e.target.value);
      });
    }

    // 3. تعليمات وطريقة الإيداع
    const btnDepositGuide = document.getElementById('btn-deposit-guide');
    if (btnDepositGuide) {
      btnDepositGuide.addEventListener('click', () => {
        this.triggerHaptic('selection');
        window.UI?.toggleInstructionsModal(true);
      });
    }

    const btnCloseInstructionsModal = document.getElementById('btn-close-instructions-modal');
    if (btnCloseInstructionsModal) {
      btnCloseInstructionsModal.addEventListener('click', () => {
        this.triggerHaptic('selection');
        window.UI?.toggleInstructionsModal(false);
      });
    }

    // 4. تغيير شبكة الإيداع ونسخ العنوان
    const depositNetwork = document.getElementById('deposit-network');
    if (depositNetwork) {
      depositNetwork.addEventListener('change', (e) => {
        this.triggerHaptic('selection');
        window.UI?.handleNetworkChange(e.target.value);
      });
    }

    const btnCopyTrc20 = document.getElementById('btn-copy-trc20');
    if (btnCopyTrc20) {
      btnCopyTrc20.addEventListener('click', () => {
        this.triggerHaptic('impact', 'light');
        const addr = document.getElementById('addr-trc20')?.innerText;
        window.UI?.copyToClipboard(addr);
      });
    }

    const btnCopyBep20 = document.getElementById('btn-copy-bep20');
    if (btnCopyBep20) {
      btnCopyBep20.addEventListener('click', () => {
        this.triggerHaptic('impact', 'light');
        const addr = document.getElementById('addr-bep20')?.innerText;
        window.UI?.copyToClipboard(addr);
      });
    }

    // 5. إرسال طلب إيداع
    const btnRequestDeposit = document.getElementById('btn-request-deposit');
    if (btnRequestDeposit) {
      btnRequestDeposit.addEventListener('click', async () => {
        this.triggerHaptic('impact', 'medium');
        const network = document.getElementById('deposit-network')?.value;
        const amount = document.getElementById('deposit-amount')?.value;
        const txhash = document.getElementById('deposit-txhash')?.value;

        if (!network || !amount || !txhash) {
          const msg = (window.UI?.currentLang === 'ar') ? "يرجى ملء جميع حقول الإيداع" : "Please fill all deposit fields";
          window.UI?.showToast(msg);
          return;
        }

        window.UI?.setButtonLoading('btn-request-deposit', true);
        const res = await window.API?.requestDeposit(network, amount, txhash);
        window.UI?.setButtonLoading('btn-request-deposit', false);

        if (res && res.success) {
          this.triggerHaptic('notification', 'success');
          const msg = (window.UI?.currentLang === 'ar') ? "تم تقديم طلب الإيداع بنجاح!" : "Deposit submitted!";
          window.UI?.showToast(msg);
          document.getElementById('deposit-amount').value = '';
          document.getElementById('deposit-txhash').value = '';
        }
      });
    }

    // 6. التنقل داخل وحدة المحفظة (إيداع / سحب)
    const walletNavDeposit = document.getElementById('wallet-nav-deposit');
    if (walletNavDeposit) {
      walletNavDeposit.addEventListener('click', () => {
        this.triggerHaptic('selection');
        window.UI?.switchWalletView('deposit');
      });
    }

    const walletNavWithdraw = document.getElementById('wallet-nav-withdraw');
    if (walletNavWithdraw) {
      walletNavWithdraw.addEventListener('click', () => {
        this.triggerHaptic('selection');
        window.UI?.switchWalletView('withdraw');
      });
    }

    // 7. تعديل وحفظ عنوان المحفظة
    const editWalletBtn = document.getElementById('edit-wallet-btn');
    if (editWalletBtn) {
      editWalletBtn.addEventListener('click', () => {
        this.triggerHaptic('selection');
        window.UI?.toggleWalletEdit();
      });
    }

    const saveWalletBtn = document.getElementById('save-wallet-btn');
    if (saveWalletBtn) {
      saveWalletBtn.addEventListener('click', async () => {
        this.triggerHaptic('impact', 'medium');
        const addrInput = document.getElementById('default-wallet');
        if (!addrInput || !addrInput.value) return;

        window.UI?.setButtonLoading('save-wallet-btn', true);
        const res = await window.API?.updateWalletAddress(addrInput.value);
        window.UI?.setButtonLoading('save-wallet-btn', false);

        if (res && res.success) {
          this.triggerHaptic('notification', 'success');
          const msg = (window.UI?.currentLang === 'ar') ? "تم حفظ عنوان المحفظة!" : "Wallet saved!";
          window.UI?.showToast(msg);
          window.UI?.toggleWalletEdit();
        }
      });
    }

    // 8. حسابات طلب السحب وإرساله
    const withdrawAmount = document.getElementById('withdraw-amount');
    if (withdrawAmount) {
      withdrawAmount.addEventListener('input', () => {
        if (window.Wallet && typeof window.Wallet.updateCalculations === 'function') {
          window.Wallet.updateCalculations();
        } else {
          window.UI?.updateWithdrawCalculations();
        }
      });
    }

    const btnRequestWithdraw = document.getElementById('btn-request-withdraw');
    if (btnRequestWithdraw) {
      btnRequestWithdraw.addEventListener('click', async () => {
        this.triggerHaptic('impact', 'medium');
        const amount = document.getElementById('withdraw-amount')?.value;
        const wallet = document.getElementById('default-wallet')?.value;

        if (!amount || amount < 30 || !wallet) {
          const msg = (window.UI?.currentLang === 'ar') ? "الحد الأدنى للسحب 30$ مع وجود محفظة" : "Min withdrawal is $30";
          window.UI?.showToast(msg);
          return;
        }

        window.UI?.setButtonLoading('btn-request-withdraw', true);
        const res = await window.API?.requestWithdrawal(amount, wallet);
        window.UI?.setButtonLoading('btn-request-withdraw', false);

        if (res && res.success) {
          this.triggerHaptic('notification', 'success');
          const msg = (window.UI?.currentLang === 'ar') ? "تم إرسال طلب السحب بنجاح!" : "Withdrawal submitted!";
          window.UI?.showToast(msg);
          document.getElementById('withdraw-amount').value = '';
          if (window.UI?.updateWithdrawCalculations) window.UI.updateWithdrawCalculations();
          this.loadDashboard();
        }
      });
    }

    // 9. اختيارات نوع الإعلان
    const adType = document.getElementById('ad-type');
    if (adType) {
      adType.addEventListener('change', () => {
        this.triggerHaptic('selection');
        if (window.Ads && typeof window.Ads.onTypeChange === 'function') {
          window.Ads.onTypeChange();
        } else {
          window.UI?.onAdTypeChange();
        }
      });
    }

    // 10. إنشاء حملة إعلانية
    const btnCreateAd = document.getElementById('btn-create-ad');
    if (btnCreateAd) {
      btnCreateAd.addEventListener('click', async () => {
        this.triggerHaptic('impact', 'heavy');
        const type = document.getElementById('ad-type')?.value;
        const title = document.getElementById('ad-title')?.value;
        const targetUrl = document.getElementById('ad-target-url')?.value;
        const mediaUrl = document.getElementById('ad-media-url')?.value;
        const appUrl = document.getElementById('ad-app-download-url')?.value;
        const gameUrl = document.getElementById('ad-game-embed-url')?.value;
        const category = document.getElementById('ad-category')?.value;
        const budget = document.getElementById('ad-budget')?.value;
        const dailyBudget = document.getElementById('ad-daily-budget')?.value;

        if (!title || !targetUrl || !budget) {
          const msg = (window.UI?.currentLang === 'ar') ? "يرجى إكمال الحقول الرئيسية للإعلان" : "Please complete ad fields";
          window.UI?.showToast(msg);
          return;
        }

        const adData = {
          type, title, targetUrl, mediaUrl, appUrl, gameUrl, category, budget, dailyBudget,
          devices: {
            android: !!document.getElementById('device-android')?.checked,
            ios: !!document.getElementById('device-ios')?.checked,
            desktop: !!document.getElementById('device-desktop')?.checked
          },
          countries: document.getElementById('ad-countries')?.value || 'ALL'
        };

        window.UI?.setButtonLoading('btn-create-ad', true);
        const res = await window.API?.createAdCampaign(adData);
        window.UI?.setButtonLoading('btn-create-ad', false);

        if (res && res.success) {
          this.triggerHaptic('notification', 'success');
          const msg = (window.UI?.currentLang === 'ar') ? "تم إنشاء الحملة الإعلانية بنجاح!" : "Campaign created!";
          window.UI?.showToast(msg);
        }
      });
    }

    // 11. مشاركة رابط الإحالة
    const btnShareRef = document.getElementById('btn-share-ref');
    if (btnShareRef) {
      btnShareRef.addEventListener('click', () => {
        this.triggerHaptic('impact', 'light');
        if (window.UI?.shareReferralLink) {
          window.UI.shareReferralLink();
        } else {
          const refInput = document.getElementById('ref-link');
          if (refInput && refInput.value) {
            window.Telegram?.WebApp?.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(refInput.value)}`);
          }
        }
      });
    }

    // 12. اختيار اللغة
    const languageSelect = document.getElementById('language-select');
    if (languageSelect) {
      languageSelect.addEventListener('change', (e) => {
        this.triggerHaptic('selection');
        const selectedLang = e.target.value;
        if (window.i18n && typeof window.i18n.setLanguage === 'function') {
          window.i18n.setLanguage(selectedLang);
        } else if (typeof window.changeAppLanguage === 'function') {
          window.changeAppLanguage(selectedLang);
        }
      });
    }

    // 13. إغلاق إعلان الفيديو Overlay
    const btnCloseVideoAd = document.getElementById('btn-close-video-ad');
    if (btnCloseVideoAd) {
      btnCloseVideoAd.addEventListener('click', () => {
        this.triggerHaptic('selection');
        if (window.Ads && typeof window.Ads.closeVideo === 'function') {
          window.Ads.closeVideo();
        } else {
          window.UI?.closeVideoAd();
        }
      });
    }

    // 14. ربط أحداث وحدة لوحة الإدارة (Admin Module Events)
    const btnAdminSave = document.getElementById('btn-admin-save-settings');
    if (btnAdminSave) {
      btnAdminSave.addEventListener('click', async () => {
        this.triggerHaptic('impact', 'medium');
        if (window.Admin && typeof window.Admin.saveSettings === 'function') {
          await window.Admin.saveSettings();
        }
      });
    }
  },

  // 10. تهيئة تطبيق تليجرام المدمج (Telegram WebApp)
  initTelegramWebApp: function() {
    try {
      const tg = window.Telegram?.WebApp;
      if (tg) {
        // تنفيذ التهيئة والتوسيع وفق الشروط المطلوبة
        tg.ready();
        tg.expand();

        if (typeof tg.setHeaderColor === 'function') tg.setHeaderColor('secondary');
        if (typeof tg.setBackgroundColor === 'function') tg.setBackgroundColor('bg_color');
        if (typeof tg.enableClosingConfirmation === 'function') tg.enableClosingConfirmation();
      }
    } catch (error) {
      console.error('Telegram WebApp initialization error:', error);
    }
  },

  // 11. نقطة الانطلاق الشاملة للواجهة للتطبيق (App Initialization flow)
  init: async function() {
    try {
      // أ. إعداد معالج الأخطاء العام لمنع توقف التطبيق عند الاستثناءات
      this.setupGlobalErrorHandling();

      // ب. تهيئة Telegram.WebApp.ready() و Telegram.WebApp.expand()
      this.initTelegramWebApp();

      // ج. استدعاء i18n.init() لتحديد اللغة وتحديث النصوص
      if (window.i18n && typeof window.i18n.init === 'function') {
        window.i18n.init();
      }

      // د. استدعاء API.getProfile() للتحقق من هوية المستخدم وجلب بياناته
      let user = null;
      if (window.API && typeof window.API.getProfile === 'function') {
        user = await window.API.getProfile();
      } else if (window.API && typeof window.API.authLogin === 'function') {
        const initData = window.Telegram?.WebApp?.initData || '';
        user = await window.API.authLogin(initData);
      }

      this.currentUser = user;

      // هـ. حل مشكلة الإدارة: التحقق من user.role === 'admin'
      if (user && (user.role === 'admin' || user.isAdmin)) {
        this.enableAdminTab();
      }

      // و. عرض بيانات المستخدم في الواجهة
      if (window.UI && typeof window.UI.renderTelegramUser === 'function') {
        window.UI.renderTelegramUser(user);
      }

      // ز. إعداد الملاحة بين التبويبات (Tab Switching)
      this.setupTabNavigation();

      // ح. التحقق من مسار رابط الجسر (/r/:code)
      const pathParts = window.location.pathname.split('/');
      if (pathParts.length >= 3 && pathParts[1] === 'r') {
        const code = pathParts[2];
        if (code) {
          await this.initBridgeLogic(code);
          return;
        }
      }

      // ط. ربط أحداث العناصر والأزرار
      this.bindEventListeners();

      // ي. تحميل البيانات الأساسية فور تسجيل الدخول
      if (user) {
        await this.loadDashboard();
        await this.loadUserLinks();
      }
    } catch (error) {
      console.error('App initialization error:', error);
    }
  }
};

// تشغيل التطبيق فور اكتمال تحميل مستند HTML
document.addEventListener('DOMContentLoaded', () => {
  window.App.init();
});

// تصدير الكود بنظام CommonJS
if (typeof module !== 'undefined' && module.exports) {
  module.exports = window.App;
}
