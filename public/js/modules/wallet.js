import {
  fetchWalletOverview,
  updateTrc20Address,
  createDepositRequest,
  createWithdrawalRequest
} from './api.js';
import {
  formatUsd,
  formatDate,
  showAlert,
  showToast,
  getTransactionIcon,
  getTransactionTypeLabel,
  copyToClipboard
} from './ui.js';
import { t } from '../language/i18n.js';

const STEP_ORDER = [
  { key: 'submitted', label: 'استلام الطلب' },
  { key: 'under_review', label: 'المراجعة الأمنية' },
  { key: 'trc20_broadcast', label: 'الإرسال TRC20' },
  { key: 'completed', label: 'مكتمل' }
];

const POSITIVE_TX_TYPES = new Set([
  'deposit',
  'earning',
  'referral_commission',
  'campaign_refund'
]);

function notify(message, type = 'info') {
  if (typeof showAlert === 'function') {
    showAlert(message, type);
  } else if (typeof showToast === 'function') {
    showToast(message);
  }
}

function renderBalances(wallet) {
  if (!wallet) return;

  const balanceMap = {
    statBalanceUsd: wallet.balanceUsd,
    statAvailableEarningsUsd: wallet.availableEarningsUsd,
    statPendingEarningsUsd: wallet.pendingEarningsUsd,
    statTotalEarnedUsd: wallet.totalEarnedUsd,
    statTotalSpentUsd: wallet.totalSpentUsd,
    statReferralEarningsUsd: wallet.referralEarningsUsd
  };

  Object.entries(balanceMap).forEach(([elementId, amount]) => {
    const el = document.getElementById(elementId);
    if (el) {
      el.textContent = formatUsd(amount ?? 0);
    }
  });

  const trcInput = document.getElementById('trc20AddressInput');
  if (trcInput && document.activeElement !== trcInput && wallet.trc20WalletAddress) {
    trcInput.value = wallet.trc20WalletAddress;
  }
}

function renderRecentTransactions(transactions) {
  const container = document.getElementById('recentTransactionsList');
  if (!container) return;

  if (!Array.isArray(transactions) || transactions.length === 0) {
    container.innerHTML = `<p class="muted-note">${t('noData')}</p>`;
    return;
  }

  container.innerHTML = transactions
    .slice(0, 10)
    .map((tx) => {
      const icon = getTransactionIcon(tx.type);
      const label = getTransactionTypeLabel(tx.type);
      const sign = POSITIVE_TX_TYPES.has(tx.type) ? '+' : '-';
      const status = tx.status || '';
      const notesPart = tx.notes ? `${tx.notes} • ` : '';

      return `
        <div class="tx-item">
          <div class="tx-left">
            <div class="tx-icon" aria-hidden="true">${icon}</div>
            <div>
              <div class="tx-title">${label}</div>
              <div class="tx-sub">${notesPart}${formatDate(tx.createdAt)}</div>
            </div>
          </div>
          <div class="tx-right">
            <div><strong>${sign}${formatUsd(tx.amountUsd ?? 0)}</strong></div>
            <span class="badge ${status}">${status}</span>
          </div>
        </div>
      `;
    })
    .join('');
}

function renderWithdrawalTracker(withdrawals) {
  const container = document.getElementById('withdrawalTrackerContainer');
  if (!container) return;

  if (!Array.isArray(withdrawals) || withdrawals.length === 0) {
    container.innerHTML = `<p class="muted-note">${t('noData')}</p>`;
    return;
  }

  container.innerHTML = withdrawals
    .slice(0, 5)
    .map((wd) => {
      const currentIdx = STEP_ORDER.findIndex((s) => s.key === wd.step);
      const stepsHtml = STEP_ORDER.map((stepObj, idx) => {
        let cls = 'step-pill';
        if (wd.status === 'completed' || (currentIdx !== -1 && idx < currentIdx)) {
          cls += ' done';
        } else if (idx === currentIdx) {
          cls += ' current';
        }
        return `<div class="${cls}">${stepObj.label}</div>`;
      }).join('');

      const status = wd.status || '';

      return `
        <div class="tracker-item">
          <div class="card-header-row">
            <strong>${formatUsd(wd.amountUsd ?? 0)} (${t('netReceiveLabel')} ${formatUsd(wd.netAmountUsd ?? 0)})</strong>
            <span class="badge ${status}">${status}</span>
          </div>
          <div class="tx-sub">TRC20: ${wd.trc20Address || ''} • ${formatDate(wd.createdAt)}</div>
          <div class="tracker-steps">${stepsHtml}</div>
        </div>
      `;
    })
    .join('');
}

