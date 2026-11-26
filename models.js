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
export const FieldValue = admin.firestore.FieldValue;
export const Timestamp = admin.firestore.Timestamp;

export const Collections = {
  USERS: "users",
  CHANNELS: "channels",
  CAMPAIGNS: "campaigns",
  TICKETS: "support_tickets",
  AUDIT_LOGS: "security_audit_logs",
  TRANSACTIONS: "transactions",
  DEPOSITS: "deposits",
  WITHDRAWALS: "withdrawals",
  REFERRALS: "referrals",
  PENDING_RELEASES: "pending_releases"
};

// alias للتوافق الكامل مع أي استدعاء يستخدم COLLECTIONS بالأحرف الكبيرة
export const COLLECTIONS = Collections;

export const WALLET_CONSTANTS = {
  MIN_WITHDRAWAL: 30.00,
  WITHDRAWAL_FEE: 3.00,
  WITHDRAWAL_NETWORK: "USDT - TRC20",
  MIN_DEPOSIT: 10.00,
  DEPOSIT_NETWORK: "USDT - BEP20",
  DEPOSIT_ADDRESS: "0xf9278f55585a0e6e35f12299493134056f2f19b0",
  REFERRAL_COMMISSION_RATE: 0.10,
  RELEASE_DELAY_MS: 24 * 60 * 60 * 1000,
  RECENT_TRANSACTIONS_LIMIT: 10
};

function sanitizePositiveAmount(value, fieldName = "amount") {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) {
    throw new Error(`Invalid ${fieldName}`);
  }
  return Number(num.toFixed(2));
}

function generateReferralCode(seedId) {
  const cleaned = String(seedId || "USER")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6);
  const suffix = Math.floor(100 + Math.random() * 900);
  return `REF-${cleaned || "USER"}${suffix}`;
}

export async function upsertTelegramUser(tgUser) {
  try {
    if (!tgUser || !tgUser.id) {
      throw new Error("Invalid Telegram user payload");
    }

    const userId = String(tgUser.id);
    const userRef = db.collection(Collections.USERS).doc(userId);
    const snapshot = await userRef.get();
    const now = FieldValue.serverTimestamp();
    const adminId = process.env.ADMIN_USER_ID || "admin_1";

    const payload = {
      userId,
      telegramId: userId,
      username: tgUser.username || "",
      firstName: tgUser.first_name || "",
      lastName: tgUser.last_name || "",
      languageCode: tgUser.language_code || "en",
      isAdmin: userId === adminId,
      updatedAt: now
    };

    if (!snapshot.exists) {
      const referralCode = generateReferralCode(userId);
      await userRef.set({
        ...payload,
        balance: 0,
        availableBalance: 0.00,
        pendingEarnings: 0.00,
        totalSpent: 0.00,
        totalEarned: 0.00,
        referralEarnings: 0,
        referralEarningsAvailable: 0.00,
        referralEarningsPending: 0.00,
        trc20Address: "",
        referralCode,
        referredBy: null,
        referralsCount: 0,
        createdAt: now
      });
    } else {
      const existing = snapshot.data() || {};
      const backfills = { ...payload };

      if (typeof existing.availableBalance !== "number") {
        backfills.availableBalance = Number(existing.balance || 0);
      }
      if (typeof existing.pendingEarnings !== "number") {
        backfills.pendingEarnings = 0.00;
      }
      if (typeof existing.totalSpent !== "number") {
        backfills.totalSpent = 0.00;
      }
      if (typeof existing.totalEarned !== "number") {
        backfills.totalEarned = 0.00;
      }
      if (typeof existing.referralEarningsAvailable !== "number") {
        backfills.referralEarningsAvailable = Number(existing.referralEarnings || 0);
      }
      if (typeof existing.referralEarningsPending !== "number") {
        backfills.referralEarningsPending = 0.00;
      }
      if (typeof existing.trc20Address !== "string") {
        backfills.trc20Address = "";
      }
      if (!existing.referralCode) {
        backfills.referralCode = generateReferralCode(userId);
      }
      if (!("referredBy" in existing)) {
        backfills.referredBy = null;
      }
      if (typeof existing.referralsCount !== "number") {
        backfills.referralsCount = 0;
      }

      await userRef.update(backfills);
    }

    return payload;
  } catch (error) {
    console.error("[Firestore upsertTelegramUser Error]:", error);
    throw error;
  }
}

