import express from "express";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import multer from "multer";
import TelegramBot from "node-telegram-bot-api";
import {
  db,
  bucket,
  FieldValue,
  Collections,
  CollectionRefs,
  CONFIG,
  WALLET_CONSTANTS,
  TRANSACTION_TYPES,
  TRANSACTION_STATUS,
  WITHDRAWAL_STEPS,
  SUPPORTED_LANGUAGES,
  CHANNEL_CATEGORIES,
  roundMoney,
  isValidTrc20Address,
  isValidTxid,
  createUserRecord,
  createUserSchema,
  createChannelSchema,
  createCampaignSchema,
  createEarningHoldRecord,
  createTransactionRecord,
  createWithdrawalRequestRecord,
  upsertTelegramUser,
  logSecurityEvent
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
app.use(express.json({ limit: "15mb" }));
app.use(express.static(path.join(__dirname, "public")));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }
});

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

const BOT_TOKEN = (process.env.BOT_TOKEN || "").trim();
const OWNER_ID = String(
  process.env.ADMIN_TELEGRAM_ID || process.env.OWNER_TELEGRAM_ID || ""
).trim();
const WEBAPP_URL = (process.env.WEBAPP_URL || "").trim();

const bot = BOT_TOKEN ? new TelegramBot(BOT_TOKEN, { polling: false }) : null;

const collections = {
  users: CollectionRefs?.USERS || db.collection(Collections.USERS || "users"),
  channels: CollectionRefs?.CHANNELS || db.collection(Collections.CHANNELS || "channels"),
  campaigns: CollectionRefs?.CAMPAIGNS || db.collection(Collections.CAMPAIGNS || "campaigns"),
  drafts: CollectionRefs?.DRAFTS || db.collection(Collections.DRAFTS || "campaign_drafts"),
  postLogs: CollectionRefs?.POST_LOGS || db.collection(Collections.POST_LOGS || "post_logs"),
  tickets: CollectionRefs?.TICKETS || db.collection(Collections.TICKETS || "support_tickets"),
  transactions:
    CollectionRefs?.TRANSACTIONS || db.collection(Collections.TRANSACTIONS || "transactions"),
  deposits: db.collection("deposits"),
  withdrawals:
    CollectionRefs?.WITHDRAWALS || db.collection(Collections.WITHDRAWALS || "withdrawals"),
  earningHolds:
    CollectionRefs?.EARNING_HOLDS || db.collection(Collections.EARNING_HOLDS || "earning_holds"),
  notifications:
    CollectionRefs?.NOTIFICATIONS || db.collection(Collections.NOTIFICATIONS || "notifications"),
  backups: CollectionRefs?.BACKUPS || db.collection(Collections.BACKUPS || "database_backups")
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
  if (typeof val === "number") return val;
  const parsed = new Date(val).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function sortByCreatedAtDesc(items) {
  return [...items].sort((a, b) => toTimeMs(b?.createdAt) - toTimeMs(a?.createdAt));
}

// ==================== التحقق الأمني من جلسة تيليجرام ====================

function verifyTelegramWebAppData(initData) {
  if (!initData || !BOT_TOKEN) return null;
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
      .update(BOT_TOKEN)
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

const telegramAuthMiddleware = asyncHandler(async (req, res, next) => {
  const initData = req.headers["x-telegram-init-data"];
  const verifiedUser = verifyTelegramWebAppData(initData);

  if (!verifiedUser || !verifiedUser.id) {
    await logSecurityEvent("UNVERIFIED_ACCESS_ATTEMPT", { ip: req.ip, path: req.path });
    return res.status(401).json({ error: "Unauthorized Telegram session" });
  }

  req.tgUser = verifiedUser;
  req.uid = String(verifiedUser.id);
  req.isOwner = Boolean(OWNER_ID) && String(verifiedUser.id) === OWNER_ID;
  next();
});

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

// ==================== دوال المستخدم والمحفظة والإشعارات ====================

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
    const currentPending = roundMoney(
      userData.pendingEarningsUsd ?? userData.pendingEarnings ?? 0
    );
    const currentAvailable = roundMoney(
      userData.availableEarningsUsd ?? userData.publisherBalance ?? 0
    );
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
      pendingEarnings: newPending,
      availableEarningsUsd: newAvailable,
      publisherBalance: newAvailable,
      updatedAt: nowIso
    });
  });
}

async function sendSystemNotification(userId, title, message, type = "info") {
  if (!userId) return;
  const notifRef = collections.notifications.doc();
  await notifRef.set({
    id: notifRef.id,
    userId: String(userId),
    title,
    message,
    type,
    read: false,
    createdAt: Date.now()
  });

  if (bot) {
    try {
      await bot.sendMessage(String(userId), `🔔 *${title}*\n\n${message}`, {
        parse_mode: "Markdown"
      });
    } catch {
      // تجاهل إذا لم يبدأ المستخدم محادثة خاصة مع البوت بعد
    }
  }
}

function buildPlatformPromoText() {
  return (
    "✨ إعلانك يصل بدقة، وقناتك تكسب بدون تعقيد.\n" +
    "أطلق حملتك أو حقق الدخل من قناتك مع تتبع لحظي وعوائد إحالة مستمرة ⚡"
  );
}

function buildReferralLink(publisherId) {
  return WEBAPP_URL
    ? `${WEBAPP_URL}?start=ref_${publisherId}`
    : `https://t.me/${CONFIG.BOT_USERNAME}?start=ref_${publisherId}`;
}

function formatAdvertiserPost(campaign, publisherId) {
  const refLink = buildReferralLink(publisherId);
  const bodyText = campaign.adText || campaign.content || "";
  return `${bodyText}\n\n— — —\nPowered by [Telega.ads](${refLink})`;
}

// ==================== منطق البوت الذكي عند الإضافة كمسؤول ====================

