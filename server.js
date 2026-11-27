import express from "express";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import {
  Collections,
  db,
  logSecurityEvent,
  upsertTelegramUser,
  WALLET_CONSTANTS,
  TRANSACTION_TYPES,
  TRANSACTION_STATUS,
  WITHDRAWAL_STEPS,
  roundMoney,
  isValidTrc20Address,
  isValidTxid,
  createUserRecord,
  createEarningHoldRecord,
  createTransactionRecord,
  createWithdrawalRequestRecord
} from "./models.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(
  helmet({
    contentSecurityPolicy: false
  })
);
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function parseNumberEnv(rawValue, fallback) {
  const num = Number(rawValue);
  return Number.isFinite(num) && num > 0 ? num : fallback;
}

const config = {
  port: parseNumberEnv(process.env.PORT, 3000),
  depositAddress: (process.env.DEPOSIT_WALLET_BEP20 || WALLET_CONSTANTS.DEPOSIT_ADDRESS).trim(),
  minDepositUsd: parseNumberEnv(process.env.MIN_DEPOSIT_USD, WALLET_CONSTANTS.MIN_DEPOSIT_USD),
  minWithdrawalUsd: parseNumberEnv(
    process.env.MIN_WITHDRAWAL_USD,
    WALLET_CONSTANTS.MIN_WITHDRAWAL_USD
  ),
  withdrawalFeeUsd: parseNumberEnv(
    process.env.WITHDRAWAL_FEE_USD,
    WALLET_CONSTANTS.WITHDRAWAL_FEE_USD
  ),
  earningsHoldHours: parseNumberEnv(
    process.env.EARNINGS_HOLD_HOURS,
    WALLET_CONSTANTS.EARNINGS_HOLD_HOURS
  ),
  referralCommissionRate: parseNumberEnv(
    process.env.REFERRAL_COMMISSION_RATE,
    WALLET_CONSTANTS.REFERRAL_COMMISSION_RATE
  ),
  adminApiKey: (process.env.ADMIN_API_KEY || "").trim()
};

const collectionNames = {
  users: Collections?.USERS || "users",
  channels: Collections?.CHANNELS || "channels",
  campaigns: Collections?.CAMPAIGNS || "campaigns",
  tickets: Collections?.TICKETS || "support_tickets",
  transactions: Collections?.TRANSACTIONS || "transactions",
  deposits: Collections?.DEPOSITS || "deposits",
  withdrawals: Collections?.WITHDRAWALS || "withdrawals",
  earningHolds: Collections?.EARNING_HOLDS || "earning_holds"
};

const collections = {
  users: db.collection(collectionNames.users),
  channels: db.collection(collectionNames.channels),
  campaigns: db.collection(collectionNames.campaigns),
  tickets: db.collection(collectionNames.tickets),
  transactions: db.collection(collectionNames.transactions),
  deposits: db.collection(collectionNames.deposits),
  withdrawals: db.collection(collectionNames.withdrawals),
  earningHolds: db.collection(collectionNames.earningHolds)
};

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

function generateId(prefix) {
  return `${prefix}_${crypto.randomBytes(6).toString("hex")}`;
}

function toTimeMs(val) {
  if (!val) return 0;
  if (typeof val === "object" && typeof val.toMillis === "function") {
    return val.toMillis();
  }
  if (typeof val === "object" && typeof val._seconds === "number") {
    return val._seconds * 1000;
  }
  const parsed = new Date(val).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function sortByCreatedAtDesc(items) {
  return [...items].sort((a, b) => toTimeMs(b?.createdAt) - toTimeMs(a?.createdAt));
}

// التحقق المشفر من بيانات تيليجرام (HMAC-SHA256) لضمان عدم تزوير الهوية
function verifyTelegramWebAppData(initData) {
  if (!initData || !process.env.BOT_TOKEN) return null;
  try {
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get("hash");
    if (!hash) return null;

    urlParams.delete("hash");
    const dataCheckString = Array.from(urlParams.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, val]) => `${key}=${val}`)
      .join("\n");

    const secretKey = crypto
      .createHmac("sha256", "WebAppData")
      .update(process.env.BOT_TOKEN)
      .digest();

    const calculatedHash = crypto
      .createHmac("sha256", secretKey)
      .update(dataCheckString)
      .digest("hex");

    if (calculatedHash !== hash) return null;

    const userRaw = urlParams.get("user");
    return userRaw ? JSON.parse(userRaw) : null;
  } catch {
    return null;
  }
}

// Middleware لاستخراج المستخدم بشكل آمن
const telegramAuthMiddleware = asyncHandler(async (req, res, next) => {
  const initData = req.headers["x-telegram-init-data"];
  const verifiedUser = verifyTelegramWebAppData(initData);

  if (!verifiedUser || !verifiedUser.id) {
    await logSecurityEvent("UNVERIFIED_ACCESS_ATTEMPT", { ip: req.ip, path: req.path });
    return res.status(401).json({ error: "Unauthorized Telegram session" });
  }

  req.tgUser = verifiedUser;
  req.uid = String(verifiedUser.id);
  req.isOwner =
    Boolean(process.env.ADMIN_TELEGRAM_ID) &&
    String(verifiedUser.id) === String(process.env.ADMIN_TELEGRAM_ID).trim();
  next();
});

// Middleware حصري للمالك فقط (يدعم جلسة المالك أو مفتاح الإدارة إن وُجد)
const ownerOnlyMiddleware = asyncHandler(async (req, res, next) => {
  const providedKey = String(
    req.header("x-admin-key") || (req.body && req.body.adminKey) || ""
  ).trim();
  const hasValidApiKey = Boolean(config.adminApiKey) && providedKey === config.adminApiKey;

  if (!req.isOwner && !hasValidApiKey) {
    await logSecurityEvent("ADMIN_BREACH_ATTEMPT", {
      userId: req.tgUser?.id,
      username: req.tgUser?.username
    });
    return res.status(403).json({ error: "Forbidden: Owner access only" });
  }
  next();
});

