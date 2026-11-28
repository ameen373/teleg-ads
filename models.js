import admin from "firebase-admin";
import dotenv from "dotenv";

dotenv.config();

if (!admin.apps.length) {
  const rawKey = process.env.FIREBASE_PRIVATE_KEY;
  const privateKey = rawKey
    ? rawKey.trim().replace(/^["']|["']$/g, "").replace(/\\n/g, "\n")
    : undefined;

  const appOptions = {};

  if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && privateKey) {
    appOptions.credential = admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID.trim(),
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL.trim(),
      privateKey
    });
  }

  if (process.env.FIREBASE_STORAGE_BUCKET) {
    appOptions.storageBucket = process.env.FIREBASE_STORAGE_BUCKET.trim();
  }

  if (appOptions.credential || appOptions.storageBucket) {
    admin.initializeApp(appOptions);
  } else {
    admin.initializeApp();
  }
}

export const db = admin.firestore();

try {
  db.settings({ ignoreUndefinedProperties: true });
} catch {
  // تجاهل في حال تم ضبط إعدادات Firestore مسبقاً
}

export const bucket = process.env.FIREBASE_STORAGE_BUCKET
  ? admin.storage().bucket()
  : null;

export const FieldValue = admin.firestore.FieldValue;

// أسماء مجموعات قاعدة البيانات الموحدة
export const Collections = {
  USERS: "users",
  CHANNELS: "channels",
  CAMPAIGNS: "campaigns",
  DRAFTS: "campaign_drafts",
  POST_LOGS: "post_logs",
  TRANSACTIONS: "transactions",
  WITHDRAWALS: "withdrawals",
  EARNING_HOLDS: "earning_holds",
  NOTIFICATIONS: "notifications",
  SYSTEM_HEALTH: "system_health",
  BACKUPS: "database_backups",
  TICKETS: "support_tickets",
  AUDIT_LOGS: "security_audit_logs"
};

// مراجع مجموعات Firestore الجاهزة للاستخدام المباشر
export const CollectionRefs = {
  USERS: db.collection(Collections.USERS),
  CHANNELS: db.collection(Collections.CHANNELS),
  CAMPAIGNS: db.collection(Collections.CAMPAIGNS),
  DRAFTS: db.collection(Collections.DRAFTS),
  POST_LOGS: db.collection(Collections.POST_LOGS),
  TRANSACTIONS: db.collection(Collections.TRANSACTIONS),
  WITHDRAWALS: db.collection(Collections.WITHDRAWALS),
  EARNING_HOLDS: db.collection(Collections.EARNING_HOLDS),
  NOTIFICATIONS: db.collection(Collections.NOTIFICATIONS),
  SYSTEM_HEALTH: db.collection(Collections.SYSTEM_HEALTH),
  BACKUPS: db.collection(Collections.BACKUPS),
  TICKETS: db.collection(Collections.TICKETS),
  AUDIT_LOGS: db.collection(Collections.AUDIT_LOGS)
};

// الثوابت والقواعد المعتمدة في النظام والمحفظة
export const CONFIG = {
  BOT_USERNAME: "adTelega_bot",
  BOT_LINK: "https://t.me/adTelega_bot",
  MIN_CPM_PRICE: 1.0,
  MAX_CPM_PRICE: 3.0,
  AUTO_APPROVE_SUBSCRIBERS: 1000,
  OPEN_TARGETING_MIN_BUDGET: 1000.0,
  REFERRAL_COMMISSION_RATE: 0.10,
  MIN_DEPOSIT: 10.0,
  MIN_WITHDRAWAL: 30.0,
  WITHDRAWAL_FEE: 3.0
};

export const WALLET_CONSTANTS = {
  DEPOSIT_NETWORK: "USDT - BEP20",
  WITHDRAWAL_NETWORK: "USDT - TRC20",
  DEPOSIT_ADDRESS: "0xf9278f55585a0e6e35f12299493134056f2f19b0",
  MIN_DEPOSIT_USD: CONFIG.MIN_DEPOSIT,
  MIN_WITHDRAWAL_USD: CONFIG.MIN_WITHDRAWAL,
  WITHDRAWAL_FEE_USD: CONFIG.WITHDRAWAL_FEE,
  EARNINGS_HOLD_HOURS: 24,
  REFERRAL_COMMISSION_RATE: CONFIG.REFERRAL_COMMISSION_RATE,
  RECENT_TRANSACTIONS_LIMIT: 10
};

export const TRANSACTION_TYPES = {
  DEPOSIT: "deposit",
  WITHDRAWAL: "withdrawal",
  EARNING: "earning",
  REFERRAL_COMMISSION: "referral_commission",
  CAMPAIGN_SPEND: "campaign_spend",
  CAMPAIGN_REFUND: "campaign_refund",
  WITHDRAWAL_FEE: "withdrawal_fee"
};

