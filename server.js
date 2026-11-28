import express from "express";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import {
  db,
  Collections,
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
} from "./models.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN || "";
const BOT_USERNAME = (process.env.BOT_USERNAME || "TelegaAdsBot").replace(/^@/, "");
const SERVER_STARTED_AT = new Date();

app.use(
  helmet({
    contentSecurityPolicy: false
  })
);
app.use(cors());
app.use(express.json({ limit: "25mb" }));
app.use(express.static(path.join(__dirname, "public")));

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

function generateId(prefix) {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
}

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

async function writeSecurityLog(txOrDb, payload) {
  const logId = generateId("sec");
  const record = buildSecurityLogRecord({
    id: logId,
    ...payload
  });
  if (txOrDb && typeof txOrDb.set === "function") {
    txOrDb.set(db.collection(Collections.SECURITY_LOGS).doc(logId), record);
  } else {
    await db.collection(Collections.SECURITY_LOGS).doc(logId).set(record);
  }
  return record;
}

async function writeAuditLog(txOrDb, payload) {
  const auditId = generateId("aud");
  const record = buildAuditLogRecord({
    id: auditId,
    ...payload
  });
  if (txOrDb && typeof txOrDb.set === "function") {
    txOrDb.set(db.collection(Collections.AUDIT_LOGS).doc(auditId), record);
  } else {
    await db.collection(Collections.AUDIT_LOGS).doc(auditId).set(record);
  }
  return record;
}

async function createSmartAlert(txOrDb, payload) {
  const alertId = generateId("alr");
  const record = buildSmartAlertRecord({
    id: alertId,
    ...payload
  });
  if (txOrDb && typeof txOrDb.set === "function") {
    txOrDb.set(db.collection(Collections.SMART_ALERTS).doc(alertId), record);
  } else {
    await db.collection(Collections.SMART_ALERTS).doc(alertId).set(record);
  }
  return record;
}

async function getSystemConfig() {
  const docRef = db.collection(Collections.SYSTEM_CONFIG).doc("global");
  const snap = await docRef.get();
  if (!snap.exists) {
    const initial = {
      maintenanceMode: false,
      maintenanceMessage: "النظام في وضع الصيانة حالياً لإجراء تحديثات أمان.",
      blacklistWords: ["spam", "scam", "fake", "احتيال", "وهمي", "سبام"],
      bannedUsers: {},
      bannedChannels: {},
      bannedAdvertisers: {},
      updatedAt: nowIso(),
      updatedBy: "system"
    };
    await docRef.set(initial);
    return initial;
  }
  return {
    maintenanceMode: false,
    maintenanceMessage: "النظام في وضع الصيانة حالياً لإجراء تحديثات أمان.",
    blacklistWords: ["spam", "scam", "fake", "احتيال", "وهمي", "سبام"],
    bannedUsers: {},
    bannedChannels: {},
    bannedAdvertisers: {},
    ...snap.data()
  };
}

function findMatchedBlacklistWord(text, blacklistWords) {
  const lower = (text || "").toLowerCase();
  const list = Array.isArray(blacklistWords) ? blacklistWords : [];
  for (const word of list) {
    const clean = String(word || "").trim().toLowerCase();
    if (clean && lower.includes(clean)) {
      return clean;
    }
  }
  return null;
}

async function ensureUserDoc(tx, userId, requestedRole, referredBy) {
  const cleanId = String(userId);
  const userRef = db.collection(Collections.USERS).doc(cleanId);
  const snap = await tx.get(userRef);
  if (!snap.exists) {
    const fresh = createDefaultUser(cleanId, requestedRole, referredBy);
    tx.set(userRef, fresh);
    return fresh;
  }
  const existing = snap.data();
  if (!existing.referredBy && referredBy && String(referredBy).trim() !== cleanId) {
    const cleanRef = String(referredBy).trim();
    tx.update(userRef, {
      referredBy: cleanRef,
      updatedAt: nowIso()
    });
    return { ...existing, referredBy: cleanRef };
  }
  return existing;
}

async function releaseMaturedEarningsForUser(userId) {
  const cleanId = String(userId);
  const cutoffIso = new Date(
    Date.now() - RULES.EARNINGS_RELEASE_HOURS * 60 * 60 * 1000
  ).toISOString();

  await db.runTransaction(async (tx) => {
    const userRef = db.collection(Collections.USERS).doc(cleanId);
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists) return;

    const locksQuery = db
      .collection(Collections.EARNINGS_LOCKS)
      .where("userId", "==", cleanId)
      .where("status", "==", "pending");

    const locksSnap = await tx.get(locksQuery);
    let releasableTotal = 0;
    const maturedDocs = [];

    locksSnap.forEach((doc) => {
      const data = doc.data();
      if (data.releaseAt && data.releaseAt <= nowIso()) {
        releasableTotal = roundMoney(releasableTotal + Number(data.amount || 0));
        maturedDocs.push({ ref: doc.ref, data });
      } else if (!data.releaseAt && data.createdAt && data.createdAt <= cutoffIso) {
        releasableTotal = roundMoney(releasableTotal + Number(data.amount || 0));
        maturedDocs.push({ ref: doc.ref, data });
      }
    });

    if (releasableTotal <= 0 || maturedDocs.length === 0) return;

    const userData = userSnap.data();
    const nextPending = roundMoney(
      Math.max(0, Number(userData.pendingEarnings || 0) - releasableTotal)
    );
    const nextAvailable = roundMoney(
      Number(userData.availableEarnings || 0) + releasableTotal
    );

    tx.update(userRef, {
      pendingEarnings: nextPending,
      availableEarnings: nextAvailable,
      updatedAt: nowIso()
    });

    for (const item of maturedDocs) {
      tx.update(item.ref, {
        status: "released",
        releasedAt: nowIso()
      });
    }

    const txId = generateId("tx");
    tx.set(
      db.collection(Collections.TRANSACTIONS).doc(txId),
      buildTransactionRecord({
        id: txId,
        userId: cleanId,
        type: "earnings",
        amount: releasableTotal,
        status: "released",
        note: `تحرير أرباح تلقائي بعد مرور ${RULES.EARNINGS_RELEASE_HOURS} ساعة`
      })
    );

    await createSmartAlert(tx, {
      userId: cleanId,
      category: "earnings_ready",
      title: "جاهزية الأرباح للسحب (24 ساعة)",
      message: `تم تحرير $${releasableTotal.toFixed(2)} من الأرباح المعلقة وأصبحت متاحة للسحب.`
    });

    await writeSecurityLog(tx, {
      actorId: "system",
      actorRole: "system",
      action: "EARNINGS_AUTO_RELEASED_24H",
      targetId: cleanId,
      details: { releasedAmount: releasableTotal, locksCount: maturedDocs.length }
    });
  });
}

