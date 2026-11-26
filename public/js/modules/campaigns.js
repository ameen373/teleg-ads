import { api } from "./api.js";
import { t } from "../language/i18n.js";
import {
  showToast,
  formatCurrency,
  escapeHtml,
  getWalletState,
  loadWalletAndReferrals,
  WALLET_UI_CONSTANTS
} from "./ui.js";

let boundCampaignEvents = false;
let activeApiService = null;
let activeUserIdResolver = null;
let activeRefreshCallback = null;

function resolveCurrentUserId(explicitUserId) {
  if (explicitUserId) return String(explicitUserId);
  if (typeof activeUserIdResolver === "function") {
    const resolved = activeUserIdResolver();
    if (resolved) return String(resolved);
  }
  const walletState = getWalletState?.();
  if (walletState?.wallet?.userId) {
    return String(walletState.wallet.userId);
  }
  try {
    const tgId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
    if (tgId) return String(tgId);
  } catch {
    // تجاهل في حال الفتح خارج تيليجرام
  }
  return "";
}

async function fetchCampaignsList(userId = "") {
  if (activeApiService && typeof activeApiService.getCampaigns === "function") {
    return activeApiService.getCampaigns(userId);
  }
  return api.getCampaigns(userId);
}

async function createCampaignRecord(payload) {
  if (activeApiService && typeof activeApiService.createCampaign === "function") {
    return activeApiService.createCampaign(payload);
  }
  return api.createCampaign(payload.advertiserId, payload.title, payload.totalBudget ?? payload.budget);
}

async function settleCampaignRecord(campaignId) {
  if (activeApiService && typeof activeApiService.settleCampaign === "function") {
    return activeApiService.settleCampaign(campaignId);
  }
  return api.settleCampaign(campaignId);
}

function renderWalletBalanceSummaryInCampaigns() {
  const summaryEl = document.getElementById("campaigns-wallet-summary");
  if (!summaryEl) return;

  const state = getWalletState?.();
  const wallet = state?.wallet || {};
  const availableBalance = Number(
    typeof wallet.availableBalance === "number" ? wallet.availableBalance : wallet.balance || 0
  );
  const totalSpent = Number(wallet.totalSpent || 0);
  const minWithdrawal = Number(
    state?.constants?.MIN_WITHDRAWAL ?? WALLET_UI_CONSTANTS.MIN_WITHDRAWAL
  );
  const withdrawalFee = Number(
    state?.constants?.WITHDRAWAL_FEE ?? WALLET_UI_CONSTANTS.WITHDRAWAL_FEE
  );

  summaryEl.innerHTML = `
    <div class="campaigns-wallet-strip">
      <span>الرصيد المتاح للحملات: <strong>${escapeHtml(formatCurrency(availableBalance))}</strong></span>
      <span>إجمالي المصروفات: <strong>${escapeHtml(formatCurrency(totalSpent))}</strong></span>
      <span>السحب (${escapeHtml(WALLET_UI_CONSTANTS.WITHDRAWAL_NETWORK)}): حد أدنى <strong>${escapeHtml(formatCurrency(minWithdrawal))}</strong> | رسوم <strong>${escapeHtml(formatCurrency(withdrawalFee))}</strong></span>
    </div>
  `;
}

export function renderCampaigns(campaigns = []) {
  const container = document.getElementById("campaigns-list");
  if (!container) return;

  renderWalletBalanceSummaryInCampaigns();

  if (!Array.isArray(campaigns) || campaigns.length === 0) {
    container.innerHTML = `<div class="glass-panel data-card"><span style="color:var(--text-muted)">${escapeHtml(t("empty_campaigns") || "لا توجد حملات إعلانية لهذا الحساب حالياً.")}</span></div>`;
    return;
  }

  container.innerHTML = campaigns
    .map((c) => {
      const totalBudget = Number(c.totalBudget ?? c.budget ?? 0);
      const spentBudget = Number(c.spentBudget || 0);
      const remaining = Math.max(0, Number((totalBudget - spentBudget).toFixed(2)));
      const isSettled = c.status === "settled" || Boolean(c.isSettled);
      const refunded = Number(c.remainingRefunded || 0);

      return `
      <div class="card glass-panel campaign-card" data-campaign-id="${escapeHtml(c.id || "")}">
        <div class="campaign-top">
          <h4>${escapeHtml(c.title || "")}</h4>
          <span class="badge ${isSettled ? "badge-completed" : "badge-approved"}">
            ${isSettled ? "تمت التسوية الآلية" : escapeHtml(c.status || "نشطة")}
          </span>
        </div>
        ${c.content ? `<div class="campaign-content sub-text">${escapeHtml(c.content)}</div>` : ""}
        <div class="campaign-metrics">
          <div>الميزانية الكلية: <strong>${escapeHtml(formatCurrency(totalBudget))}</strong></div>
          <div>المصروف الفعلي: <strong>${escapeHtml(formatCurrency(spentBudget))}</strong></div>
          <div>المتبقي: <strong>${escapeHtml(formatCurrency(isSettled ? 0 : remaining))}</strong></div>
          ${
            isSettled
              ? `<div class="text-success">المُعاد ذرياً للمعلن: <strong>${escapeHtml(formatCurrency(refunded))}</strong></div>`
              : ""
          }
        </div>
        ${
          !isSettled
            ? `
          <div class="campaign-actions">
            <button type="button" class="btn btn-warning btn-sm secondary-btn btn-settle-campaign" data-id="${escapeHtml(c.id || "")}">
              🔄 إنهاء الحملة وتسوية الميزانية المتبقية ذرياً
            </button>
          </div>
        `
            : ""
        }
      </div>
    `;
    })
    .join("");
}

