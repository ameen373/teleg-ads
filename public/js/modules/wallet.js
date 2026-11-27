import { t } from "../language/i18n.js";
import { showToast } from "./ui.js";

const STEP_ORDER = [
  { key: "submitted", label: "استلام الطلب" },
  { key: "under_review", label: "المراجعة الأمنية" },
  { key: "trc20_broadcast", label: "الإرسال TRC20" },
  { key: "completed", label: "مكتمل" }
];

const POSITIVE_TX_TYPES = new Set([
  "deposit",
  "earning",
  "referral_commission",
  "campaign_refund"
]);

async function safeImport(path) {
  try {
    return await import(path);
  } catch {
    return {};
  }
}

let optionalApi = {};
let optionalUi = {};

const helpersReady = Promise.all([
  safeImport("./api.js").then((mod) => {
    optionalApi = mod || {};
  }),
  safeImport("./ui.js").then((mod) => {
    optionalUi = mod || {};
  })
]);

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeTranslate(key, fallback = "") {
  try {
    if (typeof t === "function") {
      const result = t(key);
      if (typeof result === "string" && result.trim() !== "") {
        return result;
      }
    }
  } catch {
    // تجاهل خطأ الترجمة واستخدام القيمة الاحتياطية
  }
  return fallback;
}

function defaultFormatUsd(amount) {
  const num = Number(amount ?? 0);
  return `$${Number.isFinite(num) ? num.toFixed(2) : "0.00"}`;
}

function formatMoney(amount) {
  if (typeof optionalUi.formatUsd === "function") {
    return optionalUi.formatUsd(amount);
  }
  return defaultFormatUsd(amount);
}

function formatTimestamp(dateVal) {
  if (typeof optionalUi.formatDate === "function" && dateVal) {
    return optionalUi.formatDate(dateVal);
  }
  if (!dateVal) return "";
  try {
    return new Date(dateVal).toLocaleString();
  } catch {
    return String(dateVal);
  }
}

function getTxIcon(type) {
  if (typeof optionalUi.getTransactionIcon === "function") {
    return optionalUi.getTransactionIcon(type);
  }
  if (type === "deposit") return "⬇️";
  if (type === "withdrawal") return "⬆️";
  if (type === "earning" || type === "referral_commission") return "💰";
  if (type === "campaign_refund") return "↩️";
  return "•";
}

function getTxLabel(type) {
  if (typeof optionalUi.getTransactionTypeLabel === "function") {
    return optionalUi.getTransactionTypeLabel(type);
  }
  return String(type || "Transaction");
}

function encodeRefCode(rawId) {
  const str = String(rawId || "guest");
  try {
    if (typeof btoa === "function") {
      return btoa(str).replace(/=/g, "");
    }
  } catch {
    // إذا احتوى المعرّف على محارف خارج Latin1 نستخدم ترميز URI
  }
  return encodeURIComponent(str);
}

async function copyTextSafe(text) {
  if (!text) return;
  if (typeof optionalUi.copyToClipboard === "function") {
    await optionalUi.copyToClipboard(text);
    return;
  }
  if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    await navigator.clipboard.writeText(text);
    return;
  }
  const temp = document.createElement("textarea");
  temp.value = text;
  temp.setAttribute("readonly", "");
  temp.style.position = "absolute";
  temp.style.left = "-9999px";
  document.body.appendChild(temp);
  temp.select();
  document.execCommand("copy");
  document.body.removeChild(temp);
}

function notify(message, type = "info") {
  if (!message) return;
  if (typeof optionalUi.showAlert === "function") {
    optionalUi.showAlert(message, type);
    return;
  }
  if (typeof showToast === "function") {
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
      el.textContent = formatMoney(amount ?? 0);
    }
  });

  const trcInput = document.getElementById("trc20AddressInput");
  if (trcInput && document.activeElement !== trcInput && wallet.trc20WalletAddress) {
    trcInput.value = wallet.trc20WalletAddress;
  }
}