export async function handleBotMyChatMemberUpdate(update) {
  if (!bot || !update || !update.chat) return;

  const chat = update.chat;
  const actor = update.from;
  const newStatus = update.new_chat_member?.status;

  if (chat.type !== "channel") return;

  const channelDocId = String(chat.id);
  const channelRef = collections.channels.doc(channelDocId);
  const existingSnap = await channelRef.get();

  const isAdminNow = newStatus === "administrator";
  const canPostMessages = Boolean(update.new_chat_member?.can_post_messages);

  if (!chat.username) {
    if (isAdminNow && actor?.id) {
      await bot.sendMessage(
        String(actor.id),
        "❌ يتم قبول القنوات العامة فقط التي تمتلك معرفاً عاماً (@username). يرجى جعل القناة عامة ثم إعادة المحاولة."
      );
      try {
        await bot.leaveChat(chat.id);
      } catch {}
    }
    return;
  }

  let chatInfo = chat;
  let subscribersCount = existingSnap.exists ? existingSnap.data().subscribers || 0 : 0;
  try {
    chatInfo = await bot.getChat(chat.id);
    subscribersCount = await bot.getChatMemberCount(chat.id);
  } catch {}

  let photoUrl = existingSnap.exists ? existingSnap.data().photoUrl || "" : "";
  if (chatInfo.photo?.big_file_id) {
    try {
      photoUrl = await bot.getFileLink(chatInfo.photo.big_file_id);
    } catch {}
  }

  if (!existingSnap.exists) {
    if (!isAdminNow) return;

    const ownerId = actor?.id ? String(actor.id) : "";
    if (ownerId) {
      const userRef = collections.users.doc(ownerId);
      const userSnap = await userRef.get();
      if (!userSnap.exists) {
        await userRef.set(
          createUserSchema({
            id: actor.id,
            username: actor.username || "",
            first_name: actor.first_name,
            last_name: actor.last_name || "",
            language_code: actor.language_code
          })
        );
      }
    }

    const newChannel = createChannelSchema({
      chatId: chat.id,
      username: chat.username,
      title: chatInfo.title || chat.title,
      photoUrl,
      subscribers: subscribersCount,
      ownerId,
      cpmPrice: CONFIG.MIN_CPM_PRICE,
      language: "ar",
      category: "other"
    });

    newChannel.botHasAdmin = isAdminNow && canPostMessages;
    newChannel.status = "awaiting_setup";
    await channelRef.set(newChannel);

    if (ownerId) {
      await sendSystemNotification(
        ownerId,
        "تم التعرف على إضافتك للبوت",
        `تم رصد إضافتك للبوت @${CONFIG.BOT_USERNAME} كمسؤول في القناة "${newChannel.title}". افتح قسم "قنواتي" لإكمال تحديد السعر (1$ - 3$) واللغة والتصنيف.`,
        "channel_detected"
      );
    }
    return;
  }

  const prev = existingSnap.data();
  const updates = {
    title: chatInfo.title || prev.title,
    username: chat.username,
    photoUrl: photoUrl || prev.photoUrl,
    subscribers: subscribersCount,
    botHasAdmin: isAdminNow && canPostMessages,
    updatedAt: Date.now()
  };

  if (!isAdminNow || !canPostMessages) {
    updates.status = "permission_lost";
    await channelRef.update(updates);
    if (prev.ownerId) {
      await sendSystemNotification(
        prev.ownerId,
        "تنبيه صلاحيات البوت",
        `فقد البوت صلاحية النشر أو الإشراف في القناة "${updates.title}". يرجى إعادة منح الصلاحيات لاستمرار استقبال الإعلانات.`,
        "permission_warning"
      );
    }
  } else if (prev.status === "permission_lost") {
    updates.status =
      subscribersCount > CONFIG.AUTO_APPROVE_SUBSCRIBERS ? "approved" : "pending_admin";
    await channelRef.update(updates);
    if (updates.status === "approved" && !prev.promoPostSent) {
      await publishPlatformFreePromo(channelRef, { ...prev, ...updates });
    }
  } else {
    await channelRef.update(updates);
  }
}

async function publishPlatformFreePromo(channelRef, channelData) {
  if (!bot || channelData.promoPostSent || !channelData.botHasAdmin) return;

  try {
    const refLink = buildReferralLink(channelData.ownerId);
    const sentMsg = await bot.sendMessage(channelData.chatId, buildPlatformPromoText(), {
      reply_markup: {
        inline_keyboard: [[{ text: "Open ←", url: refLink }]]
      }
    });

    await channelRef.update({
      promoPostSent: true,
      promoMessageId: sentMsg.message_id,
      updatedAt: Date.now()
    });
  } catch (err) {
    console.error("Error publishing platform promo:", err.message);
  }
}

// ==================== منطق نشر الحملات وجلب المشاهدات والخصم الذري ====================

async function publishCampaignToChannel(campaignDoc, channelDoc) {
  if (!bot) return { ok: false, reason: "bot_not_configured" };

  const campaign = campaignDoc.data();
  const channel = channelDoc.data();

  if (campaign.status !== "active" && campaign.status !== "Active") {
    return { ok: false, reason: "campaign_not_active" };
  }
  if (!channel.botHasAdmin || channel.status !== "approved") {
    return { ok: false, reason: "channel_not_eligible" };
  }

  const remaining = Number(campaign.remainingBudget ?? campaign.remainingBudgetUsd ?? 0);
  if (remaining < Number(channel.cpmPrice || CONFIG.MIN_CPM_PRICE)) {
    return { ok: false, reason: "insufficient_budget" };
  }

  const logId = `${campaignDoc.id}_${channelDoc.id}`;
  const logRef = collections.postLogs.doc(logId);
  const existingLog = await logRef.get();
  if (existingLog.exists) {
    return { ok: false, reason: "already_published" };
  }

  const formattedText = formatAdvertiserPost(campaign, channel.ownerId);
  const replyMarkup = campaign.buttonUrl
    ? {
        inline_keyboard: [[{ text: campaign.buttonText || "Open", url: campaign.buttonUrl }]]
      }
    : undefined;

  let sentMessage;
  if (campaign.mediaType === "photo" && campaign.mediaUrl) {
    sentMessage = await bot.sendPhoto(channel.chatId, campaign.mediaUrl, {
      caption: formattedText,
      parse_mode: "Markdown",
      reply_markup: replyMarkup
    });
  } else if (campaign.mediaType === "video" && campaign.mediaUrl) {
    sentMessage = await bot.sendVideo(channel.chatId, campaign.mediaUrl, {
      caption: formattedText,
      parse_mode: "Markdown",
      reply_markup: replyMarkup
    });
  } else {
    sentMessage = await bot.sendMessage(channel.chatId, formattedText, {
      parse_mode: "Markdown",
      reply_markup: replyMarkup,
      disable_web_page_preview: false
    });
  }

  await logRef.set({
    id: logId,
    campaignId: campaignDoc.id,
    channelId: channelDoc.id,
    advertiserId: campaign.advertiserId,
    publisherId: channel.ownerId,
    messageId: sentMessage.message_id,
    cpmPrice: channel.cpmPrice,
    countedViews: 0,
    settledAmount: 0,
    publishedAt: Date.now(),
    lastViewSyncAt: Date.now()
  });

  await campaignDoc.ref.update({
    "stats.channelsPublished": FieldValue.increment(1),
    updatedAt: Date.now()
  });

  return { ok: true, messageId: sentMessage.message_id };
}