async function ensureUserDoc(uid, extra = {}) {
  const safeUid = String(uid || "").trim();
  if (!safeUid) return null;

  const userRef = collections.users.doc(safeUid);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists) {
      let referredBy = extra.referredBy ? String(extra.referredBy).trim() : null;
      if (referredBy === safeUid) {
        referredBy = null;
      }
      if (referredBy) {
        const refSnap = await tx.get(collections.users.doc(referredBy));
        if (!refSnap.exists) {
          referredBy = null;
        }
      }
      const record = createUserRecord(safeUid, { ...extra, referredBy });
      tx.set(userRef, record);
      return record;
    }

    const existing = snap.data() || {};
    const updates = {};
    if (extra.email && !existing.email) updates.email = extra.email;
    if (extra.name && (!existing.name || existing.name === "مستخدم")) updates.name = extra.name;
    if (
      extra.referredBy &&
      !existing.referredBy &&
      String(extra.referredBy).trim() !== safeUid
    ) {
      const candidateRefId = String(extra.referredBy).trim();
      const refSnap = await tx.get(collections.users.doc(candidateRefId));
      if (refSnap.exists) {
        updates.referredBy = candidateRefId;
      }
    }

    if (Object.keys(updates).length > 0) {
      updates.updatedAt = new Date().toISOString();
      tx.update(userRef, updates);
      return { ...existing, ...updates };
    }
    return existing;
  });
}

async function releaseMatureEarningsForUser(uid) {
  const safeUid = String(uid || "").trim();
  if (!safeUid) return;

  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const userRef = collections.users.doc(safeUid);

  const userHoldsSnap = await collections.earningHolds.where("userId", "==", safeUid).get();
  if (userHoldsSnap.empty) return;

  const candidateRefs = userHoldsSnap.docs
    .filter((docSnap) => {
      const d = docSnap.data() || {};
      return d.released === false && toTimeMs(d.releaseAt) > 0 && toTimeMs(d.releaseAt) <= nowMs;
    })
    .map((docSnap) => docSnap.ref);

  if (candidateRefs.length === 0) return;

  await db.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists) return;

    let totalToRelease = 0;
    const validDocs = [];

    for (const ref of candidateRefs) {
      const freshSnap = await tx.get(ref);
      if (!freshSnap.exists) continue;
      const holdData = freshSnap.data() || {};
      if (!holdData.released && toTimeMs(holdData.releaseAt) <= nowMs) {
        totalToRelease = roundMoney(totalToRelease + Number(holdData.netAmountUsd || 0));
        validDocs.push(ref);
      }
    }

    if (totalToRelease <= 0 || validDocs.length === 0) return;

    const userData = userSnap.data() || {};
    const currentPending = roundMoney(userData.pendingEarningsUsd || 0);
    const currentAvailable = roundMoney(userData.availableEarningsUsd || 0);
    const newPending = roundMoney(Math.max(0, currentPending - totalToRelease));
    const newAvailable = roundMoney(currentAvailable + totalToRelease);

    for (const ref of validDocs) {
      tx.update(ref, {
        released: true,
        releasedAt: nowIso
      });
    }

    tx.update(userRef, {
      pendingEarningsUsd: newPending,
      availableEarningsUsd: newAvailable,
      updatedAt: nowIso
    });
  });
}

// فحص حالة الخادم والإعدادات العامة
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    timestamp: new Date().toISOString(),
    config: {
      depositAddress: config.depositAddress,
      depositNetwork: WALLET_CONSTANTS.DEPOSIT_NETWORK,
      withdrawalNetwork: WALLET_CONSTANTS.WITHDRAWAL_NETWORK,
      minDepositUsd: config.minDepositUsd,
      minWithdrawalUsd: config.minWithdrawalUsd,
      withdrawalFeeUsd: config.withdrawalFeeUsd,
      earningsHoldHours: config.earningsHoldHours,
      referralCommissionRate: config.referralCommissionRate
    }
  });
});

// مزامنة بيانات مستخدم تيليجرام وتهيئة محفظته
app.post(
  "/api/auth/sync",
  telegramAuthMiddleware,
  asyncHandler(async (req, res) => {
    await upsertTelegramUser(req.tgUser);
    const fullName =
      [req.tgUser.first_name, req.tgUser.last_name].filter(Boolean).join(" ").trim() ||
      req.tgUser.username ||
      "مستخدم";

    await ensureUserDoc(req.uid, {
      name: fullName,
      referredBy: req.body?.referredBy || req.query?.ref
    });
    await releaseMatureEarningsForUser(req.uid);

    res.json({
      success: true,
      isOwner: req.isOwner,
      officialChannel: process.env.OFFICIAL_CHANNEL_URL || "https://t.me/TelegaAdsOfficial",
      botUsername: process.env.BOT_USERNAME || "TelegaAdsBot"
    });
  })
);

// تهيئة حساب المستخدم صراحةً
app.post(
  "/api/users/init",
  telegramAuthMiddleware,
  asyncHandler(async (req, res) => {
    const fullName =
      req.body?.name ||
      [req.tgUser.first_name, req.tgUser.last_name].filter(Boolean).join(" ").trim() ||
      req.tgUser.username ||
      "مستخدم";

    const user = await ensureUserDoc(req.uid, {
      email: req.body?.email,
      name: fullName,
      referredBy: req.body?.referredBy
    });
    await releaseMatureEarningsForUser(req.uid);
    const freshSnap = await collections.users.doc(req.uid).get();
    return res.json({ user: freshSnap.data() || user });
  })
);

