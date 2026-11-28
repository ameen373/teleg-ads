import admin from "firebase-admin";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function initFirebase() {
  if (!admin.apps.length) {
    const serviceAccountPath = path.join(__dirname, "serviceAccountKey.json");
    const privateKey = process.env.FIREBASE_PRIVATE_KEY
      ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n")
      : undefined;

    if (
      process.env.FIREBASE_PROJECT_ID &&
      process.env.FIREBASE_CLIENT_EMAIL &&
      privateKey
    ) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey
        })
      });
    } else if (fs.existsSync(serviceAccountPath)) {
      const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
    } else {
      admin.initializeApp({
        credential: admin.credential.applicationDefault()
      });
    }
  }

  return admin.firestore();
}

export const db = initFirebase();

export const Collections = Object.freeze({
  // حسابي و المحفظة و الإحالة
  USERS: "users",
  TRANSACTIONS: "transactions",
  DEPOSITS: "deposits",
  WITHDRAWALS: "withdrawals",
  EARNINGS_LOCKS: "earningsLocks",
  REFERRALS: "referrals",

  // قنواتي و الترويج
  CHANNELS: "channels",
  CAMPAIGNS: "campaigns",
  PUBLISH_LOGS: "publishLogs",

  // الإدارة و النظام
  TICKETS: "support_tickets",
  BROADCASTS: "broadcasts",
  SYSTEM_CONFIG: "systemConfig",
  SECURITY_LOGS: "securityLogs",
  AUDIT_LOGS: "security_audit_logs",
  SMART_ALERTS: "smartAlerts",
  NOTIFICATIONS: "notifications",
  BACKUPS: "backups"
});

export const ALLOWED_LANGUAGES = Object.freeze([
  "English",
  "Chinese",
  "Hindi",
  "Spanish",
  "Arabic",
  "French",
  "Bengali",
  "Portuguese",
  "Indonesian",
  "Urdu",
  "Russian",
  "German",
  "Japanese",
  "Nigerian Pidgin",
  "Marathi",
  "Vietnamese",
  "Telugu",
  "Swahili",
  "Turkish"
]);

export const ALLOWED_CATEGORIES = Object.freeze([
  "entertainment",
  "news_media",
  "movies_series",
  "fashion_beauty",
  "gaming",
  "art_photography",
  "crypto",
  "technology",
  "education",
  "cooking",
  "health",
  "sports",
  "other"
]);

export const RULES = Object.freeze({
  MIN_DEPOSIT_USD: Number(process.env.MIN_DEPOSIT_USD) || 10,
  MIN_WITHDRAWAL_USD: Number(process.env.MIN_WITHDRAWAL_USD) || 30,
  WITHDRAWAL_FEE_USD: Number(process.env.WITHDRAWAL_FEE_USD) || 3,
  WITHDRAWAL_NETWORK: process.env.WITHDRAWAL_NETWORK || "USDT - TRC20",
  REFERRAL_COMMISSION_RATE: Number(process.env.REFERRAL_COMMISSION_RATE) || 0.10,
  MIN_CHANNEL_SUBSCRIBERS: Number(process.env.MIN_CHANNEL_SUBSCRIBERS) || 1000,
  OPEN_TARGETING_MIN_BUDGET: Number(process.env.OPEN_TARGETING_MIN_BUDGET) || 1000,
  EARNINGS_RELEASE_HOURS: 24,
  ANTI_BOT_MAX_VIEWS_PER_BATCH: Number(process.env.ANTI_BOT_MAX_VIEWS_PER_BATCH) || 25000,
  ANTI_BOT_MIN_INTERVAL_SEC: Number(process.env.ANTI_BOT_MIN_INTERVAL_SEC) || 10,
  BUDGET_LOW_ALERT_RATIO: Number(process.env.BUDGET_LOW_ALERT_RATIO) || 0.15,
  MIN_PRICE_PER_POST: 1,
  MAX_PRICE_PER_POST: 3,
  NETWORK: "USDT - BEP20",
  WALLET_ADDRESS:
    process.env.USDT_BEP20_ADDRESS || "0x742d35Cc6634C0532925a3b844Bc454e4438f44e"
});

export function roundMoney(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 100) / 100;
}

export function nowIso() {
  return new Date().toISOString();
}

