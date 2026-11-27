import { SUPPORTED_LANGUAGES, getCurrentLanguage, setLanguage, t } from "../language/i18n.js";

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
  if (Number.isNaN(date.getTime())) return isoString;
  return date.toLocaleString("ar-EG", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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
  return map[type] || type;
}

export async function copyToClipboard(text) {
  if (!text) return false;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }
  const helper = document.createElement("textarea");
  helper.value = text;
  document.body.appendChild(helper);
  helper.select();
  document.execCommand("copy");
  document.body.removeChild(helper);
  return true;
}

/* =========================================================
 * التنبيهات والرسائل (Alerts & Toasts)
 * ========================================================= */

export function showAlert(message, type = "success") {
  const alertEl = document.getElementById("globalAlert");
  if (!alertEl) return;
  alertEl.textContent = message;
  alertEl.className = `alert ${type}`;
  clearTimeout(showAlert._timer);
  showAlert._timer = setTimeout(() => {
    alertEl.className = "alert hidden";
  }, 5000);
}

export function showToast(message) {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = "toast-msg";
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transition = "opacity 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, 2800);
}

/* =========================================================
 * النوافذ المنبثقة (Modals)
 * ========================================================= */

export function openModal(title, contentNodeOrHtml) {
  const backdrop = document.getElementById("modal-backdrop");
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
  const backdrop = document.getElementById("modal-backdrop");
  if (!backdrop) return;
  backdrop.classList.add("hidden");
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
      showToast(t("support_sent"));
      closeModal();
    } catch {
      showToast(t("support_sent"));
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

/* =========================================================
 * التنقل والأقسام والشارات (Navigation & Sections)
 * ========================================================= */

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
 * تحديث عداد الإشعارات على أي قسم (channels | campaigns | admin)
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
    btn.addEventListener("click", () => {
      const targetId = btn.getAttribute("data-target");
      if (!targetId) return;

      // اهتزاز لمسي ناعم داخل تيليجرام
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

  // إعادة ضبط موضع الكبسولة عند تدوير الشاشة أو تغيير حجمها
  window.addEventListener("resize", () => updateActiveNavPill());
  requestAnimationFrame(() => updateActiveNavPill());

  document.getElementById("modal-close-btn")?.addEventListener("click", closeModal);
  document.getElementById("modal-backdrop")?.addEventListener("click", (e) => {
    if (e.target.id === "modal-backdrop") closeModal();
  });
}