// نظرة عامة على المحفظة والمعاملات
app.get(
  "/api/wallet/overview",
  telegramAuthMiddleware,
  asyncHandler(async (req, res) => {
    await ensureUserDoc(req.uid, {
      referredBy: req.query?.ref || req.query?.referredBy
    });
    await releaseMatureEarningsForUser(req.uid);

    const userSnap = await collections.users.doc(req.uid).get();
    const user = userSnap.data() || createUserRecord(req.uid);

    const [txSnap, depositsSnap, withdrawalsSnap, holdsSnap] = await Promise.all([
      collections.transactions.where("userId", "==", req.uid).get(),
      collections.deposits.where("userId", "==", req.uid).get(),
      collections.withdrawals.where("userId", "==", req.uid).get(),
      collections.earningHolds.where("userId", "==", req.uid).get()
    ]);

    const recentTransactions = sortByCreatedAtDesc(
      txSnap.docs.map((d) => d.data())
    ).slice(0, WALLET_CONSTANTS.RECENT_TRANSACTIONS_LIMIT);

    const deposits = sortByCreatedAtDesc(depositsSnap.docs.map((d) => d.data())).slice(0, 25);
    const withdrawals = sortByCreatedAtDesc(withdrawalsSnap.docs.map((d) => d.data())).slice(
      0,
      25
    );
    const pendingHolds = holdsSnap.docs
      .map((d) => d.data())
      .filter((h) => h && h.released === false)
      .sort((a, b) => toTimeMs(a?.releaseAt) - toTimeMs(b?.releaseAt));

    return res.json({
      wallet: {
        balanceUsd: roundMoney(user.balanceUsd),
        pendingEarningsUsd: roundMoney(user.pendingEarningsUsd),
        availableEarningsUsd: roundMoney(user.availableEarningsUsd),
        totalSpentUsd: roundMoney(user.totalSpentUsd),
        totalEarnedUsd: roundMoney(user.totalEarnedUsd),
        referralEarningsUsd: roundMoney(user.referralEarningsUsd),
        trc20WalletAddress: user.trc20WalletAddress || ""
      },
      rules: {
        depositAddress: config.depositAddress,
        depositNetwork: WALLET_CONSTANTS.DEPOSIT_NETWORK,
        withdrawalNetwork: WALLET_CONSTANTS.WITHDRAWAL_NETWORK,
        minDepositUsd: config.minDepositUsd,
        minWithdrawalUsd: config.minWithdrawalUsd,
        withdrawalFeeUsd: config.withdrawalFeeUsd,
        earningsHoldHours: config.earningsHoldHours,
        referralCommissionRate: config.referralCommissionRate
      },
      recentTransactions,
      deposits,
      withdrawals,
      pendingHolds
    });
  })
);

// حفظ عنوان محفظة TRC20 للسحب
app.put(
  "/api/wallet/trc20-address",
  telegramAuthMiddleware,
  asyncHandler(async (req, res) => {
    const address = (req.body?.trc20WalletAddress || req.body?.address || "").toString().trim();

    if (!isValidTrc20Address(address)) {
      return res.status(400).json({ error: "عنوان محفظة USDT - TRC20 غير صالح" });
    }

    await ensureUserDoc(req.uid);
    const nowIso = new Date().toISOString();
    await collections.users.doc(req.uid).update({
      trc20WalletAddress: address,
      updatedAt: nowIso
    });

    return res.json({
      success: true,
      trc20WalletAddress: address,
      updatedAt: nowIso
    });
  })
);

// تسجيل طلب إيداع
app.post(
  "/api/wallet/deposits",
  telegramAuthMiddleware,
  asyncHandler(async (req, res) => {
    const amountUsd = roundMoney(req.body?.amountUsd);
    const txid = (req.body?.txid || "").toString().trim();

    if (amountUsd < config.minDepositUsd) {
      return res.status(400).json({
        error: `الحد الأدنى للإيداع هو $${config.minDepositUsd.toFixed(2)}`
      });
    }
    if (!isValidTxid(txid)) {
      return res.status(400).json({ error: "رقم المعاملة (TXID) غير صالح" });
    }

    await ensureUserDoc(req.uid);

    const existingTxidSnap = await collections.deposits.where("txid", "==", txid).limit(1).get();
    if (!existingTxidSnap.empty) {
      return res.status(409).json({ error: "رقم المعاملة (TXID) مسجل مسبقاً" });
    }

    const nowIso = new Date().toISOString();
    const depositId = generateId("dep");
    const transactionId = generateId("tx");

    const depositRecord = {
      id: depositId,
      transactionId,
      userId: req.uid,
      amountUsd,
      network: WALLET_CONSTANTS.DEPOSIT_NETWORK,
      depositAddress: config.depositAddress,
      txid,
      status: TRANSACTION_STATUS.PENDING,
      adminNote: "",
      createdAt: nowIso,
      updatedAt: nowIso
    };

    const txRecord = createTransactionRecord({
      id: transactionId,
      userId: req.uid,
      type: TRANSACTION_TYPES.DEPOSIT,
      status: TRANSACTION_STATUS.PENDING,
      amountUsd,
      feeUsd: 0,
      netAmountUsd: amountUsd,
      network: WALLET_CONSTANTS.DEPOSIT_NETWORK,
      address: config.depositAddress,
      txid,
      notes: "طلب شحن رصيد عبر USDT - BEP20 بانتظار المراجعة الإدارية",
      createdAt: nowIso,
      updatedAt: nowIso
    });

    await db.runTransaction(async (tx) => {
      tx.set(collections.deposits.doc(depositId), depositRecord);
      tx.set(collections.transactions.doc(transactionId), txRecord);
    });

    return res.status(201).json({
      success: true,
      deposit: depositRecord,
      transaction: txRecord
    });
  })
);

