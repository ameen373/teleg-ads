// ==================== WALLET & TRANSACTIONS ====================
(function () {
  function t(key, fallback = '') {
    if (!key) return fallback;
    try {
      if (window.TelegaI18n && typeof window.TelegaI18n.t === 'function') {
        const val = window.TelegaI18n.t(key);
        if (val !== undefined && val !== null) return val;
      }
      if (window.I18n && typeof window.I18n.t === 'function') {
        const val = window.I18n.t(key);
        if (val !== undefined && val !== null) return val;
      }
      if (window.I18N && typeof window.I18N.t === 'function') {
        const val = window.I18N.t(key);
        if (val !== undefined && val !== null) return val;
      }
    } catch (err) {
      console.error(err);
    }
    return fallback || key;
  }

  function toast(message) {
    if (!message) return;
    try {
      if (typeof window.showToast === 'function') {
        window.showToast(message);
      } else if (window.UI && typeof window.UI.showToast === 'function') {
        window.UI.showToast(message);
      } else if (window.UI && typeof window.UI.notify === 'function') {
        window.UI.notify(message);
      }
    } catch (err) {
      console.error(err);
    }
  }

  function esc(str) {
    if (typeof window.escapeHTML === 'function') return window.escapeHTML(str);
    if (window.UI && typeof window.UI.escapeHTML === 'function') return window.UI.escapeHTML(str);
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getEl(id) {
    return document.getElementById(id);
  }

  function showWalletNotice(targetId, message, isError = false) {
    if (!message) return;
    try {
      if (window.UI && typeof window.UI.showNotice === 'function') {
        window.UI.showNotice(targetId, message, isError);
      } else if (typeof window.showNotice === 'function') {
        window.showNotice(targetId, message, isError);
      }
    } catch (err) {
      console.error(err);
    }
    toast(message);
  }

  function clearWalletNotice(targetId) {
    try {
      if (window.UI && typeof window.UI.clearNotice === 'function') {
        window.UI.clearNotice(targetId);
      } else if (typeof window.clearNotice === 'function') {
        window.clearNotice(targetId);
      }
    } catch (err) {
      console.error(err);
    }
  }

  function syncSmartAlerts(alerts) {
    try {
      const list = Array.isArray(alerts) ? alerts : [];
      const state = getState();
      if (state) state.smartAlerts = list;
      if (window.UI && typeof window.UI.renderSmartAlerts === 'function') {
        window.UI.renderSmartAlerts(list);
      } else if (typeof window.renderSmartAlerts === 'function') {
        window.renderSmartAlerts(list);
      }
    } catch (err) {
      console.error(err);
    }
  }

  function getState() {
    if (window.AppState) return window.AppState;
    if (typeof AppState !== 'undefined') return AppState;
    return null;
  }

  function buildContext(ctx) {
    if (ctx && ctx.state) return ctx;
    if (window.App && typeof window.App.getContext === 'function') {
      return window.App.getContext();
    }
    const state = getState();
    return {
      state,
      el: getEl,
      apiRequest: async (url, options = {}) =>
        sendRequest(url, options.method || 'GET', options.body ? JSON.parse(options.body) : undefined, options.headers),
      showNotice: (targetOrMsg, msgOrErr, maybeErr) => {
        if (typeof maybeErr === 'boolean') {
          showWalletNotice(targetOrMsg, msgOrErr, maybeErr);
        } else if (typeof msgOrErr === 'boolean') {
          showWalletNotice('withdrawNotice', targetOrMsg, msgOrErr);
        } else {
          showWalletNotice('withdrawNotice', targetOrMsg, false);
        }
      },
      clearNotice: (targetId) => clearWalletNotice(targetId || 'withdrawNotice'),
      refreshWallet: async () => refreshWalletState(),
      refreshAdminPanel: async () => {
        if (window.AdminModule && typeof window.AdminModule.loadDashboard === 'function') {
          await window.AdminModule.loadDashboard();
        } else if (typeof window.fetchAdminOverview === 'function') {
          await window.fetchAdminOverview();
        }
      }
    };
  }

  function getTxIcon(type) {
    switch (type) {
      case 'deposit':
        return '⬇️';
      case 'withdrawal':
        return '⬆️';
      case 'earnings':
        return '💰';
      case 'settlement':
        return '⚖️';
      case 'referral':
        return '🤝';
      case 'manual_adjustment':
        return '🛠️';
      default:
        return '💳';
    }
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
      withdrawal: 'tx_type_withdraw',
      ad_spend: 'tx_type_ad_spend',
      ad_earning: 'tx_type_ad_earning',
      budget_topup: 'tx_type_budget_topup'
    };
    return t(map[type] || type, type || '');
  }

  async function sendRequest(url, method, body, extraHeaders = {}) {
    try {
      const state = getState();
      const userId = extraHeaders['x-user-id'] || state?.userId || '';
      const adminKey = extraHeaders['x-admin-key'] || state?.adminKey || '';

      if (typeof window.apiSend === 'function' && !userId && !adminKey) {
        return await window.apiSend(url, method, body);
      }
      if (window.Api && typeof window.Api.send === 'function' && !userId && !adminKey) {
        return await window.Api.send(url, method, body);
      }

      const headers = Object.assign(
        {},
        window.Api?.getInitData ? { 'x-telegram-init-data': window.Api.getInitData() } : {},
        userId ? { 'x-user-id': userId } : {},
        adminKey ? { 'x-admin-key': adminKey } : {},
        extraHeaders
      );

      const options = {
        method,
        headers
      };

      if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
        options.body = typeof body === 'string' ? body : JSON.stringify(body);
      }

      const res = await fetch(url, options);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false || data.success === false) {
        const err = new Error(data.error || data.message || 'Request failed');
        err.status = res.status;
        err.data = data;
        throw err;
      }
      return data;
    } catch (err) {
      console.error(err);
      throw err;
    }
  }

  function syncWithdrawalSummary(ctx) {
    try {
      const activeCtx = buildContext(ctx);
      const state = activeCtx.state;
      const summaryEl = getEl('withdrawSummaryText');
      if (!summaryEl || !state) return;

      const amount = Number(getEl('withdrawAmountInput')?.value || 0);
      const fee = Number(state.withdrawalFeeUsd ?? 3);
      const minWithdrawal = Number(state.minWithdrawalUsd ?? 30);
      const network = state.withdrawalNetwork || 'USDT - TRC20';
      const net = Math.max(0, Math.round((amount - fee) * 100) / 100);

      summaryEl.textContent =
        `الشبكة: ${network} | الحد الأدنى: $${minWithdrawal.toFixed(2)} | الرسوم: $${fee.toFixed(2)} | الصافي المستلم: $${net.toFixed(2)}`;
    } catch (err) {
      console.error(err);
    }
  }

  function renderTransactions(list) {
    const container = getEl('transactionsList');
    if (!container) return;

    try {
      if (!Array.isArray(list) || list.length === 0) {
        container.innerHTML = '<div class="list-row"><span class="stat-label">لا توجد معاملات بعد.</span></div>';
        return;
      }

      container.innerHTML = list
        .slice(0, 10)
        .map((tx) => {
          const icon = getTxIcon(tx.type);
          const statusClass = `badge-${esc(tx.status || 'pending')}`;
          return `
            <div class="tx-item">
              <div>
                <strong>${icon} ${esc(tx.type || '')}</strong>
                <div class="stat-label">${esc(tx.note || '')}</div>
                <div class="stat-label">${esc(tx.createdAt || '')}</div>
              </div>
              <div>
                <strong>$${Number(tx.amount || 0).toFixed(2)}</strong>
                <span class="badge ${statusClass}">${esc(tx.status || '')}</span>
              </div>
            </div>
          `;
        })
        .join('');
    } catch (err) {
      console.error(err);
    }
  }

  function renderWithdrawalsTracker(withdrawals) {
    const container = getEl('withdrawalsTrackerList');
    if (!container) return;

    try {
      if (!Array.isArray(withdrawals) || withdrawals.length === 0) {
        container.innerHTML = '<div class="list-row"><span class="stat-label">لا توجد طلبات سحب حالياً.</span></div>';
        return;
      }

      container.innerHTML = withdrawals
        .map((w) => {
          const stepsHtml = (w.steps || [])
            .map((s) => `<span class="step-pill">${esc(s.label || s.step || '')}</span>`)
            .join(' ← ');

          return `
            <div class="list-row">
              <div style="width: 100%;">
                <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
                  <strong>$${Number(w.amount || 0).toFixed(2)} (صافي $${Number(w.netAmount || 0).toFixed(2)}، رسوم $${Number(w.feeAmount ?? 3).toFixed(2)})</strong>
                  <span class="badge badge-${esc(w.status || '')}">${esc(w.status || '')}</span>
                </div>
                <div class="stat-label">الشبكة: ${esc(w.network || 'USDT - TRC20')} | العنوان: ${esc(w.destinationAddress || '')}</div>
                ${w.adminNote ? `<div class="stat-label">ملاحظة الإدارة: ${esc(w.adminNote)}</div>` : ''}
                <div class="steps-track">${stepsHtml}</div>
              </div>
            </div>
          `;
        })
        .join('');
    } catch (err) {
      console.error(err);
    }
  }

  async function refreshWallet(ctx) {
    const activeCtx = buildContext(ctx);
    const state = activeCtx.state;
    if (!state || !state.userId) return;

    try {
      const data = await activeCtx.apiRequest(
        `/api/wallet/${encodeURIComponent(state.userId)}`,
        undefined,
        activeCtx
      );
      if (!data) return;

      const user = data.user || {};
      const setText = (id, val) => {
        const node = getEl(id);
        if (node) node.textContent = val;
      };

      setText('walletBalanceValue', `$${Number(user.walletBalance || 0).toFixed(2)}`);
      setText('pendingEarningsValue', `$${Number(user.pendingEarnings || 0).toFixed(2)}`);
      setText('availableEarningsValue', `$${Number(user.availableEarnings || 0).toFixed(2)}`);
      setText('referralTotalValue', `$${Number(user.referralEarningsTotal || 0).toFixed(2)}`);

      const savedTrc20 = user.trc20Address || '';
      setText('savedTrc20Text', savedTrc20 || '---');

      const trcSaveInput = getEl('trc20SaveInput');
      if (savedTrc20 && trcSaveInput && !trcSaveInput.value) {
        trcSaveInput.value = savedTrc20;
      }

      const withdrawAddrInput = getEl('withdrawAddressInput');
      if (savedTrc20 && withdrawAddrInput && !withdrawAddrInput.value) {
        withdrawAddrInput.value = savedTrc20;
      }

      if (data.depositInfo) {
        state.walletAddress = data.depositInfo.walletAddress;
        state.minDepositUsd = data.depositInfo.minDepositUsd;
        setText(
          'depositAddressText',
          `${data.depositInfo.walletAddress} (${data.depositInfo.network || state.withdrawalNetwork || 'USDT - TRC20'})`
        );
      }

      if (data.withdrawalInfo) {
        state.minWithdrawalUsd = data.withdrawalInfo.minWithdrawalUsd;
        state.withdrawalFeeUsd = data.withdrawalInfo.feeUsd;
        state.withdrawalNetwork = data.withdrawalInfo.network;
        syncWithdrawalSummary(activeCtx);
      }

      renderTransactions(data.recentTransactions || []);
      renderWithdrawalsTracker(data.withdrawals || []);
      syncSmartAlerts(data.smartAlerts || []);
    } catch (err) {
      console.error(err);
      throw err;
    }
  }

  async function refreshWalletState() {
    try {
      const activeCtx = buildContext();
      if (activeCtx.state?.userId && getEl('walletBalanceValue')) {
        await refreshWallet(activeCtx).catch(() => {});
      }
      if (typeof window.fetchWallet === 'function') {
        await window.fetchWallet();
      } else if (window.Api && typeof window.Api.fetchWallet === 'function') {
        await window.Api.fetchWallet();
      }
      if (window.App && typeof window.App.refreshUserData === 'function') {
        await window.App.refreshUserData();
      }
    } catch (err) {
      console.error(err);
    }
  }

  function renderWallet(user) {
    try {
      if (user && typeof user === 'object') {
        const earningsEl = getEl('wallet-earnings-balance');
        const adBalanceEl = getEl('wallet-ad-balance');
        const refCountEl = getEl('ref-count');
        const refEarningsEl = getEl('ref-earnings');
        const refInputEl = getEl('referral-link-input');

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

      const advEl = getEl('wallet-adv-balance');
      const pubEl = getEl('wallet-pub-balance');
      const txListEl = getEl('wallet-tx-list');

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
    } catch (err) {
      console.error(err);
    }
  }

  async function handleWalletOperation(endpointType) {
    const roleEl = getEl('wallet-role-select');
    const amountEl = getEl('wallet-amount-input');

    const role = roleEl ? roleEl.value : 'advertiser';
    const amount = amountEl ? parseFloat(amountEl.value) : NaN;

    if (isNaN(amount) || amount <= 0) {
      toast(t('msg_fill_required'));
      return;
    }

    try {
      const json = await sendRequest(`/api/wallet/${encodeURIComponent(endpointType)}`, 'POST', {
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
      console.error(err);
      toast(err.message);
    }
  }

  function bindEvents(ctx) {
    const activeCtx = buildContext(ctx);
    const state = activeCtx.state;

    const saveTrc20Btn = getEl('saveTrc20Btn');
    if (saveTrc20Btn) {
      saveTrc20Btn.addEventListener('click', async () => {
        clearWalletNotice('withdrawNotice');
        try {
          const addr = getEl('trc20SaveInput')?.value.trim() || '';
          await activeCtx.apiRequest(
            '/api/users/trc20-wallet',
            {
              method: 'POST',
              body: JSON.stringify({ userId: state?.userId, trc20Address: addr })
            },
            activeCtx
          );
          const withdrawAddrInput = getEl('withdrawAddressInput');
          if (withdrawAddrInput) withdrawAddrInput.value = addr;
          showWalletNotice('withdrawNotice', 'تم حفظ عنوان محفظة USDT - TRC20 بنجاح.', false);
          await refreshWallet(activeCtx);
        } catch (err) {
          showWalletNotice('withdrawNotice', err.message, true);
        }
      });
    }

    const withdrawAmountInput = getEl('withdrawAmountInput');
    if (withdrawAmountInput) {
      withdrawAmountInput.addEventListener('input', () => syncWithdrawalSummary(activeCtx));
    }

    const depositForm = getEl('depositForm');
    if (depositForm) {
      depositForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearWalletNotice('depositNotice');
        try {
          const amount = Number(getEl('depositAmountInput')?.value || 0);
          const txid = getEl('depositTxidInput')?.value.trim() || '';
          await activeCtx.apiRequest(
            '/api/wallet/deposit',
            {
              method: 'POST',
              body: JSON.stringify({ userId: state?.userId, amount, txid })
            },
            activeCtx
          );
          if (getEl('depositTxidInput')) getEl('depositTxidInput').value = '';
          showWalletNotice('depositNotice', 'تم تسجيل طلب الإيداع بنجاح وهو بانتظار مراجعة الإدارة.', false);
          await refreshWallet(activeCtx);
          if (state?.adminKey && activeCtx.refreshAdminPanel) {
            await activeCtx.refreshAdminPanel(activeCtx);
          }
        } catch (err) {
          showWalletNotice('depositNotice', err.message, true);
        }
      });
    }

    const withdrawForm = getEl('withdrawForm');
    if (withdrawForm) {
      withdrawForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearWalletNotice('withdrawNotice');
        try {
          const amount = Number(getEl('withdrawAmountInput')?.value || 0);
          const destinationAddress = getEl('withdrawAddressInput')?.value.trim() || '';
          await activeCtx.apiRequest(
            '/api/wallet/withdraw',
            {
              method: 'POST',
              body: JSON.stringify({ userId: state?.userId, amount, destinationAddress })
            },
            activeCtx
          );
          showWalletNotice('withdrawNotice', 'تم تأكيد وإرسال طلب السحب عبر USDT - TRC20 بنجاح.', false);
          await refreshWallet(activeCtx);
          if (state?.adminKey && activeCtx.refreshAdminPanel) {
            await activeCtx.refreshAdminPanel(activeCtx);
          }
        } catch (err) {
          showWalletNotice('withdrawNotice', err.message, true);
        }
      });
    }
  }

  const WalletModule = {
    init() {
      const depositForm = getEl('deposit-form');
      if (depositForm) {
        depositForm.addEventListener('submit', async (e) => {
          e.preventDefault();
          try {
            const amount = getEl('deposit-amount')?.value;
            await window.Api.requestDeposit(amount);
            depositForm.reset();
            if (window.UI && typeof window.UI.haptic === 'function') {
              window.UI.haptic('medium');
            }
            if (window.App && typeof window.App.refreshUserData === 'function') {
              await window.App.refreshUserData();
            }
          } catch (err) {
            console.error(err);
            if (window.UI && typeof window.UI.notify === 'function') {
              window.UI.notify(err.message);
            } else {
              toast(err.message);
            }
          }
        });
      }

      const withdrawForm = getEl('withdraw-form');
      if (withdrawForm) {
        withdrawForm.addEventListener('submit', async (e) => {
          e.preventDefault();
          try {
            const amount = getEl('withdraw-amount')?.value;
            const address = getEl('withdraw-address')?.value;
            await window.Api.requestWithdraw(amount, address);
            withdrawForm.reset();
            if (window.UI && typeof window.UI.haptic === 'function') {
              window.UI.haptic('medium');
            }
            if (window.App && typeof window.App.refreshUserData === 'function') {
              await window.App.refreshUserData();
            }
          } catch (err) {
            console.error(err);
            if (window.UI && typeof window.UI.notify === 'function') {
              window.UI.notify(err.message);
            } else {
              toast(err.message);
            }
          }
        });
      }

      const copyBtn = getEl('copy-ref-btn');
      if (copyBtn) {
        copyBtn.addEventListener('click', async () => {
          try {
            const input = getEl('referral-link-input');
            if (!input) return;
            input.select();
            if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
              await navigator.clipboard.writeText(input.value);
            }
            if (window.UI && typeof window.UI.notify === 'function') {
              window.UI.notify(t('copied_msg'));
            } else {
              toast(t('copied_msg'));
            }
          } catch (err) {
            console.error(err);
            toast(err.message);
          }
        });
      }
    },

    async refresh(ctx) {
      await refreshWallet(ctx);
    },

    render(user) {
      renderWallet(user);
    },

    renderWallet,
    handleWalletOperation,
    getTxIcon,
    syncWithdrawalSummary,
    renderTransactions,
    renderWithdrawalsTracker,
    refreshWallet,
    bindEvents,
    bindWalletEvents: bindEvents
  };

  window.WalletModule = WalletModule;

  // Global helper functions for event listeners and cross-module compatibility
  window.renderWallet = renderWallet;
  window.handleWalletOperation = handleWalletOperation;
  window.syncWithdrawalSummary = syncWithdrawalSummary;
  window.refreshWallet = refreshWallet;
  window.bindWalletEvents = bindEvents;
})();
