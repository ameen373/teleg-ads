document.addEventListener('DOMContentLoaded', async () => {

  // 1. تهيئة بيانات مستخدم تليجرام ورسم واجهته
  if (typeof window.UI?.renderTelegramUser === 'function') {
    window.UI.renderTelegramUser();
  }

  // 2. تسجيل الدخول الأساسي عبر السيرفر
  if (typeof window.API?.authLogin === 'function') {
    await window.API.authLogin();
  }

  // 3. ربط تنقل الصفحات (Tab Navigation Dock)
  const tabNames = ['dashboard', 'wallet', 'ads', 'referral', 'settings', 'admin'];
  tabNames.forEach(t => {
    const btn = document.getElementById(`tab-btn-${t}`);
    if (btn) {
      btn.addEventListener('click', () => {
        if (typeof window.UI?.switchTab === 'function') {
          window.UI.switchTab(t);
        }
      });
    }
  });

  // 4. ربط أزرار المحفظة (إيداع / سحب)
  const navDeposit = document.getElementById('wallet-nav-deposit');
  const navWithdraw = document.getElementById('wallet-nav-withdraw');
  if (navDeposit) {
    navDeposit.addEventListener('click', () => window.UI?.switchWalletView('deposit'));
  }
  if (navWithdraw) {
    navWithdraw.addEventListener('click', () => window.UI?.switchWalletView('withdraw'));
  }

  // 5. ربط اختيار الشبكة وقوائم الدفع
  const depositNetSelect = document.getElementById('deposit-network');
  if (depositNetSelect) {
    depositNetSelect.addEventListener('change', (e) => {
      if (typeof window.UI?.handleNetworkChange === 'function') {
        window.UI.handleNetworkChange(e.target.value);
      }
    });
  }

  // 6. دليل الشحن والأغلاق
  const showGuideBtn = document.getElementById('btn-show-deposit-guide');
  const closeGuideBtn = document.getElementById('btn-close-modal');
  if (showGuideBtn) {
    showGuideBtn.addEventListener('click', () => window.UI?.toggleInstructionsModal(true));
  }
  if (closeGuideBtn) {
    closeGuideBtn.addEventListener('click', () => window.UI?.toggleInstructionsModal(false));
  }

  // 7. نسخ عناوين الشحن
  const copyTrcBtn = document.getElementById('btn-copy-trc20');
  const copyBepBtn = document.getElementById('btn-copy-bep20');
  if (copyTrcBtn) {
    copyTrcBtn.addEventListener('click', () => {
      const addr = document.getElementById('addr-trc20')?.innerText;
      window.UI?.copyToClipboard(addr);
    });
  }
  if (copyBepBtn) {
    copyBepBtn.addEventListener('click', () => {
      const addr = document.getElementById('addr-bep20')?.innerText;
      window.UI?.copyToClipboard(addr);
    });
  }

  // 8. إرسال طلب إيداع جديد
  const reqDepositBtn = document.getElementById('btn-request-deposit');
  if (reqDepositBtn) {
    reqDepositBtn.addEventListener('click', async () => {
      const network = document.getElementById('deposit-network')?.value;
      const amount = parseFloat(document.getElementById('deposit-amount')?.value || '0');
      const txHash = document.getElementById('deposit-txhash')?.value?.trim();

      if (!network) {
        return window.UI?.showToast("الرجاء اختيار شبكة الدفع أولاً");
      }
      if (!amount || amount < 1) {
        return window.UI?.showToast("الرجاء إدخال مبلغ إيداع صحيح (1$ على الأقل)");
      }
      if (!txHash) {
        return window.UI?.showToast("الرجاء إدخال رمز المعاملة TxID / Hash");
      }

      window.UI?.setButtonLoading('btn-request-deposit', true);
      const res = await window.API?.requestDeposit(amount, network, txHash);
      window.UI?.setButtonLoading('btn-request-deposit', false, 'تأكيد وإرسال طلب الشحن');

      if (res && res.success) {
        window.UI?.showToast("تم إرسال طلب الإيداع بنجاح، جاري المراجعة");
        document.getElementById('deposit-amount').value = '';
        document.getElementById('deposit-txhash').value = '';
      } else {
        window.UI?.showToast(res?.message || "فشل إرسال طلب الإيداع");
      }
    });
  }

  // 9. تعديل وحفظ عنوان محفظة السحب
  const editWalletBtn = document.getElementById('edit-wallet-btn');
  const saveWalletBtn = document.getElementById('save-wallet-btn');
  if (editWalletBtn) {
    editWalletBtn.addEventListener('click', () => window.UI?.toggleWalletEdit());
  }
  if (saveWalletBtn) {
    saveWalletBtn.addEventListener('click', async () => {
      const walletAddr = document.getElementById('default-wallet')?.value?.trim();
      if (!walletAddr) {
        return window.UI?.showToast("الرجاء أدخل عنوان محفظة صحيح");
      }
      window.UI?.setButtonLoading('save-wallet-btn', true);
      const res = await window.API?.saveWalletAddress(walletAddr);
      window.UI?.setButtonLoading('save-wallet-btn', false, 'حفظ العنوان الجديد');

      if (res && res.success) {
        window.UI?.showToast("تم حفظ عنوان المحفظة بنجاح");
        window.UI?.toggleWalletEdit();
      } else {
        window.UI?.showToast(res?.message || "فشل حفظ العنوان");
      }
    });
  }

  // 10. حساب رسوم السحب ديناميكياً وإرسال الطلب
  const withdrawInput = document.getElementById('withdraw-amount');
  if (withdrawInput) {
    withdrawInput.addEventListener('input', () => {
      window.UI?.updateWithdrawCalculations();
    });
  }

  const reqWithdrawBtn = document.getElementById('btn-request-withdraw');
  if (reqWithdrawBtn) {
    reqWithdrawBtn.addEventListener('click', async () => {
      const walletAddress = document.getElementById('default-wallet')?.value?.trim();
      const amount = parseFloat(document.getElementById('withdraw-amount')?.value || '0');

      if (!walletAddress) {
        return window.UI?.showToast("الرجاء إضافة عنوان محفظة السحب أولاً");
      }
      if (!amount || amount < 30) {
        return window.UI?.showToast("الحد الأدنى للسحب هو $30");
      }

      window.UI?.setButtonLoading('btn-request-withdraw', true);
      const res = await window.API?.requestWithdrawal(amount, walletAddress);
      window.UI?.setButtonLoading('btn-request-withdraw', false, 'تقديم طلب السحب');

      if (res && res.success) {
        window.UI?.showToast("تمتقديم طلب السحب بنجاح!");
        document.getElementById('withdraw-amount').value = '';
        window.UI?.updateWithdrawCalculations();
        window.API?.loadUserData();
      } else {
        window.UI?.showToast(res?.message || "فشل تقديم طلب السحب");
      }
    });
  }

  // 11. إنشاء رابط جديد
  const createLinkBtn = document.getElementById('btn-create-link');
  if (createLinkBtn) {
    createLinkBtn.addEventListener('click', async () => {
      const title = document.getElementById('link-title')?.value?.trim();
      const originalUrl = document.getElementById('link-url')?.value?.trim();

      if (!originalUrl || !originalUrl.startsWith('http')) {
        return window.UI?.showToast("الرجاء إدخال رابط صحيح يبدأ بـ http:// أو https://");
      }

      window.UI?.setButtonLoading('btn-create-link', true);
      const res = await window.API?.createShortLink(title, originalUrl);
      window.UI?.setButtonLoading('btn-create-link', false, 'اختصار الرابط الآن');

      if (res && (res.shortUrl || res.success)) {
        window.UI?.showToast("تم اختصار الرابط بنجاح!");
        document.getElementById('link-title').value = '';
        document.getElementById('link-url').value = '';
        const links = await window.API?.fetchUserLinks();
        window.UI?.renderLinks(links);
      } else {
        window.UI?.showToast(res?.message || "فشل اختصار الرابط");
      }
    });
  }

  // 12. تصفية الروابط في القائمة
  const searchLinksInput = document.getElementById('search-links-input');
  if (searchLinksInput) {
    searchLinksInput.addEventListener('input', async (e) => {
      const query = e.target.value.toLowerCase();
      const links = await window.API?.fetchUserLinks();
      const filtered = links.filter(l => (l.title && l.title.toLowerCase().includes(query)) || (l.originalUrl && l.originalUrl.toLowerCase().includes(query)));
      window.UI?.renderLinks(filtered);
    });
  }

  // 13. التبديل بين أنواع الإعلانات
  const adTypeSelect = document.getElementById('ad-type');
  if (adTypeSelect) {
    adTypeSelect.addEventListener('change', () => window.UI?.onAdTypeChange());
  }

  // 14. إطلاق حملة إعلانية
  const createAdBtn = document.getElementById('btn-create-ad');
  if (createAdBtn) {
    createAdBtn.addEventListener('click', async () => {
      const type = document.getElementById('ad-type')?.value;
      const title = document.getElementById('ad-title')?.value?.trim();
      const targetUrl = document.getElementById('ad-target-url')?.value?.trim();
      const mediaUrl = document.getElementById('ad-media-url')?.value?.trim();
      const appDownloadUrl = document.getElementById('ad-app-download-url')?.value?.trim();
      const gameEmbedUrl = document.getElementById('ad-game-embed-url')?.value?.trim();
      const category = document.getElementById('ad-category')?.value;
      const budget = parseFloat(document.getElementById('ad-budget')?.value || '0');
      const dailyBudget = parseFloat(document.getElementById('ad-daily-budget')?.value || '0');
      const countries = document.getElementById('ad-countries')?.value?.trim();

      if (!title || !targetUrl) {
        return window.UI?.showToast("يرجى ملء كافة الحقول الأساسية للإعلان");
      }
      if (budget < 5) {
        return window.UI?.showToast("الحد الأدنى للميزانية هو $5");
      }

      const adPayload = {
        type, title, targetUrl, mediaUrl, appDownloadUrl, gameEmbedUrl,
        category, budget, dailyBudget, countries,
        devices: {
          android: document.getElementById('device-android')?.checked || false,
          ios: document.getElementById('device-ios')?.checked || false,
          desktop: document.getElementById('device-desktop')?.checked || false
        }
      };

      window.UI?.setButtonLoading('btn-create-ad', true);
      const res = await window.API?.createAdCampaign(adPayload);
      window.UI?.setButtonLoading('btn-create-ad', false, 'إطلاق الحملة الإعلانية');

      if (res && res.success) {
        window.UI?.showToast("تم إطلاق الحملة الإعلانية بنجاح!");
        const ads = await window.API?.fetchUserAds();
        window.UI?.renderAds(ads);
      } else {
        window.UI?.showToast(res?.message || "فشل إنشاء الحملة الإعلانية");
      }
    });
  }

  // 15. مشاركة رابط الإحالة
  const shareRefBtn = document.getElementById('btn-share-ref');
  if (shareRefBtn) {
    shareRefBtn.addEventListener('click', () => window.UI?.shareReferralLink());
  }

  // 16. إغلاق إعلان الفيديو في صفحة التحويل
  const closeVidBtn = document.getElementById('btn-close-video-ad');
  if (closeVidBtn) {
    closeVidBtn.addEventListener('click', () => window.UI?.closeVideoAd());
  }

  // 17. حذف رابط (دالة عامة تُستدعى من عناصر القائمة)
  window.handleDeleteLink = async (linkId) => {
    if (!confirm("هل أنت تأكد من رغبتك في حذف هذا الرابط؟")) return;
    const ok = await window.API?.deleteLink(linkId);
    if (ok) {
      window.UI?.showToast("تم حذف الرابط بنجاح");
      const links = await window.API?.fetchUserLinks();
      window.UI?.renderLinks(links);
    } else {
      window.UI?.showToast("فشل حذف الرابط");
    }
  };

  // 18. تحميل البيانات البدائية للمستخدم
  if (typeof window.API?.loadUserData === 'function') {
    await window.API.loadUserData();
  }
  if (typeof window.API?.fetchUserLinks === 'function') {
    const links = await window.API.fetchUserLinks();
    window.UI?.renderLinks(links);
  }
});
