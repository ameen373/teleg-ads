import admin from "firebase-admin";
import dotenv from "dotenv";

dotenv.config();

if (!admin.apps.length) {
  const privateKey = process.env.FIREBASE_PRIVATE_KEY
    ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n")
    : undefined;

  if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && privateKey) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey
      })
    });
  } else {
    admin.initializeApp();
  }
}

export const db = admin.firestore();

export const Collections = {
  USERS: "users",
  CHANNELS: "channels",
  CAMPAIGNS: "campaigns",
  TICKETS: "support_tickets",
  AUDIT_LOGS: "security_audit_logs",
  TRANSACTIONS: "transactions",
  WITHDRAWALS: "withdrawals",
  EARNING_HOLDS: "earning_holds"
};

export const WALLET_CONSTANTS = {
  DEPOSIT_NETWORK: "USDT - BEP20",
  WITHDRAWAL_NETWORK: "USDT - TRC20",
  DEPOSIT_ADDRESS: "0xf9278f55585a0e6e35f12299493134056f2f19b0",
  MIN_DEPOSIT_USD: 10.0,
  MIN_WITHDRAWAL_USD: 30.0,
  WITHDRAWAL_FEE_USD: 3.0,
  EARNINGS_HOLD_HOURS: 24,
  REFERRAL_COMMISSION_RATE: 0.1,
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

export function createUserRecord(uid, data = {}) {
  const nowIso = new Date().toISOString();
  const fullName = [data.firstName, data.lastName].filter(Boolean).join(" ").trim();

  return {
    uid: String(uid),
    telegramId: data.telegramId ? String(data.telegramId) : String(uid),
    username: data.username || "",
    firstName: data.firstName || "",
    lastName: data.lastName || "",
    languageCode: data.languageCode || "en",
    email: data.email || "",
    name: data.name || fullName || "مستخدم",
    role: data.role === "admin" ? "admin" : "user",
    balanceUsd: roundMoney(data.balanceUsd ?? 0),
    pendingEarningsUsd: roundMoney(data.pendingEarningsUsd ?? 0),
    availableEarningsUsd: roundMoney(data.availableEarningsUsd ?? 0),
    totalSpentUsd: roundMoney(data.totalSpentUsd ?? 0),
    totalEarnedUsd: roundMoney(data.totalEarnedUsd ?? 0),
    referralEarningsUsd: roundMoney(data.referralEarningsUsd ?? 0),
    trc20WalletAddress: typeof data.trc20WalletAddress === "string" ? data.trc20WalletAddress.trim() : "",
    referralCode: data.referralCode || String(uid),
    referredBy: typeof data.referredBy === "string" && data.referredBy.trim() ? data.referredBy.trim() : null,
    createdAt: data.createdAt || nowIso,
    updatedAt: data.updatedAt || nowIso
  };
}

export function createEarningHoldRecord(data) {
  const earnedAtDate = data.earnedAt ? new Date(data.earnedAt) : new Date();
  const releaseAtDate = new Date(
    earnedAtDate.getTime() + WALLET_CONSTANTS.EARNINGS_HOLD_HOURS * 60 * 60 * 1000
  );

  return {
    id: data.id,
    userId: String(data.userId),
    sourceType: data.sourceType || "ad_payout",
    sourceId: data.sourceId || "",
    grossAmountUsd: roundMoney(data.grossAmountUsd),
    commissionPaidUsd: roundMoney(data.commissionPaidUsd ?? 0),
    netAmountUsd: roundMoney(data.netAmountUsd),
    released: Boolean(data.released ?? false),
    earnedAt: earnedAtDate.toISOString(),
    releaseAt: releaseAtDate.toISOString(),
    releasedAt: data.releasedAt || null
  };
}

export function createTransactionRecord(data) {
  const nowIso = new Date().toISOString();

  return {
    id: data.id,
    userId: String(data.userId),
    type: data.type,
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

export function createWithdrawalRequestRecord(data) {
  const nowIso = new Date().toISOString();
  const amountUsd = roundMoney(data.amountUsd);
  const feeUsd = roundMoney(data.feeUsd ?? WALLET_CONSTANTS.WITHDRAWAL_FEE_USD);
  const netAmountUsd = roundMoney(Math.max(0, amountUsd - feeUsd));
  const step = WITHDRAWAL_STEPS.includes(data.step) ? data.step : "submitted";
  const cleanAddress = typeof data.trc20Address === "string" ? data.trc20Address.trim() : "";

  return {
    id: data.id,
    userId: String(data.userId),
    amountUsd,
    feeUsd,
    netAmountUsd,
    network: WALLET_CONSTANTS.WITHDRAWAL_NETWORK,
    trc20Address: cleanAddress,
    status: data.status || TRANSACTION_STATUS.PENDING,
    step,
    stepHistory: data.stepHistory || [
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

export async function upsertTelegramUser(tgUser, extraData = {}) {
  try {
    const uid = String(tgUser.id);
    const userRef = db.collection(Collections.USERS).doc(uid);
    const snapshot = await userRef.get();
    const serverNow = admin.firestore.FieldValue.serverTimestamp();

    const profileUpdates = {
      telegramId: uid,
      username: tgUser.username || "",
      firstName: tgUser.first_name || "",
      lastName: tgUser.last_name || "",
      languageCode: tgUser.language_code || "en",
      updatedAt: serverNow
    };

    if (tgUser.first_name || tgUser.last_name) {
      profileUpdates.name = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(" ").trim();
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
    return updatedSnap.data();
  } catch (error) {
    console.error("[Firestore upsertTelegramUser Error]:", error);
    throw error;
  }
}

export async function logSecurityEvent(eventType, details) {
  try {
    await db.collection(Collections.AUDIT_LOGS).add({
      eventType,
      details,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
  } catch (error) {
    console.error("[Audit Log Error]:", error);
  }
}
