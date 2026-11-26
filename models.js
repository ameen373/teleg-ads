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
  DEPOSITS: "wallet_deposits",
  WITHDRAWALS: "wallet_withdrawals",
  TRANSACTIONS: "wallet_transactions",
  PENDING_RELEASES: "wallet_pending_releases"
};

export const WALLET_CONSTANTS = {
  MIN_DEPOSIT: 10.0,
  MIN_WITHDRAWAL: 30.0,
  WITHDRAWAL_FEE: 3.0,
  DEPOSIT_NETWORK: "USDT - BEP20",
  DEPOSIT_ADDRESS: "0xf9278f55585a0e6e35f12299493134056f2f19b0",
  WITHDRAWAL_NETWORK: "USDT - TRC20",
  RELEASE_HOLD_MS: 24 * 60 * 60 * 1000, // 24 ساعة
  REFERRAL_COMMISSION_RATE: 0.10 // 10% من أرباح الناشرين المدعوين فقط
};

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

/**
 * تسجيل معاملة مالية في سجل المعاملات الموحد
 */
export async function recordTransaction(txOrDb, payload) {
  const docRef = db.collection(Collections.TRANSACTIONS).doc();
  const data = {
    userId: String(payload.userId),
    type: payload.type, // deposit | withdrawal | campaign_spend | campaign_refund | publisher_earning | referral_earning | earning_released
    amount: roundMoney(payload.amount),
    direction: payload.direction || "in", // in | out | hold
    status: payload.status || "completed",
    title: payload.title || "",
    meta: payload.meta || {},
    createdAt: new Date().toISOString()
  };

  if (txOrDb && typeof txOrDb.set === "function") {
    txOrDb.set(docRef, data);
  } else {
    await docRef.set(data);
  }
  return { id: docRef.id, ...data };
}

/**
 * فك رمز الإحالة إن وُجد واستخراج معرف المحيل
 */
function decodeReferrerId(startParam, currentUserId) {
  if (!startParam || typeof startParam !== "string") return null;
  const trimmed = startParam.trim();
  if (!trimmed.startsWith("ref_")) return null;
  const encoded = trimmed.slice(4);
  if (!encoded) return null;

  try {
    const padded = encoded + "=".repeat((4 - (encoded.length % 4)) % 4);
    const decoded = Buffer.from(padded, "base64").toString("utf8").trim();
    if (/^\d+$/.test(decoded) && decoded !== String(currentUserId)) {
      return decoded;
    }
    return null;
  } catch {
    return null;
  }
}

export async function upsertTelegramUser(tgUser, startParam = "") {
  try {
    const userId = String(tgUser.id);
    const userRef = db.collection(Collections.USERS).doc(userId);
    const snapshot = await userRef.get();
    const now = admin.firestore.FieldValue.serverTimestamp();

    const basePayload = {
      telegramId: userId,
      username: tgUser.username || "",
      firstName: tgUser.first_name || "",
      lastName: tgUser.last_name || "",
      languageCode: tgUser.language_code || "en",
      updatedAt: now
    };

    if (!snapshot.exists) {
      let referredBy = null;
      const candidateRef = decodeReferrerId(startParam, userId);
      if (candidateRef) {
        const refUserSnap = await db.collection(Collections.USERS).doc(candidateRef).get();
        if (refUserSnap.exists) {
          referredBy = candidateRef;
        }
      }

      await userRef.set({
        ...basePayload,
        balance: 0,
        pendingBalance: 0,
        totalSpent: 0,
        totalEarned: 0,
        referralEarnings: 0,
        pendingReferralEarnings: 0,
        referredBy,
        trc20Wallet: "",
        createdAt: now
      });

      if (referredBy) {
        await db.collection(Collections.USERS).doc(referredBy).set(
          {
            referralsCount: admin.firestore.FieldValue.increment(1)
          },
          { merge: true }
        );
      }
    } else {
      const existingData = snapshot.data() || {};
      const updates = { ...basePayload };
      if (typeof existingData.balance !== "number") updates.balance = 0;
      if (typeof existingData.pendingBalance !== "number") updates.pendingBalance = 0;
      if (typeof existingData.totalSpent !== "number") updates.totalSpent = 0;
      if (typeof existingData.totalEarned !== "number") updates.totalEarned = 0;
      if (typeof existingData.referralEarnings !== "number") updates.referralEarnings = 0;
      if (typeof existingData.pendingReferralEarnings !== "number") updates.pendingReferralEarnings = 0;
      if (typeof existingData.trc20Wallet !== "string") updates.trc20Wallet = "";

      await userRef.update(updates);
    }

    return basePayload;
  } catch (error) {
    console.error("[Firestore upsertTelegramUser Error]:", error);
    throw error;
  }
}

