import express from "express";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import {
  Collections,
  COLLECTIONS,
  WALLET_CONSTANTS,
  db,
  FieldValue,
  Timestamp,
  logSecurityEvent,
  upsertTelegramUser,
  ensureUserDocument,
  process24HourReleases,
  recordPublisherEarningWithReferral,
  settleCampaignBudgetAtomically,
  getWalletSummary,
  updateUserTrc20Address,
  recordDepositRequest,
  requestWithdrawalAtomically,
  getTransactionHistory,
  WalletModule
} from "./models.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(
  helmet({
    contentSecurityPolicy: false
  })
);
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

function serializeFirestoreDate(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return String(value);
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

  if (!verifiedUser) {
    await logSecurityEvent("UNVERIFIED_ACCESS_ATTEMPT", { ip: req.ip, path: req.path });
    return res.status(401).json({ error: "Unauthorized Telegram session" });
  }

  req.tgUser = verifiedUser;
  const adminEnvId = process.env.ADMIN_TELEGRAM_ID || process.env.ADMIN_USER_ID || "admin_1";
  req.isOwner = String(verifiedUser.id) === String(adminEnvId);
  next();
});

// Middleware حصري للمالك فقط
const ownerOnlyMiddleware = asyncHandler(async (req, res, next) => {
  if (!req.isOwner) {
    await logSecurityEvent("ADMIN_BREACH_ATTEMPT", {
      userId: req.tgUser?.id,
      username: req.tgUser?.username
    });
    return res.status(403).json({ error: "Forbidden: Owner access only" });
  }
  next();
});

function resolveTargetUserId(req, explicitUserId = null) {
  const authUserId = String(req.tgUser.id);
  if (!explicitUserId) return authUserId;
  const requestedId = String(explicitUserId).trim();
  if (requestedId !== authUserId && !req.isOwner) {
    return null;
  }
  return requestedId;
}

// مزامنة بيانات المستخدم (بدون إرجاع ID أو Username للواجهة)
app.post(
  "/api/auth/sync",
  telegramAuthMiddleware,
  asyncHandler(async (req, res) => {
    const refCode = req.body?.ref || req.body?.referralCode || null;
    await upsertTelegramUser(req.tgUser);
    if (refCode) {
      await ensureUserDocument(String(req.tgUser.id), refCode);
    }
    res.json({
      success: true,
      isOwner: req.isOwner,
      officialChannel: process.env.OFFICIAL_CHANNEL_URL || "https://t.me/TelegaAdsOfficial",
      botUsername: process.env.BOT_USERNAME || "TelegaAdsBot"
    });
  })
);

// ================= قسم المحفظة والعمليات المالية =================