// طلب سحب الأرباح المحررة
app.post(
  "/api/wallet/withdrawals",
  telegramAuthMiddleware,
  asyncHandler(async (req, res) => {
    const amountUsd = roundMoney(req.body?.amountUsd);
    const requestedAddress = (req.body?.trc20WalletAddress || req.body?.address || "")
      .toString()
      .trim();

    if (amountUsd < config.minWithdrawalUsd) {
      return res.status(400).json({
        error: `الحد الأدنى للسحب هو $${config.minWithdrawalUsd.toFixed(2)}`
      });
    }

    await ensureUserDoc(req.uid);
    await releaseMatureEarningsForUser(req.uid);

    const userRef = collections.users.doc(req.uid);
    const nowIso = new Date().toISOString();
    const withdrawalId = generateId("wd");
    const withdrawalTxId = generateId("tx");
    const feeTxId = generateId("tx");

    try {
      const result = await db.runTransaction(async (tx) => {
        const userSnap = await tx.get(userRef);
        if (!userSnap.exists) {
          throw new Error("المستخدم غير موجود");
        }
        const userData = userSnap.data() || {};
        const targetAddress = requestedAddress || userData.trc20WalletAddress || "";

        if (!isValidTrc20Address(targetAddress)) {
          throw new Error("يرجى إدخال أو حفظ عنوان محفظة USDT - TRC20 صالح قبل السحب");
        }

        const availableEarnings = roundMoney(userData.availableEarningsUsd || 0);
        if (availableEarnings < amountUsd) {
          throw new Error("الرصيد المتاح للسحب من الأرباح المحررة غير كافٍ");
        }

        const feeUsd = roundMoney(config.withdrawalFeeUsd);
        if (amountUsd <= feeUsd) {
          throw new Error(`مبلغ السحب يجب أن يكون أكبر من رسوم السحب ($${feeUsd.toFixed(2)})`);
        }

        const netAmountUsd = roundMoney(amountUsd - feeUsd);
        const nextAvailable = roundMoney(availableEarnings - amountUsd);

        const withdrawalRecord = createWithdrawalRequestRecord({
          id: withdrawalId,
          userId: req.uid,
          amountUsd,
          feeUsd,
          netAmountUsd,
          trc20Address: targetAddress,
          status: "pending",
          step: "submitted",
          stepHistory: [
            {
              step: "submitted",
              label: "تم إرسال طلب السحب وخصم المبلغ من الأرباح المتاحة",
              timestamp: nowIso
            }
          ],
          createdAt: nowIso,
          updatedAt: nowIso
        });

        const withdrawalTx = createTransactionRecord({
          id: withdrawalTxId,
          userId: req.uid,
          type: TRANSACTION_TYPES.WITHDRAWAL,
          status: TRANSACTION_STATUS.PENDING,
          amountUsd,
          feeUsd,
          netAmountUsd,
          network: WALLET_CONSTANTS.WITHDRAWAL_NETWORK,
          address: targetAddress,
          notes: `طلب سحب صافي $${netAmountUsd.toFixed(2)} عبر USDT - TRC20`,
          createdAt: nowIso,
          updatedAt: nowIso
        });

        const feeTx = createTransactionRecord({
          id: feeTxId,
          userId: req.uid,
          type: TRANSACTION_TYPES.WITHDRAWAL_FEE,
          status: TRANSACTION_STATUS.COMPLETED,
          amountUsd: feeUsd,
          feeUsd: 0,
          netAmountUsd: feeUsd,
          network: WALLET_CONSTANTS.WITHDRAWAL_NETWORK,
          address: targetAddress,
          notes: `رسوم سحب ($${feeUsd.toFixed(2)}) لطلب السحب ${withdrawalId}`,
          createdAt: nowIso,
          updatedAt: nowIso
        });

        tx.update(userRef, {
          availableEarningsUsd: nextAvailable,
          trc20WalletAddress: targetAddress,
          updatedAt: nowIso
        });
        tx.set(collections.withdrawals.doc(withdrawalId), withdrawalRecord);
        tx.set(collections.transactions.doc(withdrawalTxId), withdrawalTx);
        tx.set(collections.transactions.doc(feeTxId), feeTx);

        return { withdrawal: withdrawalRecord, transaction: withdrawalTx };
      });

      return res.status(201).json({
        success: true,
        withdrawal: result.withdrawal,
        transaction: result.transaction
      });
    } catch (err) {
      return res.status(400).json({ error: err.message || "تعذر إتمام طلب السحب" });
    }
  })
);

