import { api, ApiService } from "./api.js";
import {
  showToast,
  openModal,
  formatCurrency,
  formatDate,
  escapeHtml,
  getTransactionIcon,
  calculateWithdrawalNet,
  renderWalletSection,
  WALLET_UI_CONSTANTS
} from "./ui.js";
import { t } from "../language/i18n.js";

let currentState = null;
let boundEvents = false;
let activeUserId = null;
let activeBotUsername = "TelegaAdsBot";
let activeRefreshCallback = null;

async function copyTextSafe(text) {
  if (!text) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const tempInput = document.createElement("textarea");
      tempInput.value = text;
      tempInput.setAttribute("readonly", "");
      tempInput.style.position = "absolute";
      tempInput.style.left = "-9999px";
      document.body.appendChild(tempInput);
      tempInput.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(tempInput);
      return Boolean(ok);
    } catch {
      return false;
    }
  }
}

function translateStatus(status) {
  const map = {
    pending: "قيد المراجعة",
    approved: "معتمد",
    rejected: "مرفوض",
    requested: "تم الطلب",
    reviewing: "قيد المراجعة",
    processing: "جاري التحويل",
    completed: "مكتمل"
  };
  return map[status] || status;
}

function resolveUserId(explicitUserId) {
  if (explicitUserId) return String(explicitUserId);
  if (activeUserId) return String(activeUserId);
  if (currentState?.wallet?.userId) return String(currentState.wallet.userId);
  try {
    const tgId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
    if (tgId) return String(tgId);
  } catch {
    // تجاهل في حال الفتح خارج تيليجرام
  }
  return "";
}

async function refreshWalletState(userId, refCode = "") {
  try {
    const targetId = resolveUserId(userId);
    const data = await api.getWalletData(targetId, refCode);
    currentState = data;
    if (data?.wallet?.userId) {
      activeUserId = String(data.wallet.userId);
    }
    renderWalletUI(data);
    renderReferralUI(data);
    return data;
  } catch (error) {
    showToast(error?.message || "تعذر تحديث بيانات المحفظة", "error");
    return null;
  }
}

export async function loadWalletAndReferrals(userId = "", refCode = "") {
  try {
    const targetId = resolveUserId(userId);
    if (targetId) activeUserId = targetId;
    const data = await api.getWalletData(targetId, refCode);
    currentState = data;
    if (data?.wallet?.userId) {
      activeUserId = String(data.wallet.userId);
    }
    renderWalletUI(data);
    renderReferralUI(data);
    return data;
  } catch (error) {
    showToast(error?.message || "تعذر تحميل بيانات المحفظة", "error");
    throw error;
  }
}

export function getWalletState() {
  return currentState;
}

