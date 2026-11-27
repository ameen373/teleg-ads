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

let latestChannelsState = {
  channels: [],
};

export function getActiveChannelsState() {
  return {
    channels: [...latestChannelsState.channels],
  };
}

export function initChannelsModule(apiService) {
  const toggleBtn = document.querySelector('[data-action="toggle-add-channel"]');
  const panel = document.getElementById("add-channel-panel");
  const submitBtn = document.getElementById("submit-channel-btn");
  const input = document.getElementById("channel-input");
  const listContainer = document.getElementById("channels-list");

  const moduleState = {
    channels: [],
  };
  latestChannelsState = moduleState;

  function renderEmptyState() {
    if (!listContainer) return;
    const emptyText = escapeHtml(safeTranslate("empty_channels", "No channels"));
    listContainer.innerHTML = `<div class="glass-panel data-card"><span style="color:var(--text-muted)">${emptyText}</span></div>`;
  }

  async function loadChannels() {
    if (!listContainer) {
      return { channels: [...moduleState.channels] };
    }

    if (!apiService || typeof apiService.getChannels !== "function") {
      moduleState.channels = [];
      renderEmptyState();
      return { channels: [] };
    }

    try {
      const res = await apiService.getChannels();
      moduleState.channels = Array.isArray(res?.channels) ? res.channels : [];

      if (moduleState.channels.length === 0) {
        renderEmptyState();
        return { channels: [] };
      }

      listContainer.innerHTML = moduleState.channels
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
    toggleBtn.addEventListener("click", () => {
      panel?.classList.toggle("hidden");
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