// إضافة ربح وحساب عمولة الإحالة (محمي للمالك أو مفتاح الإدارة)
app.post(
  "/api/earnings/credit",
  telegramAuthMiddleware,
  ownerOnlyMiddleware,
  asyncHandler(async (req, res) => {
    const targetUserId = (req.body?.userId || "").toString().trim();
    const grossAmountUsd = roundMoney(req.body?.amountUsd);
    const sourceType = (req.body?.sourceType || "ad_earning").toString().trim();
    const sourceId = (req.body?.sourceId || generateId("src")).toString().trim();

    if (!targetUserId) {
      return res.status(400).json({ error: "معرف المستخدم المستحق للربح مطلوب" });
    }
    if (grossAmountUsd <= 0) {
      return res.status(400).json({ error: "قيمة الربح يجب أن تكون أكبر من صفر" });
    }

    await ensureUserDoc(targetUserId);

    const now = new Date();
    const nowIso = now.toISOString();
    const releaseAtIso = new Date(
      now.getTime() + config.earningsHoldHours * 60 * 60 * 1000
    ).toISOString();
    const holdId = generateId("hold");
    const userTxId = generateId("tx");

    try {
      const result = await db.runTransaction(async (tx) => {
        const userRef = collections.users.doc(targetUserId);
        const userSnap = await tx.get(userRef);
        if (!userSnap.exists) {
          throw new Error("المستخدم غير موجود");
        }
        const userData = userSnap.data() || {};

        let referrerId =
          userData.referredBy && userData.referredBy !== targetUserId
            ? userData.referredBy
            : null;
        let referrerSnap = null;
        if (referrerId) {
          referrerSnap = await tx.get(collections.users.doc(referrerId));
          if (!referrerSnap.exists) {
            referrerId = null;
            referrerSnap = null;
          }
        }

        const commissionAmount = referrerId
          ? roundMoney(grossAmountUsd * config.referralCommissionRate)
          : 0;
        const userNetEarning = roundMoney(grossAmountUsd - commissionAmount);

        const holdRecord = createEarningHoldRecord({
          id: holdId,
          userId: targetUserId,
          sourceType,
          sourceId,
          grossAmountUsd,
          commissionPaidUsd: commissionAmount,
          netAmountUsd: userNetEarning,
          released: false,
          earnedAt: nowIso,
          releaseAt: releaseAtIso
        });

        const userTxRecord = createTransactionRecord({
          id: userTxId,
          userId: targetUserId,
          type: TRANSACTION_TYPES.EARNING,
          status: TRANSACTION_STATUS.COMPLETED,
          amountUsd: userNetEarning,
          feeUsd: commissionAmount,
          netAmountUsd: userNetEarning,
          notes: `ربح مكتسب (يُتاح للسحب تلقائياً بعد ${config.earningsHoldHours} ساعة)`,
          createdAt: nowIso,
          updatedAt: nowIso
        });

        tx.update(userRef, {
          pendingEarningsUsd: roundMoney((userData.pendingEarningsUsd || 0) + userNetEarning),
          totalEarnedUsd: roundMoney((userData.totalEarnedUsd || 0) + userNetEarning),
          updatedAt: nowIso
        });
        tx.set(collections.earningHolds.doc(holdId), holdRecord);
        tx.set(collections.transactions.doc(userTxId), userTxRecord);

        let commissionRecord = null;
        if (referrerId && referrerSnap && commissionAmount > 0) {
          const refData = referrerSnap.data() || {};
          const refHoldId = generateId("hold");
          const refTxId = generateId("tx");

          commissionRecord = createEarningHoldRecord({
            id: refHoldId,
            userId: referrerId,
            sourceType: "referral_commission",
            sourceId: holdId,
            grossAmountUsd: commissionAmount,
            commissionPaidUsd: 0,
            netAmountUsd: commissionAmount,
            released: false,
            earnedAt: nowIso,
            releaseAt: releaseAtIso
          });

          const refTxRecord = createTransactionRecord({
            id: refTxId,
            userId: referrerId,
            type: TRANSACTION_TYPES.REFERRAL_COMMISSION,
            status: TRANSACTION_STATUS.COMPLETED,
            amountUsd: commissionAmount,
            feeUsd: 0,
            netAmountUsd: commissionAmount,
            fromUserId: targetUserId,
            notes: `عمولة إحالة من أرباح المستخدم ${targetUserId}`,
            createdAt: nowIso,
            updatedAt: nowIso
          });

          tx.update(collections.users.doc(referrerId), {
            pendingEarningsUsd: roundMoney((refData.pendingEarningsUsd || 0) + commissionAmount),
            totalEarnedUsd: roundMoney((refData.totalEarnedUsd || 0) + commissionAmount),
            referralEarningsUsd: roundMoney((refData.referralEarningsUsd || 0) + commissionAmount),
            updatedAt: nowIso
          });
          tx.set(collections.earningHolds.doc(refHoldId), commissionRecord);
          tx.set(collections.transactions.doc(refTxId), refTxRecord);
        }

        return {
          hold: holdRecord,
          transaction: userTxRecord,
          referralCommission: commissionRecord
        };
      });

      return res.status(201).json({
        success: true,
        ...result
      });
    } catch (err) {
      return res.status(400).json({ error: err.message || "تعذر إضافة الربح" });
    }
  })
);

// القنوات
app.get(
  "/api/channels",
  telegramAuthMiddleware,
  asyncHandler(async (req, res) => {
    const snap = await collections.channels.where("ownerId", "==", req.uid).get();
    const channels = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    res.json({ channels });
  })
);

app.post(
  "/api/channels",
  telegramAuthMiddleware,
  asyncHandler(async (req, res) => {
    const { username } = req.body || {};
    if (!username) return res.status(400).json({ error: "Channel username required" });

    const trimmed = String(username).trim();
    const cleanUsername = trimmed.startsWith("@") ? trimmed : `@${trimmed}`;
    const docRef = await collections.channels.add({
      ownerId: req.uid,
      username: cleanUsername,
      title: cleanUsername,
      subscribers: 0,
      status: "Pending Verification",
      createdAt: new Date().toISOString()
    });

    res.json({ success: true, id: docRef.id });
  })
);

// الحملات الترويجية (عرض وإنشاء مع حجز الميزانية)
app.get(
  "/api/campaigns",
  telegramAuthMiddleware,
  asyncHandler(async (req, res) => {
    const snap = await collections.campaigns.where("advertiserId", "==", req.uid).get();
    const campaigns = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    res.json({ campaigns });
  })
);