export function renderWalletUI(data = {}) {
  try {
    const wallet = data.wallet || {};
    const constants = {
      ...WALLET_UI_CONSTANTS,
      ...(data.constants || {})
    };
    const transactions = Array.isArray(data.transactions) ? data.transactions : [];
    const deposits = Array.isArray(data.deposits) ? data.deposits : [];
    const withdrawals = Array.isArray(data.withdrawals) ? data.withdrawals : [];
    const pendingReleases = Array.isArray(data.pendingReleases) ? data.pendingReleases : [];

    const availableEl = document.getElementById("stat-available");
    if (availableEl) {
      availableEl.textContent = formatCurrency(
        typeof wallet.availableBalance === "number" ? wallet.availableBalance : wallet.balance || 0
      );
    }

    const pendingEl = document.getElementById("stat-pending");
    if (pendingEl) {
      pendingEl.textContent = formatCurrency(wallet.pendingEarnings || 0);
    }

    const spentEl = document.getElementById("stat-spent");
    if (spentEl) {
      spentEl.textContent = formatCurrency(wallet.totalSpent || 0);
    }

    const earnedEl = document.getElementById("stat-earned");
    if (earnedEl) {
      earnedEl.textContent = formatCurrency(wallet.totalEarned || 0);
    }

    const depAddrEl = document.getElementById("bep20-deposit-address");
    if (depAddrEl) {
      depAddrEl.value = constants.DEPOSIT_ADDRESS;
    }

    const trc20Input = document.getElementById("trc20-wallet-input");
    if (trc20Input && document.activeElement !== trc20Input) {
      trc20Input.value = wallet.trc20Address || "";
    }

    const pendingListEl = document.getElementById("pending-24h-list");
    if (pendingListEl) {
      if (pendingReleases.length === 0) {
        pendingListEl.innerHTML =
          '<div class="empty-state">لا توجد أرباح معلقة حالياً. جميع الأرباح المستحقة محررة.</div>';
      } else {
        pendingListEl.innerHTML = pendingReleases
          .map(
            (item) => `
          <div class="pending-item">
            <div>
              <strong>${
                item.type === "referral_commission"
                  ? "🤝 عمولة إحالة (10%)"
                  : "💵 أرباح ناشر"
              }</strong>
              <div class="sub-text">موعد التحرير التلقائي: ${escapeHtml(formatDate(item.releaseAt))}</div>
            </div>
            <span class="badge badge-warning">+${escapeHtml(formatCurrency(item.amount))}</span>
          </div>
        `
          )
          .join("");
      }
    }

    const trackerContainer = document.getElementById("withdrawal-cycle-tracker");
    if (trackerContainer) {
      if (withdrawals.length === 0) {
        trackerContainer.innerHTML =
          '<div class="empty-state">لا توجد طلبات سحب نشطة لتتبعها.</div>';
      } else {
        trackerContainer.innerHTML = withdrawals
          .slice(0, 3)
          .map((w) => {
            const isRejected = w.status === "rejected";
            const step = Number(w.stepIndex || 1);
            const grossAmt = w.amount ?? w.requestedAmount ?? 0;
            const addr = w.walletAddress || w.trc20Address || "";
            return `
          <div class="tracker-card">
            <div class="tracker-header">
              <span><strong>طلب سحب ${escapeHtml(formatCurrency(grossAmt))}</strong> (صافي: ${escapeHtml(formatCurrency(w.netAmount))} | رسوم: ${escapeHtml(formatCurrency(w.fee))})</span>
              <span class="sub-text">${escapeHtml(formatDate(w.createdAt))}</span>
            </div>
            <div class="sub-text">العنوان (${escapeHtml(w.network || constants.WITHDRAWAL_NETWORK)}): <code>${escapeHtml(addr)}</code></div>
            ${
              isRejected
                ? `<div class="tracker-rejected">❌ ${escapeHtml(t("step_rejected"))} ${w.adminNote ? `- (${escapeHtml(w.adminNote)})` : ""}</div>`
                : `
              <div class="steps-bar">
                <div class="step ${step >= 1 ? "active" : ""}">${escapeHtml(t("step_1"))}</div>
                <div class="step ${step >= 2 ? "active" : ""}">${escapeHtml(t("step_2"))}</div>
                <div class="step ${step >= 3 ? "active" : ""}">${escapeHtml(t("step_3"))}</div>
                <div class="step ${step >= 4 ? "active completed" : ""}">${escapeHtml(t("step_4"))}</div>
              </div>
              ${w.txHash ? `<div class="sub-text">TXID التحويل: <code>${escapeHtml(w.txHash)}</code></div>` : ""}
            `
            }
          </div>
        `;
          })
          .join("");
      }
    }

    const txListEl = document.getElementById("recent-transactions-list");
    if (txListEl) {
      if (transactions.length === 0) {
        txListEl.innerHTML =
          '<div class="empty-state">لا توجد معاملات مالية مسجلة حتى الآن.</div>';
      } else {
        txListEl.innerHTML = transactions
          .map((tx) => {
            const numericAmount = Number(tx.amount || 0);
            const isPositive = numericAmount > 0;
            const isNegative = numericAmount < 0;
            const amountClass = isPositive
              ? "text-success"
              : isNegative
              ? "text-danger"
              : "text-muted";
            const sign = isPositive ? "+" : "";
            return `
          <div class="tx-row">
            <div class="tx-icon">${getTransactionIcon(tx.type)}</div>
            <div class="tx-info">
              <div class="tx-desc">${escapeHtml(tx.description || tx.type || "")}</div>
              <div class="tx-date">${escapeHtml(formatDate(tx.createdAt))}</div>
            </div>
            <div class="tx-amount ${amountClass}">
              ${numericAmount !== 0 ? `${sign}${escapeHtml(formatCurrency(numericAmount))}` : "مكتمل"}
            </div>
          </div>
        `;
          })
          .join("");
      }
    }

    const depositsBody = document.getElementById("deposits-history-body");
    if (depositsBody) {
      if (deposits.length === 0) {
        depositsBody.innerHTML =
          '<tr><td colspan="5" class="text-center">لا توجد إيداعات سابقة</td></tr>';
      } else {
        depositsBody.innerHTML = deposits
          .map((dep) => {
            const refHash = String(dep.txid || dep.txHash || "");
            return `
        <tr>
          <td>${escapeHtml(formatDate(dep.createdAt))}</td>
          <td><strong>${escapeHtml(formatCurrency(dep.amount))}</strong></td>
          <td>${escapeHtml(dep.network || constants.DEPOSIT_NETWORK)}</td>
          <td><code>${escapeHtml(refHash.slice(0, 14))}${refHash.length > 14 ? "..." : ""}</code></td>
          <td><span class="badge badge-${escapeHtml(dep.status || "pending")}">${escapeHtml(translateStatus(dep.status))}</span></td>
        </tr>
      `;
          })
          .join("");
      }
    }

    const withdrawalsBody = document.getElementById("withdrawals-history-body");
    if (withdrawalsBody) {
      if (withdrawals.length === 0) {
        withdrawalsBody.innerHTML =
          '<tr><td colspan="6" class="text-center">لا توجد سحوبات سابقة</td></tr>';
      } else {
        withdrawalsBody.innerHTML = withdrawals
          .map((w) => {
            const grossAmt = w.amount ?? w.requestedAmount ?? 0;
            const addr = String(w.walletAddress || w.trc20Address || "");
            return `
        <tr>
          <td>${escapeHtml(formatDate(w.createdAt))}</td>
          <td>${escapeHtml(formatCurrency(grossAmt))}</td>
          <td>${escapeHtml(formatCurrency(w.fee))}</td>
          <td><strong>${escapeHtml(formatCurrency(w.netAmount))}</strong></td>
          <td><code>${escapeHtml(addr.slice(0, 10))}${addr.length > 10 ? "..." : ""}</code></td>
          <td><span class="badge badge-${escapeHtml(w.status || "requested")}">${escapeHtml(translateStatus(w.status))}</span></td>
        </tr>
      `;
          })
          .join("");
      }
    }

    renderWalletSection(data, transactions, {
      onSaveAddress: async (address) => {
        const res = await api.saveTrc20Address(resolveUserId(), address);
        showToast(res.message || "تم حفظ العنوان بنجاح", "success");
        await refreshWalletState(resolveUserId());
      },
      onWithdraw: async (amount) => {
        const res = await api.requestWithdrawal(resolveUserId(), amount);
        showToast(res.message || "تم إرسال طلب السحب", "success");
        await refreshWalletState(resolveUserId());
      },
      onDeposit: async (amount, txid) => {
        const res = await api.submitDeposit(resolveUserId(), amount, txid);
        showToast(res.message || "تم إرسال طلب الإيداع", "success");
        await refreshWalletState(resolveUserId());
      },
      onRefresh: async () => {
        await refreshWalletState(resolveUserId());
      }
    });
  } catch (error) {
    console.error("[renderWalletUI Error]:", error);
  }
}