function renderHistoryTables(deposits, withdrawals) {
  const depBody = document.getElementById('depositsHistoryBody');
  const wdBody = document.getElementById('withdrawalsHistoryBody');

  if (depBody) {
    if (!Array.isArray(deposits) || deposits.length === 0) {
      depBody.innerHTML = `<tr><td colspan="4">${t('noData')}</td></tr>`;
    } else {
      depBody.innerHTML = deposits
        .map(
          (d) => `
          <tr>
            <td>${formatUsd(d.amountUsd ?? 0)}</td>
            <td><code>${d.txid || ''}</code></td>
            <td><span class="badge ${d.status || ''}">${d.status || ''}</span></td>
            <td>${formatDate(d.createdAt)}</td>
          </tr>
        `
        )
        .join('');
    }
  }

  if (wdBody) {
    if (!Array.isArray(withdrawals) || withdrawals.length === 0) {
      wdBody.innerHTML = `<tr><td colspan="4">${t('noData')}</td></tr>`;
    } else {
      wdBody.innerHTML = withdrawals
        .map(
          (w) => `
          <tr>
            <td>${formatUsd(w.amountUsd ?? 0)}</td>
            <td>${formatUsd(w.netAmountUsd ?? 0)}</td>
            <td><code>${w.trc20Address || ''}</code></td>
            <td><span class="badge ${w.status || ''}">${w.status || ''}</span></td>
          </tr>
        `
        )
        .join('');
    }
  }
}

export async function refreshWallet(userId, referredBy = '') {
  if (!userId) return null;

  const data = await fetchWalletOverview(userId, referredBy);
  if (!data) return null;

  if (data.rules && data.rules.depositAddress) {
    const depAddrInput = document.getElementById('depositAddressInput');
    if (depAddrInput) {
      depAddrInput.value = data.rules.depositAddress;
    }
  }

  renderBalances(data.wallet);
  renderRecentTransactions(data.recentTransactions || []);
  renderWithdrawalTracker(data.withdrawals || []);
  renderHistoryTables(data.deposits || [], data.withdrawals || []);
  return data;
}

export function bindReferralEvents(getUserId, getBotUsername) {
  const revealBtn = document.querySelector('[data-action="reveal-referral"]');
  const linkBox = document.getElementById('referral-link-box');
  const linkInput = document.getElementById('ref-link-input');
  const copyRefBtn = document.getElementById('copy-ref-btn');

  if (revealBtn && !revealBtn.dataset.bound) {
    revealBtn.dataset.bound = 'true';
    revealBtn.addEventListener('click', () => {
      const uid = typeof getUserId === 'function' ? getUserId() : getUserId;
      const botName = typeof getBotUsername === 'function' ? getBotUsername() : getBotUsername;
      const cleanBot = String(botName || 'TelegaAdsBot').replace(/^@/, '');
      const refCode = btoa(String(uid || 'guest')).replace(/=/g, '');

      if (linkInput) {
        linkInput.value = `https://t.me/${cleanBot}?start=ref_${refCode}`;
      }
      linkBox?.classList.remove('hidden');
    });
  }

  if (copyRefBtn && !copyRefBtn.dataset.bound) {
    copyRefBtn.dataset.bound = 'true';
    copyRefBtn.addEventListener('click', async () => {
      if (!linkInput?.value) return;
      try {
        if (typeof copyToClipboard === 'function') {
          await copyToClipboard(linkInput.value);
        } else if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(linkInput.value);
        } else {
          linkInput.select();
          document.execCommand('copy');
        }
        notify(t('copied_success') || t('copied'), 'success');
      } catch {
        linkInput.select();
        document.execCommand('copy');
        notify(t('copied_success') || t('copied'), 'success');
      }
    });
  }
}