export const TRANSACTION_STATUS = {
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
  PROCESSING: "processing",
  COMPLETED: "completed",
  FAILED: "failed"
};

export const WITHDRAWAL_STEPS = [
  "submitted",
  "under_review",
  "trc20_broadcast",
  "completed"
];

// اللغات الـ 19 المعتمدة
export const SUPPORTED_LANGUAGES = [
  { code: "en", label: "🇬🇧 English" },
  { code: "zh", label: "🇨🇳 Chinese" },
  { code: "hi", label: "🇮🇳 Hindi" },
  { code: "es", label: "🇪🇸 Spanish" },
  { code: "ar", label: "🇸🇦 Arabic" },
  { code: "fr", label: "🇫🇷 French" },
  { code: "bn", label: "🇧🇩 Bengali" },
  { code: "pt", label: "🇵🇹 Portuguese" },
  { code: "id", label: "🇮🇩 Indonesian" },
  { code: "ur", label: "🇵🇰 Urdu" },
  { code: "ru", label: "🇷🇺 Russian" },
  { code: "de", label: "🇩🇪 German" },
  { code: "ja", label: "🇯🇵 Japanese" },
  { code: "pcm", label: "🇳🇬 Nigerian Pidgin" },
  { code: "mr", label: "🇮🇳 Marathi" },
  { code: "vi", label: "🇻🇳 Vietnamese" },
  { code: "te", label: "🇮🇳 Telugu" },
  { code: "sw", label: "🇰🇪 Swahili" },
  { code: "tr", label: "🇹🇷 Turkish" }
];

// التصنيفات الـ 13 المعتمدة
export const CHANNEL_CATEGORIES = [
  { id: "entertainment", ar: "🎬 الترفيه", en: "🎬 Entertainment" },
  { id: "news", ar: "📰 الأخبار ووسائل الإعلام", en: "📰 News & Media" },
  { id: "movies", ar: "🍿 الأفلام والمسلسلات", en: "🍿 Movies & Series" },
  { id: "fashion", ar: "💄 الموضة والجمال", en: "💄 Fashion & Beauty" },
  { id: "gaming", ar: "🎮 الألعاب", en: "🎮 Gaming" },
  { id: "art", ar: "🎨 الفن والتصوير", en: "🎨 Art & Photography" },
  { id: "crypto", ar: "🪙 العملات المشفرة", en: "🪙 Cryptocurrency" },
  { id: "tech", ar: "💻 التقنيات", en: "💻 Technology" },
  { id: "education", ar: "📚 التعليم", en: "📚 Education" },
  { id: "cooking", ar: "🍳 الطبخ", en: "🍳 Cooking" },
  { id: "health", ar: "🩺 الصحة", en: "🩺 Health" },
  { id: "sports", ar: "⚽ الرياضة", en: "⚽ Sports" },
  { id: "other", ar: "🌐 أخرى", en: "🌐 Other" }
];