export async function ensureUserDocument(userId, referralCodeInput = null) {
  try {
    const normalizedUserId = String(userId || "").trim();
    if (!normalizedUserId) {
      throw new Error("User ID is required");
    }

    const userRef = db.collection(Collections.USERS).doc(normalizedUserId);
    const doc = await userRef.get();
    const adminId = process.env.ADMIN_USER_ID || "admin_1";

    if (!doc.exists) {
      const generatedCode = generateReferralCode(normalizedUserId);
      let validReferrerId = null;

      if (referralCodeInput && typeof referralCodeInput === "string") {
        const cleanCode = referralCodeInput.trim();
        if (cleanCode) {
          const refQuery = await db
            .collection(Collections.USERS)
            .where("referralCode", "==", cleanCode)
            .limit(1)
            .get();

          if (!refQuery.empty && refQuery.docs[0].id !== normalizedUserId) {
            validReferrerId = refQuery.docs[0].id;
          }
        }
      }

      const initialData = {
        userId: normalizedUserId,
        telegramId: normalizedUserId,
        username: "",
        firstName: "",
        lastName: "",
        languageCode: "en",
        balance: 0.00,
        availableBalance: 0.00,
        pendingEarnings: 0.00,
        totalSpent: 0.00,
        totalEarned: 0.00,
        referralEarnings: 0.00,
        referralEarningsAvailable: 0.00,
        referralEarningsPending: 0.00,
        trc20Address: "",
        referralCode: generatedCode,
        referredBy: validReferrerId,
        referralsCount: 0,
        isAdmin: normalizedUserId === adminId,
        createdAt: Timestamp.now(),
        updatedAt: FieldValue.serverTimestamp()
      };

      await userRef.set(initialData);

      if (validReferrerId) {
        const referrerRef = db.collection(Collections.USERS).doc(validReferrerId);
        await referrerRef.update({
          referralsCount: FieldValue.increment(1),
          updatedAt: FieldValue.serverTimestamp()
        });
      }

      return initialData;
    }

    return doc.data();
  } catch (error) {
    console.error("[Firestore ensureUserDocument Error]:", error);
    throw new Error(`Database user initialization error: ${error.message}`);
  }
}

