import { t } from "../language/i18n.js";
import { showToast } from "./ui.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderCampaignsList(listContainer, campaigns) {
  if (!listContainer) return;

  if (!Array.isArray(campaigns) || campaigns.length === 0) {
    listContainer.innerHTML = `<div class="glass-panel data-card"><span style="color:var(--text-muted)">${escapeHtml(t("empty_campaigns"))}</span></div>`;
    return;
  }

  listContainer.innerHTML = campaigns
    .map((cp) => {
      const title = escapeHtml(cp.title || "");
      const budget = Number(cp.budget || 0).toFixed(2);
      const status = escapeHtml(cp.status || "Running");
      return `
        <div class="glass-panel data-card">
          <div>
            <strong>${title}</strong>
            <div style="font-size:0.8rem;color:var(--text-muted)">$${budget} USDT</div>
          </div>
          <span style="color:var(--accent-primary);font-weight:700">${status}</span>
        </div>
      `;
    })
    .join("");
}

export function initCampaignsModule(apiService) {
  const toggleBtn =
    document.querySelector('[data-action="toggle-create-campaign"]') ||
    document.getElementById("btn-open-create-campaign");
  const panel =
    document.getElementById("create-campaign-panel") ||
    document.getElementById("panel-campaign-wizard");
  const submitBtn =
    document.getElementById("submit-campaign-btn") ||
    document.getElementById("btn-camp-publish");
  const titleInput =
    document.getElementById("ad-title-input") ||
    document.getElementById("camp-title") ||
    document.getElementById("campaignTitleInput");
  const contentInput =
    document.getElementById("ad-content-input") ||
    document.getElementById("camp-text");
  const budgetInput =
    document.getElementById("ad-budget-input") ||
    document.getElementById("camp-budget") ||
    document.getElementById("campaignBudgetInput");
  const listContainer =
    document.getElementById("campaigns-list") ||
    document.getElementById("campaignsList");

  toggleBtn?.addEventListener("click", () => {
    panel?.classList.toggle("hidden");
  });

  async function handleCreateCampaign(e) {
    if (e && typeof e.preventDefault === "function") {
      e.preventDefault();
    }

    const title = (titleInput?.value || "").trim();
    const content = (contentInput?.value || "").trim();
    const budget = parseFloat(budgetInput?.value);

    if (!title || isNaN(budget) || budget <= 0) {
      showToast(t("msg_fill_required"));
      return;
    }

    if (submitBtn) submitBtn.disabled = true;
    try {
      await apiService.createCampaign({ title, content, budget });
      if (titleInput) titleInput.value = "";
      if (contentInput) contentInput.value = "";
      if (budgetInput) budgetInput.value = "";
      panel?.classList.add("hidden");
      showToast("✓");
      await loadCampaigns();
    } catch (err) {
      showToast(err.message);
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  submitBtn?.addEventListener("click", handleCreateCampaign);

  async function loadCampaigns() {
    if (!listContainer) return;
    try {
      const res = await apiService.getCampaigns();
      const campaigns = res?.campaigns || res?.data || [];
      renderCampaignsList(listContainer, campaigns);
    } catch {
      renderCampaignsList(listContainer, []);
    }
  }

  return { loadCampaigns };
}