export function renderReferralUI(data = {}) {
  try {
    const wallet = data.wallet || {};
    const referralLogs = Array.isArray(data.referralLogs) ? data.referralLogs : [];
    const baseUrl = window.location.origin;
    const cleanBot = String(activeBotUsername || "TelegaAdsBot").replace("@", "");

    const refCode = wallet.referralCode || "";
    const fullRefLink = refCode
      ? `${baseUrl}/?ref=${encodeURIComponent(refCode)}`
      : `https://t.me/${cleanBot}`;

    const linkInput = document.getElementById("referral-link-input");
    if (linkInput) {
      linkInput.value = fullRefLink;
    }

    const legacyLinkInput = document.getElementById("ref-link-input");
    if (legacyLinkInput && !legacyLinkInput.value) {
      const uid = resolveUserId(wallet.userId) || "guest";
      const encoded = btoa(String(uid)).replace(/=/g, "");
      legacyLinkInput.value = `https://t.me/${cleanBot}?start=ref_${encoded}`;
    }

    const invitedCountEl = document.getElementById("ref-invited-count");
    if (invitedCountEl) {
      invitedCountEl.textContent = String(Number(wallet.referralsCount || 0));
    }

    const refAvailEl = document.getElementById("ref-available-amount");
    if (refAvailEl) {
      refAvailEl.textContent = formatCurrency(
        typeof wallet.referralEarningsAvailable === "number"
          ? wallet.referralEarningsAvailable
          : wallet.referralEarnings || 0
      );
    }

    const refPendEl = document.getElementById("ref-pending-amount");
    if (refPendEl) {
      refPendEl.textContent = formatCurrency(wallet.referralEarningsPending || 0);
    }

    const refLogsBody = document.getElementById("referral-logs-body");
    if (refLogsBody) {
      if (referralLogs.length === 0) {
        refLogsBody.innerHTML =
          '<tr><td colspan="5" class="text-center">لا توجد عمولات إحالة مسجلة بعد. شارك رابطك مع الناشرين!</td></tr>';
      } else {
        refLogsBody.innerHTML = referralLogs
          .map(
            (log) => `
          <tr>
            <td>${escapeHtml(formatDate(log.createdAt))}</td>
            <td><code>${escapeHtml(log.referredUserId || "")}</code></td>
            <td>${escapeHtml(formatCurrency(log.publisherEarning))}</td>
            <td class="text-success"><strong>+${escapeHtml(formatCurrency(log.commissionAmount))} (10%)</strong></td>
            <td>${escapeHtml(formatDate(log.releaseAt))}</td>
          </tr>
        `
          )
          .join("");
      }
    }
  } catch (error) {
    console.error("[renderReferralUI Error]:", error);
  }
}

