import { t } from "../language/i18n.js";
import { showToast } from "./ui.js";

function formatUsd(value) {
  const num = Number(value || 0);
  return `$${Number.isFinite(num) ? num.toFixed(2) : "0.00"}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderWalletStats(data = {}) {
  const setText = (id, text) => {
    const elNode = document.getElementById(id);
    if (elNode) elNode.textContent = text;
  };

  setText("statBalanceUsd", formatUsd(data.walletBalance ?? data.balance ?? 0));
  setText("statAvailableEarningsUsd", formatUsd(data.availableEarnings ?? 0));
  setText("statPendingEarningsUsd", formatUsd(data.pendingEarnings ?? 0));
  setText("statTotalEarnedUsd", formatUsd(data.totalEarned ?? 0));
  setText("statTotalSpentUsd", formatUsd(data.totalSpent ?? 0));
  setText("statReferralEarningsUsd", formatUsd(data.referralEarnings ?? data.referralEarningsTotal ?? 0));
  setText("statReferralTotalEarned", formatUsd(data.referralEarnings ?? data.referralEarningsTotal ?? 0));
  setText("statReferredCount", String(data.referredCount ?? (Array.isArray(data.referrals) ? data.referrals.length : 0)));

  if (data.trc20Address) {
    const savedTrcEl = document.getElementById("savedTrc20Text");
    const trcInputEl = document.getElementById("trc20AddressInput");
    if (savedTrcEl) savedTrcEl.textContent = data.trc20Address;
    if (trcInputEl && !trcInputEl.value) trcInputEl.value = data.trc20Address;
  }
}

function renderRecentTransactions(transactions = []) {
  const container = document.getElementById("recentTransactionsList");
  if (!container) return;

  if (!Array.isArray(transactions) || transactions.length === 0) {
    container.innerHTML = `<div class="list-row"><span class="stat-label">${escapeHtml(t("no_transactions"))}</span></div>`;
    return;
  }

  container.innerHTML = transactions
    .slice(0, 10)
    .map((tx) => {
      const status = escapeHtml(tx.status || "pending");
      const type = escapeHtml(tx.type || "transaction");
      const note = tx.note ? `<div class="stat-label">${escapeHtml(tx.note)}</div>` : "";
      const date = tx.createdAt ? `<div class="stat-label">${escapeHtml(tx.createdAt)}</div>` : "";
      return `
        <div class="tx-item">
          <div>
            <strong>${type}</strong>
            ${note}
            ${date}
          </div>
          <div>
            <strong>${formatUsd(tx.amount)}</strong>
            <span class="badge badge-${status}">${status}</span>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderWithdrawalsTracker(withdrawals = []) {
  const container = document.getElementById("withdrawalTrackerContainer");
  if (!container) return;

  if (!Array.isArray(withdrawals) || withdrawals.length === 0) {
    container.innerHTML = `<div class="list-row"><span class="stat-label">${escapeHtml(t("no_withdrawals"))}</span></div>`;
    return;
  }

  container.innerHTML = withdrawals
    .map((w) => {
      const status = escapeHtml(w.status || "pending");
      const stepsHtml = Array.isArray(w.steps) && w.steps.length
        ? `<div class="steps-track">${w.steps
            .map((s) => `<span class="step-pill">${escapeHtml(s.label || s.step || s)}</span>`)
            .join(" ← ")}</div>`
        : "";
      return `
        <div class="list-row">
          <div style="width: 100%;">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
              <strong>${formatUsd(w.amount)} (${escapeHtml(t("netReceiveLabel"))} ${formatUsd(w.netAmount)})</strong>
              <span class="badge badge-${status}">${status}</span>
            </div>
            <div class="stat-label">${escapeHtml(w.destinationAddress || "")}</div>
            ${stepsHtml}
          </div>
        </div>
      `;
    })
    .join("");
}

function renderReferralsList(referrals = []) {
  const container = document.getElementById("referrals-container");
  if (!container) return;

  if (!Array.isArray(referrals) || referrals.length === 0) {
    container.innerHTML = `<div class="empty-state">${escapeHtml(t("no_referrals"))}</div>`;
    return;
  }

  container.innerHTML = referrals
    .map((ref) => {
      const friendLabel = escapeHtml(ref.username || ref.uid || ref.id || "User");
      const earnedText = formatUsd(ref.commissionEarned ?? ref.earned ?? 0);
      const dateText = ref.joinedAt || ref.createdAt ? `<div class="stat-label">${escapeHtml(ref.joinedAt || ref.createdAt)}</div>` : "";
      return `
        <div class="list-row">
          <div>
            <strong>${friendLabel}</strong>
            ${dateText}
          </div>
          <strong>${earnedText}</strong>
        </div>
      `;
    })
    .join("");
}

export async function loadWalletData(api) {
  if (!api || typeof api.getWalletAndReferral !== "function") return;
  try {
    const res = await api.getWalletAndReferral();
    const data = res?.data || res || {};
    renderWalletStats(data);
    renderRecentTransactions(data.recentTransactions || data.transactions || []);
    renderWithdrawalsTracker(data.withdrawals || []);
    renderReferralsList(data.referrals || []);
  } catch (err) {
    console.error("[Wallet Load Error]:", err);
  }
}

export function initWalletAndReferralModule(userInternalId, botUsername, api) {
  const revealBtn = document.querySelector('[data-action="reveal-referral"]');
  const linkBox = document.getElementById("referral-link-box");
  const linkInput =
    document.getElementById("ref-link-input") ||
    document.getElementById("referralLinkInput");
  const copyRefBtn =
    document.getElementById("copy-ref-btn") ||
    document.getElementById("copyReferralLinkBtn");

  const buildReferralLink = () => {
    const cleanBot = (botUsername || "TelegaAdsBot").replace("@", "");
    const refCode = btoa(String(userInternalId || "guest")).replace(/=/g, "");
    return `https://t.me/${cleanBot}?start=ref_${refCode}`;
  };

  if (linkInput && !linkInput.value) {
    linkInput.value = buildReferralLink();
  }

  revealBtn?.addEventListener("click", () => {
    if (linkInput) {
      linkInput.value = buildReferralLink();
    }
    linkBox?.classList.remove("hidden");
  });

  copyRefBtn?.addEventListener("click", async () => {
    const valueToCopy = linkInput?.value || buildReferralLink();
    if (!valueToCopy) return;
    try {
      await navigator.clipboard.writeText(valueToCopy);
      showToast(t("copied_success"));
    } catch {
      if (linkInput) {
        linkInput.select();
        document.execCommand("copy");
      }
      showToast(t("copied_success"));
    }
  });

  // نسخ عنوان الإيداع USDT - BEP20
  const copyDepositBtn = document.getElementById("copyDepositAddressBtn");
  copyDepositBtn?.addEventListener("click", async () => {
    const addrNode = document.getElementById("depositAddressText") || document.getElementById("depositAddressInput");
    const addr = (addrNode?.textContent || addrNode?.value || "").trim();
    if (!addr) return;
    try {
      await navigator.clipboard.writeText(addr);
      showToast(t("copied_success"));
    } catch {
      showToast(t("copied_success"));
    }
  });

  // معاينة صافي السحب (خصم رسوم 3.00$)
  const withdrawAmountInput = document.getElementById("withdrawAmountInput");
  const withdrawNetPreview = document.getElementById("withdrawNetPreview");
  const updateNetPreview = () => {
    const amount = Number(withdrawAmountInput?.value || 0);
    const fee = 3;
    const net = Math.max(0, Math.round((amount - fee) * 100) / 100);
    if (withdrawNetPreview) withdrawNetPreview.textContent = formatUsd(net);
  };
  withdrawAmountInput?.addEventListener("input", updateNetPreview);
  updateNetPreview();

  // حفظ عنوان محفظة TRC20
  const saveTrc20Form = document.getElementById("saveTrc20Form");
  saveTrc20Form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const trcInput = document.getElementById("trc20AddressInput");
    const address = (trcInput?.value || "").trim();
    if (!address) {
      showToast(t("msg_fill_required"));
      return;
    }
    try {
      if (api?.saveTrc20Address) {
        await api.saveTrc20Address(address);
      }
      const savedTrcEl = document.getElementById("savedTrc20Text");
      if (savedTrcEl) savedTrcEl.textContent = address;
      showToast(t("saved_success"));
      await loadWalletData(api);
    } catch (err) {
      showToast(err.message);
    }
  });

  // إرسال طلب إيداع
  const depositForm = document.getElementById("depositForm");
  depositForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const amount = Number(document.getElementById("depositAmountInput")?.value || 0);
    const txid = (document.getElementById("depositTxidInput")?.value || "").trim();
    if (amount < 10 || !txid) {
      showToast(t("msg_fill_required"));
      return;
    }
    try {
      if (api?.submitDeposit) {
        await api.submitDeposit({ amount, txid });
      }
      const txidInput = document.getElementById("depositTxidInput");
      if (txidInput) txidInput.value = "";
      showToast(t("deposit_submitted"));
      await loadWalletData(api);
    } catch (err) {
      showToast(err.message);
    }
  });

  // إرسال طلب سحب
  const withdrawForm = document.getElementById("withdrawForm");
  withdrawForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const amount = Number(document.getElementById("withdrawAmountInput")?.value || 0);
    const trc20Address = (document.getElementById("trc20AddressInput")?.value || "").trim();
    if (amount < 30 || !trc20Address) {
      showToast(t("msg_fill_required"));
      return;
    }
    try {
      if (api?.submitWithdrawal) {
        await api.submitWithdrawal({ amount, trc20Address });
      }
      showToast(t("withdraw_submitted"));
      await loadWalletData(api);
    } catch (err) {
      showToast(err.message);
    }
  });

  // زر التحديث اليدوي
  document.getElementById("refreshWalletBtn")?.addEventListener("click", () => {
    loadWalletData(api);
  });

  if (api) {
    loadWalletData(api);
  }

  return {
    loadWallet: () => loadWalletData(api)
  };
}
