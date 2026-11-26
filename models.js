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
  TRANSACTIONS: "transactions",
  DEPOSITS: "deposits",
  WITHDRAWALS: "withdrawals",
  PENDING_RELEASES: "pending_releases",
  TICKETS: "support_tickets",
  AUDIT_LOGS: "security_audit_logs"
};

export const DEPOSIT_ADDRESS_BEP20 = "0xf9278f55585a0e6e35f12299493134056f2f19b0";
export const MIN_DEPOSIT_USD = 10.0;
export const MIN_WITHDRAW_USD = 30.0;
export const WITHDRAW_FEE_USD = 3.0;
export const REFERRAL_COMMISSION_RATE = 0.10; // 10% من أرباح الناشرين المدعوين فقط
export const RELEASE_HOLD_MS = 24 * 60 * 60 * 1000; // 24 ساعة بالمللي ثانية

export function roundMoney(val) {
  return Math.round((Number(val) + Number.EPSILON) * 100) / 100;
}

/**
 * مزامنة أو إنشاء مستخدم تيليجرام مع ربط كود الإحالة إن وُجد عند أول دخول
 */
export async function upsertTelegramUser(tgUser, startParam = "") {
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
    if (startParam && String(startParam).startsWith("ref_")) {
      try {
        const rawCode = String(startParam).replace("ref_", "");
        const decodedId = Buffer.from(rawCode, "base64").toString("utf8").trim();
        if (decodedId && decodedId !== userId && /^\d+$/.test(decodedId)) {
          const referrerDoc = await db.collection(Collections.USERS).doc(decodedId).get();
          if (referrerDoc.exists) {
            referredBy = decodedId;
          }
        }
      } catch {
        referredBy = null;
      }
    }

    await userRef.set({
      ...basePayload,
      availableBalance: 0,      // الرصيد المتاح للسحب أو الإعلان
      pendingBalance: 0,        // الأرباح المعلقة بانتظار مرور 24 ساعة
      totalSpent: 0,            // إجمالي المصروفات على الحملات
      totalPublisherEarned: 0,  // إجمالي أرباح النشر المحررة
      totalReferralEarned: 0,   // إجمالي أرباح الإحالات المحررة
      trc20Address: "",         // عنوان محفظة السحب USDT-TRC20
      referredBy,
      referralsCount: 0,
      createdAt: now
    });

    if (referredBy) {
      await db
        .collection(Collections.USERS)
        .doc(referredBy)
        .update({
          referralsCount: admin.firestore.FieldValue.increment(1)
        });
    }
  } else {
    await userRef.update(basePayload);
  }

  return (await userRef.get()).data();
}

/**
 * تسجيل معاملة مالية في سجل المحفظة
 */
export async function recordTransaction(txOrBatch, data) {
  const txRef = db.collection(Collections.TRANSACTIONS).doc();
  const payload = {
    userId: String(data.userId),
    type: data.type, // deposit | withdraw | campaign_spend | campaign_refund | publisher_earning | referral_earning
    titleKey: data.titleKey,
    amount: roundMoney(data.amount),
    direction: data.direction, // in | out
    status: data.status || "completed", // completed | pending | rejected
    meta: data.meta || {},
    createdAt: new Date().toISOString()
  };

  if (txOrBatch && typeof txOrBatch.set === "function") {
    txOrBatch.set(txRef, payload);
  } else {
    await txRef.set(payload);
  }
  return txRef.id;
}

/**
 * تسجيل ربح لناشر + احتساب عمولة 10% للمحيل (تُحرر تلقائياً بعد 24 ساعة)
 * ملاحظة: هذه الدالة تُستدعى فقط عند أرباح الناشر، ولا تُستدعى إطلاقاً عند الإيداع/الشحن.
 */
export async function creditPublisherEarningWithHold(publisherId, grossAmount, campaignTitle = "") {
  const cleanGross = roundMoney(grossAmount);
  if (cleanGross <= 0) return;

  const pubRef = db.collection(Collections.USERS).doc(String(publisherId));
  const pubSnap = await pubRef.get();
  if (!pubSnap.exists) return;

  const pubData = pubSnap.data();
  const referrerId = pubData.referredBy || null;
  const releaseAtMs = Date.now() + RELEASE_HOLD_MS;
  const releaseAtIso = new Date(releaseAtMs).toISOString();

  await db.runTransaction(async (transaction) => {
    // 1. إضافة ربح الناشر إلى الرصيد المعلق (24 ساعة)
    transaction.update(pubRef, {
      pendingBalance: admin.firestore.FieldValue.increment(cleanGross)
    });

    const pubHoldRef = db.collection(Collections.PENDING_RELEASES).doc();
    transaction.set(pubHoldRef, {
      userId: String(publisherId),
      sourceUserId: String(publisherId),
      kind: "publisher_earning",
      amount: cleanGross,
      campaignTitle,
      status: "held",
      releaseAtMs,
      releaseAt: releaseAtIso,
      createdAt: new Date().toISOString()
    });

    recordTransaction(transaction, {
      userId: String(publisherId),
      type: "publisher_earning",
      titleKey: "tx_publisher_hold",
      amount: cleanGross,
      direction: "in",
      status: "pending",
      meta: { campaignTitle, releaseAt: releaseAtIso }
    });

    // 2. إذا كان للناشر مُحيل: احتساب 10% من أرباح الناشر كعمولة إحالة معلقة 24 ساعة
    if (referrerId) {
      const commission = roundMoney(cleanGross * REFERRAL_COMMISSION_RATE);
      if (commission > 0) {
        const refUserRef = db.collection(Collections.USERS).doc(String(referrerId));
        transaction.update(refUserRef, {
          pendingBalance: admin.firestore.FieldValue.increment(commission)
        });

        const refHoldRef = db.collection(Collections.PENDING_RELEASES).doc();
        transaction.set(refHoldRef, {
          userId: String(referrerId),
          sourceUserId: String(publisherId),
          kind: "referral_earning",
          amount: commission,
          campaignTitle,
          status: "held",
          releaseAtMs,
          releaseAt: releaseAtIso,
          createdAt: new Date().toISOString()
        });

        recordTransaction(transaction, {
          userId: String(referrerId),
          type: "referral_earning",
          titleKey: "tx_referral_hold",
          amount: commission,
          direction: "in",
          status: "pending",
          meta: { fromPublisher: String(publisherId), releaseAt: releaseAtIso }
        });
      }
    }
  });
}