// جلب بيانات المحفظة والرصيد وسجل العمليات والإحالة للمستخدم المصادق عليه
app.get(
  "/api/wallet",
  telegramAuthMiddleware,
  asyncHandler(async (req, res) => {
    const userId = String(req.tgUser.id);
    const ref = req.query?.ref ? String(req.query.ref) : null;

    await upsertTelegramUser(req.tgUser);
    await ensureUserDocument(userId, ref);
    const releaseInfo = await process24HourReleases(userId);
    const summary = await getWalletSummary(userId);

    const [txSnap, depositsSnap, withdrawalsSnap, pendingReleasesSnap, referralsSnap] =
      await Promise.all([
        db
          .collection(Collections.TRANSACTIONS)
          .where("userId", "==", userId)
          .orderBy("createdAt", "desc")
          .limit(20)
          .get(),
        db
          .collection(Collections.DEPOSITS)
          .where("userId", "==", userId)
          .orderBy("createdAt", "desc")
          .limit(25)
          .get(),
        db
          .collection(Collections.WITHDRAWALS)
          .where("userId", "==", userId)
          .orderBy("createdAt", "desc")
          .limit(25)
          .get(),
        db
          .collection(Collections.PENDING_RELEASES)
          .where("userId", "==", userId)
          .where("status", "==", "pending")
          .orderBy("releaseAt", "asc")
          .get(),
        db
          .collection(Collections.REFERRALS)
          .where("referrerId", "==", userId)
          .orderBy("createdAt", "desc")
          .limit(20)
          .get()
      ]);

    const transactions = txSnap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      createdAt: serializeFirestoreDate(doc.data().createdAt) || new Date().toISOString()
    }));

    const deposits = depositsSnap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      createdAt: serializeFirestoreDate(doc.data().createdAt) || new Date().toISOString()
    }));

    const withdrawals = withdrawalsSnap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      createdAt: serializeFirestoreDate(doc.data().createdAt) || new Date().toISOString(),
      updatedAt: serializeFirestoreDate(doc.data().updatedAt)
    }));

    const pendingReleases = pendingReleasesSnap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      createdAt: serializeFirestoreDate(doc.data().createdAt),
      releaseAt: serializeFirestoreDate(doc.data().releaseAt)
    }));

    const referralLogs = referralsSnap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      createdAt: serializeFirestoreDate(doc.data().createdAt),
      releaseAt: serializeFirestoreDate(doc.data().releaseAt)
    }));

    res.json({
      success: true,
      wallet: {
        userId: summary.userId,
        availableBalance: summary.availableBalance,
        pendingEarnings: summary.pendingEarnings,
        totalSpent: summary.totalSpent,
        totalEarned: summary.totalEarned,
        referralEarningsAvailable: summary.referralEarningsAvailable,
        referralEarningsPending: summary.referralEarningsPending,
        trc20Address: summary.trc20Address,
        referralCode: summary.referralCode,
        referredBy: req.isOwner ? summary.referredBy : undefined,
        referralsCount: summary.referralsCount,
        isAdmin: req.isOwner
      },
      constants: WalletModule.constants,
      releaseInfo,
      transactions,
      deposits,
      withdrawals,
      pendingReleases,
      referralLogs
    });
  })
);

// تهيئة وجلب بيانات المحفظة لمعرف محدد (للمستخدم نفسه أو المالك)
app.get(
  "/api/wallet/:userId",
  telegramAuthMiddleware,
  asyncHandler(async (req, res) => {
    const targetUserId = resolveTargetUserId(req, req.params.userId);
    if (!targetUserId) {
      await logSecurityEvent("UNAUTHORIZED_WALLET_ACCESS", {
        requesterId: req.tgUser.id,
        targetUserId: req.params.userId
      });
      return res.status(403).json({ error: "Forbidden: Cannot access another user's wallet" });
    }

    const ref = req.query?.ref ? String(req.query.ref) : null;
    await ensureUserDocument(targetUserId, ref);
    const releaseInfo = await process24HourReleases(targetUserId);
    const summary = await getWalletSummary(targetUserId);

    const [txSnap, depositsSnap, withdrawalsSnap, pendingReleasesSnap, referralsSnap] =
      await Promise.all([
        db
          .collection(Collections.TRANSACTIONS)
          .where("userId", "==", targetUserId)
          .orderBy("createdAt", "desc")
          .limit(10)
          .get(),
        db
          .collection(Collections.DEPOSITS)
          .where("userId", "==", targetUserId)
          .orderBy("createdAt", "desc")
          .limit(25)
          .get(),
        db
          .collection(Collections.WITHDRAWALS)
          .where("userId", "==", targetUserId)
          .orderBy("createdAt", "desc")
          .limit(25)
          .get(),
        db
          .collection(Collections.PENDING_RELEASES)
          .where("userId", "==", targetUserId)
          .where("status", "==", "pending")
          .orderBy("releaseAt", "asc")
          .get(),
        db
          .collection(Collections.REFERRALS)
          .where("referrerId", "==", targetUserId)
          .orderBy("createdAt", "desc")
          .limit(20)
          .get()
      ]);

    const transactions = txSnap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      createdAt: serializeFirestoreDate(doc.data().createdAt) || new Date().toISOString()
    }));

    const deposits = depositsSnap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      createdAt: serializeFirestoreDate(doc.data().createdAt) || new Date().toISOString()
    }));

    const withdrawals = withdrawalsSnap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      createdAt: serializeFirestoreDate(doc.data().createdAt) || new Date().toISOString(),
      updatedAt: serializeFirestoreDate(doc.data().updatedAt)
    }));

    const pendingReleases = pendingReleasesSnap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      createdAt: serializeFirestoreDate(doc.data().createdAt),
      releaseAt: serializeFirestoreDate(doc.data().releaseAt)
    }));

    const referralLogs = referralsSnap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      createdAt: serializeFirestoreDate(doc.data().createdAt),
      releaseAt: serializeFirestoreDate(doc.data().releaseAt)
    }));

    res.json({
      success: true,
      wallet: {
        userId: summary.userId,
        availableBalance: summary.availableBalance,
        pendingEarnings: summary.pendingEarnings,
        totalSpent: summary.totalSpent,
        totalEarned: summary.totalEarned,
        referralEarningsAvailable: summary.referralEarningsAvailable,
        referralEarningsPending: summary.referralEarningsPending,
        trc20Address: summary.trc20Address,
        referralCode: summary.referralCode,
        referredBy: summary.referredBy || null,
        referralsCount: summary.referralsCount,
        isAdmin: req.isOwner
      },
      constants: WALLET_CONSTANTS,
      releaseInfo,
      transactions,
      deposits,
      withdrawals,
      pendingReleases,
      referralLogs
    });
  })
);

