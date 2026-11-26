import express from "express";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import {
  Collections,
  WALLET_CONSTANTS,
  db,
  logSecurityEvent,
  processMatureEarnings,
  recordTransaction,
  settleCampaignBudgetAtomically,
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

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
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
    const startParam = urlParams.get("start_param") || "";
    const parsedUser = userRaw ? JSON.parse(userRaw) : null;
    if (parsedUser && startParam) {
      parsedUser.startParam = startParam;
    }
    return parsedUser;
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
  req.isOwner = String(verifiedUser.id) === String(process.env.ADMIN_TELEGRAM_ID);
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

// مزامنة بيانات المستخدم + تحرير أي أرباح أتمت 24 ساعة
app.post(
  "/api/auth/sync",
  telegramAuthMiddleware,
  asyncHandler(async (req, res) => {
    const startParam = req.tgUser.startParam || req.body?.startParam || "";
    await upsertTelegramUser(req.tgUser, startParam);
    await processMatureEarnings(req.tgUser.id);

    res.json({
      success: true,
      isOwner: req.isOwner,
      officialChannel: process.env.OFFICIAL_CHANNEL_URL || "https://t.me/TelegaAdsOfficial",
      botUsername: process.env.BOT_USERNAME || "TelegaAdsBot"
    });
  })
);

// =========================================================
// منظومة المحفظة (Wallet) وسجل الإيداعات والسحوبات
// =========================================================

// جلب ملخص المحفظة الفوري + آخر 10 معاملات + سجل الإيداعات والسحوبات
app.get(
  "/api/wallet/summary",
  telegramAuthMiddleware,
  asyncHandler(async (req, res) => {
    const userId = String(req.tgUser.id);

    // تحرير الأرباح التي مرّ عليها 24 ساعة قبل القراءة
    await processMatureEarnings(userId);

    const [userSnap, txSnap, depSnap, wdSnap] = await Promise.all([
      db.collection(Collections.USERS).doc(userId).get(),
      db.collection(Collections.TRANSACTIONS).where("userId", "==", userId).get(),
      db.collection(Collections.DEPOSITS).where("userId", "==", userId).get(),
      db.collection(Collections.WITHDRAWALS).where("userId", "==", userId).get()
    ]);

    const userData = userSnap.exists ? userSnap.data() : {};

    const transactions = txSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
      .slice(0, 10);

    const deposits = depSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));

    const withdrawals = wdSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));

    res.json({
      wallet: {
        balance: roundMoney(userData.balance || 0),
        pendingBalance: roundMoney(userData.pendingBalance || 0),
        totalSpent: roundMoney(userData.totalSpent || 0),
        totalEarned: roundMoney(userData.totalEarned || 0),
        trc20Wallet: userData.trc20Wallet || "",
        constants: WALLET_CONSTANTS
      },
      transactions,
      deposits,
      withdrawals
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

    if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address)) {
      return res.status(400).json({ error: "Invalid USDT TRC20 wallet address (must start with T and be 34 chars)" });
    }

    await db.collection(Collections.USERS).doc(userId).set(
      {
        trc20Wallet: address,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    res.json({ success: true, trc20Wallet: address });
  })
);

