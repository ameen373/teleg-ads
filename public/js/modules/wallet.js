import { state, i18n } from '../state.js';
import { safeFetch } from './api.js';
import { showToast, closeModal, escapeHTML } from './ui.js';
import { loadUserData } from './user.js';

export async function requestDeposit() {
  const modalAmt = document.getElementById('modal-deposit-amount')?.value;
  const modalTx = document.getElementById('modal-deposit-txhash')?.value;
  const modalNet = document.getElementById('modal-deposit-network')?.value;

  const tabAmt = document.getElementById('deposit-amount')?.value;
  const tabTx = document.getElementById('deposit-txhash')?.value;
  const tabNet = document.getElementById('deposit-network')?.value;

  const amount = modalAmt || tabAmt;
  const txHash = modalTx || tabTx;
  const network = modalNet || tabNet;

  if (!amount || !txHash || !network) {
    showToast(i18n[state.currentLang]?.fill_all_fields || "يرجى ملء كافة حقول الإيداع");
    return;
  }

  try {
    const res = await safeFetch('/api/wallet/deposit', {
      method: 'POST',
      body: { amount: parseFloat(amount), txHash, network }
    });

    if (res && res.ok) {
      showToast(i18n[state.currentLang]?.deposit_success || "تم تقديم طلب الإيداع بنجاح");
      closeModal('deposit-modal');
      
      if (document.getElementById('modal-deposit-amount')) document.getElementById('modal-deposit-amount').value = '';
      if (document.getElementById('modal-deposit-txhash')) document.getElementById('modal-deposit-txhash').value = '';
      if (document.getElementById('deposit-amount')) document.getElementById('deposit-amount').value = '';
      if (document.getElementById('deposit-txhash')) document.getElementById('deposit-txhash').value = '';

      loadUserData();
    } else {
      const data = await res?.json().catch(() => ({}));
      showToast(data?.error || "فشل إرسال طلب الإيداع");
    }
  } catch (err) {
    console.error("Deposit error:", err);
  }
}

export async function requestWithdrawal() {
  const modalAmt = document.getElementById('modal-withdraw-amount')?.value;
  const tabAmt = document.getElementById('withdraw-amount')?.value;
  const amountVal = modalAmt || tabAmt;

  const amount = parseFloat(amountVal);
  if (!amount || amount < 30) {
    showToast(i18n[state.currentLang]?.min_withdraw_30 || "الحد الأدنى للسحب هو 30$");
    return;
  }

  try {
    const res = await safeFetch('/api/wallet/withdraw', {
      method: 'POST',
      body: { amount }
    });

    if (res && res.ok) {
      showToast(i18n[state.currentLang]?.withdraw_success || "تم تقديم طلب السحب بنجاح");
      closeModal('withdraw-modal');

      if (document.getElementById('modal-withdraw-amount')) document.getElementById('modal-withdraw-amount').value = '';
      if (document.getElementById('withdraw-amount')) document.getElementById('withdraw-amount').value = '';

      loadUserData();
      fetchWithdrawalsHistory();
    } else {
      const data = await res?.json().catch(() => ({}));
      showToast(data?.error || "فشل تقديم طلب السحب");
    }
  } catch (err) {
    console.error("Withdraw error:", err);
  }
}

export async function fetchWithdrawalsHistory() {
  const container = document.getElementById('withdraws-list');
  if (!container) return;

  try {
    const res = await safeFetch('/api/wallet/withdrawals');
    if (res && res.ok) {
      const data = await res.json().catch(() => null);
      const list = Array.isArray(data) ? data : (data?.withdrawals || []);
      renderWithdrawalsHistory(list);
    }
  } catch (err) {
    console.error("Fetch withdrawals error:", err);
  }
}

export function renderWithdrawalsHistory(list) {
  const container = document.getElementById('withdraws-list');
  if (!container) return;

  if (!list || list.length === 0) {
    container.innerHTML = `<p style="text-align:center; color: var(--text-muted);">${i18n[state.currentLang]?.no_data || 'لا توجد طلبات سحب حلقة.'}</p>`;
    return;
  }

  container.innerHTML = list.map(item => {
    const statusColor = item.status === 'approved' ? 'var(--success)' : (item.status === 'rejected' ? 'var(--danger)' : 'var(--warning)');
    const statusText = item.status === 'approved' ? 'مكتمل' : (item.status === 'rejected' ? 'مرفوض' : 'قيد الانتظار');
    
    return `
      <div style="display:flex; justify-content:space-between; align-items:center; padding: 10px 0; border-bottom:1px solid var(--card-border);">
        <div>
          <div style="font-weight:bold; color:var(--text);">$${Number(item.amount).toFixed(2)}</div>
          <small style="color:var(--text-muted);">${new Date(item.createdAt || Date.now()).toLocaleDateString()}</small>
        </div>
        <span style="color:${statusColor}; font-weight:bold; font-size:12px;">${statusText}</span>
      </div>
    `;
  }).join('');
}