async function callTelegramApi(method, payload) {
  if (!BOT_TOKEN || BOT_TOKEN === "your_telegram_bot_token_here") {
    throw new Error("BOT_TOKEN is not configured");
  }
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/${method}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!data.ok) {
    throw new Error(data.description || `Telegram API error on ${method}`);
  }
  return data.result;
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

const checkMaintenanceAndBanGate = asyncHandler(async (req, res, next) => {
  const config = await getSystemConfig();
  if (config.maintenanceMode && !req.isOwner) {
    await writeSecurityLog(db, {
      actorId: req.tgUser?.id ? String(req.tgUser.id) : "anonymous",
      actorRole: "user",
      action: "MAINTENANCE_BLOCKED_REQUEST",
      targetId: req.originalUrl,
      details: { method: req.method },
      ip: req.ip
    });
    return res.status(503).json({
      ok: false,
      maintenanceMode: true,
      error: config.maintenanceMessage || "النظام في وضع الصيانة حالياً."
    });
  }

  const userId = req.tgUser?.id ? String(req.tgUser.id) : "";
  if (userId && !req.isOwner) {
    const bannedUser = config.bannedUsers && config.bannedUsers[userId];
    const bannedAdv = config.bannedAdvertisers && config.bannedAdvertisers[userId];
    if (bannedUser || bannedAdv) {
      const reason =
        (bannedUser && bannedUser.reason) ||
        (bannedAdv && bannedAdv.reason) ||
        "حساب محظور إدارياً";
      await writeSecurityLog(db, {
        actorId: userId,
        actorRole: "banned_user",
        action: "BANNED_ENTITY_BLOCKED",
        targetId: userId,
        details: { reason, path: req.originalUrl },
        ip: req.ip
      });
      return res.status(403).json({
        ok: false,
        banned: true,
        error: `تم حظر هذا الحساب: ${reason}`
      });
    }
  }

  next();
});

// ==================== حسابي (ACCOUNT & AUTH) ====================

app.post(
  "/api/auth/sync",
  telegramAuthMiddleware,
  asyncHandler(async (req, res) => {
    const referredBy = (req.body?.referredBy || req.query?.ref || "").toString().trim() || null;
    await upsertTelegramUser(req.tgUser, {
      role: req.isOwner ? "admin" : "user",
      referredBy
    });
    await releaseMaturedEarningsForUser(String(req.tgUser.id));

    res.json({
      success: true,
      isOwner: req.isOwner,
      officialChannel: process.env.OFFICIAL_CHANNEL_URL || "https://t.me/TelegaAdsOfficial",
      botUsername: BOT_USERNAME
    });
  })
);

app.post(
  "/api/users/trc20-wallet",
  telegramAuthMiddleware,
  checkMaintenanceAndBanGate,
  asyncHandler(async (req, res) => {
    const userId = String(req.tgUser.id);
    const trc20Address = (req.body?.trc20Address || "").toString().trim();

    if (!trc20Address || trc20Address.length < 20) {
      return res.status(400).json({ ok: false, error: "يرجى إدخال عنوان محفظة USDT - TRC20 صالح." });
    }

    await db.runTransaction(async (tx) => {
      const userRef = db.collection(Collections.USERS).doc(userId);
      await ensureUserDoc(tx, userId, req.isOwner ? "admin" : "user", null);
      tx.update(userRef, {
        trc20Address,
        updatedAt: nowIso()
      });
      await writeSecurityLog(tx, {
        actorId: userId,
        actorRole: req.isOwner ? "admin" : "user",
        action: "TRC20_WALLET_UPDATED",
        targetId: userId,
        details: { trc20Address },
        ip: req.ip
      });
    });

    res.json({ ok: true, trc20Address });
  })
);

// ==================== قنواتي (MY CHANNELS) ====================

app.get(
  "/api/channels",
  telegramAuthMiddleware,
  checkMaintenanceAndBanGate,
  asyncHandler(async (req, res) => {
    const snap = await db
      .collection(Collections.CHANNELS)
      .where("ownerId", "==", String(req.tgUser.id))
      .get();
    const channels = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    channels.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    res.json({ channels });
  })
);