// سجل العمليات الكامل للمحفظة
app.get(
  "/api/wallet/transactions",
  telegramAuthMiddleware,
  asyncHandler(async (req, res) => {
    const userId = String(req.tgUser.id);
    const limit = Number(req.query?.limit || 20);
    const items = await getTransactionHistory(userId, limit);
    const transactions = items.map((item) => ({
      ...item,
      createdAt: serializeFirestoreDate(item.createdAt)
    }));
    res.json({ success: true, transactions });
  })
);

// حفظ أو تعديل عنوان محفظة USDT - TRC20
app.post(
  "/api/wallet/address",
  telegramAuthMiddleware,
  asyncHandler(async (req, res) => {
    const targetUserId = resolveTargetUserId(req, req.body?.userId);
    if (!targetUserId) {
      return res.status(403).json({ error: "Forbidden: Cannot modify another user's address" });
    }

    const { trc20Address } = req.body || {};
    if (!trc20Address) {
      return res.status(400).json({ error: "يرجى إدخال عنوان المحفظة" });
    }

    const updated = await updateUserTrc20Address(targetUserId, trc20Address);
    res.json({
      success: true,
      message: "تم حفظ عنوان محفظة USDT - TRC20 بنجاح",
      trc20Address: updated.trc20Address
    });
  })
);

// طلب سحب جديد عبر USDT - TRC20 (الحد الأدنى $30.00 ورسوم $3.00)
app.post(
  "/api/wallet/withdraw",
  telegramAuthMiddleware,
  asyncHandler(async (req, res) => {
    const targetUserId = resolveTargetUserId(req, req.body?.userId);
    if (!targetUserId) {
      return res.status(403).json({ error: "Forbidden: Cannot withdraw from another user's wallet" });
    }

    const { amount, trc20Address } = req.body || {};
    const withdrawAmount = Number(Number(amount).toFixed(2));
    if (isNaN(withdrawAmount)) {
      return res.status(400).json({ error: "بيانات السحب غير مكتملة" });
    }

    const result = await requestWithdrawalAtomically(targetUserId, withdrawAmount, trc20Address || null);
    const withdrawalRecord = {
      ...result.withdrawal,
      walletAddress: result.withdrawal.trc20Address,
      status: result.withdrawal.status === "pending" ? "requested" : result.withdrawal.status,
      stepIndex: 1,
      txHash: "",
      adminNote: "",
      createdAt: serializeFirestoreDate(result.withdrawal.createdAt),
      updatedAt: serializeFirestoreDate(result.withdrawal.createdAt)
    };

    res.json({
      success: true,
      message: "تم إرسال طلب السحب بنجاح وهو قيد المراجعة",
      withdrawal: withdrawalRecord
    });
  })
);

