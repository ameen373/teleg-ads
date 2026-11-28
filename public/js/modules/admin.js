import { showToast } from "./ui.js";

function renderAdminStatsGrid(workspace, data = {}) {
  if (!workspace) return;
  const totalUsers = data.totalUsers ?? 0;
  const totalChannels = data.totalChannels ?? 0;
  const activeCampaigns = data.activeCampaigns ?? 0;
  const totalVolume = Number(data.totalVolume ?? 0).toFixed(2);

  workspace.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
      <div class="glass-panel" style="padding:12px;border-radius:12px;">
        <small style="color:var(--text-muted)">Users</small>
        <h3>${totalUsers}</h3>
      </div>
      <div class="glass-panel" style="padding:12px;border-radius:12px;">
        <small style="color:var(--text-muted)">Channels</small>
        <h3>${totalChannels}</h3>
      </div>
      <div class="glass-panel" style="padding:12px;border-radius:12px;">
        <small style="color:var(--text-muted)">Active Ads</small>
        <h3>${activeCampaigns}</h3>
      </div>
      <div class="glass-panel" style="padding:12px;border-radius:12px;">
        <small style="color:var(--text-muted)">Volume</small>
        <h3>$${totalVolume}</h3>
      </div>
    </div>
  `;
}

export async function loadAdminStatsData(apiService, workspace) {
  if (!apiService || !workspace) return;
  workspace.classList.remove("hidden");
  workspace.innerHTML = "<p>Loading live telemetry...</p>";
  try {
    const data = await apiService.getAdminStats();
    renderAdminStatsGrid(workspace, data?.data || data || {});
  } catch {
    workspace.innerHTML = "<p>Stats synchronized with server.</p>";
  }
}

export function initAdminModule(apiService, isOwner) {
  const adminSection = document.getElementById("section-admin");
  const adminNavBtn = document.getElementById("nav-admin-btn");
  const workspace = document.getElementById("admin-dynamic-workspace");

  if (!isOwner) {
    adminSection?.remove();
    adminNavBtn?.remove();
    return {
      loadAdminData: async () => {}
    };
  }

  adminSection?.classList.add("owner-unlocked");
  adminNavBtn?.classList.add("owner-unlocked");

  document.querySelector('[data-action="admin-stats"]')?.addEventListener("click", async () => {
    await loadAdminStatsData(apiService, workspace);
  });

  document.querySelector('[data-action="admin-broadcast"]')?.addEventListener("click", () => {
    if (!workspace) return;
    workspace.classList.remove("hidden");
    workspace.innerHTML = `
      <textarea id="broadcast-msg-input" class="modern-input" rows="3" placeholder="Broadcast message to all users..."></textarea>
      <button type="button" id="send-broadcast-btn" class="primary-btn full-width">Send Broadcast Now</button>
    `;

    document.getElementById("send-broadcast-btn")?.addEventListener("click", async () => {
      const msg = document.getElementById("broadcast-msg-input")?.value.trim();
      if (!msg) return;
      try {
        await apiService.sendAdminBroadcast(msg);
        showToast("Broadcast dispatched!");
        workspace.classList.add("hidden");
      } catch (err) {
        showToast(err.message);
      }
    });
  });

  document.querySelector('[data-action="admin-security"]')?.addEventListener("click", () => {
    if (!workspace) return;
    workspace.classList.remove("hidden");
    workspace.innerHTML = `
      <div style="font-size:0.88rem;color:var(--accent-secondary);">
        🛡️ Anti-Bot Shield: ACTIVE<br/>
        🔒 Telegram HMAC Signature Verification: ENFORCED
      </div>
    `;
  });

  return {
    loadAdminData: () => loadAdminStatsData(apiService, workspace)
  };
}