function renderRecentTransactions(transactions) {
  const container = document.getElementById("recentTransactionsList");
  if (!container) return;

  const noDataLabel = escapeHtml(safeTranslate("noData", "لا توجد بيانات"));

  if (!Array.isArray(transactions) || transactions.length === 0) {
    container.innerHTML = `<p class="muted-note">${noDataLabel}</p>`;
    return;
  }

  container.innerHTML = transactions
    .slice(0, 10)
    .map((tx) => {
      const icon = escapeHtml(getTxIcon(tx?.type));
      const label = escapeHtml(getTxLabel(tx?.type));
      const sign = POSITIVE_TX_TYPES.has(tx?.type) ? "+" : "-";
      const status = escapeHtml(tx?.status || "");
      const notesPart = tx?.notes ? `${escapeHtml(tx.notes)} • ` : "";
      const dateStr = escapeHtml(formatTimestamp(tx?.createdAt));
      const amountStr = escapeHtml(formatMoney(tx?.amountUsd ?? 0));

      return `
        <div class="tx-item">
          <div class="tx-left">
            <div class="tx-icon" aria-hidden="true">${icon}</div>
            <div>
              <div class="tx-title">${label}</div>
              <div class="tx-sub">${notesPart}${dateStr}</div>
            </div>
          </div>
          <div class="tx-right">
            <div><strong>${sign}${amountStr}</strong></div>
            <span class="badge ${status}">${status}</span>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderWithdrawalTracker(withdrawals) {
  const container = document.getElementById("withdrawalTrackerContainer");
  if (!container) return;

  const noDataLabel = escapeHtml(safeTranslate("noData", "لا توجد بيانات"));

  if (!Array.isArray(withdrawals) || withdrawals.length === 0) {
    container.innerHTML = `<p class="muted-note">${noDataLabel}</p>`;
    return;
  }

  const netLabel = escapeHtml(safeTranslate("netReceiveLabel", "الصافي:"));

  container.innerHTML = withdrawals
    .slice(0, 5)
    .map((wd) => {
      const currentIdx = STEP_ORDER.findIndex((s) => s.key === wd?.step);
      const stepsHtml = STEP_ORDER.map((stepObj, idx) => {
        let cls = "step-pill";
        if (wd?.status === "completed" || (currentIdx !== -1 && idx < currentIdx)) {
          cls += " done";
        } else if (idx === currentIdx) {
          cls += " current";
        }
        return `<div class="${cls}">${escapeHtml(stepObj.label)}</div>`;
      }).join("");

      const status = escapeHtml(wd?.status || "");
      const amountStr = escapeHtml(formatMoney(wd?.amountUsd ?? 0));
      const netAmountStr = escapeHtml(formatMoney(wd?.netAmountUsd ?? 0));
      const addressStr = escapeHtml(wd?.trc20Address || "");
      const dateStr = escapeHtml(formatTimestamp(wd?.createdAt));

      return `
        <div class="tracker-item">
          <div class="card-header-row">
            <strong>${amountStr} (${netLabel} ${netAmountStr})</strong>
            <span class="badge ${status}">${status}</span>
          </div>
          <div class="tx-sub">TRC20: ${addressStr} • ${dateStr}</div>
          <div class="tracker-steps">${stepsHtml}</div>
        </div>
      `;
    })
    .join("");
}

function renderHistoryTables(deposits, withdrawals) {
  const depBody = document.getElementById("depositsHistoryBody");
  const wdBody = document.getElementById("withdrawalsHistoryBody");
  const noDataLabel = escapeHtml(safeTranslate("noData", "لا توجد بيانات"));

  if (depBody) {
    if (!Array.isArray(deposits) || deposits.length === 0) {
      depBody.innerHTML = `<tr><td colspan="4">${noDataLabel}</td></tr>`;
    } else {
      depBody.innerHTML = deposits
        .map((d) => {
          const amountStr = escapeHtml(formatMoney(d?.amountUsd ?? 0));
          const txidStr = escapeHtml(d?.txid || "");
          const statusStr = escapeHtml(d?.status || "");
          const dateStr = escapeHtml(formatTimestamp(d?.createdAt));
          return `
          <tr>
            <td>${amountStr}</td>
            <td><code>${txidStr}</code></td>
            <td><span class="badge ${statusStr}">${statusStr}</span></td>
            <td>${dateStr}</td>
          </tr>
        `;
        })
        .join("");
    }
  }

  if (wdBody) {
    if (!Array.isArray(withdrawals) || withdrawals.length === 0) {
      wdBody.innerHTML = `<tr><td colspan="4">${noDataLabel}</td></tr>`;
    } else {
      wdBody.innerHTML = withdrawals
        .map((w) => {
          const amountStr = escapeHtml(formatMoney(w?.amountUsd ?? 0));
          const netAmountStr = escapeHtml(formatMoney(w?.netAmountUsd ?? 0));
          const addressStr = escapeHtml(w?.trc20Address || "");
          const statusStr = escapeHtml(w?.status || "");
          return `
          <tr>
            <td>${amountStr}</td>
            <td>${netAmountStr}</td>
            <td><code>${addressStr}</code></td>
            <td><span class="badge ${statusStr}">${statusStr}</span></td>
          </tr>
        `;
        })
        .join("");
    }
  }
}

export async function refreshWallet(userId, referredBy = "") {
  if (!userId) return null;

  await helpersReady;
  if (typeof optionalApi.fetchWalletOverview !== "function") {
    return null;
  }

  const data = await optionalApi.fetchWalletOverview(userId, referredBy);
  if (!data) return null;

  if (data.rules && data.rules.depositAddress) {
    const depAddrInput = document.getElementById("depositAddressInput");
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
  const linkBox = document.getElementById("referral-link-box");
  const linkInput = document.getElementById("ref-link-input");
  const copyRefBtn = document.getElementById("copy-ref-btn");

  if (revealBtn && !revealBtn.dataset.bound) {
    revealBtn.dataset.bound = "true";
    revealBtn.addEventListener("click", () => {
      const uid = typeof getUserId === "function" ? getUserId() : getUserId;
      const botName = typeof getBotUsername === "function" ? getBotUsername() : getBotUsername;
      const cleanBot = String(botName || "TelegaAdsBot").replace(/^@/, "");
      const refCode = encodeRefCode(uid);

      if (linkInput) {
        linkInput.value = `https://t.me/${cleanBot}?start=ref_${refCode}`;
      }
      linkBox?.classList.remove("hidden");
    });
  }

  if (copyRefBtn && !copyRefBtn.dataset.bound) {
    copyRefBtn.dataset.bound = "true";
    copyRefBtn.addEventListener("click", async () => {
      if (!linkInput?.value) return;
      const copiedMsg = safeTranslate("copied_success") || safeTranslate("copied", "Copied");
      try {
        await copyTextSafe(linkInput.value);
        notify(copiedMsg, "success");
      } catch {
        try {
          linkInput.select();
          document.execCommand("copy");
        } catch {
          // تجاهل فشل النسخ الاحتياطي
        }
        notify(copiedMsg, "success");
      }
    });
  }
}