// إرسال طلب إيداع عبر USDT - BEP20 برقم المعاملة TXID مع منع التكرار
app.post(
  "/api/wallet/deposit",
  telegramAuthMiddleware,
  asyncHandler(async (req, res) => {
    const targetUserId = resolveTargetUserId(req, req.body?.userId);
    if (!targetUserId) {
      return res.status(403).json({ error: "Forbidden: Cannot deposit for another user" });
    }

    const { amount, txid, txHash } = req.body || {};
    const depositAmount = Number(Number(amount).toFixed(2));
    const rawHash = txid || txHash || "";

    if (!rawHash || isNaN(depositAmount)) {
      return res.status(400).json({ error: "يرجى إدخال المبلغ ورقم المعاملة (TXID)" });
    }

    if (depositAmount < WALLET_CONSTANTS.MIN_DEPOSIT) {
      return res.status(400).json({
        error: `الحد الأدنى للإيداع هو $${WALLET_CONSTANTS.MIN_DEPOSIT.toFixed(2)}`
      });
    }

    const cleanTxid = String(rawHash).trim();
    if (cleanTxid.length < 16) {
      return res.status(400).json({ error: "رقم المعاملة (TXID) غير صالح" });
    }

    await ensureUserDocument(targetUserId);

    const duplicateCheck = await db
      .collection(Collections.DEPOSITS)
      .where("txid", "==", cleanTxid)
      .limit(1)
      .get();

    if (!duplicateCheck.empty) {
      return res.status(409).json({ error: "رقم المعاملة (TXID) هذا مسجل مسبقاً في النظام" });
    }

    await recordDepositRequest(targetUserId, depositAmount, cleanTxid);

    const latestDepSnap = await db
      .collection(Collections.DEPOSITS)
      .where("userId", "==", targetUserId)
      .orderBy("createdAt", "desc")
      .limit(1)
      .get();

    if (!latestDepSnap.empty) {
      await latestDepSnap.docs[0].ref.update({
        txid: cleanTxid,
        adminNote: ""
      });
    }

    res.json({
      success: true,
      message: "تم إرسال طلب الإيداع بنجاح للمراجعة الإدارية"
    });
  })
);

// تسجيل أرباح ناشر (مع احتساب عمولة 10% للمحيل وتحرير بعد 24 ساعة)
app.post(
  "/api/earnings/publisher",
  telegramAuthMiddleware,
  ownerOnlyMiddleware,
  asyncHandler(async (req, res) => {
    const { publisherId, amount, campaignId } = req.body || {};
    if (!publisherId || !amount) {
      return res.status(400).json({ error: "معرف الناشر والمبلغ مطلوبان" });
    }

    await ensureUserDocument(String(publisherId));
    const result = await recordPublisherEarningWithReferral(String(publisherId), amount, campaignId);

    res.json({
      success: true,
      message: "تم تسجيل أرباح الناشر وعمولة الإحالة في فترة الانتظار (24 ساعة)",
      result
    });
  })
);

// ================= القنوات =================