async function syncViewsAndSettle() {
  if (!bot) return { syncedLogs: 0 };

  const logsSnap = await collections.postLogs.get();
  let syncedLogs = 0;

  for (const logDoc of logsSnap.docs) {
    const log = logDoc.data();
    const campaignRef = collections.campaigns.doc(log.campaignId);
    const channelRef = collections.channels.doc(log.channelId);

    const [campaignSnap, channelSnap] = await Promise.all([campaignRef.get(), channelRef.get()]);
    if (!campaignSnap.exists || !channelSnap.exists) continue;

    const campaign = campaignSnap.data();
    const channel = channelSnap.data();

    const isCampaignActive = campaign.status === "active" || campaign.status === "Active";
    const campaignRemaining = Number(
      campaign.remainingBudget ?? campaign.remainingBudgetUsd ?? 0
    );
    if (!isCampaignActive || campaignRemaining <= 0) continue;

    let currentViews = log.countedViews || 0;
    try {
      const forwarded = await bot.forwardMessage(
        channel.ownerId || campaign.advertiserId,
        channel.chatId,
        log.messageId
      );
      if (typeof forwarded.views === "number" && forwarded.views > currentViews) {
        currentViews = forwarded.views;
      }
      await bot.deleteMessage(channel.ownerId || campaign.advertiserId, forwarded.message_id);
    } catch {}

    const newViews = Math.max(0, currentViews - (log.countedViews || 0));
    if (newViews <= 0) continue;

    const now = new Date();
    const nowIso = now.toISOString();
    const releaseAtIso = new Date(
      now.getTime() + config.earningsHoldHours * 60 * 60 * 1000
    ).toISOString();

    await db.runTransaction(async (tx) => {
      const freshLog = await tx.get(logDoc.ref);
      const freshCampaign = await tx.get(campaignRef);
      const freshChannel = await tx.get(channelRef);

      if (!freshLog.exists || !freshCampaign.exists || !freshChannel.exists) return;

      const latestCountedViews = freshLog.data().countedViews || 0;
      const deltaViews = currentViews - latestCountedViews;
      if (deltaViews <= 0) return;

      const campData = freshCampaign.data();
      const latestRemaining = Number(
        campData.remainingBudget ?? campData.remainingBudgetUsd ?? 0
      );
      if (latestRemaining <= 0) {
        tx.update(campaignRef, { status: "paused", updatedAt: Date.now() });
        return;
      }

      const rawCharge = (deltaViews / 1000) * Number(freshChannel.data().cpmPrice);
      const chargeableCost = roundMoney(Math.min(latestRemaining, rawCharge));
      if (chargeableCost <= 0) return;

      const publisherId = String(freshChannel.data().ownerId);
      const publisherRef = collections.users.doc(publisherId);
      const publisherSnap = await tx.get(publisherRef);

      let referralCommission = 0;
      let referrerId = null;
      let referrerRef = null;
      let referrerSnap = null;

      if (publisherSnap.exists) {
        const pubData = publisherSnap.data() || {};
        if (pubData.referredBy && String(pubData.referredBy) !== publisherId) {
          referrerId = String(pubData.referredBy);
          referrerRef = collections.users.doc(referrerId);
          referrerSnap = await tx.get(referrerRef);
          if (referrerSnap.exists) {
            referralCommission = roundMoney(chargeableCost * config.referralCommissionRate);
          } else {
            referrerId = null;
            referrerRef = null;
          }
        }
      }

      const netPublisherEarnings = roundMoney(chargeableCost - referralCommission);
      const newRemainingBudget = roundMoney(Math.max(0, latestRemaining - chargeableCost));

      tx.update(logDoc.ref, {
        countedViews: currentViews,
        settledAmount: FieldValue.increment(chargeableCost),
        lastViewSyncAt: Date.now()
      });

      tx.update(campaignRef, {
        remainingBudget: newRemainingBudget,
        remainingBudgetUsd: newRemainingBudget,
        spentBudget: FieldValue.increment(chargeableCost),
        spentUsd: FieldValue.increment(chargeableCost),
        "stats.totalViews": FieldValue.increment(deltaViews),
        status: newRemainingBudget <= 0 ? "paused" : campData.status,
        updatedAt: Date.now()
      });

      tx.update(channelRef, {
        totalViewsDelivered: FieldValue.increment(deltaViews),
        totalEarned: FieldValue.increment(netPublisherEarnings),
        updatedAt: Date.now()
      });

      if (publisherSnap.exists && netPublisherEarnings > 0) {
        const pubData = publisherSnap.data() || {};
        const nextPending = roundMoney(
          (pubData.pendingEarningsUsd ?? pubData.pendingEarnings ?? 0) + netPublisherEarnings
        );
        const nextTotalEarned = roundMoney((pubData.totalEarnedUsd || 0) + netPublisherEarnings);

        tx.update(publisherRef, {
          pendingEarnings: nextPending,
          pendingEarningsUsd: nextPending,
          totalEarnedUsd: nextTotalEarned,
          updatedAt: nowIso
        });

        const holdId = generateId("hold");
        tx.set(
          collections.earningHolds.doc(holdId),
          createEarningHoldRecord({
            id: holdId,
            userId: publisherId,
            sourceType: "ad_payout",
            sourceId: logDoc.id,
            grossAmountUsd: chargeableCost,
            commissionPaidUsd: referralCommission,
            netAmountUsd: netPublisherEarnings,
            released: false,
            earnedAt: nowIso,
            releaseAt: releaseAtIso
          })
        );

        const pubTxId = generateId("tx");
        tx.set(
          collections.transactions.doc(pubTxId),
          createTransactionRecord({
            id: pubTxId,
            userId: publisherId,
            type: TRANSACTION_TYPES.EARNING,
            status: TRANSACTION_STATUS.COMPLETED,
            amountUsd: netPublisherEarnings,
            feeUsd: referralCommission,
            netAmountUsd: netPublisherEarnings,
            campaignId: log.campaignId,
            notes: `أرباح مشاهدات (${deltaViews} مشاهدة) - تُتاح للسحب بعد ${config.earningsHoldHours} ساعة`,
            createdAt: nowIso,
            updatedAt: nowIso
          })
        );
      }

      if (referrerRef && referrerId && referralCommission > 0) {
        const refData = referrerSnap.data() || {};
        const nextRefPending = roundMoney(
          (refData.pendingEarningsUsd ?? refData.pendingEarnings ?? 0) + referralCommission
        );
        const nextRefTotal = roundMoney(
          (refData.referralEarningsUsd ?? refData.totalReferralEarnings ?? 0) + referralCommission
        );

        tx.update(referrerRef, {
          pendingEarnings: nextRefPending,
          pendingEarningsUsd: nextRefPending,
          totalReferralEarnings: nextRefTotal,
          referralEarningsUsd: nextRefTotal,
          totalEarnedUsd: roundMoney((refData.totalEarnedUsd || 0) + referralCommission),
          updatedAt: nowIso
        });

        const refHoldId = generateId("hold");
        tx.set(
          collections.earningHolds.doc(refHoldId),
          createEarningHoldRecord({
            id: refHoldId,
            userId: referrerId,
            sourceType: "referral_commission",
            sourceId: logDoc.id,
            grossAmountUsd: referralCommission,
            commissionPaidUsd: 0,
            netAmountUsd: referralCommission,
            released: false,
            earnedAt: nowIso,
            releaseAt: releaseAtIso
          })
        );

        const refTxId = generateId("tx");
        tx.set(
          collections.transactions.doc(refTxId),
          createTransactionRecord({
            id: refTxId,
            userId: referrerId,
            type: TRANSACTION_TYPES.REFERRAL_COMMISSION,
            status: TRANSACTION_STATUS.COMPLETED,
            amountUsd: referralCommission,
            feeUsd: 0,
            netAmountUsd: referralCommission,
            fromUserId: publisherId,
            campaignId: log.campaignId,
            notes: `عمولة إحالة 10% من أرباح الناشر ${publisherId}`,
            createdAt: nowIso,
            updatedAt: nowIso
          })
        );
      }

      syncedLogs += 1;
    });
  }

  return { syncedLogs };
}

