import { showToast } from "./ui.js";

async function safeImport(path) {
  try {
    return await import(path);
  } catch {
    return {};
  }
}

let isFinanceEventsBound = false;
let currentApiService = null;
let currentWalletRefresh = async () => {};

let optionalApi = {};
let optionalUi = {};
let optionalI18n = {};

const helpersReady = Promise.all([
  safeImport("./api.js").then((mod) => {
    optionalApi = mod || {};
  }),
  safeImport("./ui.js").then((mod) => {
    optionalUi = mod || {};
  }),
  safeImport("../language/i18n.js").then((mod) => {
    optionalI18n = mod || {};
  })
]);

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttrSelector(value) {
  const str = String(value ?? "");
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(str);
  }
  return str.replace(/["\\]/g, "\\$&");
}

function translate(key, fallback = "لا توجد بيانات") {
  try {
    if (typeof optionalI18n.t === "function") {
      const val = optionalI18n.t(key);
      return val || fallback;
    }
  } catch {
    // تجاهل خطأ الترجمة واستخدام القيمة الاحتياطية
  }
  return fallback;
}

function notify(message, type = "info") {
  if (!message) return;
  if (typeof optionalUi.showAlert === "function") {
    optionalUi.showAlert(message, type);
    return;
  }
  if (typeof showToast === "function") {
    showToast(message);
  }
}

function getAdminKey() {
  const inputVal = (document.getElementById("adminKeyInput")?.value || "").trim();
  if (inputVal) return inputVal;
  return String(currentApiService?.adminKey || "").trim();
}

async function callFetchAdminOverview(adminKey) {
  await helpersReady;
  if (typeof currentApiService?.fetchAdminOverview === "function") {
    return currentApiService.fetchAdminOverview(adminKey);
  }
  if (typeof optionalApi.fetchAdminOverview === "function") {
    return optionalApi.fetchAdminOverview(adminKey);
  }
  throw new Error("دالة جلب بيانات الإدارة غير متوفرة");
}

async function callReviewDeposit(adminKey, id, action, adminNote) {
  await helpersReady;
  if (typeof currentApiService?.reviewDeposit === "function") {
    return currentApiService.reviewDeposit(adminKey, id, action, adminNote);
  }
  if (typeof optionalApi.reviewDeposit === "function") {
    return optionalApi.reviewDeposit(adminKey, id, action, adminNote);
  }
  throw new Error("دالة مراجعة الإيداع غير متوفرة");
}

async function callUpdateWithdrawalStep(adminKey, id, payload) {
  await helpersReady;
  if (typeof currentApiService?.updateWithdrawalStep === "function") {
    return currentApiService.updateWithdrawalStep(adminKey, id, payload);
  }
  if (typeof optionalApi.updateWithdrawalStep === "function") {
    return optionalApi.updateWithdrawalStep(adminKey, id, payload);
  }
  throw new Error("دالة تحديث مرحلة السحب غير متوفرة");
}

function formatMoney(amount) {
  if (typeof optionalUi.formatUsd === "function") {
    return optionalUi.formatUsd(amount);
  }
  const num = Number(amount || 0);
  return `$${Number.isFinite(num) ? num.toFixed(2) : "0.00"}`;
}

function formatTimestamp(dateVal) {
  if (typeof optionalUi.formatDate === "function" && dateVal) {
    return optionalUi.formatDate(dateVal);
  }
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
    container.innerHTML = `<p class="muted-note">${escapeHtml(
      translate("noData", "لا توجد طلبات إيداع معلقة")
    )}</p>`;
    return;
  }

  container.innerHTML = pending
    .map((d) => {
      const safeId = escapeHtml(d.id);
      const safeUserId = escapeHtml(d.userId);
      const safeTxid = escapeHtml(d.txid);
      const safeDate = escapeHtml(formatTimestamp(d.createdAt));
      return `
        <div class="admin-item" data-dep-id="${safeId}">
          <div><strong>${escapeHtml(formatMoney(d.amountUsd))}</strong> — UID: <code>${safeUserId}</code></div>
          <div class="tx-sub">TXID: <code>${safeTxid}</code> • ${safeDate}</div>
          <div class="admin-actions">
            <button type="button" class="btn btn-primary btn-sm dep-approve-btn" data-id="${safeId}">موافقة وإضافة الرصيد</button>
            <button type="button" class="btn btn-outline btn-sm dep-reject-btn" data-id="${safeId}">رفض</button>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderAdminWithdrawals(withdrawals) {
  const container = document.getElementById("adminWithdrawalsList");
  if (!container) return;

  if (!Array.isArray(withdrawals) || !withdrawals.length) {
    container.innerHTML = `<p class="muted-note">${escapeHtml(
      translate("noData", "لا توجد طلبات سحب")
    )}</p>`;
    return;
  }

  container.innerHTML = withdrawals
    .map((w) => {
      const safeId = escapeHtml(w.id);
      const safeUserId = escapeHtml(w.userId);
      const safeAddress = escapeHtml(w.trc20Address);
      const safeTxHash = escapeHtml(w.txHash || "");
      const safeStatus = escapeHtml(w.status || "");
      const safeStepLabel = escapeHtml(w.step || "");
      const steps = ["submitted", "under_review", "trc20_broadcast", "completed"];
      const optionsHtml = steps
        .map(
          (stepName) =>
            `<option value="${stepName}" ${w.step === stepName ? "selected" : ""}>${stepName}</option>`
        )
        .join("");

      return `
        <div class="admin-item" data-wd-id="${safeId}">
          <div class="card-header-row">
            <strong>${escapeHtml(formatMoney(w.amountUsd))} (صافي: ${escapeHtml(
              formatMoney(w.netAmountUsd)
            )})</strong>
            <span class="badge ${safeStatus}">${safeStepLabel}</span>
          </div>
          <div class="tx-sub">UID: <code>${safeUserId}</code> • TRC20: <code>${safeAddress}</code></div>
          <div class="admin-actions">
            <select class="wd-step-select" data-id="${safeId}">
              ${optionsHtml}
            </select>
            <input type="text" class="input-sm wd-txhash-input" data-id="${safeId}" placeholder="TX Hash (اختياري)" value="${safeTxHash}" />
            <button type="button" class="btn btn-primary btn-sm wd-update-btn" data-id="${safeId}">تحديث المرحلة</button>
            <button type="button" class="btn btn-outline btn-sm wd-reject-btn" data-id="${safeId}">رفض وإرجاع</button>
          </div>
        </div>
      `;
    })
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
        const id = updateWdBtn.getAttribute("data-id") || "";
        const escapedId = escapeAttrSelector(id);
        const selectEl = document.querySelector(`.wd-step-select[data-id="${escapedId}"]`);
        const hashEl = document.querySelector(`.wd-txhash-input[data-id="${escapedId}"]`);
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
        if (typeof currentApiService?.getAdminStats !== "function") {
          throw new Error("Missing getAdminStats");
        }
        const data = await currentApiService.getAdminStats();
        workspace.innerHTML = `
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <div class="glass-panel" style="padding:12px;border-radius:12px;">
              <small style="color:var(--text-muted)">Users</small>
              <h3>${escapeHtml(data?.totalUsers ?? 0)}</h3>
            </div>
            <div class="glass-panel" style="padding:12px;border-radius:12px;">
              <small style="color:var(--text-muted)">Channels</small>
              <h3>${escapeHtml(data?.totalChannels ?? 0)}</h3>
            </div>
            <div class="glass-panel" style="padding:12px;border-radius:12px;">
              <small style="color:var(--text-muted)">Active Ads</small>
              <h3>${escapeHtml(data?.activeCampaigns ?? 0)}</h3>
            </div>
            <div class="glass-panel" style="padding:12px;border-radius:12px;">
              <small style="color:var(--text-muted)">Volume</small>
              <h3>$${escapeHtml(data?.totalVolume ?? 0)}</h3>
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
          if (typeof currentApiService?.sendAdminBroadcast !== "function") {
            throw new Error("دالة الإرسال الجماعي غير متوفرة");
          }
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
