import { SUPPORTED_LANGUAGES, getCurrentLanguage, setLanguage, t } from "../language/i18n.js";

export const WALLET_UI_CONSTANTS = Object.freeze({
  MIN_WITHDRAWAL: 30.0,
  WITHDRAWAL_FEE: 3.0,
  WITHDRAWAL_NETWORK: "USDT - TRC20",
  MIN_DEPOSIT: 10.0,
  DEPOSIT_NETWORK: "USDT - BEP20",
  DEPOSIT_ADDRESS: "0xf9278f55585a0e6e35f12299493134056f2f19b0",
  REFERRAL_COMMISSION_RATE: 0.1
});

export function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function formatCurrency(amount) {
  const num = Number(amount);
  const safeNum = Number.isFinite(num) ? num : 0;
  return `$${safeNum.toFixed(2)}`;
}

export function formatDate(isoString) {
  if (!isoString) return "-";
  try {
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return "-";
    const locale = getCurrentLanguage() === "ar" ? "ar-EG" : "en-US";
    return date.toLocaleString(locale, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return "-";
  }
}

export function getTransactionIcon(type) {
  const icons = {
    deposit_approved: "💰",
    deposit_completed: "💰",
    deposit_pending: "⏳",
    deposit_request: "⏳",
    deposit_rejected: "🚫",
    withdrawal: "📤",
    withdrawal_request: "📤",
    withdrawal_completed: "✅",
    withdrawal_refunded: "↩️",
    earning_pending: "🕒",
    earning_released: "💵",
    referral_pending: "🤝",
    referral_released: "🎁",
    campaign_spend: "📢",
    campaign_refund: "🔄"
  };
  return icons[type] || "💳";
}

export function calculateWithdrawalNet(amount, fee = WALLET_UI_CONSTANTS.WITHDRAWAL_FEE) {
  const gross = Number(amount);
  const feeAmount = Number(fee);
  if (!Number.isFinite(gross) || !Number.isFinite(feeAmount)) {
    return { valid: false, gross: 0, fee: feeAmount || 0, net: 0 };
  }
  const roundedGross = Number(gross.toFixed(2));
  const roundedFee = Number(feeAmount.toFixed(2));
  const net = Number((roundedGross - roundedFee).toFixed(2));
  const valid = roundedGross >= WALLET_UI_CONSTANTS.MIN_WITHDRAWAL && net > 0;
  return {
    valid,
    gross: roundedGross,
    fee: roundedFee,
    net: Math.max(0, net)
  };
}

export function showToast(message, type = "info") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  const safeType = ["success", "error", "info"].includes(type) ? type : "info";
  toast.className = `toast-msg toast toast-${safeType}`;

  const iconMap = {
    success: "✅",
    error: "❌",
    info: "ℹ️"
  };

  if (arguments.length >= 2) {
    toast.innerHTML = `
      <span class="toast-icon">${iconMap[safeType]}</span>
      <span class="toast-text">${escapeHtml(message)}</span>
    `;
  } else {
    toast.textContent = message;
  }

  container.appendChild(toast);

  const duration = arguments.length >= 2 ? 3600 : 2800;
  setTimeout(() => {
    toast.classList.add("fade-out");
    toast.style.opacity = "0";
    toast.style.transition = "opacity 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

export function openModal(title, contentNodeOrHtml) {
  const backdrop =
    document.getElementById("modal-backdrop") || document.getElementById("app-modal");
  const titleEl = document.getElementById("modal-title");
  const bodyEl = document.getElementById("modal-body");

  if (!backdrop || !titleEl || !bodyEl) return;

  titleEl.textContent = title;
  bodyEl.innerHTML = "";

  if (typeof contentNodeOrHtml === "string") {
    bodyEl.innerHTML = contentNodeOrHtml;
  } else if (contentNodeOrHtml instanceof HTMLElement) {
    bodyEl.appendChild(contentNodeOrHtml);
  }

  backdrop.classList.remove("hidden");
}

export function closeModal() {
  const backdrop =
    document.getElementById("modal-backdrop") || document.getElementById("app-modal");
  if (backdrop) {
    backdrop.classList.add("hidden");
  }
}

/**
 * تحريك الكبسولة النشطة بدقة خلف الزر المختار
 */
export function updateActiveNavPill(targetBtn) {
  const nav = document.getElementById("bottom-nav");
  const pill = document.getElementById("nav-active-pill");
  const activeBtn = targetBtn || document.querySelector(".bottom-nav .nav-item.active");

  if (!nav || !pill || !activeBtn) return;

  const navRect = nav.getBoundingClientRect();
  const btnRect = activeBtn.getBoundingClientRect();

  if (btnRect.width === 0) return;

  const offsetLeft = btnRect.left - navRect.left;
  pill.style.width = `${btnRect.width}px`;
  pill.style.transform = `translateX(${offsetLeft}px)`;
}

/**
 * تحديث عداد الإشعارات على أي قسم (channels | campaigns | admin | wallet)
 */
export function setNavBadge(sectionKey, count) {
  const badgeEl = document.getElementById(`badge-${sectionKey}`);
  if (!badgeEl) return;

  const num = Number(count) || 0;
  if (num > 0) {
    badgeEl.textContent = num > 999 ? "999+" : String(num);
    badgeEl.classList.remove("hidden");
  } else {
    badgeEl.classList.add("hidden");
  }
}

export function initNavigation(onSectionChange) {
  const navItems = document.querySelectorAll(".nav-item");
  const sections = document.querySelectorAll(".view-section");

  navItems.forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.getAttribute("data-target");
      if (!targetId) return;

      try {
        window.Telegram?.WebApp?.HapticFeedback?.selectionChanged();
      } catch {
        // تجاهل في حال الفتح خارج تيليجرام
      }

      navItems.forEach((n) => n.classList.remove("active"));
      btn.classList.add("active");
      updateActiveNavPill(btn);

      sections.forEach((sec) => {
        sec.classList.remove("active-view");
        if (sec.id === targetId) {
          sec.classList.add("active-view");
        }
      });

      if (typeof onSectionChange === "function") {
        onSectionChange(targetId);
      }
    });
  });

  window.addEventListener("resize", () => updateActiveNavPill());
  requestAnimationFrame(() => updateActiveNavPill());

  document.getElementById("modal-close-btn")?.addEventListener("click", closeModal);
  document.getElementById("modal-backdrop")?.addEventListener("click", (e) => {
    if (e.target.id === "modal-backdrop") closeModal();
  });
  document.getElementById("app-modal")?.addEventListener("click", (e) => {
    if (e.target.id === "app-modal") closeModal();
  });
}

