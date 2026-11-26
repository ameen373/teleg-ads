import {
  detectSmartLanguage,
  setLanguage,
  getCurrentLanguage,
  applyTranslations
} from "./language/i18n.js";
import { ApiService } from "./modules/api.js";
import {
  initNavigation,
  openFaqModal,
  openLanguageModal,
  openSupportModal,
  updateActiveNavPill,
  closeModal,
  showToast
} from "./modules/ui.js";
import { initChannelsModule, initChannelsEvents, loadChannelsList } from "./modules/channels.js";
import { initCampaignsModule, initCampaignsEvents, loadCampaigns } from "./modules/campaigns.js";
import {
  initWalletAndReferralModule,
  initWalletEvents,
  loadWalletAndReferrals
} from "./modules/wallet.js";
import { initAdminModule, initAdminEvents, loadAdminPanel } from "./modules/admin.js";

let activeUserId = "";
let isCurrentOwner = false;
let currentApiService = null;
let currentChannelsCtrl = null;
let currentCampaignsCtrl = null;
let autoRefreshTimer = null;

function generateFallbackAvatar(name) {
  const initial = encodeURIComponent((name || "U").charAt(0).toUpperCase());
  return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="120" height="120" fill="%232aabee"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="white" font-size="52" font-family="sans-serif" font-weight="bold">${initial}</text></svg>`;
}

export function getCurrentUserId() {
  if (activeUserId) return activeUserId;
  try {
    const tgId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
    if (tgId) return String(tgId);
  } catch {
    // تجاهل في حال الفتح خارج تيليجرام
  }
  return "";
}

export async function refreshAllData() {
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const refParam = urlParams.get("ref") || "";
    const uid = getCurrentUserId();

    if (uid) {
      await loadWalletAndReferrals(uid, refParam);
      if (currentCampaignsCtrl?.loadCampaigns) {
        await currentCampaignsCtrl.loadCampaigns(uid);
      } else {
        await loadCampaigns(uid);
      }
      if (currentChannelsCtrl?.loadChannels) {
        await currentChannelsCtrl.loadChannels();
      } else {
        await loadChannelsList(currentApiService);
      }
    }

    if (isCurrentOwner) {
      await loadAdminPanel();
    }
  } catch (error) {
    console.error("[refreshAllData Error]:", error);
  }
}

function setupLegacySectionNavigation() {
  const navButtons = document.querySelectorAll(".nav-btn");
  const sections = document.querySelectorAll(".page-section");

  navButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.getAttribute("data-section");
      if (!target) return;
      navButtons.forEach((b) => b.classList.remove("active"));
      sections.forEach((s) => s.classList.add("hidden"));

      btn.classList.add("active");
      document.getElementById(`section-${target}`)?.classList.remove("hidden");
    });
  });
}

async function bootstrapApp() {
  try {
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
      tg.setHeaderColor("#0b0f19");
      tg.setBackgroundColor("#0b0f19");
    }

    // 1. Smart User Detection
    const tgUser = tg?.initDataUnsafe?.user || {};
    const fullName =
      [tgUser.first_name, tgUser.last_name].filter(Boolean).join(" ") || "Telegram User";
    const secretTelegramId = tgUser.id ? String(tgUser.id) : "";
    const secretUsername = tgUser.username ? String(tgUser.username) : "";
    activeUserId = secretTelegramId || secretUsername || "";
    const photoUrl = tgUser.photo_url || generateFallbackAvatar(fullName);

    // 2. Smart Language Detection
    const detectedLang = detectSmartLanguage(tgUser.language_code);
    setLanguage(detectedLang);
    try {
      applyTranslations();
    } catch {
      // تجاهل إذا كانت الترجمات تدار داخلياً عبر setLanguage
    }

    // 3. Render Public Profile Info & Bottom Nav Avatar
    const nameEl = document.getElementById("user-display-name");
    const avatarEl = document.getElementById("user-avatar");
    const navAvatarEl = document.getElementById("nav-user-avatar");

    if (nameEl) nameEl.textContent = fullName;
    if (avatarEl) {
      avatarEl.src = photoUrl;
      avatarEl.onerror = () => {
        avatarEl.src = generateFallbackAvatar(fullName);
      };
    }
    if (navAvatarEl) {
      navAvatarEl.src = photoUrl;
      navAvatarEl.onerror = () => {
        navAvatarEl.src = generateFallbackAvatar(fullName);
      };
    }

    // 4. Sync with Backend & Verify Owner Privilege
    const api = new ApiService(tg?.initData || "");
    currentApiService = api;
    let isOwner = false;
    let officialChannelUrl = "https://t.me/TelegaAdsOfficial";
    let botUsername = "TelegaAdsBot";

    const urlParams = new URLSearchParams(window.location.search);
    const refParam = urlParams.get("ref") || "";

    try {
      const syncResponse = await api.syncUser({
        firstName: tgUser.first_name || "",
        lastName: tgUser.last_name || "",
        languageCode: detectedLang,
        ...(refParam ? { ref: refParam } : {})
      });
      isOwner = Boolean(syncResponse?.isOwner);
      isCurrentOwner = isOwner;
      if (syncResponse?.officialChannel) officialChannelUrl = syncResponse.officialChannel;
      if (syncResponse?.botUsername) botUsername = syncResponse.botUsername;
    } catch {
      isOwner = false;
      isCurrentOwner = false;
    }

    // 5. Initialize Modules & Wallet Section
    initAdminModule(api, isOwner);
    const channelsCtrl = initChannelsModule(api);
    const campaignsCtrl = initCampaignsModule(api);
    currentChannelsCtrl = channelsCtrl;
    currentCampaignsCtrl = campaignsCtrl;

    initWalletAndReferralModule(activeUserId, botUsername, tg?.initData || "");
    initWalletEvents(getCurrentUserId, refreshAllData);
    initCampaignsEvents(getCurrentUserId, refreshAllData);
    initChannelsEvents(getCurrentUserId, refreshAllData);
    if (isOwner) {
      initAdminEvents(getCurrentUserId, refreshAllData);
    }

    setupLegacySectionNavigation();

    initNavigation((sectionId) => {
      if (sectionId === "section-channels") channelsCtrl.loadChannels();
      if (sectionId === "section-campaigns") campaignsCtrl.loadCampaigns(getCurrentUserId());
      if (sectionId === "section-wallet" && getCurrentUserId()) {
        loadWalletAndReferrals(getCurrentUserId(), refParam).catch(() => {});
      }
      if (sectionId === "section-admin" && isOwner) {
        loadAdminPanel().catch(() => {});
      }
    });

    // 6. Account & Refresh Interactive Buttons
    const triggerLanguageModal = () =>
      openLanguageModal(() => {
        channelsCtrl.loadChannels();
        campaignsCtrl.loadCampaigns(getCurrentUserId());
        if (getCurrentUserId()) {
          loadWalletAndReferrals(getCurrentUserId(), refParam).catch(() => {});
        }
      });

    document.getElementById("btn-header-lang")?.addEventListener("click", triggerLanguageModal);
    document.querySelector('[data-action="open-language"]')?.addEventListener("click", triggerLanguageModal);
    document.querySelector('[data-action="open-faq"]')?.addEventListener("click", openFaqModal);
    document.querySelector('[data-action="open-support"]')?.addEventListener("click", () =>
      openSupportModal(api, tg, botUsername)
    );

    document.querySelector('[data-action="open-channel"]')?.addEventListener("click", () => {
      if (tg?.openTelegramLink) {
        tg.openTelegramLink(officialChannelUrl);
      } else {
        window.open(officialChannelUrl, "_blank");
      }
    });

    document.getElementById("btn-toggle-lang")?.addEventListener("click", () => {
      const currentLang = getCurrentLanguage();
      const nextLang = currentLang === "ar" ? "en" : "ar";
      setLanguage(nextLang);
      try {
        applyTranslations();
      } catch {
        // تجاهل
      }
      requestAnimationFrame(() => updateActiveNavPill());
    });

    document.getElementById("btn-live-refresh")?.addEventListener("click", async () => {
      await refreshAllData();
      showToast("تم تحديث الأرصدة والبيانات لحظياً", "success");
    });

    document.getElementById("modal-close-btn")?.addEventListener("click", closeModal);
    document.getElementById("app-modal")?.addEventListener("click", (e) => {
      if (e.target.id === "app-modal") closeModal();
    });

    await refreshAllData();

    if (autoRefreshTimer) {
      clearInterval(autoRefreshTimer);
    }
    autoRefreshTimer = setInterval(() => {
      refreshAllData().catch(() => {});
    }, 30000);

    // 7. Reveal App Smoothly & Position Active Pill
    document.getElementById("app-loader")?.classList.add("hidden");
    document.getElementById("app-container")?.classList.remove("hidden");
    requestAnimationFrame(() => updateActiveNavPill());
  } catch (error) {
    console.error("[bootstrapApp Error]:", error);
    document.getElementById("app-loader")?.classList.add("hidden");
    document.getElementById("app-container")?.classList.remove("hidden");
  }
}

document.addEventListener("DOMContentLoaded", bootstrapApp);
