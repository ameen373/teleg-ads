// Telega.ads - Main Application Controller (public/js/app.js)

// استيراد الوحدات بأسلوب CommonJS لتوافقية بيئات التجميع والترميز
if (typeof require !== 'undefined') {
  try {
    var i18n = require('./i18n.js');
    var UI = require('./ui.js');
    var API = require('./api.js');
    var ShortenerModule = require('./shortener.js');
    var AdsModule = require('./ads.js');
    var WalletModule = require('./wallet.js');
    var AdminModule = require('./admin.js');
  } catch (e) {
    // التجاوز في حالة التشغيل المباشر داخل متصفح الويب
  }
}

// -------------------------------------------------------------
// 1. معالج الأخطاء العام (Global Error Handlers)
// -------------------------------------------------------------
window.onerror = function (message, source, lineno, colno, error) {
  console.error('[App Global Error]:', message, 'at', source, 'line:', lineno, colno, error);
  if (window.UI && typeof window.UI.showToast === 'function') {
    const lang = window.UI.currentLang || 'ar';
    window.UI.showToast(lang === 'ar' ? 'حدث خطأ غير متوقع في النظام' : 'An unexpected error occurred');
  }
  return true; // منع توقف التطبيق أو انهياره
};

window.addEventListener('unhandledrejection', function (event) {
  console.error('[Unhandled Rejection]:', event.reason);
  if (window.UI && typeof window.UI.showToast === 'function') {
    const lang = window.UI.currentLang || 'ar';
    window.UI.showToast(lang === 'ar' ? 'خطأ في الاتصال بالشبكة أو الاستجابة' : 'Network/Promise rejection error');
  }
});