export function initWalletEvents(getCurrentUserId, onRefreshCallback) {
  if (typeof getCurrentUserId === "function") {
    const uid = getCurrentUserId();
    if (uid) activeUserId = String(uid);
  }
  if (typeof onRefreshCallback === "function") {
    activeRefreshCallback = onRefreshCallback;
  }

  if (boundEvents) return;
  boundEvents = true;

  const triggerRefresh = async () => {
    try {
      if (typeof activeRefreshCallback === "function") {
        await activeRefreshCallback();
      } else {
        await refreshWalletState(resolveUserId());
      }
    } catch (error) {
      showToast(error?.message || "تعذر تحديث البيانات", "error");
    }
  };

  document.getElementById("btn-copy-bep20")?.addEventListener("click", async () => {
    const addr =
      document.getElementById("bep20-deposit-address")?.value ||
      WALLET_UI_CONSTANTS.DEPOSIT_ADDRESS;
    const copied = await copyTextSafe(addr);
    if (copied) {
      showToast("تم نسخ عنوان الإيداع (USDT - BEP20) بنجاح", "success");
    } else {
      showToast("تعذر نسخ العنوان تلقائياً", "error");
    }
  });

  document.getElementById("btn-deposit-instructions")?.addEventListener("click", () => {
    const constants = {
      ...WALLET_UI_CONSTANTS,
      ...(currentState?.constants || {})
    };
    openModal(
      "تعليمات وخطوات شحن الرصيد (USDT - BEP20)",
      `
      <ol class="instructions-list">
        <li>انسخ عنوان الإيداع الرسمي الموضح: <br><code>${escapeHtml(constants.DEPOSIT_ADDRESS)}</code></li>
        <li>افتح محفظتك (Binance, Trust Wallet, MetaMask) واختر عملة <strong>USDT</strong>.</li>
        <li>حدد الشبكة بدقة: <strong>BNB Smart Chain (BEP20)</strong> فقط. (الإرسال على شبكة أخرى يؤدي لفقدان الأموال).</li>
        <li>أرسل مبلغاً لا يقل عن <strong>${escapeHtml(formatCurrency(constants.MIN_DEPOSIT))}</strong>.</li>
        <li>بعد نجاح التحويل، انسخ <strong>رقم المعاملة (TXID / Hash)</strong> وأدخله في نموذج الإيداع مع المبلغ المرسل.</li>
        <li>سيقوم فريق الإدارة بالتحقق وإضافة الرصيد لحسابك فوراً. (ملاحظة: عمليات الشحن لا تولد عمولة إحالة).</li>
      </ol>
    `
    );
  });

  document.getElementById("form-deposit")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const userId =
        typeof getCurrentUserId === "function" ? resolveUserId(getCurrentUserId()) : resolveUserId();
      const amount = document.getElementById("deposit-amount")?.value;
      const txid = document.getElementById("deposit-txid")?.value;

      const res = await api.submitDeposit(userId, amount, txid);
      showToast(res.message || "تم إرسال طلب الإيداع بنجاح", "success");
      e.target.reset();
      await triggerRefresh();
    } catch (error) {
      showToast(error?.message || "تعذر إرسال طلب الإيداع", "error");
    }
  });

  document.getElementById("btn-save-trc20")?.addEventListener("click", async () => {
    try {
      const userId =
        typeof getCurrentUserId === "function" ? resolveUserId(getCurrentUserId()) : resolveUserId();
      const address = document.getElementById("trc20-wallet-input")?.value || "";

      const res = await api.saveTrc20Address(userId, address);
      showToast(res.message || "تم حفظ العنوان بنجاح", "success");
      await triggerRefresh();
    } catch (error) {
      showToast(error?.message || "تعذر حفظ العنوان", "error");
    }
  });

  document.getElementById("withdraw-amount")?.addEventListener("input", (e) => {
    const fee = Number(currentState?.constants?.WITHDRAWAL_FEE ?? WALLET_UI_CONSTANTS.WITHDRAWAL_FEE);
    const calc = calculateWithdrawalNet(e.target.value, fee);
    const previewEl = document.getElementById("withdraw-net-preview");
    if (previewEl) {
      previewEl.textContent = formatCurrency(calc.net);
    }
  });

  document.getElementById("form-withdraw")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const userId =
        typeof getCurrentUserId === "function" ? resolveUserId(getCurrentUserId()) : resolveUserId();
      const amount = document.getElementById("withdraw-amount")?.value;

      const res = await api.requestWithdrawal(userId, amount);
      showToast(res.message || "تم إرسال طلب السحب بنجاح", "success");
      e.target.reset();
      const previewEl = document.getElementById("withdraw-net-preview");
      if (previewEl) previewEl.textContent = formatCurrency(0);
      await triggerRefresh();
    } catch (error) {
      showToast(error?.message || "تعذر إتمام طلب السحب", "error");
    }
  });

  document.getElementById("btn-copy-referral")?.addEventListener("click", async () => {
    const link = document.getElementById("referral-link-input")?.value || "";
    const copied = await copyTextSafe(link);
    if (copied) {
      showToast("تم نسخ رابط الإحالة الخاص بك بنجاح", "success");
    } else {
      showToast("تعذر نسخ رابط الإحالة", "error");
    }
  });
}

