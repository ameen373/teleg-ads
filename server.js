import express from "express";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import admin from "firebase-admin";
import {
  Collections,
  DEPOSIT_ADDRESS_BEP20,
  MIN_DEPOSIT_USD,
  MIN_WITHDRAW_USD,
  REFERRAL_COMMISSION_RATE,
  WITHDRAW_FEE_USD,
  creditPublisherEarningWithHold,
  db,
  logSecurityEvent,
  processMatureEarningsForUser,
  recordTransaction,
  roundMoney,
  settleCampaignAtomic,
  upsertTelegramUser
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

// التحقق المشفر من بيانات تيليجرام (HMAC-SHA256)
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
    const startParam = urlParams.get("start_param") || "";
    if (!userRaw) return null;

    const parsedUser = JSON.parse(userRaw);
    parsedUser._startParam = startParam;
    return parsedUser;
  } catch {
    return null;
  }
}

const telegramAuthMiddleware = asyncHandler(async (req, res, next) => {
  const initData = req.headers["x-telegram-init-data"];
  const verifiedUser = verifyTelegramWebAppData(initData);

  if (!verifiedUser) {
    await logSecurityEvent("UNVERIFIED_ACCESS_ATTEMPT", { ip: req.ip, path: req.path });
    return res.status(401).json({ error: "Unauthorized Telegram session" });
  }

  req.tgUser = verifiedUser;
  req.isOwner = String(verifiedUser.id) === String(process.env.ADMIN_TELEGRAM_ID);
  next();
});

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

// مزامنة بيانات المستخدم + تحرير أي أرباح أتمت 24 ساعة
app.post(
  "/api/auth/sync",
  telegramAuthMiddleware,
  asyncHandler(async (req, res) => {
    const startParam = req.tgUser._startParam || req.body?.startParam || "";
    await upsertTelegramUser(req.tgUser, startParam);
    await processMatureEarningsForUser(req.tgUser.id);

    res.json({
      success: true,
      isOwner: req.isOwner,
      officialChannel: process.env.OFFICIAL_CHANNEL_URL || "https://t.me/TelegaAdsOfficial",
      botUsername: process.env.BOT_USERNAME || "TelegaAdsBot"
    });
  })
);

// =========================================================
// مسارات المحفظة (Wallet) والعمليات المالية
// =========================================================
app.get(
  "/api/wallet/overview",
  telegramAuthMiddleware,
  asyncHandler(async (req, res) => {
    const userId = String(req.tgUser.id);

    // تحرير أي أرباح معلقة أتمت 24 ساعة قبل جلب البيانات
    await processMatureEarningsForUser(userId);

    const [userSnap, txSnap, depSnap, witSnap, holdsSnap] = await Promise.all([
      db.collection(Collections.USERS).doc(userId).get(),
      db.collection(Collections.TRANSACTIONS).where("userId", "==", userId).get(),
      db.collection(Collections.DEPOSITS).where("userId", "==", userId).get(),
      db.collection(Collections.WITHDRAWALS).where("userId", "==", userId).get(),
      db
        .collection(Collections.PENDING_RELEASES)
        .where("userId", "==", userId)
        .where("status", "==", "held")
        .get()
    ]);

    const userData = userSnap.data() || {};

    // آخر 10 معاملات مرتبة من الأحدث للأقدم
    const transactions = txSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 10);

    const deposits = depSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const withdrawals = witSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const pendingReleases = holdsSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => Number(a.releaseAtMs) - Number(b.releaseAtMs));

    res.json({
      balances: {
        available: roundMoney(userData.availableBalance || 0),
        pending: roundMoney(userData.pendingBalance || 0),
        totalSpent: roundMoney(userData.totalSpent || 0),
        totalPublisherEarned: roundMoney(userData.totalPublisherEarned || 0),
        totalReferralEarned: roundMoney(userData.totalReferralEarned || 0)
      },
      walletConfig: {
        depositAddressBep20: DEPOSIT_ADDRESS_BEP20,
        minDeposit: MIN_DEPOSIT_USD,
        minWithdraw: MIN_WITHDRAW_USD,
        withdrawFee: WITHDRAW_FEE_USD,
        savedTrc20Address: userData.trc20Address || ""
      },
      referral: {
        referralsCount: Number(userData.referralsCount || 0),
        commissionRatePercent: Math.round(REFERRAL_COMMISSION_RATE * 100),
        totalReferralEarned: roundMoney(userData.totalReferralEarned || 0)
      },
      transactions,
      deposits,
      withdrawals,
      pendingReleases
    });
  })
);

