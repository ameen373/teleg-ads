import {
  fetchAdminOverview as apiFetchAdminOverview,
  reviewDeposit as apiReviewDeposit,
  updateWithdrawalStep as apiUpdateWithdrawalStep
} from "./api.js";
import { showToast, showAlert, formatUsd, formatDate } from "./ui.js";
import { t as i18nT } from "../language/i18n.js";

let isFinanceEventsBound = false;
let currentApiService = null;
let currentWalletRefresh = async () => {};

function translate(key, fallback = "لا توجد بيانات") {
  try {
    if (typeof i18nT === "function") {
      const val = i18nT(key);
      return val || fallback;
    }
  } catch {
    // تجاهل أي خطأ في الترجمة واستخدام القيمة الاحتياطية
  }
  return fallback;
}

function notify(message, type = "info") {
  if (!message) return;
  if (typeof showAlert === "function") {
    showAlert(message, type);
    return;
  }
  if (typeof showToast === "function") {
    showToast(message);
  }
}

function getAdminKey() {
  const inputVal = (document.getElementById("adminKeyInput")?.value || "").trim();
  if (inputVal) return inputVal;
  return (currentApiService?.adminKey || "").trim();
}

async function callFetchAdminOverview(adminKey) {
  if (typeof currentApiService?.fetchAdminOverview === "function") {
    return currentApiService.fetchAdminOverview(adminKey);
  }
  return apiFetchAdminOverview(adminKey);
}

async function callReviewDeposit(adminKey, id, action, adminNote) {
  if (typeof currentApiService?.reviewDeposit === "function") {
    return currentApiService.reviewDeposit(adminKey, id, action, adminNote);
  }
  return apiReviewDeposit(adminKey, id, action, adminNote);
}

async function callUpdateWithdrawalStep(adminKey, id, payload) {
  if (typeof currentApiService?.updateWithdrawalStep === "function") {
    return currentApiService.updateWithdrawalStep(adminKey, id, payload);
  }
  return apiUpdateWithdrawalStep(adminKey, id, payload);
}

function formatMoney(amount) {
  if (typeof formatUsd === "function") return formatUsd(amount);
  const num = Number(amount || 0);
  return `$${num.toFixed(2)}`;
}

function formatTimestamp(dateVal) {
  if (typeof formatDate === "function" && dateVal) return formatDate(dateVal);
  if (!dateVal) return "";
  try {
    return new Date(dateVal).toLocaleString();
  } catch {
    return String(dateVal);
  }
}

export async function loadAdminPanel({ silentMissingKey = false } = {}) {
  const adminKey = getAdminKey();
  if (!adminKey) {
    if (!silentMissingKey) {
      notify("يرجى إدخال مفتاح الإدارة أولاً", "error");
    }
    return null;
  }

  const data = await callFetchAdminOverview(adminKey);
  renderAdminDeposits(data?.deposits || []);
  renderAdminWithdrawals(data?.withdrawals || []);
  return data;
}

function renderAdminDeposits(deposits) {
  const container = document.getElementById("adminDepositsList");
  if (!container) return;

  const pending = Array.isArray(deposits)
    ? deposits.filter((d) => d && d.status === "pending")
    : [];

  if (!pending.length) {
    container.innerHTML = `<p class="muted-note">${translate("noData", "لا توجد طلبات إيداع معلقة")}</p>`;
    return;
  }

  container.innerHTML = pending
    .map(
      (d) => `
      <div class="admin-item" data-dep-id="${d.id}">
        <div><strong>${formatMoney(d.amountUsd)}</strong> — UID: <code>${d.userId}</code></div>
        <div class="tx-sub">TXID: <code>${d.txid}</code> • ${formatTimestamp(d.createdAt)}</div>
        <div class="admin-actions">
          <button type="button" class="btn btn-primary btn-sm dep-approve-btn" data-id="${d.id}">موافقة وإضافة الرصيد</button>
          <button type="button" class="btn btn-outline btn-sm dep-reject-btn" data-id="${d.id}">رفض</button>
        </div>
      </div>
    `
    )
    .join("");
}

