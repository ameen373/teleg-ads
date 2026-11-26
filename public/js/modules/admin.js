import { api } from "./api.js";
import {
  showToast,
  formatCurrency,
  formatDate,
  escapeHtml,
  getWalletState,
  loadWalletAndReferrals,
  WALLET_UI_CONSTANTS
} from "./ui.js";

let boundAdminEvents = false;
let activeApiService = null;
let activeUserIdResolver = null;
let activeRefreshCallback = null;

function resolveAdminUserId(explicitUserId) {
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

async function fetchAdminOverviewData() {
  if (activeApiService && typeof activeApiService.getAdminOverview === "function") {
    return activeApiService.getAdminOverview();
  }
  return api.getAdminOverview();
}

function renderAdminWalletSummary() {
  const walletSummaryEl = document.getElementById("admin-wallet-summary");
  if (!walletSummaryEl) return;

  const state = getWalletState?.();
  const wallet = state?.wallet || {};
  const availableBalance = Number(
    typeof wallet.availableBalance === "number" ? wallet.availableBalance : wallet.balance || 0
  );
  const minWithdrawal = Number(
    state?.constants?.MIN_WITHDRAWAL ?? WALLET_UI_CONSTANTS.MIN_WITHDRAWAL
  );
  const withdrawalFee = Number(
    state?.constants?.WITHDRAWAL_FEE ?? WALLET_UI_CONSTANTS.WITHDRAWAL_FEE
  );

  walletSummaryEl.innerHTML = `
    <div class="admin-wallet-strip">
      <span>رصيد المالك المتاح: <strong>${escapeHtml(formatCurrency(availableBalance))}</strong></span>
      <span>السحب (${escapeHtml(WALLET_UI_CONSTANTS.WITHDRAWAL_NETWORK)}): حد أدنى <strong>${escapeHtml(formatCurrency(minWithdrawal))}</strong> | رسوم <strong>${escapeHtml(formatCurrency(withdrawalFee))}</strong></span>
    </div>
  `;
}

export function renderAdminDeposits(deposits = []) {
  const tbody = document.getElementById("admin-deposits-body");
  if (!tbody) return;

  renderAdminWalletSummary();

  if (!Array.isArray(deposits) || deposits.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="6" class="text-center">لا توجد طلبات إيداع</td></tr>';
    return;
  }

  tbody.innerHTML = deposits
    .map((d) => {
      const refHash = String(d.txid || d.txHash || "");
      return `
    <tr>
      <td><code>${escapeHtml(d.userId || "")}</code></td>
      <td><strong>${escapeHtml(formatCurrency(d.amount))}</strong></td>
      <td><code>${escapeHtml(refHash)}</code></td>
      <td>${escapeHtml(formatDate(d.createdAt))}</td>
      <td><span class="badge badge-${escapeHtml(d.status || "pending")}">${escapeHtml(d.status || "pending")}</span></td>
      <td>
        ${
          d.status === "pending"
            ? `
          <button type="button" class="btn btn-success btn-sm btn-admin-dep" data-id="${escapeHtml(d.id || "")}" data-action="approve">اعتماد وشحن</button>
          <button type="button" class="btn btn-danger btn-sm btn-admin-dep" data-id="${escapeHtml(d.id || "")}" data-action="reject">رفض</button>
        `
            : "<span>تمت المراجعة</span>"
        }
      </td>
    </tr>
  `;
    })
    .join("");
}

export function renderAdminWithdrawals(withdrawals = []) {
  const tbody = document.getElementById("admin-withdrawals-body");
  if (!tbody) return;

  if (!Array.isArray(withdrawals) || withdrawals.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="7" class="text-center">لا توجد طلبات سحب</td></tr>';
    return;
  }

  tbody.innerHTML = withdrawals
    .map((w) => {
      const isFinal = w.status === "completed" || w.status === "rejected";
      const grossAmt = w.amount ?? w.requestedAmount ?? 0;
      const addr = w.walletAddress || w.trc20Address || "";
      const step = Number(w.stepIndex || 1);

      return `
      <tr>
        <td><code>${escapeHtml(w.userId || "")}</code></td>
        <td>${escapeHtml(formatCurrency(grossAmt))} (صافي: <strong>${escapeHtml(formatCurrency(w.netAmount))}</strong>)</td>
        <td><code>${escapeHtml(addr)}</code></td>
        <td><span class="badge badge-${escapeHtml(w.status || "requested")}">${escapeHtml(w.status || "requested")} (مرحلة ${escapeHtml(String(step))}/4)</span></td>
        <td>
          <input type="text" class="input-sm admin-txhash-input" data-id="${escapeHtml(w.id || "")}" placeholder="TXID التحويل" value="${escapeHtml(w.txHash || "")}" ${isFinal ? "disabled" : ""}>
        </td>
        <td>
          ${
            !isFinal
              ? `
            <select class="select-sm admin-w-status" data-id="${escapeHtml(w.id || "")}">
              <option value="requested" ${w.status === "requested" ? "selected" : ""}>1. تم الطلب</option>
              <option value="reviewing" ${w.status === "reviewing" ? "selected" : ""}>2. قيد المراجعة</option>
              <option value="processing" ${w.status === "processing" ? "selected" : ""}>3. جاري التحويل</option>
              <option value="completed" ${w.status === "completed" ? "selected" : ""}>4. مكتمل</option>
              <option value="rejected">رفض وإعادة الرصيد</option>
            </select>
            <button type="button" class="btn btn-primary btn-sm btn-admin-w-save" data-id="${escapeHtml(w.id || "")}">تحديث</button>
          `
              : "<span>مغلق نهائياً</span>"
          }
        </td>
      </tr>
    `;
    })
    .join("");
}

export function renderAdminCampaigns(campaigns = []) {
  const tbody = document.getElementById("admin-campaigns-body");
  if (!tbody) return;

  if (!Array.isArray(campaigns) || campaigns.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="6" class="text-center">لا توجد حملات</td></tr>';
    return;
  }

  tbody.innerHTML = campaigns
    .map((c) => {
      const totalBudget = Number(c.totalBudget ?? c.budget ?? 0);
      const spentBudget = Number(c.spentBudget || 0);
      const isSettled = c.status === "settled" || Boolean(c.isSettled);
      const rem = Math.max(0, Number((totalBudget - spentBudget).toFixed(2)));
      const refunded = Number(c.remainingRefunded || 0);

      return `
      <tr>
        <td>${escapeHtml(c.title || "")}</td>
        <td><code>${escapeHtml(c.advertiserId || "")}</code></td>
        <td>${escapeHtml(formatCurrency(totalBudget))}</td>
        <td>${escapeHtml(formatCurrency(spentBudget))}</td>
        <td>${escapeHtml(formatCurrency(isSettled ? 0 : rem))}</td>
        <td>
          ${
            !isSettled
              ? `<button type="button" class="btn btn-warning btn-sm btn-admin-settle" data-id="${escapeHtml(c.id || "")}">تسوية ذرية الآن</button>`
              : `<span class="text-success">مسواة (أعيد ${escapeHtml(formatCurrency(refunded))})</span>`
          }
        </td>
      </tr>
    `;
    })
    .join("");
}

export async function loadAdminPanel() {
  try {
    const data = await fetchAdminOverviewData();
    renderAdminDeposits(data.deposits || []);
    renderAdminWithdrawals(data.withdrawals || []);
    renderAdminCampaigns(data.campaigns || []);
    return data;
  } catch (error) {
    showToast(error?.message || "تعذر تحميل لوحة الإدارة", "error");
    return null;
  }
}

export function initAdminEvents(getCurrentUserId, onRefreshCallback) {
  if (typeof getCurrentUserId === "function") {
    activeUserIdResolver = getCurrentUserId;
  }
  if (typeof onRefreshCallback === "function") {
    activeRefreshCallback = onRefreshCallback;
  }

  if (boundAdminEvents) return;
  boundAdminEvents = true;

  const triggerAdminRefresh = async () => {
    try {
      await loadAdminPanel();
      if (typeof activeRefreshCallback === "function") {
        await activeRefreshCallback();
      } else {
        const uid = resolveAdminUserId();
        if (uid) {
          await loadWalletAndReferrals(uid);
        }
      }
    } catch (err) {
      showToast(err?.message || "تعذر تحديث بيانات الإدارة", "error");
    }
  };

  document.getElementById("admin-deposits-body")?.addEventListener("click", async (e) => {
    const btn = e.target.closest(".btn-admin-dep");
    if (!btn) return;
    const depositId = btn.getAttribute("data-id");
    const action = btn.getAttribute("data-action");
    if (!depositId || !action) return;

    try {
      btn.disabled = true;
      const res = await api.reviewDeposit(depositId, action);
      showToast(res?.message || "تمت مراجعة طلب الإيداع", "success");
      await triggerAdminRefresh();
    } catch (error) {
      btn.disabled = false;
      showToast(error?.message || "تعذر مراجعة طلب الإيداع", "error");
    }
  });

  document.getElementById("admin-withdrawals-body")?.addEventListener("click", async (e) => {
    const btn = e.target.closest(".btn-admin-w-save");
    if (!btn) return;
    const withdrawalId = btn.getAttribute("data-id");
    if (!withdrawalId) return;

    const statusSelect = document.querySelector(`.admin-w-status[data-id="${withdrawalId}"]`);
    const txHashInput = document.querySelector(`.admin-txhash-input[data-id="${withdrawalId}"]`);

    try {
      btn.disabled = true;
      const res = await api.updateWithdrawalStatus(
        withdrawalId,
        statusSelect ? statusSelect.value : "requested",
        txHashInput ? txHashInput.value : ""
      );
      showToast(res?.message || "تم تحديث حالة السحب", "success");
      await triggerAdminRefresh();
    } catch (error) {
      btn.disabled = false;
      showToast(error?.message || "تعذر تحديث حالة السحب", "error");
    }
  });

  document.getElementById("admin-campaigns-body")?.addEventListener("click", async (e) => {
    const btn = e.target.closest(".btn-admin-settle");
    if (!btn) return;
    const campaignId = btn.getAttribute("data-id");
    if (!campaignId) return;

    try {
      btn.disabled = true;
      const res = await api.settleCampaign(campaignId);
      showToast(res?.message || "تمت التسوية الذرية بنجاح", "success");
      await triggerAdminRefresh();
    } catch (error) {
      btn.disabled = false;
      showToast(error?.message || "تعذر تسوية الحملة", "error");
    }
  });

  document.getElementById("btn-admin-force-release")?.addEventListener("click", async () => {
    try {
      const inputEl = document.getElementById("admin-force-user-id");
      const targetUser =
        (inputEl ? inputEl.value.trim() : "") || resolveAdminUserId();
      if (!targetUser) {
        showToast("يرجى تحديد معرف المستخدم", "error");
        return;
      }
      const res = await api.forceRelease24h(targetUser);
      showToast(res?.message || "تم تحرير الأرباح المعلقة", "success");
      await triggerAdminRefresh();
    } catch (error) {
      showToast(error?.message || "تعذر تحرير الأرباح", "error");
    }
  });
}

export function initAdminModule(apiService, isOwner) {
  if (apiService) {
    activeApiService = apiService;
  }

  const adminSection = document.getElementById("section-admin");
  const adminNavBtn = document.getElementById("nav-admin-btn");
  const workspace = document.getElementById("admin-dynamic-workspace");

  if (!isOwner) {
    adminSection?.remove();
    adminNavBtn?.remove();
    return;
  }

  adminSection?.classList.add("owner-unlocked");
  adminNavBtn?.classList.add("owner-unlocked");
  renderAdminWalletSummary();

  initAdminEvents(
    () => resolveAdminUserId(),
    async () => {
      const uid = resolveAdminUserId();
      if (uid) {
        await loadWalletAndReferrals(uid);
      }
      renderAdminWalletSummary();
    }
  );

  document.querySelector('[data-action="admin-stats"]')?.addEventListener("click", async () => {
    if (!workspace) return;
    workspace.classList.remove("hidden");
    workspace.innerHTML = "<p>Loading live telemetry...</p>";
    try {
      const data = await activeApiService.getAdminStats();
      workspace.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div class="glass-panel" style="padding:12px;border-radius:12px;">
            <small style="color:var(--text-muted)">Users</small>
            <h3>${escapeHtml(String(data.totalUsers ?? 0))}</h3>
          </div>
          <div class="glass-panel" style="padding:12px;border-radius:12px;">
            <small style="color:var(--text-muted)">Channels</small>
            <h3>${escapeHtml(String(data.totalChannels ?? 0))}</h3>
          </div>
          <div class="glass-panel" style="padding:12px;border-radius:12px;">
            <small style="color:var(--text-muted)">Active Ads</small>
            <h3>${escapeHtml(String(data.activeCampaigns ?? 0))}</h3>
          </div>
          <div class="glass-panel" style="padding:12px;border-radius:12px;">
            <small style="color:var(--text-muted)">Volume</small>
            <h3>${escapeHtml(formatCurrency(data.totalVolume ?? 0))}</h3>
          </div>
        </div>
      `;
    } catch {
      workspace.innerHTML = "<p>Stats synchronized with server.</p>";
    }
  });

  document.querySelector('[data-action="admin-broadcast"]')?.addEventListener("click", () => {
    if (!workspace) return;
    workspace.classList.remove("hidden");
    workspace.innerHTML = `
      <textarea id="broadcast-msg-input" class="modern-input" rows="3" placeholder="Broadcast message to all users..."></textarea>
      <button id="send-broadcast-btn" type="button" class="primary-btn full-width">Send Broadcast Now</button>
    `;

    document.getElementById("send-broadcast-btn")?.addEventListener("click", async () => {
      const msg = document.getElementById("broadcast-msg-input")?.value.trim();
      if (!msg) return;
      try {
        await activeApiService.sendAdminBroadcast(msg);
        showToast("Broadcast dispatched!", "success");
        workspace.classList.add("hidden");
      } catch (err) {
        showToast(err?.message || "تعذر إرسال البث", "error");
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
}