export function bindWalletEvents(getUserId, onRefresh, getBotUsername = "") {
  const resolveUserId = () => (typeof getUserId === "function" ? getUserId() : getUserId);
  const triggerRefresh = async () => {
    if (typeof onRefresh === "function") {
      await onRefresh();
    }
  };

  bindReferralEvents(resolveUserId, getBotUsername);

  const copyBtn = document.getElementById("copyDepositAddressBtn");
  if (copyBtn && !copyBtn.dataset.bound) {
    copyBtn.dataset.bound = "true";
    copyBtn.addEventListener("click", async () => {
      try {
        const addr = document.getElementById("depositAddressInput")?.value || "";
        await copyTextSafe(addr);
        notify(safeTranslate("copied", "Copied"), "success");
      } catch (err) {
        notify(err?.message || "تعذر نسخ العنوان", "error");
      }
    });
  }

  const modal = document.getElementById("depositInstructionsModal");
  const openBtn = document.getElementById("openDepositInstructionsBtn");
  const closeBtn = document.getElementById("closeDepositInstructionsBtn");

  if (openBtn && modal && !openBtn.dataset.bound) {
    openBtn.dataset.bound = "true";
    openBtn.addEventListener("click", () => modal.classList.remove("hidden"));
  }

  if (closeBtn && modal && !closeBtn.dataset.bound) {
    closeBtn.dataset.bound = "true";
    closeBtn.addEventListener("click", () => modal.classList.add("hidden"));
  }

  const withdrawAmountInput = document.getElementById("withdrawAmountInput");
  const netPreview = document.getElementById("withdrawNetPreview");
  if (withdrawAmountInput && netPreview && !withdrawAmountInput.dataset.bound) {
    withdrawAmountInput.dataset.bound = "true";
    withdrawAmountInput.addEventListener("input", () => {
      const val = Number(withdrawAmountInput.value);
      const net = Number.isFinite(val) && val > 3 ? val - 3 : 0;
      netPreview.textContent = formatMoney(net);
    });
  }

  const saveTrc20Form = document.getElementById("saveTrc20Form");
  if (saveTrc20Form && !saveTrc20Form.dataset.bound) {
    saveTrc20Form.dataset.bound = "true";
    saveTrc20Form.addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        await helpersReady;
        if (typeof optionalApi.updateTrc20Address !== "function") {
          throw new Error("خدمة تحديث عنوان المحفظة غير متوفرة");
        }
        const uid = resolveUserId();
        const address = document.getElementById("trc20AddressInput")?.value.trim() || "";
        await optionalApi.updateTrc20Address(uid, address);
        notify("تم حفظ عنوان محفظة USDT - TRC20 بنجاح", "success");
        await triggerRefresh();
      } catch (err) {
        notify(err?.message || "تعذر حفظ العنوان", "error");
      }
    });
  }

  const depositForm = document.getElementById("depositForm");
  if (depositForm && !depositForm.dataset.bound) {
    depositForm.dataset.bound = "true";
    depositForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        await helpersReady;
        if (typeof optionalApi.createDepositRequest !== "function") {
          throw new Error("خدمة طلب الإيداع غير متوفرة");
        }
        const uid = resolveUserId();
        const amountUsd = Number(document.getElementById("depositAmountInput")?.value);
        const txid = document.getElementById("depositTxidInput")?.value.trim() || "";
        await optionalApi.createDepositRequest(uid, amountUsd, txid);
        depositForm.reset();
        notify("تم إرسال طلب الإيداع للمراجعة الإدارية بنجاح", "success");
        await triggerRefresh();
      } catch (err) {
        notify(err?.message || "تعذر إرسال طلب الإيداع", "error");
      }
    });
  }

  const withdrawForm = document.getElementById("withdrawForm");
  if (withdrawForm && !withdrawForm.dataset.bound) {
    withdrawForm.dataset.bound = "true";
    withdrawForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        await helpersReady;
        if (typeof optionalApi.createWithdrawalRequest !== "function") {
          throw new Error("خدمة طلب السحب غير متوفرة");
        }
        const uid = resolveUserId();
        const amountUsd = Number(document.getElementById("withdrawAmountInput")?.value);
        const trc20Address = document.getElementById("trc20AddressInput")?.value.trim() || "";
        await optionalApi.createWithdrawalRequest(uid, amountUsd, trc20Address);
        withdrawForm.reset();
        if (netPreview) netPreview.textContent = "$0.00";
        notify("تم تسجيل طلب السحب عبر USDT - TRC20 بنجاح", "success");
        await triggerRefresh();
      } catch (err) {
        notify(err?.message || "تعذر تسجيل طلب السحب", "error");
      }
    });
  }
}

export async function initWalletAndReferralModule(userInternalId, botUsername, referredBy = "") {
  const getUid = () => userInternalId;
  const doRefresh = () => refreshWallet(userInternalId, referredBy);

  bindWalletEvents(getUid, doRefresh, botUsername);

  if (!userInternalId) {
    return null;
  }

  try {
    return await doRefresh();
  } catch {
    return null;
  }
}
