import { state } from '../state.js';
import { safeFetch } from './api.js';
import { showToast, setButtonLoading, toggleWalletEdit, updateWithdrawCalculations, toggleModal } from './ui.js';
import { loadUserData } from './user.js';

export async function requestDeposit() {
  let netElem = document.getElementById('modal-deposit-network');
  let amtElem = document.getElementById('modal-deposit-amount');
  let txidElem = document.getElementById('modal-deposit-txhash');

  if (!netElem || !netElem.value) {
    netElem = document.getElementById('deposit-network');
    amtElem = document.getElementById('deposit-amount');
    txidElem = document.getElementById('deposit-txhash');
  }

  if (!netElem || !amtElem || !txidElem) return;

  const network = netElem.value;
  const amountVal = amtElem.value;
  const txHashVal = txidElem.value.trim();

  if (!network) {
    showToast(state.currentLang === 'ar' ? 'يرجى اختيار شبكة الدفع' : 'Please select payment network');
    return;
  }
  const amount = parseFloat(amountVal);
  if (!amount || amount < 1) {
    showToast(state.currentLang === 'ar' ? 'الحد الأدنى للإيداع هو $1' : 'Minimum deposit amount is $1');
    return;
  }
  if (!txHashVal || txHashVal.length < 5) {
    showToast(state.currentLang === 'ar' ? 'يرجى إدخال رمز المعاملة (TxID)' : 'Please enter transaction TxID / Hash');
    return;
  }

  const activeBtnId = document.getElementById('modal-deposit-amount')?.value ? 'modal-deposit-btn' : 'btn-request-deposit';
  setButtonLoading(activeBtnId, true);

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
        showToast(state.currentLang === 'ar' ? 'تم تقديم طلب الشحن بنجاح! سيتم مراجعته قريباً.' : 'Deposit request submitted successfully!');
        amtElem.value = '';
        txidElem.value = '';
        toggleModal('deposit-modal', false);
        await loadUserData();
      } else {
        showToast(data.error || data.message || (state.currentLang === 'ar' ? 'فشل تقديم طلب الشحن' : 'Failed to submit deposit request'));
      }
    }
  } catch (err) {
    console.error("Deposit request error:", err);
    showToast(err.message || (state.currentLang === 'ar' ? 'خطأ أثناء تقديم الطلب' : 'Error submitting request'));
  } finally {
    setButtonLoading(activeBtnId, false);
  }
}

export async function saveSettings() {
  const walletElem = document.getElementById('default-wallet');
  if (!walletElem) return;

  const walletAddr = walletElem.value.trim();
  if (!walletAddr) {
    showToast(state.currentLang === 'ar' ? 'يرجى إدخال عنوان المحفظة' : 'Please enter wallet address');
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
        showToast(state.currentLang === 'ar' ? 'تم حفظ العنوان بنجاح' : 'Wallet address saved');
        toggleWalletEdit();
        await loadUserData();
      } else {
        showToast(data.error || (state.currentLang === 'ar' ? 'فشل حفظ العنوان' : 'Failed to save address'));
      }
    }
  } catch (err) {
    showToast(err.message || (state.currentLang === 'ar' ? 'خطأ أثناء الحفظ' : 'Error saving settings'));
  }
}

export async function requestWithdrawal() {
  const walletElem = document.getElementById('default-wallet');
  let amtElem = document.getElementById('modal-withdraw-amount');
  
  if (!amtElem || !amtElem.value) {
    amtElem = document.getElementById('withdraw-amount');
  }

  if (!walletElem || !amtElem) return;

  const walletAddr = walletElem.value.trim();
  const amountVal = parseFloat(amtElem.value) || 0;

  if (!walletAddr) {
    showToast(state.currentLang === 'ar' ? 'يرجى إدخال وتحديد عنوان محفظة السحب أولاً' : 'Please define withdrawal wallet address first');
    return;
  }

  if (amountVal < 30) {
    showToast(state.currentLang === 'ar' ? 'الحد الأدنى للسحب هو 30$' : 'Minimum withdrawal is $30');
    return;
  }

  const activeBtnId = document.getElementById('modal-withdraw-amount')?.value ? 'modal-withdraw-btn' : 'btn-request-withdraw';
  setButtonLoading(activeBtnId, true);

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
        showToast(state.currentLang === 'ar' ? 'تم تقديم طلب السحب بنجاح' : 'Withdrawal requested successfully');
        amtElem.value = '';
        updateWithdrawCalculations();
        toggleModal('withdraw-modal', false);
        await loadUserData();
      } else {
        showToast(data.error || data.message || (state.currentLang === 'ar' ? 'فشل تقديم طلب السحب' : 'Failed to request withdrawal'));
      }
    }
  } catch (err) {
    showToast(err.message || (state.currentLang === 'ar' ? 'خطأ في عملية السحب' : 'Error processing withdrawal'));
  } finally {
    setButtonLoading(activeBtnId, false);
  }
}

export function renderWithdrawalsHistory(withdraws) {
  const container = document.getElementById('withdraws-list');
  if (!container) return;

  if (!withdraws || withdraws.length === 0) {
    container.innerHTML = `<p style="text-align:center; color: var(--text-muted); margin: 10px 0;">${state.currentLang === 'ar' ? 'لا توجد طلبات سحب سابقة.' : 'No withdrawal history found.'}</p>`;
    return;
  }

  container.innerHTML = withdraws.map(w => {
    const statusClass = w.status === 'completed' || w.status === 'approved' ? 'color: var(--success);' : w.status === 'rejected' ? 'color: var(--danger);' : 'color: var(--warning);';
    const statusText = w.status === 'completed' || w.status === 'approved' ? (state.currentLang === 'ar' ? 'مكتمل' : 'Approved') : w.status === 'rejected' ? (state.currentLang === 'ar' ? 'مرفوض' : 'Rejected') : (state.currentLang === 'ar' ? 'قيد المراجعة' : 'Pending');
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