/**
 * تحرير الأرباح المعلقة (أرباح الناشر وأرباح الإحالة) التي مرّ عليها 24 ساعة تلقائياً وبشكل ذري
 */
export async function processMatureEarnings(userId) {
  const uid = String(userId);
  const nowIso = new Date().toISOString();

  const dueSnap = await db
    .collection(Collections.PENDING_RELEASES)
    .where("userId", "==", uid)
    .where("status", "==", "pending")
    .get();

  const matureDocs = dueSnap.docs.filter((doc) => {
    const data = doc.data();
    return data.releaseAt && data.releaseAt <= nowIso;
  });

  if (matureDocs.length === 0) return 0;

  let totalReleased = 0;

  await db.runTransaction(async (tx) => {
    const userRef = db.collection(Collections.USERS).doc(uid);
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists) return;

    const userData = userSnap.data() || {};
    let currentBalance = roundMoney(userData.balance || 0);
    let currentPending = roundMoney(userData.pendingBalance || 0);
    let currentPendingRef = roundMoney(userData.pendingReferralEarnings || 0);
    let currentRefEarned = roundMoney(userData.referralEarnings || 0);
    let currentTotalEarned = roundMoney(userData.totalEarned || 0);

    for (const docSnap of matureDocs) {
      const freshDoc = await tx.get(docSnap.ref);
      if (!freshDoc.exists) continue;
      const item = freshDoc.data();
      if (item.status !== "pending") continue;

      const amt = roundMoney(item.amount || 0);
      if (amt <= 0) {
        tx.update(docSnap.ref, { status: "released", releasedAt: nowIso });
        continue;
      }

      currentBalance = roundMoney(currentBalance + amt);
      currentPending = Math.max(0, roundMoney(currentPending - amt));
      totalReleased = roundMoney(totalReleased + amt);

      if (item.source === "referral") {
        currentPendingRef = Math.max(0, roundMoney(currentPendingRef - amt));
        currentRefEarned = roundMoney(currentRefEarned + amt);
      } else {
        currentTotalEarned = roundMoney(currentTotalEarned + amt);
      }

      tx.update(docSnap.ref, {
        status: "released",
        releasedAt: nowIso
      });

      recordTransaction(tx, {
        userId: uid,
        type: item.source === "referral" ? "referral_earning" : "earning_released",
        amount: amt,
        direction: "in",
        status: "completed",
        title:
          item.source === "referral"
            ? "Referral Commission Released (24h)"
            : "Publisher Earnings Released (24h)",
        meta: { releaseId: docSnap.id, source: item.source || "publisher" }
      });
    }

    tx.update(userRef, {
      balance: currentBalance,
      pendingBalance: currentPending,
      pendingReferralEarnings: currentPendingRef,
      referralEarnings: currentRefEarned,
      totalEarned: currentTotalEarned
    });
  });

  return totalReleased;
}

/**
 * تسجيل أرباح ناشر جديدة (تُحتجز 24 ساعة) + احتساب 10% عمولة إحالة للمحيل (إن وُجد) تُحتجز 24 ساعة أيضاً
 * ملاحظة: هذه الدالة مخصصة لأرباح الناشرين فقط، ولا تُستدعى إطلاقاً عند الإيداع.
 */
