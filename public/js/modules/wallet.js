(function () {
  function translateKey(key, fallback = '', ctx) {
    if (!key) return fallback;
    try {
      if (ctx && typeof ctx.t === 'function') {
        const val = ctx.t(key, ctx);
        if (val !== undefined && val !== null) return val;
      }
      if (window.TelegaI18n && typeof window.TelegaI18n.t === 'function') {
        const val = window.TelegaI18n.t(key, ctx);
        if (val !== undefined && val !== null) return val;
      }
      if (window.I18N && typeof window.I18N.t === 'function') {
        const val = window.I18N.t(key, ctx);
        if (val !== undefined && val !== null) return val;
      }
    } catch (err) {
      console.error(err);
    }
    return fallback || key;
  }

  function esc(str) {
    if (window.UI && typeof window.UI.escapeHTML === 'function') {
      return window.UI.escapeHTML(str);
    }
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getState(ctx) {
    if (ctx && ctx.state && typeof ctx.state === 'object') return ctx.state;
    if (window.AppState && typeof window.AppState === 'object') return window.AppState;
    if (typeof AppState !== 'undefined' && AppState && typeof AppState === 'object') return AppState;
    return null;
  }

  function getEl(id, ctx) {
    if (!id) return null;
    if (ctx && typeof ctx.el === 'function') {
      const node = ctx.el(id);
      if (node) return node;
    }
    if (ctx && ctx.root && typeof ctx.root.querySelector === 'function') {
      const escaped = typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(id) : id;
      const found = ctx.root.querySelector(`#${escaped}`);
      if (found) return found;
    }
    return document.getElementById(id);
  }

  function toast(message, ctx) {
    if (!message) return;
    try {
      if (window.UI && typeof window.UI.showToast === 'function') {
        window.UI.showToast(message, ctx);
      } else if (window.UI && typeof window.UI.notify === 'function') {
        window.UI.notify(message);
      }
    } catch (err) {
      console.error(err);
    }
  }

  function showWalletNotice(targetId, message, isError = false, ctx) {
    if (!message) return;
    try {
      if (ctx && typeof ctx.showNotice === 'function') {
        ctx.showNotice(targetId, message, isError);
      } else if (window.UI && typeof window.UI.showNotice === 'function') {
        window.UI.showNotice(targetId, message, isError, ctx);
      }
    } catch (err) {
      console.error(err);
    }
    toast(message, ctx);
  }

  function clearWalletNotice(targetId, ctx) {
    try {
      if (ctx && typeof ctx.clearNotice === 'function') {
        ctx.clearNotice(targetId);
      } else if (window.UI && typeof window.UI.clearNotice === 'function') {
        window.UI.clearNotice(targetId, ctx);
      }
    } catch (err) {
      console.error(err);
    }
  }

  function syncSmartAlerts(alerts, ctx) {
    try {
      const list = Array.isArray(alerts) ? alerts : [];
      const state = getState(ctx);
      if (state) state.smartAlerts = list;
      if (ctx && typeof ctx.renderSmartAlerts === 'function') {
        ctx.renderSmartAlerts(list);
      } else if (window.UI && typeof window.UI.renderSmartAlerts === 'function') {
        window.UI.renderSmartAlerts(list, ctx);
      }
    } catch (err) {
      console.error(err);
    }
  }

  function buildContext(ctx) {
    if (ctx && ctx.state) return ctx;
    if (window.App && typeof window.App.getContext === 'function') {
      const appCtx = window.App.getContext();
      if (appCtx) return appCtx;
    }
    const state = getState(ctx);
    const baseCtx = {
      state,
      el: (id) => document.getElementById(id),
      t: (key) => translateKey(key, key, baseCtx),
      apiRequest: async (url, options = {}) => {
        const headers = Object.assign(
          {},
          state?.userId ? { 'x-user-id': String(state.userId) } : {},
          state?.adminKey ? { 'x-admin-key': String(state.adminKey) } : {},
          options && options.headers ? options.headers : {}
        );
        if (options && options.body !== undefined && !headers['Content-Type']) {
          headers['Content-Type'] = 'application/json';
        }
        const res = await fetch(url, Object.assign({}, options, { headers }));
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.ok === false || data.success === false) {
          const err = new Error(data.error || data.message || 'Request failed');
          err.status = res.status;
          err.data = data;
          throw err;
        }
        return data;
      },
      showNotice: (targetId, message, isError) => {
        if (window.UI && typeof window.UI.showNotice === 'function') {
          window.UI.showNotice(targetId, message, isError, baseCtx);
        }
      },
      clearNotice: (targetId) => {
        if (window.UI && typeof window.UI.clearNotice === 'function') {
          window.UI.clearNotice(targetId, baseCtx);
        }
      },
      refreshWallet: async () => {
        await refreshWallet(baseCtx);
      },
      refreshAdminPanel: async () => {
        if (window.AdminModule && typeof window.AdminModule.loadDashboard === 'function') {
          await window.AdminModule.loadDashboard(baseCtx);
        }
      }
    };
    return baseCtx;
  }

  function getTxIcon(type) {
    switch (type) {
      case 'deposit':
        return '⬇️';
      case 'withdrawal':
      case 'withdraw':
        return '⬆️';
      case 'earnings':
      case 'ad_earning':
        return '💰';
      case 'settlement':
      case 'ad_spend':
      case 'budget_topup':
        return '⚖️';
      case 'referral':
        return '🤝';
      case 'manual_adjustment':
        return '🛠️';
      default:
        return '💳';
    }
  }

  function getTxTypeText(type, ctx) {
    if (window.UI && typeof window.UI.getTxTypeLabel === 'function') {
      return window.UI.getTxTypeLabel(type, ctx);
    }
    const map = {
      deposit: 'tx_type_deposit',
      withdraw: 'tx_type_withdraw',
      withdrawal: 'tx_type_withdraw',
      ad_spend: 'tx_type_ad_spend',
      ad_earning: 'tx_type_ad_earning',
      budget_topup: 'tx_type_budget_topup'
    };
    return translateKey(map[type] || type, type || '', ctx);
  }

  function syncWithdrawalSummary(ctx) {
    try {
      const activeCtx = buildContext(ctx);
      const state = activeCtx.state;
      const summaryEl = getEl('withdrawSummaryText', activeCtx);
      if (!summaryEl || !state) return;

      const amount = Number(getEl('withdrawAmountInput', activeCtx)?.value || 0);
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

  function renderTransactions(list, ctx) {
    const container = getEl('transactionsList', ctx);
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

  function renderWithdrawalsTracker(withdrawals, ctx) {
    const container = getEl('withdrawalsTrackerList', ctx);
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
        { method: 'GET' },
        activeCtx
      );
      if (!data) return;

      const user = data.user || {};
      const setText = (id, val) => {
        const node = getEl(id, activeCtx);
        if (node) node.textContent = val;
      };

      setText('walletBalanceValue', `$${Number(user.walletBalance || 0).toFixed(2)}`);
      setText('pendingEarningsValue', `$${Number(user.pendingEarnings || 0).toFixed(2)}`);
      setText('availableEarningsValue', `$${Number(user.availableEarnings || 0).toFixed(2)}`);
      setText('referralTotalValue', `$${Number(user.referralEarningsTotal || 0).toFixed(2)}`);

      const savedTrc20 = user.trc20Address || '';
      setText('savedTrc20Text', savedTrc20 || '---');

      const trcSaveInput = getEl('trc20SaveInput', activeCtx);
      if (savedTrc20 && trcSaveInput && !trcSaveInput.value) {
        trcSaveInput.value = savedTrc20;
      }

      const withdrawAddrInput = getEl('withdrawAddressInput', activeCtx);
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

      renderTransactions(data.recentTransactions || [], activeCtx);
      renderWithdrawalsTracker(data.withdrawals || [], activeCtx);
      syncSmartAlerts(data.smartAlerts || [], activeCtx);
    } catch (err) {
      console.error(err);
      throw err;
    }
  }

  function renderWallet(ctxOrUser) {
    try {
      const isCtx = ctxOrUser && typeof ctxOrUser === 'object' && ctxOrUser.state;
      const activeCtx = buildContext(isCtx ? ctxOrUser : undefined);
      const state = activeCtx.state;
      const user = !isCtx && ctxOrUser && typeof ctxOrUser === 'object' ? ctxOrUser : null;

      if (user) {
        const earningsEl = getEl('wallet-earnings-balance', activeCtx);
        const adBalanceEl = getEl('wallet-ad-balance', activeCtx);
        const refCountEl = getEl('ref-count', activeCtx);
        const refEarningsEl = getEl('ref-earnings', activeCtx);
        const refInputEl = getEl('referral-link-input', activeCtx);

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
            window.Telegram?.WebApp?.initDataUnsafe?.receiver?.username || 'adTelega_bot';
          refInputEl.value = `https://t.me/${botUsername}?startapp=ref_${user.telegramId}`;
        }
      }

      const wallet = state && state.wallet ? state.wallet : null;
      if (!wallet) return;

      const advEl = getEl('wallet-adv-balance', activeCtx);
      const pubEl = getEl('wallet-pub-balance', activeCtx);
      const txListEl = getEl('wallet-tx-list', activeCtx);

      if (advEl) {
        advEl.textContent = `${Number(wallet.advertiserBalance || 0).toFixed(2)}$`;
      }
      if (pubEl) {
        pubEl.textContent = `${Number(wallet.publisherBalance || 0).toFixed(2)}$`;
      }

      if (!txListEl) return;
      const txs = Array.isArray(wallet.transactions) ? wallet.transactions : [];
      if (!txs.length) {
        txListEl.innerHTML = `<div class="empty-state">${esc(translateKey('no_transactions', translateKey('no_data', 'No data', activeCtx), activeCtx))}</div>`;
        return;
      }

      txListEl.innerHTML = txs
        .map((tx) => {
          const roleLabel =
            tx.walletRole === 'advertiser'
              ? translateKey('wallet_role_adv', 'Advertiser', activeCtx)
              : translateKey('wallet_role_pub', 'Publisher', activeCtx);
          const noteHtml = tx.note
            ? `<span style="color:var(--text-muted);">(${esc(tx.note)})</span>`
            : '';
          return `
            <div class="tx-row">
              <div>
                <strong>${esc(getTxTypeText(tx.type, activeCtx))}</strong> ·
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

  async function handleWalletOperation(endpointType, ctx) {
    const activeCtx = buildContext(ctx);
    const roleEl = getEl('wallet-role-select', activeCtx);
    const amountEl = getEl('wallet-amount-input', activeCtx);

    const role = roleEl ? roleEl.value : 'advertiser';
    const amount = amountEl ? parseFloat(amountEl.value) : NaN;

    if (isNaN(amount) || amount <= 0) {
      toast(translateKey('msg_fill_required', 'Please fill required fields', activeCtx), activeCtx);
      return;
    }

    try {
      const json = await activeCtx.apiRequest(
        `/api/wallet/${encodeURIComponent(endpointType)}`,
        {
          method: 'POST',
          body: JSON.stringify({
            userId: activeCtx.state?.userId,
            role,
            amount,
            idempotencyKey: `${endpointType}_${role}_${amount}_${Date.now()}`
          })
        },
        activeCtx
      );

      if (json && (json.success || json.ok !== false)) {
        toast(translateKey('msg_wallet_updated', 'Wallet updated', activeCtx), activeCtx);
        await refreshWallet(activeCtx);
        renderWallet(activeCtx);
      } else {
        toast((json && json.message) || translateKey('msg_fill_required', 'Error', activeCtx), activeCtx);
      }
    } catch (err) {
      console.error(err);
      toast(err.message, activeCtx);
    }
  }

  function bindEvents(ctx) {
    const activeCtx = buildContext(ctx);
    const state = activeCtx.state;

    const saveTrc20Btn = getEl('saveTrc20Btn', activeCtx);
    if (saveTrc20Btn) {
      saveTrc20Btn.addEventListener('click', async () => {
        clearWalletNotice('withdrawNotice', activeCtx);
        try {
          const addr = getEl('trc20SaveInput', activeCtx)?.value.trim() || '';
          await activeCtx.apiRequest(
            '/api/users/trc20-wallet',
            {
              method: 'POST',
              body: JSON.stringify({ userId: state?.userId, trc20Address: addr })
            },
            activeCtx
          );
          const withdrawAddrInput = getEl('withdrawAddressInput', activeCtx);
          if (withdrawAddrInput) withdrawAddrInput.value = addr;
          showWalletNotice('withdrawNotice', 'تم حفظ عنوان محفظة USDT - TRC20 بنجاح.', false, activeCtx);
          await refreshWallet(activeCtx);
        } catch (err) {
          showWalletNotice('withdrawNotice', err.message, true, activeCtx);
        }
      });
    }

    const withdrawAmountInput = getEl('withdrawAmountInput', activeCtx);
    if (withdrawAmountInput) {
      withdrawAmountInput.addEventListener('input', () => syncWithdrawalSummary(activeCtx));
    }

    const depositForm = getEl('depositForm', activeCtx);
    if (depositForm) {
      depositForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearWalletNotice('depositNotice', activeCtx);
        try {
          const amount = Number(getEl('depositAmountInput', activeCtx)?.value || 0);
          const txid = getEl('depositTxidInput', activeCtx)?.value.trim() || '';
          await activeCtx.apiRequest(
            '/api/wallet/deposit',
            {
              method: 'POST',
              body: JSON.stringify({ userId: state?.userId, amount, txid })
            },
            activeCtx
          );
          if (getEl('depositTxidInput', activeCtx)) getEl('depositTxidInput', activeCtx).value = '';
          showWalletNotice('depositNotice', 'تم تسجيل طلب الإيداع بنجاح وهو بانتظار مراجعة الإدارة.', false, activeCtx);
          await refreshWallet(activeCtx);
          if (state?.adminKey && activeCtx.refreshAdminPanel) {
            await activeCtx.refreshAdminPanel(activeCtx);
          }
        } catch (err) {
          showWalletNotice('depositNotice', err.message, true, activeCtx);
        }
      });
    }

    const withdrawForm = getEl('withdrawForm', activeCtx);
    if (withdrawForm) {
      withdrawForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearWalletNotice('withdrawNotice', activeCtx);
        try {
          const amount = Number(getEl('withdrawAmountInput', activeCtx)?.value || 0);
          const destinationAddress = getEl('withdrawAddressInput', activeCtx)?.value.trim() || '';
          await activeCtx.apiRequest(
            '/api/wallet/withdraw',
            {
              method: 'POST',
              body: JSON.stringify({ userId: state?.userId, amount, destinationAddress })
            },
            activeCtx
          );
          showWalletNotice('withdrawNotice', 'تم تأكيد وإرسال طلب السحب عبر USDT - TRC20 بنجاح.', false, activeCtx);
          await refreshWallet(activeCtx);
          if (state?.adminKey && activeCtx.refreshAdminPanel) {
            await activeCtx.refreshAdminPanel(activeCtx);
          }
        } catch (err) {
          showWalletNotice('withdrawNotice', err.message, true, activeCtx);
        }
      });
    }
  }

  const WalletModule = {
    init(ctx) {
      const activeCtx = buildContext(ctx);
      const state = activeCtx.state;

      const depositForm = getEl('deposit-form', activeCtx);
      if (depositForm) {
        depositForm.addEventListener('submit', async (e) => {
          e.preventDefault();
          try {
            const amount = Number(getEl('deposit-amount', activeCtx)?.value || 0);
            await activeCtx.apiRequest(
              '/api/wallet/deposit',
              {
                method: 'POST',
                body: JSON.stringify({ userId: state?.userId, amount })
              },
              activeCtx
            );
            depositForm.reset();
            if (window.UI && typeof window.UI.haptic === 'function') {
              window.UI.haptic('medium');
            }
            await refreshWallet(activeCtx);
            renderWallet(activeCtx);
          } catch (err) {
            console.error(err);
            if (window.UI && typeof window.UI.notify === 'function') {
              window.UI.notify(err.message);
            } else {
              toast(err.message, activeCtx);
            }
          }
        });
      }

      const withdrawForm = getEl('withdraw-form', activeCtx);
      if (withdrawForm) {
        withdrawForm.addEventListener('submit', async (e) => {
          e.preventDefault();
          try {
            const amount = Number(getEl('withdraw-amount', activeCtx)?.value || 0);
            const destinationAddress = getEl('withdraw-address', activeCtx)?.value.trim() || '';
            await activeCtx.apiRequest(
              '/api/wallet/withdraw',
              {
                method: 'POST',
                body: JSON.stringify({ userId: state?.userId, amount, destinationAddress })
              },
              activeCtx
            );
            withdrawForm.reset();
            if (window.UI && typeof window.UI.haptic === 'function') {
              window.UI.haptic('medium');
            }
            await refreshWallet(activeCtx);
            renderWallet(activeCtx);
          } catch (err) {
            console.error(err);
            if (window.UI && typeof window.UI.notify === 'function') {
              window.UI.notify(err.message);
            } else {
              toast(err.message, activeCtx);
            }
          }
        });
      }

      const copyBtn = getEl('copy-ref-btn', activeCtx);
      if (copyBtn) {
        copyBtn.addEventListener('click', async () => {
          try {
            const input = getEl('referral-link-input', activeCtx);
            if (!input) return;
            input.select();
            if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
              await navigator.clipboard.writeText(input.value);
            }
            const copiedLabel = translateKey('copied_msg', 'Copied!', activeCtx);
            if (window.UI && typeof window.UI.notify === 'function') {
              window.UI.notify(copiedLabel);
            } else {
              toast(copiedLabel, activeCtx);
            }
          } catch (err) {
            console.error(err);
            toast(err.message, activeCtx);
          }
        });
      }
    },

    async refresh(ctx) {
      await refreshWallet(ctx);
    },

    render(ctxOrUser) {
      renderWallet(ctxOrUser);
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
  window.handleWalletOperation = (endpointType, ctx) => handleWalletOperation(endpointType, ctx);
  window.syncWithdrawalSummary = (ctx) => syncWithdrawalSummary(ctx);
  window.refreshWallet = (ctx) => refreshWallet(ctx);
  window.bindWalletEvents = (ctx) => bindEvents(ctx);
})();