async function monitorAllChannelsPermissions() {
  if (!bot) return;
  const snap = await collections.channels.get();
  const botInfo = await bot.getMe();

  for (const doc of snap.docs) {
    const ch = doc.data();
    if (!ch.chatId) continue;
    try {
      const member = await bot.getChatMember(ch.chatId, botInfo.id);
      const chatInfo = await bot.getChat(ch.chatId);
      const subsCount = await bot.getChatMemberCount(ch.chatId);

      const hasAdmin = member.status === "administrator" && Boolean(member.can_post_messages);
      const nextStatus = !hasAdmin
        ? "permission_lost"
        : ch.status === "permission_lost"
          ? subsCount > CONFIG.AUTO_APPROVE_SUBSCRIBERS
            ? "approved"
            : "pending_admin"
          : ch.status;

      await doc.ref.update({
        title: chatInfo.title || ch.title,
        subscribers: subsCount,
        botHasAdmin: hasAdmin,
        status: nextStatus,
        updatedAt: Date.now()
      });

      if (!hasAdmin && ch.status !== "permission_lost" && ch.ownerId) {
        await sendSystemNotification(
          ch.ownerId,
          "انقطاع صلاحيات البوت",
          `تم رصد فقدان صلاحية النشر للبوت في القناة "${ch.title}".`,
          "permission_lost"
        );
      }
    } catch {
      await doc.ref.update({
        botHasAdmin: false,
        status: "permission_lost",
        updatedAt: Date.now()
      });
    }
  }
}

// ==================== مسارات Webhook وبوت تيليجرام ====================

app.post(
  "/api/bot/webhook",
  asyncHandler(async (req, res) => {
    const update = req.body;

    if (update.my_chat_member) {
      await handleBotMyChatMemberUpdate(update.my_chat_member);
    }

    if (update.message?.text && bot) {
      const msg = update.message;
      const chatId = msg.chat.id;
      const text = msg.text.trim();

      if (text.startsWith("/start")) {
        const parts = text.split(" ");
        let referrerId = null;
        if (parts[1] && parts[1].startsWith("ref_")) {
          referrerId = parts[1].replace("ref_", "");
        }

        const userId = String(msg.from.id);
        const userRef = collections.users.doc(userId);
        const userSnap = await userRef.get();
        if (!userSnap.exists) {
          await ensureUserDoc(userId, {
            telegramId: userId,
            username: msg.from.username || "",
            firstName: msg.from.first_name || "User",
            lastName: msg.from.last_name || "",
            languageCode: msg.from.language_code || "en",
            referredBy: referrerId
          });
          if (referrerId && referrerId !== userId) {
            await sendSystemNotification(
              referrerId,
              "إحالة جديدة عبر رابطك",
              "انضم مستخدم جديد إلى المنصة عبر رابط الإحالة الخاص بك وستصلك عمولة 10% من أرباحه كناشر عند تحقيق المشاهدات.",
              "referral"
            );
          }
        }

        await bot.sendMessage(chatId, buildPlatformPromoText(), {
          reply_markup: {
            inline_keyboard: [
              [{ text: "Open ←", url: WEBAPP_URL || `https://t.me/${CONFIG.BOT_USERNAME}` }]
            ]
          }
        });
      }
    }

    res.status(200).json({ ok: true });
  })
);

// ==================== مسارات الإعدادات والمصادقة والمستخدم ====================

