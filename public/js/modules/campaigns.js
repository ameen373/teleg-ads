import { t } from "../language/i18n.js";
import { showToast } from "./ui.js";

async function postCampaignJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data;
}

export async function createCampaign(advertiserId, title, budgetUsd, extraPayload = {}) {
  return postCampaignJson("/api/campaigns/create", {
    userId: advertiserId,
    title,
    budgetUsd,
    ...extraPayload,
  });
}

export async function settleCampaignBudget(campaignId, spentUsd) {
  return postCampaignJson(`/api/campaigns/${encodeURIComponent(campaignId)}/settle`, {
    spentUsd,
  });
}

function resolveAdvertiserId(apiService) {
  if (!apiService) return null;
  if (typeof apiService.getCurrentUserId === "function") {
    return apiService.getCurrentUserId();
  }
  return apiService.userId ?? apiService.advertiserId ?? null;
}

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
    if (!titleInput || !contentInput || !budgetInput) return;

    const title = titleInput.value.trim();
    const content = contentInput.value.trim();
    const budget = parseFloat(budgetInput.value);
    if (!title || !content || Number.isNaN(budget) || budget <= 0) return;

    submitBtn.disabled = true;
    try {
      const advertiserId = resolveAdvertiserId(apiService);
      await createCampaign(advertiserId, title, budget, { content });

      titleInput.value = "";
      contentInput.value = "";
      budgetInput.value = "";
      panel?.classList.add("hidden");
      showToast("✓");
      await loadCampaigns();
    } catch (err) {
      showToast(err?.message || "Error");
    } finally {
      submitBtn.disabled = false;
    }
  });

  async function loadCampaigns() {
    if (!listContainer) return;
    try {
      const res = await apiService.getCampaigns();
      const campaigns = Array.isArray(res?.campaigns) ? res.campaigns : [];

      if (campaigns.length === 0) {
        listContainer.innerHTML = `<div class="glass-panel data-card"><span style="color:var(--text-muted)">${t("empty_campaigns")}</span></div>`;
        return;
      }

      listContainer.innerHTML = campaigns
        .map((cp) => {
          const displayBudget = cp.budgetUsd ?? cp.budget ?? 0;
          return `
          <div class="glass-panel data-card">
            <div>
              <strong>${cp.title}</strong>
              <div style="font-size:0.8rem;color:var(--text-muted)">$${displayBudget} USDT</div>
            </div>
            <span style="color:var(--accent-primary);font-weight:700">${cp.status || "Running"}</span>
          </div>`;
        })
        .join("");
    } catch {
      listContainer.innerHTML = `<div class="glass-panel data-card"><span style="color:var(--text-muted)">${t("empty_campaigns")}</span></div>`;
    }
  }

  return {
    loadCampaigns,
    createCampaign,
    settleCampaignBudget,
  };
}