export function renderWalletSection(walletData = {}, transactions = [], callbacks = {}) {
  const container = document.getElementById("wallet-section-content");
  if (!container) return;

  const constants = {
    ...WALLET_UI_CONSTANTS,
    ...(walletData.constants || {})
  };

  const wallet = walletData.wallet || walletData || {};
  const availableBalance = Number(
    typeof wallet.availableBalance === "number" ? wallet.availableBalance : wallet.balance || 0
  );
  const pendingEarnings = Number(wallet.pendingEarnings || 0);
  const referralEarningsAvailable = Number(
    typeof wallet.referralEarningsAvailable === "number"
      ? wallet.referralEarningsAvailable
      : wallet.referralEarnings || 0
  );
  const referralEarningsPending = Number(wallet.referralEarningsPending || 0);
  const totalEarned = Number(wallet.totalEarned || 0);
  const totalSpent = Number(wallet.totalSpent || 0);
  const trc20Address = wallet.trc20Address || "";

  const txList = Array.isArray(transactions)
    ? transactions
    : Array.isArray(walletData.transactions)
    ? walletData.transactions
    : [];

  const txRowsHtml =
    txList.length > 0
      ? txList
          .map((tx) => {
            const amt = Number(tx.amount || 0);
            const signClass = amt > 0 ? "amount-positive" : amt < 0 ? "amount-negative" : "amount-neutral";
            const prefix = amt > 0 ? "+" : "";
            return `
              <div class="wallet-tx-item" data-tx-id="${escapeHtml(tx.id || "")}">
                <div class="wallet-tx-main">
                  <span class="wallet-tx-icon">${getTransactionIcon(tx.type)}</span>
                  <div class="wallet-tx-meta">
                    <div class="wallet-tx-desc">${escapeHtml(tx.description || tx.type || "عملية مالية")}</div>
                    <div class="wallet-tx-date">${escapeHtml(formatDate(tx.createdAt))}</div>
                  </div>
                </div>
                <div class="wallet-tx-right">
                  <div class="wallet-tx-amount ${signClass}">${prefix}${escapeHtml(formatCurrency(amt))}</div>
                  <div class="wallet-tx-status">${escapeHtml(tx.status || "completed")}</div>
                </div>
              </div>
            `;
          })
          .join("")
      : `<div class="wallet-empty-state">لا توجد عمليات مسجلة في السجل حالياً</div>`;

  container.innerHTML = `
    <div class="wallet-panel" id="wallet-panel">
      <div class="wallet-balances-grid">
        <div class="wallet-balance-card primary-balance">
          <div class="wallet-label">الرصيد المتاح</div>
          <div class="wallet-value" id="wallet-available-balance">${escapeHtml(formatCurrency(availableBalance))}</div>
        </div>
        <div class="wallet-balance-card">
          <div class="wallet-label">أرباح معلقة (24 ساعة)</div>
          <div class="wallet-value" id="wallet-pending-earnings">${escapeHtml(formatCurrency(pendingEarnings))}</div>
        </div>
        <div class="wallet-balance-card">
          <div class="wallet-label">أرباح الإحالة المتاحة</div>
          <div class="wallet-value" id="wallet-referral-available">${escapeHtml(formatCurrency(referralEarningsAvailable))}</div>
        </div>
        <div class="wallet-balance-card">
          <div class="wallet-label">أرباح الإحالة المعلقة</div>
          <div class="wallet-value" id="wallet-referral-pending">${escapeHtml(formatCurrency(referralEarningsPending))}</div>
        </div>
        <div class="wallet-balance-card">
          <div class="wallet-label">إجمالي الأرباح</div>
          <div class="wallet-value" id="wallet-total-earned">${escapeHtml(formatCurrency(totalEarned))}</div>
        </div>
        <div class="wallet-balance-card">
          <div class="wallet-label">إجمالي المصروفات</div>
          <div class="wallet-value" id="wallet-total-spent">${escapeHtml(formatCurrency(totalSpent))}</div>
        </div>
      </div>

      <div class="wallet-card" id="wallet-trc20-card">
        <div class="wallet-card-title">عنوان السحب (${escapeHtml(constants.WITHDRAWAL_NETWORK)})</div>
        <div class="wallet-form-row">
          <input
            type="text"
            id="wallet-trc20-input"
            class="modern-input"
            placeholder="أدخل عنوان USDT - TRC20 (يبدأ بـ T)"
            value="${escapeHtml(trc20Address)}"
          />
          <button type="button" id="wallet-save-address-btn" class="secondary-btn">حفظ العنوان</button>
        </div>
      </div>

      <div class="wallet-card" id="wallet-withdraw-card">
        <div class="wallet-card-title">طلب سحب عبر ${escapeHtml(constants.WITHDRAWAL_NETWORK)}</div>
        <div class="wallet-rules-hint">
          الحد الأدنى للسحب: ${escapeHtml(formatCurrency(constants.MIN_WITHDRAWAL))} | الرسوم: ${escapeHtml(formatCurrency(constants.WITHDRAWAL_FEE))}
        </div>
        <div class="wallet-form-row">
          <input
            type="number"
            id="wallet-withdraw-amount"
            class="modern-input"
            min="${escapeHtml(String(constants.MIN_WITHDRAWAL))}"
            step="0.01"
            placeholder="مبلغ السحب بالدولار (USDT)"
          />
          <button type="button" id="wallet-withdraw-btn" class="primary-btn">طلب السحب</button>
        </div>
        <div class="wallet-net-preview" id="wallet-withdraw-preview">
          الصافي المتوقع استلامه: ${escapeHtml(formatCurrency(0))} (بعد خصم رسوم ${escapeHtml(formatCurrency(constants.WITHDRAWAL_FEE))})
        </div>
      </div>

      <div class="wallet-card" id="wallet-deposit-card">
        <div class="wallet-card-title">إيداع عبر ${escapeHtml(constants.DEPOSIT_NETWORK)}</div>
        <div class="wallet-rules-hint">
          الحد الأدنى للإيداع: ${escapeHtml(formatCurrency(constants.MIN_DEPOSIT))} | عنوان الإيداع: <code>${escapeHtml(constants.DEPOSIT_ADDRESS)}</code>
        </div>
        <div class="wallet-form-stack">
          <input
            type="number"
            id="wallet-deposit-amount"
            class="modern-input"
            min="${escapeHtml(String(constants.MIN_DEPOSIT))}"
            step="0.01"
            placeholder="مبلغ الإيداع (USDT)"
          />
          <input
            type="text"
            id="wallet-deposit-txid"
            class="modern-input"
            placeholder="رقم المعاملة (TXID)"
          />
          <button type="button" id="wallet-deposit-btn" class="secondary-btn full-width">إرسال طلب الإيداع</button>
        </div>
      </div>

      <div class="wallet-card" id="wallet-transactions-card">
        <div class="wallet-card-header-row">
          <div class="wallet-card-title">سجل العمليات</div>
          <button type="button" id="wallet-refresh-btn" class="secondary-btn">تحديث</button>
        </div>
        <div class="wallet-tx-list" id="wallet-transactions-list">
          ${txRowsHtml}
        </div>
      </div>
    </div>
  `;

  const amountInput = document.getElementById("wallet-withdraw-amount");
  const previewEl = document.getElementById("wallet-withdraw-preview");
  const updatePreview = () => {
    if (!amountInput || !previewEl) return;
    const calc = calculateWithdrawalNet(amountInput.value, constants.WITHDRAWAL_FEE);
    previewEl.textContent = `الصافي المتوقع استلامه: ${formatCurrency(calc.net)} (بعد خصم رسوم ${formatCurrency(calc.fee)})`;
  };
  amountInput?.addEventListener("input", updatePreview);

  document.getElementById("wallet-save-address-btn")?.addEventListener("click", async () => {
    const addrInput = document.getElementById("wallet-trc20-input");
    const addr = addrInput ? addrInput.value.trim() : "";
    if (!addr) {
      showToast("يرجى إدخال عنوان محفظة USDT - TRC20", "error");
      return;
    }
    if (typeof callbacks.onSaveAddress === "function") {
      try {
        await callbacks.onSaveAddress(addr);
      } catch (err) {
        showToast(err?.message || "تعذر حفظ العنوان", "error");
      }
    }
  });

  document.getElementById("wallet-withdraw-btn")?.addEventListener("click", async () => {
    const rawVal = amountInput ? Number(amountInput.value) : NaN;
    if (!Number.isFinite(rawVal) || rawVal < constants.MIN_WITHDRAWAL) {
      showToast(`الحد الأدنى للسحب هو ${formatCurrency(constants.MIN_WITHDRAWAL)}`, "error");
      return;
    }
    const calc = calculateWithdrawalNet(rawVal, constants.WITHDRAWAL_FEE);
    if (!calc.valid) {
      showToast("مبلغ السحب غير صالح بعد خصم الرسوم", "error");
      return;
    }
    if (typeof callbacks.onWithdraw === "function") {
      try {
        await callbacks.onWithdraw(calc.gross);
      } catch (err) {
        showToast(err?.message || "تعذر إتمام طلب السحب", "error");
      }
    }
  });

  document.getElementById("wallet-deposit-btn")?.addEventListener("click", async () => {
    const depAmtInput = document.getElementById("wallet-deposit-amount");
    const depTxidInput = document.getElementById("wallet-deposit-txid");
    const depAmount = depAmtInput ? Number(depAmtInput.value) : NaN;
    const txid = depTxidInput ? depTxidInput.value.trim() : "";

    if (!Number.isFinite(depAmount) || depAmount < constants.MIN_DEPOSIT) {
      showToast(`الحد الأدنى للإيداع هو ${formatCurrency(constants.MIN_DEPOSIT)}`, "error");
      return;
    }
    if (!txid) {
      showToast("يرجى إدخال رقم المعاملة (TXID)", "error");
      return;
    }
    if (typeof callbacks.onDeposit === "function") {
      try {
        await callbacks.onDeposit(depAmount, txid);
      } catch (err) {
        showToast(err?.message || "تعذر إرسال طلب الإيداع", "error");
      }
    }
  });

  document.getElementById("wallet-refresh-btn")?.addEventListener("click", async () => {
    if (typeof callbacks.onRefresh === "function") {
      try {
        await callbacks.onRefresh();
      } catch (err) {
        showToast(err?.message || "تعذر تحديث المحفظة", "error");
      }
    }
  });
}

