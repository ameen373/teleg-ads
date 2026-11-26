import { t } from "../language/i18n.js";
import { openModal, showToast } from "./ui.js";

const DEPOSIT_ADDRESS = "0xf9278f55585a0e6e35f12299493134056f2f19b0";

function formatUsd(val) {
  return `$${Number(val || 0).toFixed(2)}`;
}

function getTxIcon(type) {
  const icons = {
    deposit: "📥",
    withdraw: "📤",
    campaign_spend: "📢",
    campaign_refund: "♻️",
    publisher_earning: "💰",
    referral_earning: "🤝"
  };
  return icons[type] || "💱";
}

function formatRemainingTime(releaseAtIso) {
  const diffMs = new Date(releaseAtIso).getTime() - Date.now();
  if (diffMs <= 0) return t("status_releasing_now");
  const hrs = Math.floor(diffMs / (1000 * 60 * 60));
  const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  return `${hrs}h ${mins}m`;
}

function renderWithdrawStepper(status) {
  const isRejected = status === "rejected";
  if (isRejected) {
    return `<div class="stepper-rejected">✕ ${t("status_rejected_refunded")}</div>`;
  }

  const step1Done = ["submitted", "processing", "completed"].includes(status);
  const step2Done = ["processing", "completed"].includes(status);
  const step3Done = status === "completed";

  return `
    <div class="withdraw-stepper">
      <div class="w-step ${step1Done ? "done" : ""}">
        <span class="w-dot">1</span>
        <small>${t("step_submitted")}</small>
      </div>
      <div class="w-line ${step2Done ? "done" : ""}"></div>
      <div class="w-step ${step2Done ? "done" : ""}">
        <span class="w-dot">2</span>
        <small>${t("step_processing")}</small>
      </div>
      <div class="w-line ${step3Done ? "done" : ""}"></div>
      <div class="w-step ${step3Done ? "done" : ""}">
        <span class="w-dot">3</span>
        <small>${t("step_completed")}</small>
      </div>
    </div>
  `;
}

