import { t, getLang } from "../language/i18n.js";
import { showToast, showOnlyPanel } from "./ui.js";

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

function resolveAdvertiserId(apiService, ctxObj) {
  if (ctxObj && ctxObj.userId) {
    return String(ctxObj.userId);
  }
  if (apiService) {
    if (typeof apiService.getCurrentUserId === "function") {
      return apiService.getCurrentUserId();
    }
    if (apiService.userId || apiService.advertiserId) {
      return String(apiService.userId ?? apiService.advertiserId);
    }
  }
  try {
    const uidInput = document.getElementById("activeUserIdInput")?.value?.trim();
    if (uidInput) return uidInput;
    const saved = localStorage.getItem("telega_ads_uid")?.trim();
    if (saved) return saved;
  } catch {
    // تجاهل أخطاء الوصول إلى DOM أو localStorage
  }
  return null;
}

export function initCampaignsModule(apiServiceOrCtx) {
  const isContextObj =
    apiServiceOrCtx &&
    typeof apiServiceOrCtx === "object" &&
    "api" in apiServiceOrCtx &&
    !("getCampaigns" in apiServiceOrCtx);

  const apiService = isContextObj ? apiServiceOrCtx.api : apiServiceOrCtx;
  const ctxObj = isContextObj ? apiServiceOrCtx : null;

  let uploadedMedia = { mediaUrl: "", mediaType: "none" };
  let verifiedChannelsCache = [];
  let onlyFavorites = false;

  const toggleBtn =
    document.querySelector('[data-action="toggle-create-campaign"]') ||
    document.getElementById("btn-open-create-campaign");
  const openMyCampaignsBtn = document.getElementById("btn-open-my-campaigns");
  const openVerifiedBtn = document.getElementById("btn-open-verified-channels");
  const openLogsBtn = document.getElementById("btn-open-publish-logs");

  const panel = document.getElementById("create-campaign-panel");
  const submitBtn =
    document.getElementById("submit-campaign-btn") ||
    document.getElementById("btn-launch-campaign");
  const saveDraftBtn = document.getElementById("btn-save-draft");

  const titleInput =
    document.getElementById("ad-title-input") ||
    document.getElementById("campaign-title");
  const contentInput =
    document.getElementById("ad-content-input") ||
    document.getElementById("campaign-text");
  const budgetInput =
    document.getElementById("ad-budget-input") ||
    document.getElementById("campaign-budget");

  const mediaInput = document.getElementById("campaign-media-file");
  const btnPreset = document.getElementById("campaign-btn-preset");
  const btnCustom = document.getElementById("campaign-btn-custom");
  const btnUrl = document.getElementById("campaign-btn-url");
  const openTargetCheckbox = document.getElementById("campaign-open-targeting");
  const previewBox = document.getElementById("campaign-live-preview");

  const listContainer = document.getElementById("campaigns-list");
  const myCampaignsListEl = document.getElementById("my-campaigns-list");

  const panelsGroupSelector = document.getElementById("section-promotion")
    ? "#section-promotion .collapsible-panel"
    : "#section-campaigns .collapsible-panel";

  function getSelectedButtonLabel() {
    if (!btnPreset) return "Open";
    if (btnPreset.value === "custom") {
      return (btnCustom?.value || "").trim() || "Open";
    }
    return btnPreset.value;
  }

  function updateLivePreview() {
    if (!previewBox) return;
    const bodyText = contentInput?.value || "...";
    const btnLabel = getSelectedButtonLabel();
    const mediaNote =
      uploadedMedia.mediaType !== "none" ? `\n[مرفق: ${uploadedMedia.mediaType}]` : "";

    previewBox.textContent =
      `${bodyText}${mediaNote}\n\n` +
      `— — —\n` +
      `Powered by Telega.ads (رابط إحالة الناشر)\n` +
      `[ زر تفاعلي: ${btnLabel} ]`;
  }

  function syncOpenTargetingAvailability() {
    const budgetVal = Number(budgetInput?.value || 0);
    const standardBox = document.getElementById("standard-targeting-box");
    if (budgetVal <= 1000 && openTargetCheckbox) {
      openTargetCheckbox.checked = false;
      openTargetCheckbox.disabled = true;
    } else if (openTargetCheckbox) {
      openTargetCheckbox.disabled = false;
    }

    if (standardBox) {
      standardBox.classList.toggle("hidden", Boolean(openTargetCheckbox?.checked));
    }
  }

  function collectCampaignForm(saveAsDraft = false) {
    const title = titleInput?.value?.trim() || "";
    const adText = contentInput?.value?.trim() || "";
    const budget = Number(budgetInput?.value || 0);
    const openTargeting = Boolean(openTargetCheckbox?.checked && budget > 1000);
    const minPrice = Number(document.getElementById("target-min-price")?.value || 1);
    const maxPrice = Number(document.getElementById("target-max-price")?.value || 3);
    const langVal = document.getElementById("target-language")?.value || "all";
    const catVal = document.getElementById("target-category")?.value || "all";
    const buttonText = getSelectedButtonLabel();
    const buttonUrl = btnUrl?.value?.trim() || "";
    const scheduleType = document.getElementById("campaign-schedule")?.value || "immediate";
    const advertiserId = resolveAdvertiserId(apiService, ctxObj);

    return {
      ...(advertiserId ? { advertiserId, userId: advertiserId } : {}),
      title,
      content: adText,
      adText,
      mediaUrl: uploadedMedia.mediaUrl,
      mediaType: uploadedMedia.mediaType,
      buttonText,
      buttonUrl,
      budget,
      budgetUsd: budget,
      scheduleType,
      saveAsDraft,
      targeting: {
        minPrice,
        maxPrice,
        languages: langVal && langVal !== "all" ? [langVal] : [],
        categories: catVal && catVal !== "all" ? [catVal] : [],
        openTargeting
      }
    };
  }

  function resetCampaignForm() {
    if (titleInput) titleInput.value = "";
    if (contentInput) contentInput.value = "";
    if (budgetInput) budgetInput.value = "";
    if (mediaInput) mediaInput.value = "";
    const statusEl = document.getElementById("campaign-media-status");
    if (statusEl) statusEl.textContent = "";
    uploadedMedia = { mediaUrl: "", mediaType: "none" };
    syncOpenTargetingAvailability();
    updateLivePreview();
  }

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
          const rawBudget = cp?.budgetUsd ?? cp?.budget ?? cp?.totalBudget ?? 0;
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

  async function renderMyCampaigns() {
    const userId = resolveAdvertiserId(apiService, ctxObj);
    if (!myCampaignsListEl || !userId || typeof apiService?.getMyCampaigns !== "function") return;

    try {
      const { campaigns } = await apiService.getMyCampaigns(userId);
      if (!campaigns || !campaigns.length) {
        myCampaignsListEl.innerHTML = '<div class="item-card"><p class="hint-text">لا توجد حملات بعد.</p></div>';
        return;
      }

      myCampaignsListEl.innerHTML = campaigns
        .map((c) => {
          const statusMap = {
            active: safeTranslate("statusActive", "Active"),
            paused: safeTranslate("statusPaused", "Paused"),
            scheduled: safeTranslate("statusScheduled", "Scheduled"),
            draft: safeTranslate("statusDraft", "Draft")
          };
          const statusLabel = escapeHtml(statusMap[c?.status] || c?.status || "");
          const safeStatusClass = escapeHtml(c?.status || "");
          const safeTitle = escapeHtml(c?.title || "");
          const safeId = escapeHtml(c?.id || "");
          const canResume = c?.status === "paused" || c?.status === "draft";

          return `
            <div class="item-card">
              <div class="item-header">
                <strong>${safeTitle}</strong>
                <span class="status-pill status-${safeStatusClass}">${statusLabel}</span>
              </div>
              <p class="hint-text">المشاهدات: ${Number(c?.stats?.totalViews || 0)} | القنوات المنشورة: ${Number(c?.stats?.channelsPublished || 0)}</p>
              <p class="hint-text">الميزانية المتبقية: $${Number(c?.remainingBudget || 0).toFixed(2)} / $${Number(c?.totalBudget || 0).toFixed(2)}</p>
              ${
                canResume
                  ? `
                    <div class="row-gap mt-8">
                      <input id="topup-${safeId}" type="number" min="0" step="1" placeholder="شحن ميزانية ($)" class="input-field" />
                      <button class="primary-btn btn-resume-campaign" data-id="${safeId}" type="button">استئناف (Resume)</button>
                    </div>
                  `
                  : ""
              }
            </div>
          `;
        })
        .join("");

      myCampaignsListEl.querySelectorAll(".btn-resume-campaign").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const id = btn.getAttribute("data-id") || "";
          const addBudget = Number(document.getElementById(`topup-${id}`)?.value || 0);
          if (typeof apiService?.resumeCampaign !== "function") return;
          try {
            await apiService.resumeCampaign(id, userId, addBudget);
            showToast("تم استئناف الحملة وإعادة النشر");
            await renderMyCampaigns();
          } catch (err) {
            showToast(err?.message || "تعذر استئناف الحملة");
          }
        });
      });
    } catch (err) {
      showToast(err?.message || "تعذر تحميل الحملات");
    }
  }

  function renderVerifiedChannelsList() {
    const listEl = document.getElementById("verified-channels-list");
    if (!listEl) return;
    const userId = resolveAdvertiserId(apiService, ctxObj);
    const favs = Array.isArray(ctxObj?.user?.favoriteChannels) ? ctxObj.user.favoriteChannels : [];
    const lang = typeof getLang === "function" ? getLang() : "ar";
    const fallbackAvatar =
      'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44"><rect width="44" height="44" fill="%23dbeafe"/></svg>';

    const filtered = verifiedChannelsCache.filter((ch) => {
      if (onlyFavorites && !favs.includes(ch?.id)) return false;
      return true;
    });

    if (!filtered.length) {
      listEl.innerHTML = '<div class="item-card"><p class="hint-text">لا توجد قنوات مطابقة.</p></div>';
      return;
    }

    listEl.innerHTML = filtered
      .map((ch) => {
        const safeId = escapeHtml(ch?.id ?? "");
        const safeTitle = escapeHtml(ch?.title || ch?.username || "");
        const isFav = favs.includes(ch?.id);
        const catObj = (window.__TELEGA_META__?.categories || []).find((x) => x.id === ch?.category);
        const catText = escapeHtml(catObj ? (lang === "ar" ? catObj.ar : catObj.en) : ch?.category || "");
        const avatar = escapeHtml(ch?.photoUrl || fallbackAvatar);
        const safeLang = escapeHtml(ch?.language || "");
        const subscribers = Number(ch?.subscribers || 0);
        const cpmPrice = Number(ch?.cpmPrice || 0);

        return `
          <div class="item-card">
            <div class="item-header">
              <img src="${avatar}" alt="${safeTitle}" class="channel-avatar" />
              <div>
                <strong>${safeTitle}</strong>
                <p class="hint-text">${subscribers} مشترك | $${cpmPrice} / 1000 مشاهدة</p>
              </div>
            </div>
            <p class="hint-text">اللغة: ${safeLang} | التصنيف: ${catText}</p>
            <div class="row-gap mt-8">
              <button class="ghost-btn btn-fav-channel" data-id="${safeId}" type="button">
                ${isFav ? "⭐ في المفضلة" : "☆ للمفضلة"}
              </button>
              <button class="primary-btn btn-publish-here" data-id="${safeId}" type="button">
                نشر هنا
              </button>
            </div>
          </div>
        `;
      })
      .join("");

    listEl.querySelectorAll(".btn-fav-channel").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const channelId = btn.getAttribute("data-id") || "";
        if (typeof apiService?.toggleFavoriteChannel !== "function" || !userId) return;
        try {
          const res = await apiService.toggleFavoriteChannel(userId, channelId);
          if (ctxObj?.user) {
            ctxObj.user.favoriteChannels = res?.favoriteChannels || [];
          }
          renderVerifiedChannelsList();
        } catch (err) {
          showToast(err?.message || "تعذر تحديث المفضلة");
        }
      });
    });

    listEl.querySelectorAll(".btn-publish-here").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const channelId = btn.getAttribute("data-id") || "";
        const payload = collectCampaignForm(false);
        payload.targeting.specificChannelIds = [channelId];
        try {
          if (typeof apiService?.createCampaign === "function") {
            await apiService.createCampaign(payload);
          } else {
            await createCampaign(payload.userId, payload.title, payload.budgetUsd, payload);
          }
          showToast("تم إرسال الإعلان للنشر في القناة المحددة");
          await loadCampaigns();
        } catch (err) {
          showToast("يرجى تعبئة بيانات الحملة والميزانية أولاً: " + (err?.message || ""));
        }
      });
    });
  }

  async function fetchAndRenderVerifiedChannels() {
    if (typeof apiService?.getVerifiedChannels !== "function") return;
    const search = document.getElementById("search-verified-channels")?.value || "";
    try {
      const { channels } = await apiService.getVerifiedChannels({ search });
      verifiedChannelsCache = Array.isArray(channels) ? channels : [];
      renderVerifiedChannelsList();
    } catch (err) {
      showToast(err?.message || "تعذر تحميل القنوات المعتمدة");
    }
  }

  async function renderPublishLogs() {
    const listEl = document.getElementById("publish-logs-list");
    if (!listEl || typeof apiService?.getPublishLogs !== "function") return;
    const userId = resolveAdvertiserId(apiService, ctxObj);
    try {
      const { logs } = await apiService.getPublishLogs(userId);
      if (!logs || !logs.length) {
        listEl.innerHTML = '<div class="item-card"><p class="hint-text">لا توجد عمليات نشر مسجلة.</p></div>';
        return;
      }

      listEl.innerHTML = logs
        .map(
          (l) => `
          <div class="item-card">
            <strong>مشاهدات محتسبة: ${Number(l?.countedViews || 0)}</strong>
            <p class="hint-text">المبلغ المسوى: $${Number(l?.settledAmount || 0).toFixed(2)}</p>
          </div>
        `
        )
        .join("");
    } catch (err) {
      showToast(err?.message || "تعذر تحميل سجل النشر");
    }
  }

  btnPreset?.addEventListener("change", () => {
    btnCustom?.classList.toggle("hidden", btnPreset.value !== "custom");
    updateLivePreview();
  });

  btnCustom?.addEventListener("input", updateLivePreview);
  contentInput?.addEventListener("input", updateLivePreview);
  budgetInput?.addEventListener("input", syncOpenTargetingAvailability);
  openTargetCheckbox?.addEventListener("change", syncOpenTargetingAvailability);

  mediaInput?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file || typeof apiService?.uploadMedia !== "function") return;
    const statusEl = document.getElementById("campaign-media-status");
    try {
      if (statusEl) statusEl.textContent = "جاري رفع الملف...";
      const res = await apiService.uploadMedia(file);
      uploadedMedia = { mediaUrl: res?.mediaUrl || "", mediaType: res?.mediaType || "none" };
      if (statusEl) {
        statusEl.textContent = `تم إرفاق ${res?.mediaType === "video" ? "فيديو" : "صورة"}`;
      }
      updateLivePreview();
    } catch (err) {
      if (statusEl) statusEl.textContent = "";
      showToast(err?.message || "تعذر رفع الملف");
    }
  });

  if (toggleBtn && !toggleBtn.dataset.campaignToggleBound) {
    toggleBtn.dataset.campaignToggleBound = "true";
    toggleBtn.addEventListener("click", () => {
      if (panel && document.querySelector(panelsGroupSelector)) {
        showOnlyPanel("create-campaign-panel", panelsGroupSelector);
      } else {
        panel?.classList.toggle("hidden");
      }
      syncOpenTargetingAvailability();
      updateLivePreview();
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
        const payload = collectCampaignForm(false);

        if (apiService && typeof apiService.createCampaign === "function") {
          await apiService.createCampaign(payload);
        } else {
          await createCampaign(payload.userId, title, budget, payload);
        }

        resetCampaignForm();
        panel?.classList.add("hidden");
        showToast(btnPreset || mediaInput || openTargetCheckbox ? "تم إطلاق الحملة بنجاح" : "✓");
        await loadCampaigns();
      } catch (err) {
        showToast(err?.message || "Error");
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

  if (saveDraftBtn && !saveDraftBtn.dataset.campaignDraftBound) {
    saveDraftBtn.dataset.campaignDraftBound = "true";
    saveDraftBtn.addEventListener("click", async () => {
      try {
        const payload = collectCampaignForm(true);
        if (apiService && typeof apiService.createCampaign === "function") {
          await apiService.createCampaign(payload);
        } else {
          await createCampaign(payload.userId, payload.title, payload.budgetUsd, payload);
        }
        showToast("تم حفظ الحملة كمسودة");
        await loadCampaigns();
      } catch (err) {
        showToast(err?.message || "تعذر حفظ المسودة");
      }
    });
  }

  openMyCampaignsBtn?.addEventListener("click", async () => {
    showOnlyPanel("my-campaigns-panel", panelsGroupSelector);
    await renderMyCampaigns();
  });

  openVerifiedBtn?.addEventListener("click", async () => {
    showOnlyPanel("verified-channels-panel", panelsGroupSelector);
    await fetchAndRenderVerifiedChannels();
  });

  openLogsBtn?.addEventListener("click", async () => {
    showOnlyPanel("publish-logs-panel", panelsGroupSelector);
    await renderPublishLogs();
  });

  document.getElementById("search-verified-channels")?.addEventListener("input", () => {
    fetchAndRenderVerifiedChannels();
  });

  document.getElementById("btn-filter-all-channels")?.addEventListener("click", (e) => {
    onlyFavorites = false;
    e.target.classList.add("active");
    document.getElementById("btn-filter-fav-channels")?.classList.remove("active");
    renderVerifiedChannelsList();
  });

  document.getElementById("btn-filter-fav-channels")?.addEventListener("click", (e) => {
    onlyFavorites = true;
    e.target.classList.add("active");
    document.getElementById("btn-filter-all-channels")?.classList.remove("active");
    renderVerifiedChannelsList();
  });

  syncOpenTargetingAvailability();
  updateLivePreview();

  return {
    loadCampaigns,
    createCampaign,
    settleCampaignBudget,
  };
}