app.get("/api/health", (_req, res) => {
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

app.get("/api/meta", (_req, res) => {
  res.json({
    botUsername: CONFIG.BOT_USERNAME,
    botLink: CONFIG.BOT_LINK,
    minPrice: CONFIG.MIN_CPM_PRICE,
    maxPrice: CONFIG.MAX_CPM_PRICE,
    autoApproveSubscribers: CONFIG.AUTO_APPROVE_SUBSCRIBERS,
    openTargetingMinBudget: CONFIG.OPEN_TARGETING_MIN_BUDGET,
    languages: SUPPORTED_LANGUAGES,
    categories: CHANNEL_CATEGORIES
  });
});

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
      botUsername: process.env.BOT_USERNAME || CONFIG.BOT_USERNAME
    });
  })
);

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
      referredBy: req.body?.referredBy || req.body?.startParam?.replace(/^ref_/, "")
    });
    await releaseMatureEarningsForUser(req.uid);
    const freshSnap = await collections.users.doc(req.uid).get();
    return res.json({ user: freshSnap.data() || user, isOwner: req.isOwner });
  })
);

app.post(
  "/api/user/favorites",
  telegramAuthMiddleware,
  asyncHandler(async (req, res) => {
    const { channelId } = req.body || {};
    if (!channelId) return res.status(400).json({ error: "channelId required" });

    const userRef = collections.users.doc(req.uid);
    const snap = await userRef.get();
    if (!snap.exists) return res.status(404).json({ error: "User not found" });

    const currentFavs = Array.isArray(snap.data().favoriteChannels)
      ? snap.data().favoriteChannels
      : [];
    const exists = currentFavs.includes(String(channelId));
    const nextFavs = exists
      ? currentFavs.filter((id) => id !== String(channelId))
      : [...currentFavs, String(channelId)];

    await userRef.update({ favoriteChannels: nextFavs, updatedAt: new Date().toISOString() });
    res.json({ favoriteChannels: nextFavs });
  })
);

// ==================== مسارات المحفظة والمدفوعات ====================

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
        balanceUsd: roundMoney(user.balanceUsd ?? user.advertiserBalance ?? 0),
        pendingEarningsUsd: roundMoney(user.pendingEarningsUsd ?? user.pendingEarnings ?? 0),
        availableEarningsUsd: roundMoney(
          user.availableEarningsUsd ?? user.publisherBalance ?? 0
        ),
        totalSpentUsd: roundMoney(user.totalSpentUsd || 0),
        totalEarnedUsd: roundMoney(user.totalEarnedUsd || 0),
        referralEarningsUsd: roundMoney(
          user.referralEarningsUsd ?? user.totalReferralEarnings ?? 0
        ),
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

        const availableEarnings = roundMoney(
          userData.availableEarningsUsd ?? userData.publisherBalance ?? 0
        );
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
          publisherBalance: nextAvailable,
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

        const nextPending = roundMoney(
          (userData.pendingEarningsUsd ?? userData.pendingEarnings ?? 0) + userNetEarning
        );
        tx.update(userRef, {
          pendingEarningsUsd: nextPending,
          pendingEarnings: nextPending,
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

          const nextRefPending = roundMoney(
            (refData.pendingEarningsUsd ?? refData.pendingEarnings ?? 0) + commissionAmount
          );
          const nextRefTotal = roundMoney(
            (refData.referralEarningsUsd ?? refData.totalReferralEarnings ?? 0) +
              commissionAmount
          );
          tx.update(collections.users.doc(referrerId), {
            pendingEarningsUsd: nextRefPending,
            pendingEarnings: nextRefPending,
            totalEarnedUsd: roundMoney((refData.totalEarnedUsd || 0) + commissionAmount),
            referralEarningsUsd: nextRefTotal,
            totalReferralEarnings: nextRefTotal,
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

// ==================== مسارات القنوات (قنواتي + السوق المعتمد) ====================

app.get(
  "/api/channels",
  telegramAuthMiddleware,
  asyncHandler(async (req, res) => {
    const snap = await collections.channels.where("ownerId", "==", req.uid).get();
    const channels = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        title: data.title,
        photoUrl: data.photoUrl || "",
        subscribers: data.subscribers || 0,
        cpmPrice: data.cpmPrice || CONFIG.MIN_CPM_PRICE,
        language: data.language || "ar",
        category: data.category || "other",
        status: data.status,
        botHasAdmin: Boolean(data.botHasAdmin),
        promoPostSent: Boolean(data.promoPostSent),
        totalViewsDelivered: data.totalViewsDelivered || 0,
        totalEarned: data.totalEarned || 0,
        updatedAt: data.updatedAt
      };
    });
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
      cpmPrice: CONFIG.MIN_CPM_PRICE,
      language: "ar",
      category: "other",
      botHasAdmin: false,
      status: "pending_admin",
      createdAt: Date.now(),
      updatedAt: Date.now()
    });

    res.json({ success: true, id: docRef.id });
  })
);

