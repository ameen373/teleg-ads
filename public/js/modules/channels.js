import { api } from "./api.js";
import { t } from "../language/i18n.js";
import {
  showToast,
  formatCurrency,
  escapeHtml,
  getWalletState,
  loadWalletAndReferrals,
  WALLET_UI_CONSTANTS
} from "./ui.js";

let boundChannelEvents = false;
let activeApiService = null;
let activeUserIdResolver = null;
let activeRefreshCallback = null;

function resolvePublisherId(explicitUserId) {
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

function renderWalletEarningsSummaryInChannels() {
  const summaryEl = document.getElementById("channels-wallet-summary");
  if (!summaryEl) return;

  const state = getWalletState?.();
  const wallet = state?.wallet || {};
  const availableBalance = Number(
    typeof wallet.availableBalance === "number" ? wallet.availableBalance : wallet.balance || 0
  );
  const pendingEarnings = Number(wallet.pendingEarnings || 0);
  const totalEarned = Number(wallet.totalEarned || 0);
  const minWithdrawal = Number(
    state?.constants?.MIN_WITHDRAWAL ?? WALLET_UI_CONSTANTS.MIN_WITHDRAWAL
  );
  const withdrawalFee = Number(
    state?.constants?.WITHDRAWAL_FEE ?? WALLET_UI_CONSTANTS.WITHDRAWAL_FEE
  );

  summaryEl.innerHTML = `
    <div class="channels-wallet-strip">
      <span>الرصيد المتاح: <strong>${escapeHtml(formatCurrency(availableBalance))}</strong></span>
      <span>أرباح معلقة (24 ساعة): <strong>${escapeHtml(formatCurrency(pendingEarnings))}</strong></span>
      <span>إجمالي الأرباح: <strong>${escapeHtml(formatCurrency(totalEarned))}</strong></span>
      <span>السحب (${escapeHtml(WALLET_UI_CONSTANTS.WITHDRAWAL_NETWORK)}): حد أدنى <strong>${escapeHtml(formatCurrency(minWithdrawal))}</strong> | رسوم <strong>${escapeHtml(formatCurrency(withdrawalFee))}</strong></span>
    </div>
  `;
}

export function renderChannels(channels = []) {
  const listContainer = document.getElementById("channels-list");
  if (!listContainer) return;

  renderWalletEarningsSummaryInChannels();

  if (!Array.isArray(channels) || channels.length === 0) {
    listContainer.innerHTML = `<div class="glass-panel data-card"><span style="color:var(--text-muted)">${escapeHtml(t("empty_channels"))}</span></div>`;
    return;
  }

  listContainer.innerHTML = channels
    .map(
      (ch) => `
      <div class="glass-panel data-card" data-channel-id="${escapeHtml(ch.id || "")}">
        <div>
          <strong>${escapeHtml(ch.title || ch.username || "")}</strong>
          <div style="font-size:0.8rem;color:var(--text-muted)">${escapeHtml(String(ch.subscribers || 0))} subscribers</div>
        </div>
        <span style="color:var(--accent-secondary);font-weight:700">${escapeHtml(ch.status || "Active")}</span>
      </div>`
    )
    .join("");
}

export async function loadChannelsList(apiServiceInstance = null) {
  const listContainer = document.getElementById("channels-list");
  renderWalletEarningsSummaryInChannels();
  if (!listContainer) return [];

  try {
    const service = apiServiceInstance || activeApiService;
    if (!service || typeof service.getChannels !== "function") {
      renderChannels([]);
      return [];
    }
    const res = await service.getChannels();
    const channels = Array.isArray(res?.channels) ? res.channels : [];
    renderChannels(channels);
    return channels;
  } catch {
    listContainer.innerHTML = `<div class="glass-panel data-card"><span style="color:var(--text-muted)">${escapeHtml(t("empty_channels"))}</span></div>`;
    return [];
  }
}

export function initChannelsEvents(getCurrentUserId, onRefreshCallback) {
  if (typeof getCurrentUserId === "function") {
    activeUserIdResolver = getCurrentUserId;
  }
  if (typeof onRefreshCallback === "function") {
    activeRefreshCallback = onRefreshCallback;
  }

  if (boundChannelEvents) return;
  boundChannelEvents = true;

  document.getElementById("form-record-earning")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const publisherId = resolvePublisherId();
      const amountInput = document.getElementById("earning-amount");
      const campaignInput = document.getElementById("earning-campaign-id");

      const amount = amountInput ? Number(amountInput.value) : NaN;
      const campaignId = campaignInput ? campaignInput.value.trim() : "";

      if (!publisherId) {
        showToast("تعذر تحديد معرف الناشر", "error");
        return;
      }
      if (!Number.isFinite(amount) || amount <= 0) {
        showToast("يرجى إدخال مبلغ أرباح صحيح", "error");
        return;
      }

      const res = await api.recordPublisherEarning(publisherId, amount, campaignId);
      showToast(res?.message || "تم تسجيل الأرباح بنجاح", "success");
      e.target.reset();

      if (typeof activeRefreshCallback === "function") {
        await activeRefreshCallback();
      } else {
        await loadWalletAndReferrals(publisherId);
        renderWalletEarningsSummaryInChannels();
      }
    } catch (error) {
      showToast(error?.message || "تعذر تسجيل الأرباح", "error");
    }
  });
}

export function initChannelsModule(apiService) {
  if (apiService) {
    activeApiService = apiService;
  }

  const toggleBtn = document.querySelector('[data-action="toggle-add-channel"]');
  const panel = document.getElementById("add-channel-panel");
  const submitBtn = document.getElementById("submit-channel-btn");
  const input = document.getElementById("channel-input");

  initChannelsEvents(
    () => resolvePublisherId(),
    async () => {
      await loadChannelsList(activeApiService);
      const uid = resolvePublisherId();
      if (uid) {
        await loadWalletAndReferrals(uid);
      }
      renderWalletEarningsSummaryInChannels();
    }
  );

  toggleBtn?.addEventListener("click", () => {
    panel?.classList.toggle("hidden");
    renderWalletEarningsSummaryInChannels();
  });

  submitBtn?.addEventListener("click", async () => {
    const username = input ? input.value.trim() : "";
    if (!username) return;
    submitBtn.disabled = true;
    try {
      await activeApiService.addChannel(username);
      if (input) input.value = "";
      panel?.classList.add("hidden");
      showToast("✓", "success");
      await loadChannelsList(activeApiService);
    } catch (err) {
      showToast(err?.message || "تعذر إضافة القناة", "error");
    } finally {
      submitBtn.disabled = false;
    }
  });

  return {
    loadChannels: () => loadChannelsList(activeApiService),
    renderChannels
  };
}