export function bindWalletEvents(getUserId, onRefresh, getBotUsername = '') {
  const resolveUserId = () => (typeof getUserId === 'function' ? getUserId() : getUserId);
  const triggerRefresh = async () => {
    if (typeof onRefresh === 'function') {
      await onRefresh();
    }
  };

  bindReferralEvents(resolveUserId, getBotUsername);

  const copyBtn = document.getElementById('copyDepositAddressBtn');
  if (copyBtn && !copyBtn.dataset.bound) {
    copyBtn.dataset.bound = 'true';
    copyBtn.addEventListener('click', async () => {
      const addr = document.getElementById('depositAddressInput')?.value || '';
      await copyToClipboard(addr);
      notify(t('copied'), 'success');
    });
  }

  const modal = document.getElementById('depositInstructionsModal');
  const openBtn = document.getElementById('openDepositInstructionsBtn');
  const closeBtn = document.getElementById('closeDepositInstructionsBtn');

  if (openBtn && modal && !openBtn.dataset.bound) {
    openBtn.dataset.bound = 'true';
    openBtn.addEventListener('click', () => modal.classList.remove('hidden'));
  }

  if (closeBtn && modal && !closeBtn.dataset.bound) {
    closeBtn.dataset.bound = 'true';
    closeBtn.addEventListener('click', () => modal.classList.add('hidden'));
  }

  const withdrawAmountInput = document.getElementById('withdrawAmountInput');
  const netPreview = document.getElementById('withdrawNetPreview');
  if (withdrawAmountInput && netPreview && !withdrawAmountInput.dataset.bound) {
    withdrawAmountInput.dataset.bound = 'true';
    withdrawAmountInput.addEventListener('input', () => {
      const val = Number(withdrawAmountInput.value);
      const net = Number.isFinite(val) && val > 3 ? val - 3 : 0;
      netPreview.textContent = formatUsd(net);
    });
  }

  const saveTrc20Form = document.getElementById('saveTrc20Form');
  if (saveTrc20Form && !saveTrc20Form.dataset.bound) {
    saveTrc20Form.dataset.bound = 'true';
    saveTrc20Form.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const uid = resolveUserId();
        const address = document.getElementById('trc20AddressInput')?.value.trim() || '';
        await updateTrc20Address(uid, address);
        notify('تم حفظ عنوان محفظة USDT - TRC20 بنجاح', 'success');
        await triggerRefresh();
      } catch (err) {
        notify(err.message, 'error');
      }
    });
  }

  const depositForm = document.getElementById('depositForm');
  if (depositForm && !depositForm.dataset.bound) {
    depositForm.dataset.bound = 'true';
    depositForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const uid = resolveUserId();
        const amountUsd = Number(document.getElementById('depositAmountInput')?.value);
        const txid = document.getElementById('depositTxidInput')?.value.trim() || '';
        await createDepositRequest(uid, amountUsd, txid);
        depositForm.reset();
        notify('تم إرسال طلب الإيداع للمراجعة الإدارية بنجاح', 'success');
        await triggerRefresh();
      } catch (err) {
        notify(err.message, 'error');
      }
    });
  }

  const withdrawForm = document.getElementById('withdrawForm');
  if (withdrawForm && !withdrawForm.dataset.bound) {
    withdrawForm.dataset.bound = 'true';
    withdrawForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const uid = resolveUserId();
        const amountUsd = Number(document.getElementById('withdrawAmountInput')?.value);
        const trc20Address = document.getElementById('trc20AddressInput')?.value.trim() || '';
        await createWithdrawalRequest(uid, amountUsd, trc20Address);
        withdrawForm.reset();
        if (netPreview) netPreview.textContent = '$0.00';
        notify('تم تسجيل طلب السحب عبر USDT - TRC20 بنجاح', 'success');
        await triggerRefresh();
      } catch (err) {
        notify(err.message, 'error');
      }
    });
  }
}

export async function initWalletAndReferralModule(userInternalId, botUsername, referredBy = '') {
  const getUid = () => userInternalId;
  const doRefresh = () => refreshWallet(userInternalId, referredBy);

  bindWalletEvents(getUid, doRefresh, botUsername);
  return doRefresh();
}