export async function process24HourReleases(userId) {
  try {
    const normalizedUserId = String(userId || "").trim();
    if (!normalizedUserId) {
      throw new Error("User ID is required");
    }

    const now = Timestamp.now();
    const pendingQuery = await db
      .collection(Collections.PENDING_RELEASES)
      .where("userId", "==", normalizedUserId)
      .where("status", "==", "pending")
      .where("releaseAt", "<=", now)
      .get();

    if (pendingQuery.empty) {
      return { releasedCount: 0, releasedAmount: 0 };
    }

    let releasedCount = 0;
    let totalReleasedAmount = 0;

    for (const releaseDoc of pendingQuery.docs) {
      const releaseData = releaseDoc.data();

      await db.runTransaction(async (transaction) => {
        const freshRelease = await transaction.get(releaseDoc.ref);
        if (!freshRelease.exists || freshRelease.data().status !== "pending") {
          return;
        }

        const currentReleaseData = freshRelease.data();
        const userRef = db.collection(Collections.USERS).doc(normalizedUserId);
        const userSnap = await transaction.get(userRef);
        if (!userSnap.exists) return;

        const amount = Number(Number(currentReleaseData.amount || 0).toFixed(2));
        if (amount <= 0) return;

        const isReferral = currentReleaseData.type === "referral_commission";

        const updates = {
          availableBalance: FieldValue.increment(amount),
          balance: FieldValue.increment(amount),
          updatedAt: FieldValue.serverTimestamp()
        };

        if (isReferral) {
          updates.referralEarningsPending = FieldValue.increment(-amount);
          updates.referralEarningsAvailable = FieldValue.increment(amount);
          updates.referralEarnings = FieldValue.increment(amount);
        } else {
          updates.pendingEarnings = FieldValue.increment(-amount);
          updates.totalEarned = FieldValue.increment(amount);
        }

        transaction.update(userRef, updates);
        transaction.update(releaseDoc.ref, {
          status: "released",
          releasedAt: Timestamp.now()
        });

        const txRef = db.collection(Collections.TRANSACTIONS).doc();
        transaction.set(txRef, {
          userId: normalizedUserId,
          type: isReferral ? "referral_released" : "earning_released",
          amount,
          status: "completed",
          description: isReferral
            ? "تحرير عمولة إحالة بعد 24 ساعة"
            : "تحرير أرباح ناشر بعد 24 ساعة",
          createdAt: Timestamp.now()
        });

        releasedCount++;
        totalReleasedAmount = Number((totalReleasedAmount + amount).toFixed(2));
      });
    }

    return { releasedCount, releasedAmount: totalReleasedAmount };
  } catch (error) {
    console.error("[Firestore process24HourReleases Error]:", error);
    throw new Error(`24h release processing failed: ${error.message}`);
  }
}

export async function recordPublisherEarningWithReferral(publisherId, grossAmount, campaignId) {
  try {
    const normalizedPublisherId = String(publisherId || "").trim();
    if (!normalizedPublisherId) {
      throw new Error("Publisher ID is required");
    }

    const amount = sanitizePositiveAmount(grossAmount, "earning amount");
    const releaseAt = Timestamp.fromMillis(Date.now() + WALLET_CONSTANTS.RELEASE_DELAY_MS);
    const publisherRef = db.collection(Collections.USERS).doc(normalizedPublisherId);
    const publisherSnap = await publisherRef.get();

    if (!publisherSnap.exists) {
      throw new Error("Publisher not found");
    }

    const publisherData = publisherSnap.data() || {};
    const referrerId = publisherData.referredBy ? String(publisherData.referredBy) : null;

    await db.runTransaction(async (transaction) => {
      transaction.update(publisherRef, {
        pendingEarnings: FieldValue.increment(amount),
        updatedAt: FieldValue.serverTimestamp()
      });

      const pubReleaseRef = db.collection(Collections.PENDING_RELEASES).doc();
      transaction.set(pubReleaseRef, {
        userId: normalizedPublisherId,
        type: "publisher_earning",
        amount,
        campaignId: campaignId || null,
        status: "pending",
        createdAt: Timestamp.now(),
        releaseAt
      });

      const pubTxRef = db.collection(Collections.TRANSACTIONS).doc();
      transaction.set(pubTxRef, {
        userId: normalizedPublisherId,
        type: "earning_pending",
        amount,
        status: "pending_24h",
        description: "أرباح نشر إعلان (تُحرر خلال 24 ساعة)",
        createdAt: Timestamp.now()
      });

      // عمولة الإحالة 10% تُحتسب فقط على أرباح المدعوين الناشرين ولا تُحتسب على الإيداع
      if (referrerId && referrerId !== normalizedPublisherId) {
        const commission = Number((amount * WALLET_CONSTANTS.REFERRAL_COMMISSION_RATE).toFixed(2));
        if (commission > 0) {
          const referrerRef = db.collection(Collections.USERS).doc(referrerId);
          const referrerSnap = await transaction.get(referrerRef);

          if (referrerSnap.exists) {
            transaction.update(referrerRef, {
              referralEarningsPending: FieldValue.increment(commission),
              updatedAt: FieldValue.serverTimestamp()
            });

            const refReleaseRef = db.collection(Collections.PENDING_RELEASES).doc();
            transaction.set(refReleaseRef, {
              userId: referrerId,
              fromUserId: normalizedPublisherId,
              type: "referral_commission",
              amount: commission,
              campaignId: campaignId || null,
              status: "pending",
              createdAt: Timestamp.now(),
              releaseAt
            });

            const refLogRef = db.collection(Collections.REFERRALS).doc();
            transaction.set(refLogRef, {
              referrerId,
              referredUserId: normalizedPublisherId,
              publisherEarning: amount,
              commissionAmount: commission,
              status: "pending_24h",
              releaseAt,
              createdAt: Timestamp.now()
            });

            const refTxRef = db.collection(Collections.TRANSACTIONS).doc();
            transaction.set(refTxRef, {
              userId: referrerId,
              type: "referral_pending",
              amount: commission,
              status: "pending_24h",
              description: `عمولة إحالة 10% من أرباح الناشر ${normalizedPublisherId} (تُحرر خلال 24 ساعة)`,
              createdAt: Timestamp.now()
            });
          }
        }
      }
    });

    return { success: true, amount, releaseAt: releaseAt.toDate() };
  } catch (error) {
    console.error("[Firestore recordPublisherEarningWithReferral Error]:", error);
    throw new Error(`Earning recording failed: ${error.message}`);
  }
}

