import { t } from "../language/i18n.js";
import { showToast } from "./ui.js";

export function initCampaignsModule(apiService, onWalletChanged) {
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
      if (typeof onWalletChanged === "function") await onWalletChanged();
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
        .map((cp) => {
          const spent = Number(cp.spent || 0).toFixed(2);
          const total = Number(cp.budget || 0).toFixed(2);
          const isCompleted = cp.status === "Completed" || cp.settled === true;
          return `
            <div class="glass-panel data-card" style="flex-direction:column;align-items:stretch;gap:10px;">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <div>
                  <strong>${cp.title}</strong>
                  <div style="font-size:0.8rem;color:var(--text-muted)">$${spent} / $${total} USDT</div>
                </div>
                <span style="color:${isCompleted ? "var(--accent-secondary)" : "var(--accent-primary)"};font-weight:700;">
                  ${isCompleted ? t("status_completed") : (cp.status || "Active")}
                </span>
              </div>
              ${
                !isCompleted
                  ? `<button class="secondary-btn settle-campaign-btn" data-campaign-id="${cp.id}" style="padding:8px 12px;font-size:0.82rem;">
                      ${t("btn_settle_campaign")}
                    </button>`
                  : `<div style="font-size:0.78rem;color:var(--accent-secondary);">
                      ${t("campaign_refunded_label")}: $${Number(cp.refundedAmount || 0).toFixed(2)} USDT
                    </div>`
              }
            </div>
          `;
        })
        .join("");

      listContainer.querySelectorAll(".settle-campaign-btn").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const cid = btn.getAttribute("data-campaign-id");
          if (!cid) return;
          btn.disabled = true;
          try {
            const settled = await apiService.completeCampaign(cid);
            showToast(`${t("campaign_settled_toast")} (+$${Number(settled.refundedAmount || 0).toFixed(2)})`);
            await loadCampaigns();
            if (typeof onWalletChanged === "function") await onWalletChanged();
          } catch (err) {
            showToast(err.message);
            btn.disabled = false;
          }
        });
      });
    } catch {
      listContainer.innerHTML = `<div class="glass-panel data-card"><span style="color:var(--text-muted)">${t("empty_campaigns")}</span></div>`;
    }
  }

  return { loadCampaigns };
}