// إرسال طلب إيداع عبر USDT - BEP20 مع TXID (الحد الأدنى $10.00 - لا عمولة إحالة على الإيداعات)
app.post(
  "/api/wallet/deposit",
  telegramAuthMiddleware,
  asyncHandler(async (req, res) => {
    const userId = String(req.tgUser.id);
    const amount = roundMoney(req.body?.amount);
    const txid = String(req.body?.txid || "").trim();

    if (isNaN(amount) || amount < WALLET_CONSTANTS.MIN_DEPOSIT) {
      return res.status(400).json({ error: `Minimum deposit is $${WALLET_CONSTANTS.MIN_DEPOSIT.toFixed(2)}` });
    }

    if (!txid || txid.length < 16 || txid.length > 128) {
      return res.status(400).json({ error: "Valid Transaction Hash (TXID) is required" });
    }

    // منع تكرار نفس رقم المعاملة TXID
    const dupSnap = await db
      .collection(Collections.DEPOSITS)
      .where("txid", "==", txid)
      .limit(1)
      .get();

    if (!dupSnap.empty) {
      return res.status(409).json({ error: "This TXID has already been submitted" });
    }

    const now = new Date().toISOString();
    const depRef = await db.collection(Collections.DEPOSITS).add({
      userId,
      username: req.tgUser.username || "",
      amount,
      network: WALLET_CONSTANTS.DEPOSIT_NETWORK,
      depositAddress: WALLET_CONSTANTS.DEPOSIT_ADDRESS,
      txid,
      status: "pending_review", // pending_review | approved | rejected
      createdAt: now
    });

    await recordTransaction(null, {
      userId,
      type: "deposit",
      amount,
      direction: "in",
      status: "pending_review",
      title: `Deposit Request (${WALLET_CONSTANTS.DEPOSIT_NETWORK})`,
      meta: { depositId: depRef.id, txid, network: WALLET_CONSTANTS.DEPOSIT_NETWORK }
    });

    res.json({ success: true, id: depRef.id });
  })
);

// إرسال طلب سحب عبر USDT - TRC20 (الحد الأدنى $30.00 + خصم رسوم $3.00 ذرياً)
app.post(
  "/api/wallet/withdraw",
  telegramAuthMiddleware,
  asyncHandler(async (req, res) => {
    const userId = String(req.tgUser.id);
    const amount = roundMoney(req.body?.amount);
    const providedAddress = String(req.body?.address || "").trim();

    if (isNaN(amount) || amount < WALLET_CONSTANTS.MIN_WITHDRAWAL) {
      return res.status(400).json({ error: `Minimum withdrawal is $${WALLET_CONSTANTS.MIN_WITHDRAWAL.toFixed(2)}` });
    }

    await processMatureEarnings(userId);

    const fee = WALLET_CONSTANTS.WITHDRAWAL_FEE;
    const netAmount = roundMoney(amount - fee);
    if (netAmount <= 0) {
      return res.status(400).json({ error: "Invalid net withdrawal amount" });
    }

    const result = await db.runTransaction(async (tx) => {
      const userRef = db.collection(Collections.USERS).doc(userId);
      const userSnap = await tx.get(userRef);
      if (!userSnap.exists) throw new Error("User account not found");

      const userData = userSnap.data() || {};
      const walletAddress = providedAddress || userData.trc20Wallet || "";

      if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(walletAddress)) {
        throw new Error("Please set a valid USDT TRC20 wallet address first");
      }

      const currentBalance = roundMoney(userData.balance || 0);
      if (currentBalance < amount) {
        throw new Error("Insufficient available balance");
      }

      const updatedBalance = roundMoney(currentBalance - amount);
      const wdRef = db.collection(Collections.WITHDRAWALS).doc();
      const now = new Date().toISOString();

      tx.update(userRef, {
        balance: updatedBalance,
        trc20Wallet: walletAddress
      });

      tx.set(wdRef, {
        userId,
        username: req.tgUser.username || "",
        amount,
        fee,
        netAmount,
        network: WALLET_CONSTANTS.WITHDRAWAL_NETWORK,
        walletAddress,
        status: "pending_review", // pending_review | processing | completed | rejected
        txHash: "",
        createdAt: now,
        updatedAt: now
      });

      recordTransaction(tx, {
        userId,
        type: "withdrawal",
        amount,
        direction: "out",
        status: "pending_review",
        title: `Withdrawal (${WALLET_CONSTANTS.WITHDRAWAL_NETWORK}) - Net $${netAmount.toFixed(2)}`,
        meta: {
          withdrawalId: wdRef.id,
          fee,
          netAmount,
          walletAddress,
          network: WALLET_CONSTANTS.WITHDRAWAL_NETWORK
        }
      });

      return { id: wdRef.id, newBalance: updatedBalance };
    });

    res.json({ success: true, ...result });
  })
);

