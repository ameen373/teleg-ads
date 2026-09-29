// Telega.ads - Main Application Controller (Entry Point)

// استيراد الوحدات عبر نظام CommonJS في حال استخدام حزم مثل Browserify/Webpack
if (typeof require !== 'undefined') {
  try {
    if (typeof window !== 'undefined') {
      window.UI = window.UI || require('./ui.js');
      window.API = window.API || require('./api.js');
      window.Shortener = window.Shortener || require('./shortener.js');
      window.Ads = window.Ads || require('./ads.js');
      window.Wallet = window.Wallet || require('./wallet.js');
      window.Admin = window.Admin || require('./admin.js');
      window.I18n = window.I18n || require('./i18n.js');
    }
  } catch (err) {
    console.warn("تعذر تحميل الموديولات عبر require، سيتم الاعتماد على النطاق العام (window):", err);
  }
}

// الكائن الرئيسي للتطبيق
window.App = {
  // دالة الاستجابة اللمسية (Haptic Feedback) عبر Telegram WebApp API
  triggerHaptic: function(type = 'light') {
    try {
      const tg = window.Telegram?.WebApp;
      if (!tg || !tg.HapticFeedback) return;

      if (type === 'selection') {
        tg.HapticFeedback.selectionChanged();
      } else if (['light', 'medium', 'heavy', 'rigid', 'soft'].includes(type)) {
        tg.HapticFeedback.impactOccurred(type);
      } else if (['error', 'success', 'warning'].includes(type)) {
        tg.HapticFeedback.notificationOccurred(type);
      }
    } catch (e) {
      console.error("خطأ أثناء تشغيل Haptic Feedback:", e);
    }
  },

  // منطق صفحة الجسر الانتقالية (/r/:code)
  initBridgeLogic: async function(code) {
    try {
      const appView = document.getElementById('app-view');
      const bridgeView = document.getElementById('bridge-view');

      if (appView) appView.classList.add('hidden');
      if (bridgeView) bridgeView.classList.remove('hidden');

      const linkInfo = await window.API.getBridgeLinkInfo(code);
      if (!linkInfo || !linkInfo.targetUrl) {
        this.triggerHaptic('error');
        if (window.UI && typeof window.UI.showToast === 'function') {
          window.UI.showToast(window.UI.currentLang === 'ar' ? "الرابط غير صالح أو غير موجود" : "Invalid link");
        }
        return;
      }

      if (window.UI && typeof window.UI.adaptBridgeUI === 'function') {
        window.UI.adaptBridgeUI(linkInfo.targetUrl, linkInfo.title);
      }

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
              this.triggerHaptic('medium');
              if (window.UI && typeof window.UI.setButtonLoading === 'function') {
                window.UI.setButtonLoading('go-btn', true);
              }
              await window.API.recordBridgeImpression(code, linkInfo.impressionToken);
              window.location.href = linkInfo.targetUrl;
            };
          }
        }
      }, 1000);
    } catch (error) {
      console.error("خطأ في تهيئة صفحة الجسر:", error);
    }
  },

  // حذف رابط محدد
  deleteLink: async function(linkId) {
    try {
      this.triggerHaptic('warning');
      const confirmMsg = window.UI?.currentLang === 'ar' ? "هل أنت تأكد من حذف هذا الرابط؟" : "Delete this link?";
      if (!confirm(confirmMsg)) return;

      const success = await window.API.deleteLink(linkId);
      if (success) {
        this.triggerHaptic('success');
        if (window.UI && typeof window.UI.showToast === 'function') {
          window.UI.showToast(window.UI.currentLang === 'ar' ? "تم حذف الرابط بنجاح" : "Link deleted");
        }
        await this.loadUserLinks();
      }
    } catch (error) {
      console.error("خطأ أثناء حذف الرابط:", error);
    }
  },

  // جلب وعرض روابط المستخدم
  loadUserLinks: async function(search = '') {
    try {
      const links = await window.API.getUserLinks(search);
      if (window.UI && typeof window.UI.renderLinksList === 'function') {
        window.UI.renderLinksList(links);
      }
    } catch (error) {
      console.error("خطأ أثناء تحميل الروابط:", error);
    }
  },

  // تحميل بيانات لوحة التحكم
  loadDashboard: async function() {
    try {
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
    } catch (error) {
      console.error("خطأ في تحميل لوحة التحكم:", error);
    }
  },

  // ربط كافة مستمعي الأحداث (Event Listeners)
  bindEventListeners: function() {
    // 1. حدث إنشاء رابط جديد
    const btnCreateLink = document.getElementById('btn-create-link');
    if (btnCreateLink) {
      btnCreateLink.addEventListener('click', async (e) => {
        e.preventDefault();
        this.triggerHaptic('light');

        const titleInput = document.getElementById('link-title');
        const urlInput = document.getElementById('link-url');
        if (!urlInput || !urlInput.value) {
          this.triggerHaptic('error');
          if (window.UI) window.UI.showToast(window.UI.currentLang === 'ar' ? "يرجى إدخال الرابط الأصلي" : "Please enter original URL");
          return;
        }

        if (window.UI) window.UI.setButtonLoading('btn-create-link', true);
        const res = await window.API.createShortLink(titleInput ? titleInput.value : '', urlInput.value);
        if (window.UI) window.UI.setButtonLoading('btn-create-link', false);

        if (res) {
          this.triggerHaptic('success');
          if (window.UI) window.UI.showToast(window.UI.currentLang === 'ar' ? "تم اختصار الرابط بنجاح!" : "Link shortened!");
          if (titleInput) titleInput.value = '';
          urlInput.value = '';
          await this.loadUserLinks();
        }
      });
    }

    // 2. حدث البحث في الروابط
    const searchLinksInput = document.getElementById('search-links-input');
    if (searchLinksInput) {
      searchLinksInput.addEventListener('input', (e) => {
        this.loadUserLinks(e.target.value);
      });
    }

    // 3. أحداث النافذة المنبثقة لتعليمات الإيداع
    const btnDepositGuide = document.getElementById('btn-deposit-guide');
    if (btnDepositGuide) {
      btnDepositGuide.addEventListener('click', () => {
        this.triggerHaptic('light');
        if (window.UI) window.UI.toggleInstructionsModal(true);
      });
    }

    const btnCloseInstructionsModal = document.getElementById('btn-close-instructions-modal');
    if (btnCloseInstructionsModal) {
      btnCloseInstructionsModal.addEventListener('click', () => {
        this.triggerHaptic('light');
        if (window.UI) window.UI.toggleInstructionsModal(false);
      });
    }

    // 4. تغيير شبكة الإيداع ونسخ العناوين
    const depositNetwork = document.getElementById('deposit-network');
    if (depositNetwork) {
      depositNetwork.addEventListener('change', (e) => {
        this.triggerHaptic('selection');
        if (window.UI) window.UI.handleNetworkChange(e.target.value);
      });
    }

    const btnCopyTrc20 = document.getElementById('btn-copy-trc20');
    if (btnCopyTrc20) {
      btnCopyTrc20.addEventListener('click', () => {
        this.triggerHaptic('light');
        const addr = document.getElementById('addr-trc20')?.innerText;
        if (window.UI) window.UI.copyToClipboard(addr);
      });
    }

    const btnCopyBep20 = document.getElementById('btn-copy-bep20');
    if (btnCopyBep20) {
      btnCopyBep20.addEventListener('click', () => {
        this.triggerHaptic('light');
        const addr = document.getElementById('addr-bep20')?.innerText;
        if (window.UI) window.UI.copyToClipboard(addr);
      });
    }

    // 5. تقديم طلب الإيداع
    const btnRequestDeposit = document.getElementById('btn-request-deposit');
    if (btnRequestDeposit) {
      btnRequestDeposit.addEventListener('click', async () => {
        this.triggerHaptic('medium');
        const network = document.getElementById('deposit-network')?.value;
        const amount = document.getElementById('deposit-amount')?.value;
        const txhash = document.getElementById('deposit-txhash')?.value;

        if (!network || !amount || !txhash) {
          this.triggerHaptic('error');
          if (window.UI) window.UI.showToast(window.UI.currentLang === 'ar' ? "يرجى ملء جميع حقول الإيداع" : "Please fill all deposit fields");
          return;
        }

        if (window.UI) window.UI.setButtonLoading('btn-request-deposit', true);
        const res = await window.API.requestDeposit(network, amount, txhash);
        if (window.UI) window.UI.setButtonLoading('btn-request-deposit', false);

        if (res && res.success) {
          this.triggerHaptic('success');
          if (window.UI) window.UI.showToast(window.UI.currentLang === 'ar' ? "تم تقديم طلب الإيداع بنجاح!" : "Deposit submitted!");
          document.getElementById('deposit-amount').value = '';
          document.getElementById('deposit-txhash').value = '';
        }
      });
    }

    // 6. التنقل داخل واجهة المحفظة (إيداع / سحب)
    const walletNavDeposit = document.getElementById('wallet-nav-deposit');
    if (walletNavDeposit) {
      walletNavDeposit.addEventListener('click', () => {
        this.triggerHaptic('selection');
        if (window.UI) window.UI.switchWalletView('deposit');
      });
    }

    const walletNavWithdraw = document.getElementById('wallet-nav-withdraw');
    if (walletNavWithdraw) {
      walletNavWithdraw.addEventListener('click', () => {
        this.triggerHaptic('selection');
        if (window.UI) window.UI.switchWalletView('withdraw');
      });
    }

    // 7. تعديل وحفظ عنوان المحفظة
    const editWalletBtn = document.getElementById('edit-wallet-btn');
    if (editWalletBtn) {
      editWalletBtn.addEventListener('click', () => {
        this.triggerHaptic('light');
        if (window.UI) window.UI.toggleWalletEdit();
      });
    }

    const saveWalletBtn = document.getElementById('save-wallet-btn');
    if (saveWalletBtn) {
      saveWalletBtn.addEventListener('click', async () => {
        this.triggerHaptic('medium');
        const addrInput = document.getElementById('default-wallet');
        if (!addrInput || !addrInput.value) return;

        if (window.UI) window.UI.setButtonLoading('save-wallet-btn', true);
        const res = await window.API.updateWalletAddress(addrInput.value);
        if (window.UI) window.UI.setButtonLoading('save-wallet-btn', false);

        if (res && res.success) {
          this.triggerHaptic('success');
          if (window.UI) window.UI.showToast(window.UI.currentLang === 'ar' ? "تم حفظ عنوان المحفظة!" : "Wallet saved!");
          if (window.UI) window.UI.toggleWalletEdit();
        }
      });
    }

    // 8. حسابات وطلب السحب
    const withdrawAmount = document.getElementById('withdraw-amount');
    if (withdrawAmount) {
      withdrawAmount.addEventListener('input', () => {
        if (window.UI) window.UI.updateWithdrawCalculations();
      });
    }

    const btnRequestWithdraw = document.getElementById('btn-request-withdraw');
    if (btnRequestWithdraw) {
      btnRequestWithdraw.addEventListener('click', async () => {
        this.triggerHaptic('medium');
        const amount = document.getElementById('withdraw-amount')?.value;
        const wallet = document.getElementById('default-wallet')?.value;

        if (!amount || amount < 30 || !wallet) {
          this.triggerHaptic('error');
          if (window.UI) window.UI.showToast(window.UI.currentLang === 'ar' ? "الحد الأدنى للسحب 30$ مع وجود محفظة" : "Min withdrawal is $30");
          return;
        }

        if (window.UI) window.UI.setButtonLoading('btn-request-withdraw', true);
        const res = await window.API.requestWithdrawal(amount, wallet);
        if (window.UI) window.UI.setButtonLoading('btn-request-withdraw', false);

        if (res && res.success) {
          this.triggerHaptic('success');
          if (window.UI) window.UI.showToast(window.UI.currentLang === 'ar' ? "تم إرسال طلب السحب بنجاح!" : "Withdrawal submitted!");
          document.getElementById('withdraw-amount').value = '';
          if (window.UI) window.UI.updateWithdrawCalculations();
          await this.loadDashboard();
        }
      });
    }

    // 9. اختار نوع الإعلان
    const adType = document.getElementById('ad-type');
    if (adType) {
      adType.addEventListener('change', () => {
        this.triggerHaptic('selection');
        if (window.UI) window.UI.onAdTypeChange();
      });
    }

    // 10. إنشاء حملة إعلانية
    const btnCreateAd = document.getElementById('btn-create-ad');
    if (btnCreateAd) {
      btnCreateAd.addEventListener('click', async () => {
        this.triggerHaptic('medium');
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
          this.triggerHaptic('error');
          if (window.UI) window.UI.showToast(window.UI.currentLang === 'ar' ? "يرجى إكمال الحقول الرئيسية للإعلان" : "Please complete ad fields");
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

        if (window.UI) window.UI.setButtonLoading('btn-create-ad', true);
        const res = await window.API.createAdCampaign(adData);
        if (window.UI) window.UI.setButtonLoading('btn-create-ad', false);

        if (res && res.success) {
          this.triggerHaptic('success');
          if (window.UI) window.UI.showToast(window.UI.currentLang === 'ar' ? "تم إنشاء الحملة الإعلانية بنجاح!" : "Campaign created!");
        }
      });
    }

    // 11. مشاركة رابط الإحالة
    const btnShareRef = document.getElementById('btn-share-ref');
    if (btnShareRef) {
      btnShareRef.addEventListener('click', () => {
        this.triggerHaptic('light');
        if (window.UI) window.UI.shareReferralLink();
      });
    }

    // 12. تغيير لغة التطبيق
    const languageSelect = document.getElementById('language-select');
    if (languageSelect) {
      languageSelect.addEventListener('change', (e) => {
        this.triggerHaptic('selection');
        if (typeof window.changeAppLanguage === 'function') {
          window.changeAppLanguage(e.target.value);
        } else if (window.I18n && typeof window.I18n.setLanguage === 'function') {
          window.I18n.setLanguage(e.target.value);
        }
      });
    }

    // 13. إغلاق إعلان الفيديو
    const btnCloseVideoAd = document.getElementById('btn-close-video-ad');
    if (btnCloseVideoAd) {
      btnCloseVideoAd.addEventListener('click', () => {
        this.triggerHaptic('light');
        if (window.UI) window.UI.closeVideoAd();
      });
    }

    // 14. أزرار الشريط السفلي (Navigation Dock Tabs)
    const navDockTabs = ['dashboard', 'wallet', 'ads', 'referral', 'settings', 'admin'];
    navDockTabs.forEach(tab => {
      const btn = document.getElementById(`tab-btn-${tab}`);
      if (btn) {
        btn.addEventListener('click', () => {
          this.triggerHaptic('selection');
          if (window.UI && typeof window.UI.switchTab === 'function') {
            window.UI.switchTab(tab);
          }
        });
      }
    });
  }
};