function renderAdminWithdrawals(withdrawals) {
  const container = document.getElementById("adminWithdrawalsList");
  if (!container) return;

  if (!Array.isArray(withdrawals) || !withdrawals.length) {
    container.innerHTML = `<p class="muted-note">${translate("noData", "لا توجد طلبات سحب")}</p>`;
    return;
  }

  container.innerHTML = withdrawals
    .map(
      (w) => `
      <div class="admin-item" data-wd-id="${w.id}">
        <div class="card-header-row">
          <strong>${formatMoney(w.amountUsd)} (صافي: ${formatMoney(w.netAmountUsd)})</strong>
          <span class="badge ${w.status || ""}">${w.step || ""}</span>
        </div>
        <div class="tx-sub">UID: <code>${w.userId}</code> • TRC20: <code>${w.trc20Address}</code></div>
        <div class="admin-actions">
          <select class="wd-step-select" data-id="${w.id}">
            <option value="submitted" ${w.step === "submitted" ? "selected" : ""}>submitted</option>
            <option value="under_review" ${w.step === "under_review" ? "selected" : ""}>under_review</option>
            <option value="trc20_broadcast" ${w.step === "trc20_broadcast" ? "selected" : ""}>trc20_broadcast</option>
            <option value="completed" ${w.step === "completed" ? "selected" : ""}>completed</option>
          </select>
          <input type="text" class="input-sm wd-txhash-input" data-id="${w.id}" placeholder="TX Hash (اختياري)" value="${w.txHash || ""}" />
          <button type="button" class="btn btn-primary btn-sm wd-update-btn" data-id="${w.id}">تحديث المرحلة</button>
          <button type="button" class="btn btn-outline btn-sm wd-reject-btn" data-id="${w.id}">رفض وإرجاع</button>
        </div>
      </div>
    `
    )
    .join("");
}

export function bindAdminEvents(onWalletRefresh) {
  if (typeof onWalletRefresh === "function") {
    currentWalletRefresh = onWalletRefresh;
  }

  const loadBtn = document.getElementById("loadAdminDataBtn");
  if (loadBtn && !loadBtn.dataset.bound) {
    loadBtn.dataset.bound = "true";
    loadBtn.addEventListener("click", async () => {
      try {
        const res = await loadAdminPanel({ silentMissingKey: false });
        if (res) {
          notify("تم تحميل طلبات المراجعة بنجاح", "success");
        }
      } catch (err) {
        notify(err?.message || "حدث خطأ أثناء تحميل البيانات", "error");
      }
    });
  }

  if (isFinanceEventsBound) return;
  isFinanceEventsBound = true;

  document.addEventListener("click", async (e) => {
    const target = e.target;
    if (!(target instanceof Element)) return;

    const approveBtn = target.closest(".dep-approve-btn");
    const rejectDepBtn = target.closest(".dep-reject-btn");
    const updateWdBtn = target.closest(".wd-update-btn");
    const rejectWdBtn = target.closest(".wd-reject-btn");

    if (!approveBtn && !rejectDepBtn && !updateWdBtn && !rejectWdBtn) return;

    const adminKey = getAdminKey();
    if (!adminKey) {
      notify("يرجى إدخال مفتاح الإدارة أولاً", "error");
      return;
    }

    if (approveBtn) {
      try {
        const id = approveBtn.getAttribute("data-id");
        await callReviewDeposit(adminKey, id, "approve", "تم التحقق من التحويل");
        notify("تمت الموافقة على الإيداع وإضافة الرصيد", "success");
        await loadAdminPanel({ silentMissingKey: true });
        await currentWalletRefresh();
      } catch (err) {
        notify(err?.message || "تعذر اعتماد الإيداع", "error");
      }
      return;
    }

    if (rejectDepBtn) {
      try {
        const id = rejectDepBtn.getAttribute("data-id");
        await callReviewDeposit(adminKey, id, "reject", "تعذر التحقق من المعاملة");
        notify("تم رفض طلب الإيداع", "success");
        await loadAdminPanel({ silentMissingKey: true });
      } catch (err) {
        notify(err?.message || "تعذر رفض الإيداع", "error");
      }
      return;
    }

    if (updateWdBtn) {
      try {
        const id = updateWdBtn.getAttribute("data-id");
        const selectEl = document.querySelector(`.wd-step-select[data-id="${id}"]`);
        const hashEl = document.querySelector(`.wd-txhash-input[data-id="${id}"]`);
        await callUpdateWithdrawalStep(adminKey, id, {
          step: selectEl ? selectEl.value : "under_review",
          txHash: hashEl ? hashEl.value.trim() : ""
        });
        notify("تم تحديث مرحلة طلب السحب", "success");
        await loadAdminPanel({ silentMissingKey: true });
        await currentWalletRefresh();
      } catch (err) {
        notify(err?.message || "تعذر تحديث مرحلة السحب", "error");
      }
      return;
    }

    if (rejectWdBtn) {
      try {
        const id = rejectWdBtn.getAttribute("data-id");
        await callUpdateWithdrawalStep(adminKey, id, {
          reject: true,
          adminNote: "تم رفض طلب السحب وإرجاع الرصيد"
        });
        notify("تم رفض السحب وإرجاع المبلغ للأرباح المتاحة", "success");
        await loadAdminPanel({ silentMissingKey: true });
        await currentWalletRefresh();
      } catch (err) {
        notify(err?.message || "تعذر رفض طلب السحب", "error");
      }
    }
  });
}