// =========================================================
// قسم الإحالة (Referrals) - 10% من أرباح الناشرين فقط + احتجاز 24 ساعة
// =========================================================
app.get(
  "/api/referrals/summary",
  telegramAuthMiddleware,
  asyncHandler(async (req, res) => {
    const userId = String(req.tgUser.id);
    await processMatureEarnings(userId);

    const [userSnap, invitedSnap, refTxSnap] = await Promise.all([
      db.collection(Collections.USERS).doc(userId).get(),
      db.collection(Collections.USERS).where("referredBy", "==", userId).get(),
      db.collection(Collections.TRANSACTIONS).where("userId", "==", userId).get()
    ]);

    const userData = userSnap.exists ? userSnap.data() : {};
    const referralHistory = refTxSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((item) => item.type === "referral_earning")
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
      .slice(0, 15);

    res.json({
      commissionRate: 10,
      invitedCount: invitedSnap.size,
      availableReferralEarnings: roundMoney(userData.referralEarnings || 0),
      pendingReferralEarnings: roundMoney(userData.pendingReferralEarnings || 0),
      history: referralHistory
    });
  })
);

// القنوات
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

// الحملات الترويجية (مع خصم الميزانية ذرياً + إمكانية إنهاء وتسوية الميزانية المتبقية)
app.get(
  "/api/campaigns",
  telegramAuthMiddleware,
  asyncHandler(async (req, res) => {
    const snap = await db
      .collection(Collections.CAMPAIGNS)
      .where("advertiserId", "==", String(req.tgUser.id))
      .get();
    const campaigns = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    res.json({ campaigns });
  })
);

app.post(
  "/api/campaigns",
  telegramAuthMiddleware,
  asyncHandler(async (req, res) => {
    const { title, content, budget } = req.body;
    const cleanBudget = roundMoney(budget);
    if (!title || !content || isNaN(cleanBudget) || cleanBudget <= 0) {
      return res.status(400).json({ error: "Invalid campaign parameters" });
    }

    const userId = String(req.tgUser.id);
    const created = await db.runTransaction(async (tx) => {
      const userRef = db.collection(Collections.USERS).doc(userId);
      const userSnap = await tx.get(userRef);
      if (!userSnap.exists) throw new Error("User account not found");

      const userData = userSnap.data() || {};
      const availableBalance = roundMoney(userData.balance || 0);
      if (availableBalance < cleanBudget) {
        throw new Error("Insufficient wallet balance to launch campaign");
      }

      const campRef = db.collection(Collections.CAMPAIGNS).doc();
      const now = new Date().toISOString();

      tx.update(userRef, {
        balance: roundMoney(availableBalance - cleanBudget),
        totalSpent: roundMoney((userData.totalSpent || 0) + cleanBudget)
      });

      tx.set(campRef, {
        advertiserId: userId,
        title: String(title).slice(0, 100),
        content: String(content).slice(0, 1000),
        budget: cleanBudget,
        spent: 0,
        status: "Active",
        settled: false,
        createdAt: now
      });

      recordTransaction(tx, {
        userId,
        type: "campaign_spend",
        amount: cleanBudget,
        direction: "out",
        status: "completed",
        title: `Campaign Launch: ${String(title).slice(0, 50)}`,
        meta: { campaignId: campRef.id }
      });

      return { id: campRef.id };
    });

    res.json({ success: true, id: created.id });
  })
);

