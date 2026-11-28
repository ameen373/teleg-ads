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

function safeTranslate(key, fallback = "") {
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

function getErrorMessage(err) {
  if (!err) return safeTranslate("error_generic", "Error");
  if (typeof err === "string") return err;
  if (typeof err.message === "string" && err.message.trim() !== "") {
    return err.message;
  }
  return safeTranslate("error_generic", "Error");
}

function getStatusBadge(status) {
  const map = {
    approved: { label: safeTranslate("statusApproved", "Approved"), cls: "status-approved" },
    pending_admin: { label: safeTranslate("statusPendingAdmin", "Pending Admin"), cls: "status-pending_admin" },
    awaiting_setup: { label: safeTranslate("statusAwaitingSetup", "Awaiting Setup"), cls: "status-awaiting_setup" },
    permission_lost: { label: safeTranslate("statusPermissionLost", "Bot Permission Lost"), cls: "status-permission_lost" },
    rejected: { label: safeTranslate("statusRejected", "Rejected"), cls: "status-rejected" }
  };
  return map[status] || { label: String(status || "Active"), cls: "status-pending_admin" };
}

function getCategoryLabel(categoryId) {
  const lang = typeof getLang === "function" ? getLang() : "ar";
  const found = (window.__TELEGA_META__?.categories || []).find((c) => c.id === categoryId);
  if (!found) return String(categoryId ?? "");
  return lang === "ar" ? found.ar : found.en;
}

let latestChannelsState = {
  channels: [],
};

export function getActiveChannelsState() {
  return {
    channels: [...latestChannelsState.channels],
  };
}

export function initChannelsModule(apiServiceOrCtx) {
  const isContextObj =
    apiServiceOrCtx &&
    typeof apiServiceOrCtx === "object" &&
    "api" in apiServiceOrCtx &&
    !("getChannels" in apiServiceOrCtx);

  const apiService = isContextObj ? apiServiceOrCtx.api : apiServiceOrCtx;

  const toggleBtn = document.querySelector('[data-action="toggle-add-channel"]') || document.getElementById("btn-open-add-channel");
  const toggleListBtn = document.getElementById("btn-toggle-my-channels");
  const refreshDetectedBtn = document.getElementById("btn-refresh-detected");
  const submitConfigBtn = document.getElementById("btn-submit-channel-config");
  const submitBtn = document.getElementById("submit-channel-btn");
  const input = document.getElementById("channel-input");
  const panel = document.getElementById("add-channel-panel");
  const listContainer = document.getElementById("channels-list");
  const myChannelsListEl = document.getElementById("my-channels-list");

  const moduleState = {
    channels: [],
  };
  latestChannelsState = moduleState;

  function resolveUserId() {
    if (isContextObj && apiServiceOrCtx.userId) {
      return String(apiServiceOrCtx.userId);
    }
    try {
      const uidInput = document.getElementById("activeUserIdInput")?.value?.trim();
      if (uidInput) return uidInput;
      const saved = localStorage.getItem("telega_ads_uid")?.trim();
      if (saved) return saved;
    } catch {
      // تجاهل أخطاء الوصول إلى DOM أو localStorage
    }
    return "";
  }

  function renderEmptyState() {
    if (!listContainer) return;
    const emptyText = escapeHtml(safeTranslate("empty_channels", "No channels"));
    listContainer.innerHTML = `<div class="glass-panel data-card"><span style="color:var(--text-muted)">${emptyText}</span></div>`;
  }

  function renderMyChannelsList() {
    if (!myChannelsListEl) return;

    if (!moduleState.channels.length) {
      myChannelsListEl.innerHTML = `<div class="item-card"><p class="hint-text">${escapeHtml(
        safeTranslate("empty_channels", "لا توجد قنوات مسجلة بعد.")
      )}</p></div>`;
      return;
    }

    const fallbackAvatar =
      'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44"><rect width="44" height="44" fill="%23dbeafe"/></svg>';

    myChannelsListEl.innerHTML = moduleState.channels
      .map((ch) => {
        const badge = getStatusBadge(ch?.status);
        const title = escapeHtml(ch?.title || ch?.username || "");
        const avatar = escapeHtml(ch?.photoUrl || fallbackAvatar);
        const subscribers = Number.isFinite(Number(ch?.subscribers)) ? Number(ch.subscribers) : 0;
        const cpmPrice = Number.isFinite(Number(ch?.cpmPrice)) ? Number(ch.cpmPrice) : 0;
        const lang = escapeHtml(ch?.language || "");
        const category = escapeHtml(getCategoryLabel(ch?.category));
        const views = Number.isFinite(Number(ch?.totalViewsDelivered)) ? Number(ch.totalViewsDelivered) : 0;
        const earned = Number.isFinite(Number(ch?.totalEarned)) ? Number(ch.totalEarned).toFixed(2) : "0.00";

        return `
          <div class="item-card">
            <div class="item-header">
              <img src="${avatar}" alt="${title}" class="channel-avatar" />
              <div>
                <strong>${title}</strong>
                <div><span class="status-pill ${badge.cls}">${escapeHtml(badge.label)}</span></div>
              </div>
            </div>
            <p class="hint-text">المشتركون: ${subscribers} | السعر لكل 1000 مشاهدة: $${cpmPrice}</p>
            <p class="hint-text">اللغة: ${lang} | التصنيف: ${category}</p>
            <p class="hint-text">المشاهدات المحققة: ${views} | الأرباح: $${earned}</p>
          </div>
        `;
      })
      .join("");
  }

  async function loadDetectedChannels(selectElement) {
    const userId = resolveUserId();
    if (!selectElement) return;

    let fetched = [];
    if (typeof apiService?.getMyChannels === "function" && userId) {
      const res = await apiService.getMyChannels(userId);
      fetched = Array.isArray(res?.channels) ? res.channels : moduleState.channels;
    } else {
      fetched = moduleState.channels;
    }

    if (isContextObj) {
      apiServiceOrCtx.myChannels = fetched;
    }
    moduleState.channels = fetched;

    selectElement.innerHTML = "";
    if (!fetched.length) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "لم يتم رصد قناة بعد — أضف @adTelega_bot كمسؤول ثم اضغط تحديث";
      selectElement.appendChild(opt);
      return;
    }

    fetched.forEach((ch) => {
      const opt = document.createElement("option");
      opt.value = String(ch?.id ?? "");
      opt.textContent = `${ch?.title || ch?.username || ""} (${Number(ch?.subscribers) || 0} مشترك)`;
      selectElement.appendChild(opt);
    });
  }

  async function loadChannels() {
    if (typeof apiService?.getMyChannels === "function") {
      const userId = resolveUserId();
      if (userId) {
        try {
          const res = await apiService.getMyChannels(userId);
          if (Array.isArray(res?.channels)) {
            moduleState.channels = res.channels;
            if (isContextObj) {
              apiServiceOrCtx.myChannels = res.channels;
            }
            renderMyChannelsList();
          }
        } catch {
          // الانتقال إلى جلب القنوات العامة في حال عدم توفر getMyChannels للمستخدم
        }
      }
    }

    if (!listContainer) {
      return { channels: [...moduleState.channels] };
    }

    if (!apiService || typeof apiService.getChannels !== "function") {
      if (!moduleState.channels.length) {
        renderEmptyState();
      }
      return { channels: [...moduleState.channels] };
    }

    try {
      const res = await apiService.getChannels();
      const channels = Array.isArray(res?.channels) ? res.channels : moduleState.channels;
      moduleState.channels = channels;
      if (isContextObj) {
        apiServiceOrCtx.myChannels = channels;
      }

      if (channels.length === 0) {
        renderEmptyState();
        return { channels: [] };
      }

      listContainer.innerHTML = channels
        .map((ch) => {
          const title = escapeHtml(ch?.title || ch?.username || "");
          const subscribers = Number.isFinite(Number(ch?.subscribers))
            ? Number(ch.subscribers)
            : 0;
          const status = escapeHtml(ch?.status || "Active");

          return `
            <div class="glass-panel data-card">
              <div>
                <strong>${title}</strong>
                <div style="font-size:0.8rem;color:var(--text-muted)">${subscribers} subscribers</div>
              </div>
              <span style="color:var(--accent-secondary);font-weight:700">${status}</span>
            </div>`;
        })
        .join("");

      return { channels: [...moduleState.channels] };
    } catch {
      moduleState.channels = [];
      renderEmptyState();
      return { channels: [] };
    }
  }

  if (toggleBtn && !toggleBtn.dataset.channelToggleBound) {
    toggleBtn.dataset.channelToggleBound = "true";
    toggleBtn.addEventListener("click", async () => {
      if (panel && document.querySelector("#section-channels .collapsible-panel")) {
        showOnlyPanel("add-channel-panel", "#section-channels .collapsible-panel");
      } else {
        panel?.classList.toggle("hidden");
      }

      if (panel && !panel.classList.contains("hidden")) {
        const selectEl = document.getElementById("channel-select-detected");
        await loadDetectedChannels(selectEl).catch(() => {});
      }
    });
  }

  if (refreshDetectedBtn && !refreshDetectedBtn.dataset.channelRefreshBound) {
    refreshDetectedBtn.dataset.channelRefreshBound = "true";
    refreshDetectedBtn.addEventListener("click", async () => {
      const selectEl = document.getElementById("channel-select-detected");
      try {
        await loadDetectedChannels(selectEl);
        showToast("تم تحديث قائمة القنوات المرصودة");
      } catch (err) {
        showToast(getErrorMessage(err));
      }
    });
  }

  if (toggleListBtn && !toggleListBtn.dataset.channelListToggleBound) {
    toggleListBtn.dataset.channelListToggleBound = "true";
    toggleListBtn.addEventListener("click", async () => {
      if (document.querySelector("#section-channels .collapsible-panel")) {
        showOnlyPanel("my-channels-panel", "#section-channels .collapsible-panel");
      }
      const myPanel = document.getElementById("my-channels-panel");
      if (myPanel && !myPanel.classList.contains("hidden")) {
        const selectEl = document.getElementById("channel-select-detected");
        await loadDetectedChannels(selectEl).catch(() => {});
        renderMyChannelsList();
      }
    });
  }

  if (submitConfigBtn && !submitConfigBtn.dataset.channelConfigBound) {
    submitConfigBtn.dataset.channelConfigBound = "true";
    submitConfigBtn.addEventListener("click", async () => {
      const channelId = document.getElementById("channel-select-detected")?.value;
      const cpmPrice = Number(document.getElementById("channel-cpm-price")?.value);
      const language = document.getElementById("channel-language")?.value;
      const category = document.getElementById("channel-category")?.value;
      const ownerId = resolveUserId();

      if (!channelId) {
        showToast("يرجى اختيار قناة تم إضافة البوت إليها أولاً");
        return;
      }
      if (Number.isNaN(cpmPrice) || cpmPrice < 1 || cpmPrice > 3) {
        showToast("يجب أن يكون السعر بين 1$ و 3$");
        return;
      }
      if (!apiService || typeof apiService.configureChannel !== "function") {
        showToast(safeTranslate("error_generic", "Error"));
        return;
      }

      submitConfigBtn.disabled = true;
      try {
        const res = await apiService.configureChannel({
          channelId,
          ownerId,
          cpmPrice,
          language,
          category
        });
        showToast(
          res?.channel?.status === "approved"
            ? "تم قبول القناة تلقائياً ونشر إعلان المنصة المجاني"
            : "تم حفظ القناة وإرسالها للمراجعة"
        );
        await loadDetectedChannels(document.getElementById("channel-select-detected"));
        renderMyChannelsList();
      } catch (err) {
        showToast(getErrorMessage(err));
      } finally {
        submitConfigBtn.disabled = false;
      }
    });
  }

  if (submitBtn && !submitBtn.dataset.channelSubmitBound) {
    submitBtn.dataset.channelSubmitBound = "true";
    submitBtn.addEventListener("click", async () => {
      if (!input) return;
      const username = input.value.trim();
      if (!username) return;

      if (!apiService || typeof apiService.addChannel !== "function") {
        showToast(safeTranslate("error_generic", "Error"));
        return;
      }

      submitBtn.disabled = true;
      try {
        await apiService.addChannel(username);
        input.value = "";
        panel?.classList.add("hidden");
        showToast("✓");
        await loadChannels();
      } catch (err) {
        showToast(getErrorMessage(err));
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

  return {
    loadChannels,
    getActiveChannelsState: () => ({ channels: [...moduleState.channels] }),
  };
}
