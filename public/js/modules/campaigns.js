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

function safeTranslate(key, fallback = "No campaigns") {
  try {
    if (typeof t === "function") {
      const result = t(key);
      if (typeof result === "string" && result.trim() !== "") {
        return result;
      }
    }
  } catch {
    // تجاهل أخطاء الترجمة واستخدام القيمة الاحتياطية
  }
  return fallback;
}

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
  const payload = {
    ...(advertiserId ? { userId: advertiserId } : {}),
    title,
    budgetUsd,
    ...extraPayload,
  };
  return postCampaignJson("/api/campaigns/create", payload);
}

export async function settleCampaignBudget(campaignId, spentUsd) {
  return postCampaignJson(`/api/campaigns/${encodeURIComponent(String(campaignId ?? ""))}/settle`, {
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

  function renderEmptyState() {
    if (!listContainer) return;
    const emptyText = escapeHtml(safeTranslate("empty_campaigns", "No campaigns"));
    listContainer.innerHTML = `<div class="glass-panel data-card"><span style="color:var(--text-muted)">${emptyText}</span></div>`;
  }

  async function loadCampaigns() {
    if (!listContainer) return;

    if (!apiService || typeof apiService.getCampaigns !== "function") {
      renderEmptyState();
      return;
    }

    try {
      const res = await apiService.getCampaigns();
      const campaigns = Array.isArray(res?.campaigns) ? res.campaigns : [];

      if (campaigns.length === 0) {
        renderEmptyState();
        return;
      }

      listContainer.innerHTML = campaigns
        .map((cp) => {
          const rawBudget = cp?.budgetUsd ?? cp?.budget ?? 0;
          const numericBudget = Number(rawBudget);
          const displayBudget = Number.isFinite(numericBudget) ? numericBudget : 0;
          const safeTitle = escapeHtml(cp?.title ?? "");
          const safeStatus = escapeHtml(cp?.status || "Running");

          return `
          <div class="glass-panel data-card">
            <div>
              <strong>${safeTitle}</strong>
              <div style="font-size:0.8rem;color:var(--text-muted)">$${displayBudget} USDT</div>
            </div>
            <span style="color:var(--accent-primary);font-weight:700">${safeStatus}</span>
          </div>`;
        })
        .join("");
    } catch {
      renderEmptyState();
    }
  }

  if (toggleBtn && !toggleBtn.dataset.campaignToggleBound) {
    toggleBtn.dataset.campaignToggleBound = "true";
    toggleBtn.addEventListener("click", () => {
      panel?.classList.toggle("hidden");
    });
  }

  if (submitBtn && !submitBtn.dataset.campaignSubmitBound) {
    submitBtn.dataset.campaignSubmitBound = "true";
    submitBtn.addEventListener("click", async () => {
      if (!titleInput || !contentInput || !budgetInput) return;

      const title = titleInput.value.trim();
      const content = contentInput.value.trim();
      const budget = parseFloat(budgetInput.value);
      if (!title || !content || Number.isNaN(budget) || budget <= 0) return;

      submitBtn.disabled = true;
      try {
        const advertiserId = resolveAdvertiserId(apiService);

        if (apiService && typeof apiService.createCampaign === "function") {
          await apiService.createCampaign({
            title,
            content,
            budget,
            budgetUsd: budget,
            ...(advertiserId ? { userId: advertiserId } : {}),
          });
        } else {
          await createCampaign(advertiserId, title, budget, { content, budget });
        }

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
  }

  return {
    loadCampaigns,
    createCampaign,
    settleCampaignBudget,
  };
}