// إنهاء الحملة الإعلانية وتسوية الميزانية المتبقية ذرياً إلى رصيد المعلن
app.post(
  "/api/campaigns/:id/complete",
  telegramAuthMiddleware,
  asyncHandler(async (req, res) => {
    const settlement = await settleCampaignBudgetAtomically(
      req.params.id,
      req.tgUser.id,
      req.isOwner
    );
    res.json({ success: true, ...settlement });
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
// مسارات الإدارة الحصرية للمالك فقط (Admin Panel Integration)
// =========================================================
app.get(
  "/api/admin/stats",
  telegramAuthMiddleware,
  ownerOnlyMiddleware,
  asyncHandler(async (req, res) => {
    const [usersSnap, channelsSnap, campaignsSnap, pendingDepSnap, pendingWdSnap, approvedDepSnap] =
      await Promise.all([
        db.collection(Collections.USERS).count().get(),
        db.collection(Collections.CHANNELS).count().get(),
        db.collection(Collections.CAMPAIGNS).count().get(),
        db.collection(Collections.DEPOSITS).where("status", "==", "pending_review").count().get(),
        db.collection(Collections.WITHDRAWALS).where("status", "in", ["pending_review", "processing"]).count().get(),
        db.collection(Collections.DEPOSITS).where("status", "==", "approved").get()
      ]);

    const totalVolume = approvedDepSnap.docs.reduce(
      (sum, d) => roundMoney(sum + Number(d.data()?.amount || 0)),
      0
    );

    res.json({
      totalUsers: usersSnap.data().count,
      totalChannels: channelsSnap.data().count,
      activeCampaigns: campaignsSnap.data().count,
      pendingDeposits: pendingDepSnap.data().count,
      pendingWithdrawals: pendingWdSnap.data().count,
      totalVolume
    });
  })
);

// جلب طلبات الإيداع والسحب للإدارة
app.get(
  "/api/admin/finance/requests",
  telegramAuthMiddleware,
  ownerOnlyMiddleware,
  asyncHandler(async (req, res) => {
    const [depSnap, wdSnap] = await Promise.all([
      db.collection(Collections.DEPOSITS).get(),
      db.collection(Collections.WITHDRAWALS).get()
    ]);

    const deposits = depSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
      .slice(0, 40);

    const withdrawals = wdSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
      .slice(0, 40);

    res.json({ deposits, withdrawals });
  })
);

// اعتماد أو رفض طلب إيداع (بدون احتساب أي عمولة إحالة على الإيداعات)
app.post(
  "/api/admin/deposits/:id/decision",
  telegramAuthMiddleware,
  ownerOnlyMiddleware,
  asyncHandler(async (req, res) => {
    const depositId = String(req.params.id);
    const action = String(req.body?.action || ""); // approve | reject
    const note = String(req.body?.note || "").trim();

    if (!["approve", "reject"].includes(action)) {
      return res.status(400).json({ error: "Invalid decision action" });
    }

    const depRef = db.collection(Collections.DEPOSITS).doc(depositId);

    await db.runTransaction(async (tx) => {
      const depSnap = await tx.get(depRef);
      if (!depSnap.exists) throw new Error("Deposit request not found");

      const dep = depSnap.data() || {};
      if (dep.status !== "pending_review") {
        throw new Error("Deposit request already processed");
      }

      const userId = String(dep.userId);
      const amount = roundMoney(dep.amount || 0);
      const userRef = db.collection(Collections.USERS).doc(userId);
      const userSnap = await tx.get(userRef);
      if (!userSnap.exists) throw new Error("User account not found");

      const userData = userSnap.data() || {};
      const now = new Date().toISOString();

      if (action === "approve") {
        const newBalance = roundMoney((userData.balance || 0) + amount);
        tx.update(userRef, { balance: newBalance });
        tx.update(depRef, {
          status: "approved",
          reviewedBy: String(req.tgUser.id),
          reviewNote: note,
          reviewedAt: now
        });

        // إضافة معاملة مكتملة دون أي عمولة إحالة (الإيداعات مستثناة من الإحالة)
        recordTransaction(tx, {
          userId,
          type: "deposit",
          amount,
          direction: "in",
          status: "completed",
          title: `Deposit Approved (${dep.network || "USDT - BEP20"})`,
          meta: { depositId, txid: dep.txid }
        });
      } else {
        tx.update(depRef, {
          status: "rejected",
          reviewedBy: String(req.tgUser.id),
          reviewNote: note || "Rejected by admin",
          reviewedAt: now
        });

        recordTransaction(tx, {
          userId,
          type: "deposit",
          amount,
          direction: "in",
          status: "rejected",
          title: `Deposit Rejected (${dep.network || "USDT - BEP20"})`,
          meta: { depositId, txid: dep.txid, note }
        });
      }
    });

    await logSecurityEvent("ADMIN_DEPOSIT_REVIEW", {
      adminId: req.tgUser.id,
      depositId,
      action
    });

    res.json({ success: true });
  })
);

// تحديث دورة طلب السحب (قيد المعالجة / مكتمل / مرفوض مع إعادة المبلغ للمستخدم ذرياً عند الرفض)
app.post(
  "/api/admin/withdrawals/:id/decision",
  telegramAuthMiddleware,
  ownerOnlyMiddleware,
  asyncHandler(async (req, res) => {
    const withdrawalId = String(req.params.id);
    const status = String(req.body?.status || ""); // processing | completed | rejected
    const txHash = String(req.body?.txHash || "").trim();
    const note = String(req.body?.note || "").trim();

    if (!["processing", "completed", "rejected"].includes(status)) {
      return res.status(400).json({ error: "Invalid withdrawal status" });
    }

    const wdRef = db.collection(Collections.WITHDRAWALS).doc(withdrawalId);

    await db.runTransaction(async (tx) => {
      const wdSnap = await tx.get(wdRef);
      if (!wdSnap.exists) throw new Error("Withdrawal request not found");

      const wd = wdSnap.data() || {};
      if (["completed", "rejected"].includes(wd.status)) {
        throw new Error("Withdrawal request is already finalized");
      }

      const userId = String(wd.userId);
      const amount = roundMoney(wd.amount || 0);
      const userRef = db.collection(Collections.USERS).doc(userId);
      const userSnap = await tx.get(userRef);
      if (!userSnap.exists) throw new Error("User account not found");

      const userData = userSnap.data() || {};
      const now = new Date().toISOString();

      if (status === "processing") {
        tx.update(wdRef, {
          status: "processing",
          updatedAt: now,
          reviewedBy: String(req.tgUser.id)
        });
      } else if (status === "completed") {
        tx.update(wdRef, {
          status: "completed",
          txHash,
          reviewNote: note,
          updatedAt: now,
          completedAt: now,
          reviewedBy: String(req.tgUser.id)
        });

        recordTransaction(tx, {
          userId,
          type: "withdrawal",
          amount,
          direction: "out",
          status: "completed",
          title: `Withdrawal Completed (${wd.network || "USDT - TRC20"})`,
          meta: { withdrawalId, txHash, walletAddress: wd.walletAddress }
        });
      } else if (status === "rejected") {
        // إعادة المبلغ كاملاً (بما فيه الرسوم المقتطعة عند الطلب) إلى رصيد المستخدم
        const refundedBalance = roundMoney((userData.balance || 0) + amount);
        tx.update(userRef, { balance: refundedBalance });

        tx.update(wdRef, {
          status: "rejected",
          reviewNote: note || "Rejected by admin",
          updatedAt: now,
          reviewedBy: String(req.tgUser.id)
        });

        recordTransaction(tx, {
          userId,
          type: "withdrawal",
          amount,
          direction: "in",
          status: "rejected",
          title: `Withdrawal Rejected & Refunded`,
          meta: { withdrawalId, note }
        });
      }
    });

    await logSecurityEvent("ADMIN_WITHDRAWAL_REVIEW", {
      adminId: req.tgUser.id,
      withdrawalId,
      status
    });

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
  res.status(err.status || 400).json({ error: err.message || "Internal Server Error" });
});

app.listen(PORT, () => {
  console.log(`Telega.ads server running securely on port ${PORT}`);
});
