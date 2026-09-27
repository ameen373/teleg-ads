import { state, i18n } from '../state.js';
import { safeFetch } from './api.js';
import { showToast, setButtonLoading, toggleWalletEdit, updateWithdrawCalculations } from './ui.js';
import { loadUserData } from './user.js';

export async function requestDeposit() {
  const netElem = document.getElementById('deposit-network');
  const amtElem = document.getElementById('deposit-amount');
  const txidElem = document.getElementById('deposit-txhash');

  if (!netElem || !amtElem || !txidElem) return;

  const network = netElem.value;
  const amountVal = amtElem.value;
  const txHashVal = txidElem.value.trim();

  if (!network) {
    showToast(i18n[state.currentLang]?.select_network || 'يرجى اختيار شبكة الدفع');
    return;
  }
  const amount = parseFloat(amountVal);
  if (!amount || amount < 1) {
    showToast(i18n[state.currentLang]?.min_deposit || 'الحد الأدنى للإيداع هو $1');
    return;
  }
  if (!txHashVal || txHashVal.length < 5) {
    showToast(i18n[state.currentLang]?.enter_txid || 'يرجى إدخال رمز المعاملة (TxID)');
    return;
  }

  setButtonLoading('btn-request-deposit', true);

  try {
    const res = await safeFetch('/api/deposit', {
      method: 'POST',
      body: {
        userId: state.currentUserTelegramId,
        telegramId: state.currentUserTelegramId,
        network: network,
        amount: amount,
        txid: txHashVal,
        txHash: txHashVal
      }
    });

    if (res) {
      const data = await res.json().catch(() => ({}));
      if (res.ok && (data.success || data.deposit)) {
        showToast(i18n[state.currentLang]?.deposit_success || 'تم تقديم طلب الشحن بنجاح!');
        amtElem.value = '';
        txidElem.value = '';
        await loadUserData();
      } else {
        showToast(data.error || data.message || 'فشل تقديم طلب الشحن');
      }
    }
  } catch (err) {
    console.error("Deposit request error:", err);
    showToast(err.message || 'خطأ أثناء تقديم الطلب');
  } finally {
    setButtonLoading('btn-request-deposit', false);
  }
}

export async function saveSettings() {
  const walletElem = document.getElementById('default-wallet');
  if (!walletElem) return;

  const walletAddr = walletElem.value.trim();
  if (!walletAddr) {
    showToast(i18n[state.currentLang]?.enter_wallet || 'يرجى إدخال عنوان المحفظة');
    return;
  }

  try {
    const res = await safeFetch('/api/user/settings', {
      method: 'POST',
      body: {
        userId: state.currentUserTelegramId,
        telegramId: state.currentUserTelegramId,
        defaultWallet: walletAddr
      }
    });

    if (res) {
      const data = await res.json().catch(() => ({}));
      if (res.ok && (data.success || data.user)) {
        showToast(i18n[state.currentLang]?.wallet_saved || 'تم حفظ العنوان بنجاح');
        toggleWalletEdit();
        await loadUserData();
      } else {
        showToast(data.error || 'فشل حفظ العنوان');
      }
    }
  } catch (err) {
    showToast(err.message || 'خطأ أثناء الحفظ');
  }
}

export async function requestWithdrawal() {
  const walletElem = document.getElementById('default-wallet');
  const amtElem = document.getElementById('withdraw-amount');

  if (!walletElem || !amtElem) return;

  const walletAddr = walletElem.value.trim();
  const amountVal = parseFloat(amtElem.value) || 0;

  if (!walletAddr) {
    showToast(i18n[state.currentLang]?.enter_wallet || 'يرجى إدخال وتحديد عنوان محفظة السحب أولاً');
    return;
  }

  if (amountVal < 30) {
    showToast(i18n[state.currentLang]?.min_withdraw || 'الحد الأدنى للسحب هو 30$');
    return;
  }

  setButtonLoading('btn-request-withdraw', true);

  try {
    const res = await safeFetch('/api/withdraw', {
      method: 'POST',
      body: {
        userId: state.currentUserTelegramId,
        telegramId: state.currentUserTelegramId,
        amount: amountVal,
        wallet: walletAddr
      }
    });

    if (res) {
      const data = await res.json().catch(() => ({}));
      if (res.ok && (data.success || data.withdraw)) {
        showToast(i18n[state.currentLang]?.withdraw_success || 'تم تقديم طلب السحب بنجاح');
        amtElem.value = '';
        updateWithdrawCalculations();
        await loadUserData();
      } else {
        showToast(data.error || data.message || 'فشل تقديم طلب السحب');
      }
    }
  } catch (err) {
    showToast(err.message || 'خطأ في عملية السحب');
  } finally {
    setButtonLoading('btn-request-withdraw', false);
  }
}

export function renderWithdrawalsHistory(withdraws) {
  const container = document.getElementById('withdraws-list');
  if (!container) return;

  if (!withdraws || withdraws.length === 0) {
    container.innerHTML = `<p style="text-align:center; color: var(--text-muted); margin: 10px 0;">${i18n[state.currentLang]?.no_withdraws || 'لا توجد طلبات سحب سابقة.'}</p>`;
    return;
  }

  container.innerHTML = withdraws.map(w => {
    const isApproved = w.status === 'completed' || w.status === 'approved';
    const isRejected = w.status === 'rejected';
    
    const statusClass = isApproved ? 'color: var(--success);' : isRejected ? 'color: var(--danger);' : 'color: var(--warning);';
    const statusText = isApproved ? (i18n[state.currentLang]?.approved || 'مكتمل') : isRejected ? (i18n[state.currentLang]?.rejected || 'مرفوض') : (i18n[state.currentLang]?.pending || 'قيد المراجعة');
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