app.get(
  "/api/channels",
  telegramAuthMiddleware,
  asyncHandler(async (req, res) => {
    const snap = await db
      .collection(Collections.CHANNELS)
      .where("ownerId", "==", String(req.tgUser.id))
      .get();
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

    const cleanUsername = String(username).trim().startsWith("@")
      ? String(username).trim()
      : `@${String(username).trim()}`;
    const docRef = await db.collection(Collections.CHANNELS).add({
      ownerId: String(req.tgUser.id),
      username: cleanUsername,
      title: cleanUsername,
      subscribers: 0,
      status: "Pending Verification",
      createdAt: new Date().toISOString()
    });

    res.json({ success: true, id: docRef.id });
  })
);

// ================= الحملات الترويجية والتسوية الذرية =================

app.get(
  "/api/campaigns",
  telegramAuthMiddleware,
  asyncHandler(async (req, res) => {
    const targetAdvertiserId = req.isOwner && req.query?.userId
      ? String(req.query.userId)
      : String(req.tgUser.id);

    const snap = await db
      .collection(Collections.CAMPAIGNS)
      .where("advertiserId", "==", targetAdvertiserId)
      .get();

    const campaigns = snap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      createdAt: serializeFirestoreDate(doc.data().createdAt)
    }));

    res.json({ success: true, campaigns });
  })
);

app.post(
  "/api/campaigns",
  telegramAuthMiddleware,
  asyncHandler(async (req, res) => {
    const advertiserId = String(req.tgUser.id);
    const { title, content, budget, totalBudget } = req.body || {};
    const rawBudget = totalBudget !== undefined ? totalBudget : budget;
    const numericBudget = Number(Number(rawBudget).toFixed(2));

    if (!title || isNaN(numericBudget) || numericBudget <= 0) {
      return res.status(400).json({ error: "Invalid campaign parameters" });
    }

    await ensureUserDocument(advertiserId);
    const userRef = db.collection(Collections.USERS).doc(advertiserId);
    const campaignRef = db.collection(Collections.CAMPAIGNS).doc();
    const txRef = db.collection(Collections.TRANSACTIONS).doc();

    let createdId = campaignRef.id;

    await db.runTransaction(async (transaction) => {
      const userSnap = await transaction.get(userRef);
      if (!userSnap.exists) {
        throw new Error("المستخدم غير موجود");
      }

      const userData = userSnap.data() || {};
      const available = Number(
        typeof userData.availableBalance === "number"
          ? userData.availableBalance
          : userData.balance || 0
      );

      if (available < numericBudget) {
        throw new Error("الرصيد المتاح غير كافٍ لتمويل الحملة");
      }

      transaction.update(userRef, {
        availableBalance: FieldValue.increment(-numericBudget),
        balance: FieldValue.increment(-numericBudget),
        totalSpent: FieldValue.increment(numericBudget),
        updatedAt: FieldValue.serverTimestamp()
      });

      const campaignPayload = {
        advertiserId,
        title: String(title).trim().slice(0, 100),
        content: content ? String(content).slice(0, 1000) : String(title).trim().slice(0, 100),
        budget: numericBudget,
        totalBudget: numericBudget,
        spentBudget: 0.0,
        status: "Active",
        isSettled: false,
        createdAt: Timestamp.now()
      };

      transaction.set(campaignRef, campaignPayload);
      createdId = campaignRef.id;

      transaction.set(txRef, {
        userId: advertiserId,
        type: "campaign_spend",
        amount: -numericBudget,
        status: "completed",
        description: `حجز ميزانية حملة إعلانية: ${campaignPayload.title}`,
        createdAt: Timestamp.now()
      });
    });

    res.json({
      success: true,
      id: createdId,
      message: "تم إنشاء الحملة وحجز الميزانية بنجاح"
    });
  })
);

