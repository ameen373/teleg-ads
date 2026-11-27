import { t } from "../language/i18n.js";
import { showToast } from "./ui.js";

export function initCampaignsModule(apiService) {
  const toggleBtn = document.querySelector('[data-action="toggle-create-campaign"]');
  const panel = document.getElementById("create-campaign-panel");
  const submitBtn = document.getElementById("submit-campaign-btn");
  const titleInput = document.getElementById("ad-title-input");
  const contentInput = document.getElementById("ad-content-input");
  const budgetInput = document.getElementById("ad-budget-input");
  const listContainer = document.getElementById("campaigns-list");

  toggleBtn?.addEventListener("click", () => {
    panel?.classList.toggle("hidden");
  });

  submitBtn?.addEventListener("click", async () => {
    const title = titleInput.value.trim();
    const content = contentInput.value.trim();
    const budget = parseFloat(budgetInput.value);
    if (!title || !content || isNaN(budget) || budget <= 0) return;

    submitBtn.disabled = true;
    try {
      await apiService.createCampaign({ title, content, budget });
      titleInput.value = "";
      contentInput.value = "";
      budgetInput.value = "";
      panel.classList.add("hidden");
      showToast("✓");
      await loadCampaigns();
    } catch (err) {
      showToast(err.message);
    } finally {
      submitBtn.disabled = false;
    }
  });

  async function loadCampaigns() {
    if (!listContainer) return;
    try {
      const res = await apiService.getCampaigns();
      const campaigns = res.campaigns || [];
      if (campaigns.length === 0) {
        listContainer.innerHTML = `<div class="glass-panel data-card"><span style="color:var(--text-muted)">${t("empty_campaigns")}</span></div>`;
        return;
      }
      listContainer.innerHTML = campaigns
        .map(
          (cp) => `
          <div class="glass-panel data-card">
            <div>
              <strong>${cp.title}</strong>
              <div style="font-size:0.8rem;color:var(--text-muted)">$${cp.budget} USDT</div>
            </div>
            <span style="color:var(--accent-primary);font-weight:700">${cp.status || "Running"}</span>
          </div>`
        )
        .join("");
    } catch {
      listContainer.innerHTML = `<div class="glass-panel data-card"><span style="color:var(--text-muted)">${t("empty_campaigns")}</span></div>`;
    }
  }

  return { loadCampaigns };
}