export async function settleCampaignBudgetAtomically(campaignId) {
  try {
    const normalizedCampaignId = String(campaignId || "").trim();
    if (!normalizedCampaignId) {
      throw new Error("Campaign ID is required");
    }

    const campaignRef = db.collection(Collections.CAMPAIGNS).doc(normalizedCampaignId);

    const result = await db.runTransaction(async (transaction) => {
      const campaignSnap = await transaction.get(campaignRef);
      if (!campaignSnap.exists) {
        throw new Error("الحملة غير موجودة");
      }

      const campaign = campaignSnap.data() || {};
      if (campaign.status === "settled" || campaign.isSettled === true) {
        throw new Error("تمت تسوية ميزانية هذه الحملة مسبقاً");
      }

      const totalBudget = Number(campaign.totalBudget || 0);
      const spentBudget = Number(campaign.spentBudget || 0);
      const remainingBudget = Number(Math.max(0, totalBudget - spentBudget).toFixed(2));

      const advertiserId = String(campaign.advertiserId || "").trim();
      if (!advertiserId) {
        throw new Error("معرف المعلن غير موجود");
      }

      const advertiserRef = db.collection(Collections.USERS).doc(advertiserId);
      const advertiserSnap = await transaction.get(advertiserRef);
      if (!advertiserSnap.exists) {
        throw new Error("حساب المعلن غير موجود");
      }

      transaction.update(campaignRef, {
        status: "settled",
        isSettled: true,
        remainingRefunded: remainingBudget,
        settledAt: Timestamp.now(),
        updatedAt: FieldValue.serverTimestamp()
      });

      if (remainingBudget > 0) {
        transaction.update(advertiserRef, {
          availableBalance: FieldValue.increment(remainingBudget),
          balance: FieldValue.increment(remainingBudget),
          totalSpent: FieldValue.increment(-remainingBudget),
          updatedAt: FieldValue.serverTimestamp()
        });

        const txRef = db.collection(Collections.TRANSACTIONS).doc();
        transaction.set(txRef, {
          userId: advertiserId,
          type: "campaign_refund",
          amount: remainingBudget,
          status: "completed",
          description: `تسوية آلية: استرداد الميزانية المتبقية من الحملة (${campaign.title || normalizedCampaignId})`,
          createdAt: Timestamp.now()
        });
      }

      return {
        campaignId: normalizedCampaignId,
        advertiserId,
        totalBudget,
        spentBudget,
        refundedAmount: remainingBudget
      };
    });

    return result;
  } catch (error) {
    console.error("[Firestore settleCampaignBudgetAtomically Error]:", error);
    throw new Error(`Atomic settlement failed: ${error.message}`);
  }
}

