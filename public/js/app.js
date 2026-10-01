// Telega.ads - Main Application Controller (public/js/app.js)

// استيراد الوحدات بأسلوب CommonJS لتوافقية بيئات التجميع والترميز
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
    // التجاوز في حالة التشغيل المباشر داخل متصفح الويب
  }
}

// -------------------------------------------------------------
// دالة مساعدة جالبة للوحدات المدمجة لضمان التوافق مع اختلاف مسميات window
// -------------------------------------------------------------
function getModule(name) {
  if (typeof window === 'undefined') return {};
  switch (name) {
    case 'i18n':
      return window.i18n || window.i18nModule || (typeof require !== 'undefined' ? tryRequire('./i18n.js') : {}) || {};
    case 'UI':
      return window.UI || window.uiModule || window.UIModule || (typeof require !== 'undefined' ? tryRequire('./ui.js') : {}) || {};
    case 'API':
      return window.API || window.apiModule || window.APIModule || (typeof require !== 'undefined' ? tryRequire('./api.js') : {}) || {};
    case 'Shortener':
      return window.ShortenerModule || window.Shortener || (typeof require !== 'undefined' ? tryRequire('./shortener.js') : {}) || {};
    case 'Ads':
      return window.AdsModule || window.Ads || (typeof require !== 'undefined' ? tryRequire('./ads.js') : {}) || {};
    case 'Wallet':
      return window.WalletModule || window.Wallet || (typeof require !== 'undefined' ? tryRequire('./wallet.js') : {}) || {};
    case 'Admin':
      return window.AdminModule || window.Admin || (typeof require !== 'undefined' ? tryRequire('./admin.js') : {}) || {};
    default:
      return {};
  }
}

function tryRequire(path) {
  try {
    return require(path);
  } catch (e) {
    return null;
  }
}

// -------------------------------------------------------------
// 1. معالج الأخطاء العام (Global Error Handlers)
// -------------------------------------------------------------
window.onerror = function (message, source, lineno, colno, error) {
  console.error('[App Global Error]:', message, 'at', source, 'line:', lineno, colno, error);
  const UI = getModule('UI');
  if (UI && typeof UI.showToast === 'function') {
    const lang = UI.currentLang || 'ar';
    UI.showToast(lang === 'ar' ? 'حدث خطأ غير متوقع في النظام' : 'An unexpected error occurred');
  }
  return true; // منع توقف التطبيق أو انهياره
};

window.addEventListener('unhandledrejection', function (event) {
  console.error('[Unhandled Rejection]:', event.reason);
  const UI = getModule('UI');
  if (UI && typeof UI.showToast === 'function') {
    const lang = UI.currentLang || 'ar';
    UI.showToast(lang === 'ar' ? 'خطأ في الاتصال بالشبكة أو الاستجابة' : 'Network/Promise rejection error');
  }
});