app.post(
  "/api/channels/configure",
  telegramAuthMiddleware,
  asyncHandler(async (req, res) => {
    const { channelId, cpmPrice, language, category } = req.body || {};
    const priceNum = Number(cpmPrice);

    if (!channelId) {
      return res.status(400).json({ error: "channelId is required" });
    }
    if (
      Number.isNaN(priceNum) ||
      priceNum < CONFIG.MIN_CPM_PRICE ||
      priceNum > CONFIG.MAX_CPM_PRICE
    ) {
      return res.status(400).json({ error: "السعر يجب أن يكون بين 1$ و 3$" });
    }

    const channelRef = collections.channels.doc(String(channelId));
    const snap = await channelRef.get();
    if (!snap.exists) {
      return res
        .status(404)
        .json({ error: "القناة غير موجودة؛ تأكد أولاً من إضافة البوت كمسؤول في قناة عامة" });
    }

    const data = snap.data();
    if (String(data.ownerId) !== req.uid) {
      return res.status(403).json({ error: "غير مصرح لك بتعديل هذه القناة" });
    }

    let subscribers = data.subscribers || 0;
    let botHasAdmin = Boolean(data.botHasAdmin);
    let title = data.title;
    let photoUrl = data.photoUrl || "";

    if (bot && data.chatId) {
      try {
        const botInfo = await bot.getMe();
        const member = await bot.getChatMember(data.chatId, botInfo.id);
        const chatInfo = await bot.getChat(data.chatId);
        subscribers = await bot.getChatMemberCount(data.chatId);
        title = chatInfo.title || title;
        botHasAdmin = member.status === "administrator" && Boolean(member.can_post_messages);
        if (chatInfo.photo?.big_file_id) {
          photoUrl = await bot.getFileLink(chatInfo.photo.big_file_id);
        }
      } catch {}
    }

    if (!botHasAdmin) {
      await channelRef.update({
        cpmPrice: priceNum,
        language,
        category,
        subscribers,
        botHasAdmin: false,
        status: "permission_lost",
        updatedAt: Date.now()
      });
      return res.status(400).json({
        error: "يجب إضافة البوت @adTelega_bot كمسؤول بصلاحية النشر في القناة العامة أولاً"
      });
    }

    const nextStatus =
      subscribers > CONFIG.AUTO_APPROVE_SUBSCRIBERS ? "approved" : "pending_admin";

    await channelRef.update({
      title,
      photoUrl,
      subscribers,
      cpmPrice: priceNum,
      language,
      category,
      botHasAdmin: true,
      status: nextStatus,
      updatedAt: Date.now()
    });

    const updatedData = {
      ...data,
      title,
      photoUrl,
      subscribers,
      cpmPrice: priceNum,
      language,
      category,
      status: nextStatus
    };

    if (nextStatus === "approved") {
      await publishPlatformFreePromo(channelRef, updatedData);
      await sendSystemNotification(
        req.uid,
        "تم قبول القناة تلقائياً",
        `تمت الموافقة التلقائية على قناة "${title}" لأن عدد المشتركين (${subscribers}) أكبر من 1000، وتم نشر إعلان المنصة المجاني.`,
        "channel_approved"
      );
    } else {
      await sendSystemNotification(
        req.uid,
        "القناة بانتظار مراجعة الإدارة",
        `تم استلام طلب قناة "${title}" (${subscribers} مشترك) وهي بانتظار موافقة أو رفض الإدارة.`,
        "channel_pending"
      );
    }

    res.json({ success: true, channel: updatedData });
  })
);

app.get(
  "/api/channels/verified",
  telegramAuthMiddleware,
  asyncHandler(async (req, res) => {
    const search = String(req.query.search || "").trim().toLowerCase();
    const language = String(req.query.language || "");
    const category = String(req.query.category || "");
    const minPrice = Number(req.query.minPrice || CONFIG.MIN_CPM_PRICE);
    const maxPrice = Number(req.query.maxPrice || CONFIG.MAX_CPM_PRICE);

    const snap = await collections.channels
      .where("status", "==", "approved")
      .where("botHasAdmin", "==", true)
      .get();

    const list = snap.docs
      .map((d) => {
        const c = d.data();
        return {
          id: d.id,
          title: c.title,
          photoUrl: c.photoUrl || "",
          subscribers: c.subscribers || 0,
          cpmPrice: c.cpmPrice || CONFIG.MIN_CPM_PRICE,
          language: c.language || "ar",
          category: c.category || "other"
        };
      })
      .filter((c) => {
        if (search && !c.title.toLowerCase().includes(search)) return false;
        if (language && language !== "all" && c.language !== language) return false;
        if (category && category !== "all" && c.category !== category) return false;
        if (c.cpmPrice < minPrice || c.cpmPrice > maxPrice) return false;
        return true;
      });

    res.json({ channels: list });
  })
);

// ==================== رفع الوسائط والحملات الترويجية ====================

