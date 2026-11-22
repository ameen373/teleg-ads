'use strict';

const admin = require('firebase-admin');

let dbInstance = null;

function formatPrivateKey(rawKey) {
  if (!rawKey) return '';
  let key = String(rawKey).trim();
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1);
  }
  return key.replace(/\\n/g, '\n');
}

function initFirebaseAdmin() {
  if (admin.apps.length > 0) {
    return admin.app();
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = formatPrivateKey(process.env.FIREBASE_PRIVATE_KEY);

  if (projectId && clientEmail && privateKey) {
    return admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
  }

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return admin.initializeApp({
      credential: admin.credential.applicationDefault(),
    });
  }

  return admin.initializeApp();
}

function initFirestore() {
  if (dbInstance) {
    return dbInstance;
  }

  initFirebaseAdmin();
  const firestore = admin.firestore();
  firestore.settings({ ignoreUndefinedProperties: true });
  dbInstance = firestore;
  return dbInstance;
}

function getDb() {
  return initFirestore();
}

const db = getDb();

const SUPPORTED_LANGUAGES = [
  { code: 'en', label: '🇬🇧 English' },
  { code: 'zh', label: '🇨🇳 Chinese' },
  { code: 'hi', label: '🇮🇳 Hindi' },
  { code: 'es', label: '🇪🇸 Spanish' },
  { code: 'ar', label: '🇸🇦 Arabic' },
  { code: 'fr', label: '🇫🇷 French' },
  { code: 'bn', label: '🇧🇩 Bengali' },
  { code: 'pt', label: '🇵🇹 Portuguese' },
  { code: 'id', label: '🇮🇩 Indonesian' },
  { code: 'ur', label: '🇵🇰 Urdu' },
  { code: 'ru', label: '🇷🇺 Russian' },
  { code: 'de', label: '🇩🇪 German' },
  { code: 'ja', label: '🇯🇵 Japanese' },
  { code: 'pcm', label: '🇳🇬 Nigerian Pidgin' },
  { code: 'mr', label: '🇮🇳 Marathi' },
  { code: 'vi', label: '🇻🇳 Vietnamese' },
  { code: 'te', label: '🇮🇳 Telugu' },
  { code: 'sw', label: '🇰🇪 Swahili' },
  { code: 'tr', label: '🇹🇷 Turkish' },
];

const SUPPORTED_CATEGORIES = [
  '🎬 الترفيه',
  '📰 الأخبار ووسائل الإعلام',
  '🍿 الأفلام والمسلسلات',
  '💄 الموضة والجمال',
  '🎮 الألعاب',
  '🎨 الفن والتصوير',
  '🪙 العملات المشفرة',
  '💻 التقنيات',
  '📚 التعليم',
  '🍳 الطبخ',
  '🩺 الصحة',
  '⚽ الرياضة',
  '🌐 أخرى',
];

const MIN_PRICE = 1;
const MAX_PRICE = 3;
const AUTO_APPROVE_SUBSCRIBERS_THRESHOLD = 1000;

const COLLECTIONS = {
  USERS: 'users',
  CHANNELS: 'channels',
  CAMPAIGNS: 'campaigns',
  CAMPAIGN_POSTS: 'campaign_posts',
  TRANSACTIONS: 'transactions',
  SECURITY_LOGS: 'security_logs',
  LEGACY_SECURITY_LOGS: 'securityLogs',
};

const collections = {
  users: db.collection(COLLECTIONS.USERS),
  channels: db.collection(COLLECTIONS.CHANNELS),
  campaigns: db.collection(COLLECTIONS.CAMPAIGNS),
  campaignPosts: db.collection(COLLECTIONS.CAMPAIGN_POSTS),
  transactions: db.collection(COLLECTIONS.TRANSACTIONS),
  securityLogs: db.collection(COLLECTIONS.SECURITY_LOGS),
  legacySecurityLogs: db.collection(COLLECTIONS.LEGACY_SECURITY_LOGS),
};