export function initWalletAndReferralModule(userInternalId, botUsername, initData = "") {
  if (userInternalId) {
    activeUserId = String(userInternalId);
  }
  if (botUsername) {
    activeBotUsername = String(botUsername);
  }
  if (initData) {
    const scopedApi = new ApiService(initData);
    scopedApi.setInitData(initData);
  }

  initWalletEvents(
    () => resolveUserId(userInternalId),
    () => refreshWalletState(resolveUserId(userInternalId))
  );

  const revealBtn = document.querySelector('[data-action="reveal-referral"]');
  const linkBox = document.getElementById("referral-link-box");
  const linkInput = document.getElementById("ref-link-input");
  const copyBtn = document.getElementById("copy-ref-btn");

  revealBtn?.addEventListener("click", () => {
    const cleanBot = String(activeBotUsername || "TelegaAdsBot").replace("@", "");
    const uid = resolveUserId(userInternalId) || "guest";
    const refCode =
      currentState?.wallet?.referralCode || btoa(String(uid)).replace(/=/g, "");
    if (linkInput) {
      linkInput.value = `https://t.me/${cleanBot}?start=ref_${refCode}`;
    }
    linkBox?.classList.remove("hidden");
  });

  copyBtn?.addEventListener("click", async () => {
    if (!linkInput?.value) return;
    const copied = await copyTextSafe(linkInput.value);
    if (copied) {
      showToast(t("copied_success"), "success");
    } else {
      linkInput.select();
      document.execCommand("copy");
      showToast(t("copied_success"), "success");
    }
  });

  const targetId = resolveUserId(userInternalId);
  if (targetId) {
    refreshWalletState(targetId);
  }
}
