import { t } from "../language/i18n.js";
import { showToast } from "./ui.js";

export function getActiveChannelsState() {
  return {
    channels: [],
  };
}

export function initChannelsModule(apiService) {
  const toggleBtn = document.querySelector('[data-action="toggle-add-channel"]');
  const panel = document.getElementById("add-channel-panel");
  const submitBtn = document.getElementById("submit-channel-btn");
  const input = document.getElementById("channel-input");
  const listContainer = document.getElementById("channels-list");

  toggleBtn?.addEventListener("click", () => {
    panel?.classList.toggle("hidden");
  });

  submitBtn?.addEventListener("click", async () => {
    if (!input) return;
    const username = input.value.trim();
    if (!username) return;

    if (submitBtn) submitBtn.disabled = true;
    try {
      await apiService.addChannel(username);
      input.value = "";
      panel?.classList.add("hidden");
      showToast("✓");
      await loadChannels();
    } catch (err) {
      showToast(err?.message || t("error_generic") || "Error");
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });

  function renderEmptyState() {
    if (!listContainer) return;
    listContainer.innerHTML = `<div class="glass-panel data-card"><span style="color:var(--text-muted)">${t("empty_channels")}</span></div>`;
  }

  async function loadChannels() {
    const state = getActiveChannelsState();

    if (!listContainer) {
      return state;
    }

    try {
      const res = await apiService.getChannels();
      state.channels = Array.isArray(res?.channels) ? res.channels : [];

      if (state.channels.length === 0) {
        renderEmptyState();
        return state;
      }

      listContainer.innerHTML = state.channels
        .map(
          (ch) => `
          <div class="glass-panel data-card">
            <div>
              <strong>${ch.title || ch.username}</strong>
              <div style="font-size:0.8rem;color:var(--text-muted)">${ch.subscribers || 0} subscribers</div>
            </div>
            <span style="color:var(--accent-secondary);font-weight:700">${ch.status || "Active"}</span>
          </div>`
        )
        .join("");

      return state;
    } catch {
      renderEmptyState();
      return state;
    }
  }

  return {
    loadChannels,
    getActiveChannelsState,
  };
}