export async function updateUserTrc20Address(userId, trc20Address) {
  try {
    const normalizedUserId = String(userId || "").trim();
    if (!normalizedUserId) {
      throw new Error("User ID is required");
    }

    const cleanAddress = String(trc20Address || "").trim();
    if (!cleanAddress || cleanAddress.length < 20) {
      throw new Error("عنوان USDT - TRC20 غير صالح");
    }

    const userRef = db.collection(Collections.USERS).doc(normalizedUserId);
    const snap = await userRef.get();
    if (!snap.exists) {
      throw new Error("المستخدم غير موجود");
    }

    await userRef.update({
      trc20Address: cleanAddress,
      updatedAt: FieldValue.serverTimestamp()
    });

    return { userId: normalizedUserId, trc20Address: cleanAddress };
  } catch (error) {
    console.error("[Firestore updateUserTrc20Address Error]:", error);
    throw error;
  }
}

export async function createDepositRequest(userId, amountInput, txidInput) {
  try {
    const normalizedUserId = String(userId || "").trim();
    if (!normalizedUserId) {
      throw new Error("User ID is required");
    }

    const amount = sanitizePositiveAmount(amountInput, "deposit amount");
    if (amount < WALLET_CONSTANTS.MIN_DEPOSIT) {
      throw new Error(`الحد الأدنى للإيداع هو $${WALLET_CONSTANTS.MIN_DEPOSIT.toFixed(2)}`);
    }

    const txid = String(txidInput || "").trim();
    if (!txid || txid.length < 8) {
      throw new Error("يرجى إدخال معرف المعاملة (TXID) بشكل صحيح");
    }

    const depositRef = db.collection(Collections.DEPOSITS).doc();
    const txRef = db.collection(Collections.TRANSACTIONS).doc();
    const now = Timestamp.now();

    // لا يتم احتساب أي عمولة إحالة عند الإيداع أو شحن الرصيد
    await db.runTransaction(async (transaction) => {
      const userRef = db.collection(Collections.USERS).doc(normalizedUserId);
      const userSnap = await transaction.get(userRef);
      if (!userSnap.exists) {
        throw new Error("المستخدم غير موجود");
      }

      transaction.set(depositRef, {
        depositId: depositRef.id,
        userId: normalizedUserId,
        amount,
        network: WALLET_CONSTANTS.DEPOSIT_NETWORK,
        depositAddress: WALLET_CONSTANTS.DEPOSIT_ADDRESS,
        txid,
        status: "pending_review",
        createdAt: now,
        reviewedAt: null,
        reviewedBy: null,
        adminNote: ""
      });

      transaction.set(txRef, {
        userId: normalizedUserId,
        type: "deposit_pending",
        amount,
        network: WALLET_CONSTANTS.DEPOSIT_NETWORK,
        txid,
        status: "pending_review",
        description: `طلب إيداع (${WALLET_CONSTANTS.DEPOSIT_NETWORK}) - TXID: ${txid}`,
        createdAt: now
      });
    });

    return {
      depositId: depositRef.id,
      userId: normalizedUserId,
      amount,
      network: WALLET_CONSTANTS.DEPOSIT_NETWORK,
      txid,
      status: "pending_review"
    };
  } catch (error) {
    console.error("[Firestore createDepositRequest Error]:", error);
    throw error;
  }
}