function logSecurityEvent(eventType, details = {}) {
  try {
    const database = getDb();
    const payload = {
      eventType,
      details,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const primaryWrite = database.collection(COLLECTIONS.SECURITY_LOGS).add(payload);
    database.collection(COLLECTIONS.LEGACY_SECURITY_LOGS).add(payload).catch(() => {});
    return primaryWrite;
  } catch (err) {
    console.error('[SECURITY_LOG_ERROR]', eventType, err.message);
    return Promise.resolve();
  }
}

async function recordTransaction(txData = {}) {
  try {
    const database = getDb();
    const ref = database.collection(COLLECTIONS.TRANSACTIONS).doc();
    const record = {
      transactionId: ref.id,
      userId: txData.userId ? String(txData.userId) : null,
      type: txData.type || 'adjustment',
      amount: Number(txData.amount || 0),
      balanceBefore: txData.balanceBefore !== undefined ? Number(txData.balanceBefore) : null,
      balanceAfter: txData.balanceAfter !== undefined ? Number(txData.balanceAfter) : null,
      meta: txData.meta || {},
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    await ref.set(record);
    return { id: ref.id, ...record };
  } catch (err) {
    console.error('[TRANSACTION_LOG_ERROR]', err.message);
    return null;
  }
}

async function getOrCreateUser(telegramUser, referralCode = null) {
  const database = getDb();
  const userId = String(telegramUser.id);
  const userRef = database.collection(COLLECTIONS.USERS).doc(userId);
  const doc = await userRef.get();

  const now = admin.firestore.FieldValue.serverTimestamp();
  const baseProfile = {
    telegramId: userId,
    username: telegramUser.username || '',
    firstName: telegramUser.first_name || '',
    lastName: telegramUser.last_name || '',
    languageCode: telegramUser.language_code || 'en',
    updatedAt: now,
  };

  if (!doc.exists) {
    let referredBy = null;
    if (referralCode && String(referralCode).trim() !== '') {
      const cleanRef = String(referralCode).trim();
      if (cleanRef !== userId) {
        const referrerDoc = await database.collection(COLLECTIONS.USERS).doc(cleanRef).get();
        if (referrerDoc.exists) {
          referredBy = cleanRef;
        }
      }
    }

    const newUser = {
      ...baseProfile,
      balance: 0,
      referralEarnings: 0,
      referralCount: 0,
      referredBy,
      createdAt: now,
    };

    await userRef.set(newUser);

    if (referredBy) {
      await database.collection(COLLECTIONS.USERS).doc(referredBy).update({
        referralCount: admin.firestore.FieldValue.increment(1),
        updatedAt: now,
      });
    }

    const created = await userRef.get();
    return { id: created.id, ...created.data(), isNewUser: true };
  }

  await userRef.set(baseProfile, { merge: true });
  const updated = await userRef.get();
  return { id: updated.id, ...updated.data(), isNewUser: false };
}

async function getUserById(userId) {
  const database = getDb();
  const doc = await database.collection(COLLECTIONS.USERS).doc(String(userId)).get();
  if (!doc.exists) {
    return null;
  }
  return { id: doc.id, ...doc.data() };
}

async function adjustUserBalance(userId, deltaAmount, txMeta = {}) {
  const database = getDb();
  const uid = String(userId);
  const userRef = database.collection(COLLECTIONS.USERS).doc(uid);

  let balanceBefore = 0;
  const nextBalance = await database.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists) {
      throw new Error('USER_NOT_FOUND');
    }
    const currentBalance = Number(snap.data().balance || 0);
    balanceBefore = currentBalance;
    const computedNext = Number((currentBalance + Number(deltaAmount)).toFixed(4));
    if (computedNext < 0) {
      throw new Error('INSUFFICIENT_BALANCE');
    }
    tx.update(userRef, {
      balance: computedNext,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return computedNext;
  });

  if (txMeta && txMeta.recordTx) {
    await recordTransaction({
      userId: uid,
      type: txMeta.type || (Number(deltaAmount) >= 0 ? 'credit' : 'debit'),
      amount: Number(deltaAmount),
      balanceBefore,
      balanceAfter: nextBalance,
      meta: txMeta.meta || {},
    });
  }

  return nextBalance;
}

async function upsertChannel(channelPayload) {
  const database = getDb();
  const chatId = String(channelPayload.chatId);
  const channelRef = database.collection(COLLECTIONS.CHANNELS).doc(chatId);
  const snap = await channelRef.get();
  const now = admin.firestore.FieldValue.serverTimestamp();

  const dataToSave = {
    chatId,
    ownerId: String(channelPayload.ownerId),
    title: channelPayload.title,
    username: channelPayload.username || '',
    inviteLink: channelPayload.inviteLink || '',
    subscribersCount: Number(channelPayload.subscribersCount || 0),
    price: Number(channelPayload.price),
    language: channelPayload.language,
    category: channelPayload.category,
    status: channelPayload.status,
    promoPostPublished: Boolean(channelPayload.promoPostPublished),
    promoMessageId: channelPayload.promoMessageId || null,
    botIsAdmin: Boolean(channelPayload.botIsAdmin),
    lastCheckedAt: now,
    updatedAt: now,
  };

  if (!snap.exists) {
    dataToSave.createdAt = now;
    await channelRef.set(dataToSave);
  } else {
    await channelRef.set(dataToSave, { merge: true });
  }

  const updatedSnap = await channelRef.get();
  return { id: updatedSnap.id, ...updatedSnap.data() };
}

async function syncChannelSmartMetadata(chatId, updates) {
  const database = getDb();
  const cid = String(chatId);
  const channelRef = database.collection(COLLECTIONS.CHANNELS).doc(cid);
  const snap = await channelRef.get();
  if (!snap.exists) {
    return null;
  }

  const patch = {
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    lastCheckedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (typeof updates.title === 'string' && updates.title.trim() !== '') {
    patch.title = updates.title.trim();
  }
  if (typeof updates.username === 'string') {
    patch.username = updates.username.trim();
  }
  if (typeof updates.subscribersCount === 'number' && !Number.isNaN(updates.subscribersCount)) {
    patch.subscribersCount = updates.subscribersCount;
  }
  if (typeof updates.botIsAdmin === 'boolean') {
    patch.botIsAdmin = updates.botIsAdmin;
    if (!updates.botIsAdmin) {
      patch.status = 'bot_removed';
    }
  }

  await channelRef.update(patch);
  const updated = await channelRef.get();
  return { id: updated.id, ...updated.data() };
}

async function getChannelsByOwner(ownerId) {
  const database = getDb();
  const snapshot = await database
    .collection(COLLECTIONS.CHANNELS)
    .where('ownerId', '==', String(ownerId))
    .get();

  const items = [];
  snapshot.forEach((doc) => {
    items.push({ id: doc.id, ...doc.data() });
  });
  return items;
}

async function getChannelById(chatId) {
  const database = getDb();
  const doc = await database.collection(COLLECTIONS.CHANNELS).doc(String(chatId)).get();
  if (!doc.exists) {
    return null;
  }
  return { id: doc.id, ...doc.data() };
}

async function getPendingAdminChannels() {
  const database = getDb();
  const snapshot = await database
    .collection(COLLECTIONS.CHANNELS)
    .where('status', '==', 'pending_admin')
    .get();

  const items = [];
  snapshot.forEach((doc) => {
    items.push({ id: doc.id, ...doc.data() });
  });
  return items;
}

async function getMatchingApprovedChannels(targeting) {
  const database = getDb();
  const snapshot = await database
    .collection(COLLECTIONS.CHANNELS)
    .where('status', '==', 'approved')
    .get();

  const openTargeting = Boolean(targeting && targeting.openTargeting);
  const minPrice = Number((targeting && targeting.minPrice) ?? MIN_PRICE);
  const maxPrice = Number((targeting && targeting.maxPrice) ?? MAX_PRICE);
  const language = (targeting && targeting.language) || null;
  const category = (targeting && targeting.category) || null;

  const matched = [];
  snapshot.forEach((doc) => {
    const ch = { id: doc.id, ...doc.data() };
    if (!ch.botIsAdmin) {
      return;
    }
    const chPrice = Number(ch.price || 0);
    if (chPrice < minPrice || chPrice > maxPrice) {
      return;
    }
    if (!openTargeting) {
      if (language && ch.language !== language) {
        return;
      }
      if (category && ch.category !== category) {
        return;
      }
    }
    matched.push(ch);
  });

  return matched;
}

async function createCampaign(campaignData) {
  const database = getDb();
  const now = admin.firestore.FieldValue.serverTimestamp();
  const docRef = database.collection(COLLECTIONS.CAMPAIGNS).doc();

  const targetingInput = campaignData.targeting || {};
  const ctaInput = campaignData.ctaButton || {};

  const record = {
    campaignId: docRef.id,
    advertiserId: String(campaignData.advertiserId),
    title: campaignData.title,
    text: campaignData.text,
    mediaType: campaignData.mediaType || 'none',
    mediaUrl: campaignData.mediaUrl || null,
    mediaFileId: campaignData.mediaFileId || null,
    targeting: {
      openTargeting: Boolean(targetingInput.openTargeting),
      minPrice: Number(targetingInput.minPrice ?? MIN_PRICE),
      maxPrice: Number(targetingInput.maxPrice ?? MAX_PRICE),
      language: targetingInput.language || null,
      category: targetingInput.category || null,
    },
    ctaButton: {
      type: ctaInput.type || 'url',
      label: ctaInput.label || '',
      url: ctaInput.url || '',
    },
    scheduleType: campaignData.scheduleType || 'immediate',
    scheduledAt: campaignData.scheduledAt || null,
    status: campaignData.status || 'active',
    budgetAllocated: Number(campaignData.budgetAllocated || 0),
    budgetSpent: Number(campaignData.budgetSpent || 0),
    stats: {
      publishedCount: 0,
      failedCount: 0,
      clicksCount: 0,
    },
    createdAt: now,
    updatedAt: now,
  };

  await docRef.set(record);
  const created = await docRef.get();
  return { id: created.id, ...created.data() };
}

async function getCampaignById(campaignId) {
  const database = getDb();
  const doc = await database.collection(COLLECTIONS.CAMPAIGNS).doc(String(campaignId)).get();
  if (!doc.exists) {
    return null;
  }
  return { id: doc.id, ...doc.data() };
}

async function getCampaignsByAdvertiser(advertiserId) {
  const database = getDb();
  const snapshot = await database
    .collection(COLLECTIONS.CAMPAIGNS)
    .where('advertiserId', '==', String(advertiserId))
    .get();

  const items = [];
  snapshot.forEach((doc) => {
    items.push({ id: doc.id, ...doc.data() });
  });
  return items;
}

async function getDueCampaigns() {
  const database = getDb();
  const snapshot = await database
    .collection(COLLECTIONS.CAMPAIGNS)
    .where('status', 'in', ['active', 'scheduled'])
    .get();

  const nowMs = Date.now();
  const due = [];
  snapshot.forEach((doc) => {
    const camp = { id: doc.id, ...doc.data() };
    if (camp.status === 'scheduled' && camp.scheduledAt) {
      const schedMs = new Date(camp.scheduledAt).getTime();
      if (!Number.isNaN(schedMs) && schedMs <= nowMs) {
        due.push(camp);
      }
    } else if (camp.status === 'active') {
      due.push(camp);
    }
  });
  return due;
}

async function recordCampaignPost(postRecord) {
  const database = getDb();
  const docId = `${postRecord.campaignId}_${postRecord.channelId}`;
  const ref = database.collection(COLLECTIONS.CAMPAIGN_POSTS).doc(docId);
  await ref.set(
    {
      ...postRecord,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  return docId;
}

async function getCampaignPost(campaignId, channelId) {
  const database = getDb();
  const docId = `${campaignId}_${channelId}`;
  const doc = await database.collection(COLLECTIONS.CAMPAIGN_POSTS).doc(docId).get();
  if (!doc.exists) {
    return null;
  }
  return { id: doc.id, ...doc.data() };
}

async function incrementCampaignStats(campaignId, delta = {}) {
  const database = getDb();
  const ref = database.collection(COLLECTIONS.CAMPAIGNS).doc(String(campaignId));
  const patch = {
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (delta.publishedCount) {
    patch['stats.publishedCount'] = admin.firestore.FieldValue.increment(delta.publishedCount);
  }
  if (delta.failedCount) {
    patch['stats.failedCount'] = admin.firestore.FieldValue.increment(delta.failedCount);
  }
  if (delta.clicksCount) {
    patch['stats.clicksCount'] = admin.firestore.FieldValue.increment(delta.clicksCount);
  }
  if (delta.budgetSpent) {
    patch.budgetSpent = admin.firestore.FieldValue.increment(Number(delta.budgetSpent));
  }
  await ref.update(patch);
}

async function updateCampaignStatus(campaignId, status, extraFields = {}) {
  const database = getDb();
  const ref = database.collection(COLLECTIONS.CAMPAIGNS).doc(String(campaignId));
  await ref.update({
    status,
    ...extraFields,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  const snap = await ref.get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

module.exports = {
  // التوافق العكسي مع الملف القديم
  admin,
  db,
  formatPrivateKey,
  initFirebaseAdmin,
  collections,
  users: collections.users,
  channels: collections.channels,
  campaigns: collections.campaigns,
  transactions: collections.transactions,
  securityLogs: collections.securityLogs,

  // الثوابت والمجموعات الجديدة
  COLLECTIONS,
  SUPPORTED_LANGUAGES,
  SUPPORTED_CATEGORIES,
  MIN_PRICE,
  MAX_PRICE,
  AUTO_APPROVE_SUBSCRIBERS_THRESHOLD,

  // الدوال الأساسية والجديدة
  initFirestore,
  getDb,
  logSecurityEvent,
  recordTransaction,
  getOrCreateUser,
  getUserById,
  adjustUserBalance,
  upsertChannel,
  syncChannelSmartMetadata,
  getChannelsByOwner,
  getChannelById,
  getPendingAdminChannels,
  getMatchingApprovedChannels,
  createCampaign,
  getCampaignById,
  getCampaignsByAdvertiser,
  getDueCampaigns,
  recordCampaignPost,
  getCampaignPost,
  incrementCampaignStats,
  updateCampaignStatus,
};
