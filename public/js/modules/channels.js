import { t } from "../language/i18n.js";
import { showToast } from "./ui.js";

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
    const username = input.value.trim();
    if (!username) return;
    submitBtn.disabled = true;
    try {
      await apiService.addChannel(username);
      input.value = "";
      panel.classList.add("hidden");
      showToast("✓");
      await loadChannels();
    } catch (err) {
      showToast(err.message);
    } finally {
      submitBtn.disabled = false;
    }
  });

  async function loadChannels() {
    if (!listContainer) return;
    try {
      const res = await apiService.getChannels();
      const channels = res.channels || [];
      if (channels.length === 0) {
        listContainer.innerHTML = `<div class="glass-panel data-card"><span style="color:var(--text-muted)">${t("empty_channels")}</span></div>`;
        return;
      }
      listContainer.innerHTML = channels
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
    } catch {
      listContainer.innerHTML = `<div class="glass-panel data-card"><span style="color:var(--text-muted)">${t("empty_channels")}</span></div>`;
    }
  }

  return { loadChannels };
}