export async function reviewDepositRequest(depositId, decision, adminId = "admin", adminNote = "") {
  try {
    const normalizedDepositId = String(depositId || "").trim();
    if (!normalizedDepositId) {
      throw new Error("Deposit ID is required");
    }

    if (!["approve", "reject"].includes(decision)) {
      throw new Error("Invalid deposit review decision");
    }

    const depositRef = db.collection(Collections.DEPOSITS).doc(normalizedDepositId);

    return await db.runTransaction(async (transaction) => {
      const depositSnap = await transaction.get(depositRef);
      if (!depositSnap.exists) {
        throw new Error("طلب الإيداع غير موجود");
      }

      const deposit = depositSnap.data() || {};
      if (deposit.status !== "pending_review") {
        throw new Error("تمت مراجعة طلب الإيداع مسبقاً");
      }

      const userId = String(deposit.userId);
      const amount = sanitizePositiveAmount(deposit.amount, "deposit amount");
      const userRef = db.collection(Collections.USERS).doc(userId);
      const userSnap = await transaction.get(userRef);

      if (!userSnap.exists) {
        throw new Error("حساب المستخدم غير موجود");
      }

      const isApproved = decision === "approve";
      const nextStatus = isApproved ? "approved" : "rejected";
      const now = Timestamp.now();

      transaction.update(depositRef, {
        status: nextStatus,
        reviewedAt: now,
        reviewedBy: String(adminId || "admin"),
        adminNote: String(adminNote || "")
      });

      if (isApproved) {
        transaction.update(userRef, {
          availableBalance: FieldValue.increment(amount),
          balance: FieldValue.increment(amount),
          updatedAt: FieldValue.serverTimestamp()
        });
      }

      const txRef = db.collection(Collections.TRANSACTIONS).doc();
      transaction.set(txRef, {
        userId,
        type: isApproved ? "deposit_approved" : "deposit_rejected",
        amount,
        txid: deposit.txid || "",
        status: nextStatus,
        description: isApproved
          ? `تمت الموافقة على إيداع بقيمة $${amount.toFixed(2)} (${WALLET_CONSTANTS.DEPOSIT_NETWORK})`
          : `تم رفض طلب الإيداع بقيمة $${amount.toFixed(2)}${adminNote ? ` - ${adminNote}` : ""}`,
        createdAt: now
      });

      return {
        depositId: normalizedDepositId,
        userId,
        amount,
        status: nextStatus
      };
    });
  } catch (error) {
    console.error("[Firestore reviewDepositRequest Error]:", error);
    throw error;
  }
}

