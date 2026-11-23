// ==================== WALLET & TRANSACTIONS ====================
(function () {
  function t(key, fallback = '') {
    if (!key) return fallback;
    if (window.I18n && typeof window.I18n.t === 'function') {
      const val = window.I18n.t(key);
      if (val !== undefined && val !== null) return val;
    }
    if (window.I18N && typeof window.I18N.t === 'function') {
      const val = window.I18N.t(key);
      if (val !== undefined && val !== null) return val;
    }
    return fallback || key;
  }

  function toast(message) {
    if (!message) return;
    if (typeof window.showToast === 'function') {
      window.showToast(message);
    } else if (window.UI && typeof window.UI.showToast === 'function') {
      window.UI.showToast(message);
    } else if (window.UI && typeof window.UI.notify === 'function') {
      window.UI.notify(message);
    }
  }

  function esc(str) {
    if (typeof window.escapeHTML === 'function') return window.escapeHTML(str);
    if (window.UI && typeof window.UI.escapeHTML === 'function') return window.UI.escapeHTML(str);
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getState() {
    if (window.AppState) return window.AppState;
    if (typeof AppState !== 'undefined') return AppState;
    return null;
  }

  function getTxTypeText(type) {
    if (typeof window.getTxTypeLabel === 'function') {
      return window.getTxTypeLabel(type);
    }
    if (window.UI && typeof window.UI.getTxTypeLabel === 'function') {
      return window.UI.getTxTypeLabel(type);
    }
    const map = {
      deposit: 'tx_type_deposit',
      withdraw: 'tx_type_withdraw',
      ad_spend: 'tx_type_ad_spend',
      ad_earning: 'tx_type_ad_earning',
      budget_topup: 'tx_type_budget_topup'
    };
    return t(map[type] || type, type || '');
  }

  async function sendRequest(url, method, body) {
    if (typeof window.apiSend === 'function') {
      return window.apiSend(url, method, body);
    }
    if (window.Api && typeof window.Api.send === 'function') {
      return window.Api.send(url, method, body);
    }
    const options = {
      method,
      headers: {
        ...(window.Api?.getInitData ? { 'x-telegram-init-data': window.Api.getInitData() } : {})
      }
    };
    if (body !== undefined) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
    const res = await fetch(url, options);
    return res.json();
  }

  async function refreshWalletState() {
    if (typeof window.fetchWallet === 'function') {
      await window.fetchWallet();
    } else if (window.Api && typeof window.Api.fetchWallet === 'function') {
      await window.Api.fetchWallet();
    }
    if (window.App && typeof window.App.refreshUserData === 'function') {
      try {
        await window.App.refreshUserData();
      } catch (err) {
        console.error(err);
      }
    }
  }

  function renderWallet(user) {
    if (user && typeof user === 'object') {
      const earningsEl = document.getElementById('wallet-earnings-balance');
      const adBalanceEl = document.getElementById('wallet-ad-balance');
      const refCountEl = document.getElementById('ref-count');
      const refEarningsEl = document.getElementById('ref-earnings');
      const refInputEl = document.getElementById('referral-link-input');

      if (earningsEl) {
        earningsEl.textContent = `$${Number(user.balance || 0).toFixed(2)}`;
      }
      if (adBalanceEl) {
        adBalanceEl.textContent = `$${Number(user.adBalance || 0).toFixed(2)}`;
      }
      if (refCountEl) {
        refCountEl.textContent = user.referralsCount ?? 0;
      }
      if (refEarningsEl) {
        refEarningsEl.textContent = `$${Number(user.referralEarnings || 0).toFixed(2)}`;
      }
      if (refInputEl) {
        const botUsername =
          window.Telegram?.WebApp?.initDataUnsafe?.receiver?.username || 'YourBotUsername';
        refInputEl.value = `https://t.me/${botUsername}?startapp=ref_${user.telegramId}`;
      }
    }

    const state = getState();
    const wallet = state && state.wallet ? state.wallet : null;
    if (!wallet) return;

    const advEl = document.getElementById('wallet-adv-balance');
    const pubEl = document.getElementById('wallet-pub-balance');
    const txListEl = document.getElementById('wallet-tx-list');

    if (advEl) {
      advEl.textContent = `${Number(wallet.advertiserBalance || 0).toFixed(2)}$`;
    }
    if (pubEl) {
      pubEl.textContent = `${Number(wallet.publisherBalance || 0).toFixed(2)}$`;
    }

    if (!txListEl) return;
    const txs = Array.isArray(wallet.transactions) ? wallet.transactions : [];
    if (!txs.length) {
      txListEl.innerHTML = `<div class="empty-state">${esc(t('no_transactions', t('no_data')))}</div>`;
      return;
    }

    txListEl.innerHTML = txs
      .map((tx) => {
        const roleLabel =
          tx.walletRole === 'advertiser' ? t('wallet_role_adv') : t('wallet_role_pub');
        const noteHtml = tx.note
          ? `<span style="color:var(--text-muted);">(${esc(tx.note)})</span>`
          : '';
        return `
          <div class="tx-row">
            <div>
              <strong>${esc(getTxTypeText(tx.type))}</strong> ·
              <span>${esc(roleLabel)}</span>
              ${noteHtml}
            </div>
            <strong>${esc(Number(tx.amount || 0).toFixed(2))}$</strong>
          </div>
        `;
      })
      .join('');
  }

  async function handleWalletOperation(endpointType) {
    const roleEl = document.getElementById('wallet-role-select');
    const amountEl = document.getElementById('wallet-amount-input');

    const role = roleEl ? roleEl.value : 'advertiser';
    const amount = amountEl ? parseFloat(amountEl.value) : NaN;

    if (isNaN(amount) || amount <= 0) {
      toast(t('msg_fill_required'));
      return;
    }

    try {
      const json = await sendRequest(`/api/wallet/${endpointType}`, 'POST', {
        role,
        amount,
        idempotencyKey: `${endpointType}_${role}_${amount}_${Date.now()}`
      });

      if (json && json.success) {
        toast(t('msg_wallet_updated'));
        await refreshWalletState();
      } else {
        toast((json && json.message) || t('msg_fill_required'));
      }
    } catch (err) {
      toast(err.message);
    }
  }

  const WalletModule = {
    init() {
      const depositForm = document.getElementById('deposit-form');
      if (depositForm) {
        depositForm.addEventListener('submit', async (e) => {
          e.preventDefault();
          try {
            const amount = document.getElementById('deposit-amount')?.value;
            await window.Api.requestDeposit(amount);
            depositForm.reset();
            if (window.UI && typeof window.UI.haptic === 'function') {
              window.UI.haptic('medium');
            }
            await window.App.refreshUserData();
          } catch (err) {
            if (window.UI && typeof window.UI.notify === 'function') {
              window.UI.notify(err.message);
            } else {
              toast(err.message);
            }
          }
        });
      }

      const withdrawForm = document.getElementById('withdraw-form');
      if (withdrawForm) {
        withdrawForm.addEventListener('submit', async (e) => {
          e.preventDefault();
          try {
            const amount = document.getElementById('withdraw-amount')?.value;
            const address = document.getElementById('withdraw-address')?.value;
            await window.Api.requestWithdraw(amount, address);
            withdrawForm.reset();
            if (window.UI && typeof window.UI.haptic === 'function') {
              window.UI.haptic('medium');
            }
            await window.App.refreshUserData();
          } catch (err) {
            if (window.UI && typeof window.UI.notify === 'function') {
              window.UI.notify(err.message);
            } else {
              toast(err.message);
            }
          }
        });
      }

      const copyBtn = document.getElementById('copy-ref-btn');
      if (copyBtn) {
        copyBtn.addEventListener('click', () => {
          const input = document.getElementById('referral-link-input');
          if (!input) return;
          input.select();
          if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            navigator.clipboard.writeText(input.value);
          }
          if (window.UI && typeof window.UI.notify === 'function') {
            window.UI.notify(t('copied_msg'));
          } else {
            toast(t('copied_msg'));
          }
        });
      }
    },

    render(user) {
      renderWallet(user);
    },

    renderWallet,
    handleWalletOperation
  };

  window.WalletModule = WalletModule;

  // Global helper functions for event listeners and cross-module compatibility
  window.renderWallet = renderWallet;
  window.handleWalletOperation = handleWalletOperation;
})();
