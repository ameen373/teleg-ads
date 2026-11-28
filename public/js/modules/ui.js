import { SUPPORTED_LANGUAGES, getCurrentLanguage, setLanguage, t } from "../language/i18n.js";

let alertTimer = null;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeT(key) {
  try {
    return typeof t === "function" ? t(key) : key;
  } catch {
    return key;
  }
}

/* =========================================================
 * التنسيق والأدوات العامة (Formatting & Utilities)
 * ========================================================= */

export function formatUsd(amount) {
  const num = Number(amount);
  return `$${(Number.isFinite(num) ? num : 0).toFixed(2)}`;
}

export function formatDate(isoString) {
  if (!isoString) return "-";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return String(isoString);
  try {
    return date.toLocaleString("ar-EG", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return date.toISOString();
  }
}

export function getTransactionIcon(type) {
  const map = {
    deposit: "⬇️",
    withdrawal: "⬆️",
    earning: "💰",
    referral_commission: "🤝",
    campaign_spend: "📢",
    campaign_refund: "↩️",
    withdrawal_fee: "🧾",
  };
  return map[type] || "💳";
}

export function getTransactionTypeLabel(type) {
  const map = {
    deposit: "إيداع USDT - BEP20",
    withdrawal: "سحب USDT - TRC20",
    earning: "ربح مكتسب",
    referral_commission: "عمولة إحالة (10%)",
    campaign_spend: "صرف حملة إعلانية",
    campaign_refund: "استرداد ميزانية حملة",
    withdrawal_fee: "رسوم سحب",
  };
  return map[type] || String(type || "");
}

export async function copyToClipboard(text) {
  const value = String(text ?? "");
  if (!value) return false;

  if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // الانتقال إلى النسخ البديل في حال رفض الصلاحية في WebView
    }
  }

  try {
    const helper = document.createElement("textarea");
    helper.value = value;
    helper.setAttribute("readonly", "");
    helper.style.position = "fixed";
    helper.style.top = "-9999px";
    helper.style.left = "-9999px";
    helper.style.opacity = "0";
    document.body.appendChild(helper);
    helper.focus();
    helper.select();
    helper.setSelectionRange(0, value.length);
    const copied = document.execCommand("copy");
    document.body.removeChild(helper);
    return Boolean(copied);
  } catch {
    return false;
  }
}

export function showOnlyPanel(panelId, groupSelector = ".collapsible-panel") {
  const panels = document.querySelectorAll(groupSelector);
  panels.forEach((p) => {
    if (p.id === panelId) {
      p.classList.toggle("hidden");
    } else {
      p.classList.add("hidden");
    }
  });
}

/* =========================================================
 * التنبيهات والرسائل والإشعارات (Alerts, Toasts & Notifications)
 * ========================================================= */

export function showAlert(message, type = "success") {
  const alertEl = document.getElementById("globalAlert");
  if (!alertEl) return;

  const safeType = ["success", "error", "warning", "info"].includes(type) ? type : "success";
  alertEl.textContent = String(message ?? "");
  alertEl.className = `alert ${safeType}`;

  if (alertTimer) {
    clearTimeout(alertTimer);
  }
  alertTimer = setTimeout(() => {
    alertEl.className = "alert hidden";
    alertTimer = null;
  }, 5000);
}

export function showToast(message) {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = "toast-msg toast";
  toast.textContent = String(message ?? "");
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transition = "opacity 0.3s ease";
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 2800);
}

export function renderNotificationsModal(notifications = []) {
  const listEl = document.getElementById("notifications-list");
  const badgeEl = document.getElementById("notif-badge");
  if (!listEl) return;

  const items = Array.isArray(notifications) ? notifications : [];

  if (badgeEl) {
    if (items.length > 0) {
      badgeEl.textContent = String(items.length);
      badgeEl.classList.remove("hidden");
    } else {
      badgeEl.classList.add("hidden");
    }
  }

  if (!items.length) {
    listEl.innerHTML = `<div class="item-card"><p class="hint-text">${escapeHtml(
      safeT("noData")
    )}</p></div>`;
    return;
  }

  listEl.innerHTML = items
    .map(
      (n) => `
      <div class="item-card">
        <strong>${escapeHtml(n?.title ?? "")}</strong>
        <p class="hint-text">${escapeHtml(n?.message ?? "")}</p>
      </div>
    `
    )
    .join("");
}

/* =========================================================
 * النوافذ المنبثقة (Modals)
 * ========================================================= */

export function openModal(title, contentNodeOrHtml) {
  const backdrop = document.getElementById("modal-backdrop");
  const titleEl = document.getElementById("modal-title");
  const bodyEl = document.getElementById("modal-body");
  if (!backdrop || !titleEl || !bodyEl) return;

  titleEl.textContent = String(title ?? "");
  bodyEl.innerHTML = "";

  if (typeof contentNodeOrHtml === "string") {
    bodyEl.innerHTML = contentNodeOrHtml;
  } else if (contentNodeOrHtml instanceof HTMLElement) {
    bodyEl.appendChild(contentNodeOrHtml);
  }

  backdrop.classList.remove("hidden");
}

export function closeModal() {
  const backdrop = document.getElementById("modal-backdrop");
  if (!backdrop) return;
  backdrop.classList.add("hidden");
}

