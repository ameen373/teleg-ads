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

export const COLLECTIONS = Collections;

export const WALLET_CONSTANTS = {
  MIN_WITHDRAWAL: 30.0,
  WITHDRAWAL_FEE: 3.0,
  WITHDRAWAL_NETWORK: "USDT - TRC20",
  MIN_DEPOSIT: 10.0,
  DEPOSIT_NETWORK: "USDT - BEP20",
  DEPOSIT_ADDRESS: "0xf9278f55585a0e6e35f12299493134056f2f19b0",
  REFERRAL_COMMISSION_RATE: 0.1,
  RELEASE_DELAY_MS: 24 * 60 * 60 * 1000
};

function roundMoney(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Number(num.toFixed(2));
}

function isValidTrc20Address(address) {
  if (typeof address !== "string") return false;
  const trimmed = address.trim();
  return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(trimmed);
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

export async function upsertTelegramUser(tgUser) {
  try {
    const userId = String(tgUser.id);
    const userRef = db.collection(Collections.USERS).doc(userId);
    const snapshot = await userRef.get();
    const now = FieldValue.serverTimestamp();

    const basePayload = {
      telegramId: userId,
      username: tgUser.username || "",
      firstName: tgUser.first_name || "",
      lastName: tgUser.last_name || "",
      languageCode: tgUser.language_code || "en",
      updatedAt: now
    };

    if (!snapshot.exists) {
      const generatedCode =
        "REF-" +
        userId.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) +
        Math.floor(100 + Math.random() * 900);

      const initialData = {
        ...basePayload,
        userId,
        balance: 0,
        availableBalance: 0.0,
        pendingEarnings: 0.0,
        totalSpent: 0.0,
        totalEarned: 0.0,
        referralEarnings: 0,
        referralEarningsAvailable: 0.0,
        referralEarningsPending: 0.0,
        trc20Address: "",
        referralCode: generatedCode,
        referredBy: null,
        referralsCount: 0,
        isAdmin: userId === (process.env.ADMIN_USER_ID || "admin_1"),
        createdAt: now
      };

      await userRef.set(initialData);
      return { ...initialData, ...basePayload };
    }

    const existing = snapshot.data() || {};
    const patch = { ...basePayload };

    if (!existing.userId) patch.userId = userId;
    if (typeof existing.availableBalance !== "number") {
      patch.availableBalance = roundMoney(existing.balance || 0);
    }
    if (typeof existing.balance !== "number") {
      patch.balance = roundMoney(existing.availableBalance || 0);
    }
    if (typeof existing.pendingEarnings !== "number") patch.pendingEarnings = 0.0;
    if (typeof existing.totalSpent !== "number") patch.totalSpent = 0.0;
    if (typeof existing.totalEarned !== "number") patch.totalEarned = 0.0;
    if (typeof existing.referralEarningsAvailable !== "number") {
      patch.referralEarningsAvailable = roundMoney(existing.referralEarnings || 0);
    }
    if (typeof existing.referralEarnings !== "number") {
      patch.referralEarnings = roundMoney(existing.referralEarningsAvailable || 0);
    }
    if (typeof existing.referralEarningsPending !== "number") {
      patch.referralEarningsPending = 0.0;
    }
    if (typeof existing.trc20Address !== "string") patch.trc20Address = "";
    if (!existing.referralCode) {
      patch.referralCode =
        "REF-" +
        userId.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) +
        Math.floor(100 + Math.random() * 900);
    }
    if (!("referredBy" in existing)) patch.referredBy = null;
    if (typeof existing.referralsCount !== "number") patch.referralsCount = 0;
    if (typeof existing.isAdmin !== "boolean") {
      patch.isAdmin = userId === (process.env.ADMIN_USER_ID || "admin_1");
    }

    await userRef.update(patch);
    return { ...existing, ...patch };
  } catch (error) {
    console.error("[Firestore upsertTelegramUser Error]:", error);
    throw error;
  }
}