app.post(
  "/api/channels",
  telegramAuthMiddleware,
  checkMaintenanceAndBanGate,
  asyncHandler(async (req, res) => {
    const ownerId = String(req.tgUser.id);
    const rawUsername = (req.body?.username || "").toString().trim();
    const name = (req.body?.name || req.body?.title || rawUsername).toString().trim();
    const subscribers =
      req.body?.subscribers !== undefined ? Number(req.body.subscribers) : 0;
    const price =
      req.body?.price !== undefined ? roundMoney(req.body.price) : RULES.MIN_PRICE_PER_POST;
    const referredBy = (req.body?.referredBy || "").toString().trim();

    if (!rawUsername) {
      return res.status(400).json({ error: "Channel username required" });
    }
    if (rawUsername.includes("+") || rawUsername.toLowerCase().includes("joinchat")) {
      return res.status(400).json({ error: "Private channels are rejected" });
    }

    const config = await getSystemConfig();
    const matchedWord = findMatchedBlacklistWord(`${name} ${rawUsername}`, config.blacklistWords);
    if (matchedWord) {
      await writeAuditLog(db, {
        entityType: "channel",
        entityId: ownerId,
        severity: "high",
        reason: `محاولة تسجيل قناة تحتوي على كلمة من القائمة السوداء: ${matchedWord}`,
        meta: { name, rawUsername, matchedWord }
      });
      return res.status(400).json({
        error: `تم رفض القناة لاحتوائها على كلمة محظورة في القائمة السوداء (${matchedWord}).`
      });
    }

    const cleanUsername = rawUsername.startsWith("@") ? rawUsername : `@${rawUsername}`;
    const channelId = generateId("chn");

    const channelRecord = await db.runTransaction(async (tx) => {
      await ensureUserDoc(tx, ownerId, req.isOwner ? "admin" : "user", referredBy);
      if (referredBy && referredBy !== ownerId) {
        await ensureUserDoc(tx, referredBy, "user", null);
      }

      const record = {
        id: channelId,
        ownerId,
        username: cleanUsername,
        title: name || cleanUsername,
        name: name || cleanUsername,
        subscribers: Number.isFinite(subscribers) ? Math.floor(subscribers) : 0,
        price,
        viewsCount: 0,
        filteredBotViews: 0,
        earnedTotal: 0,
        status: "Pending Verification",
        lastStatsAt: null,
        editHistory: [
          {
            action: "registered",
            details: { name: name || cleanUsername, username: cleanUsername, price },
            at: nowIso()
          }
        ],
        createdAt: nowIso(),
        updatedAt: nowIso()
      };

      tx.set(db.collection(Collections.CHANNELS).doc(channelId), record);
      await writeSecurityLog(tx, {
        actorId: ownerId,
        actorRole: req.isOwner ? "admin" : "user",
        action: "CHANNEL_REGISTERED",
        targetId: channelId,
        details: { username: cleanUsername, price },
        ip: req.ip
      });

      return record;
    });

    res.json({ success: true, id: channelId, channel: channelRecord });
  })
);

app.post(
  "/api/channels/:channelId/record-stats",
  telegramAuthMiddleware,
  checkMaintenanceAndBanGate,
  asyncHandler(async (req, res) => {
    const channelId = (req.params.channelId || "").toString().trim();
    const rawViews = Math.floor(Number(req.body?.views || 0));
    const rawEarnings = roundMoney(req.body?.earnings || 0);

    if (!channelId || rawViews < 0 || rawEarnings < 0 || (rawViews === 0 && rawEarnings === 0)) {
      return res.status(400).json({ ok: false, error: "مشاهدات أو أرباح صالحة مطلوبة." });
    }

    const config = await getSystemConfig();

    const statResult = await db.runTransaction(async (tx) => {
      const chnRef = db.collection(Collections.CHANNELS).doc(channelId);
      const chnSnap = await tx.get(chnRef);
      if (!chnSnap.exists) return { notFound: true };

      const chnData = chnSnap.data();
      if (chnData.status === "banned" || (config.bannedChannels && config.bannedChannels[channelId])) {
        await writeAuditLog(tx, {
          entityType: "channel",
          entityId: channelId,
          severity: "high",
          reason: "محاولة تسجيل مشاهدات/أرباح لقناة محظورة",
          meta: { rawViews, rawEarnings }
        });
        return { channelBanned: true };
      }

      let validViews = rawViews;
      let botFilteredViews = 0;

      if (rawViews > RULES.ANTI_BOT_MAX_VIEWS_PER_BATCH) {
        validViews = RULES.ANTI_BOT_MAX_VIEWS_PER_BATCH;
        botFilteredViews = rawViews - RULES.ANTI_BOT_MAX_VIEWS_PER_BATCH;
      }

      if (chnData.lastStatsAt) {
        const elapsedSec = (Date.now() - Date.parse(chnData.lastStatsAt)) / 1000;
        if (elapsedSec >= 0 && elapsedSec < RULES.ANTI_BOT_MIN_INTERVAL_SEC && rawViews > 0) {
          botFilteredViews += validViews;
          validViews = 0;
        }
      }

      const ratioFactor = rawViews > 0 ? validViews / rawViews : 1;
      const validEarnings = roundMoney(rawEarnings * ratioFactor);

      if (botFilteredViews > 0) {
        await writeAuditLog(tx, {
          entityType: "views",
          entityId: channelId,
          severity: "medium",
          reason: "محرك Anti-Bot قام بفلترة مشاهدات مشبوهة/متكررة",
          meta: { rawViews, validViews, botFilteredViews, rawEarnings, validEarnings }
        });
        await createSmartAlert(tx, {
          userId: chnData.ownerId,
          category: "anti_bot",
          title: "فلترة مشاهدات بواسطة محرك Anti-Bot",
          message: `تم استبعاد ${botFilteredViews} مشاهدة غير مطابقة لمعايير التحقق على قناة (${chnData.name || chnData.username}).`
        });
      }

      const ownerRef = db.collection(Collections.USERS).doc(chnData.ownerId);
      const ownerData = await ensureUserDoc(tx, chnData.ownerId, "user", null);

      let referrerRef = null;
      let referrerData = null;
      if (ownerData.referredBy && ownerData.referredBy !== chnData.ownerId) {
        referrerRef = db.collection(Collections.USERS).doc(ownerData.referredBy);
        referrerData = await ensureUserDoc(tx, ownerData.referredBy, "user", null);
      }

      const nextViews = Number(chnData.viewsCount || 0) + validViews;
      const nextFilteredTotal = Number(chnData.filteredBotViews || 0) + botFilteredViews;
      const nextEarnedTotal = roundMoney(Number(chnData.earnedTotal || 0) + validEarnings);

      tx.update(chnRef, {
        viewsCount: nextViews,
        filteredBotViews: nextFilteredTotal,
        earnedTotal: nextEarnedTotal,
        lastStatsAt: nowIso(),
        updatedAt: nowIso()
      });

      let releaseAtIso = null;
      let referralCommission = 0;

      if (validEarnings > 0) {
        releaseAtIso = new Date(
          Date.now() + RULES.EARNINGS_RELEASE_HOURS * 60 * 60 * 1000
        ).toISOString();
        const nextPending = roundMoney(Number(ownerData.pendingEarnings || 0) + validEarnings);

        tx.update(ownerRef, {
          pendingEarnings: nextPending,
          updatedAt: nowIso()
        });

        const lockId = generateId("lock");
        tx.set(db.collection(Collections.EARNINGS_LOCKS).doc(lockId), {
          id: lockId,
          userId: chnData.ownerId,
          channelId,
          amount: validEarnings,
          status: "pending",
          createdAt: nowIso(),
          releaseAt: releaseAtIso
        });

        const txRecordId = generateId("tx");
        tx.set(
          db.collection(Collections.TRANSACTIONS).doc(txRecordId),
          buildTransactionRecord({
            id: txRecordId,
            userId: chnData.ownerId,
            type: "earnings",
            amount: validEarnings,
            status: "pending",
            note: `أرباح معلقة من قناة (${chnData.name || chnData.username}) - تتحرر بعد ${RULES.EARNINGS_RELEASE_HOURS} ساعة`
          })
        );

        if (referrerRef && referrerData) {
          referralCommission = roundMoney(validEarnings * RULES.REFERRAL_COMMISSION_RATE);
          if (referralCommission > 0) {
            const nextRefPending = roundMoney(
              Number(referrerData.pendingEarnings || 0) + referralCommission
            );
            const nextRefTotal = roundMoney(
              Number(referrerData.referralEarningsTotal || 0) + referralCommission
            );

            tx.update(referrerRef, {
              pendingEarnings: nextRefPending,
              referralEarningsTotal: nextRefTotal,
              updatedAt: nowIso()
            });

            const refLockId = generateId("lock_ref");
            tx.set(db.collection(Collections.EARNINGS_LOCKS).doc(refLockId), {
              id: refLockId,
              userId: ownerData.referredBy,
              channelId,
              fromUserId: chnData.ownerId,
              amount: referralCommission,
              status: "pending",
              createdAt: nowIso(),
              releaseAt: releaseAtIso
            });

            const refTxId = generateId("tx_ref");
            tx.set(
              db.collection(Collections.TRANSACTIONS).doc(refTxId),
              buildTransactionRecord({
                id: refTxId,
                userId: ownerData.referredBy,
                type: "referral",
                amount: referralCommission,
                status: "pending",
                note: `عمولة إحالة من أرباح (${chnData.ownerId}) - تتحرر بعد ${RULES.EARNINGS_RELEASE_HOURS} ساعة`
              })
            );
          }
        }
      }

      return {
        channel: { ...chnData, viewsCount: nextViews, filteredBotViews: nextFilteredTotal, earnedTotal: nextEarnedTotal },
        validViews,
        botFilteredViews,
        validEarnings,
        referralCommission,
        releaseAt: releaseAtIso
      };
    });

    if (statResult.notFound) return res.status(404).json({ ok: false, error: "القناة غير موجودة." });
    if (statResult.channelBanned) {
      return res.status(403).json({ ok: false, error: "هذه القناة محظورة." });
    }

    res.json({ ok: true, ...statResult });
  })
);

