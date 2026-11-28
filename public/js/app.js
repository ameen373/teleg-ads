import { detectSmartLanguage, setLanguage, ALL_19_LANGUAGES, getLang } from "./language/i18n.js";
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

async function safeImport(path) {
  try {
    return await import(path);
  } catch {
    return {};
  }
}

function generateFallbackAvatar(name) {
  const initial = encodeURIComponent((name || "U").charAt(0).toUpperCase());
  return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="120" height="120" fill="%232aabee"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="white" font-size="52" font-family="sans-serif" font-weight="bold">${initial}</text></svg>`;
}

function getReferralCodeFromUrl(tg) {
  try {
    const startParam = tg?.initDataUnsafe?.start_param;
    if (startParam) return String(startParam).trim();
    const params = new URLSearchParams(window.location.search);
    return (params.get("ref") || params.get("start") || "").trim();
  } catch {
    return "";
  }
}

function resolveUserId(tgUser) {
  try {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get("uid")?.trim();
    if (fromQuery) {
      localStorage.setItem("telega_ads_uid", fromQuery);
      return fromQuery;
    }
  } catch {
    // تجاهل أخطاء الوصول إلى URL أو localStorage
  }

  const tgId = tgUser?.id ? String(tgUser.id).trim() : "";
  const tgUsername = tgUser?.username ? String(tgUser.username).trim() : "";
  if (tgId || tgUsername) {
    return tgId || tgUsername;
  }

  try {
    const saved = localStorage.getItem("telega_ads_uid")?.trim();
    if (saved) return saved;
  } catch {
    // تجاهل أخطاء localStorage
  }

  return "";
}

function populateSelectOptions() {
  const meta = window.__TELEGA_META__;
  const langSwitcher = document.getElementById("lang-switcher");
  const chLang = document.getElementById("channel-language");
  const targetLang = document.getElementById("target-language");
  const chCat = document.getElementById("channel-category");
  const targetCat = document.getElementById("target-category");

  const activeLang = getLang();

  if (langSwitcher) {
    langSwitcher.innerHTML = ALL_19_LANGUAGES.map(
      (l) => `<option value="${l.code}" ${l.code === activeLang ? "selected" : ""}>${l.label}</option>`
    ).join("");
  }

  if (chLang) {
    chLang.innerHTML = ALL_19_LANGUAGES.map(
      (l) => `<option value="${l.code}">${l.label}</option>`
    ).join("");
  }

  if (targetLang) {
    targetLang.innerHTML =
      `<option value="all">الكل / All</option>` +
      ALL_19_LANGUAGES.map((l) => `<option value="${l.code}">${l.label}</option>`).join("");
  }

  if (meta?.categories) {
    const catOptions = (meta.categories || []).map(
      (c) => `<option value="${c.id}">${activeLang === "ar" ? c.ar : c.en}</option>`
    );
    if (chCat) chCat.innerHTML = catOptions.join("");
    if (targetCat) targetCat.innerHTML = `<option value="all">الكل / All</option>` + catOptions.join("");
  }
}

async function renderReferralSection(userId, optionalHelpers) {
  if (!userId) return;

  const { fetchReferrals } = optionalHelpers.apiMod;
  const { formatUsd, formatDate } = optionalHelpers.uiMod;
  const { t } = optionalHelpers.i18nMod;

  if (typeof fetchReferrals !== "function") return;

  const data = await fetchReferrals(userId);
  if (!data) return;

  const linkInput = document.getElementById("referralLinkInput");
  if (linkInput) {
    const baseUrl = `${window.location.origin}${window.location.pathname}`;
    const code = data.referralCode || userId;
    linkInput.value = `${baseUrl}?ref=${encodeURIComponent(code)}`;
  }

  const countEl = document.getElementById("statReferredCount");
  if (countEl) countEl.textContent = String(data.referredCount || 0);

  const earnedEl = document.getElementById("statReferralTotalEarned");
  if (earnedEl && typeof formatUsd === "function") {
    earnedEl.textContent = formatUsd(data.referralEarningsUsd || 0);
  }

  const tbody = document.getElementById("referredUsersBody");
  if (tbody) {
    const list = Array.isArray(data.referredUsers) ? data.referredUsers : [];
    if (!list.length) {
      const noDataText = typeof t === "function" ? t("noData") : "No data";
      tbody.innerHTML = `<tr><td colspan="3">${noDataText}</td></tr>`;
    } else {
      tbody.innerHTML = list
        .map((u) => {
          const earnedFormatted =
            typeof formatUsd === "function"
              ? formatUsd(u.totalEarnedUsd)
              : String(u.totalEarnedUsd ?? 0);
          const dateFormatted =
            typeof formatDate === "function"
              ? formatDate(u.createdAt)
              : String(u.createdAt ?? "");
          return `
            <tr>
              <td><code>${u.uid ?? ""}</code></td>
              <td>${earnedFormatted}</td>
              <td>${dateFormatted}</td>
            </tr>
          `;
        })
        .join("");
    }
  }
}

export async function bootstrapApp() {
  const tg = window.Telegram?.WebApp;
  if (tg) {
    tg.ready();
    tg.expand();
    tg.setHeaderColor("#0b0f19");
    tg.setBackgroundColor("#0b0f19");
  }

  const [i18nMod, apiMod, uiMod, walletMod, adminMod] = await Promise.all([
    safeImport("./language/i18n.js"),
    safeImport("./modules/api.js"),
    safeImport("./modules/ui.js"),
    safeImport("./modules/wallet.js"),
    safeImport("./modules/admin.js")
  ]);

  const optionalHelpers = { i18nMod, apiMod, uiMod, walletMod, adminMod };
  const showAlert = typeof uiMod.showAlert === "function" ? uiMod.showAlert : null;
  const showToast = typeof uiMod.showToast === "function" ? uiMod.showToast : null;

  // 1. Smart User & Referral Detection
  const tgUser = tg?.initDataUnsafe?.user || {};
  const fullName =
    [tgUser.first_name, tgUser.last_name].filter(Boolean).join(" ") || "Telegram User";
  const secretTelegramId = tgUser.id ? String(tgUser.id) : "";
  const secretUsername = tgUser.username ? String(tgUser.username) : "";
  const photoUrl = tgUser.photo_url || generateFallbackAvatar(fullName);

  const resolvedId = resolveUserId(tgUser);
  let currentUserId = resolvedId || secretTelegramId || secretUsername || "user_demo_01";
  const incomingRef = getReferralCodeFromUrl(tg);
  const getUserId = () => currentUserId;

  // 2. Smart Language Detection & Translations
  const detectedLang = detectSmartLanguage(tgUser.language_code);
  setLanguage(detectedLang);
  if (typeof i18nMod.applyTranslations === "function") {
    try {
      i18nMod.applyTranslations();
    } catch {
      // تجاهل أخطاء الترجمة الأولية
    }
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

  const uidInput = document.getElementById("activeUserIdInput");
  if (uidInput) uidInput.value = currentUserId;

  // 4. Sync with Backend & Verify Owner Privilege
  const apiClient = new ApiService(tg?.initData || "");
  let isOwner = false;
  let officialChannelUrl = "https://t.me/TelegaAdsOfficial";
  let botUsername = "TelegaAdsBot";

  if (typeof apiMod.api?.getMeta === "function") {
    try {
      window.__TELEGA_META__ = await apiMod.api.getMeta();
      populateSelectOptions();
    } catch {
      // عدم إيقاف التطبيق إذا لم يكن getMeta متاحاً
    }
  }

  try {
    const syncResponse = await apiClient.syncUser({
      firstName: tgUser.first_name || "",
      lastName: tgUser.last_name || "",
      languageCode: detectedLang,
      referredBy: incomingRef || undefined
    });
    isOwner = Boolean(syncResponse?.isOwner);
    if (syncResponse?.officialChannel) officialChannelUrl = syncResponse.officialChannel;
    if (syncResponse?.botUsername) botUsername = syncResponse.botUsername;
  } catch {
    isOwner = false;
  }

  if (!isOwner && typeof apiMod.api?.getAdminHealth === "function") {
    try {
      await apiMod.api.getAdminHealth(currentUserId);
      isOwner = true;
    } catch {
      // تبقى صلاحية المالك مطابقة للخادم
    }
  }

  if (typeof apiMod.initUser === "function") {
    try {
      await apiMod.initUser(currentUserId, { referredBy: incomingRef });
    } catch {
      // عدم إيقاف تشغيل التطبيق إذا لم يكن endpoint التهيئة متاحاً
    }
  }

  const refreshWalletAndReferrals = async () => {
    if (typeof walletMod.refreshWallet === "function") {
      await walletMod.refreshWallet(currentUserId, incomingRef);
    }
    await renderReferralSection(currentUserId, optionalHelpers);
  };

  // 5. Initialize Modules
  initAdminModule(apiClient, isOwner);
  const channelsCtrl = initChannelsModule(apiClient);
  const campaignsCtrl = initCampaignsModule(apiClient);
  initWalletAndReferralModule(
    secretTelegramId || secretUsername || currentUserId,
    botUsername
  );

  if (typeof walletMod.bindWalletEvents === "function") {
    try {
      walletMod.bindWalletEvents(getUserId, refreshWalletAndReferrals);
    } catch {
      // تجاهل أخطاء الربط الاختيارية
    }
  }

  if (typeof adminMod.bindAdminEvents === "function") {
    try {
      adminMod.bindAdminEvents(() => {
        if (typeof walletMod.refreshWallet === "function") {
          return walletMod.refreshWallet(currentUserId, incomingRef);
        }
        return Promise.resolve();
      });
    } catch {
      // تجاهل أخطاء ربط الأدمن الاختيارية
    }
  }

  initNavigation((sectionId) => {
    if (sectionId === "section-channels") channelsCtrl?.loadChannels?.();
    if (sectionId === "section-campaigns") campaignsCtrl?.loadCampaigns?.();
    if (sectionId === "section-wallet" || sectionId === "section-referral" || sectionId === "section-referrals") {
      renderReferralSection(currentUserId, optionalHelpers).catch(() => {});
    }
  });

  if (typeof uiMod.activateSection === "function") {
    document.querySelectorAll(".nav-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = btn.getAttribute("data-section") || btn.getAttribute("data-target");
        if (target) {
          uiMod.activateSection(target);
        }
      });
    });
  }

  // 6. Account, Notifications & Referral Interactive Controls
  const triggerLanguageModal = () =>
    openLanguageModal(() => {
      populateSelectOptions();
      channelsCtrl?.loadChannels?.();
      campaignsCtrl?.loadCampaigns?.();
      renderReferralSection(currentUserId, optionalHelpers).catch(() => {});
    });

  document.getElementById("btn-header-lang")?.addEventListener("click", triggerLanguageModal);
  document
    .querySelector('[data-action="open-language"]')
    ?.addEventListener("click", triggerLanguageModal);

  document.getElementById("lang-switcher")?.addEventListener("change", (e) => {
    setLanguage(e.target.value);
    populateSelectOptions();
  });

  const langToggleBtn = document.getElementById("langToggleBtn");
  if (
    langToggleBtn &&
    typeof i18nMod.setLang === "function" &&
    typeof i18nMod.getLang === "function"
  ) {
    langToggleBtn.addEventListener("click", () => {
      const nextLang = i18nMod.getLang() === "ar" ? "en" : "ar";
      i18nMod.setLang(nextLang);
      if (typeof i18nMod.applyTranslations === "function") {
        i18nMod.applyTranslations();
      }
      populateSelectOptions();
      refreshWalletAndReferrals().catch((err) => {
        if (showAlert) showAlert(err.message, "error");
      });
    });
  }

  const switchBtn = document.getElementById("switchUserBtn");
  if (switchBtn && uidInput) {
    switchBtn.addEventListener("click", async () => {
      const nextUid = uidInput.value.trim();
      if (!nextUid) return;
      currentUserId = nextUid;
      try {
        localStorage.setItem("telega_ads_uid", currentUserId);
      } catch {
        // تجاهل أخطاء localStorage
      }
      try {
        if (typeof apiMod.initUser === "function") {
          await apiMod.initUser(currentUserId, { referredBy: incomingRef });
        }
        await refreshWalletAndReferrals();
        if (showAlert) {
          showAlert(`تم التبديل إلى الحساب: ${currentUserId}`, "success");
        }
      } catch (err) {
        if (showAlert) showAlert(err.message, "error");
      }
    });
  }

  const refreshBtn = document.getElementById("refreshWalletBtn");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", async () => {
      try {
        await refreshWalletAndReferrals();
        if (showAlert) {
          showAlert("تم تحديث البيانات لحظياً", "success");
        }
      } catch (err) {
        if (showAlert) showAlert(err.message, "error");
      }
    });
  }

  const copyRefBtn = document.getElementById("copyReferralLinkBtn");
  if (copyRefBtn && typeof uiMod.copyToClipboard === "function") {
    copyRefBtn.addEventListener("click", async () => {
      const val = document.getElementById("referralLinkInput")?.value || "";
      await uiMod.copyToClipboard(val);
      if (showAlert) {
        const copiedMsg = typeof i18nMod.t === "function" ? i18nMod.t("copied") : "Copied";
        showAlert(copiedMsg, "success");
      }
    });
  }

  document.querySelector('[data-action="open-faq"]')?.addEventListener("click", openFaqModal);
  document.querySelector('[data-action="open-support"]')?.addEventListener("click", () =>
    openSupportModal(apiClient, tg, botUsername)
  );

  document.querySelector('[data-action="open-channel"]')?.addEventListener("click", () => {
    if (tg?.openTelegramLink) {
      tg.openTelegramLink(officialChannelUrl);
    } else {
      window.open(officialChannelUrl, "_blank");
    }
  });

  if (typeof apiMod.api?.getNotifications === "function" && typeof uiMod.renderNotificationsModal === "function") {
    try {
      const { notifications } = await apiMod.api.getNotifications(currentUserId);
      uiMod.renderNotificationsModal(notifications || []);
    } catch {
      // عدم إيقاف التطبيق عند فشل جلب الإشعارات
    }
  }

  document.getElementById("btn-notifications")?.addEventListener("click", async () => {
    if (typeof apiMod.api?.getNotifications === "function" && typeof uiMod.renderNotificationsModal === "function") {
      try {
        const { notifications } = await apiMod.api.getNotifications(currentUserId);
        uiMod.renderNotificationsModal(notifications || []);
      } catch {
        // تجاهل الخطأ عند فتح النافذة
      }
    }
    document.getElementById("notifications-modal")?.classList.remove("hidden");
  });

  document.getElementById("btn-close-notifications")?.addEventListener("click", () => {
    document.getElementById("notifications-modal")?.classList.add("hidden");
  });

  // تحميل بيانات الإحالة الأولية بأمان دون تعطيل الواجهة
  renderReferralSection(currentUserId, optionalHelpers).catch(() => {});

  // 7. Reveal App Smoothly & Position Active Pill
  document.getElementById("app-loader")?.classList.add("hidden");
  document.getElementById("app-container")?.classList.remove("hidden");
  requestAnimationFrame(() => updateActiveNavPill());

  if (showToast) {
    showToast("Telega.ads جاهز");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  bootstrapApp().catch((err) => {
    console.error("Boot error:", err);
    document.getElementById("app-loader")?.classList.add("hidden");
    document.getElementById("app-container")?.classList.remove("hidden");
  });
});
