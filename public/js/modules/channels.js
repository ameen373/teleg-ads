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

function renderChannelsList(listContainer, channels) {
  if (!listContainer) return;

  if (!Array.isArray(channels) || channels.length === 0) {
    listContainer.innerHTML = `<div class="glass-panel data-card"><span style="color:var(--text-muted)">${escapeHtml(t("empty_channels"))}</span></div>`;
    return;
  }

  listContainer.innerHTML = channels
    .map((ch) => {
      const title = escapeHtml(ch.title || ch.name || ch.username || "");
      const subs = Number(ch.subscribers ?? ch.subscribersCount ?? 0);
      const status = escapeHtml(ch.status || "Active");
      return `
        <div class="glass-panel data-card">
          <div>
            <strong>${title}</strong>
            <div style="font-size:0.8rem;color:var(--text-muted)">${subs} subscribers</div>
          </div>
          <span style="color:var(--accent-secondary);font-weight:700">${status}</span>
        </div>
      `;
    })
    .join("");
}

export function initChannelsModule(apiService) {
  const toggleBtn =
    document.querySelector('[data-action="toggle-add-channel"]') ||
    document.getElementById("btn-open-add-channel");
  const panel =
    document.getElementById("add-channel-panel") ||
    document.getElementById("panel-add-channel");
  const submitBtn =
    document.getElementById("submit-channel-btn") ||
    document.getElementById("btn-ch-save");
  const input =
    document.getElementById("channel-input") ||
    document.getElementById("ch-username") ||
    document.getElementById("channelNameInput");
  const listContainer =
    document.getElementById("channels-list") ||
    document.getElementById("channelsList");

  toggleBtn?.addEventListener("click", () => {
    panel?.classList.toggle("hidden");
  });

  async function handleAddChannel(e) {
    if (e && typeof e.preventDefault === "function") {
      e.preventDefault();
    }

    const username = (input?.value || "").trim();
    if (!username) return;

    if (submitBtn) submitBtn.disabled = true;
    try {
      await apiService.addChannel(username);
      if (input) input.value = "";
      panel?.classList.add("hidden");
      showToast("✓");
      await loadChannels();
    } catch (err) {
      showToast(err.message);
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  submitBtn?.addEventListener("click", handleAddChannel);

  async function loadChannels() {
    if (!listContainer) return;
    try {
      const res = await apiService.getChannels();
      const channels = res?.channels || res?.data || [];
      renderChannelsList(listContainer, channels);
    } catch {
      renderChannelsList(listContainer, []);
    }
  }

  return { loadChannels };
}