// تحديث المصروف الفعلي لحملة نشطة (لصرف جزء من الميزانية لناشر)
app.post(
  "/api/campaigns/:campaignId/spend",
  telegramAuthMiddleware,
  asyncHandler(async (req, res) => {
    const { campaignId } = req.params;
    const { amount, publisherId } = req.body || {};
    const spendAmount = Number(Number(amount).toFixed(2));

    if (isNaN(spendAmount) || spendAmount <= 0) {
      return res.status(400).json({ error: "مبلغ الصرف غير صالح" });
    }

    const campaignRef = db.collection(Collections.CAMPAIGNS).doc(String(campaignId));
    await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(campaignRef);
      if (!snap.exists) throw new Error("الحملة غير موجودة");
      const data = snap.data() || {};
      if (!req.isOwner && String(data.advertiserId) !== String(req.tgUser.id)) {
        throw new Error("غير مصرح لك بالتعديل على هذه الحملة");
      }
      if (String(data.status).toLowerCase() !== "active") {
        throw new Error("الحملة غير نشطة");
      }

      const total = Number(data.totalBudget ?? data.budget ?? 0);
      const spent = Number(data.spentBudget || 0);
      const remaining = Number((total - spent).toFixed(2));
      if (spendAmount > remaining) {
        throw new Error("المبلغ يتجاوز الميزانية المتبقية للحملة");
      }

      transaction.update(campaignRef, {
        spentBudget: FieldValue.increment(spendAmount)
      });
    });

    if (publisherId) {
      await ensureUserDocument(String(publisherId));
      await recordPublisherEarningWithReferral(String(publisherId), spendAmount, String(campaignId));
    }

    res.json({ success: true, message: "تم تسجيل الصرف وتحويل الأرباح للناشر بنجاح" });
  })
);

// تسوية الميزانية الآلية الذرية عند انتهاء الحملة
app.post(
  "/api/campaigns/:campaignId/settle",
  telegramAuthMiddleware,
  asyncHandler(async (req, res) => {
    const { campaignId } = req.params;
    const campaignSnap = await db.collection(Collections.CAMPAIGNS).doc(String(campaignId)).get();
    if (!campaignSnap.exists) {
      return res.status(404).json({ error: "الحملة غير موجودة" });
    }

    const campaignData = campaignSnap.data() || {};
    if (!req.isOwner && String(campaignData.advertiserId) !== String(req.tgUser.id)) {
      return res.status(403).json({ error: "Forbidden: Not allowed to settle this campaign" });
    }

    const result = await settleCampaignBudgetAtomically(String(campaignId));
    res.json({
      success: true,
      message: `تمت تسوية الحملة ذرياً وإعادة $${result.refundedAmount.toFixed(2)} إلى رصيد المعلن`,
      settlement: result
    });
  })
);

// ================= الدعم الفني المباشر =================

app.post(
  "/api/support",
  telegramAuthMiddleware,
  asyncHandler(async (req, res) => {
    const { message } = req.body || {};
    if (!message || !String(message).trim()) {
      return res.status(400).json({ error: "Message is required" });
    }

    await db.collection(Collections.TICKETS).add({
      userId: String(req.tgUser.id),
      username: req.tgUser.username || "",
      message: String(message).slice(0, 2000),
      status: "open",
      createdAt: new Date().toISOString()
    });

    res.json({ success: true });
  })
);

// ================= مسارات الإدارة الحصرية للمالك فقط =================

app.get(
  "/api/admin/stats",
  telegramAuthMiddleware,
  ownerOnlyMiddleware,
  asyncHandler(async (req, res) => {
    const [usersSnap, channelsSnap, campaignsSnap] = await Promise.all([
      db.collection(Collections.USERS).count().get(),
      db.collection(Collections.CHANNELS).count().get(),
      db.collection(Collections.CAMPAIGNS).count().get()
    ]);

    res.json({
      totalUsers: usersSnap.data().count,
      totalChannels: channelsSnap.data().count,
      activeCampaigns: campaignsSnap.data().count,
      totalVolume: 0
    });
  })
);

