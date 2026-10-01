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
  // دالة الاستجابة اللمسية (Haptic Feedback) عبر التليجرام
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

  // تهيئة واجهة الجسر للروابط المقتطعة (/r/:code)
  initBridgeLogic: async function(code) {
    try {
      const appView = document.getElementById('app-view');
      const bridgeView = document.getElementById('bridge-view');

      if (appView) appView.classList.add('hidden');
      if (bridgeView) bridgeView.classList.remove('hidden');

      if (!window.API || typeof window.API.getBridgeLinkInfo !== 'function') return;

      const linkInfo = await window.API.getBridgeLinkInfo(code);
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
              if (window.API?.recordBridgeImpression) {
                await window.API.recordBridgeImpression(code, linkInfo.impressionToken);
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

  // حذف رابط مقتطع
  deleteLink: async function(linkId) {
    try {
      this.triggerHaptic('impact', 'medium');
      const confirmMsg = (window.UI?.currentLang === 'ar') ? "هل أنت تأكد من حذف هذا الرابط؟" : "Delete this link?";
      if (!confirm(confirmMsg)) return;

      if (!window.API || typeof window.API.deleteLink !== 'function') return;

      const success = await window.API.deleteLink(linkId);
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

  // تحميل قائمة روابط المستخدم
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

  // تحميل بيانات لوحة التحكم الرئيسية
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

      // التحقق من صلاحيات الأدمن وإظهار لوحة التحكم
      if (data.isAdmin) {
        window.isUserAdmin = true;
        const adminObj = window.Admin || window.AdminModule;
        if (adminObj && typeof adminObj.showAdminTab === 'function') {
          adminObj.showAdminTab();
        }
      }
    } catch (error) {
      console.error('Load dashboard error:', error);
    }
  },

  // ربط جميع أحداث العناصر والأزرار
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

        if (!window.API || typeof window.API.createShortLink !== 'function') return;

        window.UI?.setButtonLoading('btn-create-link', true);
        const res = await window.API.createShortLink(titleInput.value, urlInput.value);
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

        if (!window.API || typeof window.API.requestDeposit !== 'function') return;

        window.UI?.setButtonLoading('btn-request-deposit', true);
        const res = await window.API.requestDeposit(network, amount, txhash);
        window.UI?.setButtonLoading('btn-request-deposit', false);

        if (res && res.success) {
          this.triggerHaptic('notification', 'success');
          const msg = (window.UI?.currentLang === 'ar') ? "تم تقديم طلب الإيداع بنجاح!" : "Deposit submitted!";
          window.UI?.showToast(msg);
          const depAmountEl = document.getElementById('deposit-amount');
          const depTxEl = document.getElementById('deposit-txhash');
          if (depAmountEl) depAmountEl.value = '';
          if (depTxEl) depTxEl.value = '';
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

        if (!window.API || typeof window.API.updateWalletAddress !== 'function') return;

        window.UI?.setButtonLoading('save-wallet-btn', true);
        const res = await window.API.updateWalletAddress(addrInput.value);
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
        } else if (window.UI && typeof window.UI.updateWithdrawCalculations === 'function') {
          window.UI.updateWithdrawCalculations();
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

        if (!window.API || typeof window.API.requestWithdrawal !== 'function') return;

        window.UI?.setButtonLoading('btn-request-withdraw', true);
        const res = await window.API.requestWithdrawal(amount, wallet);
        window.UI?.setButtonLoading('btn-request-withdraw', false);

        if (res && res.success) {
          this.triggerHaptic('notification', 'success');
          const msg = (window.UI?.currentLang === 'ar') ? "تم إرسال طلب السحب بنجاح!" : "Withdrawal submitted!";
          window.UI?.showToast(msg);
          const wAmountEl = document.getElementById('withdraw-amount');
          if (wAmountEl) wAmountEl.value = '';
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
        } else if (window.UI && typeof window.UI.onAdTypeChange === 'function') {
          window.UI.onAdTypeChange();
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

        if (!window.API || typeof window.API.createAdCampaign !== 'function') return;

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
        const res = await window.API.createAdCampaign(adData);
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
        } else if (window.UI && typeof window.UI.closeVideoAd === 'function') {
          window.UI.closeVideoAd();
        }
      });
    }

    // 14. التنقل عبر الشريط السفلي (Navigation Dock Buttons)
    const navDockTabs = ['dashboard', 'wallet', 'ads', 'referral', 'settings', 'admin'];
    navDockTabs.forEach(tab => {
      const btn = document.getElementById(`tab-btn-${tab}`);
      if (btn) {
        btn.addEventListener('click', () => {
          this.triggerHaptic('selection');
          if (window.UI && typeof window.UI.switchTab === 'function') {
            window.UI.switchTab(tab);
          }
          if (tab === 'admin') {
            const adminObj = window.Admin || window.AdminModule;
            if (adminObj && typeof adminObj.loadOverview === 'function') {
              adminObj.loadOverview();
            }
          }
        });
      }
    });

    // 15. ربط أحداث وحدة لوحة الإدارة (Admin Module Events)
    const btnAdminSave = document.getElementById('btn-admin-save-settings');
    if (btnAdminSave) {
      btnAdminSave.addEventListener('click', async () => {
        this.triggerHaptic('impact', 'medium');
        const adminObj = window.Admin || window.AdminModule;
        if (adminObj && typeof adminObj.saveSettings === 'function') {
          await adminObj.saveSettings();
        }
      });
    }
  },

  // تهيئة تطبيق تليجرام المدمج (Telegram WebApp)
  initTelegramWebApp: function() {
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

  // نقطة الانطلاق الشاملة للواجهة للتطبيق
  init: async function() {
    try {
      // 1. تهيئة تليجرام WebApp
      this.initTelegramWebApp();

      // 2. عرض بيانات المستخدم الأولية في الواجهة
      if (window.UI && typeof window.UI.renderTelegramUser === 'function') {
        window.UI.renderTelegramUser();
      }

      // 3. تهيئة وحدات اللغات
      if (window.i18n && typeof window.i18n.init === 'function') {
        window.i18n.init();
      }

      // 4. مصادقة المستخدم وتأكيد الجلسة مع api.js
      let authenticated = false;
      if (window.API && typeof window.API.authLogin === 'function') {
        const initData = window.Telegram?.WebApp?.initData || '';
        authenticated = await window.API.authLogin(initData);
      }

      // 5. التحقق من مسار رابط الجسر (/r/:code)
      const pathParts = window.location.pathname.split('/');
      if (pathParts.length >= 3 && pathParts[1] === 'r') {
        const code = pathParts[2];
        if (code) {
          await this.initBridgeLogic(code);
          return;
        }
      }

      // 6. ربط الأحداث لجميع المكونات والأزرار
      this.bindEventListeners();

      // 7. تحميل البيانات الأساسية في حال نجاح المصادقة
      if (authenticated) {
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