export function openLanguageModal(onLanguageChanged) {
  const wrapper = document.createElement("div");
  wrapper.style.display = "flex";
  wrapper.style.flexDirection = "column";
  wrapper.style.gap = "8px";

  const activeCode = getCurrentLanguage();

  SUPPORTED_LANGUAGES.forEach((lang) => {
    const btn = document.createElement("button");
    btn.className = `lang-option-btn ${lang.code === activeCode ? "selected" : ""} ${!lang.active ? "coming-soon" : ""}`;
    btn.innerHTML = `
      <span>${lang.flag} &nbsp; ${lang.label}</span>
      ${lang.active ? (lang.code === activeCode ? "<span>✓</span>" : "") : `<span class="badge-soon">Soon</span>`}
    `;

    btn.addEventListener("click", () => {
      if (lang.active) {
        setLanguage(lang.code);
        closeModal();
        requestAnimationFrame(() => updateActiveNavPill());
        if (typeof onLanguageChanged === "function") onLanguageChanged(lang.code);
      } else {
        setLanguage("en");
        closeModal();
        requestAnimationFrame(() => updateActiveNavPill());
        showToast(t("lang_not_ready"));
        if (typeof onLanguageChanged === "function") onLanguageChanged("en");
      }
    });

    wrapper.appendChild(btn);
  });

  openModal(t("modal_select_lang"), wrapper);
}