// حفظ أو تعديل عنوان محفظة السحب USDT - TRC20
app.post(
  "/api/wallet/address",
  telegramAuthMiddleware,
  asyncHandler(async (req, res) => {
    const userId = String(req.tgUser.id);
    const address = String(req.body?.address || "").trim();

    // التحقق من صيغة عنوان TRC20 (يبدأ بـ T وطوله 34 حرفاً)
    if (!/^T[a-zA-Z0-9]{33}$/.test(address)) {
      return res.status(400).json({ error: "INVALID_TRC20_ADDRESS" });
    }

    await db.collection(Collections.USERS).doc(userId).update({
      trc20Address: address
    });

    res.json({ success: true, address });
  })
);

// إرسال طلب إيداع (USDT - BEP20) مع منع تكرار TXID
app.post(
  "/api/wallet/deposit",
  telegramAuthMiddleware,
  asyncHandler(async (req, res) => {
    const userId = String(req.tgUser.id);
    const amount = roundMoney(req.body?.amount);
    const txid = String(req.body?.txid || "").trim();

    if (isNaN(amount) || amount < MIN_DEPOSIT_USD) {
      return res.status(400).json({ error: "MIN_DEPOSIT_ERROR" });
    }

    if (!txid || txid.length < 16 || txid.length > 120) {
      return res.status(400).json({ error: "INVALID_TXID" });
    }

    // التحقق من عدم استخدام نفس رقم المعاملة TXID مسبقاً
    const dupCheck = await db
      .collection(Collections.DEPOSITS)
      .where("txid", "==", txid)
      .limit(1)
      .get();

    if (!dupCheck.empty) {
      await logSecurityEvent("DUPLICATE_TXID_ATTEMPT", { userId, txid });
      return res.status(409).json({ error: "DUPLICATE_TXID" });
    }

    const nowIso = new Date().toISOString();
    const depRef = db.collection(Collections.DEPOSITS).doc();

    await depRef.set({
      userId,
      username: req.tgUser.username || "",
      amount,
      network: "USDT-BEP20",
      depositAddress: DEPOSIT_ADDRESS_BEP20,
      txid,
      status: "pending", // pending | approved | rejected
      createdAt: nowIso
    });

    await recordTransaction(null, {
      userId,
      type: "deposit",
      titleKey: "tx_deposit_pending",
      amount,
      direction: "in",
      status: "pending",
      meta: { txid, network: "USDT-BEP20" }
    });

    res.json({ success: true, id: depRef.id });
  })
);

// إرسال طلب سحب (USDT - TRC20) مع معاملة ذرية لخصم الرصيد وتتبّع دورة الطلب
app.post(
  "/api/wallet/withdraw",
  telegramAuthMiddleware,
  asyncHandler(async (req, res) => {
    const userId = String(req.tgUser.id);
    const amount = roundMoney(req.body?.amount);
    const customAddress = String(req.body?.address || "").trim();

    if (isNaN(amount) || amount < MIN_WITHDRAW_USD) {
      return res.status(400).json({ error: "MIN_WITHDRAW_ERROR" });
    }

    const userRef = db.collection(Collections.USERS).doc(userId);

    const result = await db.runTransaction(async (transaction) => {
      const userSnap = await transaction.get(userRef);
      if (!userSnap.exists) throw new Error("User not found");

      const userData = userSnap.data();
      const targetAddress = customAddress || userData.trc20Address || "";

      if (!/^T[a-zA-Z0-9]{33}$/.test(targetAddress)) {
        throw new Error("INVALID_TRC20_ADDRESS");
      }

      const available = roundMoney(userData.availableBalance || 0);
      if (available < amount) {
        throw new Error("INSUFFICIENT_BALANCE");
      }

      const netAmount = roundMoney(amount - WITHDRAW_FEE_USD);
      const nowIso = new Date().toISOString();

      transaction.update(userRef, {
        availableBalance: roundMoney(available - amount),
        trc20Address: targetAddress
      });

      const witRef = db.collection(Collections.WITHDRAWALS).doc();
      transaction.set(witRef, {
        userId,
        username: req.tgUser.username || "",
        amount,
        fee: WITHDRAW_FEE_USD,
        netAmount,
        network: "USDT-TRC20",
        walletAddress: targetAddress,
        status: "submitted", // submitted -> processing -> completed (أو rejected مع استرداد الرصيد)
        steps: {
          submittedAt: nowIso,
          processingAt: null,
          completedAt: null
        },
        txHash: "",
        createdAt: nowIso
      });

      recordTransaction(transaction, {
        userId,
        type: "withdraw",
        titleKey: "tx_withdraw_submitted",
        amount,
        direction: "out",
        status: "pending",
        meta: { withdrawalId: witRef.id, netAmount, fee: WITHDRAW_FEE_USD }
      });

      return { id: witRef.id, netAmount };
    });

    res.json({ success: true, ...result });
  })
);

// =========================================================
// القنوات
// =========================================================
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
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: "Channel username required" });

    const cleanUsername = username.startsWith("@") ? username : `@${username}`;
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