export async function ensureUserDocument(userId, referralCodeInput = null) {
  try {
    const normalizedId = String(userId);
    const userRef = db.collection(Collections.USERS).doc(normalizedId);
    const doc = await userRef.get();

    if (!doc.exists) {
      const generatedCode =
        "REF-" +
        normalizedId.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) +
        Math.floor(100 + Math.random() * 900);
      let validReferrerId = null;

      if (referralCodeInput && typeof referralCodeInput === "string") {
        const refQuery = await db
          .collection(Collections.USERS)
          .where("referralCode", "==", referralCodeInput.trim())
          .limit(1)
          .get();
        if (!refQuery.empty && refQuery.docs[0].id !== normalizedId) {
          validReferrerId = refQuery.docs[0].id;
        }
      }

      const initialData = {
        userId: normalizedId,
        telegramId: normalizedId,
        username: "",
        firstName: "",
        lastName: "",
        languageCode: "en",
        balance: 0.0,
        availableBalance: 0.0,
        pendingEarnings: 0.0,
        totalSpent: 0.0,
        totalEarned: 0.0,
        referralEarnings: 0.0,
        referralEarningsAvailable: 0.0,
        referralEarningsPending: 0.0,
        trc20Address: "",
        referralCode: generatedCode,
        referredBy: validReferrerId,
        referralsCount: 0,
        isAdmin: normalizedId === (process.env.ADMIN_USER_ID || "admin_1"),
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
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

    const existing = doc.data() || {};
    const updates = {};
    if (!existing.userId) updates.userId = normalizedId;
    if (typeof existing.availableBalance !== "number") {
      updates.availableBalance = roundMoney(existing.balance || 0);
    }
    if (typeof existing.balance !== "number") {
      updates.balance = roundMoney(existing.availableBalance || 0);
    }
    if (typeof existing.pendingEarnings !== "number") updates.pendingEarnings = 0.0;
    if (typeof existing.totalSpent !== "number") updates.totalSpent = 0.0;
    if (typeof existing.totalEarned !== "number") updates.totalEarned = 0.0;
    if (typeof existing.referralEarningsAvailable !== "number") {
      updates.referralEarningsAvailable = roundMoney(existing.referralEarnings || 0);
    }
    if (typeof existing.referralEarnings !== "number") {
      updates.referralEarnings = roundMoney(existing.referralEarningsAvailable || 0);
    }
    if (typeof existing.referralEarningsPending !== "number") {
      updates.referralEarningsPending = 0.0;
    }
    if (typeof existing.trc20Address !== "string") updates.trc20Address = "";
    if (!existing.referralCode) {
      updates.referralCode =
        "REF-" +
        normalizedId.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) +
        Math.floor(100 + Math.random() * 900);
    }
    if (!("referredBy" in existing)) updates.referredBy = null;
    if (typeof existing.referralsCount !== "number") updates.referralsCount = 0;
    if (typeof existing.isAdmin !== "boolean") {
      updates.isAdmin = normalizedId === (process.env.ADMIN_USER_ID || "admin_1");
    }

    if (Object.keys(updates).length > 0) {
      updates.updatedAt = FieldValue.serverTimestamp();
      await userRef.update(updates);
    }

    return { ...existing, ...updates };
  } catch (error) {
    console.error("[Firestore ensureUserDocument Error]:", error);
    throw new Error(`Database user initialization error: ${error.message}`);
  }
}