export function openLanguageModal(onLanguageChanged) {
  const wrapper = document.createElement("div");
  wrapper.style.display = "flex";
  wrapper.style.flexDirection = "column";
  wrapper.style.gap = "8px";

  const activeCode = typeof getCurrentLanguage === "function" ? getCurrentLanguage() : "en";
  const languages = Array.isArray(SUPPORTED_LANGUAGES) ? SUPPORTED_LANGUAGES : [];

  languages.forEach((lang) => {
    const btn = document.createElement("button");
    btn.type = "button";
    const isSelected = lang.code === activeCode;
    const isComingSoon = !lang.active;
    btn.className = `lang-option-btn ${isSelected ? "selected" : ""} ${isComingSoon ? "coming-soon" : ""}`;

    const safeFlag = escapeHtml(lang.flag || "");
    const safeLabel = escapeHtml(lang.label || lang.code || "");
    const rightBadge = lang.active
      ? isSelected
        ? "<span>✓</span>"
        : ""
      : `<span class="badge-soon">Soon</span>`;

    btn.innerHTML = `<span>${safeFlag} &nbsp; ${safeLabel}</span>${rightBadge}`;

    btn.addEventListener("click", () => {
      const targetLang = lang.active ? lang.code : "en";
      if (typeof setLanguage === "function") {
        setLanguage(targetLang);
      }
      closeModal();
      requestAnimationFrame(() => updateActiveNavPill());
      if (!lang.active) {
        showToast(safeT("lang_not_ready"));
      }
      if (typeof onLanguageChanged === "function") {
        onLanguageChanged(targetLang);
      }
    });

    wrapper.appendChild(btn);
  });

  openModal(safeT("modal_select_lang"), wrapper);
}

export function openFaqModal() {
  const emptyBox = document.createElement("div");
  emptyBox.style.padding = "28px 12px";
  emptyBox.style.textAlign = "center";
  emptyBox.style.color = "var(--text-muted)";
  emptyBox.textContent = safeT("modal_faq_empty");
  openModal(safeT("modal_faq_title"), emptyBox);
}

export function openSupportModal(apiService, tgWebApp, botUsername) {
  const container = document.createElement("div");
  container.style.display = "flex";
  container.style.flexDirection = "column";
  container.style.gap = "12px";

  const desc = document.createElement("p");
  desc.style.fontSize = "0.9rem";
  desc.style.color = "var(--text-muted)";
  desc.textContent = safeT("modal_support_desc");

  const textarea = document.createElement("textarea");
  textarea.className = "modern-input";
  textarea.rows = 4;
  textarea.placeholder = safeT("placeholder_support_msg");

  const sendBtn = document.createElement("button");
  sendBtn.type = "button";
  sendBtn.className = "primary-btn full-width";
  sendBtn.textContent = safeT("btn_send_support");

  sendBtn.addEventListener("click", async () => {
    const msg = textarea.value.trim();
    if (!msg) return;
    sendBtn.disabled = true;
    try {
      if (apiService && typeof apiService.sendSupportTicket === "function") {
        await apiService.sendSupportTicket(msg);
      }
      showToast(safeT("support_sent"));
      closeModal();
    } catch {
      showToast(safeT("support_sent"));
      closeModal();
    } finally {
      sendBtn.disabled = false;
    }
  });

  const botBtn = document.createElement("button");
  botBtn.type = "button";
  botBtn.className = "secondary-btn full-width";
  botBtn.textContent = safeT("btn_open_bot_support");
  botBtn.addEventListener("click", () => {
    const cleanBot = String(botUsername || "TelegaAdsSupportBot").replace(/^@/, "");
    const url = `https://t.me/${cleanBot}?start=support`;
    if (tgWebApp && typeof tgWebApp.openTelegramLink === "function") {
      tgWebApp.openTelegramLink(url);
    } else {
      window.open(url, "_blank");
    }
  });

  container.append(desc, textarea, sendBtn, botBtn);
  openModal(safeT("modal_support_title"), container);
}

/* =========================================================
 * التنقل والأقسام والشارات (Navigation & Sections)
 * ========================================================= */

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

export function activateSection(sectionName) {
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-section") === sectionName);
  });
  document.querySelectorAll(".tab-section").forEach((sec) => {
    sec.classList.toggle("active", sec.id === `section-${sectionName}`);
  });
}

export function initNavigation(onSectionChange) {
  const navItems = document.querySelectorAll(".nav-item");
  const sections = document.querySelectorAll(".view-section");

  navItems.forEach((btn) => {
    if (btn.dataset.navBound === "true") return;
    btn.dataset.navBound = "true";

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

  if (!window.__uiNavResizeBound) {
    window.__uiNavResizeBound = true;
    window.addEventListener("resize", () => updateActiveNavPill());
  }
  requestAnimationFrame(() => updateActiveNavPill());

  const closeBtn = document.getElementById("modal-close-btn");
  if (closeBtn && closeBtn.dataset.modalCloseBound !== "true") {
    closeBtn.dataset.modalCloseBound = "true";
    closeBtn.addEventListener("click", closeModal);
  }

  const backdrop = document.getElementById("modal-backdrop");
  if (backdrop && backdrop.dataset.modalBackdropBound !== "true") {
    backdrop.dataset.modalBackdropBound = "true";
    backdrop.addEventListener("click", (e) => {
      if (e.target.id === "modal-backdrop") closeModal();
    });
  }
}
