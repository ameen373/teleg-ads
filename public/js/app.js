// Telega.ads - Main Application Controller
window.App = {
  initBridgeLogic: async function(code) {
    const appView = document.getElementById('app-view');
    const bridgeView = document.getElementById('bridge-view');

    if (appView) appView.classList.add('hidden');
    if (bridgeView) bridgeView.classList.remove('hidden');

    const linkInfo = await window.API.getBridgeLinkInfo(code);
    if (!linkInfo || !linkInfo.targetUrl) {
      window.UI.showToast(window.UI.currentLang === 'ar' ? "الرابط غير صالح أو غير موجود" : "Invalid link");
      return;
    }

    window.UI.adaptBridgeUI(linkInfo.targetUrl, linkInfo.title);

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
            window.UI.setButtonLoading('go-btn', true);
            await window.API.recordBridgeImpression(code, linkInfo.impressionToken);
            window.location.href = linkInfo.targetUrl;
          };
        }
      }
    }, 1000);
  },

  deleteLink: async function(linkId) {
    if (!confirm(window.UI.currentLang === 'ar' ? "هل أنت تأكد من حذف هذا الرابط؟" : "Delete this link?")) return;
    const success = await window.API.deleteLink(linkId);
    if (success) {
      window.UI.showToast(window.UI.currentLang === 'ar' ? "تم حذف الرابط بنجاح" : "Link deleted");
      this.loadUserLinks();
    }
  },

  loadUserLinks: async function(search = '') {
    const links = await window.API.getUserLinks(search);
    window.UI.renderLinksList(links);
  },

  loadDashboard: async function() {
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
  },

  bindEventListeners: function() {
    // 1. Create Link Event
    const btnCreateLink = document.getElementById('btn-create-link');
    if (btnCreateLink) {
      btnCreateLink.addEventListener('click', async (e) => {
        e.preventDefault();
        const titleInput = document.getElementById('link-title');
        const urlInput = document.getElementById('link-url');
        if (!urlInput || !urlInput.value) {
          window.UI.showToast(window.UI.currentLang === 'ar' ? "يرجى إدخال الرابط الأصلي" : "Please enter original URL");
          return;
        }
        window.UI.setButtonLoading('btn-create-link', true);
        const res = await window.API.createShortLink(titleInput.value, urlInput.value);
        window.UI.setButtonLoading('btn-create-link', false);
        if (res) {
          window.UI.showToast(window.UI.currentLang === 'ar' ? "تم اختصار الرابط بنجاح!" : "Link shortened!");
          titleInput.value = '';
          urlInput.value = '';
          this.loadUserLinks();
        }
      });
    }

    // 2. Search Links Event
    const searchLinksInput = document.getElementById('search-links-input');
    if (searchLinksInput) {
      searchLinksInput.addEventListener('input', (e) => {
        this.loadUserLinks(e.target.value);
      });
    }

    // 3. Deposit Guide & Modal Events
    const btnDepositGuide = document.getElementById('btn-deposit-guide');
    if (btnDepositGuide) {
      btnDepositGuide.addEventListener('click', () => window.UI.toggleInstructionsModal(true));
    }

    const btnCloseInstructionsModal = document.getElementById('btn-close-instructions-modal');
    if (btnCloseInstructionsModal) {
      btnCloseInstructionsModal.addEventListener('click', () => window.UI.toggleInstructionsModal(false));
    }

    // 4. Deposit Network & Copy Events
    const depositNetwork = document.getElementById('deposit-network');
    if (depositNetwork) {
      depositNetwork.addEventListener('change', (e) => window.UI.handleNetworkChange(e.target.value));
    }

    const btnCopyTrc20 = document.getElementById('btn-copy-trc20');
    if (btnCopyTrc20) {
      btnCopyTrc20.addEventListener('click', () => {
        const addr = document.getElementById('addr-trc20')?.innerText;
        window.UI.copyToClipboard(addr);
      });
    }

    const btnCopyBep20 = document.getElementById('btn-copy-bep20');
    if (btnCopyBep20) {
      btnCopyBep20.addEventListener('click', () => {
        const addr = document.getElementById('addr-bep20')?.innerText;
        window.UI.copyToClipboard(addr);
      });
    }

    // 5. Submit Deposit Request
    const btnRequestDeposit = document.getElementById('btn-request-deposit');
    if (btnRequestDeposit) {
      btnRequestDeposit.addEventListener('click', async () => {
        const network = document.getElementById('deposit-network')?.value;
        const amount = document.getElementById('deposit-amount')?.value;
        const txhash = document.getElementById('deposit-txhash')?.value;

        if (!network || !amount || !txhash) {
          window.UI.showToast(window.UI.currentLang === 'ar' ? "يرجى ملء جميع حقول الإيداع" : "Please fill all deposit fields");
          return;
        }

        window.UI.setButtonLoading('btn-request-deposit', true);
        const res = await window.API.requestDeposit(network, amount, txhash);
        window.UI.setButtonLoading('btn-request-deposit', false);

        if (res && res.success) {
          window.UI.showToast(window.UI.currentLang === 'ar' ? "تم تقديم طلب الإيداع بنجاح!" : "Deposit submitted!");
          document.getElementById('deposit-amount').value = '';
          document.getElementById('deposit-txhash').value = '';
        }
      });
    }

    // 6. Wallet Nav Switches
    const walletNavDeposit = document.getElementById('wallet-nav-deposit');
    if (walletNavDeposit) {
      walletNavDeposit.addEventListener('click', () => window.UI.switchWalletView('deposit'));
    }

    const walletNavWithdraw = document.getElementById('wallet-nav-withdraw');
    if (walletNavWithdraw) {
      walletNavWithdraw.addEventListener('click', () => window.UI.switchWalletView('withdraw'));
    }

    // 7. Edit / Save Wallet Address
    const editWalletBtn = document.getElementById('edit-wallet-btn');
    if (editWalletBtn) {
      editWalletBtn.addEventListener('click', () => window.UI.toggleWalletEdit());
    }

    const saveWalletBtn = document.getElementById('save-wallet-btn');
    if (saveWalletBtn) {
      saveWalletBtn.addEventListener('click', async () => {
        const addrInput = document.getElementById('default-wallet');
        if (!addrInput || !addrInput.value) return;

        window.UI.setButtonLoading('save-wallet-btn', true);
        const res = await window.API.updateWalletAddress(addrInput.value);
        window.UI.setButtonLoading('save-wallet-btn', false);

        if (res && res.success) {
          window.UI.showToast(window.UI.currentLang === 'ar' ? "تم حفظ عنوان المحفظة!" : "Wallet saved!");
          window.UI.toggleWalletEdit();
        }
      });
    }

    // 8. Withdraw Calculations & Request
    const withdrawAmount = document.getElementById('withdraw-amount');
    if (withdrawAmount) {
      withdrawAmount.addEventListener('input', () => window.UI.updateWithdrawCalculations());
    }

    const btnRequestWithdraw = document.getElementById('btn-request-withdraw');
    if (btnRequestWithdraw) {
      btnRequestWithdraw.addEventListener('click', async () => {
        const amount = document.getElementById('withdraw-amount')?.value;
        const wallet = document.getElementById('default-wallet')?.value;

        if (!amount || amount < 30 || !wallet) {
          window.UI.showToast(window.UI.currentLang === 'ar' ? "الحد الأدنى للسحب 30$ مع وجود محفظة" : "Min withdrawal is $30");
          return;
        }

        window.UI.setButtonLoading('btn-request-withdraw', true);
        const res = await window.API.requestWithdrawal(amount, wallet);
        window.UI.setButtonLoading('btn-request-withdraw', false);

        if (res && res.success) {
          window.UI.showToast(window.UI.currentLang === 'ar' ? "تم إرسال طلب السحب بنجاح!" : "Withdrawal submitted!");
          document.getElementById('withdraw-amount').value = '';
          window.UI.updateWithdrawCalculations();
          this.loadDashboard();
        }
      });
    }

    // 9. Ad Type Selector
    const adType = document.getElementById('ad-type');
    if (adType) {
      adType.addEventListener('change', () => window.UI.onAdTypeChange());
    }

    // 10. Create Ad Campaign
    const btnCreateAd = document.getElementById('btn-create-ad');
    if (btnCreateAd) {
      btnCreateAd.addEventListener('click', async () => {
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
          window.UI.showToast(window.UI.currentLang === 'ar' ? "يرجى إكمال الحقول الرئيسية للإعلان" : "Please complete ad fields");
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

        window.UI.setButtonLoading('btn-create-ad', true);
        const res = await window.API.createAdCampaign(adData);
        window.UI.setButtonLoading('btn-create-ad', false);

        if (res && res.success) {
          window.UI.showToast(window.UI.currentLang === 'ar' ? "تم إنشاء الحملة الإعلانية بنجاح!" : "Campaign created!");
        }
      });
    }

    // 11. Referral Share Button
    const btnShareRef = document.getElementById('btn-share-ref');
    if (btnShareRef) {
      btnShareRef.addEventListener('click', () => window.UI.shareReferralLink());
    }

    // 12. Language Select
    const languageSelect = document.getElementById('language-select');
    if (languageSelect) {
      languageSelect.addEventListener('change', (e) => {
        if (typeof window.changeAppLanguage === 'function') {
          window.changeAppLanguage(e.target.value);
        }
      });
    }

    // 13. Close Video Ad Overlay
    const btnCloseVideoAd = document.getElementById('btn-close-video-ad');
    if (btnCloseVideoAd) {
      btnCloseVideoAd.addEventListener('click', () => window.UI.closeVideoAd());
    }

    // 14. Navigation Dock Buttons Binding
    const navDockTabs = ['dashboard', 'wallet', 'ads', 'referral', 'settings', 'admin'];
    navDockTabs.forEach(tab => {
      const btn = document.getElementById(`tab-btn-${tab}`);
      if (btn) {
        btn.addEventListener('click', () => window.UI.switchTab(tab));
      }
    });
  }
};

// Application Initialization Entry Point
document.addEventListener('DOMContentLoaded', async () => {
  const tg = window.Telegram?.WebApp;
  if (tg) {
    tg.ready();
    tg.expand();
  }

  window.UI.renderTelegramUser();

  const authenticated = await window.API.authLogin();
  
  // Check Bridge Route (/r/:code)
  const pathParts = window.location.pathname.split('/');
  if (pathParts.length >= 3 && pathParts[1] === 'r') {
    const code = pathParts[2];
    if (code) {
      await window.App.initBridgeLogic(code);
      return;
    }
  }

  // Bind all interactive elements
  window.App.bindEventListeners();

  // Load Main Dashboard Data
  if (authenticated) {
    await window.App.loadDashboard();
    await window.App.loadUserLinks();
  }
});