// ==================== الترويج (PROMOTION / CAMPAIGNS) ====================

app.get(
  "/api/campaigns",
  telegramAuthMiddleware,
  checkMaintenanceAndBanGate,
  asyncHandler(async (req, res) => {
    const snap = await db
      .collection(Collections.CAMPAIGNS)
      .where("advertiserId", "==", String(req.tgUser.id))
      .get();
    const campaigns = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    campaigns.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    res.json({ campaigns });
  })
);

app.post(
  "/api/campaigns",
  telegramAuthMiddleware,
  checkMaintenanceAndBanGate,
  asyncHandler(async (req, res) => {
    const userId = String(req.tgUser.id);
    const title = (req.body?.title || "").toString().trim();
    const content = (req.body?.content || "").toString().trim();
    const budget = roundMoney(req.body?.budget);
    const targetingMode = (req.body?.targetingMode || "specific").toString().trim();

    if (!title || !content || budget <= 0) {
      return res.status(400).json({ error: "Invalid campaign parameters" });
    }
    if (targetingMode !== "open" && targetingMode !== "specific") {
      return res.status(400).json({ error: "Invalid targeting mode" });
    }

    const config = await getSystemConfig();
    const matchedWord = findMatchedBlacklistWord(`${title} ${content}`, config.blacklistWords);
    if (matchedWord) {
      await writeAuditLog(db, {
        entityType: "campaign",
        entityId: userId,
        severity: "high",
        reason: `محاولة إنشاء حملة تحتوي على كلمة من القائمة السوداء: ${matchedWord}`,
        meta: { title, matchedWord }
      });
      await createSmartAlert(db, {
        userId,
        category: "content_block",
        title: "تم حظر محتوى الحملة",
        message: `تم رفض إنشاء الحملة لاحتوائها على كلمة محظورة في القائمة السوداء (${matchedWord}).`
      });
      return res.status(400).json({
        error: `تم منع إنشاء الحملة لاحتوائها على كلمة محظورة في القائمة السوداء (${matchedWord}).`
      });
    }

    if (targetingMode === "open" && budget <= RULES.OPEN_TARGETING_MIN_BUDGET) {
      await writeSecurityLog(db, {
        actorId: userId,
        actorRole: req.isOwner ? "admin" : "user",
        action: "OPEN_TARGETING_REJECTED_SERVER",
        targetId: null,
        details: { budget, requiredGreaterThan: RULES.OPEN_TARGETING_MIN_BUDGET },
        ip: req.ip
      });
      return res.status(400).json({
        error: `الاستهداف المفتوح متاح فقط عندما تكون الميزانية أكبر من ${RULES.OPEN_TARGETING_MIN_BUDGET}$.`
      });
    }

    const campaignId = generateId("cmp");
    const created = await db.runTransaction(async (tx) => {
      const userRef = db.collection(Collections.USERS).doc(userId);
      const userData = await ensureUserDoc(tx, userId, req.isOwner ? "admin" : "user", null);
      const walletBalance = roundMoney(userData.walletBalance || 0);

      if (walletBalance < budget) {
        return { insufficientFunds: true, walletBalance };
      }

      const nextWalletBalance = roundMoney(walletBalance - budget);
      tx.update(userRef, {
        walletBalance: nextWalletBalance,
        updatedAt: nowIso()
      });

      const campaignRecord = {
        id: campaignId,
        advertiserId: userId,
        title: title.slice(0, 100),
        content: content.slice(0, 1000),
        budget,
        remainingBudget: budget,
        targetingMode,
        status: "Active",
        settled: false,
        lowBudgetAlertSent: false,
        editHistory: [
          {
            action: "created",
            details: { title: title.slice(0, 100), budget, targetingMode },
            at: nowIso()
          }
        ],
        createdAt: nowIso(),
        updatedAt: nowIso()
      };

      const txRecordId = generateId("tx");
      tx.set(db.collection(Collections.CAMPAIGNS).doc(campaignId), campaignRecord);
      tx.set(
        db.collection(Collections.TRANSACTIONS).doc(txRecordId),
        buildTransactionRecord({
          id: txRecordId,
          userId,
          type: "settlement",
          amount: budget,
          status: "completed",
          note: `حجز ميزانية الحملة: ${campaignRecord.title}`
        })
      );

      await writeSecurityLog(tx, {
        actorId: userId,
        actorRole: req.isOwner ? "admin" : "user",
        action: "CAMPAIGN_CREATED_BUDGET_RESERVED",
        targetId: campaignId,
        details: { title: campaignRecord.title, budget, targetingMode },
        ip: req.ip
      });

      return { campaign: campaignRecord, walletBalance: nextWalletBalance };
    });

    if (created.insufficientFunds) {
      return res.status(400).json({
        error: `رصيد المحفظة غير كافٍ لتغطية الميزانية. الرصيد الحالي: ${created.walletBalance.toFixed(2)}$.`
      });
    }

    res.json({ success: true, id: campaignId, campaign: created.campaign });
  })
);