export function createDefaultUser(userId, role = "user", referredBy = null) {
  const cleanId = String(userId);
  const normalizedRole = role === "admin" ? "admin" : "user";
  const cleanReferrer =
    referredBy && String(referredBy).trim() !== cleanId
      ? String(referredBy).trim()
      : null;
  const timestamp = nowIso();

  return {
    id: cleanId,
    telegramId: cleanId,
    username: "",
    firstName: "",
    lastName: "",
    languageCode: "en",
    role: normalizedRole,
    balance: 0,
    advertiserBalance: 0,
    publisherBalance: 0,
    walletBalance: 0,
    pendingEarnings: 0,
    availableEarnings: 0,
    referralEarnings: 0,
    referralEarningsTotal: 0,
    trc20Address: "",
    referredBy: cleanReferrer,
    banned: false,
    banReason: "",
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export async function upsertTelegramUser(tgUser, options = {}) {
  try {
    const cleanId = String(tgUser.id);
    const userRef = db.collection(Collections.USERS).doc(cleanId);
    const snapshot = await userRef.get();
    const serverTs = admin.firestore.FieldValue.serverTimestamp();
    const isoNow = nowIso();

    const profilePayload = {
      telegramId: cleanId,
      username: tgUser.username || "",
      firstName: tgUser.first_name || "",
      lastName: tgUser.last_name || "",
      languageCode: tgUser.language_code || "en",
      updatedAt: isoNow,
      lastSeenAt: serverTs
    };

    if (!snapshot.exists) {
      const baseUser = createDefaultUser(cleanId, options.role, options.referredBy);
      await userRef.set({
        ...baseUser,
        ...profilePayload,
        createdAt: isoNow,
        registeredAt: serverTs
      });
      return { ...baseUser, ...profilePayload, createdAt: isoNow };
    }

    await userRef.update(profilePayload);
    return { id: cleanId, ...snapshot.data(), ...profilePayload };
  } catch (error) {
    console.error("[Firestore upsertTelegramUser Error]:", error);
    throw error;
  }
}

export function buildTransactionRecord(payload) {
  return {
    id: payload.id,
    userId: String(payload.userId),
    walletRole: payload.walletRole || "advertiser",
    type: payload.type,
    amount: roundMoney(payload.amount),
    status: payload.status || "pending",
    campaignId: payload.campaignId || null,
    channelId: payload.channelId || null,
    idempotencyKey: payload.idempotencyKey || null,
    note: payload.note || "",
    txid: payload.txid || null,
    createdAt: nowIso()
  };
}

export function buildSecurityLogRecord(payload) {
  return {
    id: payload.id,
    actorId: payload.actorId || "system",
    actorRole: payload.actorRole || "system",
    action: payload.action,
    targetId: payload.targetId || null,
    details: payload.details || {},
    ip: payload.ip || null,
    createdAt: nowIso()
  };
}

export function buildAuditLogRecord(payload) {
  return {
    id: payload.id,
    entityType: payload.entityType,
    entityId: payload.entityId,
    severity: payload.severity || "medium",
    reason: payload.reason || "",
    meta: payload.meta || {},
    createdAt: nowIso()
  };
}

export function buildSmartAlertRecord(payload) {
  return {
    id: payload.id,
    userId: String(payload.userId),
    category: payload.category,
    title: payload.title,
    message: payload.message,
    read: false,
    isRead: false,
    createdAt: nowIso()
  };
}

export async function logSecurityEvent(eventType, details, meta = {}) {
  try {
    const timestamp = nowIso();
    await db.collection(Collections.AUDIT_LOGS).add({
      eventType,
      details,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: timestamp
    });

    await db.collection(Collections.SECURITY_LOGS).add({
      actorId: meta.actorId || "system",
      actorRole: meta.actorRole || "system",
      action: eventType,
      targetId: meta.targetId || null,
      details: typeof details === "object" && details !== null ? details : { message: details },
      ip: meta.ip || null,
      createdAt: timestamp
    });
  } catch (error) {
    console.error("[Audit Log Error]:", error);
  }
}

export default {
  admin,
  db,
  initFirebase,
  Collections,
  ALLOWED_LANGUAGES,
  ALLOWED_CATEGORIES,
  RULES,
  roundMoney,
  nowIso,
  createDefaultUser,
  upsertTelegramUser,
  buildTransactionRecord,
  buildSecurityLogRecord,
  buildAuditLogRecord,
  buildSmartAlertRecord,
  logSecurityEvent
};