// دوال التحقق وتقريب المبالغ
export function roundMoney(amount) {
  const num = Number(amount);
  if (!Number.isFinite(num)) return 0;
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

export function isValidTrc20Address(address) {
  if (typeof address !== "string") return false;
  const trimmed = address.trim();
  return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(trimmed);
}

export function isValidTxid(txid) {
  if (typeof txid !== "string") return false;
  const trimmed = txid.trim();
  return /^(0x)?[0-9a-fA-F]{64}$/.test(trimmed) || /^[a-zA-Z0-9_-]{16,128}$/.test(trimmed);
}

// نموذج بيانات المستخدم الموحّد (الحساب + المحفظة + الإحالات + المفضلة)
export function createUserRecord(uid, data = {}) {
  const nowIso = new Date().toISOString();
  const safeUid = String(uid ?? "").trim();
  const fullName = [data.firstName, data.lastName].filter(Boolean).join(" ").trim();

  const advertiserBalance = roundMoney(data.advertiserBalance ?? data.balanceUsd ?? 0);
  const publisherBalance = roundMoney(data.publisherBalance ?? data.availableEarningsUsd ?? 0);
  const pendingEarnings = roundMoney(data.pendingEarnings ?? data.pendingEarningsUsd ?? 0);
  const totalReferralEarnings = roundMoney(
    data.totalReferralEarnings ?? data.referralEarningsUsd ?? 0
  );

  return {
    uid: safeUid,
    telegramId: data.telegramId ? String(data.telegramId) : safeUid,
    username: data.username || "",
    firstName: data.firstName || "User",
    lastName: data.lastName || "",
    languageCode: data.languageCode || "en",
    email: data.email || "",
    name: data.name || fullName || data.firstName || "User",
    role: data.role === "admin" ? "admin" : "user",
    advertiserBalance,
    publisherBalance,
    pendingEarnings,
    totalReferralEarnings,
    balanceUsd: advertiserBalance,
    pendingEarningsUsd: pendingEarnings,
    availableEarningsUsd: publisherBalance,
    totalSpentUsd: roundMoney(data.totalSpentUsd ?? 0),
    totalEarnedUsd: roundMoney(data.totalEarnedUsd ?? 0),
    referralEarningsUsd: totalReferralEarnings,
    trc20WalletAddress:
      typeof data.trc20WalletAddress === "string" ? data.trc20WalletAddress.trim() : "",
    referralCode: data.referralCode || safeUid,
    referredBy:
      typeof data.referredBy === "string" && data.referredBy.trim()
        ? data.referredBy.trim()
        : null,
    favoriteChannels: Array.isArray(data.favoriteChannels) ? data.favoriteChannels : [],
    createdAt: data.createdAt || nowIso,
    updatedAt: data.updatedAt || nowIso
  };
}

// دالة متوافقة مع الاستدعاء القديم createUserSchema(telegramUser, referrerId)
export function createUserSchema(telegramUser, referrerId = null) {
  const uid = String(telegramUser?.id ?? "").trim();
  return createUserRecord(uid, {
    telegramId: uid,
    username: telegramUser?.username || "",
    firstName: telegramUser?.first_name || "User",
    lastName: telegramUser?.last_name || "",
    languageCode: telegramUser?.language_code || "en",
    referredBy: referrerId ? String(referrerId) : null
  });
}

// نموذج بيانات القناة
export function createChannelSchema({
  chatId,
  username,
  title,
  photoUrl,
  subscribers,
  ownerId,
  cpmPrice,
  language,
  category
}) {
  const isAutoApproved = Number(subscribers) > CONFIG.AUTO_APPROVE_SUBSCRIBERS;
  return {
    chatId: String(chatId),
    username: String(username || ""),
    title: String(title || ""),
    photoUrl: photoUrl || "",
    subscribers: Number(subscribers) || 0,
    ownerId: String(ownerId),
    cpmPrice: Number(cpmPrice),
    language: String(language),
    category: String(category),
    status: isAutoApproved ? "approved" : "pending_admin",
    botHasAdmin: true,
    promoPostSent: false,
    promoMessageId: null,
    totalViewsDelivered: 0,
    totalEarned: 0.0,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

// نموذج بيانات الحملة الإعلانية
export function createCampaignSchema({
  advertiserId,
  title,
  adText,
  mediaUrl,
  mediaType,
  buttonText,
  buttonUrl,
  budget,
  targeting,
  scheduleType,
  scheduledAt,
  status
}) {
  const cleanBudget = roundMoney(budget);
  return {
    advertiserId: String(advertiserId),
    title: String(title || ""),
    adText: String(adText || ""),
    mediaUrl: mediaUrl || "",
    mediaType: mediaType || "none",
    buttonText: String(buttonText || "Open"),
    buttonUrl: String(buttonUrl || ""),
    totalBudget: cleanBudget,
    remainingBudget: cleanBudget,
    spentBudget: 0.0,
    targeting: {
      minPrice: Number(targeting?.minPrice ?? CONFIG.MIN_CPM_PRICE),
      maxPrice: Number(targeting?.maxPrice ?? CONFIG.MAX_CPM_PRICE),
      languages: Array.isArray(targeting?.languages) ? targeting.languages : [],
      categories: Array.isArray(targeting?.categories) ? targeting.categories : [],
      openTargeting: Boolean(
        targeting?.openTargeting && Number(budget) > CONFIG.OPEN_TARGETING_MIN_BUDGET
      ),
      specificChannelIds: Array.isArray(targeting?.specificChannelIds)
        ? targeting.specificChannelIds
        : []
    },
    scheduleType: scheduleType || "immediate",
    scheduledAt: scheduledAt || null,
    status: status || "active",
    stats: {
      totalViews: 0,
      channelsPublished: 0,
      lastSyncAt: Date.now()
    },
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

// نموذج حجز الأرباح لدورة 24 ساعة
export function createEarningHoldRecord(data = {}) {
  const earnedAtDate = data.earnedAt ? new Date(data.earnedAt) : new Date();
  const safeEarnedAt = Number.isNaN(earnedAtDate.getTime()) ? new Date() : earnedAtDate;
  const releaseAtDate = new Date(
    safeEarnedAt.getTime() + WALLET_CONSTANTS.EARNINGS_HOLD_HOURS * 60 * 60 * 1000
  );

  return {
    id: data.id || "",
    userId: String(data.userId ?? ""),
    sourceType: data.sourceType || "ad_payout",
    sourceId: data.sourceId || "",
    grossAmountUsd: roundMoney(data.grossAmountUsd),
    commissionPaidUsd: roundMoney(data.commissionPaidUsd ?? 0),
    netAmountUsd: roundMoney(data.netAmountUsd),
    released: Boolean(data.released ?? false),
    earnedAt: safeEarnedAt.toISOString(),
    releaseAt: releaseAtDate.toISOString(),
    releasedAt: data.releasedAt || null
  };
}

// نموذج المعاملة المالية
export function createTransactionRecord(data = {}) {
  const nowIso = new Date().toISOString();

  return {
    id: data.id || "",
    userId: String(data.userId ?? ""),
    type: data.type || TRANSACTION_TYPES.EARNING,
    status: data.status || TRANSACTION_STATUS.PENDING,
    amountUsd: roundMoney(data.amountUsd),
    feeUsd: roundMoney(data.feeUsd ?? 0),
    netAmountUsd: roundMoney(data.netAmountUsd ?? data.amountUsd),
    network: data.network || null,
    address: data.address || null,
    txid: data.txid || null,
    campaignId: data.campaignId || null,
    fromUserId: data.fromUserId || null,
    notes: data.notes || "",
    createdAt: data.createdAt || nowIso,
    updatedAt: data.updatedAt || nowIso
  };
}

// نموذج طلب السحب
export function createWithdrawalRequestRecord(data = {}) {
  const nowIso = new Date().toISOString();
  const amountUsd = roundMoney(data.amountUsd);
  const feeUsd = roundMoney(data.feeUsd ?? WALLET_CONSTANTS.WITHDRAWAL_FEE_USD);
  const netAmountUsd = roundMoney(Math.max(0, amountUsd - feeUsd));
  const step = WITHDRAWAL_STEPS.includes(data.step) ? data.step : "submitted";
  const cleanAddress =
    typeof data.trc20Address === "string" ? data.trc20Address.trim() : "";

  return {
    id: data.id || "",
    userId: String(data.userId ?? ""),
    amountUsd,
    feeUsd,
    netAmountUsd,
    network: WALLET_CONSTANTS.WITHDRAWAL_NETWORK,
    trc20Address: cleanAddress,
    status: data.status || TRANSACTION_STATUS.PENDING,
    step,
    stepHistory: Array.isArray(data.stepHistory)
      ? data.stepHistory
      : [
          {
            step: "submitted",
            label: "تم استلام طلب السحب",
            timestamp: nowIso
          }
        ],
    txHash: data.txHash || null,
    adminNote: data.adminNote || "",
    createdAt: data.createdAt || nowIso,
    updatedAt: data.updatedAt || nowIso
  };
}

// إنشاء أو تحديث مستخدم تيليجرام في Firestore
export async function upsertTelegramUser(tgUser, extraData = {}) {
  try {
    if (!tgUser || tgUser.id === undefined || tgUser.id === null || String(tgUser.id).trim() === "") {
      throw new Error("Invalid Telegram user payload: missing id");
    }

    const uid = String(tgUser.id).trim();
    const userRef = db.collection(Collections.USERS).doc(uid);
    const snapshot = await userRef.get();
    const serverNow = FieldValue.serverTimestamp();

    const profileUpdates = {
      uid,
      telegramId: uid,
      username: tgUser.username || "",
      firstName: tgUser.first_name || "",
      lastName: tgUser.last_name || "",
      languageCode: tgUser.language_code || "en",
      updatedAt: serverNow
    };

    if (tgUser.first_name || tgUser.last_name) {
      profileUpdates.name = [tgUser.first_name, tgUser.last_name]
        .filter(Boolean)
        .join(" ")
        .trim();
    }

    if (!snapshot.exists) {
      const baseRecord = createUserRecord(uid, {
        ...extraData,
        telegramId: uid,
        username: tgUser.username || "",
        firstName: tgUser.first_name || "",
        lastName: tgUser.last_name || "",
        languageCode: tgUser.language_code || "en"
      });

      await userRef.set({
        ...baseRecord,
        createdAt: serverNow,
        updatedAt: serverNow
      });

      return baseRecord;
    }

    await userRef.update(profileUpdates);
    const updatedSnap = await userRef.get();
    return updatedSnap.data() || { uid, ...profileUpdates };
  } catch (error) {
    console.error("[Firestore upsertTelegramUser Error]:", error);
    throw error;
  }
}

// تسجيل الأحداث الأمنية في Firestore
export async function logSecurityEvent(eventType, details = {}) {
  try {
    await db.collection(Collections.AUDIT_LOGS).add({
      eventType: String(eventType || "unknown_event"),
      details: details ?? {},
      timestamp: FieldValue.serverTimestamp()
    });
  } catch (error) {
    console.error("[Audit Log Error]:", error);
  }
}