app.post(
  "/api/campaigns",
  telegramAuthMiddleware,
  asyncHandler(async (req, res) => {
    const title = (req.body?.title || "").toString().trim();
    const content = (req.body?.content || "").toString().trim();
    const rawBudget = req.body?.budgetUsd ?? req.body?.budget;
    const budgetUsd = roundMoney(rawBudget);

    if (!title || budgetUsd <= 0) {
      return res.status(400).json({ error: "Invalid campaign parameters" });
    }

    await ensureUserDoc(req.uid);
    const nowIso = new Date().toISOString();
    const campaignId = generateId("cmp");
    const txId = generateId("tx");

    try {
      const created = await db.runTransaction(async (tx) => {
        const userRef = collections.users.doc(req.uid);
        const userSnap = await tx.get(userRef);
        if (!userSnap.exists) {
          throw new Error("حساب المعلن غير موجود");
        }
        const userData = userSnap.data() || {};
        const currentBalance = roundMoney(userData.balanceUsd || 0);

        if (currentBalance < budgetUsd) {
          throw new Error("رصيد المحفظة غير كافٍ لتغطية ميزانية الحملة");
        }

        const campaignRecord = {
          id: campaignId,
          advertiserId: req.uid,
          title: title.slice(0, 100),
          content: content.slice(0, 1000),
          budget: budgetUsd,
          budgetUsd,
          spentUsd: 0,
          remainingBudgetUsd: budgetUsd,
          status: "Active",
          settled: false,
          settledRefundUsd: 0,
          createdAt: nowIso,
          updatedAt: nowIso,
          endedAt: null
        };

        const spendTx = createTransactionRecord({
          id: txId,
          userId: req.uid,
          type: TRANSACTION_TYPES.CAMPAIGN_SPEND,
          status: TRANSACTION_STATUS.COMPLETED,
          amountUsd: budgetUsd,
          feeUsd: 0,
          netAmountUsd: budgetUsd,
          campaignId,
          notes: `حجز ميزانية الحملة الإعلانية: ${campaignRecord.title}`,
          createdAt: nowIso,
          updatedAt: nowIso
        });

        tx.update(userRef, {
          balanceUsd: roundMoney(currentBalance - budgetUsd),
          totalSpentUsd: roundMoney((userData.totalSpentUsd || 0) + budgetUsd),
          updatedAt: nowIso
        });
        tx.set(collections.campaigns.doc(campaignId), campaignRecord);
        tx.set(collections.transactions.doc(txId), spendTx);

        return { id: campaignId, campaign: campaignRecord, transaction: spendTx };
      });

      return res.status(201).json({
        success: true,
        id: created.id,
        campaign: created.campaign,
        transaction: created.transaction
      });
    } catch (err) {
      return res.status(400).json({ error: err.message || "تعذر إنشاء الحملة" });
    }
  })
);

// تسوية ميزانية الحملة وإعادة المتبقي للمعلن
app.post(
  "/api/campaigns/:campaignId/settle",
  telegramAuthMiddleware,
  asyncHandler(async (req, res) => {
    const campaignId = (req.params.campaignId || "").toString().trim();
    const providedSpentUsd =
      req.body?.spentUsd !== undefined ? roundMoney(req.body.spentUsd) : null;

    if (!campaignId) {
      return res.status(400).json({ error: "معرف الحملة مطلوب" });
    }

    const nowIso = new Date().toISOString();
    const refundTxId = generateId("tx");

    try {
      const settlementResult = await db.runTransaction(async (tx) => {
        const campaignRef = collections.campaigns.doc(campaignId);
        const campaignSnap = await tx.get(campaignRef);
        if (!campaignSnap.exists) {
          throw new Error("الحملة غير موجودة");
        }

        const campaignData = campaignSnap.data() || {};
        if (!req.isOwner && campaignData.advertiserId !== req.uid) {
          throw new Error("غير مصرح لك بتسوية هذه الحملة");
        }
        if (campaignData.settled) {
          throw new Error("تمت تسوية هذه الحملة مسبقاً");
        }

        const budgetUsd = roundMoney(campaignData.budgetUsd ?? campaignData.budget ?? 0);
        const spentUsd =
          providedSpentUsd !== null
            ? Math.min(budgetUsd, Math.max(0, providedSpentUsd))
            : roundMoney(campaignData.spentUsd || 0);

        const refundAmount = roundMoney(Math.max(0, budgetUsd - spentUsd));
        const advertiserRef = collections.users.doc(campaignData.advertiserId);
        const advertiserSnap = await tx.get(advertiserRef);

        if (!advertiserSnap.exists) {
          throw new Error("حساب المعلن غير موجود");
        }

        const advertiserData = advertiserSnap.data() || {};
        const nextBalance = roundMoney((advertiserData.balanceUsd || 0) + refundAmount);
        const nextTotalSpent = roundMoney(
          Math.max(0, (advertiserData.totalSpentUsd || 0) - refundAmount)
        );

        tx.update(campaignRef, {
          spentUsd,
          remainingBudgetUsd: 0,
          status: "ended",
          settled: true,
          settledRefundUsd: refundAmount,
          endedAt: nowIso,
          updatedAt: nowIso
        });

        tx.update(advertiserRef, {
          balanceUsd: nextBalance,
          totalSpentUsd: nextTotalSpent,
          updatedAt: nowIso
        });

        let refundTx = null;
        if (refundAmount > 0) {
          refundTx = createTransactionRecord({
            id: refundTxId,
            userId: campaignData.advertiserId,
            type: TRANSACTION_TYPES.CAMPAIGN_REFUND,
            status: TRANSACTION_STATUS.COMPLETED,
            amountUsd: refundAmount,
            feeUsd: 0,
            netAmountUsd: refundAmount,
            campaignId,
            notes: `إعادة الميزانية المتبقية تلقائياً بعد انتهاء الحملة: ${campaignData.title || campaignId}`,
            createdAt: nowIso,
            updatedAt: nowIso
          });
          tx.set(collections.transactions.doc(refundTxId), refundTx);
        }

        return {
          campaign: {
            ...campaignData,
            spentUsd,
            remainingBudgetUsd: 0,
            status: "ended",
            settled: true,
            settledRefundUsd: refundAmount,
            endedAt: nowIso,
            updatedAt: nowIso
          },
          refundAmountUsd: refundAmount,
          refundTransaction: refundTx
        };
      });

      return res.json({
        success: true,
        ...settlementResult
      });
    } catch (err) {
      return res.status(400).json({ error: err.message || "تعذر تسوية ميزانية الحملة" });
    }
  })
);

