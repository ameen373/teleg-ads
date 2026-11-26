import { t } from "../language/i18n.js";
import { openModal, showToast } from "./ui.js";

const DEPOSIT_ADDRESS = "0xf9278f55585a0e6e35f12299493134056f2f19b0";

function formatMoney(num) {
  return `$${(Number(num) || 0).toFixed(2)}`;
}

function formatDate(isoStr) {
  if (!isoStr) return "-";
  try {
    const d = new Date(isoStr);
    return d.toLocaleString([], {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return isoStr;
  }
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getTxIcon(type) {
  switch (type) {
    case "deposit":
      return "📥";
    case "withdrawal":
      return "📤";
    case "campaign_spend":
      return "📣";
    case "campaign_refund":
      return "♻️";
    case "publisher_earning":
      return "💎";
    case "referral_earning":
      return "🤝";
    case "earning_released":
      return "🔓";
    default:
      return "💳";
  }
}

function getStatusBadge(status) {
  const map = {
    pending_review: { label: t("status_pending_review"), cls: "status-pill warn" },
    processing: { label: t("status_processing"), cls: "status-pill info" },
    completed: { label: t("status_completed"), cls: "status-pill ok" },
    approved: { label: t("status_approved"), cls: "status-pill ok" },
    rejected: { label: t("status_rejected"), cls: "status-pill bad" },
    pending_24h: { label: t("status_hold_24h"), cls: "status-pill warn" }
  };
  const item = map[status] || { label: escapeHtml(status), cls: "status-pill" };
  return `<span class="${item.cls}">${item.label}</span>`;
}

function renderWithdrawalTracker(status) {
  const step1Done = true;
  const step2Done = ["processing", "completed"].includes(status);
  const step3Done = status === "completed";
  const isRejected = status === "rejected";

  if (isRejected) {
    return `<div class="wd-tracker rejected">✕ ${t("status_rejected")}</div>`;
  }

  return `
    <div class="wd-tracker">
      <span class="wd-step ${step1Done ? "done" : ""}">1. ${t("status_pending_review")}</span>
      <span class="wd-arrow">→</span>
      <span class="wd-step ${step2Done ? "done" : ""}">2. ${t("status_processing")}</span>
      <span class="wd-arrow">→</span>
      <span class="wd-step ${step3Done ? "done" : ""}">3. ${t("status_completed")}</span>
    </div>
  `;
}

export function initWalletAndReferralModule(apiService, userInternalId, botUsername) {
  let cachedWallet = {
    balance: 0,
    pendingBalance: 0,
    totalSpent: 0,
    totalEarned: 0,
    trc20Wallet: ""
  };

  // عناصر المحفظة الرئيسية
  const elAvailBal = document.getElementById("wallet-available-balance");
  const elPendingBal = document.getElementById("wallet-pending-balance");
  const elTotalEarned = document.getElementById("wallet-total-earned");
  const elTotalSpent = document.getElementById("wallet-total-spent");

  // لوحات الإيداع والسحب
  const depositPanel = document.getElementById("wallet-deposit-panel");
  const withdrawPanel = document.getElementById("wallet-withdraw-panel");
  const depositAddrInput = document.getElementById("deposit-bep20-address");
  const copyDepositAddrBtn = document.getElementById("copy-deposit-addr-btn");
  const depositGuideBtn = document.getElementById("btn-deposit-instructions");
  const depositAmountInput = document.getElementById("deposit-amount-input");
  const depositTxidInput = document.getElementById("deposit-txid-input");
  const submitDepositBtn = document.getElementById("submit-deposit-btn");

  const wdAddressInput = document.getElementById("withdraw-trc20-input");
  const saveWdAddressBtn = document.getElementById("save-trc20-btn");
  const wdAmountInput = document.getElementById("withdraw-amount-input");
  const wdNetPreview = document.getElementById("withdraw-net-preview");
  const submitWithdrawBtn = document.getElementById("submit-withdraw-btn");

  // القوائم (آخر 10 معاملات + سجل الإيداعات والسحوبات)
  const txListEl = document.getElementById("wallet-transactions-list");
  const dwHistoryListEl = document.getElementById("wallet-dw-history-list");
  const tabAllDwBtn = document.getElementById("dw-tab-all");
  const tabDepositsBtn = document.getElementById("dw-tab-deposits");
  const tabWithdrawalsBtn = document.getElementById("dw-tab-withdrawals");

  let activeDwFilter = "all";
  let cachedDeposits = [];
  let cachedWithdrawals = [];

  if (depositAddrInput) {
    depositAddrInput.value = DEPOSIT_ADDRESS;
  }

  // تبديل لوحتي الإيداع والسحب
  document.querySelector('[data-action="toggle-deposit"]')?.addEventListener("click", () => {
    withdrawPanel?.classList.add("hidden");
    depositPanel?.classList.toggle("hidden");
  });

  document.querySelector('[data-action="toggle-withdraw"]')?.addEventListener("click", () => {
    depositPanel?.classList.add("hidden");
    withdrawPanel?.classList.toggle("hidden");
    if (wdAddressInput && cachedWallet.trc20Wallet && !wdAddressInput.value) {
      wdAddressInput.value = cachedWallet.trc20Wallet;
    }
  });

  // نسخ عنوان الإيداع BEP20
  copyDepositAddrBtn?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(DEPOSIT_ADDRESS);
      showToast(t("wallet_addr_copied"));
    } catch {
      depositAddrInput?.select();
      document.execCommand("copy");
      showToast(t("wallet_addr_copied"));
    }
  });

  // زر تعليمات وخطوات الشحن
  depositGuideBtn?.addEventListener("click", () => {
    openModal(
      t("wallet_deposit_guide_title"),
      `
      <div style="display:flex;flex-direction:column;gap:10px;font-size:0.9rem;line-height:1.55;">
        <p><strong>1.</strong> ${t("wallet_guide_step1")}</p>
        <p><strong>2.</strong> ${t("wallet_guide_step2")}</p>
        <p><strong>3.</strong> ${t("wallet_guide_step3")}</p>
        <p style="color:#fbbf24;">⚠️ ${t("wallet_guide_warning")}</p>
      </div>
      `
    );
  });

  // إرسال طلب إيداع (الحد الأدنى $10.00)
  submitDepositBtn?.addEventListener("click", async () => {
    const amount = parseFloat(depositAmountInput?.value || "0");
    const txid = (depositTxidInput?.value || "").trim();

    if (isNaN(amount) || amount < 10) {
      showToast(t("wallet_err_min_deposit"));
      return;
    }
    if (!txid || txid.length < 16) {
      showToast(t("wallet_err_txid"));
      return;
    }

    submitDepositBtn.disabled = true;
    try {
      await apiService.submitDeposit({ amount, txid });
      depositAmountInput.value = "";
      depositTxidInput.value = "";
      depositPanel?.classList.add("hidden");
      showToast(t("wallet_deposit_submitted"));
      await loadWalletData();
    } catch (err) {
      showToast(err.message);
    } finally {
      submitDepositBtn.disabled = false;
    }
  });

  // حفظ / تعديل عنوان السحب TRC20
  saveWdAddressBtn?.addEventListener("click", async () => {
    const address = (wdAddressInput?.value || "").trim();
    if (!address) return;
    saveWdAddressBtn.disabled = true;
    try {
      const res = await apiService.saveWithdrawalAddress(address);
      cachedWallet.trc20Wallet = res.trc20Wallet;
      showToast(t("wallet_trc20_saved"));
    } catch (err) {
      showToast(err.message);
    } finally {
      saveWdAddressBtn.disabled = false;
    }
  });

  // حساب صافي السحب المباشر بعد خصم رسوم $3.00
  wdAmountInput?.addEventListener("input", () => {
    const amt = parseFloat(wdAmountInput.value || "0");
    if (!wdNetPreview) return;
    if (isNaN(amt) || amt < 30) {
      wdNetPreview.textContent = `${t("wallet_fee_note")} ($3.00)`;
    } else {
      const net = Math.max(0, amt - 3).toFixed(2);
      wdNetPreview.textContent = `${t("wallet_net_receive")}: $${net} USDT (Fee: $3.00)`;
    }
  });

  // إرسال طلب سحب (الحد الأدنى $30.00 + رسوم $3.00)
  submitWithdrawBtn?.addEventListener("click", async () => {
    const amount = parseFloat(wdAmountInput?.value || "0");
    const address = (wdAddressInput?.value || "").trim();

    if (isNaN(amount) || amount < 30) {
      showToast(t("wallet_err_min_withdraw"));
      return;
    }
    if (!address) {
      showToast(t("wallet_err_trc20"));
      return;
    }

    submitWithdrawBtn.disabled = true;
    try {
      await apiService.submitWithdrawal({ amount, address });
      wdAmountInput.value = "";
      if (wdNetPreview) wdNetPreview.textContent = `${t("wallet_fee_note")} ($3.00)`;
      withdrawPanel?.classList.add("hidden");
      showToast(t("wallet_withdraw_submitted"));
      await loadWalletData();
    } catch (err) {
      showToast(err.message);
    } finally {
      submitWithdrawBtn.disabled = false;
    }
  });

  function renderDwHistory() {
    if (!dwHistoryListEl) return;

    const merged = [
      ...cachedDeposits.map((d) => ({ ...d, kind: "deposit" })),
      ...cachedWithdrawals.map((w) => ({ ...w, kind: "withdrawal" }))
    ].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));

    const filtered = merged.filter((item) => {
      if (activeDwFilter === "deposits") return item.kind === "deposit";
      if (activeDwFilter === "withdrawals") return item.kind === "withdrawal";
      return true;
    });

    if (filtered.length === 0) {
      dwHistoryListEl.innerHTML = `<div class="glass-panel data-card"><span style="color:var(--text-muted)">${t("wallet_empty_dw")}</span></div>`;
      return;
    }

    dwHistoryListEl.innerHTML = filtered
      .map((item) => {
        if (item.kind === "deposit") {
          return `
            <div class="glass-panel dw-item-card">
              <div class="dw-top-row">
                <strong>📥 ${t("wallet_deposit_label")} • ${formatMoney(item.amount)}</strong>
                ${getStatusBadge(item.status)}
              </div>
              <div class="dw-meta-row">
                <span>${escapeHtml(item.network || "USDT - BEP20")}</span>
                <span>${formatDate(item.createdAt)}</span>
              </div>
              <div class="dw-hash-line">TXID: <code>${escapeHtml(item.txid)}</code></div>
            </div>
          `;
        }

        return `
          <div class="glass-panel dw-item-card">
            <div class="dw-top-row">
              <strong>📤 ${t("wallet_withdraw_label")} • ${formatMoney(item.amount)}</strong>
              ${getStatusBadge(item.status)}
            </div>
            <div class="dw-meta-row">
              <span>${escapeHtml(item.network || "USDT - TRC20")} | Net: ${formatMoney(item.netAmount)} (Fee: $3.00)</span>
              <span>${formatDate(item.createdAt)}</span>
            </div>
            <div class="dw-hash-line">Address: <code>${escapeHtml(item.walletAddress)}</code></div>
            ${item.txHash ? `<div class="dw-hash-line">TX: <code>${escapeHtml(item.txHash)}</code></div>` : ""}
            ${renderWithdrawalTracker(item.status)}
          </div>
        `;
      })
      .join("");
  }

  function setDwTab(tab) {
    activeDwFilter = tab;
    [tabAllDwBtn, tabDepositsBtn, tabWithdrawalsBtn].forEach((b) => b?.classList.remove("active"));
    if (tab === "all") tabAllDwBtn?.classList.add("active");
    if (tab === "deposits") tabDepositsBtn?.classList.add("active");
    if (tab === "withdrawals") tabWithdrawalsBtn?.classList.add("active");
    renderDwHistory();
  }

  tabAllDwBtn?.addEventListener("click", () => setDwTab("all"));
  tabDepositsBtn?.addEventListener("click", () => setDwTab("deposits"));
  tabWithdrawalsBtn?.addEventListener("click", () => setDwTab("withdrawals"));

  async function loadWalletData() {
    try {
      const data = await apiService.getWalletSummary();
      const w = data.wallet || {};
      cachedWallet = w;
      cachedDeposits = data.deposits || [];
      cachedWithdrawals = data.withdrawals || [];

      if (elAvailBal) elAvailBal.textContent = formatMoney(w.balance);
      if (elPendingBal) elPendingBal.textContent = formatMoney(w.pendingBalance);
      if (elTotalEarned) elTotalEarned.textContent = formatMoney(w.totalEarned);
      if (elTotalSpent) elTotalSpent.textContent = formatMoney(w.totalSpent);

      if (wdAddressInput && w.trc20Wallet) {
        wdAddressInput.value = w.trc20Wallet;
      }

      const txs = data.transactions || [];
      if (txListEl) {
        if (txs.length === 0) {
          txListEl.innerHTML = `<div class="glass-panel data-card"><span style="color:var(--text-muted)">${t("wallet_empty_tx")}</span></div>`;
        } else {
          txListEl.innerHTML = txs
            .map((tx) => {
              const sign = tx.direction === "out" ? "-" : tx.direction === "hold" ? "⏳ " : "+";
              const color =
                tx.direction === "out"
                  ? "#f87171"
                  : tx.direction === "hold"
                  ? "#fbbf24"
                  : "var(--accent-secondary)";
              return `
                <div class="glass-panel data-card">
                  <div style="display:flex;align-items:center;gap:10px;min-width:0;">
                    <span style="font-size:1.25rem;">${getTxIcon(tx.type)}</span>
                    <div style="min-width:0;">
                      <div style="font-weight:600;font-size:0.88rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(tx.title || tx.type)}</div>
                      <div style="font-size:0.74rem;color:var(--text-muted);">${formatDate(tx.createdAt)}</div>
                    </div>
                  </div>
                  <div style="text-align:end;flex-shrink:0;">
                    <div style="font-weight:700;color:${color};">${sign}${formatMoney(tx.amount)}</div>
                    ${getStatusBadge(tx.status)}
                  </div>
                </div>
              `;
            })
            .join("");
        }
      }

      renderDwHistory();
    } catch {
      // الحفاظ على العرض الحالي في حال تعذر الشبكة
    }
  }

  // =========================================================
  // قسم الإحالات (Referrals - 10% من أرباح الناشرين فقط + احتجاز 24 ساعة)
  // =========================================================
  const revealBtn = document.querySelector('[data-action="reveal-referral"]');
  const linkBox = document.getElementById("referral-link-box");
  const linkInput = document.getElementById("ref-link-input");
  const copyBtn = document.getElementById("copy-ref-btn");

  const refInvitedCountEl = document.getElementById("ref-invited-count");
  const refAvailEarningsEl = document.getElementById("ref-available-earnings");
  const refPendingEarningsEl = document.getElementById("ref-pending-earnings");
  const refHistoryListEl = document.getElementById("referral-history-list");

  revealBtn?.addEventListener("click", () => {
    const cleanBot = (botUsername || "TelegaAdsBot").replace("@", "");
    const refCode = btoa(String(userInternalId || "guest")).replace(/=/g, "");
    if (linkInput) {
      linkInput.value = `https://t.me/${cleanBot}?start=ref_${refCode}`;
    }
    linkBox?.classList.remove("hidden");
  });

  copyBtn?.addEventListener("click", async () => {
    if (!linkInput?.value) return;
    try {
      await navigator.clipboard.writeText(linkInput.value);
      showToast(t("copied_success"));
    } catch {
      linkInput.select();
      document.execCommand("copy");
      showToast(t("copied_success"));
    }
  });

  async function loadReferralData() {
    try {
      const data = await apiService.getReferralSummary();
      if (refInvitedCountEl) refInvitedCountEl.textContent = String(data.invitedCount ?? 0);
      if (refAvailEarningsEl) refAvailEarningsEl.textContent = formatMoney(data.availableReferralEarnings);
      if (refPendingEarningsEl) refPendingEarningsEl.textContent = formatMoney(data.pendingReferralEarnings);

      const history = data.history || [];
      if (refHistoryListEl) {
        if (history.length === 0) {
          refHistoryListEl.innerHTML = `<div class="glass-panel data-card"><span style="color:var(--text-muted)">${t("ref_empty_history")}</span></div>`;
        } else {
          refHistoryListEl.innerHTML = history
            .map(
              (item) => `
              <div class="glass-panel data-card">
                <div>
                  <strong style="font-size:0.88rem;">🤝 ${escapeHtml(item.title || "Publisher Commission (10%)")}</strong>
                  <div style="font-size:0.75rem;color:var(--text-muted);">${formatDate(item.createdAt)}</div>
                </div>
                <div style="text-align:end;">
                  <div style="font-weight:700;color:var(--accent-secondary);">+${formatMoney(item.amount)}</div>
                  ${getStatusBadge(item.status)}
                </div>
              </div>
            `
            )
            .join("");
        }
      }
    } catch {
      // تجاهل أخطاء الاتصال العابرة
    }
  }

  return {
    loadWalletData,
    loadReferralData
  };
}