export async function loadCampaigns(userId = "") {
  try {
    const targetUserId = resolveCurrentUserId(userId);
    const res = await fetchCampaignsList(targetUserId);
    const campaigns = Array.isArray(res?.campaigns) ? res.campaigns : [];
    renderCampaigns(campaigns);
    return campaigns;
  } catch (error) {
    showToast(error?.message || t("empty_campaigns") || "تعذر تحميل الحملات", "error");
    renderCampaigns([]);
    return [];
  }
}

export function initCampaignsEvents(getCurrentUserId, onRefreshCallback) {
  if (typeof getCurrentUserId === "function") {
    activeUserIdResolver = getCurrentUserId;
  }
  if (typeof onRefreshCallback === "function") {
    activeRefreshCallback = onRefreshCallback;
  }

  if (boundCampaignEvents) return;
  boundCampaignEvents = true;

  const notifyRefresh = async () => {
    try {
      const uid = resolveCurrentUserId();
      if (typeof activeRefreshCallback === "function") {
        await activeRefreshCallback();
      } else {
        await loadCampaigns(uid);
        if (uid) {
          await loadWalletAndReferrals(uid);
        }
      }
    } catch (err) {
      showToast(err?.message || "تعذر تحديث البيانات", "error");
    }
  };

  document.getElementById("form-create-campaign")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const userId = resolveCurrentUserId();
      const titleInput = document.getElementById("campaign-title");
      const budgetInput = document.getElementById("campaign-budget");
      const contentInput = document.getElementById("campaign-content");

      const title = titleInput ? titleInput.value.trim() : "";
      const budget = budgetInput ? Number(budgetInput.value) : NaN;
      const content = contentInput ? contentInput.value.trim() : title;

      if (!title || !Number.isFinite(budget) || budget <= 0) {
        showToast("يرجى إدخال عنوان وميزانية صحيحة للحملة", "error");
        return;
      }

      const res = await createCampaignRecord({
        advertiserId: userId,
        title,
        content,
        budget,
        totalBudget: budget
      });

      showToast(res?.message || "تم إنشاء الحملة وحجز الميزانية بنجاح", "success");
      e.target.reset();
      await notifyRefresh();
    } catch (error) {
      showToast(error?.message || "تعذر إنشاء الحملة", "error");
    }
  });

  document.getElementById("campaigns-list")?.addEventListener("click", async (e) => {
    const btn = e.target.closest(".btn-settle-campaign");
    if (!btn) return;
    const campaignId = btn.getAttribute("data-id");
    if (!campaignId) return;

    try {
      btn.disabled = true;
      const res = await settleCampaignRecord(campaignId);
      showToast(res?.message || "تمت تسوية الحملة ذرياً بنجاح", "success");
      await notifyRefresh();
    } catch (error) {
      btn.disabled = false;
      showToast(error?.message || "تعذر تسوية الحملة", "error");
    }
  });
}

export function initCampaignsModule(apiService) {
  if (apiService) {
    activeApiService = apiService;
  }

  const toggleBtn = document.querySelector('[data-action="toggle-create-campaign"]');
  const panel = document.getElementById("create-campaign-panel");
  const submitBtn = document.getElementById("submit-campaign-btn");
  const titleInput = document.getElementById("ad-title-input");
  const contentInput = document.getElementById("ad-content-input");
  const budgetInput = document.getElementById("ad-budget-input");

  initCampaignsEvents(
    () => resolveCurrentUserId(),
    async () => {
      await loadCampaigns(resolveCurrentUserId());
    }
  );

  toggleBtn?.addEventListener("click", () => {
    panel?.classList.toggle("hidden");
    renderWalletBalanceSummaryInCampaigns();
  });

  submitBtn?.addEventListener("click", async () => {
    try {
      const title = titleInput ? titleInput.value.trim() : "";
      const content = contentInput ? contentInput.value.trim() : "";
      const budget = budgetInput ? parseFloat(budgetInput.value) : NaN;

      if (!title || !content || Number.isNaN(budget) || budget <= 0) {
        showToast("يرجى إدخال عنوان ومحتوى وميزانية صحيحة للحملة", "error");
        return;
      }

      submitBtn.disabled = true;
      const advertiserId = resolveCurrentUserId();
      await createCampaignRecord({
        ...(advertiserId ? { advertiserId } : {}),
        title,
        content,
        budget,
        totalBudget: budget
      });

      if (titleInput) titleInput.value = "";
      if (contentInput) contentInput.value = "";
      if (budgetInput) budgetInput.value = "";
      panel?.classList.add("hidden");

      showToast("✓", "success");
      await loadCampaigns(advertiserId);
      if (advertiserId) {
        await loadWalletAndReferrals(advertiserId);
      }
    } catch (err) {
      showToast(err?.message || "تعذر إنشاء الحملة", "error");
    } finally {
      submitBtn.disabled = false;
    }
  });

  return {
    loadCampaigns: (userId = "") => loadCampaigns(userId),
    renderCampaigns
  };
}
