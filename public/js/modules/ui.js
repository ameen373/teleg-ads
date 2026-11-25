import { SUPPORTED_LANGUAGES, getCurrentLanguage, setLanguage, t } from "../language/i18n.js";

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

export function openModal(title, contentNodeOrHtml) {
  const backdrop = document.getElementById("modal-backdrop");
  const titleEl = document.getElementById("modal-title");
  const bodyEl = document.getElementById("modal-body");

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
  backdrop.classList.add("hidden");
}

export function initNavigation(onSectionChange) {
  const navItems = document.querySelectorAll(".nav-item");
  const sections = document.querySelectorAll(".view-section");

  navItems.forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.getAttribute("data-target");
      if (!targetId) return;

      navItems.forEach((n) => n.classList.remove("active"));
      btn.classList.add("active");

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

  document.getElementById("modal-close-btn")?.addEventListener("click", closeModal);
  document.getElementById("modal-backdrop")?.addEventListener("click", (e) => {
    if (e.target.id === "modal-backdrop") closeModal();
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
        if (typeof onLanguageChanged === "function") onLanguageChanged(lang.code);
      } else {
        setLanguage("en");
        closeModal();
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