export async function creditPublisherEarningWithHold(publisherId, grossAmount, meta = {}) {
  const pubId = String(publisherId);
  const amount = roundMoney(grossAmount);
  if (amount <= 0) return { credited: 0, referralCommission: 0 };

  const now = Date.now();
  const createdAt = new Date(now).toISOString();
  const releaseAt = new Date(now + WALLET_CONSTANTS.RELEASE_HOLD_MS).toISOString();

  let referralCommission = 0;

  await db.runTransaction(async (tx) => {
    const pubRef = db.collection(Collections.USERS).doc(pubId);
    const pubSnap = await tx.get(pubRef);
    if (!pubSnap.exists) throw new Error("Publisher account not found");

    const pubData = pubSnap.data() || {};
    const referrerId = pubData.referredBy ? String(pubData.referredBy) : null;

    let refSnap = null;
    let refRef = null;
    if (referrerId && referrerId !== pubId) {
      refRef = db.collection(Collections.USERS).doc(referrerId);
      refSnap = await tx.get(refRef);
    }

    // 1. إضافة أرباح الناشر إلى الرصيد المعلق لمدة 24 ساعة
    const newPubPending = roundMoney((pubData.pendingBalance || 0) + amount);
    tx.update(pubRef, { pendingBalance: newPubPending });

    const pubHoldRef = db.collection(Collections.PENDING_RELEASES).doc();
    tx.set(pubHoldRef, {
      userId: pubId,
      source: "publisher",
      amount,
      status: "pending",
      meta,
      createdAt,
      releaseAt
    });

    recordTransaction(tx, {
      userId: pubId,
      type: "publisher_earning",
      amount,
      direction: "hold",
      status: "pending_24h",
      title: "Publisher Ad Revenue (24h Hold)",
      meta: { ...meta, releaseAt }
    });

    // 2. احتساب 10% عمولة إحالة من أرباح الناشر فقط (تُحتجز 24 ساعة أيضاً)
    if (refSnap && refSnap.exists) {
      referralCommission = roundMoney(amount * WALLET_CONSTANTS.REFERRAL_COMMISSION_RATE);
      if (referralCommission > 0) {
        const refData = refSnap.data() || {};
        tx.update(refRef, {
          pendingBalance: roundMoney((refData.pendingBalance || 0) + referralCommission),
          pendingReferralEarnings: roundMoney((refData.pendingReferralEarnings || 0) + referralCommission)
        });

        const refHoldRef = db.collection(Collections.PENDING_RELEASES).doc();
        tx.set(refHoldRef, {
          userId: referrerId,
          source: "referral",
          fromPublisherId: pubId,
          amount: referralCommission,
          status: "pending",
          meta,
          createdAt,
          releaseAt
        });

        recordTransaction(tx, {
          userId: referrerId,
          type: "referral_earning",
          amount: referralCommission,
          direction: "hold",
          status: "pending_24h",
          title: "10% Publisher Referral Commission (24h Hold)",
          meta: { fromPublisherId: pubId, releaseAt }
        });
      }
    }
  });

  return { credited: amount, referralCommission };
}

/**
 * تسوية الميزانية الآلية (Atomic Transaction) عند انتهاء الحملة الإعلانية:
 * تُحسب الميزانية المتبقية وتُعاد فوراً إلى رصيد المعلن المتاح.
 */
export async function settleCampaignBudgetAtomically(campaignId, requesterId, isOwner = false) {
  const campRef = db.collection(Collections.CAMPAIGNS).doc(String(campaignId));

  return await db.runTransaction(async (tx) => {
    const campSnap = await tx.get(campRef);
    if (!campSnap.exists) {
      throw new Error("Campaign not found");
    }

    const camp = campSnap.data() || {};
    const advertiserId = String(camp.advertiserId);

    if (!isOwner && advertiserId !== String(requesterId)) {
      throw new Error("Unauthorized campaign access");
    }

    if (camp.status === "Completed" || camp.settled === true) {
      throw new Error("Campaign already settled");
    }

    const totalBudget = roundMoney(camp.budget || 0);
    const spentBudget = roundMoney(camp.spent || 0);
    const remainingBudget = Math.max(0, roundMoney(totalBudget - spentBudget));

    const userRef = db.collection(Collections.USERS).doc(advertiserId);
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists) {
      throw new Error("Advertiser account not found");
    }

    const userData = userSnap.data() || {};
    const updatedBalance = roundMoney((userData.balance || 0) + remainingBudget);

    tx.update(campRef, {
      status: "Completed",
      settled: true,
      refundedAmount: remainingBudget,
      completedAt: new Date().toISOString()
    });

    if (remainingBudget > 0) {
      tx.update(userRef, {
        balance: updatedBalance
      });

      recordTransaction(tx, {
        userId: advertiserId,
        type: "campaign_refund",
        amount: remainingBudget,
        direction: "in",
        status: "completed",
        title: `Campaign Settlement Refund: ${camp.title || campaignId}`,
        meta: {
          campaignId: String(campaignId),
          totalBudget,
          spentBudget,
          refunded: remainingBudget
        }
      });
    }

    return {
      campaignId: String(campaignId),
      totalBudget,
      spentBudget,
      refundedAmount: remainingBudget,
      newBalance: updatedBalance
    };
  });
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