app.post(
  "/api/campaigns/:campaignId/settle",
  telegramAuthMiddleware,
  checkMaintenanceAndBanGate,
  asyncHandler(async (req, res) => {
    const campaignId = (req.params.campaignId || "").toString().trim();
    const actionType = req.body?.action === "stop" ? "stopped" : "completed";

    if (!campaignId) {
      return res.status(400).json({ ok: false, error: "معرف الحملة مطلوب." });
    }

    const settlementResult = await db.runTransaction(async (tx) => {
      const cmpRef = db.collection(Collections.CAMPAIGNS).doc(campaignId);
      const cmpSnap = await tx.get(cmpRef);
      if (!cmpSnap.exists) return { notFound: true };

      const cmpData = cmpSnap.data();
      if (
        cmpData.settled === true ||
        cmpData.status === "completed" ||
        cmpData.status === "stopped"
      ) {
        return { alreadySettled: true };
      }

      const refundAmount = roundMoney(cmpData.remainingBudget || 0);
      const advertiserRef = db.collection(Collections.USERS).doc(cmpData.advertiserId);
      const advertiserData = await ensureUserDoc(tx, cmpData.advertiserId, "user", null);
      const nextWalletBalance = roundMoney(
        Number(advertiserData.walletBalance || 0) + refundAmount
      );

      const history = Array.isArray(cmpData.editHistory) ? cmpData.editHistory.slice() : [];
      history.push({
        action: `settled_${actionType}`,
        details: { refundAmount },
        at: nowIso()
      });

      tx.update(cmpRef, {
        remainingBudget: 0,
        status: actionType,
        settled: true,
        settledAt: nowIso(),
        editHistory: history,
        updatedAt: nowIso()
      });

      tx.update(advertiserRef, {
        walletBalance: nextWalletBalance,
        updatedAt: nowIso()
      });

      const txRecordId = generateId("tx");
      tx.set(
        db.collection(Collections.TRANSACTIONS).doc(txRecordId),
        buildTransactionRecord({
          id: txRecordId,
          userId: cmpData.advertiserId,
          type: "settlement",
          amount: refundAmount,
          status: "completed",
          note: `تسوية ميزانية الحملة (${cmpData.title}) وإعادة المتبقي`
        })
      );

      return { settled: true, refundAmount, finalStatus: actionType, walletBalance: nextWalletBalance };
    });

    if (settlementResult.notFound) return res.status(404).json({ ok: false, error: "الحملة غير موجودة." });
    if (settlementResult.alreadySettled) {
      return res.status(409).json({ ok: false, error: "تمت تسوية هذه الحملة مسبقاً." });
    }

    res.json({ ok: true, ...settlementResult });
  })
);

// ==================== الإحالة (REFERRALS) ====================

app.get(
  "/api/referrals",
  telegramAuthMiddleware,
  checkMaintenanceAndBanGate,
  asyncHandler(async (req, res) => {
    const userId = String(req.tgUser.id);
    const snap = await db
      .collection(Collections.USERS)
      .where("referredBy", "==", userId)
      .get();

    const referrals = snap.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        referralEarningsTotal: roundMoney(data.referralEarningsTotal || 0),
        createdAt: data.createdAt || null
      };
    });

    const userSnap = await db.collection(Collections.USERS).doc(userId).get();
    const userData = userSnap.exists ? userSnap.data() : {};

    res.json({
      success: true,
      referralEarnings: roundMoney(userData.referralEarnings || 0),
      referralEarningsTotal: roundMoney(userData.referralEarningsTotal || 0),
      referrals
    });
  })
);

// ==================== المحفظة (WALLET) ====================