// -------------------------------------------------------------
// 2. الكائن التشغيلي الرئيسي للواجهة والتطبيق (App Engine)
// -------------------------------------------------------------
window.App = {
  activeTab: 'dashboard',

  /**
   * دالة الاستجابة اللمسية (Haptic Feedback) عبر التليجرام
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

      window.isUserAdmin = !!isAdmin;

      if (isAdmin) {
        if (adminTabBtn) adminTabBtn.style.display = 'flex';
        adminElements.forEach(el => { if (el) el.style.display = ''; });

        if (window.AdminModule && typeof window.AdminModule.checkAdminAccess === 'function') {
          window.AdminModule.checkAdminAccess();
        } else if (window.Admin && typeof window.Admin.showAdminTab === 'function') {
          window.Admin.showAdminTab();
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

    try {
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

      // تحديث وتحميل البيانات الحية الخاصة بالتبويب المفتوح
      if (targetTabId === 'dashboard') {
        this.loadDashboard();
        this.loadUserLinks();
      } else if (targetTabId === 'wallet') {
        if (window.WalletModule && typeof window.WalletModule.loadUserData === 'function') {
          window.WalletModule.loadUserData();
        } else {
          this.loadDashboard();
        }
      } else if (targetTabId === 'ads') {
        if (window.AdsModule && typeof window.AdsModule.fetchUserAds === 'function') {
          window.AdsModule.fetchUserAds();
        } else if (window.Ads && typeof window.Ads.loadAds === 'function') {
          window.Ads.loadAds();
        }
      } else if (targetTabId === 'referral') {
        if (window.WalletModule && typeof window.WalletModule.fetchUserReferrals === 'function') {
          window.WalletModule.fetchUserReferrals();
        } else {
          this.loadDashboard();
        }
      } else if (targetTabId === 'admin') {
        if (window.isUserAdmin) {
          if (window.AdminModule && typeof window.AdminModule.loadAdminData === 'function') {
            window.AdminModule.loadAdminData();
          } else if (window.Admin && typeof window.Admin.loadOverview === 'function') {
            window.Admin.loadOverview();
          }
        }
      }
    } catch (error) {
      console.error('Switch tab error:', error);
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
      if (window.ShortenerModule && typeof window.ShortenerModule.initBridgeView === 'function') {
        await window.ShortenerModule.initBridgeView(code);
        return;
      }

      // المنطق الاحتياطي في حال عدم تحميل الموديول المخصص
      const appView = document.getElementById('app-view');
      const bridgeView = document.getElementById('bridge-view');

      if (appView) appView.classList.add('hidden');
      if (bridgeView) bridgeView.classList.remove('hidden');

      const apiInstance = window.API || {};
      const linkInfo = apiInstance.getBridgeLinkInfo ? await apiInstance.getBridgeLinkInfo(code) : null;
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
              if (apiInstance.recordBridgeImpression) {
                await apiInstance.recordBridgeImpression(code, linkInfo.impressionToken);
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
      this.triggerHaptic('impact', 'medium');
      const confirmMsg = (window.UI?.currentLang === 'ar') ? "هل أنت تأكد من حذف هذا الرابط؟" : "Delete this link?";
      if (!confirm(confirmMsg)) return;

      const apiInstance = window.API || {};
      const success = apiInstance.deleteLink ? await apiInstance.deleteLink(linkId) : false;
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

  /**
   * تحميل قائمة روابط المستخدم
   */
  loadUserLinks: async function (search = '') {
    try {
      if (window.ShortenerModule && typeof window.ShortenerModule.fetchUserLinks === 'function') {
        await window.ShortenerModule.fetchUserLinks(search);
      } else if (window.ShortenerModule && typeof window.ShortenerModule.loadLinks === 'function') {
        await window.ShortenerModule.loadLinks(search);
      } else if (window.Shortener && typeof window.Shortener.loadLinks === 'function') {
        await window.Shortener.loadLinks(search);
      } else if (window.API && typeof window.API.getUserLinks === 'function') {
        const links = await window.API.getUserLinks(search);
        window.UI?.renderLinksList(links);
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
      const apiInstance = window.API || {};
      if (typeof apiInstance.getDashboardData !== 'function') return;

      const data = await apiInstance.getDashboardData();
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
      if (window.WalletModule && typeof window.WalletModule.updateBalances === 'function') {
        window.WalletModule.updateBalances(data);
      } else if (window.Wallet && typeof window.Wallet.updateBalances === 'function') {
        window.Wallet.updateBalances(data);
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
    // 1. اختصار رابط جديد
    const btnCreateLink = document.getElementById('btn-create-link');
    if (btnCreateLink) {
      btnCreateLink.addEventListener('click', async (e) => {
        e.preventDefault();
        this.triggerHaptic('impact', 'medium');

        if (window.ShortenerModule && typeof window.ShortenerModule.handleShortenClick === 'function') {
          await window.ShortenerModule.handleShortenClick(e);
        } else {
          const titleInput = document.getElementById('link-title');
          const urlInput = document.getElementById('link-url');

          if (!urlInput || !urlInput.value) {
            const msg = (window.UI?.currentLang === 'ar') ? "يرجى إدخال الرابط الأصلي" : "Please enter original URL";
            window.UI?.showToast(msg);
            return;
          }

          window.UI?.setButtonLoading('btn-create-link', true);
          const res = window.API?.createShortLink ? await window.API.createShortLink(titleInput?.value || '', urlInput.value) : null;
          window.UI?.setButtonLoading('btn-create-link', false);

          if (res) {
            this.triggerHaptic('notification', 'success');
            const msg = (window.UI?.currentLang === 'ar') ? "تم اختصار الرابط بنجاح!" : "Link shortened!";
            window.UI?.showToast(msg);
            if (titleInput) titleInput.value = '';
            if (urlInput) urlInput.value = '';
            this.loadUserLinks();
          }
        }
      });
    }

    // 2. البحث والتصفية للروابط
    const searchInput = document.getElementById('search-links-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        if (window.ShortenerModule && typeof window.ShortenerModule.filterUserLinks === 'function') {
          window.ShortenerModule.filterUserLinks(e.target.value);
        } else {
          this.loadUserLinks(e.target.value);
        }
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

    // 5. تقديم طلب إيداع
    const btnDeposit = document.getElementById('btn-request-deposit');
    if (btnDeposit) {
      btnDeposit.addEventListener('click', async (e) => {
        e.preventDefault();
        this.triggerHaptic('impact', 'medium');

        if (window.WalletModule && typeof window.WalletModule.requestDeposit === 'function') {
          await window.WalletModule.requestDeposit();
        } else {
          const network = document.getElementById('deposit-network')?.value;
          const amount = document.getElementById('deposit-amount')?.value;
          const txhash = document.getElementById('deposit-txhash')?.value;

          if (!network || !amount || !txhash) {
            const msg = (window.UI?.currentLang === 'ar') ? "يرجى ملء جميع حقول الإيداع" : "Please fill all deposit fields";
            window.UI?.showToast(msg);
            return;
          }

          window.UI?.setButtonLoading('btn-request-deposit', true);
          const res = window.API?.requestDeposit ? await window.API.requestDeposit(network, amount, txhash) : null;
          window.UI?.setButtonLoading('btn-request-deposit', false);

          if (res && res.success) {
            this.triggerHaptic('notification', 'success');
            const msg = (window.UI?.currentLang === 'ar') ? "تم تقديم طلب الإيداع بنجاح!" : "Deposit submitted!";
            window.UI?.showToast(msg);
            const amtElem = document.getElementById('deposit-amount');
            const hashElem = document.getElementById('deposit-txhash');
            if (amtElem) amtElem.value = '';
            if (hashElem) hashElem.value = '';
          }
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

    const btnSaveWallet = document.getElementById('save-wallet-btn');
    if (btnSaveWallet) {
      btnSaveWallet.addEventListener('click', async (e) => {
        e.preventDefault();
        this.triggerHaptic('impact', 'medium');

        if (window.WalletModule && typeof window.WalletModule.saveSettings === 'function') {
          await window.WalletModule.saveSettings();
        } else {
          const addrInput = document.getElementById('default-wallet');
          if (!addrInput || !addrInput.value) return;

          window.UI?.setButtonLoading('save-wallet-btn', true);
          const res = window.API?.updateWalletAddress ? await window.API.updateWalletAddress(addrInput.value) : null;
          window.UI?.setButtonLoading('save-wallet-btn', false);

          if (res && res.success) {
            this.triggerHaptic('notification', 'success');
            const msg = (window.UI?.currentLang === 'ar') ? "تم حفظ عنوان المحفظة!" : "Wallet saved!";
            window.UI?.showToast(msg);
            window.UI?.toggleWalletEdit();
          }
        }
      });
    }

    // 8. حسابات طلب السحب وإرساله
    const withdrawAmount = document.getElementById('withdraw-amount');
    if (withdrawAmount) {
      withdrawAmount.addEventListener('input', () => {
        if (window.WalletModule && typeof window.WalletModule.updateCalculations === 'function') {
          window.WalletModule.updateCalculations();
        } else if (window.Wallet && typeof window.Wallet.updateCalculations === 'function') {
          window.Wallet.updateCalculations();
        } else {
          window.UI?.updateWithdrawCalculations();
        }
      });
    }

    const btnWithdraw = document.getElementById('btn-request-withdraw');
    if (btnWithdraw) {
      btnWithdraw.addEventListener('click', async (e) => {
        e.preventDefault();
        this.triggerHaptic('impact', 'medium');

        if (window.WalletModule && typeof window.WalletModule.requestWithdrawal === 'function') {
          await window.WalletModule.requestWithdrawal();
        } else {
          const amount = document.getElementById('withdraw-amount')?.value;
          const wallet = document.getElementById('default-wallet')?.value;

          if (!amount || amount < 30 || !wallet) {
            const msg = (window.UI?.currentLang === 'ar') ? "الحد الأدنى للسحب 30$ مع وجود محفظة" : "Min withdrawal is $30";
            window.UI?.showToast(msg);
            return;
          }

          window.UI?.setButtonLoading('btn-request-withdraw', true);
          const res = window.API?.requestWithdrawal ? await window.API.requestWithdrawal(amount, wallet) : null;
          window.UI?.setButtonLoading('btn-request-withdraw', false);

          if (res && res.success) {
            this.triggerHaptic('notification', 'success');
            const msg = (window.UI?.currentLang === 'ar') ? "تم إرسال طلب السحب بنجاح!" : "Withdrawal submitted!";
            window.UI?.showToast(msg);
            const amtInput = document.getElementById('withdraw-amount');
            if (amtInput) amtInput.value = '';
            if (window.UI?.updateWithdrawCalculations) window.UI.updateWithdrawCalculations();
            this.loadDashboard();
          }
        }
      });
    }

    // 9. اختيارات نوع الإعلان
    const adTypeSelect = document.getElementById('ad-type');
    if (adTypeSelect) {
      adTypeSelect.addEventListener('change', () => {
        this.triggerHaptic('selection');
        if (window.AdsModule && typeof window.AdsModule.onAdTypeChange === 'function') {
          window.AdsModule.onAdTypeChange();
        } else if (window.Ads && typeof window.Ads.onTypeChange === 'function') {
          window.Ads.onTypeChange();
        } else {
          window.UI?.onAdTypeChange();
        }
      });
    }

    // 10. إنشاء حملة إعلانية
    const btnCreateAd = document.getElementById('btn-create-ad');
    if (btnCreateAd) {
      btnCreateAd.addEventListener('click', async (e) => {
        e.preventDefault();
        this.triggerHaptic('impact', 'heavy');

        if (window.AdsModule && typeof window.AdsModule.createAdCampaign === 'function') {
          await window.AdsModule.createAdCampaign();
        } else {
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
          const res = window.API?.createAdCampaign ? await window.API.createAdCampaign(adData) : null;
          window.UI?.setButtonLoading('btn-create-ad', false);

          if (res && res.success) {
            this.triggerHaptic('notification', 'success');
            const msg = (window.UI?.currentLang === 'ar') ? "تم إنشاء الحملة الإعلانية بنجاح!" : "Campaign created!";
            window.UI?.showToast(msg);
          }
        }
      });
    }

    // 11. مشاركة رابط الإحالة عبر تليجرام
    const btnShareRef = document.getElementById('btn-share-ref');
    if (btnShareRef) {
      btnShareRef.addEventListener('click', () => {
        this.triggerHaptic('impact', 'light');
        if (window.UI && typeof window.UI.shareReferralLink === 'function') {
          window.UI.shareReferralLink();
        } else {
          const refInput = document.getElementById('ref-link');
          if (refInput && refInput.value) {
            window.Telegram?.WebApp?.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(refInput.value)}`);
          }
        }
      });
    }

    // 12. اختيار لغة التطبيق
    const languageSelect = document.getElementById('language-select');
    if (languageSelect) {
      languageSelect.addEventListener('change', (e) => {
        this.triggerHaptic('selection');
        const lang = e.target.value;
        if (window.i18n && typeof window.i18n.setLanguage === 'function') {
          window.i18n.setLanguage(lang);
        } else if (typeof window.changeAppLanguage === 'function') {
          window.changeAppLanguage(lang);
        }
      });
    }

    // 13. إغلاق إعلان الفيديو Overlay
    const btnCloseVideoAd = document.getElementById('btn-close-video-ad');
    if (btnCloseVideoAd) {
      btnCloseVideoAd.addEventListener('click', () => {
        this.triggerHaptic('selection');
        if (window.AdsModule && typeof window.AdsModule.closeVideo === 'function') {
          window.AdsModule.closeVideo();
        } else if (window.Ads && typeof window.Ads.closeVideo === 'function') {
          window.Ads.closeVideo();
        } else {
          window.UI?.closeVideoAd();
        }
      });
    }

    // 14. ربط أحداث لوحة الإدارة
    const btnAdminSave = document.getElementById('btn-admin-save-settings');
    if (btnAdminSave) {
      btnAdminSave.addEventListener('click', async () => {
        this.triggerHaptic('impact', 'medium');
        if (window.AdminModule && typeof window.AdminModule.saveSettings === 'function') {
          await window.AdminModule.saveSettings();
        } else if (window.Admin && typeof window.Admin.saveSettings === 'function') {
          await window.Admin.saveSettings();
        }
      });
    }
  },

  /**
   * نقطة الانطلاق الرئيسية والبدء لتشغيل التطبيق بالكامل
   */
  init: async function () {
    try {
      // 1. تهيئة بيئة تليجرام المدمجة
      this.initTelegramWebApp();

      // 2. تهيئة اللغة وترجمة واجهة المستخدم
      if (window.i18n && typeof window.i18n.init === 'function') {
        window.i18n.init();
      }

      // 3. عرض بيانات المستخدم الأولية للواجهة
      if (window.UI && typeof window.UI.renderTelegramUser === 'function') {
        window.UI.renderTelegramUser();
      }

      // 4. مصادقة المستخدم وتأكيد الجلسة
      let authenticated = false;
      let user = null;
      try {
        const apiInstance = window.API || (typeof require !== 'undefined' ? require('./api.js') : {});
        if (typeof apiInstance.authLogin === 'function') {
          const initData = window.Telegram?.WebApp?.initData || '';
          authenticated = await apiInstance.authLogin(initData);
        }

        if (typeof apiInstance.getProfile === 'function') {
          user = await apiInstance.getProfile();
        } else if (typeof apiInstance.getDashboardData === 'function') {
          const dashData = await apiInstance.getDashboardData();
          user = dashData ? (dashData.user || dashData) : null;
          if (dashData) authenticated = true;
        }
      } catch (authErr) {
        console.error("Authentication/Profile Fetch Error:", authErr);
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

      // 7. تهيئة الملاحة بين التبويبات وربط الأحداث
      this.initTabNavigation();
      this.bindEventListeners();

      // 8. تحميل البيانات التشغيلية للوحة التحكم الرئيسية
      if (authenticated || user) {
        await this.loadDashboard();
        await this.loadUserLinks();
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