/**
 * فحص وتحرير أي أرباح (ناشر أو إحالة) أتمت 24 ساعة تلقائياً وبشكل ذري
 */
export async function processMatureEarningsForUser(userId) {
  const nowMs = Date.now();
  const snap = await db
    .collection(Collections.PENDING_RELEASES)
    .where("userId", "==", String(userId))
    .where("status", "==", "held")
    .get();

  const dueDocs = snap.docs.filter((doc) => Number(doc.data().releaseAtMs || 0) <= nowMs);
  if (dueDocs.length === 0) return 0;

  let releasedTotal = 0;

  for (const holdDoc of dueDocs) {
    await db.runTransaction(async (transaction) => {
      const freshHold = await transaction.get(holdDoc.ref);
      if (!freshHold.exists || freshHold.data().status !== "held") return;

      const data = freshHold.data();
      const amount = roundMoney(data.amount);
      const userRef = db.collection(Collections.USERS).doc(String(userId));
      const userSnap = await transaction.get(userRef);
      if (!userSnap.exists) return;

      const currentPending = roundMoney(userSnap.data().pendingBalance || 0);
      const safeDeduct = Math.min(currentPending, amount);

      const updates = {
        pendingBalance: roundMoney(currentPending - safeDeduct),
        availableBalance: admin.firestore.FieldValue.increment(amount)
      };

      if (data.kind === "publisher_earning") {
        updates.totalPublisherEarned = admin.firestore.FieldValue.increment(amount);
      } else if (data.kind === "referral_earning") {
        updates.totalReferralEarned = admin.firestore.FieldValue.increment(amount);
      }

      transaction.update(userRef, updates);
      transaction.update(holdDoc.ref, {
        status: "released",
        releasedAt: new Date().toISOString()
      });

      recordTransaction(transaction, {
        userId: String(userId),
        type: data.kind,
        titleKey: data.kind === "referral_earning" ? "tx_referral_released" : "tx_publisher_released",
        amount,
        direction: "in",
        status: "completed",
        meta: { holdId: holdDoc.id }
      });

      releasedTotal = roundMoney(releasedTotal + amount);
    });
  }

  return releasedTotal;
}

/**
 * تسوية الميزانية الآلية الذرية (Atomic Transaction) عند انتهاء الحملة
 * تحسب الميزانية المتبقية وتعيدها فوراً إلى رصيد المعلن المتاح
 */
export async function settleCampaignAtomic(campaignId, requesterId, isOwner = false) {
  const campRef = db.collection(Collections.CAMPAIGNS).doc(String(campaignId));

  return await db.runTransaction(async (transaction) => {
    const campSnap = await transaction.get(campRef);
    if (!campSnap.exists) {
      throw new Error("Campaign not found");
    }

    const camp = campSnap.data();
    if (!isOwner && String(camp.advertiserId) !== String(requesterId)) {
      throw new Error("Unauthorized campaign access");
    }

    if (camp.status === "Completed") {
      throw new Error("Campaign already settled");
    }

    const totalBudget = roundMoney(camp.budget || 0);
    const spentBudget = roundMoney(camp.spent || 0);
    const remainingBudget = roundMoney(Math.max(0, totalBudget - spentBudget));

    const advertiserRef = db.collection(Collections.USERS).doc(String(camp.advertiserId));
    const advSnap = await transaction.get(advertiserRef);
    if (!advSnap.exists) {
      throw new Error("Advertiser account not found");
    }

    transaction.update(campRef, {
      status: "Completed",
      refundedAmount: remainingBudget,
      settledAt: new Date().toISOString()
    });

    if (remainingBudget > 0) {
      transaction.update(advertiserRef, {
        availableBalance: admin.firestore.FieldValue.increment(remainingBudget)
      });

      recordTransaction(transaction, {
        userId: String(camp.advertiserId),
        type: "campaign_refund",
        titleKey: "tx_campaign_refund",
        amount: remainingBudget,
        direction: "in",
        status: "completed",
        meta: { campaignId: campRef.id, title: camp.title }
      });
    }

    return {
      campaignId: campRef.id,
      totalBudget,
      spentBudget,
      refundedAmount: remainingBudget
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