// -------------------------------------------------------------
// 2. الكائن التشغيلي الرئيسي للواجهة والتطبيق (App Engine)
// -------------------------------------------------------------
window.App = {
  activeTab: 'dashboard',

  /**
   * دالة التفاعل اللمسي (Haptic Feedback) لـ Telegram Mini App
   */
  triggerHaptic: function (type = 'impact', style = 'light') {
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
      console.warn('Haptic Feedback Error:', err);
    }
  },

  /**
   * تهيئة بيئة Telegram Mini App المدمجة
   */
  initTelegramWebApp: function () {
    try {
      const tg = window.Telegram?.WebApp;
      if (tg) {
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

  /**
   * التحكم بظهور تبويب الإدارة عند التحقق من صلاحيات المدير
   */
  setupAdminRole: function (isAdmin) {
    try {
      const adminTabBtn = document.getElementById('tab-btn-admin');
      const adminElements = document.querySelectorAll('.admin-only');
      const Admin = getModule('Admin');

      window.isUserAdmin = !!isAdmin;

      if (isAdmin) {
        if (adminTabBtn) adminTabBtn.style.display = 'flex';
        adminElements.forEach(el => { if (el) el.style.display = ''; });

        if (Admin && typeof Admin.showAdminTab === 'function') {
          Admin.showAdminTab();
        } else if (Admin && typeof Admin.checkAdminAccess === 'function') {
          Admin.checkAdminAccess();
        }
      } else {
        if (adminTabBtn) adminTabBtn.style.display = 'none';
        adminElements.forEach(el => { if (el) el.style.display = 'none'; });

        const adminTabSection = document.getElementById('tab-admin');
        if (adminTabSection) adminTabSection.classList.add('hidden');
      }
    } catch (error) {
      console.error('Setup admin role error:', error);
    }
  },

  /**
   * نظام التنقل الديناميكي بين التبويبات (Tab Switching) دون إعادة تحميل الصفحة
   */
  switchTab: function (targetTabId) {
    if (!targetTabId) return;

    this.activeTab = targetTabId;
    this.triggerHaptic('selection');

    const allTabs = ['dashboard', 'wallet', 'ads', 'referral', 'settings', 'admin'];

    allTabs.forEach(tabId => {
      const btn = document.getElementById(`tab-btn-${tabId}`);
      const section = document.getElementById(`tab-${tabId}`);

      if (btn) {
        if (tabId === targetTabId) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      }

      if (section) {
        if (tabId === targetTabId) {
          section.classList.remove('hidden');
        } else {
          section.classList.add('hidden');
        }
      }
    });

    const Wallet = getModule('Wallet');
    const Shortener = getModule('Shortener');
    const Ads = getModule('Ads');
    const Admin = getModule('Admin');

    // تحديث وتحميل البيانات الحية الخاصة بالتبويب المفتوح
    if (targetTabId === 'dashboard' || targetTabId === 'wallet') {
      if (Wallet && typeof Wallet.loadUserData === 'function') {
        Wallet.loadUserData();
      } else {
        this.loadDashboard();
      }

      if (Shortener && typeof Shortener.fetchUserLinks === 'function') {
        Shortener.fetchUserLinks();
      } else if (Shortener && typeof Shortener.loadLinks === 'function') {
        Shortener.loadLinks();
      } else {
        this.loadUserLinks();
      }
    } else if (targetTabId === 'ads') {
      if (Ads && typeof Ads.fetchUserAds === 'function') {
        Ads.fetchUserAds();
      } else if (Ads && typeof Ads.loadUserAds === 'function') {
        Ads.loadUserAds();
      }
    } else if (targetTabId === 'referral') {
      if (Wallet && typeof Wallet.fetchUserReferrals === 'function') {
        Wallet.fetchUserReferrals();
      }
    } else if (targetTabId === 'admin') {
      if (window.isUserAdmin) {
        if (Admin && typeof Admin.loadAdminData === 'function') {
          Admin.loadAdminData();
        } else if (Admin && typeof Admin.loadOverview === 'function') {
          Admin.loadOverview();
        }
      }
    }
  },

  /**
   * ربط أحداث الملاحة والمستمعين بين أزرار التبويبات
   */
  initTabNavigation: function () {
    const navTabs = ['dashboard', 'wallet', 'ads', 'referral', 'settings', 'admin'];

    navTabs.forEach(tabId => {
      const btn = document.getElementById(`tab-btn-${tabId}`);
      if (btn) {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          this.switchTab(tabId);
        });
      }
    });
  },

  /**
   * تهيئة منطق صفحة التحويل والجسر المقتطع (/r/:code)
   */
  initBridgeLogic: async function (code) {
    try {
      const Shortener = getModule('Shortener');
      const API = getModule('API');
      const UI = getModule('UI');

      if (Shortener && typeof Shortener.initBridgeView === 'function') {
        await Shortener.initBridgeView(code);
        return;
      }

      if (Shortener && typeof Shortener.initBridgeLogic === 'function') {
        await Shortener.initBridgeLogic(code);
        return;
      }

      // المنطق المباشر في حال عدم وجود الدالة بالوحدة
      const appView = document.getElementById('app-view');
      const bridgeView = document.getElementById('bridge-view');

      if (appView) appView.classList.add('hidden');
      if (bridgeView) bridgeView.classList.remove('hidden');

      const linkInfo = API.getBridgeLinkInfo ? await API.getBridgeLinkInfo(code) : null;
      if (!linkInfo || !linkInfo.targetUrl) {
        const msg = (UI?.currentLang === 'ar') ? "الرابط غير صالح أو غير موجود" : "Invalid link";
        if (UI?.showToast) UI.showToast(msg);
        return;
      }

      if (UI?.adaptBridgeUI) UI.adaptBridgeUI(linkInfo.targetUrl, linkInfo.title);

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
              if (UI?.setButtonLoading) UI.setButtonLoading('go-btn', true);
              if (API?.recordBridgeImpression) {
                await API.recordBridgeImpression(code, linkInfo.impressionToken);
              }
              window.location.href = linkInfo.targetUrl;
            };
          }
        }
      }, 1000);
    } catch (error) {
      console.error('Bridge logic error:', error);
    }
  },

  /**
   * حذف رابط مقتطع
   */
  deleteLink: async function (linkId) {
    try {
      const Shortener = getModule('Shortener');
      const API = getModule('API');
      const UI = getModule('UI');

      if (Shortener && typeof Shortener.deleteLink === 'function') {
        return await Shortener.deleteLink(linkId);
      }

      this.triggerHaptic('impact', 'medium');
      const confirmMsg = (UI?.currentLang === 'ar') ? "هل أنت تأكد من حذف هذا الرابط؟" : "Delete this link?";
      if (!confirm(confirmMsg)) return;

      if (API && typeof API.deleteLink === 'function') {
        const success = await API.deleteLink(linkId);
        if (success) {
          this.triggerHaptic('notification', 'success');
          const toastMsg = (UI?.currentLang === 'ar') ? "تم حذف الرابط بنجاح" : "Link deleted";
          if (UI?.showToast) UI.showToast(toastMsg);
          this.loadUserLinks();
        }
      }
    } catch (error) {
      console.error('Delete link error:', error);
    }
  },

  /**
   * تحميل قائمة روابط المستخدم
   */
  loadUserLinks: async function (search = '') {
    try {
      const Shortener = getModule('Shortener');
      const API = getModule('API');
      const UI = getModule('UI');

      if (Shortener && typeof Shortener.loadLinks === 'function') {
        await Shortener.loadLinks(search);
      } else if (Shortener && typeof Shortener.fetchUserLinks === 'function') {
        await Shortener.fetchUserLinks(search);
      } else if (API && typeof API.getUserLinks === 'function') {
        const links = await API.getUserLinks(search);
        if (UI && typeof UI.renderLinksList === 'function') {
          UI.renderLinksList(links);
        }
      }
    } catch (error) {
      console.error('Load user links error:', error);
    }
  },

  /**
   * تحميل بيانات لوحة التحكم الرئيسية
   */
  loadDashboard: async function () {
    try {
      const API = getModule('API');
      const Wallet = getModule('Wallet');

      if (!API || typeof API.getDashboardData !== 'function') return;

      const data = await API.getDashboardData();
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

      // تحديث بيانات الرصيد والصلاحيات عبر الوحدات
      if (Wallet && typeof Wallet.updateBalances === 'function') {
        Wallet.updateBalances(data);
      }

      const isAdmin = !!(data.isAdmin || (data.user && data.user.role === 'admin'));
      this.setupAdminRole(isAdmin);

    } catch (error) {
      console.error('Load dashboard error:', error);
    }
  },

  /**
   * ربط كافة أحداث الواجهة العامة والأزرار مع الوحدات المخصصة
   */
  bindEventListeners: function () {
    const UI = getModule('UI');
    const API = getModule('API');
    const Shortener = getModule('Shortener');
    const Wallet = getModule('Wallet');
    const Ads = getModule('Ads');
    const Admin = getModule('Admin');
    const i18n = getModule('i18n');

    // 1. اختصار رابط جديد
    const btnCreateLink = document.getElementById('btn-create-link');
    if (btnCreateLink) {
      btnCreateLink.addEventListener('click', async (e) => {
        e.preventDefault();
        this.triggerHaptic('impact', 'medium');

        if (Shortener && typeof Shortener.handleShortenClick === 'function') {
          return Shortener.handleShortenClick(e);
        }

        const titleInput = document.getElementById('link-title');
        const urlInput = document.getElementById('link-url');

        if (!urlInput || !urlInput.value) {
          const msg = (UI?.currentLang === 'ar') ? "يرجى إدخال الرابط الأصلي" : "Please enter original URL";
          if (UI?.showToast) UI.showToast(msg);
          return;
        }

        if (UI?.setButtonLoading) UI.setButtonLoading('btn-create-link', true);
        const res = (API && typeof API.createShortLink === 'function') ? await API.createShortLink(titleInput?.value || '', urlInput.value) : null;
        if (UI?.setButtonLoading) UI.setButtonLoading('btn-create-link', false);

        if (res) {
          this.triggerHaptic('notification', 'success');
          const msg = (UI?.currentLang === 'ar') ? "تم اختصار الرابط بنجاح!" : "Link shortened!";
          if (UI?.showToast) UI.showToast(msg);
          if (titleInput) titleInput.value = '';
          if (urlInput) urlInput.value = '';
          this.loadUserLinks();
        }
      });
    }

    // 2. البحث والتصفية للروابط
    const searchInput = document.getElementById('search-links-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        if (Shortener && typeof Shortener.filterUserLinks === 'function') {
          Shortener.filterUserLinks(e.target.value);
        } else {
          this.loadUserLinks(e.target.value);
        }
      });
    }

    // 3. تعليمات ودليل الإيداع
    const btnDepositGuide = document.getElementById('btn-deposit-guide');
    if (btnDepositGuide) {
      btnDepositGuide.addEventListener('click', () => {
        this.triggerHaptic('selection');
        if (UI?.toggleInstructionsModal) UI.toggleInstructionsModal(true);
      });
    }

    const btnCloseInstructionsModal = document.getElementById('btn-close-instructions-modal');
    if (btnCloseInstructionsModal) {
      btnCloseInstructionsModal.addEventListener('click', () => {
        this.triggerHaptic('selection');
        if (UI?.toggleInstructionsModal) UI.toggleInstructionsModal(false);
      });
    }

    // 4. تغيير شبكة الإيداع ونسخ عناوين المحافظ
    const depositNetwork = document.getElementById('deposit-network');
    if (depositNetwork) {
      depositNetwork.addEventListener('change', (e) => {
        this.triggerHaptic('selection');
        if (UI?.handleNetworkChange) UI.handleNetworkChange(e.target.value);
      });
    }

    const btnCopyTrc20 = document.getElementById('btn-copy-trc20');
    if (btnCopyTrc20) {
      btnCopyTrc20.addEventListener('click', () => {
        this.triggerHaptic('impact', 'light');
        const addr = document.getElementById('addr-trc20')?.innerText;
        if (UI?.copyToClipboard) UI.copyToClipboard(addr);
      });
    }

    const btnCopyBep20 = document.getElementById('btn-copy-bep20');
    if (btnCopyBep20) {
      btnCopyBep20.addEventListener('click', () => {
        this.triggerHaptic('impact', 'light');
        const addr = document.getElementById('addr-bep20')?.innerText;
        if (UI?.copyToClipboard) UI.copyToClipboard(addr);
      });
    }

    // 5. تقديم طلب إيداع
    const btnDeposit = document.getElementById('btn-request-deposit');
    if (btnDeposit) {
      btnDeposit.addEventListener('click', async (e) => {
        e.preventDefault();
        this.triggerHaptic('impact', 'medium');

        if (Wallet && typeof Wallet.requestDeposit === 'function') {
          return Wallet.requestDeposit();
        }

        const network = document.getElementById('deposit-network')?.value;
        const amount = document.getElementById('deposit-amount')?.value;
        const txhash = document.getElementById('deposit-txhash')?.value;

        if (!network || !amount || !txhash) {
          const msg = (UI?.currentLang === 'ar') ? "يرجى ملء جميع حقول الإيداع" : "Please fill all deposit fields";
          if (UI?.showToast) UI.showToast(msg);
          return;
        }

        if (UI?.setButtonLoading) UI.setButtonLoading('btn-request-deposit', true);
        const res = (API && typeof API.requestDeposit === 'function') ? await API.requestDeposit(network, amount, txhash) : null;
        if (UI?.setButtonLoading) UI.setButtonLoading('btn-request-deposit', false);

        if (res && res.success) {
          this.triggerHaptic('notification', 'success');
          const msg = (UI?.currentLang === 'ar') ? "تم تقديم طلب الإيداع بنجاح!" : "Deposit submitted!";
          if (UI?.showToast) UI.showToast(msg);
          const depAmt = document.getElementById('deposit-amount');
          const depTx = document.getElementById('deposit-txhash');
          if (depAmt) depAmt.value = '';
          if (depTx) depTx.value = '';
        }
      });
    }

    // 6. التنقل المباشر داخل قسم المحفظة (إيداع / سحب)
    const walletNavDeposit = document.getElementById('wallet-nav-deposit');
    if (walletNavDeposit) {
      walletNavDeposit.addEventListener('click', () => {
        this.triggerHaptic('selection');
        if (UI?.switchWalletView) UI.switchWalletView('deposit');
      });
    }

    const walletNavWithdraw = document.getElementById('wallet-nav-withdraw');
    if (walletNavWithdraw) {
      walletNavWithdraw.addEventListener('click', () => {
        this.triggerHaptic('selection');
        if (UI?.switchWalletView) UI.switchWalletView('withdraw');
      });
    }

    // 7. تعديل وحفظ عنوان المحفظة
    const editWalletBtn = document.getElementById('edit-wallet-btn');
    if (editWalletBtn) {
      editWalletBtn.addEventListener('click', () => {
        this.triggerHaptic('selection');
        if (UI?.toggleWalletEdit) UI.toggleWalletEdit();
      });
    }

    const btnSaveWallet = document.getElementById('save-wallet-btn');
    if (btnSaveWallet) {
      btnSaveWallet.addEventListener('click', async (e) => {
        e.preventDefault();
        this.triggerHaptic('impact', 'medium');

        if (Wallet && typeof Wallet.saveSettings === 'function') {
          return Wallet.saveSettings();
        }

        const addrInput = document.getElementById('default-wallet');
        if (!addrInput || !addrInput.value) return;

        if (UI?.setButtonLoading) UI.setButtonLoading('save-wallet-btn', true);
        const res = (API && typeof API.updateWalletAddress === 'function') ? await API.updateWalletAddress(addrInput.value) : null;
        if (UI?.setButtonLoading) UI.setButtonLoading('save-wallet-btn', false);

        if (res && res.success) {
          this.triggerHaptic('notification', 'success');
          const msg = (UI?.currentLang === 'ar') ? "تم حفظ عنوان المحفظة!" : "Wallet saved!";
          if (UI?.showToast) UI.showToast(msg);
          if (UI?.toggleWalletEdit) UI.toggleWalletEdit();
        }
      });
    }

    // 8. احتساب مبالغ طلب السحب وإرساله
    const withdrawAmount = document.getElementById('withdraw-amount');
    if (withdrawAmount) {
      withdrawAmount.addEventListener('input', () => {
        if (Wallet && typeof Wallet.updateCalculations === 'function') {
          Wallet.updateCalculations();
        } else if (UI && typeof UI.updateWithdrawCalculations === 'function') {
          UI.updateWithdrawCalculations();
        }
      });
    }

    const btnWithdraw = document.getElementById('btn-request-withdraw');
    if (btnWithdraw) {
      btnWithdraw.addEventListener('click', async (e) => {
        e.preventDefault();
        this.triggerHaptic('impact', 'medium');

        if (Wallet && typeof Wallet.requestWithdrawal === 'function') {
          return Wallet.requestWithdrawal();
        }

        const amount = document.getElementById('withdraw-amount')?.value;
        const wallet = document.getElementById('default-wallet')?.value;

        if (!amount || amount < 30 || !wallet) {
          const msg = (UI?.currentLang === 'ar') ? "الحد الأدنى للسحب 30$ مع وجود محفظة" : "Min withdrawal is $30";
          if (UI?.showToast) UI.showToast(msg);
          return;
        }

        if (UI?.setButtonLoading) UI.setButtonLoading('btn-request-withdraw', true);
        const res = (API && typeof API.requestWithdrawal === 'function') ? await API.requestWithdrawal(amount, wallet) : null;
        if (UI?.setButtonLoading) UI.setButtonLoading('btn-request-withdraw', false);

        if (res && res.success) {
          this.triggerHaptic('notification', 'success');
          const msg = (UI?.currentLang === 'ar') ? "تم إرسال طلب السحب بنجاح!" : "Withdrawal submitted!";
          if (UI?.showToast) UI.showToast(msg);
          const wInput = document.getElementById('withdraw-amount');
          if (wInput) wInput.value = '';
          if (UI?.updateWithdrawCalculations) UI.updateWithdrawCalculations();
          this.loadDashboard();
        }
      });
    }

    // 9. اختيارات نوع الإعلان وإنشاؤه
    const adTypeSelect = document.getElementById('ad-type');
    if (adTypeSelect) {
      adTypeSelect.addEventListener('change', () => {
        this.triggerHaptic('selection');
        if (Ads && typeof Ads.onAdTypeChange === 'function') {
          Ads.onAdTypeChange();
        } else if (Ads && typeof Ads.onTypeChange === 'function') {
          Ads.onTypeChange();
        } else if (UI && typeof UI.onAdTypeChange === 'function') {
          UI.onAdTypeChange();
        }
      });
    }

    const btnCreateAd = document.getElementById('btn-create-ad');
    if (btnCreateAd) {
      btnCreateAd.addEventListener('click', async (e) => {
        e.preventDefault();
        this.triggerHaptic('impact', 'heavy');

        if (Ads && typeof Ads.createAdCampaign === 'function') {
          return Ads.createAdCampaign();
        }

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
          const msg = (UI?.currentLang === 'ar') ? "يرجى إكمال الحقول الرئيسية للإعلان" : "Please complete ad fields";
          if (UI?.showToast) UI.showToast(msg);
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

        if (UI?.setButtonLoading) UI.setButtonLoading('btn-create-ad', true);
        const res = (API && typeof API.createAdCampaign === 'function') ? await API.createAdCampaign(adData) : null;
        if (UI?.setButtonLoading) UI.setButtonLoading('btn-create-ad', false);

        if (res && res.success) {
          this.triggerHaptic('notification', 'success');
          const msg = (UI?.currentLang === 'ar') ? "تم إنشاء الحملة الإعلانية بنجاح!" : "Campaign created!";
          if (UI?.showToast) UI.showToast(msg);
        }
      });
    }

    // 10. اختيار اللغة ومشاركة رابط الإحالة
    const languageSelect = document.getElementById('language-select');
    if (languageSelect) {
      languageSelect.addEventListener('change', (e) => {
        this.triggerHaptic('selection');
        const lang = e.target.value;
        if (i18n && typeof i18n.setLanguage === 'function') {
          i18n.setLanguage(lang);
        } else if (typeof window.changeAppLanguage === 'function') {
          window.changeAppLanguage(lang);
        }
      });
    }

    const btnShareRef = document.getElementById('btn-share-ref');
    if (btnShareRef) {
      btnShareRef.addEventListener('click', () => {
        this.triggerHaptic('impact', 'light');
        if (UI && typeof UI.shareReferralLink === 'function') {
          UI.shareReferralLink();
        } else {
          const refInput = document.getElementById('ref-link');
          if (refInput && refInput.value) {
            window.Telegram?.WebApp?.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(refInput.value)}`);
          }
        }
      });
    }

    // 11. إغلاق إعلان الفيديو Overlay
    const btnCloseVideoAd = document.getElementById('btn-close-video-ad');
    if (btnCloseVideoAd) {
      btnCloseVideoAd.addEventListener('click', () => {
        this.triggerHaptic('selection');
        if (Ads && typeof Ads.closeVideo === 'function') {
          Ads.closeVideo();
        } else if (UI && typeof UI.closeVideoAd === 'function') {
          UI.closeVideoAd();
        }
      });
    }

    // 12. حفظ إعدادات لوحة التحكم للأدمن
    const btnAdminSave = document.getElementById('btn-admin-save-settings');
    if (btnAdminSave) {
      btnAdminSave.addEventListener('click', async () => {
        this.triggerHaptic('impact', 'medium');
        if (Admin && typeof Admin.saveSettings === 'function') {
          await Admin.saveSettings();
        }
      });
    }
  },

  /**
   * نقطة الانطلاق الرئيسية والبدء لتشغيل التطبيق بالكامل
   */
  init: async function () {
    try {
      const UI = getModule('UI');
      const API = getModule('API');
      const i18n = getModule('i18n');
      const Wallet = getModule('Wallet');
      const Shortener = getModule('Shortener');

      // 1. تهيئة بيئة تليجرام المدمجة
      this.initTelegramWebApp();

      // 2. عرض بيانات المستخدم الأولية للواجهة
      if (UI && typeof UI.renderTelegramUser === 'function') {
        UI.renderTelegramUser();
      }

      // 3. تهيئة اللغة وترجمة واجهة المستخدم
      if (i18n && typeof i18n.init === 'function') {
        i18n.init();
      }

      // 4. مصادقة المستخدم وجلب بيانات الملف الشخصي والصلاحيات
      let authenticated = false;
      let user = null;

      if (API && typeof API.authLogin === 'function') {
        const initData = window.Telegram?.WebApp?.initData || '';
        authenticated = await API.authLogin(initData);
      }

      try {
        if (API && typeof API.getProfile === 'function') {
          user = await API.getProfile();
        } else if (API && typeof API.getDashboardData === 'function') {
          const dashData = await API.getDashboardData();
          user = dashData ? (dashData.user || dashData) : null;
        }
      } catch (authErr) {
        console.warn("Profile fetch warning:", authErr);
      }

      // 5. التحقق من صلاحيات المدير واستحقاق لوحة الإدارة
      const isAdmin = !!(user && (user.role === 'admin' || user.isAdmin === true));
      this.setupAdminRole(isAdmin);

      // 6. التحقق من مسارات صفحات التحويل والجسر (/r/:code)
      const pathParts = window.location.pathname.split('/');
      if (pathParts.length >= 3 && pathParts[1] === 'r') {
        const shortCode = pathParts[2];
        if (shortCode) {
          await this.initBridgeLogic(shortCode);
          return;
        }
      }

      // 7. تهيئة الملاحة بين التبويبات وربط كافة الأحداث
      this.initTabNavigation();
      this.bindEventListeners();

      // 8. تحميل البيانات التشغيلية للوحة التحكم الرئيسية والروابط
      if (authenticated || user) {
        if (Wallet && typeof Wallet.loadUserData === 'function') {
          await Wallet.loadUserData();
        } else {
          await this.loadDashboard();
        }

        if (Shortener && typeof Shortener.fetchUserLinks === 'function') {
          await Shortener.fetchUserLinks();
        } else {
          await this.loadUserLinks();
        }
      }

    } catch (err) {
      console.error('Critical boot error in App.init:', err);
    }
  }
};

// -------------------------------------------------------------
// 3. تشغيل التطبيق فور اكتمال تحميل مستند الـ DOM
// -------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  window.App.init();
});

// تصدير الكود لدعم نظام الوحدات CommonJS
if (typeof module !== 'undefined' && module.exports) {
  module.exports = window.App;
}