// =========================================================
// الحملات الترويجية + خصم من الرصيد + تسوية الميزانية الذرية
// =========================================================
app.get(
  "/api/campaigns",
  telegramAuthMiddleware,
  asyncHandler(async (req, res) => {
    const snap = await db
      .collection(Collections.CAMPAIGNS)
      .where("advertiserId", "==", String(req.tgUser.id))
      .get();
    const campaigns = snap.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ campaigns });
  })
);

app.post(
  "/api/campaigns",
  telegramAuthMiddleware,
  asyncHandler(async (req, res) => {
    const userId = String(req.tgUser.id);
    const title = String(req.body?.title || "").trim().slice(0, 100);
    const content = String(req.body?.content || "").trim().slice(0, 1000);
    const budget = roundMoney(req.body?.budget);

    if (!title || !content || isNaN(budget) || budget <= 0) {
      return res.status(400).json({ error: "Invalid campaign parameters" });
    }

    const userRef = db.collection(Collections.USERS).doc(userId);
    const campRef = db.collection(Collections.CAMPAIGNS).doc();

    await db.runTransaction(async (transaction) => {
      const userSnap = await transaction.get(userRef);
      if (!userSnap.exists) throw new Error("User not found");

      const available = roundMoney(userSnap.data().availableBalance || 0);
      if (available < budget) {
        throw new Error("INSUFFICIENT_BALANCE");
      }

      transaction.update(userRef, {
        availableBalance: roundMoney(available - budget),
        totalSpent: admin.firestore.FieldValue.increment(budget)
      });

      transaction.set(campRef, {
        advertiserId: userId,
        title,
        content,
        budget,
        spent: 0,
        refundedAmount: 0,
        status: "Active",
        createdAt: new Date().toISOString()
      });

      recordTransaction(transaction, {
        userId,
        type: "campaign_spend",
        titleKey: "tx_campaign_launch",
        amount: budget,
        direction: "out",
        status: "completed",
        meta: { campaignId: campRef.id, title }
      });
    });

    res.json({ success: true, id: campRef.id });
  })
);

// إنهاء الحملة وتسوية الميزانية المتبقية ذرياً (Atomic Settlement)
app.post(
  "/api/campaigns/:id/settle",
  telegramAuthMiddleware,
  asyncHandler(async (req, res) => {
    const result = await settleCampaignAtomic(req.params.id, req.tgUser.id, req.isOwner);
    res.json({ success: true, ...result });
  })
);