export function openFaqModal() {
  const emptyBox = document.createElement("div");
  emptyBox.style.padding = "28px 12px";
  emptyBox.style.textAlign = "center";
  emptyBox.style.color = "var(--text-muted)";
  emptyBox.textContent = t("modal_faq_empty");
  openModal(t("modal_faq_title"), emptyBox);
}

export function openSupportModal(apiService, tgWebApp, botUsername) {
  const container = document.createElement("div");
  container.style.display = "flex";
  container.style.flexDirection = "column";
  container.style.gap = "12px";

  const desc = document.createElement("p");
  desc.style.fontSize = "0.9rem";
  desc.style.color = "var(--text-muted)";
  desc.textContent = t("modal_support_desc");

  const textarea = document.createElement("textarea");
  textarea.className = "modern-input";
  textarea.rows = 4;
  textarea.placeholder = t("placeholder_support_msg");

  const sendBtn = document.createElement("button");
  sendBtn.className = "primary-btn full-width";
  sendBtn.textContent = t("btn_send_support");

  sendBtn.addEventListener("click", async () => {
    const msg = textarea.value.trim();
    if (!msg) return;
    sendBtn.disabled = true;
    try {
      await apiService.sendSupportTicket(msg);
      showToast(t("support_sent"), "success");
      closeModal();
    } catch {
      showToast(t("support_sent"), "info");
      closeModal();
    } finally {
      sendBtn.disabled = false;
    }
  });

  const botBtn = document.createElement("button");
  botBtn.className = "secondary-btn full-width";
  botBtn.textContent = t("btn_open_bot_support");
  botBtn.addEventListener("click", () => {
    const cleanBot = (botUsername || "TelegaAdsSupportBot").replace("@", "");
    const url = `https://t.me/${cleanBot}?start=support`;
    if (tgWebApp && tgWebApp.openTelegramLink) {
      tgWebApp.openTelegramLink(url);
    } else {
      window.open(url, "_blank");
    }
  });

  container.append(desc, textarea, sendBtn, botBtn);
  openModal(t("modal_support_title"), container);
}