// الإحالات والعمولات
app.get(
  "/api/referrals",
  telegramAuthMiddleware,
  asyncHandler(async (req, res) => {
    await ensureUserDoc(req.uid);
    const userSnap = await collections.users.doc(req.uid).get();
    const userData = userSnap.data() || createUserRecord(req.uid);

    const [referredSnap, userTxSnap] = await Promise.all([
      collections.users.where("referredBy", "==", req.uid).get(),
      collections.transactions.where("userId", "==", req.uid).get()
    ]);

    const referredUsers = referredSnap.docs.map((d) => {
      const u = d.data() || {};
      return {
        uid: u.uid,
        name: u.name,
        totalEarnedUsd: roundMoney(u.totalEarnedUsd || 0),
        createdAt: u.createdAt
      };
    });

    const commissionTransactions = sortByCreatedAtDesc(
      userTxSnap.docs
        .map((d) => d.data())
        .filter((tx) => tx && tx.type === TRANSACTION_TYPES.REFERRAL_COMMISSION)
    ).slice(0, 25);

    return res.json({
      referralCode: userData.referralCode || req.uid,
      commissionRate: config.referralCommissionRate,
      referralEarningsUsd: roundMoney(userData.referralEarningsUsd || 0),
      referredCount: referredUsers.length,
      referredUsers,
      commissionTransactions
    });
  })
);

// الدعم الفني المباشر
app.post(
  "/api/support",
  telegramAuthMiddleware,
  asyncHandler(async (req, res) => {
    const { message } = req.body || {};
    if (!message || !String(message).trim()) {
      return res.status(400).json({ error: "Message is required" });
    }

    await collections.tickets.add({
      userId: req.uid,
      username: req.tgUser.username || "",
      message: String(message).slice(0, 2000),
      status: "open",
      createdAt: new Date().toISOString()
    });

    res.json({ success: true });
  })
);

// مسارات الإدارة الحصرية للمالك فقط
app.get(
  "/api/admin/stats",
  telegramAuthMiddleware,
  ownerOnlyMiddleware,
  asyncHandler(async (req, res) => {
    const [usersSnap, channelsSnap, campaignsSnap] = await Promise.all([
      collections.users.count().get(),
      collections.channels.count().get(),
      collections.campaigns.count().get()
    ]);

    res.json({
      totalUsers: usersSnap.data().count,
      totalChannels: channelsSnap.data().count,
      activeCampaigns: campaignsSnap.data().count,
      totalVolume: 0
    });
  })
);

app.post(
  "/api/admin/broadcast",
  telegramAuthMiddleware,
  ownerOnlyMiddleware,
  asyncHandler(async (req, res) => {
    const { message } = req.body || {};
    if (!message) return res.status(400).json({ error: "Broadcast message required" });

    await logSecurityEvent("ADMIN_BROADCAST_SENT", {
      adminId: req.tgUser.id,
      preview: String(message).slice(0, 80)
    });

    res.json({ success: true });
  })
);

app.get(
  "/api/admin/overview",
  telegramAuthMiddleware,
  ownerOnlyMiddleware,
  asyncHandler(async (req, res) => {
    const [depositsSnap, withdrawalsSnap] = await Promise.all([
      collections.deposits.get(),
      collections.withdrawals.get()
    ]);

    const deposits = sortByCreatedAtDesc(depositsSnap.docs.map((d) => d.data())).slice(0, 50);
    const withdrawals = sortByCreatedAtDesc(withdrawalsSnap.docs.map((d) => d.data())).slice(
      0,
      50
    );

    return res.json({
      deposits,
      withdrawals
    });
  })
);

app.post(
  "/api/admin/deposits/:depositId/review",
  telegramAuthMiddleware,
  ownerOnlyMiddleware,
  asyncHandler(async (req, res) => {
    const depositId = (req.params.depositId || "").toString().trim();
    const decision = (req.body?.decision || "").toString().trim();
    const adminNote = (req.body?.adminNote || "").toString().trim();

    if (!["approve", "reject"].includes(decision)) {
      return res.status(400).json({ error: "القرار يجب أن يكون approve أو reject" });
    }

    const nowIso = new Date().toISOString();
    const depositRef = collections.deposits.doc(depositId);

    try {
      const updated = await db.runTransaction(async (tx) => {
        const depSnap = await tx.get(depositRef);
        if (!depSnap.exists) {
          throw new Error("طلب الإيداع غير موجود");
        }
        const depData = depSnap.data() || {};
        if (depData.status !== TRANSACTION_STATUS.PENDING) {
          throw new Error("تمت مراجعة طلب الإيداع مسبقاً");
        }

        const nextStatus =
          decision === "approve" ? TRANSACTION_STATUS.APPROVED : TRANSACTION_STATUS.REJECTED;
        const userRef = collections.users.doc(depData.userId);
        const userSnap = await tx.get(userRef);

        if (!userSnap.exists) {
          throw new Error("حساب المستخدم غير موجود");
        }

        if (decision === "approve") {
          const userData = userSnap.data() || {};
          const nextBalance = roundMoney((userData.balanceUsd || 0) + Number(depData.amountUsd || 0));
          tx.update(userRef, {
            balanceUsd: nextBalance,
            updatedAt: nowIso
          });
        }

        tx.update(depositRef, {
          status: nextStatus,
          adminNote,
          updatedAt: nowIso
        });

        if (depData.transactionId) {
          tx.update(collections.transactions.doc(depData.transactionId), {
            status: nextStatus,
            notes:
              decision === "approve"
                ? `تمت الموافقة على الإيداع وإضافة $${Number(depData.amountUsd).toFixed(2)} للرصيد`
                : `تم رفض طلب الإيداع${adminNote ? `: ${adminNote}` : ""}`,
            updatedAt: nowIso
          });
        }

        return {
          ...depData,
          status: nextStatus,
          adminNote,
          updatedAt: nowIso
        };
      });

      return res.json({ success: true, deposit: updated });
    } catch (err) {
      return res.status(400).json({ error: err.message || "تعذر مراجعة طلب الإيداع" });
    }
  })
);