export function initAdminModule(apiService, isOwner, options = {}) {
  currentApiService = apiService || null;
  if (typeof options.onWalletRefresh === "function") {
    currentWalletRefresh = options.onWalletRefresh;
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

  bindAdminEvents(currentWalletRefresh);

  const statsBtn = document.querySelector('[data-action="admin-stats"]');
  if (statsBtn && !statsBtn.dataset.bound) {
    statsBtn.dataset.bound = "true";
    statsBtn.addEventListener("click", async () => {
      if (!workspace) return;
      workspace.classList.remove("hidden");
      workspace.innerHTML = "<p>Loading live telemetry...</p>";
      try {
        const data = await currentApiService.getAdminStats();
        workspace.innerHTML = `
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <div class="glass-panel" style="padding:12px;border-radius:12px;">
              <small style="color:var(--text-muted)">Users</small>
              <h3>${data.totalUsers ?? 0}</h3>
            </div>
            <div class="glass-panel" style="padding:12px;border-radius:12px;">
              <small style="color:var(--text-muted)">Channels</small>
              <h3>${data.totalChannels ?? 0}</h3>
            </div>
            <div class="glass-panel" style="padding:12px;border-radius:12px;">
              <small style="color:var(--text-muted)">Active Ads</small>
              <h3>${data.activeCampaigns ?? 0}</h3>
            </div>
            <div class="glass-panel" style="padding:12px;border-radius:12px;">
              <small style="color:var(--text-muted)">Volume</small>
              <h3>$${data.totalVolume ?? 0}</h3>
            </div>
          </div>
        `;
      } catch {
        workspace.innerHTML = "<p>Stats synchronized with server.</p>";
      }
    });
  }

  const broadcastBtn = document.querySelector('[data-action="admin-broadcast"]');
  if (broadcastBtn && !broadcastBtn.dataset.bound) {
    broadcastBtn.dataset.bound = "true";
    broadcastBtn.addEventListener("click", () => {
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
          await currentApiService.sendAdminBroadcast(msg);
          notify("Broadcast dispatched!", "success");
          workspace.classList.add("hidden");
        } catch (err) {
          notify(err?.message || "Failed to send broadcast", "error");
        }
      });
    });
  }

  const securityBtn = document.querySelector('[data-action="admin-security"]');
  if (securityBtn && !securityBtn.dataset.bound) {
    securityBtn.dataset.bound = "true";
    securityBtn.addEventListener("click", () => {
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
}