app.get(
  "/api/admin/overview",
  telegramAuthMiddleware,
  ownerOnlyMiddleware,
  asyncHandler(async (req, res) => {
    const [depositsSnap, withdrawalsSnap, campaignsSnap] = await Promise.all([
      db.collection(Collections.DEPOSITS).orderBy("createdAt", "desc").limit(50).get(),
      db.collection(Collections.WITHDRAWALS).orderBy("createdAt", "desc").limit(50).get(),
      db.collection(Collections.CAMPAIGNS).orderBy("createdAt", "desc").limit(30).get()
    ]);

    res.json({
      success: true,
      deposits: depositsSnap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
        createdAt: serializeFirestoreDate(d.data().createdAt)
      })),
      withdrawals: withdrawalsSnap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
        createdAt: serializeFirestoreDate(d.data().createdAt),
        updatedAt: serializeFirestoreDate(d.data().updatedAt)
      })),
      campaigns: campaignsSnap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
        createdAt: serializeFirestoreDate(d.data().createdAt)
      }))
    });
  })
);

// اعتماد أو رفض طلب إيداع (بدون احتساب أي عمولة إحالة عند الشحن)
app.post(
  "/api/admin/deposits/:depositId/review",
  telegramAuthMiddleware,
  ownerOnlyMiddleware,
  asyncHandler(async (req, res) => {
    const { depositId } = req.params;
    const { action, adminNote } = req.body || {};

    if (!["approve", "reject"].includes(action)) {
      return res.status(400).json({ error: "إجراء غير صالح" });
    }

    const depositRef = db.collection(Collections.DEPOSITS).doc(String(depositId));

    await db.runTransaction(async (transaction) => {
      const depSnap = await transaction.get(depositRef);
      if (!depSnap.exists) throw new Error("طلب الإيداع غير موجود");

      const depData = depSnap.data() || {};
      if (depData.status !== "pending") {
        throw new Error("تمت معالجة طلب الإيداع هذا مسبقاً");
      }

      const userRef = db.collection(Collections.USERS).doc(String(depData.userId));
      const userSnap = await transaction.get(userRef);
      if (!userSnap.exists) throw new Error("المستخدم غير موجود");

      const txRef = db.collection(Collections.TRANSACTIONS).doc();

      if (action === "approve") {
        const amount = Number(depData.amount);

        transaction.update(userRef, {
          availableBalance: FieldValue.increment(amount),
          balance: FieldValue.increment(amount),
          updatedAt: FieldValue.serverTimestamp()
        });

        transaction.update(depositRef, {
          status: "approved",
          adminNote: adminNote ? String(adminNote) : "تم التحقق واعتماد الشحن",
          reviewedBy: String(req.tgUser.id),
          reviewedAt: Timestamp.now()
        });

        transaction.set(txRef, {
          userId: String(depData.userId),
          type: "deposit_approved",
          amount,
          status: "completed",
          description: `تم اعتماد إيداع $${amount.toFixed(2)} عبر USDT-BEP20`,
          createdAt: Timestamp.now()
        });
      } else {
        const refCode = depData.txid || depData.txHash || "N/A";
        transaction.update(depositRef, {
          status: "rejected",
          adminNote: adminNote ? String(adminNote) : "رقم المعاملة غير مطابق أو مرفوض",
          reviewedBy: String(req.tgUser.id),
          reviewedAt: Timestamp.now()
        });

        transaction.set(txRef, {
          userId: String(depData.userId),
          type: "deposit_rejected",
          amount: 0,
          status: "rejected",
          description: `تم رفض طلب الإيداع (TXID: ${String(refCode).slice(0, 10)}...)`,
          createdAt: Timestamp.now()
        });
      }
    });

    res.json({
      success: true,
      message:
        action === "approve"
          ? "تم اعتماد الإيداع وشحن رصيد المستخدم بنجاح"
          : "تم رفض طلب الإيداع"
    });
  })
);