app.post(
  "/api/admin/withdrawals/:withdrawalId/step",
  telegramAuthMiddleware,
  ownerOnlyMiddleware,
  asyncHandler(async (req, res) => {
    const withdrawalId = (req.params.withdrawalId || "").toString().trim();
    const nextStep = (req.body?.step || "").toString().trim();
    const txHash = (req.body?.txHash || "").toString().trim();
    const adminNote = (req.body?.adminNote || "").toString().trim();
    const reject = Boolean(req.body?.reject);

    const stepLabels = {
      submitted: "تم استلام طلب السحب",
      under_review: "قيد المراجعة الأمنية والتحقق",
      trc20_broadcast: "جاري الإرسال عبر شبكة USDT - TRC20",
      completed: "مكتمل ومؤكد على شبكة TRC20",
      rejected: "مرفوض وتمت إعادة المبلغ إلى الأرباح المتاحة"
    };

    const nowIso = new Date().toISOString();
    const wdRef = collections.withdrawals.doc(withdrawalId);

    try {
      const wdPeekSnap = await wdRef.get();
      if (!wdPeekSnap.exists) {
        return res.status(400).json({ error: "طلب السحب غير موجود" });
      }
      const wdPeekData = wdPeekSnap.data() || {};

      const matchingTxSnap = wdPeekData.userId
        ? await collections.transactions.where("userId", "==", wdPeekData.userId).get()
        : null;

      const updated = await db.runTransaction(async (tx) => {
        const wdSnap = await tx.get(wdRef);
        if (!wdSnap.exists) {
          throw new Error("طلب السحب غير موجود");
        }
        const wdData = wdSnap.data() || {};

        if (wdData.status === "completed" || wdData.status === "rejected") {
          throw new Error("طلب السحب مغلق بالفعل");
        }

        const userRef = collections.users.doc(wdData.userId);
        const userSnap = await tx.get(userRef);
        if (!userSnap.exists) {
          throw new Error("المستخدم غير موجود");
        }
        const userData = userSnap.data() || {};

        const matchingDocs = matchingTxSnap
          ? matchingTxSnap.docs.filter((docSnap) => {
              const d = docSnap.data() || {};
              return (
                d.type === TRANSACTION_TYPES.WITHDRAWAL &&
                roundMoney(d.amountUsd) === roundMoney(wdData.amountUsd) &&
                d.address === wdData.trc20Address
              );
            })
          : [];

        if (reject || nextStep === "rejected") {
          const refundTotal = roundMoney(wdData.amountUsd || 0);
          tx.update(userRef, {
            availableEarningsUsd: roundMoney((userData.availableEarningsUsd || 0) + refundTotal),
            updatedAt: nowIso
          });

          const history = Array.isArray(wdData.stepHistory) ? [...wdData.stepHistory] : [];
          history.push({
            step: "rejected",
            label: stepLabels.rejected,
            timestamp: nowIso
          });

          const rejectedRecord = {
            ...wdData,
            status: "rejected",
            step: "rejected",
            stepHistory: history,
            adminNote: adminNote || wdData.adminNote || "",
            updatedAt: nowIso
          };

          tx.update(wdRef, rejectedRecord);

          for (const docSnap of matchingDocs) {
            const d = docSnap.data() || {};
            if (d.status === TRANSACTION_STATUS.PENDING) {
              tx.update(docSnap.ref, {
                status: TRANSACTION_STATUS.REJECTED,
                notes: `تم رفض طلب السحب وإعادة $${refundTotal.toFixed(2)} إلى الأرباح المتاحة`,
                updatedAt: nowIso
              });
              break;
            }
          }

          return rejectedRecord;
        }

        if (!WITHDRAWAL_STEPS.includes(nextStep)) {
          throw new Error("مرحلة السحب غير صالحة");
        }

        const statusMap = {
          submitted: "pending",
          under_review: "processing",
          trc20_broadcast: "processing",
          completed: "completed"
        };

        const txStatusMap = {
          submitted: TRANSACTION_STATUS.PENDING,
          under_review: TRANSACTION_STATUS.PROCESSING,
          trc20_broadcast: TRANSACTION_STATUS.PROCESSING,
          completed: TRANSACTION_STATUS.COMPLETED
        };

        const history = Array.isArray(wdData.stepHistory) ? [...wdData.stepHistory] : [];
        if (!history.some((item) => item && item.step === nextStep)) {
          history.push({
            step: nextStep,
            label: stepLabels[nextStep],
            timestamp: nowIso
          });
        }

        const nextRecord = {
          ...wdData,
          step: nextStep,
          status: statusMap[nextStep],
          stepHistory: history,
          txHash: txHash || wdData.txHash || null,
          adminNote: adminNote || wdData.adminNote || "",
          updatedAt: nowIso
        };

        tx.update(wdRef, nextRecord);

        for (const docSnap of matchingDocs) {
          const d = docSnap.data() || {};
          if (d.status !== TRANSACTION_STATUS.REJECTED) {
            tx.update(docSnap.ref, {
              status: txStatusMap[nextStep],
              txid: txHash || d.txid || null,
              notes: `${stepLabels[nextStep]} - صافي $${Number(wdData.netAmountUsd || 0).toFixed(2)}`,
              updatedAt: nowIso
            });
            break;
          }
        }

        return nextRecord;
      });

      return res.json({ success: true, withdrawal: updated });
    } catch (err) {
      return res.status(400).json({ error: err.message || "تعذر تحديث خطوة السحب" });
    }
  })
);

app.use((req, res, next) => {
  if (req.method !== "GET" || req.path.startsWith("/api/")) {
    return next();
  }
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.use((err, req, res, _next) => {
  console.error("[Server Error]:", err);
  res.status(500).json({ error: "Internal Server Error" });
});

app.listen(config.port, () => {
  console.log(`Telega.ads server running securely on port ${config.port}`);
});
