// Telega.ads - Wallet & Transactions Module

window.WalletModule = {
  /**
   * تقديم طلب إيداع جديد
   */
  requestDeposit: async function() {
    const networkInput = document.getElementById('deposit-network');
    const amountInput = document.getElementById('deposit-amount');
    const txHashInput = document.getElementById('deposit-txhash');

    if (!networkInput || !amountInput || !txHashInput) return;

    const network = networkInput.value;
    const amountVal = amountInput.value;
    const txHashVal = txHashInput.value.trim();
    const lang = window.UI ? window.UI.currentLang : (window.currentLang || 'ar');

    if (!network) {
      if (window.UI && typeof window.UI.showToast === 'function') {
        window.UI.showToast(lang === 'ar' ? 'يرجى اختيار شبكة الدفع' : 'Please select payment network');
      }
      return;
    }

    const amount = parseFloat(amountVal);
    if (!amount || amount < 1) {
      if (window.UI && typeof window.UI.showToast === 'function') {
        window.UI.showToast(lang === 'ar' ? 'الحد الأدنى للإيداع هو $1' : 'Minimum deposit amount is $1');
      }
      return;
    }

    if (!txHashVal || txHashVal.length < 5) {
      if (window.UI && typeof window.UI.showToast === 'function') {
        window.UI.showToast(lang === 'ar' ? 'يرجى إدخال رمز المعاملة (TxID)' : 'Please enter transaction TxID / Hash');
      }
      return;
    }

    if (window.UI && typeof window.UI.setButtonLoading === 'function') {
      window.UI.setButtonLoading('btn-request-deposit', true);
    }

    try {
      const data = await window.API.requestDeposit(network, amount, txHashVal);

      if (data && (data.success || data.deposit)) {
        if (window.UI && typeof window.UI.showToast === 'function') {
          window.UI.showToast(lang === 'ar' ? 'تم تقديم طلب الشحن بنجاح! سيتم مراجعته قريباً.' : 'Deposit request submitted successfully!');
        }
        amountInput.value = '';
        txHashInput.value = '';
        await this.loadUserData();
      } else {
        const errorMsg = data?.error || data?.message || (lang === 'ar' ? 'فشل تقديم طلب الشحن' : 'Failed to submit deposit request');
        if (window.UI && typeof window.UI.showToast === 'function') {
          window.UI.showToast(errorMsg);
        }
      }
    } catch (err) {
      console.error("Deposit request error:", err);
      if (window.UI && typeof window.UI.showToast === 'function') {
        window.UI.showToast(err.message || (lang === 'ar' ? 'خطأ أثناء تقديم الطلب' : 'Error submitting request'));
      }
    } finally {
      if (window.UI && typeof window.UI.setButtonLoading === 'function') {
        window.UI.setButtonLoading('btn-request-deposit', false);
      }
    }
  },

  /**
   * حفظ إعدادات المحفظة الافتراضية
   */
  saveSettings: async function() {
    const walletInput = document.getElementById('default-wallet');
    if (!walletInput) return;
    const walletAddr = walletInput.value.trim();
    const lang = window.UI ? window.UI.currentLang : (window.currentLang || 'ar');

    if (!walletAddr) {
      if (window.UI && typeof window.UI.showToast === 'function') {
        window.UI.showToast(lang === 'ar' ? 'يرجى إدخال عنوان المحفظة' : 'Please enter wallet address');
      }
      return;
    }

    if (window.UI && typeof window.UI.setButtonLoading === 'function') {
      window.UI.setButtonLoading('save-wallet-btn', true);
    }

    try {
      const data = await window.API.updateWalletAddress(walletAddr);

      if (data && (data.success || data.user)) {
        if (window.UI && typeof window.UI.showToast === 'function') {
          window.UI.showToast(lang === 'ar' ? 'تم حفظ العنوان بنجاح' : 'Wallet address saved');
        }
        if (window.UI && typeof window.UI.toggleWalletEdit === 'function') {
          window.UI.toggleWalletEdit();
        }
        await this.loadUserData();
      } else {
        const errorMsg = data?.error || (lang === 'ar' ? 'فشل حفظ العنوان' : 'Failed to save address');
        if (window.UI && typeof window.UI.showToast === 'function') {
          window.UI.showToast(errorMsg);
        }
      }
    } catch (err) {
      if (window.UI && typeof window.UI.showToast === 'function') {
        window.UI.showToast(err.message || (lang === 'ar' ? 'خطأ أثناء الحفظ' : 'Error saving settings'));
      }
    } finally {
      if (window.UI && typeof window.UI.setButtonLoading === 'function') {
        window.UI.setButtonLoading('save-wallet-btn', false);
      }
    }
  },

  /**
   * تقديم طلب سحب الأرباح
   */
  requestWithdrawal: async function() {
    const walletInput = document.getElementById('default-wallet');
    const amountInput = document.getElementById('withdraw-amount');
    const walletAddr = walletInput ? walletInput.value.trim() : '';
    const amountVal = amountInput ? parseFloat(amountInput.value) || 0 : 0;
    const lang = window.UI ? window.UI.currentLang : (window.currentLang || 'ar');

    if (!walletAddr) {
      if (window.UI && typeof window.UI.showToast === 'function') {
        window.UI.showToast(lang === 'ar' ? 'يرجى إدخال وتحديد عنوان محفظة السحب أولاً' : 'Please define withdrawal wallet address first');
      }
      return;
    }

    if (amountVal < 30) {
      if (window.UI && typeof window.UI.showToast === 'function') {
        window.UI.showToast(lang === 'ar' ? 'الحد الأدنى للسحب هو 30$' : 'Minimum withdrawal is $30');
      }
      return;
    }

    if (window.UI && typeof window.UI.setButtonLoading === 'function') {
      window.UI.setButtonLoading('btn-request-withdraw', true);
    }

    try {
      const data = await window.API.requestWithdrawal(amountVal, walletAddr);

      if (data && (data.success || data.withdraw)) {
        if (window.UI && typeof window.UI.showToast === 'function') {
          window.UI.showToast(lang === 'ar' ? 'تم تقديم طلب السحب بنجاح' : 'Withdrawal requested successfully');
        }
        if (amountInput) amountInput.value = '';
        if (window.UI && typeof window.UI.updateWithdrawCalculations === 'function') {
          window.UI.updateWithdrawCalculations();
        }
        await this.loadUserData();
      } else {
        const errorMsg = data?.error || data?.message || (lang === 'ar' ? 'فشل تقديم طلب السحب' : 'Failed to request withdrawal');
        if (window.UI && typeof window.UI.showToast === 'function') {
          window.UI.showToast(errorMsg);
        }
      }
    } catch (err) {
      if (window.UI && typeof window.UI.showToast === 'function') {
        window.UI.showToast(err.message || (lang === 'ar' ? 'خطأ في عملية السحب' : 'Error processing withdrawal'));
      }
    } finally {
      if (window.UI && typeof window.UI.setButtonLoading === 'function') {
        window.UI.setButtonLoading('btn-request-withdraw', false);
      }
    }
  },

  /**
   * عرض سجل طلبات السحب
   */
  renderWithdrawalsHistory: function(withdraws) {
    const container = document.getElementById('withdraws-list');
    if (!container) return;

    const lang = window.UI ? window.UI.currentLang : (window.currentLang || 'ar');

    if (!withdraws || withdraws.length === 0) {
      container.innerHTML = `<p style="text-align:center; color: var(--text-muted); margin: 10px 0;">${lang === 'ar' ? 'لا توجد طلبات سحب سابقة.' : 'No withdrawal history found.'}</p>`;
      return;
    }

    container.innerHTML = withdraws.map(w => {
      const statusClass = (w.status === 'completed' || w.status === 'approved') ? 'color: var(--success);' : w.status === 'rejected' ? 'color: var(--danger);' : 'color: var(--warning);';
      const statusText = (w.status === 'completed' || w.status === 'approved') ? (lang === 'ar' ? 'مكتمل' : 'Approved') : w.status === 'rejected' ? (lang === 'ar' ? 'مرفوض' : 'Rejected') : (lang === 'ar' ? 'قيد المراجعة' : 'Pending');
      const dateStr = new Date(w.createdAt || Date.now()).toLocaleDateString();

      return `
        <div style="background: #0f172a; padding: 12px; border-radius: 12px; border: 1px solid var(--card-border); margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
          <div>
            <strong style="font-size: 13px; color: var(--text);">$${(w.amount || 0).toFixed(2)}</strong>
            <small style="display: block; color: var(--text-muted); font-size: 10px;">${dateStr}</small>
          </div>
          <span style="font-size: 12px; font-weight: bold; ${statusClass}">${statusText}</span>
        </div>
      `;
    }).join('');
  },

  /**
   * جلب وعرض قائمة الإحالات
   */
  fetchUserReferrals: async function() {
    const container = document.getElementById('ref-list');
    if (container) {
      container.innerHTML = `<div style="text-align:center; padding: 10px;"><div class="spinner"></div></div>`;
    }

    try {
      const data = await window.API.getUserReferrals();
      if (data) {
        const referrals = Array.isArray(data) ? data : (data.referrals || data.data || []);
        this.renderUserReferrals(referrals);
      }
    } catch (err) {
      console.error("Error fetching referrals:", err);
    }
  },

  /**
   * عرض قائمة الإحالات
   */
  renderUserReferrals: function(referrals) {
    const container = document.getElementById('ref-list');
    if (!container) return;

    const lang = window.UI ? window.UI.currentLang : (window.currentLang || 'ar');

    if (!referrals || referrals.length === 0) {
      container.innerHTML = `<p style="text-align:center; color: var(--text-muted); margin: 12px 0;">${lang === 'ar' ? 'لم تنضم أي إحالات عبر رابطك بعد.' : 'No referrals registered yet.'}</p>`;
      return;
    }

    container.innerHTML = referrals.map(ref => {
      const escapeFn = window.UI ? window.UI.escapeHTML : (str => str);
      const name = escapeFn(ref.firstName || ref.username || 'User');
      const earnings = (ref.earnedAmount || ref.contribution || 0).toFixed(2);
      const dateStr = new Date(ref.createdAt || Date.now()).toLocaleDateString();

      return `
        <div style="background: #0f172a; padding: 12px; border-radius: 12px; border: 1px solid var(--card-border); margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
          <div>
            <strong style="font-size: 13px; color: var(--text);">${name}</strong>
            <small style="display: block; color: var(--text-muted); font-size: 10px;">${dateStr}</small>
          </div>
          <span style="font-size: 12px; color: var(--success); font-weight: bold;">+$${earnings}</span>
        </div>
      `;
    }).join('');
  },

  /**
   * تحميل وإعادة تحديث جميع بيانات المستخدم بالواجهة
   */
  loadUserData: async function() {
    try {
      const data = await window.API.getDashboardData();
      if (data) {
        const u = data.user || data;

        const pendingBalElem = document.getElementById('pending-bal');
        const availBalElem = document.getElementById('avail-bal');
        const refEarningsElem = document.getElementById('ref-earnings');
        const refCountElem = document.getElementById('ref-count');

        if (pendingBalElem) pendingBalElem.innerText = `$${(u.pendingBalance || 0).toFixed(2)}`;
        if (availBalElem) availBalElem.innerText = `$${(u.availableBalance || 0).toFixed(2)}`;
        if (refEarningsElem) refEarningsElem.innerText = `$${(u.referralEarnings || 0).toFixed(2)}`;
        if (refCountElem) refCountElem.innerText = data.referralsCount || u.referralsCount || 0;

        const refInput = document.getElementById('ref-link');
        const botUsername = (data.botUsername || 'Ads_telegabot').replace(/^@/, '');
        if (refInput) {
          refInput.value = `https://t.me/${botUsername}?start=${window.currentUserTelegramId}`;
        }

        const walletInput = document.getElementById('default-wallet');
        if (walletInput && (u.defaultWallet || u.walletAddress)) {
          walletInput.value = u.defaultWallet || u.walletAddress;
        }

        if (data.links && Array.isArray(data.links)) {
          window.rawUserLinksCache = data.links;
          if (window.ShortenerModule && typeof window.ShortenerModule.renderUserLinks === 'function') {
            window.ShortenerModule.renderUserLinks(window.rawUserLinksCache);
          }
        }

        if (data.withdraws && Array.isArray(data.withdraws)) {
          this.renderWithdrawalsHistory(data.withdraws);
        }

        if (data.ads && Array.isArray(data.ads)) {
          if (window.AdsModule && typeof window.AdsModule.renderUserAds === 'function') {
            window.AdsModule.renderUserAds(data.ads);
          }
        }

        if (data.announcements && Array.isArray(data.announcements) && data.announcements.length > 0) {
          const anc = data.announcements[0];
          const ancBox = document.getElementById('announcement-box');
          const ancTitle = document.getElementById('anc-title');
          const ancContent = document.getElementById('anc-content');

          if (ancBox && anc.title) {
            if (ancTitle) ancTitle.innerText = anc.title;
            if (ancContent) ancContent.innerText = anc.content || anc.message || '';
            ancBox.classList.remove('hidden');
          }
        }

        if (data.isAdmin === true) {
          window.isUserAdmin = true;
          const adminBtn = document.getElementById('tab-btn-admin');
          if (adminBtn) adminBtn.style.display = 'flex';
        }
      }
    } catch (err) {
      console.error("Error loading user data:", err);
    }
  }
};

// Global standard helpers mapping for compatibility
window.requestDeposit = window.WalletModule.requestDeposit.bind(window.WalletModule);
window.saveSettings = window.WalletModule.saveSettings.bind(window.WalletModule);
window.requestWithdrawal = window.WalletModule.requestWithdrawal.bind(window.WalletModule);
window.renderWithdrawalsHistory = window.WalletModule.renderWithdrawalsHistory.bind(window.WalletModule);
window.fetchUserReferrals = window.WalletModule.fetchUserReferrals.bind(window.WalletModule);
window.renderUserReferrals = window.WalletModule.renderUserReferrals.bind(window.WalletModule);
window.loadUserData = window.WalletModule.loadUserData.bind(window.WalletModule);