app.post(
  "/api/media/upload",
  telegramAuthMiddleware,
  upload.single("media"),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "لم يتم اختيار ملف صورة أو فيديو" });
    }
    if (!bucket) {
      return res.status(503).json({ error: "خدمة تخزين الملفات غير مهيأة حالياً" });
    }

    const isVideo = req.file.mimetype.startsWith("video/");
    const isImage = req.file.mimetype.startsWith("image/");
    if (!isVideo && !isImage) {
      return res.status(400).json({ error: "يُسمح فقط برفع الصور أو مقاطع الفيديو" });
    }

    const fileName = `campaigns/${Date.now()}_${req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const file = bucket.file(fileName);

    await file.save(req.file.buffer, {
      metadata: { contentType: req.file.mimetype }
    });
    await file.makePublic();

    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
    res.json({
      mediaUrl: publicUrl,
      mediaType: isVideo ? "video" : "photo"
    });
  })
);

app.get(
  "/api/campaigns",
  telegramAuthMiddleware,
  asyncHandler(async (req, res) => {
    const snap = await collections.campaigns.where("advertiserId", "==", req.uid).get();
    const campaigns = [];

    for (const doc of snap.docs) {
      const logsSnap = await collections.postLogs.where("campaignId", "==", doc.id).get();
      const postLogs = logsSnap.docs.map((l) => ({
        channelId: l.data().channelId,
        countedViews: l.data().countedViews,
        settledAmount: l.data().settledAmount,
        publishedAt: l.data().publishedAt
      }));

      campaigns.push({
        id: doc.id,
        ...doc.data(),
        postLogs
      });
    }

    res.json({ campaigns });
  })
);

app.post(
  "/api/campaigns",
  telegramAuthMiddleware,
  asyncHandler(async (req, res) => {
    const payload = req.body || {};
    const isDraft = payload.saveAsDraft === true;
    const title = (payload.title || "").toString().trim();
    const adText = (payload.adText || payload.content || "").toString().trim();
    const budgetUsd = roundMoney(payload.budgetUsd ?? payload.budget ?? 0);

    if (!isDraft && (!title || !adText || budgetUsd <= 0)) {
      return res.status(400).json({ error: "يرجى استكمال بيانات الحملة والميزانية" });
    }

    await ensureUserDoc(req.uid);

    const status = isDraft
      ? "draft"
      : payload.scheduleType === "peak_hours"
        ? "scheduled"
        : "active";

    const campaignId = generateId("cmp");
    const txId = generateId("tx");
    const nowIso = new Date().toISOString();

    const baseSchema = createCampaignSchema({
      advertiserId: req.uid,
      title: title.slice(0, 100),
      adText: adText.slice(0, 1000),
      mediaUrl: payload.mediaUrl || "",
      mediaType: payload.mediaType || "none",
      buttonText: payload.buttonText || "Open",
      buttonUrl: payload.buttonUrl || "",
      budget: budgetUsd,
      targeting: payload.targeting,
      scheduleType: payload.scheduleType,
      scheduledAt: payload.scheduledAt,
      status
    });

    const campaignRecord = {
      ...baseSchema,
      id: campaignId,
      content: adText.slice(0, 1000),
      budget: budgetUsd,
      budgetUsd,
      spentUsd: 0,
      remainingBudgetUsd: budgetUsd,
      settled: false,
      settledRefundUsd: 0,
      endedAt: null
    };

    try {
      const created = await db.runTransaction(async (tx) => {
        const campaignRef = collections.campaigns.doc(campaignId);
        let spendTx = null;

        if (!isDraft && budgetUsd > 0) {
          const userRef = collections.users.doc(req.uid);
          const userSnap = await tx.get(userRef);
          if (!userSnap.exists) {
            throw new Error("حساب المعلن غير موجود");
          }
          const userData = userSnap.data() || {};
          const currentBalance = roundMoney(
            userData.balanceUsd ?? userData.advertiserBalance ?? 0
          );

          if (currentBalance < budgetUsd) {
            throw new Error("رصيد المحفظة غير كافٍ لتغطية ميزانية الحملة");
          }

          const nextBalance = roundMoney(currentBalance - budgetUsd);
          spendTx = createTransactionRecord({
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
            balanceUsd: nextBalance,
            advertiserBalance: nextBalance,
            totalSpentUsd: roundMoney((userData.totalSpentUsd || 0) + budgetUsd),
            updatedAt: nowIso
          });
          tx.set(collections.transactions.doc(txId), spendTx);
        }

        tx.set(campaignRef, campaignRecord);
        return { id: campaignId, campaign: campaignRecord, transaction: spendTx };
      });

      if (status === "active") {
        const campaignRef = collections.campaigns.doc(campaignId);
        const approvedSnap = await collections.channels
          .where("status", "==", "approved")
          .get();
        for (const chDoc of approvedSnap.docs) {
          const ch = chDoc.data();
          const t = campaignRecord.targeting;

          const matchesSpecific =
            Array.isArray(t.specificChannelIds) && t.specificChannelIds.includes(chDoc.id);
          const matchesOpen = t.openTargeting && budgetUsd > CONFIG.OPEN_TARGETING_MIN_BUDGET;
          const matchesCriteria =
            ch.cpmPrice >= t.minPrice &&
            ch.cpmPrice <= t.maxPrice &&
            (!t.languages.length || t.languages.includes(ch.language)) &&
            (!t.categories.length || t.categories.includes(ch.category));

          if (matchesSpecific || matchesOpen || matchesCriteria) {
            await publishCampaignToChannel(campaignRef, chDoc);
          }
        }
      }

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

app.post(
  "/api/campaigns/:id/resume",
  telegramAuthMiddleware,
  asyncHandler(async (req, res) => {
    const campaignId = (req.params.id || "").toString().trim();
    const addBudget = roundMoney(req.body?.addBudget || 0);

    const campaignRef = collections.campaigns.doc(campaignId);
    const campaignSnap = await campaignRef.get();
    if (!campaignSnap.exists) return res.status(404).json({ error: "الحملة غير موجودة" });

    const campaign = campaignSnap.data();
    if (String(campaign.advertiserId) !== req.uid) {
      return res.status(403).json({ error: "غير مصرح لك باستئناف هذه الحملة" });
    }

    const nowIso = new Date().toISOString();
    try {
      if (addBudget > 0) {
        await db.runTransaction(async (tx) => {
          const userRef = collections.users.doc(req.uid);
          const userSnap = await tx.get(userRef);
          const userData = userSnap.data() || {};
          const currentBal = roundMoney(
            userData.balanceUsd ?? userData.advertiserBalance ?? 0
          );
          if (currentBal < addBudget) {
            throw new Error("رصيد المحفظة غير كافٍ لشحن ميزانية الحملة");
          }
          const nextBal = roundMoney(currentBal - addBudget);
          tx.update(userRef, {
            balanceUsd: nextBal,
            advertiserBalance: nextBal,
            totalSpentUsd: roundMoney((userData.totalSpentUsd || 0) + addBudget),
            updatedAt: nowIso
          });
          tx.update(campaignRef, {
            totalBudget: FieldValue.increment(addBudget),
            budgetUsd: FieldValue.increment(addBudget),
            remainingBudget: FieldValue.increment(addBudget),
            remainingBudgetUsd: FieldValue.increment(addBudget),
            status: "active",
            updatedAt: Date.now()
          });
        });
      } else {
        await campaignRef.update({ status: "active", updatedAt: Date.now() });
      }

      const refreshedRef = collections.campaigns.doc(campaignId);
      const approvedSnap = await collections.channels
        .where("status", "==", "approved")
        .get();
      for (const chDoc of approvedSnap.docs) {
        await publishCampaignToChannel(refreshedRef, chDoc);
      }

      const updatedSnap = await refreshedRef.get();
      res.json({ success: true, id: campaignId, campaign: updatedSnap.data() });
    } catch (err) {
      res.status(400).json({ error: err.message || "تعذر استئناف الحملة" });
    }
  })
);

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

        const budgetUsd = roundMoney(
          campaignData.budgetUsd ?? campaignData.totalBudget ?? campaignData.budget ?? 0
        );
        const spentUsd =
          providedSpentUsd !== null
            ? Math.min(budgetUsd, Math.max(0, providedSpentUsd))
            : roundMoney(campaignData.spentUsd ?? campaignData.spentBudget ?? 0);

        const refundAmount = roundMoney(Math.max(0, budgetUsd - spentUsd));
        const advertiserRef = collections.users.doc(campaignData.advertiserId);
        const advertiserSnap = await tx.get(advertiserRef);

        if (!advertiserSnap.exists) {
          throw new Error("حساب المعلن غير موجود");
        }

        const advertiserData = advertiserSnap.data() || {};
        const nextBalance = roundMoney(
          (advertiserData.balanceUsd ?? advertiserData.advertiserBalance ?? 0) + refundAmount
        );
        const nextTotalSpent = roundMoney(
          Math.max(0, (advertiserData.totalSpentUsd || 0) - refundAmount)
        );

        tx.update(campaignRef, {
          spentUsd,
          spentBudget: spentUsd,
          remainingBudgetUsd: 0,
          remainingBudget: 0,
          status: "ended",
          settled: true,
          settledRefundUsd: refundAmount,
          endedAt: nowIso,
          updatedAt: nowIso
        });

        tx.update(advertiserRef, {
          balanceUsd: nextBalance,
          advertiserBalance: nextBalance,
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

// ==================== الإحالات والسجلات والإشعارات والدعم ====================

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
      referralEarningsUsd: roundMoney(
        userData.referralEarningsUsd ?? userData.totalReferralEarnings ?? 0
      ),
      referredCount: referredUsers.length,
      referredUsers,
      commissionTransactions
    });
  })
);

app.get(
  "/api/logs/publications",
  telegramAuthMiddleware,
  asyncHandler(async (req, res) => {
    const snap = await collections.postLogs.orderBy("publishedAt", "desc").limit(50).get();
    const logs = snap.docs
      .map((d) => d.data())
      .filter((l) => l.advertiserId === req.uid || l.publisherId === req.uid);
    res.json({ logs });
  })
);

app.get(
  "/api/notifications",
  telegramAuthMiddleware,
  asyncHandler(async (req, res) => {
    const snap = await collections.notifications.where("userId", "==", req.uid).get();
    const notifications = snap.docs
      .map((d) => d.data())
      .sort((a, b) => toTimeMs(b.createdAt) - toTimeMs(a.createdAt));
    res.json({ notifications });
  })
);

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

// ==================== لوحة الإدارة الحصرية للمالك فقط ====================

app.get(
  "/api/admin/stats",
  telegramAuthMiddleware,
  ownerOnlyMiddleware,
  asyncHandler(async (_req, res) => {
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

app.get(
  "/api/admin/channels/pending",
  telegramAuthMiddleware,
  ownerOnlyMiddleware,
  asyncHandler(async (_req, res) => {
    const snap = await collections.channels.where("status", "==", "pending_admin").get();
    const channels = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    res.json({ channels });
  })
);

app.post(
  "/api/admin/channels/:id/decision",
  telegramAuthMiddleware,
  ownerOnlyMiddleware,
  asyncHandler(async (req, res) => {
    const decision = req.body?.decision === "approve" ? "approved" : "rejected";
    const channelRef = collections.channels.doc(req.params.id);
    const snap = await channelRef.get();
    if (!snap.exists) return res.status(404).json({ error: "القناة غير موجودة" });

    await channelRef.update({ status: decision, updatedAt: Date.now() });
    const data = snap.data();

    if (decision === "approved") {
      await publishPlatformFreePromo(channelRef, { ...data, status: "approved" });
      await sendSystemNotification(
        data.ownerId,
        "تمت الموافقة على قناتك",
        `وافقت الإدارة على قناة "${data.title}" وتم نشر منشور المنصة المجاني.`,
        "channel_approved"
      );
    } else {
      await sendSystemNotification(
        data.ownerId,
        "تم رفض القناة",
        `نعتذر، تم رفض طلب قناة "${data.title}" من قِبل الإدارة.`,
        "channel_rejected"
      );
    }

    res.json({ ok: true, status: decision });
  })
);

app.get(
  "/api/admin/health",
  telegramAuthMiddleware,
  ownerOnlyMiddleware,
  asyncHandler(async (_req, res) => {
    let botOnline = false;
    let botUsername = CONFIG.BOT_USERNAME;
    if (bot) {
      try {
        const me = await bot.getMe();
        botOnline = Boolean(me?.id);
        botUsername = me?.username || botUsername;
      } catch {
        botOnline = false;
      }
    }

    res.json({
      serverOnline: true,
      botOnline,
      botUsername,
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: Date.now()
    });
  })
);

app.post(
  "/api/admin/backup",
  telegramAuthMiddleware,
  ownerOnlyMiddleware,
  asyncHandler(async (req, res) => {
    const [channelsSnap, campaignsSnap, usersSnap] = await Promise.all([
      collections.channels.get(),
      collections.campaigns.get(),
      collections.users.get()
    ]);

    const backupRef = collections.backups.doc();
    const record = {
      id: backupRef.id,
      createdBy: req.uid,
      counts: {
        channels: channelsSnap.size,
        campaigns: campaignsSnap.size,
        users: usersSnap.size
      },
      createdAt: Date.now()
    };

    await backupRef.set(record);
    res.json({ backup: record });
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
  asyncHandler(async (_req, res) => {
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
          const nextBalance = roundMoney(
            (userData.balanceUsd ?? userData.advertiserBalance ?? 0) +
              Number(depData.amountUsd || 0)
          );
          tx.update(userRef, {
            balanceUsd: nextBalance,
            advertiserBalance: nextBalance,
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
          const nextAvailable = roundMoney(
            (userData.availableEarningsUsd ?? userData.publisherBalance ?? 0) + refundTotal
          );
          tx.update(userRef, {
            availableEarningsUsd: nextAvailable,
            publisherBalance: nextAvailable,
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

// ==================== المزامنة الدورية (Cron) ====================

app.get(
  "/api/cron/sync",
  asyncHandler(async (req, res) => {
    if (
      process.env.CRON_SECRET &&
      req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`
    ) {
      return res.status(401).json({ error: "Unauthorized cron" });
    }

    await monitorAllChannelsPermissions();
    const viewSync = await syncViewsAndSettle();

    res.json({
      ok: true,
      syncedLogs: viewSync.syncedLogs,
      timestamp: Date.now()
    });
  })
);

// ==================== تقديم الواجهة ومعالجة الأخطاء ====================

app.use((req, res, next) => {
  if (req.method !== "GET" || req.path.startsWith("/api/")) {
    return next();
  }
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.use((err, _req, res, _next) => {
  console.error("[Server Error]:", err);
  res.status(500).json({ error: "Internal Server Error" });
});

if (!process.env.VERCEL) {
  app.listen(config.port, () => {
    console.log(`Telega.ads server running securely on port ${config.port}`);
  });
}

export default app;
