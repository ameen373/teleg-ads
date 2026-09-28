// وحدة إدارة المحفظة والإيداع والسحب وتوليد السجلات

(function () {
  /**
   * دالة تقديم طلب إيداع جديد
   */
  async function requestDeposit() {
    const networkInput = document.getElementById('deposit-network');
    const amountInput = document.getElementById('deposit-amount');
    const txHashInput = document.getElementById('deposit-txhash');

    if (!networkInput || !amountInput || !txHashInput) return;

    const network = networkInput.value;
    const amountVal = amountInput.value;
    const txHashVal = txHashInput.value.trim();
    const lang = window.currentLang || 'ar';

    const showToast = (msg, typeMsg = 'info') => {
      if (window.UI && typeof window.UI.showToast === 'function') window.UI.showToast(msg, typeMsg);
      else if (typeof window.showToast === 'function') window.showToast(msg);
      else alert(msg);
    };

    const setButtonLoading = (btnId, isLoading) => {
      if (window.UI && typeof window.UI.setButtonLoading === 'function') window.UI.setButtonLoading(btnId, isLoading);
      else if (typeof window.setButtonLoading === 'function') window.setButtonLoading(btnId, isLoading);
    };

    if (!network) {
      showToast(lang === 'ar' ? 'يرجى اختيار شبكة الدفع' : 'Please select payment network', 'error');
      return;
    }
    const amount = parseFloat(amountVal);
    if (!amount || amount < 1) {
      showToast(lang === 'ar' ? 'الحد الأدنى للإيداع هو $1' : 'Minimum deposit amount is $1', 'error');
      return;
    }
    if (!txHashVal || txHashVal.length < 5) {
      showToast(lang === 'ar' ? 'يرجى إدخال رمز المعاملة (TxID)' : 'Please enter transaction TxID / Hash', 'error');
      return;
    }

    setButtonLoading('btn-request-deposit', true);

    const payload = {
      userId: window.currentUserTelegramId,
      telegramId: window.currentUserTelegramId,
      network: network,
      amount: amount,
      txid: txHashVal,
      txHash: txHashVal
    };

    try {
      let data = null;
      if (window.API && typeof window.API.post === 'function') {
        data = await window.API.post('/api/deposit', payload);
      } else if (typeof window.safeFetch === 'function') {
        const res = await window.safeFetch('/api/deposit', { method: 'POST', body: payload });
        if (res) data = await res.json().catch(() => ({}));
      }

      if (data && (data.success || data.deposit || data._id)) {
        showToast(lang === 'ar' ? 'تم تقديم طلب الشحن بنجاح! سيتم مراجعته قريباً.' : 'Deposit request submitted successfully!', 'success');
        amountInput.value = '';
        txHashInput.value = '';
        await loadUserData();
      } else {
        const errorMsg = (data && (data.error || data.message)) || (lang === 'ar' ? 'فشل تقديم طلب الشحن' : 'Failed to submit deposit request');
        showToast(errorMsg, 'error');
      }
    } catch (err) {
      console.error("Deposit request error:", err);
      showToast(err.message || (lang === 'ar' ? 'خطأ أثناء تقديم الطلب' : 'Error submitting request'), 'error');
    } finally {
      setButtonLoading('btn-request-deposit', false);
    }
  }

  /**
   * حفظ عنوان المحفظة الافتراضي
   */
  async function saveSettings() {
    const walletInput = document.getElementById('default-wallet');
    if (!walletInput) return;
    const walletAddr = walletInput.value.trim();
    const lang = window.currentLang || 'ar';

    const showToast = (msg, typeMsg = 'info') => {
      if (window.UI && typeof window.UI.showToast === 'function') window.UI.showToast(msg, typeMsg);
      else if (typeof window.showToast === 'function') window.showToast(msg);
      else alert(msg);
    };

    if (!walletAddr) {
      showToast(lang === 'ar' ? 'يرجى إدخال عنوان المحفظة' : 'Please enter wallet address', 'error');
      return;
    }

    const payload = {
      userId: window.currentUserTelegramId,
      telegramId: window.currentUserTelegramId,
      defaultWallet: walletAddr
    };

    try {
      let data = null;
      if (window.API && typeof window.API.post === 'function') {
        data = await window.API.post('/api/user/settings', payload);
      } else if (typeof window.safeFetch === 'function') {
        const res = await window.safeFetch('/api/user/settings', { method: 'POST', body: payload });
        if (res) data = await res.json().catch(() => ({}));
      }

      if (data && (data.success || data.user)) {
        showToast(lang === 'ar' ? 'تم حفظ العنوان بنجاح' : 'Wallet address saved', 'success');
        if (typeof window.toggleWalletEdit === 'function') window.toggleWalletEdit();
        await loadUserData();
      } else {
        const errorMsg = (data && (data.error || data.message)) || (lang === 'ar' ? 'فشل حفظ العنوان' : 'Failed to save address');
        showToast(errorMsg, 'error');
      }
    } catch (err) {
      showToast(err.message || (lang === 'ar' ? 'خطأ أثناء الحفظ' : 'Error saving settings'), 'error');
    }
  }

  /**
   * حساب قيمة الخصم وصافي المبلغ عند طلب السحب
   */
  function updateWithdrawCalculations() {
    const amountInput = document.getElementById('withdraw-amount');
    const feeElem = document.getElementById('withdraw-fee');
    const netElem = document.getElementById('withdraw-net');
    
    if (!amountInput) return;
    const amount = parseFloat(amountInput.value) || 0;
    const fee = amount * 0.02; // عمولة السحب 2%
    const net = Math.max(0, amount - fee);

    if (feeElem) feeElem.innerText = `$${fee.toFixed(2)}`;
    if (netElem) netElem.innerText = `$${net.toFixed(2)}`;
  }

  /**
   * دالة تقديم طلب سحب
   */
  async function requestWithdrawal() {
    const walletInput = document.getElementById('default-wallet');
    const amountInput = document.getElementById('withdraw-amount');
    const walletAddr = walletInput ? walletInput.value.trim() : '';
    const amountVal = amountInput ? parseFloat(amountInput.value) || 0 : 0;
    const lang = window.currentLang || 'ar';

    const showToast = (msg, typeMsg = 'info') => {
      if (window.UI && typeof window.UI.showToast === 'function') window.UI.showToast(msg, typeMsg);
      else if (typeof window.showToast === 'function') window.showToast(msg);
      else alert(msg);
    };

    const setButtonLoading = (btnId, isLoading) => {
      if (window.UI && typeof window.UI.setButtonLoading === 'function') window.UI.setButtonLoading(btnId, isLoading);
      else if (typeof window.setButtonLoading === 'function') window.setButtonLoading(btnId, isLoading);
    };

    if (!walletAddr) {
      showToast(lang === 'ar' ? 'يرجى إدخال وتحديد عنوان محفظة السحب أولاً' : 'Please define withdrawal wallet address first', 'error');
      return;
    }

    if (amountVal < 30) {
      showToast(lang === 'ar' ? 'الحد الأدنى للسحب هو 30$' : 'Minimum withdrawal is $30', 'error');
      return;
    }

    setButtonLoading('btn-request-withdraw', true);

    const payload = {
      userId: window.currentUserTelegramId,
      telegramId: window.currentUserTelegramId,
      amount: amountVal,
      wallet: walletAddr
    };

    try {
      let data = null;
      if (window.API && typeof window.API.post === 'function') {
        data = await window.API.post('/api/withdraw', payload);
      } else if (typeof window.safeFetch === 'function') {
        const res = await window.safeFetch('/api/withdraw', { method: 'POST', body: payload });
        if (res) data = await res.json().catch(() => ({}));
      }

      if (data && (data.success || data.withdraw || data._id)) {
        showToast(lang === 'ar' ? 'تم تقديم طلب السحب بنجاح' : 'Withdrawal requested successfully', 'success');
        if (amountInput) amountInput.value = '';
        updateWithdrawCalculations();
        await loadUserData();
      } else {
        const errorMsg = (data && (data.error || data.message)) || (lang === 'ar' ? 'فشل تقديم طلب السحب' : 'Failed to request withdrawal');
        showToast(errorMsg, 'error');
      }
    } catch (err) {
      showToast(err.message || (lang === 'ar' ? 'خطأ في عملية السحب' : 'Error processing withdrawal'), 'error');
    } finally {
      setButtonLoading('btn-request-withdraw', false);
    }
  }

  /**
   * عرض سجل السحوبات المالية
   */
  function renderWithdrawalsHistory(withdraws) {
    const container = document.getElementById('withdraws-list');
    if (!container) return;

    const lang = window.currentLang || 'ar';

    if (!withdraws || withdraws.length === 0) {
      container.innerHTML = `<p style="text-align:center; color: var(--text-muted); margin: 10px 0;">${lang === 'ar' ? 'لا توجد طلبات سحب سابقة.' : 'No withdrawal history found.'}</p>`;
      return;
    }

    container.innerHTML = withdraws.map(w => {
      const statusClass = w.status === 'completed' || w.status === 'approved' ? 'color: var(--success);' : w.status === 'rejected' ? 'color: var(--danger);' : 'color: var(--warning);';
      const statusText = w.status === 'completed' || w.status === 'approved' ? (lang === 'ar' ? 'مكتمل' : 'Approved') : w.status === 'rejected' ? (lang === 'ar' ? 'مرفوض' : 'Rejected') : (lang === 'ar' ? 'قيد المراجعة' : 'Pending');
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
  }

  /**
   * جلب وعرض بيانات الإحالات
   */
  async function fetchUserReferrals() {
    const container = document.getElementById('ref-list');
    if (container) {
      container.innerHTML = `<div style="text-align:center; padding: 10px;"><div class="spinner"></div></div>`;
    }

    try {
      let data = null;
      if (window.API && typeof window.API.get === 'function') {
        data = await window.API.get('/api/referrals');
      } else if (typeof window.safeFetch === 'function') {
        const res = await window.safeFetch('/api/referrals');
        if (res) data = await res.json().catch(() => null);
      }

      if (data) {
        const referrals = Array.isArray(data) ? data : (data.referrals || data.data || []);
        renderUserReferrals(referrals);
      }
    } catch (err) {
      console.error("Error fetching referrals:", err);
    }
  }

  /**
   * عرض قائمة الإحالات
   */
  function renderUserReferrals(referrals) {
    const container = document.getElementById('ref-list');
    if (!container) return;

    const lang = window.currentLang || 'ar';
    const escapeHTML = (str) => {
      if (window.UI && typeof window.UI.escapeHTML === 'function') return window.UI.escapeHTML(str);
      return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    };

    if (!referrals || referrals.length === 0) {
      container.innerHTML = `<p style="text-align:center; color: var(--text-muted); margin: 12px 0;">${lang === 'ar' ? 'لم تنضم أي إحالات عبر رابطك بعد.' : 'No referrals registered yet.'}</p>`;
      return;
    }

    container.innerHTML = referrals.map(ref => {
      const name = escapeHTML(ref.firstName || ref.username || 'User');
      const earnings = Number(ref.earnedAmount || ref.contribution || 0).toFixed(2);
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
  }

  /**
   * تحميل وتحديث بيانات المستخدم الرئيسية بالكامل
   */
  async function loadUserData() {
    try {
      let data = null;
      if (window.API && typeof window.API.get === 'function') {
        data = await window.API.get('/api/user/data');
      } else if (typeof window.safeFetch === 'function') {
        const res = await window.safeFetch('/api/user/data');
        if (res && res.ok) data = await res.json().catch(() => ({}));
      }

      if (data) {
        const u = data.user || data;

        const pendingBalElem = document.getElementById('pending-bal');
        const availBalElem = document.getElementById('avail-bal');
        const refEarningsElem = document.getElementById('ref-earnings');
        const refCountElem = document.getElementById('ref-count');

        if (pendingBalElem) pendingBalElem.innerText = `$${Number(u.pendingBalance || 0).toFixed(2)}`;
        if (availBalElem) availBalElem.innerText = `$${Number(u.availableBalance || 0).toFixed(2)}`;
        if (refEarningsElem) refEarningsElem.innerText = `$${Number(u.referralEarnings || 0).toFixed(2)}`;
        if (refCountElem) refCountElem.innerText = data.referralsCount || u.referralsCount || 0;

        const refInput = document.getElementById('ref-link');
        const botUsername = (data.botUsername || 'Ads_telegabot').replace(/^@/, '');
        if (refInput) {
          refInput.value = `https://t.me/${botUsername}?start=${window.currentUserTelegramId}`;
        }

        const walletInput = document.getElementById('default-wallet');
        if (walletInput && u.defaultWallet) {
          walletInput.value = u.defaultWallet;
        }

        if (data.links && Array.isArray(data.links)) {
          window.rawUserLinksCache = data.links;
          if (window.ShortenerModule && typeof window.ShortenerModule.renderUserLinks === 'function') {
            window.ShortenerModule.renderUserLinks(window.rawUserLinksCache);
          } else if (typeof window.renderUserLinks === 'function') {
            window.renderUserLinks(window.rawUserLinksCache);
          }
        }

        if (data.withdraws && Array.isArray(data.withdraws)) {
          renderWithdrawalsHistory(data.withdraws);
        }

        if (data.ads && Array.isArray(data.ads)) {
          if (window.AdsModule && typeof window.AdsModule.renderUserAds === 'function') {
            window.AdsModule.renderUserAds(data.ads);
          } else if (typeof window.renderUserAds === 'function') {
            window.renderUserAds(data.ads);
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

        if (data.isAdmin === true || u.isAdmin === true) {
          window.isUserAdmin = true;
          const adminBtn = document.getElementById('tab-btn-admin');
          if (adminBtn) adminBtn.style.display = 'flex';
        }
      }
    } catch (err) {
      console.error("Error loading user data:", err);
    }
  }

  // تصدير الكائن العام والمكونات للواجهة
  const WalletModule = {
    requestDeposit,
    saveSettings,
    updateWithdrawCalculations,
    requestWithdrawal,
    renderWithdrawalsHistory,
    fetchUserReferrals,
    renderUserReferrals,
    loadUserData
  };

  window.WalletModule = WalletModule;
  window.requestDeposit = requestDeposit;
  window.saveSettings = saveSettings;
  window.updateWithdrawCalculations = updateWithdrawCalculations;
  window.requestWithdrawal = requestWithdrawal;
  window.renderWithdrawalsHistory = renderWithdrawalsHistory;
  window.fetchUserReferrals = fetchUserReferrals;
  window.renderUserReferrals = renderUserReferrals;
  window.loadUserData = loadUserData;
})();