// تهيئة وتشغيل التطبيق عند اكتمال تحميل DOM
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // 1. تهيئة Telegram WebApp
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
      if (typeof tg.enableClosingConfirmation === 'function') {
        tg.enableClosingConfirmation();
      }
    }

    // 2. عرض بيانات مستخدم تلجرام في الواجهة
    if (window.UI && typeof window.UI.renderTelegramUser === 'function') {
      window.UI.renderTelegramUser();
    }

    // 3. مصادقة المستخدم عبر API
    let authenticated = false;
    if (window.API && typeof window.API.authLogin === 'function') {
      authenticated = await window.API.authLogin();
    }

    // 4. التحقق من مسار الجسر (/r/:code)
    const pathParts = window.location.pathname.split('/');
    if (pathParts.length >= 3 && pathParts[1] === 'r') {
      const code = pathParts[2];
      if (code) {
        await window.App.initBridgeLogic(code);
        return;
      }
    }

    // 5. ربط أحداث العناصر التفاعلية
    window.App.bindEventListeners();

    // 6. تحميل بيانات لوحة التحكم والروابط إذا كانت المصادقة ناجحة
    if (authenticated) {
      await window.App.loadDashboard();
      await window.App.loadUserLinks();
    }
  } catch (err) {
    console.error("خطأ أثناء تشغيل التطبيق الرئيسية:", err);
  }
});

// تصدير الكائن بنظام CommonJS للمحيطات التي تدعمه
if (typeof module !== 'undefined' && module.exports) {
  module.exports = window.App;
}