export function initWalletAndReferralModule(apiService, userInternalId, botUsername) {
  const btnOpenDeposit = document.getElementById("btn-open-deposit");
  const btnOpenWithdraw = document.getElementById("btn-open-withdraw");
  const panelDeposit = document.getElementById("panel-deposit");
  const panelWithdraw = document.getElementById("panel-withdraw");
  const btnRefresh = document.getElementById("btn-refresh-wallet");

  // تبديل لوحات الإيداع والسحب
  btnOpenDeposit?.addEventListener("click", () => {
    panelWithdraw?.classList.add("hidden");
    panelDeposit?.classList.toggle("hidden");
  });

  btnOpenWithdraw?.addEventListener("click", () => {
    panelDeposit?.classList.add("hidden");
    panelWithdraw?.classList.toggle("hidden");
  });

  btnRefresh?.addEventListener("click", () => loadWalletData(true));

  // نسخ عنوان الإيداع BEP20
  document.getElementById("btn-copy-deposit-addr")?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(DEPOSIT_ADDRESS);
      showToast(t("address_copied"));
    } catch {
      const inp = document.getElementById("deposit-address-input");
      inp?.select();
      document.execCommand("copy");
      showToast(t("address_copied"));
    }
  });

  // نافذة تعليمات وخطوات الشحن
  document.getElementById("btn-deposit-guide")?.addEventListener("click", () => {
    const html = `
      <div class="guide-steps-box">
        <p><strong>1.</strong> ${t("guide_step_1")}</p>
        <p><strong>2.</strong> ${t("guide_step_2")}</p>
        <p><strong>3.</strong> ${t("guide_step_3")}</p>
        <p><strong>4.</strong> ${t("guide_step_4")}</p>
      </div>
    `;
    openModal(t("deposit_guide_title"), html);
  });

  // إرسال طلب الإيداع TXID
  document.getElementById("btn-submit-deposit")?.addEventListener("click", async () => {
    const amount = parseFloat(document.getElementById("deposit-amount-input")?.value);
    const txid = document.getElementById("deposit-txid-input")?.value.trim();

    if (isNaN(amount) || amount < 10) {
      showToast(t("err_min_deposit"));
      return;
    }
    if (!txid || txid.length < 16) {
      showToast(t("err_invalid_txid"));
      return;
    }

    const btn = document.getElementById("btn-submit-deposit");
    btn.disabled = true;
    try {
      await apiService.submitDeposit(amount, txid);
      document.getElementById("deposit-amount-input").value = "";
      document.getElementById("deposit-txid-input").value = "";
      panelDeposit?.classList.add("hidden");
      showToast(t("deposit_submitted_ok"));
      await loadWalletData();
    } catch (err) {
      showToast(err.message === "DUPLICATE_TXID" ? t("err_duplicate_txid") : err.message);
    } finally {
      btn.disabled = false;
    }
  });

  // حفظ عنوان محفظة USDT - TRC20
  document.getElementById("btn-save-trc20")?.addEventListener("click", async () => {
    const address = document.getElementById("withdraw-address-input")?.value.trim();
    if (!address) return;
    try {
      await apiService.saveWithdrawAddress(address);
      showToast(t("address_saved_ok"));
    } catch {
      showToast(t("err_invalid_trc20"));
    }
  });

  // حساب صافي السحب الفوري بعد خصم $3.00
  const witAmountInput = document.getElementById("withdraw-amount-input");
  const netPreviewEl = document.getElementById("withdraw-net-preview");
  witAmountInput?.addEventListener("input", () => {
    const val = parseFloat(witAmountInput.value);
    const net = !isNaN(val) && val > 3 ? val - 3 : 0;
    if (netPreviewEl) netPreviewEl.textContent = `${formatUsd(net)} USDT`;
  });

  // إرسال طلب السحب
  document.getElementById("btn-submit-withdraw")?.addEventListener("click", async () => {
    const amount = parseFloat(witAmountInput?.value);
    const address = document.getElementById("withdraw-address-input")?.value.trim();

    if (isNaN(amount) || amount < 30) {
      showToast(t("err_min_withdraw"));
      return;
    }
    if (!address) {
      showToast(t("err_invalid_trc20"));
      return;
    }

    const btn = document.getElementById("btn-submit-withdraw");
    btn.disabled = true;
    try {
      await apiService.submitWithdraw(amount, address);
      witAmountInput.value = "";
      if (netPreviewEl) netPreviewEl.textContent = "$0.00 USDT";
      panelWithdraw?.classList.add("hidden");
      showToast(t("withdraw_submitted_ok"));
      await loadWalletData();
    } catch (err) {
      if (err.message === "INSUFFICIENT_BALANCE") showToast(t("err_insufficient_balance"));
      else if (err.message === "INVALID_TRC20_ADDRESS") showToast(t("err_invalid_trc20"));
      else showToast(err.message);
    } finally {
      btn.disabled = false;
    }
  });

  // تبويبات السجلات داخل المحفظة
  document.querySelectorAll(".w-tab-btn").forEach((tabBtn) => {
    tabBtn.addEventListener("click", () => {
      document.querySelectorAll(".w-tab-btn").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".w-tab-content").forEach((c) => c.classList.add("hidden"));
      tabBtn.classList.add("active");
      const target = tabBtn.getAttribute("data-wtab");
      document.getElementById(target)?.classList.remove("hidden");
    });
  });

  // قسم الإحالة (إنشاء ونسخ الرابط)
  const revealBtn = document.querySelector('[data-action="reveal-referral"]');
  const linkBox = document.getElementById("referral-link-box");
  const linkInput = document.getElementById("ref-link-input");
  const copyBtn = document.getElementById("copy-ref-btn");

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

  // تحميل بيانات المحفظة والإحالة الحية من الخادم
  async function loadWalletData(notify = false) {
    try {
      const data = await apiService.getWalletOverview();
      const { balances, walletConfig, referral, transactions, deposits, withdrawals, pendingReleases } = data;

      // تحديث الأرصدة اللحظية
      const totalEarned = Number(balances.totalPublisherEarned || 0) + Number(balances.totalReferralEarned || 0);
      document.getElementById("wallet-available-val").textContent = formatUsd(balances.available);
      document.getElementById("wallet-pending-val").textContent = formatUsd(balances.pending);
      document.getElementById("wallet-earned-val").textContent = formatUsd(totalEarned);
      document.getElementById("wallet-spent-val").textContent = formatUsd(balances.totalSpent);

      const savedAddrInput = document.getElementById("withdraw-address-input");
      if (savedAddrInput && walletConfig.savedTrc20Address && !savedAddrInput.value) {
        savedAddrInput.value = walletConfig.savedTrc20Address;
      }

      // تحديث إحصائيات الإحالة
      const refCountEl = document.getElementById("ref-count-val");
      const refEarnedEl = document.getElementById("ref-earned-val");
      if (refCountEl) refCountEl.textContent = String(referral.referralsCount || 0);
      if (refEarnedEl) refEarnedEl.textContent = formatUsd(referral.totalReferralEarned);

      // عرض آخر 10 معاملات بأيقونات توضيحية
      const txContainer = document.getElementById("tab-transactions");
      if (txContainer) {
        if (!transactions || transactions.length === 0) {
          txContainer.innerHTML = `<div class="glass-panel data-card"><span style="color:var(--text-muted)">${t("empty_transactions")}</span></div>`;
        } else {
          txContainer.innerHTML = transactions
            .map((tx) => {
              const isIn = tx.direction === "in";
              const sign = isIn ? "+" : "-";
              const color = tx.status === "rejected" ? "#94a3b8" : isIn ? "var(--accent-secondary)" : "#f87171";
              return `
                <div class="glass-panel data-card">
                  <div style="display:flex;align-items:center;gap:12px;">
                    <span style="font-size:1.4rem;">${getTxIcon(tx.type)}</span>
                    <div>
                      <strong style="font-size:0.9rem;">${t(tx.titleKey)}</strong>
                      <div style="font-size:0.74rem;color:var(--text-muted)">${new Date(tx.createdAt).toLocaleString()}</div>
                    </div>
                  </div>
                  <div style="text-align:end;">
                    <strong style="color:${color};">${sign}${formatUsd(tx.amount)}</strong>
                    <div style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;">${tx.status}</div>
                  </div>
                </div>
              `;
            })
            .join("");
        }
      }

      // عرض سجل الإيداعات والسحوبات مع تتبع دورة السحب خطوة بخطوة
      const histContainer = document.getElementById("tab-history");
      if (histContainer) {
        const witCards = (withdrawals || []).map(
          (w) => `
          <div class="glass-panel" style="padding:14px;border-radius:14px;">
            <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
              <strong>📤 ${t("withdraw_record_title")} (${formatUsd(w.amount)})</strong>
              <span style="font-size:0.78rem;color:var(--accent-primary);">Net: ${formatUsd(w.netAmount)}</span>
            </div>
            <div style="font-size:0.74rem;color:var(--text-muted);margin-bottom:8px;">
              TRC20: ${w.walletAddress.slice(0, 8)}...${w.walletAddress.slice(-6)}
            </div>
            ${renderWithdrawStepper(w.status)}
          </div>
        `
        );

        const depCards = (deposits || []).map(
          (d) => `
          <div class="glass-panel data-card">
            <div>
              <strong>📥 ${t("deposit_record_title")} (${formatUsd(d.amount)})</strong>
              <div style="font-size:0.74rem;color:var(--text-muted)">TXID: ${d.txid.slice(0, 12)}...</div>
            </div>
            <span style="font-size:0.8rem;font-weight:700;color:${
              d.status === "approved" ? "var(--accent-secondary)" : d.status === "rejected" ? "var(--danger)" : "#fbbf24"
            };">${d.status.toUpperCase()}</span>
          </div>
        `
        );

        const combined = [...witCards, ...depCards];
        histContainer.innerHTML =
          combined.length > 0
            ? combined.join("")
            : `<div class="glass-panel data-card"><span style="color:var(--text-muted)">${t("empty_dep_wit")}</span></div>`;
      }

      // عرض طابور تحرير الأرباح (24 ساعة) في قسم الإحالة
      const holdsContainer = document.getElementById("pending-releases-list");
      if (holdsContainer) {
        if (!pendingReleases || pendingReleases.length === 0) {
          holdsContainer.innerHTML = `<div class="glass-panel data-card"><span style="color:var(--text-muted)">${t("empty_pending_releases")}</span></div>`;
        } else {
          holdsContainer.innerHTML = pendingReleases
            .map(
              (h) => `
              <div class="glass-panel data-card">
                <div>
                  <strong>${h.kind === "referral_earning" ? "🤝 " + t("hold_referral_label") : "💰 " + t("hold_publisher_label")}</strong>
                  <div style="font-size:0.76rem;color:var(--text-muted)">⏳ ${formatRemainingTime(h.releaseAt)}</div>
                </div>
                <strong style="color:#fbbf24;">+${formatUsd(h.amount)}</strong>
              </div>
            `
            )
            .join("");
        }
      }

      if (notify) showToast("✓");
    } catch (err) {
      console.error("Wallet sync error:", err);
    }
  }

  return { loadWalletData };
}