// تحديث مراحل دورة السحب خطوة بخطوة من الإدارة
app.post(
  "/api/admin/withdrawals/:withdrawalId/status",
  telegramAuthMiddleware,
  ownerOnlyMiddleware,
  asyncHandler(async (req, res) => {
    const { withdrawalId } = req.params;
    const { status, txHash, adminNote } = req.body || {};

    const stepMap = {
      requested: 1,
      reviewing: 2,
      processing: 3,
      completed: 4,
      rejected: 0
    };

    if (!(status in stepMap)) {
      return res.status(400).json({ error: "حالة السحب غير صالحة" });
    }

    const withdrawalRef = db.collection(Collections.WITHDRAWALS).doc(String(withdrawalId));

    await db.runTransaction(async (transaction) => {
      const wSnap = await transaction.get(withdrawalRef);
      if (!wSnap.exists) throw new Error("طلب السحب غير موجود");

      const wData = wSnap.data() || {};
      if (wData.status === "completed" || wData.status === "rejected") {
        throw new Error("تم إغلاق طلب السحب هذا نهائياً ولا يمكن تعديله");
      }

      const updates = {
        status,
        stepIndex: stepMap[status],
        txHash: txHash !== undefined ? String(txHash).trim() : wData.txHash || "",
        adminNote: adminNote !== undefined ? String(adminNote).trim() : wData.adminNote || "",
        updatedAt: Timestamp.now()
      };

      transaction.update(withdrawalRef, updates);

      const refundOrRequestAmount = Number(wData.amount ?? wData.requestedAmount ?? 0);

      if (status === "rejected") {
        const userRef = db.collection(Collections.USERS).doc(String(wData.userId));
        transaction.update(userRef, {
          availableBalance: FieldValue.increment(refundOrRequestAmount),
          balance: FieldValue.increment(refundOrRequestAmount),
          updatedAt: FieldValue.serverTimestamp()
        });

        const txRef = db.collection(Collections.TRANSACTIONS).doc();
        transaction.set(txRef, {
          userId: String(wData.userId),
          type: "withdrawal_refunded",
          amount: refundOrRequestAmount,
          status: "completed",
          description: `إعادة مبلغ السحب المرفوض $${refundOrRequestAmount.toFixed(2)} إلى الرصيد`,
          createdAt: Timestamp.now()
        });
      } else if (status === "completed") {
        const txRef = db.collection(Collections.TRANSACTIONS).doc();
        transaction.set(txRef, {
          userId: String(wData.userId),
          type: "withdrawal_completed",
          amount: 0,
          status: "completed",
          description: `اكتمل تحويل السحب $${Number(wData.netAmount || 0).toFixed(2)} على شبكة USDT-TRC20`,
          createdAt: Timestamp.now()
        });
      }
    });

    res.json({
      success: true,
      message: "تم تحديث مرحلة طلب السحب بنجاح"
    });
  })
);

// تسريع تحرير الأرباح للمالك لاختبار دورة 24 ساعة
app.post(
  "/api/admin/force-release/:userId",
  telegramAuthMiddleware,
  ownerOnlyMiddleware,
  asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const pendingSnap = await db
      .collection(Collections.PENDING_RELEASES)
      .where("userId", "==", String(userId))
      .where("status", "==", "pending")
      .get();

    const pastTimestamp = Timestamp.fromMillis(Date.now() - 1000);
    const batch = db.batch();
    pendingSnap.docs.forEach((doc) => {
      batch.update(doc.ref, { releaseAt: pastTimestamp });
    });
    await batch.commit();

    const result = await process24HourReleases(String(userId));
    res.json({
      success: true,
      message: `تم تحرير ${result.releasedCount} دفعة بإجمالي $${result.releasedAmount.toFixed(2)}`,
      result
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

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.use((err, req, res, _next) => {
  console.error("[Server Error]:", err);
  res.status(500).json({ error: "Internal Server Error" });
});

app.listen(PORT, () => {
  console.log(`Telega.ads server running securely on port ${PORT}`);
});
