import { t } from "../language/i18n.js";
import { showToast } from "./ui.js";

export function initWalletAndReferralModule(userInternalId, botUsername) {
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
}