export async function createWithdrawalRequest(userId, amountInput, customTrc20Address = null) {
  try {
    const normalizedUserId = String(userId || "").trim();
    if (!normalizedUserId) {
      throw new Error("User ID is required");
    }

    const grossAmount = sanitizePositiveAmount(amountInput, "withdrawal amount");
    if (grossAmount < WALLET_CONSTANTS.MIN_WITHDRAWAL) {
      throw new Error(`الحد الأدنى للسحب هو $${WALLET_CONSTANTS.MIN_WITHDRAWAL.toFixed(2)}`);
    }

    const fee = WALLET_CONSTANTS.WITHDRAWAL_FEE;
    const netAmount = Number((grossAmount - fee).toFixed(2));
    if (netAmount <= 0) {
      throw new Error("المبلغ أقل من رسوم السحب");
    }

    const withdrawalRef = db.collection(Collections.WITHDRAWALS).doc();
    const txRef = db.collection(Collections.TRANSACTIONS).doc();
    const now = Timestamp.now();

    return await db.runTransaction(async (transaction) => {
      const userRef = db.collection(Collections.USERS).doc(normalizedUserId);
      const userSnap = await transaction.get(userRef);
      if (!userSnap.exists) {
        throw new Error("المستخدم غير موجود");
      }

      const userData = userSnap.data() || {};
      const address = String(customTrc20Address || userData.trc20Address || "").trim();
      if (!address || address.length < 20) {
        throw new Error("يرجى حفظ أو إدخال عنوان USDT - TRC20 صالح قبل السحب");
      }

      const currentAvailable = Number(
        userData.availableBalance !== undefined ? userData.availableBalance : (userData.balance || 0)
      );

      if (currentAvailable < grossAmount) {
        throw new Error("الرصيد المتاح غير كافٍ لإتمام عملية السحب");
      }

      transaction.update(userRef, {
        availableBalance: FieldValue.increment(-grossAmount),
        balance: FieldValue.increment(-grossAmount),
        trc20Address: address,
        updatedAt: FieldValue.serverTimestamp()
      });

      transaction.set(withdrawalRef, {
        withdrawalId: withdrawalRef.id,
        userId: normalizedUserId,
        grossAmount,
        fee,
        netAmount,
        network: WALLET_CONSTANTS.WITHDRAWAL_NETWORK,
        trc20Address: address,
        status: "pending_review",
        step: "submitted",
        createdAt: now,
        updatedAt: now,
        reviewedAt: null,
        reviewedBy: null,
        adminNote: ""
      });

      transaction.set(txRef, {
        userId: normalizedUserId,
        type: "withdrawal_pending",
        amount: grossAmount,
        fee,
        netAmount,
        network: WALLET_CONSTANTS.WITHDRAWAL_NETWORK,
        status: "pending_review",
        description: `طلب سحب $${grossAmount.toFixed(2)} (الصافي $${netAmount.toFixed(2)} - رسوم $${fee.toFixed(2)}) عبر ${WALLET_CONSTANTS.WITHDRAWAL_NETWORK}`,
        createdAt: now
      });

      return {
        withdrawalId: withdrawalRef.id,
        userId: normalizedUserId,
        grossAmount,
        fee,
        netAmount,
        network: WALLET_CONSTANTS.WITHDRAWAL_NETWORK,
        trc20Address: address,
        status: "pending_review",
        step: "submitted"
      };
    });
  } catch (error) {
    console.error("[Firestore createWithdrawalRequest Error]:", error);
    throw error;
  }
}

export async function reviewWithdrawalRequest(
  withdrawalId,
  decision,
  adminId = "admin",
  adminNote = "",
  stepOverride = null
) {
  try {
    const normalizedWithdrawalId = String(withdrawalId || "").trim();
    if (!normalizedWithdrawalId) {
      throw new Error("Withdrawal ID is required");
    }

    if (!["approve", "reject"].includes(decision)) {
      throw new Error("Invalid withdrawal review decision");
    }

    const withdrawalRef = db.collection(Collections.WITHDRAWALS).doc(normalizedWithdrawalId);

    return await db.runTransaction(async (transaction) => {
      const withdrawalSnap = await transaction.get(withdrawalRef);
      if (!withdrawalSnap.exists) {
        throw new Error("طلب السحب غير موجود");
      }

      const withdrawal = withdrawalSnap.data() || {};
      if (withdrawal.status !== "pending_review") {
        throw new Error("تمت مراجعة طلب السحب مسبقاً");
      }

      const userId = String(withdrawal.userId);
      const grossAmount = sanitizePositiveAmount(withdrawal.grossAmount, "withdrawal grossAmount");
      const userRef = db.collection(Collections.USERS).doc(userId);
      const userSnap = await transaction.get(userRef);

      if (!userSnap.exists) {
        throw new Error("حساب المستخدم غير موجود");
      }

      const isApproved = decision === "approve";
      const nextStatus = isApproved ? "completed" : "rejected";
      const nextStep = stepOverride || (isApproved ? "completed" : "rejected");
      const now = Timestamp.now();

      transaction.update(withdrawalRef, {
        status: nextStatus,
        step: nextStep,
        reviewedAt: now,
        updatedAt: now,
        reviewedBy: String(adminId || "admin"),
        adminNote: String(adminNote || "")
      });

      if (!isApproved) {
        transaction.update(userRef, {
          availableBalance: FieldValue.increment(grossAmount),
          balance: FieldValue.increment(grossAmount),
          updatedAt: FieldValue.serverTimestamp()
        });
      }

      const txRef = db.collection(Collections.TRANSACTIONS).doc();
      transaction.set(txRef, {
        userId,
        type: isApproved ? "withdrawal_completed" : "withdrawal_refunded",
        amount: grossAmount,
        network: withdrawal.network || WALLET_CONSTANTS.WITHDRAWAL_NETWORK,
        status: nextStatus,
        description: isApproved
          ? `تم تنفيذ السحب بقيمة $${grossAmount.toFixed(2)} عبر ${WALLET_CONSTANTS.WITHDRAWAL_NETWORK}`
          : `تم رفض السحب وإعادة $${grossAmount.toFixed(2)} إلى الرصيد المتاح${adminNote ? ` - ${adminNote}` : ""}`,
        createdAt: now
      });

      return {
        withdrawalId: normalizedWithdrawalId,
        userId,
        grossAmount,
        status: nextStatus,
        step: nextStep
      };
    });
  } catch (error) {
    console.error("[Firestore reviewWithdrawalRequest Error]:", error);
    throw error;
  }
}