app.get(
  "/api/wallet",
  telegramAuthMiddleware,
  checkMaintenanceAndBanGate,
  asyncHandler(async (req, res) => {
    const userId = String(req.tgUser.id);
    await db.runTransaction(async (tx) => {
      await ensureUserDoc(tx, userId, req.isOwner ? "admin" : "user", null);
    });
    await releaseMaturedEarningsForUser(userId);

    const userSnap = await db.collection(Collections.USERS).doc(userId).get();
    const userData = userSnap.data() || {};

    const [txSnap, wdrSnap, alertsSnap] = await Promise.all([
      db.collection(Collections.TRANSACTIONS).where("userId", "==", userId).get(),
      db.collection(Collections.WITHDRAWALS).where("userId", "==", userId).get(),
      db.collection(Collections.SMART_ALERTS).where("userId", "==", userId).get()
    ]);

    const recentTransactions = txSnap.docs
      .map((d) => d.data())
      .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
      .slice(0, 10);

    const withdrawals = wdrSnap.docs
      .map((d) => d.data())
      .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

    const smartAlerts = alertsSnap.docs
      .map((d) => d.data())
      .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
      .slice(0, 15);

    res.json({
      ok: true,
      user: userData,
      depositInfo: {
        network: RULES.NETWORK,
        walletAddress: RULES.WALLET_ADDRESS,
        minDepositUsd: RULES.MIN_DEPOSIT_USD
      },
      withdrawalInfo: {
        network: RULES.WITHDRAWAL_NETWORK,
        minWithdrawalUsd: RULES.MIN_WITHDRAWAL_USD,
        feeUsd: RULES.WITHDRAWAL_FEE_USD
      },
      recentTransactions,
      withdrawals,
      smartAlerts
    });
  })
);

app.post(
  "/api/wallet/deposit",
  telegramAuthMiddleware,
  checkMaintenanceAndBanGate,
  asyncHandler(async (req, res) => {
    const userId = String(req.tgUser.id);
    const amount = roundMoney(req.body?.amount);
    const txid = (req.body?.txid || "").toString().trim();

    if (amount < RULES.MIN_DEPOSIT_USD) {
      return res.status(400).json({
        ok: false,
        error: `الحد الأدنى للإيداع هو ${RULES.MIN_DEPOSIT_USD.toFixed(2)}$ عبر شبكة ${RULES.NETWORK}.`
      });
    }
    if (!txid || txid.length < 10) {
      return res.status(400).json({ ok: false, error: "يرجى إدخال رقم المعاملة TXID صحيح." });
    }

    const normalizedTxid = txid.toLowerCase();

    const depositResult = await db
      .runTransaction(async (tx) => {
        await ensureUserDoc(tx, userId, req.isOwner ? "admin" : "user", null);

        const duplicateQuery = db
          .collection(Collections.DEPOSITS)
          .where("txidNormalized", "==", normalizedTxid);
        const duplicateSnap = await tx.get(duplicateQuery);
        if (!duplicateSnap.empty) {
          const err = new Error("DUPLICATE_TXID");
          throw err;
        }

        const depositId = generateId("dep");
        const txRecordId = generateId("tx");

        const depositRecord = {
          id: depositId,
          userId,
          amount,
          network: RULES.NETWORK,
          walletAddress: RULES.WALLET_ADDRESS,
          txid,
          txidNormalized: normalizedTxid,
          status: "pending",
          adminNote: "",
          createdAt: nowIso(),
          updatedAt: nowIso()
        };

        tx.set(db.collection(Collections.DEPOSITS).doc(depositId), depositRecord);
        tx.set(
          db.collection(Collections.TRANSACTIONS).doc(txRecordId),
          buildTransactionRecord({
            id: txRecordId,
            userId,
            type: "deposit",
            amount,
            status: "pending",
            txid,
            note: `طلب إيداع (${RULES.NETWORK}) قيد المراجعة`
          })
        );

        await writeSecurityLog(tx, {
          actorId: userId,
          actorRole: req.isOwner ? "admin" : "user",
          action: "DEPOSIT_SUBMITTED",
          targetId: depositId,
          details: { amount, txid },
          ip: req.ip
        });

        return depositRecord;
      })
      .catch((err) => {
        if (err && err.message === "DUPLICATE_TXID") {
          return { duplicate: true };
        }
        throw err;
      });

    if (depositResult && depositResult.duplicate) {
      await writeAuditLog(db, {
        entityType: "user",
        entityId: userId,
        severity: "high",
        reason: "محاولة تكرار رقم المعاملة TXID في طلب إيداع",
        meta: { txid, amount }
      });
      return res.status(409).json({
        ok: false,
        error: "رقم المعاملة TXID مستخدم مسبقاً ولا يُسمح بتكراره."
      });
    }

    res.status(201).json({ ok: true, deposit: depositResult });
  })
);

app.post(
  "/api/wallet/withdraw",
  telegramAuthMiddleware,
  checkMaintenanceAndBanGate,
  asyncHandler(async (req, res) => {
    const userId = String(req.tgUser.id);
    const amount = roundMoney(req.body?.amount);
    const destinationAddress = (req.body?.destinationAddress || "").toString().trim();

    if (amount < RULES.MIN_WITHDRAWAL_USD) {
      return res.status(400).json({
        ok: false,
        error: `الحد الأدنى للسحب هو ${RULES.MIN_WITHDRAWAL_USD.toFixed(2)}$ عبر شبكة ${RULES.WITHDRAWAL_NETWORK}.`
      });
    }
    if (amount <= RULES.WITHDRAWAL_FEE_USD) {
      return res.status(400).json({
        ok: false,
        error: `مبلغ السحب يجب أن يكون أكبر من رسوم السحب (${RULES.WITHDRAWAL_FEE_USD.toFixed(2)}$).`
      });
    }
    if (!destinationAddress || destinationAddress.length < 20) {
      return res.status(400).json({
        ok: false,
        error: `يرجى إدخال عنوان محفظة ${RULES.WITHDRAWAL_NETWORK} صحيح للسحب.`
      });
    }

    await releaseMaturedEarningsForUser(userId);
    const netAmount = roundMoney(amount - RULES.WITHDRAWAL_FEE_USD);

    const result = await db.runTransaction(async (tx) => {
      const userRef = db.collection(Collections.USERS).doc(userId);
      const userData = await ensureUserDoc(tx, userId, req.isOwner ? "admin" : "user", null);
      const available = roundMoney(userData.availableEarnings || 0);

      if (available < amount) {
        return { insufficient: true, available };
      }

      const nextAvailable = roundMoney(available - amount);
      tx.update(userRef, {
        availableEarnings: nextAvailable,
        trc20Address: destinationAddress,
        updatedAt: nowIso()
      });

      const withdrawalId = generateId("wdr");
      const txRecordId = generateId("tx");

      const withdrawalRecord = {
        id: withdrawalId,
        userId,
        amount,
        feeAmount: RULES.WITHDRAWAL_FEE_USD,
        netAmount,
        network: RULES.WITHDRAWAL_NETWORK,
        destinationAddress,
        status: "pending",
        adminNote: "",
        steps: [{ step: "pending", label: "قيد المراجعة", at: nowIso() }],
        createdAt: nowIso(),
        updatedAt: nowIso()
      };

      tx.set(db.collection(Collections.WITHDRAWALS).doc(withdrawalId), withdrawalRecord);
      tx.set(
        db.collection(Collections.TRANSACTIONS).doc(txRecordId),
        buildTransactionRecord({
          id: txRecordId,
          userId,
          type: "withdrawal",
          amount: netAmount,
          status: "pending",
          note: `طلب سحب ${amount.toFixed(2)}$ (رسوم ${RULES.WITHDRAWAL_FEE_USD.toFixed(2)}$، صافي ${netAmount.toFixed(2)}$) عبر ${RULES.WITHDRAWAL_NETWORK}`
        })
      );

      return { withdrawal: withdrawalRecord, availableEarnings: nextAvailable };
    });

    if (result.insufficient) {
      return res.status(400).json({
        ok: false,
        error: `الرصيد القابل للسحب غير كافٍ. المتاح حالياً: ${result.available.toFixed(2)}$.`
      });
    }

    res.status(201).json({
      ok: true,
      withdrawal: result.withdrawal,
      availableEarnings: result.availableEarnings
    });
  })
);