export async function process24HourReleases(userId) {
  try {
    const normalizedId = String(userId);
    const now = Timestamp.now();
    const pendingQuery = await db
      .collection(Collections.PENDING_RELEASES)
      .where("userId", "==", normalizedId)
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

        const userRef = db.collection(Collections.USERS).doc(normalizedId);
        const userSnap = await transaction.get(userRef);
        if (!userSnap.exists) return;

        const amount = roundMoney(releaseData.amount);
        if (amount <= 0) return;

        const isReferral = releaseData.type === "referral_commission";

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
          userId: normalizedId,
          type: isReferral ? "referral_released" : "earning_released",
          amount,
          status: "completed",
          description: isReferral
            ? "تحرير عمولة إحالة بعد 24 ساعة"
            : "تحرير أرباح ناشر بعد 24 ساعة",
          createdAt: Timestamp.now()
        });

        releasedCount++;
        totalReleasedAmount = roundMoney(totalReleasedAmount + amount);
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
    const normalizedPublisherId = String(publisherId);
    const amount = roundMoney(grossAmount);
    if (amount <= 0) throw new Error("Invalid earning amount");

    const releaseAt = Timestamp.fromMillis(Date.now() + WALLET_CONSTANTS.RELEASE_DELAY_MS);
    const publisherRef = db.collection(Collections.USERS).doc(normalizedPublisherId);
    const publisherSnap = await publisherRef.get();
    if (!publisherSnap.exists) throw new Error("Publisher not found");

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
        campaignId: campaignId || null,
        status: "pending_24h",
        description: "أرباح نشر إعلان (تُحرر خلال 24 ساعة)",
        createdAt: Timestamp.now()
      });

      if (referrerId && referrerId !== normalizedPublisherId) {
        const commission = roundMoney(amount * WALLET_CONSTANTS.REFERRAL_COMMISSION_RATE);
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
              campaignId: campaignId || null,
              status: "pending_24h",
              releaseAt,
              createdAt: Timestamp.now()
            });

            const refTxRef = db.collection(Collections.TRANSACTIONS).doc();
            transaction.set(refTxRef, {
              userId: referrerId,
              type: "referral_pending",
              amount: commission,
              fromUserId: normalizedPublisherId,
              campaignId: campaignId || null,
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
    const campaignRef = db.collection(Collections.CAMPAIGNS).doc(String(campaignId));

    const result = await db.runTransaction(async (transaction) => {
      const campaignSnap = await transaction.get(campaignRef);
      if (!campaignSnap.exists) {
        throw new Error("الحملة غير موجودة");
      }

      const campaign = campaignSnap.data() || {};
      if (campaign.status === "settled" || campaign.isSettled === true) {
        throw new Error("تمت تسوية ميزانية هذه الحملة مسبقاً");
      }

      const totalBudget = roundMoney(campaign.totalBudget || 0);
      const spentBudget = roundMoney(campaign.spentBudget || 0);
      const remainingBudget = roundMoney(Math.max(0, totalBudget - spentBudget));

      const advertiserId = String(campaign.advertiserId);
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
          campaignId: String(campaignId),
          status: "completed",
          description: `تسوية آلية: استرداد الميزانية المتبقية من الحملة (${campaign.title || campaignId})`,
          createdAt: Timestamp.now()
        });
      }

      return {
        campaignId: String(campaignId),
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

export async function getWalletSummary(userId) {
  try {
    const normalizedId = String(userId);
    await ensureUserDocument(normalizedId);
    await process24HourReleases(normalizedId);

    const userSnap = await db.collection(Collections.USERS).doc(normalizedId).get();
    if (!userSnap.exists) {
      throw new Error("حساب المستخدم غير موجود");
    }

    const userData = userSnap.data() || {};
    const availableBalance = roundMoney(
      typeof userData.availableBalance === "number"
        ? userData.availableBalance
        : userData.balance || 0
    );
    const pendingEarnings = roundMoney(userData.pendingEarnings || 0);
    const referralEarningsAvailable = roundMoney(
      typeof userData.referralEarningsAvailable === "number"
        ? userData.referralEarningsAvailable
        : userData.referralEarnings || 0
    );
    const referralEarningsPending = roundMoney(userData.referralEarningsPending || 0);
    const totalEarned = roundMoney(userData.totalEarned || 0);
    const totalSpent = roundMoney(userData.totalSpent || 0);

    return {
      userId: normalizedId,
      availableBalance,
      pendingEarnings,
      referralEarningsAvailable,
      referralEarningsPending,
      totalEarned,
      totalSpent,
      trc20Address: userData.trc20Address || "",
      referralCode: userData.referralCode || "",
      referralsCount: Number(userData.referralsCount || 0),
      walletConfig: {
        minWithdrawal: WALLET_CONSTANTS.MIN_WITHDRAWAL,
        withdrawalFee: WALLET_CONSTANTS.WITHDRAWAL_FEE,
        withdrawalNetwork: WALLET_CONSTANTS.WITHDRAWAL_NETWORK,
        minDeposit: WALLET_CONSTANTS.MIN_DEPOSIT,
        depositNetwork: WALLET_CONSTANTS.DEPOSIT_NETWORK,
        depositAddress: WALLET_CONSTANTS.DEPOSIT_ADDRESS,
        referralCommissionRate: WALLET_CONSTANTS.REFERRAL_COMMISSION_RATE
      }
    };
  } catch (error) {
    console.error("[Firestore getWalletSummary Error]:", error);
    throw new Error(`تعذر جلب ملخص المحفظة: ${error.message}`);
  }
}

export async function updateUserTrc20Address(userId, trc20Address) {
  try {
    const normalizedId = String(userId);
    const cleanedAddress = typeof trc20Address === "string" ? trc20Address.trim() : "";

    if (!isValidTrc20Address(cleanedAddress)) {
      throw new Error("عنوان محفظة USDT - TRC20 غير صالح");
    }

    await ensureUserDocument(normalizedId);
    const userRef = db.collection(Collections.USERS).doc(normalizedId);

    await userRef.update({
      trc20Address: cleanedAddress,
      updatedAt: FieldValue.serverTimestamp()
    });

    await logSecurityEvent("TRC20_ADDRESS_UPDATED", {
      userId: normalizedId,
      trc20Address: cleanedAddress
    });

    return {
      success: true,
      userId: normalizedId,
      trc20Address: cleanedAddress,
      network: WALLET_CONSTANTS.WITHDRAWAL_NETWORK
    };
  } catch (error) {
    console.error("[Firestore updateUserTrc20Address Error]:", error);
    throw new Error(`تعذر تحديث عنوان السحب: ${error.message}`);
  }
}

export async function recordDepositRequest(userId, amount, txHash = "") {
  try {
    const normalizedId = String(userId);
    const depositAmount = roundMoney(amount);

    if (depositAmount < WALLET_CONSTANTS.MIN_DEPOSIT) {
      throw new Error(
        `الحد الأدنى للإيداع هو ${WALLET_CONSTANTS.MIN_DEPOSIT.toFixed(2)} USDT عبر شبكة ${WALLET_CONSTANTS.DEPOSIT_NETWORK}`
      );
    }

    await ensureUserDocument(normalizedId);

    const cleanHash = typeof txHash === "string" ? txHash.trim() : "";
    const depositRef = db.collection(Collections.DEPOSITS).doc();
    const txRef = db.collection(Collections.TRANSACTIONS).doc();
    const now = Timestamp.now();

    const depositRecord = {
      depositId: depositRef.id,
      userId: normalizedId,
      amount: depositAmount,
      network: WALLET_CONSTANTS.DEPOSIT_NETWORK,
      depositAddress: WALLET_CONSTANTS.DEPOSIT_ADDRESS,
      txHash: cleanHash,
      status: "pending",
      createdAt: now
    };

    await db.runTransaction(async (transaction) => {
      transaction.set(depositRef, depositRecord);
      transaction.set(txRef, {
        userId: normalizedId,
        type: "deposit_request",
        amount: depositAmount,
        network: WALLET_CONSTANTS.DEPOSIT_NETWORK,
        depositId: depositRef.id,
        txHash: cleanHash,
        status: "pending",
        description: `طلب إيداع ${depositAmount.toFixed(2)} USDT عبر ${WALLET_CONSTANTS.DEPOSIT_NETWORK}`,
        createdAt: now
      });
    });

    await logSecurityEvent("DEPOSIT_REQUEST_CREATED", {
      userId: normalizedId,
      depositId: depositRef.id,
      amount: depositAmount,
      network: WALLET_CONSTANTS.DEPOSIT_NETWORK
    });

    return {
      success: true,
      deposit: depositRecord
    };
  } catch (error) {
    console.error("[Firestore recordDepositRequest Error]:", error);
    throw new Error(`تعذر تسجيل طلب الإيداع: ${error.message}`);
  }
}

export async function confirmDepositAtomically(depositId, adminId = null) {
  try {
    const depositRef = db.collection(Collections.DEPOSITS).doc(String(depositId));

    const result = await db.runTransaction(async (transaction) => {
      const depositSnap = await transaction.get(depositRef);
      if (!depositSnap.exists) {
        throw new Error("طلب الإيداع غير موجود");
      }

      const deposit = depositSnap.data() || {};
      if (deposit.status === "completed" || deposit.status === "approved") {
        throw new Error("تم تأكيد طلب الإيداع مسبقاً");
      }

      const userId = String(deposit.userId);
      const amount = roundMoney(deposit.amount);
      if (amount <= 0) {
        throw new Error("قيمة الإيداع غير صالحة");
      }

      const userRef = db.collection(Collections.USERS).doc(userId);
      const userSnap = await transaction.get(userRef);
      if (!userSnap.exists) {
        throw new Error("حساب المستخدم غير موجود");
      }

      const now = Timestamp.now();

      transaction.update(depositRef, {
        status: "completed",
        confirmedBy: adminId ? String(adminId) : null,
        confirmedAt: now
      });

      transaction.update(userRef, {
        availableBalance: FieldValue.increment(amount),
        balance: FieldValue.increment(amount),
        updatedAt: FieldValue.serverTimestamp()
      });

      const txRef = db.collection(Collections.TRANSACTIONS).doc();
      transaction.set(txRef, {
        userId,
        type: "deposit_completed",
        amount,
        network: deposit.network || WALLET_CONSTANTS.DEPOSIT_NETWORK,
        depositId: depositRef.id,
        status: "completed",
        description: `تأكيد إيداع ${amount.toFixed(2)} USDT عبر ${deposit.network || WALLET_CONSTANTS.DEPOSIT_NETWORK}`,
        createdAt: now
      });

      return {
        depositId: depositRef.id,
        userId,
        amount,
        status: "completed"
      };
    });

    await logSecurityEvent("DEPOSIT_CONFIRMED", {
      ...result,
      adminId: adminId ? String(adminId) : null
    });

    return result;
  } catch (error) {
    console.error("[Firestore confirmDepositAtomically Error]:", error);
    throw new Error(`تعذر تأكيد الإيداع: ${error.message}`);
  }
}

export async function requestWithdrawalAtomically(userId, amount, trc20AddressInput = null) {
  try {
    const normalizedId = String(userId);
    const requestedAmount = roundMoney(amount);

    if (requestedAmount < WALLET_CONSTANTS.MIN_WITHDRAWAL) {
      throw new Error(
        `الحد الأدنى للسحب هو ${WALLET_CONSTANTS.MIN_WITHDRAWAL.toFixed(2)} USDT`
      );
    }

    const fee = roundMoney(WALLET_CONSTANTS.WITHDRAWAL_FEE);
    if (requestedAmount <= fee) {
      throw new Error(
        `مبلغ السحب يجب أن يكون أكبر من رسوم الشبكة (${fee.toFixed(2)} USDT)`
      );
    }

    const netAmount = roundMoney(requestedAmount - fee);

    await ensureUserDocument(normalizedId);
    await process24HourReleases(normalizedId);

    const userRef = db.collection(Collections.USERS).doc(normalizedId);
    const withdrawalRef = db.collection(Collections.WITHDRAWALS).doc();
    const txRef = db.collection(Collections.TRANSACTIONS).doc();

    const result = await db.runTransaction(async (transaction) => {
      const userSnap = await transaction.get(userRef);
      if (!userSnap.exists) {
        throw new Error("حساب المستخدم غير موجود");
      }

      const userData = userSnap.data() || {};
      const targetAddress =
        typeof trc20AddressInput === "string" && trc20AddressInput.trim()
          ? trc20AddressInput.trim()
          : (userData.trc20Address || "").trim();

      if (!isValidTrc20Address(targetAddress)) {
        throw new Error(
          `يرجى تحديد عنوان محفظة صالح على شبكة ${WALLET_CONSTANTS.WITHDRAWAL_NETWORK}`
        );
      }

      const currentAvailable = roundMoney(
        typeof userData.availableBalance === "number"
          ? userData.availableBalance
          : userData.balance || 0
      );

      if (currentAvailable < requestedAmount) {
        throw new Error(
          `الرصيد المتاح غير كافٍ. المتاح: ${currentAvailable.toFixed(2)} USDT`
        );
      }

      const now = Timestamp.now();

      transaction.update(userRef, {
        availableBalance: FieldValue.increment(-requestedAmount),
        balance: FieldValue.increment(-requestedAmount),
        trc20Address: targetAddress,
        updatedAt: FieldValue.serverTimestamp()
      });

      const withdrawalData = {
        withdrawalId: withdrawalRef.id,
        userId: normalizedId,
        requestedAmount,
        fee,
        netAmount,
        network: WALLET_CONSTANTS.WITHDRAWAL_NETWORK,
        trc20Address: targetAddress,
        status: "pending",
        createdAt: now
      };

      transaction.set(withdrawalRef, withdrawalData);

      transaction.set(txRef, {
        userId: normalizedId,
        type: "withdrawal_request",
        amount: requestedAmount,
        fee,
        netAmount,
        network: WALLET_CONSTANTS.WITHDRAWAL_NETWORK,
        trc20Address: targetAddress,
        withdrawalId: withdrawalRef.id,
        status: "pending",
        description: `طلب سحب ${requestedAmount.toFixed(2)} USDT (الصافي ${netAmount.toFixed(2)} USDT بعد رسوم ${fee.toFixed(2)} USDT) عبر ${WALLET_CONSTANTS.WITHDRAWAL_NETWORK}`,
        createdAt: now
      });

      return withdrawalData;
    });

    await logSecurityEvent("WITHDRAWAL_REQUEST_CREATED", {
      userId: normalizedId,
      withdrawalId: result.withdrawalId,
      requestedAmount: result.requestedAmount,
      fee: result.fee,
      netAmount: result.netAmount,
      network: result.network,
      trc20Address: result.trc20Address
    });

    return {
      success: true,
      withdrawal: result
    };
  } catch (error) {
    console.error("[Firestore requestWithdrawalAtomically Error]:", error);
    throw new Error(`تعذر إتمام طلب السحب: ${error.message}`);
  }
}

export async function getTransactionHistory(userId, limit = 20) {
  try {
    const normalizedId = String(userId);
    const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 100));

    const snapshot = await db
      .collection(Collections.TRANSACTIONS)
      .where("userId", "==", normalizedId)
      .orderBy("createdAt", "desc")
      .limit(safeLimit)
      .get();

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error("[Firestore getTransactionHistory Error]:", error);
    throw new Error(`تعذر جلب سجل العمليات: ${error.message}`);
  }
}

export const WalletModule = {
  constants: WALLET_CONSTANTS,
  collections: {
    transactions: Collections.TRANSACTIONS,
    deposits: Collections.DEPOSITS,
    withdrawals: Collections.WITHDRAWALS,
    referrals: Collections.REFERRALS,
    pendingReleases: Collections.PENDING_RELEASES
  },
  getSummary: getWalletSummary,
  setTrc20Address: updateUserTrc20Address,
  createDepositRequest: recordDepositRequest,
  confirmDeposit: confirmDepositAtomically,
  requestWithdrawal: requestWithdrawalAtomically,
  processReleases: process24HourReleases,
  recordEarningWithReferral: recordPublisherEarningWithReferral,
  settleCampaignBudget: settleCampaignBudgetAtomically,
  getTransactions: getTransactionHistory
};