export async function getWalletSnapshot(userId) {
  try {
    const normalizedUserId = String(userId || "").trim();
    if (!normalizedUserId) {
      throw new Error("User ID is required");
    }

    await process24HourReleases(normalizedUserId);

    const userRef = db.collection(Collections.USERS).doc(normalizedUserId);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      throw new Error("المستخدم غير موجود");
    }

    const userData = userSnap.data() || {};
    const txQuery = await db
      .collection(Collections.TRANSACTIONS)
      .where("userId", "==", normalizedUserId)
      .orderBy("createdAt", "desc")
      .limit(WALLET_CONSTANTS.RECENT_TRANSACTIONS_LIMIT)
      .get();

    const recentTransactions = txQuery.docs.map((doc) => ({
      id: doc.id,
      ...doc.data()
    }));

    return {
      userId: normalizedUserId,
      availableBalance: Number(
        userData.availableBalance !== undefined ? userData.availableBalance : (userData.balance || 0)
      ),
      pendingEarnings: Number(userData.pendingEarnings || 0),
      totalSpent: Number(userData.totalSpent || 0),
      totalEarned: Number(userData.totalEarned || 0),
      referralEarningsAvailable: Number(userData.referralEarningsAvailable || 0),
      referralEarningsPending: Number(userData.referralEarningsPending || 0),
      trc20Address: userData.trc20Address || "",
      referralCode: userData.referralCode || "",
      referredBy: userData.referredBy || null,
      referralsCount: Number(userData.referralsCount || 0),
      constants: WALLET_CONSTANTS,
      recentTransactions
    };
  } catch (error) {
    console.error("[Firestore getWalletSnapshot Error]:", error);
    throw error;
  }
}

export async function getAdminFinanceLedger(limitCount = 50) {
  try {
    const safeLimit = Math.max(1, Math.min(200, Number(limitCount) || 50));

    const [depositsSnap, withdrawalsSnap] = await Promise.all([
      db.collection(Collections.DEPOSITS).orderBy("createdAt", "desc").limit(safeLimit).get(),
      db.collection(Collections.WITHDRAWALS).orderBy("createdAt", "desc").limit(safeLimit).get()
    ]);

    const deposits = depositsSnap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data()
    }));

    const withdrawals = withdrawalsSnap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data()
    }));

    return { deposits, withdrawals };
  } catch (error) {
    console.error("[Firestore getAdminFinanceLedger Error]:", error);
    throw error;
  }
}

export async function logSecurityEvent(eventType, details) {
  try {
    await db.collection(Collections.AUDIT_LOGS).add({
      eventType,
      details,
      timestamp: FieldValue.serverTimestamp()
    });
  } catch (error) {
    console.error("[Audit Log Error]:", error);
  }
}
