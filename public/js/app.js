import { detectSmartLanguage, setLanguage } from "./language/i18n.js";
import { ApiService } from "./modules/api.js";
import {
  initNavigation,
  openFaqModal,
  openLanguageModal,
  openSupportModal,
  updateActiveNavPill
} from "./modules/ui.js";
import { initChannelsModule } from "./modules/channels.js";
import { initCampaignsModule } from "./modules/campaigns.js";
import { initWalletAndReferralModule } from "./modules/wallet.js";
import { initAdminModule } from "./modules/admin.js";

function generateFallbackAvatar(name) {
  const initial = encodeURIComponent((name || "U").charAt(0).toUpperCase());
  return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="120" height="120" fill="%232aabee"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="white" font-size="52" font-family="sans-serif" font-weight="bold">${initial}</text></svg>`;
}

async function bootstrapApp() {
  const tg = window.Telegram?.WebApp;
  if (tg) {
    tg.ready();
    tg.expand();
    tg.setHeaderColor("#0b0f19");
    tg.setBackgroundColor("#0b0f19");
  }

  // 1. Smart User Detection
  const tgUser = tg?.initDataUnsafe?.user || {};
  const fullName = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(" ") || "Telegram User";
  const secretTelegramId = tgUser.id ? String(tgUser.id) : "";
  const secretUsername = tgUser.username ? String(tgUser.username) : "";
  const photoUrl = tgUser.photo_url || generateFallbackAvatar(fullName);

  // 2. Smart Language Detection
  const detectedLang = detectSmartLanguage(tgUser.language_code);
  setLanguage(detectedLang);

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
  let isOwner = false;
  let officialChannelUrl = "https://t.me/TelegaAdsOfficial";
  let botUsername = "TelegaAdsBot";

  try {
    const syncResponse = await api.syncUser({
      firstName: tgUser.first_name || "",
      lastName: tgUser.last_name || "",
      languageCode: detectedLang
    });
    isOwner = Boolean(syncResponse?.isOwner);
    if (syncResponse?.officialChannel) officialChannelUrl = syncResponse.officialChannel;
    if (syncResponse?.botUsername) botUsername = syncResponse.botUsername;
  } catch {
    isOwner = false;
  }

  // 5. Initialize Modules
  initAdminModule(api, isOwner);
  const channelsCtrl = initChannelsModule(api);
  const campaignsCtrl = initCampaignsModule(api);
  initWalletAndReferralModule(secretTelegramId || secretUsername, botUsername);

  initNavigation((sectionId) => {
    if (sectionId === "section-channels") channelsCtrl.loadChannels();
    if (sectionId === "section-campaigns") campaignsCtrl.loadCampaigns();
  });

  // 6. Account Interactive Buttons
  const triggerLanguageModal = () =>
    openLanguageModal(() => {
      channelsCtrl.loadChannels();
      campaignsCtrl.loadCampaigns();
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

  // 7. Reveal App Smoothly & Position Active Pill
  document.getElementById("app-loader")?.classList.add("hidden");
  document.getElementById("app-container")?.classList.remove("hidden");
  requestAnimationFrame(() => updateActiveNavPill());
}

document.addEventListener("DOMContentLoaded", bootstrapApp);
