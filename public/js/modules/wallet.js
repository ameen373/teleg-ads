/**
 * public/js/modules/wallet.js
 * TelegaApp - Complete Unified Wallet Module
 */

(function () {
  'use strict';

  // دالة موحدة لإرسال طلبات الـ API لدعم كلاً من API.request و TelegaApp.api.request
  const requestApi = async (endpoint, method = 'GET', data = null) => {
    if (window.API && typeof window.API.request === 'function') {
      return await window.API.request(endpoint, method, data);
    }
    if (window.TelegaApp?.api && typeof window.TelegaApp.api.request === 'function') {
      return await window.TelegaApp.api.request(endpoint, method, data);
    }
    const options = {
      method,
      headers: { 'Content-Type': 'application/json' }
    };
    if (data) options.body = JSON.stringify(data);
    const res = await fetch(endpoint, options);
    return await res.json();
  };

  // دالة موحدة للتنبيهات
  const notify = (msg, isError = false) => {
    if (window.TelegaApp?.ui?.showToast) {
      window.TelegaApp.ui.showToast(msg);
    } else if (window.UI?.notify) {
      window.UI.notify(msg, isError);
    } else {
      alert(msg);
    }
  };

  // دالة موحدة للترجمة والنصوص الافتراضية
  const t = (key, fallback) => {
    if (window.TelegaApp?.i18n?.t) {
      return window.TelegaApp.i18n.t(key);
    }
    return fallback;
  };

  const WalletModule = {
    data: {
      balance: 0,
      pendingWithdrawal: 0,
      usdtAddress: '',
      depositAddresses: {},
      minDeposit: 10
    },

    init: async function () {
      this.bindEvents();
      await this.loadAllData();
    },

    bindEvents: function () {
      // فتح النوافذ المنبثقة
      document.getElementById('open-deposit-modal')?.addEventListener('click', () => {
        document.getElementById('deposit-modal')?.classList.remove('hidden');
      });

      document.getElementById('open-withdraw-modal')?.addEventListener('click', () => {
        document.getElementById('withdraw-modal')?.classList.remove('hidden');
      });

      // نموذج الإيداع
      document.getElementById('deposit-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.submitDepositRequest();
      });

      // نموذج السحب
      document.getElementById('withdraw-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.submitWithdrawalRequest();
      });

      // تغيير شبكة الإيداع
      document.getElementById('deposit-network-select')?.addEventListener('change', () => {
        this.updateDepositAddressDisplay();
      });

      // حساب رسوم السحب ديناميكياً
      document.getElementById('withdraw-amount')?.addEventListener('input', () => {
        this.calculateWithdrawalSummary();
      });

      // حفظ عنوان USDT
      document.getElementById('save-address-btn')?.addEventListener('click', () => {
        this.saveAddress();
      });

      // نسخ رابط الإحالة
      document.getElementById('copy-ref-btn')?.addEventListener('click', () => {
        this.copyText('referral-link-input');
      });
    },

    loadAllData: async function () {
      try {
        await Promise.all([
          this.loadWalletInfo(),
          this.loadDepositAddresses(),
          this.loadTransactions(),
          this.loadWithdrawalHistory(),
          this.loadDepositHistory(),
          this.loadReferralData()
        ]);
      } catch (err) {
        console.error('Error loading wallet data:', err);
      }
    },

    loadWalletInfo: async function () {
      try {
        const res = await requestApi('/api/wallet/info');
        if (res && res.success && res.data) {
          const { balance = 0, pendingWithdrawal = 0, usdtTrc20Address = '', totalEarned = 0, totalWithdrawn = 0, referralLink = '' } = res.data;

          this.data.balance = balance;
          this.data.pendingWithdrawal = pendingWithdrawal;
          this.data.usdtAddress = usdtTrc20Address;

          this.updateBalances(balance, pendingWithdrawal);

          const totalEarnedEl = document.getElementById('total-earned');
          if (totalEarnedEl) totalEarnedEl.innerText = `$${totalEarned.toFixed(2)}`;

          const totalWithdrawnEl = document.getElementById('total-withdrawn');
          if (totalWithdrawnEl) totalWithdrawnEl.innerText = `$${totalWithdrawn.toFixed(2)}`;

          const addressInput = document.getElementById('saved-usdt-address');
          if (addressInput) addressInput.value = usdtTrc20Address;

          const refLinkInput = document.getElementById('referral-link-input');
          if (refLinkInput) refLinkInput.value = referralLink;
        }
      } catch (err) {
        console.error('Error in loadWalletInfo:', err);
      }
    },

    updateBalances: function (available = 0, pending = 0) {
      const availFormatted = `$${parseFloat(available).toFixed(2)}`;
      const availNum = parseFloat(available).toFixed(2);
      const pendingFormatted = `$${parseFloat(pending).toFixed(2)}`;

      ['home-balance', 'wallet-balance'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = availNum;
      });

      ['available-balance', 'availableBal'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = availFormatted;
      });

      ['pending-balance', 'reservedBal'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = pendingFormatted;
      });
    },

    saveAddress: async function () {
      const input = document.getElementById('saved-usdt-address');
      if (!input) return;
      const address = input.value.trim();

      if (!address) {
        notify('يرجى إدخال العنوان', true);
        return;
      }

      try {
        const res = await requestApi('/api/wallet/address', 'POST', { address });
        if (res && res.success) {
          notify(res.message || 'تم حفظ العنوان بنجاح!');
          this.data.usdtAddress = address;
        } else {
          notify(res?.message || 'فشل حفظ العنوان', true);
        }
      } catch (err) {
        notify('حدث خطأ أثناء حفظ العنوان', true);
      }
    },

    loadDepositAddresses: async function () {
      try {
        const res = await requestApi('/api/wallet/deposit-addresses');
        if (res && res.success) {
          this.data.depositAddresses = res.addresses || {};
          this.data.minDeposit = res.minDeposit || 10;
          this.updateDepositAddressDisplay();
        }
      } catch (err) {
        console.error('Error in loadDepositAddresses:', err);
      }
    },

    updateDepositAddressDisplay: function () {
      const select = document.getElementById('deposit-network-select');
      const addressDisplay = document.getElementById('deposit-address-display');
      if (select && addressDisplay) {
        const network = select.value;
        addressDisplay.innerText = this.data.depositAddresses[network] || 'غير متوفر';
      }
    },

    calculateWithdrawalSummary: function () {
      const amountInput = document.getElementById('withdraw-amount');
      if (!amountInput) return;
      const amount = parseFloat(amountInput.value) || 0;
      const fee = 3;
      const net = amount > fee ? amount - fee : 0;

      const feeDisplay = document.getElementById('withdraw-fee-display');
      if (feeDisplay) feeDisplay.innerText = `$${fee}`;

      const netDisplay = document.getElementById('withdraw-net-display');
      if (netDisplay) netDisplay.innerText = `$${net.toFixed(2)}`;
    },

    submitWithdrawalRequest: async function () {
      const amountInput = document.getElementById('withdraw-amount');
      const amount = parseFloat(amountInput?.value);

      if (!this.data.usdtAddress) {
        notify('يرجى إضافة وتأكيد عنوان USDT TRC20 أولاً', true);
        return;
      }

      if (isNaN(amount) || amount < 30) {
        notify('الحد الأدنى للسحب هو $30', true);
        return;
      }

      if (amount > this.data.balance) {
        notify('الرصيد المتاح غير كافٍ', true);
        return;
      }

      const confirmMsg = `تأكيد طلب السحب:\nالمبلغ الإجمالي: $${amount}\nرسوم السحب: $3\nالمبلغ الصافي: $${amount - 3}\nالعنوان: ${this.data.usdtAddress}`;
      if (!confirm(confirmMsg)) return;

      try {
        const res = await requestApi('/api/wallet/withdraw', 'POST', { amount });
        if (res && res.success) {
          notify(res.message || 'تم تقديم طلب السحب بنجاح!');
          if (amountInput) amountInput.value = '';
          document.getElementById('withdraw-modal')?.classList.add('hidden');
          await this.loadAllData();
        } else {
          notify(res?.message || 'فشل تقديم طلب السحب', true);
        }
      } catch (err) {
        notify('حدث خطأ أثناء إجراء السحب', true);
      }
    },

    submitDepositRequest: async function () {
      const networkEl = document.getElementById('deposit-network-select');
      const amountInput = document.getElementById('deposit-amount-input') || document.getElementById('deposit-amount');
      const txidInput = document.getElementById('deposit-txid-input');

      const network = networkEl ? networkEl.value : 'TRC20';
      const amount = parseFloat(amountInput?.value);
      const txid = txidInput ? txidInput.value.trim() : '';

      if (isNaN(amount) || amount < (this.data.minDeposit || 10)) {
        notify(`الحد الأدنى للإيداع هو $${this.data.minDeposit || 10}`, true);
        return;
      }

      try {
        const payload = txid ? { network, amount, txid } : { amount };
        const res = await requestApi('/api/wallet/deposit', 'POST', payload);

        if (res && res.success) {
          notify(res.message || 'تم الإيداع بنجاح!');
          if (amountInput) amountInput.value = '';
          if (txidInput) txidInput.value = '';
          document.getElementById('deposit-modal')?.classList.add('hidden');
          await this.loadAllData();
        } else {
          notify(res?.message || 'فشل طلب الإيداع', true);
        }
      } catch (err) {
        notify('حدث خطأ أثناء طلب الإيداع', true);
      }
    },

    loadTransactions: async function () {
      const listContainer = document.getElementById('transactions-list');
      if (!listContainer) return;

      try {
        const res = await requestApi('/api/wallet/transactions');
        if (res && res.success && res.transactions && res.transactions.length > 0) {
          listContainer.innerHTML = res.transactions.map(tx => `
            <div class="list-item">
              <div class="list-item-info">
                <span class="list-item-title">${tx.description || tx.type}</span>
                <span class="list-item-sub">${new Date(tx.createdAt).toLocaleString()}</span>
              </div>
              <span class="stat-value ${tx.amount > 0 ? 'color-success' : 'color-danger'}">
                ${tx.amount > 0 ? '+' : ''}$${parseFloat(tx.amount).toFixed(2)}
              </span>
            </div>
          `).join('');
        } else {
          listContainer.innerHTML = `<div class="empty-state">${t('no_transactions', 'لا توجد معاملات بعد')}</div>`;
        }
      } catch (err) {
        console.error('Error loading transactions:', err);
      }
    },

    loadWithdrawalHistory: async function () {
      const container = document.getElementById('withdrawal-history-list');
      if (!container) return;

      try {
        const res = await requestApi('/api/wallet/withdrawals');
        if (res && res.success && res.withdrawals && res.withdrawals.length > 0) {
          container.innerHTML = res.withdrawals.map(w => `
            <div class="history-item">
              <div class="item-header">
                <span class="req-id">#${w.requestId}</span>
                <span class="status status-${(w.status || '').toLowerCase()}">${w.status}</span>
              </div>
              <div class="item-details">
                <p>المبلغ: <strong>$${w.amount}</strong> | الصافي: <strong>$${w.netAmount}</strong></p>
                <p class="date">${new Date(w.createdAt).toLocaleString('ar-EG')}</p>
                ${w.rejectionReason ? `<p class="error-text">سبب الرفض: ${w.rejectionReason}</p>` : ''}
              </div>
            </div>
          `).join('');
        } else {
          container.innerHTML = `<p class="empty-msg">${t('no_withdrawals', 'لا توجد طلبات سحب سابقة')}</p>`;
        }
      } catch (err) {
        console.error('Error loading withdrawal history:', err);
      }
    },

    loadDepositHistory: async function () {
      const container = document.getElementById('deposit-history-list');
      if (!container) return;

      try {
        const res = await requestApi('/api/wallet/deposits');
        if (res && res.success && res.deposits && res.deposits.length > 0) {
          container.innerHTML = res.deposits.map(d => `
            <div class="history-item">
              <div class="item-header">
                <span class="req-id">#${d.requestId} (${d.network})</span>
                <span class="status status-${(d.status || '').toLowerCase()}">${d.status}</span>
              </div>
              <div class="item-details">
                <p>المبلغ: <strong>$${d.amount}</strong></p>
                <p class="txid">TXID: ${d.txid}</p>
                <p class="date">${new Date(d.createdAt).toLocaleString('ar-EG')}</p>
              </div>
            </div>
          `).join('');
        } else {
          container.innerHTML = `<p class="empty-msg">${t('no_deposits', 'لا توجد طلبات إيداع سابقة')}</p>`;
        }
      } catch (err) {
        console.error('Error loading deposit history:', err);
      }
    },

    loadReferralData: async function () {
      try {
        const res = await requestApi('/api/referrals/stats');
        if (res && res.success) {
          const refCountEl = document.getElementById('ref-count') || document.getElementById('referral-count');
          if (refCountEl) refCountEl.textContent = res.referralCount ?? res.referralsCount ?? 0;

          const refEarningsEl = document.getElementById('ref-earnings') || document.getElementById('referral-commission');
          if (refEarningsEl) {
            const totalComm = res.referralEarnings ?? res.totalCommission ?? 0;
            refEarningsEl.textContent = `$${parseFloat(totalComm).toFixed(2)}`;
          }

          const referralsList = document.getElementById('referrals-list');
          if (referralsList) {
            if (res.referrals && res.referrals.length > 0) {
              referralsList.innerHTML = res.referrals.map(ref => `
                <div class="list-item">
                  <div class="list-item-info">
                    <span class="list-item-title">${ref.firstName || 'مستخدم'} ${ref.username ? '(@' + ref.username + ')' : ''}</span>
                    <span class="list-item-sub">انضم بتاريخ: ${new Date(ref.registeredAt || ref.createdAt).toLocaleDateString('ar-EG')}</span>
                  </div>
                </div>
              `).join('');
            } else {
              referralsList.innerHTML = `<div class="empty-state">${t('no_referrals', 'لا توجد إحالات بعد')}</div>`;
            }
          }

          const logsContainer = document.getElementById('referral-logs-list');
          if (logsContainer) {
            if (res.logs && res.logs.length > 0) {
              logsContainer.innerHTML = res.logs.map(log => `
                <div class="history-item">
                  <div class="item-header">
                    <span>المستخدم: ${log.referredUser ? log.referredUser.username || log.referredUser.firstName : 'مستخدم'}</span>
                    <span class="status status-${(log.status || '').toLowerCase()}">${log.status}</span>
                  </div>
                  <div class="item-details">
                    <p>العمولة: <strong>$${log.commission}</strong> (من $${log.amount})</p>
                    <p class="date">${new Date(log.createdAt).toLocaleString('ar-EG')}</p>
                  </div>
                </div>
              `).join('');
            } else {
              logsContainer.innerHTML = `<p class="empty-msg">${t('no_referral_logs', 'لا توجد أرباح إحالات بعد')}</p>`;
            }
          }
        }
      } catch (err) {
        console.error('Error loading referral data:', err);
      }
    },

    copyText: function (elementId) {
      const el = document.getElementById(elementId);
      if (!el) return;
      const text = el.value || el.innerText;
      if (!text) return;

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
          notify('تم النسخ للحافظة بنجاح!');
        }).catch(() => {
          notify('فشل النسخ تلقائياً', true);
        });
      } else {
        notify('النسخ غير مدعوم على هذا المتصفح', true);
      }
    }
  };

  // تصدير النطاق الآمن لكلا الاسمين للربط الخلفي والتوافق التام
  window.WalletModule = WalletModule;
  window.TelegaApp = window.TelegaApp || {};
  window.TelegaApp.wallet = WalletModule;

  // تهيئة عند اكتمال التحميل
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => WalletModule.init());
  } else {
    WalletModule.init();
  }
})();