// ==================== الدعم الفني ====================

app.post(
  "/api/support",
  telegramAuthMiddleware,
  checkMaintenanceAndBanGate,
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

// ==================== الإدارة (ADMIN - OWNER ONLY) ====================

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

app.post(
  "/api/admin/maintenance",
  telegramAuthMiddleware,
  ownerOnlyMiddleware,
  asyncHandler(async (req, res) => {
    const enabled = Boolean(req.body?.enabled);
    const message = (
      req.body?.message || "النظام في وضع الصيانة حالياً لإجراء التحديثات."
    )
      .toString()
      .trim();

    await db.collection(Collections.SYSTEM_CONFIG).doc("global").set(
      {
        maintenanceMode: enabled,
        maintenanceMessage: message,
        updatedAt: nowIso(),
        updatedBy: String(req.tgUser.id)
      },
      { merge: true }
    );

    await writeSecurityLog(db, {
      actorId: String(req.tgUser.id),
      actorRole: "admin",
      action: enabled ? "MAINTENANCE_MODE_ENABLED" : "MAINTENANCE_MODE_DISABLED",
      targetId: "global",
      details: { enabled, message },
      ip: req.ip
    });

    res.json({ ok: true, maintenanceMode: enabled, maintenanceMessage: message });
  })
);

app.post(
  "/api/admin/ban",
  telegramAuthMiddleware,
  ownerOnlyMiddleware,
  asyncHandler(async (req, res) => {
    const entityType = (req.body?.entityType || "").toString().trim();
    const entityId = (req.body?.entityId || "").toString().trim();
    const reason = (req.body?.reason || "").toString().trim();
    const unban = Boolean(req.body?.unban);

    if (!["user", "channel", "advertiser"].includes(entityType) || !entityId) {
      return res.status(400).json({ ok: false, error: "نوع الكيان ومعرفه مطلوبان." });
    }
    if (!unban && !reason) {
      return res.status(400).json({ ok: false, error: "سبب الحظر مطلوب." });
    }

    const fieldMap = {
      user: "bannedUsers",
      channel: "bannedChannels",
      advertiser: "bannedAdvertisers"
    };
    const targetField = fieldMap[entityType];

    await db.runTransaction(async (tx) => {
      const cfgRef = db.collection(Collections.SYSTEM_CONFIG).doc("global");
      const cfgSnap = await tx.get(cfgRef);
      const currentCfg = cfgSnap.exists ? cfgSnap.data() : {};
      const mapObj = { ...(currentCfg[targetField] || {}) };

      if (unban) {
        delete mapObj[entityId];
      } else {
        mapObj[entityId] = {
          reason,
          bannedAt: nowIso(),
          bannedBy: String(req.tgUser.id)
        };
      }

      tx.set(cfgRef, { [targetField]: mapObj, updatedAt: nowIso() }, { merge: true });

      if (entityType === "user" || entityType === "advertiser") {
        const userRef = db.collection(Collections.USERS).doc(entityId);
        const userSnap = await tx.get(userRef);
        if (userSnap.exists) {
          tx.update(userRef, {
            banned: !unban,
            banReason: unban ? "" : reason,
            updatedAt: nowIso()
          });
        }
      }

      if (entityType === "channel") {
        const chnRef = db.collection(Collections.CHANNELS).doc(entityId);
        const chnSnap = await tx.get(chnRef);
        if (chnSnap.exists) {
          tx.update(chnRef, {
            status: unban ? "active" : "banned",
            banReason: unban ? "" : reason,
            updatedAt: nowIso()
          });
        }
      }
    });

    res.json({ ok: true, entityType, entityId, banned: !unban });
  })
);

app.post(
  "/api/admin/deposits/:depositId/review",
  telegramAuthMiddleware,
  ownerOnlyMiddleware,
  asyncHandler(async (req, res) => {
    const depositId = (req.params.depositId || "").toString().trim();
    const decision = (req.body?.decision || "").toString().trim();
    const reason = (req.body?.reason || "").toString().trim();

    if (!depositId || (decision !== "approve" && decision !== "reject") || !reason) {
      return res.status(400).json({ ok: false, error: "معرف الطلب والقرار والسبب مطلوبون." });
    }

    const reviewResult = await db.runTransaction(async (tx) => {
      const depRef = db.collection(Collections.DEPOSITS).doc(depositId);
      const depSnap = await tx.get(depRef);
      if (!depSnap.exists) return { notFound: true };

      const depData = depSnap.data();
      if (depData.status !== "pending") return { alreadyProcessed: true };

      const userRef = db.collection(Collections.USERS).doc(depData.userId);
      const userData = await ensureUserDoc(tx, depData.userId, "user", null);
      const amount = roundMoney(depData.amount);

      if (decision === "approve") {
        const nextWalletBalance = roundMoney(Number(userData.walletBalance || 0) + amount);
        tx.update(userRef, { walletBalance: nextWalletBalance, updatedAt: nowIso() });
        tx.update(depRef, { status: "approved", adminNote: reason, updatedAt: nowIso() });

        const txRecordId = generateId("tx");
        tx.set(
          db.collection(Collections.TRANSACTIONS).doc(txRecordId),
          buildTransactionRecord({
            id: txRecordId,
            userId: depData.userId,
            type: "deposit",
            amount,
            status: "completed",
            txid: depData.txid,
            note: `تم قبول الإيداع: ${reason}`
          })
        );
        return { status: "approved", reason, walletBalance: nextWalletBalance };
      }

      tx.update(depRef, { status: "rejected", adminNote: reason, updatedAt: nowIso() });
      const txRecordId = generateId("tx");
      tx.set(
        db.collection(Collections.TRANSACTIONS).doc(txRecordId),
        buildTransactionRecord({
          id: txRecordId,
          userId: depData.userId,
          type: "deposit",
          amount,
          status: "rejected",
          txid: depData.txid,
          note: `تم رفض الإيداع: ${reason}`
        })
      );
      return { status: "rejected", reason };
    });

    if (reviewResult.notFound) return res.status(404).json({ ok: false, error: "طلب الإيداع غير موجود." });
    if (reviewResult.alreadyProcessed) {
      return res.status(409).json({ ok: false, error: "تمت معالجة طلب الإيداع مسبقاً." });
    }

    res.json({ ok: true, ...reviewResult });
  })
);

app.post(
  "/api/admin/withdrawals/:withdrawalId/review",
  telegramAuthMiddleware,
  ownerOnlyMiddleware,
  asyncHandler(async (req, res) => {
    const withdrawalId = (req.params.withdrawalId || "").toString().trim();
    const decision = (req.body?.decision || "").toString().trim();
    const reason = (req.body?.reason || "").toString().trim();

    if (!withdrawalId || !["processing", "approve", "reject"].includes(decision) || !reason) {
      return res.status(400).json({ ok: false, error: "معرف السحب والقرار والسبب مطلوبون." });
    }

    const reviewResult = await db.runTransaction(async (tx) => {
      const wdrRef = db.collection(Collections.WITHDRAWALS).doc(withdrawalId);
      const wdrSnap = await tx.get(wdrRef);
      if (!wdrSnap.exists) return { notFound: true };

      const wdrData = wdrSnap.data();
      if (wdrData.status === "completed" || wdrData.status === "rejected") {
        return { alreadyProcessed: true };
      }

      const amount = roundMoney(wdrData.amount);
      const netAmount = roundMoney(
        wdrData.netAmount || Math.max(0, amount - RULES.WITHDRAWAL_FEE_USD)
      );
      const userRef = db.collection(Collections.USERS).doc(wdrData.userId);
      const userData = await ensureUserDoc(tx, wdrData.userId, "user", null);
      const prevSteps = Array.isArray(wdrData.steps) ? wdrData.steps.slice() : [];

      if (decision === "processing") {
        prevSteps.push({ step: "processing", label: "قيد المعالجة / الإرسال", note: reason, at: nowIso() });
        tx.update(wdrRef, { status: "processing", adminNote: reason, steps: prevSteps, updatedAt: nowIso() });
        return { status: "processing", reason };
      }

      if (decision === "approve") {
        if (wdrData.status !== "processing") {
          prevSteps.push({ step: "processing", label: "قيد المعالجة / الإرسال", at: nowIso() });
        }
        prevSteps.push({ step: "completed", label: "مكتمل", note: reason, at: nowIso() });
        tx.update(wdrRef, { status: "completed", adminNote: reason, steps: prevSteps, updatedAt: nowIso() });

        const txRecordId = generateId("tx");
        tx.set(
          db.collection(Collections.TRANSACTIONS).doc(txRecordId),
          buildTransactionRecord({
            id: txRecordId,
            userId: wdrData.userId,
            type: "withdrawal",
            amount: netAmount,
            status: "completed",
            note: `تم إرسال السحب (صافي ${netAmount.toFixed(2)}$): ${reason}`
          })
        );
        return { status: "completed", reason };
      }

      prevSteps.push({ step: "rejected", label: "مرفوض", note: reason, at: nowIso() });
      const refundedAvailable = roundMoney(Number(userData.availableEarnings || 0) + amount);
      tx.update(userRef, { availableEarnings: refundedAvailable, updatedAt: nowIso() });
      tx.update(wdrRef, { status: "rejected", adminNote: reason, steps: prevSteps, updatedAt: nowIso() });

      const txRecordId = generateId("tx");
      tx.set(
        db.collection(Collections.TRANSACTIONS).doc(txRecordId),
        buildTransactionRecord({
          id: txRecordId,
          userId: wdrData.userId,
          type: "withdrawal",
          amount,
          status: "rejected",
          note: `تم رفض السحب وإعادة ${amount.toFixed(2)}$ للرصيد المتاح: ${reason}`
        })
      );
      return { status: "rejected", reason, availableEarnings: refundedAvailable };
    });

    if (reviewResult.notFound) return res.status(404).json({ ok: false, error: "طلب السحب غير موجود." });
    if (reviewResult.alreadyProcessed) {
      return res.status(409).json({ ok: false, error: "تمت معالجة طلب السحب مسبقاً." });
    }

    res.json({ ok: true, ...reviewResult });
  })
);

app.get("*", (req, res) => {
  const indexPath = path.join(__dirname, "public", "index.html");
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).json({ error: "Not found" });
  }
});

app.use((err, req, res, _next) => {
  console.error("[Server Error]:", err);
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({ error: err.message || "Internal Server Error" });
});

app.listen(PORT, () => {
  console.log(`Telega.ads server running securely on port ${PORT} (started ${SERVER_STARTED_AT.toISOString()})`);
});

export { callTelegramApi, verifyTelegramWebAppData };
export default app;