// الدعم الفني المباشر
app.post(
  "/api/support",
  telegramAuthMiddleware,
  asyncHandler(async (req, res) => {
    const { message } = req.body;
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

// =========================================================
// مسارات الإدارة الحصرية للمالك فقط (Admin Control)
// =========================================================
app.get(
  "/api/admin/stats",
  telegramAuthMiddleware,
  ownerOnlyMiddleware,
  asyncHandler(async (req, res) => {
    const [usersSnap, channelsSnap, campaignsSnap, pendingDeps, pendingWits] = await Promise.all([
      db.collection(Collections.USERS).count().get(),
      db.collection(Collections.CHANNELS).count().get(),
      db.collection(Collections.CAMPAIGNS).count().get(),
      db.collection(Collections.DEPOSITS).where("status", "==", "pending").get(),
      db.collection(Collections.WITHDRAWALS).where("status", "in", ["submitted", "processing"]).get()
    ]);

    res.json({
      totalUsers: usersSnap.data().count,
      totalChannels: channelsSnap.data().count,
      activeCampaigns: campaignsSnap.data().count,
      pendingDepositsCount: pendingDeps.size,
      pendingWithdrawalsCount: pendingWits.size
    });
  })
);

// جلب طلبات الإيداع والسحب المعلقة للإدارة
app.get(
  "/api/admin/finance-queue",
  telegramAuthMiddleware,
  ownerOnlyMiddleware,
  asyncHandler(async (req, res) => {
    const [depsSnap, witsSnap] = await Promise.all([
      db.collection(Collections.DEPOSITS).where("status", "==", "pending").get(),
      db.collection(Collections.WITHDRAWALS).where("status", "in", ["submitted", "processing"]).get()
    ]);

    const deposits = depsSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const withdrawals = witsSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({ deposits, withdrawals });
  })
);

// اعتماد أو رفض إيداع (ملاحظة: شحن الرصيد لا يحتسب أي عمولة للمحيل إطلاقاً)
app.post(
  "/api/admin/deposits/:id/review",
  telegramAuthMiddleware,
  ownerOnlyMiddleware,
  asyncHandler(async (req, res) => {
    const action = req.body?.action; // approve | reject
    if (!["approve", "reject"].includes(action)) {
      return res.status(400).json({ error: "Invalid action" });
    }

    const depRef = db.collection(Collections.DEPOSITS).doc(String(req.params.id));

    await db.runTransaction(async (transaction) => {
      const depSnap = await transaction.get(depRef);
      if (!depSnap.exists) throw new Error("Deposit not found");

      const dep = depSnap.data();
      if (dep.status !== "pending") throw new Error("Deposit already processed");

      const userRef = db.collection(Collections.USERS).doc(String(dep.userId));
      const amount = roundMoney(dep.amount);

      if (action === "approve") {
        // إضافة الرصيد للمودع فقط دون احتساب أي عمولة إحالة على الشحن
        transaction.update(userRef, {
          availableBalance: admin.firestore.FieldValue.increment(amount)
        });

        transaction.update(depRef, {
          status: "approved",
          reviewedAt: new Date().toISOString()
        });

        recordTransaction(transaction, {
          userId: String(dep.userId),
          type: "deposit",
          titleKey: "tx_deposit_approved",
          amount,
          direction: "in",
          status: "completed",
          meta: { txid: dep.txid }
        });
      } else {
        transaction.update(depRef, {
          status: "rejected",
          reviewedAt: new Date().toISOString()
        });

        recordTransaction(transaction, {
          userId: String(dep.userId),
          type: "deposit",
          titleKey: "tx_deposit_rejected",
          amount,
          direction: "in",
          status: "rejected",
          meta: { txid: dep.txid }
        });
      }
    });

    res.json({ success: true });
  })
);

// تحديث دورة طلب السحب خطوة بخطوة (processing -> completed أو rejected مع استرداد المبلغ)
app.post(
  "/api/admin/withdrawals/:id/review",
  telegramAuthMiddleware,
  ownerOnlyMiddleware,
  asyncHandler(async (req, res) => {
    const { action, txHash } = req.body; // processing | completed | rejected
    if (!["processing", "completed", "rejected"].includes(action)) {
      return res.status(400).json({ error: "Invalid action" });
    }

    const witRef = db.collection(Collections.WITHDRAWALS).doc(String(req.params.id));
    const nowIso = new Date().toISOString();

    await db.runTransaction(async (transaction) => {
      const witSnap = await transaction.get(witRef);
      if (!witSnap.exists) throw new Error("Withdrawal not found");

      const wit = witSnap.data();
      if (["completed", "rejected"].includes(wit.status)) {
        throw new Error("Withdrawal already finalized");
      }

      if (action === "processing") {
        transaction.update(witRef, {
          status: "processing",
          "steps.processingAt": nowIso
        });
      } else if (action === "completed") {
        transaction.update(witRef, {
          status: "completed",
          txHash: String(txHash || "").trim(),
          "steps.processingAt": wit.steps?.processingAt || nowIso,
          "steps.completedAt": nowIso
        });

        recordTransaction(transaction, {
          userId: String(wit.userId),
          type: "withdraw",
          titleKey: "tx_withdraw_completed",
          amount: roundMoney(wit.amount),
          direction: "out",
          status: "completed",
          meta: { withdrawalId: witRef.id, txHash: String(txHash || "").trim() }
        });
      } else if (action === "rejected") {
        const userRef = db.collection(Collections.USERS).doc(String(wit.userId));
        transaction.update(userRef, {
          availableBalance: admin.firestore.FieldValue.increment(roundMoney(wit.amount))
        });

        transaction.update(witRef, {
          status: "rejected",
          reviewedAt: nowIso
        });

        recordTransaction(transaction, {
          userId: String(wit.userId),
          type: "withdraw",
          titleKey: "tx_withdraw_rejected",
          amount: roundMoney(wit.amount),
          direction: "in",
          status: "rejected",
          meta: { withdrawalId: witRef.id }
        });
      }
    });

    res.json({ success: true });
  })
);

// إضافة أرباح نشر لناشر (مع تفعيل حجز الـ 24 ساعة وعمولة الإحالة 10%)
app.post(
  "/api/admin/credit-publisher",
  telegramAuthMiddleware,
  ownerOnlyMiddleware,
  asyncHandler(async (req, res) => {
    const publisherId = String(req.body?.publisherId || "").trim();
    const amount = roundMoney(req.body?.amount);
    const campaignTitle = String(req.body?.campaignTitle || "Ad Placement").trim();

    if (!publisherId || isNaN(amount) || amount <= 0) {
      return res.status(400).json({ error: "Invalid publisher payout parameters" });
    }

    await creditPublisherEarningWithHold(publisherId, amount, campaignTitle);
    res.json({ success: true });
  })
);

app.post(
  "/api/admin/broadcast",
  telegramAuthMiddleware,
  ownerOnlyMiddleware,
  asyncHandler(async (req, res) => {
    const { message } = req.body;
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
  res.status(400).json({ error: err.message || "Internal Server Error" });
});

app.listen(PORT, () => {
  console.log(`Telega.ads server running securely on port ${PORT}`);
});
