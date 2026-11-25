const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

// ============================================================================
// 1. Firebase Admin & Firestore Setup
// ============================================================================

let dbInstance = null;
let firestoreConfigured = false;

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
  try {
    if (admin.apps.length > 0) {
      return admin.app();
    }

    const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = formatPrivateKey(process.env.FIREBASE_PRIVATE_KEY);

    if (projectId && clientEmail && privateKey) {
      return admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey
        })
      });
    }

    if (fs.existsSync(serviceAccountPath)) {
      const serviceAccount = require(serviceAccountPath);
      return admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
    }

    return admin.initializeApp({
      credential: admin.credential.applicationDefault()
    });
  } catch (err) {
    console.error('[Firebase Init Error]:', err);
    throw err;
  }
}

function initFirebase() {
  if (dbInstance) {
    return dbInstance;
  }
  initFirebaseAdmin();
  dbInstance = admin.firestore();
  if (!firestoreConfigured) {
    try {
      dbInstance.settings({ ignoreUndefinedProperties: true });
      firestoreConfigured = true;
    } catch (err) {
      if (!String(err && err.message).includes('already been initialized')) {
        throw err;
      }
      firestoreConfigured = true;
    }
  }
  return dbInstance;
}

const db = initFirebase();

const FieldValue = admin.firestore.FieldValue;
const Timestamp = admin.firestore.Timestamp;

const COLLECTIONS = Object.freeze({
  USERS: 'users',
  DEPOSITS: 'deposits',
  WITHDRAWALS: 'withdrawals',
  TRANSACTIONS: 'transactions',
  CAMPAIGNS: 'campaigns',
  CHANNELS: 'channels',
  REFERRALS: 'referrals',
  WALLETS: 'wallets',
  EARNINGS_LOCKS: 'earningsLocks',
  TICKETS: 'tickets',
  BROADCASTS: 'broadcasts',
  SYSTEM_CONFIG: 'systemConfig',
  PUBLISH_LOGS: 'publishLogs',
  NOTIFICATIONS: 'notifications',
  BACKUP_RECORDS: 'backupRecords',
  SECURITY_LOGS: 'securityLogs',
  AUDIT_LOGS: 'auditLogs',
  SMART_ALERTS: 'smartAlerts'
});

const collections = {
  users: db.collection(COLLECTIONS.USERS),
  deposits: db.collection(COLLECTIONS.DEPOSITS),
  withdrawals: db.collection(COLLECTIONS.WITHDRAWALS),
  channels: db.collection(COLLECTIONS.CHANNELS),
  referrals: db.collection(COLLECTIONS.REFERRALS),
  campaigns: db.collection(COLLECTIONS.CAMPAIGNS),
  wallets: db.collection(COLLECTIONS.WALLETS),
  transactions: db.collection(COLLECTIONS.TRANSACTIONS),
  earningsLocks: db.collection(COLLECTIONS.EARNINGS_LOCKS),
  tickets: db.collection(COLLECTIONS.TICKETS),
  broadcasts: db.collection(COLLECTIONS.BROADCASTS),
  systemConfig: db.collection(COLLECTIONS.SYSTEM_CONFIG),
  publishLogs: db.collection(COLLECTIONS.PUBLISH_LOGS),
  notifications: db.collection(COLLECTIONS.NOTIFICATIONS),
  backupRecords: db.collection(COLLECTIONS.BACKUP_RECORDS),
  securityLogs: db.collection(COLLECTIONS.SECURITY_LOGS),
  auditLogs: db.collection(COLLECTIONS.AUDIT_LOGS),
  smartAlerts: db.collection(COLLECTIONS.SMART_ALERTS)
};

// ============================================================================
// 2. Constants, Rules & Validation Helpers
// ============================================================================

const RULES = Object.freeze({
  MIN_DEPOSIT_USD: Number(process.env.MIN_DEPOSIT_USD) || 10,
  MIN_WITHDRAWAL_USD: Number(process.env.MIN_WITHDRAWAL_USD) || 30,
  WITHDRAWAL_FEE_USD: Number(process.env.WITHDRAWAL_FEE_USD) || 3,
  WITHDRAWAL_NETWORK: process.env.WITHDRAWAL_NETWORK || 'USDT - TRC20',
  REFERRAL_COMMISSION_RATE: Number(process.env.REFERRAL_COMMISSION_RATE) || 0.10,
  MIN_CHANNEL_SUBSCRIBERS: Number(process.env.MIN_CHANNEL_SUBSCRIBERS) || 1000,
  OPEN_TARGETING_MIN_BUDGET: Number(process.env.OPEN_TARGETING_MIN_BUDGET) || 1000,
  EARNINGS_RELEASE_HOURS: Number(process.env.EARNINGS_RELEASE_HOURS) || 24,
  ANTI_BOT_MAX_VIEWS_PER_BATCH: Number(process.env.ANTI_BOT_MAX_VIEWS_PER_BATCH) || 25000,
  ANTI_BOT_MIN_INTERVAL_SEC: Number(process.env.ANTI_BOT_MIN_INTERVAL_SEC) || 10,
  BUDGET_LOW_ALERT_RATIO: Number(process.env.BUDGET_LOW_ALERT_RATIO) || 0.15,
  NETWORK: process.env.DEPOSIT_NETWORK || 'USDT - BEP20',
  WALLET_ADDRESS: process.env.USDT_BEP20_ADDRESS || '0x742d35Cc6634C0532925a3b844Bc454e4438f44e'
});

const ALLOWED_LANGUAGES = [
  'English',
  'Chinese',
  'Hindi',
  'Spanish',
  'Arabic',
  'French',
  'Bengali',
  'Portuguese',
  'Indonesian',
  'Urdu',
  'Russian',
  'German',
  'Japanese',
  'Nigerian Pidgin',
  'Marathi',
  'Vietnamese',
  'Telugu',
  'Swahili',
  'Turkish'
];

const ALLOWED_CATEGORIES = [
  'entertainment',
  'news_media',
  'movies_series',
  'fashion_beauty',
  'gaming',
  'art_photography',
  'crypto',
  'technology',
  'education',
  'cooking',
  'health',
  'sports',
  'other'
];

const USER_ROLES = ['user', 'admin'];
const CHANNEL_APPROVAL_STATUSES = ['pending_review', 'approved', 'rejected'];
const CAMPAIGN_STATUSES = ['draft', 'scheduled', 'active', 'paused', 'completed'];
const CAMPAIGN_MEDIA_TYPES = ['none', 'photo', 'video'];
const CAMPAIGN_BUTTON_PRESETS = ['Open', 'View Offer', 'Join Channel', 'Custom'];
const CAMPAIGN_SCHEDULE_MODES = ['immediate', 'peak'];
const REFERRAL_SOURCE_ROLES = ['publisher', 'advertiser', 'user'];
const WALLET_ROLES = ['advertiser', 'publisher'];
const TRANSACTION_TYPES = [
  'deposit',
  'withdraw',
  'withdrawal',
  'ad_spend',
  'ad_earning',
  'earnings',
  'settlement',
  'referral',
  'budget_topup',
  'manual_adjustment'
];
const TRANSACTION_STATUSES = ['pending', 'processing', 'completed', 'rejected', 'released'];
const PUBLISH_LOG_STATUSES = ['published', 'duplicate_prevented', 'failed'];
const NOTIFICATION_AUDIENCES = ['advertiser', 'publisher', 'admin'];
const NOTIFICATION_CATEGORIES = ['channel', 'campaign', 'wallet', 'system'];
const BACKUP_STATUSES = ['completed', 'failed'];
const AUDIT_ENTITY_TYPES = ['user', 'channel', 'advertiser', 'campaign', 'views'];
const AUDIT_SEVERITIES = ['low', 'medium', 'high'];
const SMART_ALERT_CATEGORIES = ['budget_low', 'earnings_ready', 'anti_bot', 'content_block'];

function assertOneOf(value, allowedList, fieldName) {
  if (!allowedList.includes(value)) {
    throw new Error(`Invalid ${fieldName}: "${value}". Allowed values: ${allowedList.join(', ')}`);
  }
}

function clampNumber(value, min, max, fallback = min) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  if (typeof min === 'number' && num < min) return min;
  if (typeof max === 'number' && num > max) return max;
  return num;
}

function roundMoney(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 100) / 100;
}

function nowIso() {
  return new Date().toISOString();
}

// ============================================================================
// 3. Firestore Document Builders & Helpers
// ============================================================================

function createDefaultUser(userId, role = 'user', referredBy = null) {
  if (!userId || !String(userId).trim()) {
    throw new Error('userId is required to create default user.');
  }
  const cleanUserId = String(userId).trim();
  const normalizedRole = role === 'admin' ? 'admin' : 'user';
  const cleanReferrer =
    referredBy && String(referredBy).trim() !== cleanUserId
      ? String(referredBy).trim()
      : null;

  const timestamp = nowIso();
  return {
    id: cleanUserId,
    role: normalizedRole,
    walletBalance: 0,
    pendingEarnings: 0,
    availableEarnings: 0,
    trc20Address: '',
    referredBy: cleanReferrer,
    referralEarningsTotal: 0,
    banned: false,
    banReason: '',
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function buildUserDoc(input = {}, { isUpdate = false } = {}) {
  const data = {};

  if (!isUpdate || input.id !== undefined) {
    if (!input.id || !String(input.id).trim()) {
      throw new Error('User id is required.');
    }
    data.id = String(input.id).trim();
  }

  if (input.role !== undefined || !isUpdate) {
    const normalizedRole = input.role === 'admin' ? 'admin' : 'user';
    assertOneOf(normalizedRole, USER_ROLES, 'role');
    data.role = normalizedRole;
  }

  if (input.walletBalance !== undefined || !isUpdate) {
    data.walletBalance = roundMoney(clampNumber(input.walletBalance, 0, Infinity, 0));
  }

  if (input.pendingEarnings !== undefined || !isUpdate) {
    data.pendingEarnings = roundMoney(clampNumber(input.pendingEarnings, 0, Infinity, 0));
  }

  if (input.availableEarnings !== undefined || !isUpdate) {
    data.availableEarnings = roundMoney(clampNumber(input.availableEarnings, 0, Infinity, 0));
  }

  if (input.trc20Address !== undefined || !isUpdate) {
    data.trc20Address = input.trc20Address ? String(input.trc20Address).trim() : '';
  }

  if (input.referredBy !== undefined || !isUpdate) {
    const ref = input.referredBy ? String(input.referredBy).trim() : null;
    data.referredBy = ref && ref !== data.id ? ref : null;
  }

  if (input.referralEarningsTotal !== undefined || !isUpdate) {
    data.referralEarningsTotal = roundMoney(clampNumber(input.referralEarningsTotal, 0, Infinity, 0));
  }

  if (input.banned !== undefined || !isUpdate) {
    data.banned = Boolean(input.banned ?? false);
  }

  if (input.banReason !== undefined || !isUpdate) {
    data.banReason = input.banReason ? String(input.banReason).trim() : '';
  }

  if (!isUpdate) {
    data.createdAt = input.createdAt || nowIso();
  }
  data.updatedAt = nowIso();

  return data;
}

function buildChannelDoc(input = {}, { isUpdate = false } = {}) {
  const data = {};

  if (!isUpdate || input.name !== undefined) {
    if (!input.name || !String(input.name).trim()) {
      throw new Error('Channel name is required.');
    }
    data.name = String(input.name).trim();
  }

  if (!isUpdate || input.username !== undefined) {
    if (!input.username || !String(input.username).trim()) {
      throw new Error('Channel username is required.');
    }
    data.username = String(input.username).trim();
  }

  if (input.photoUrl !== undefined || !isUpdate) data.photoUrl = input.photoUrl ?? '';
  if (input.chatId !== undefined || !isUpdate) data.chatId = input.chatId ?? '';
  if (input.isPublic !== undefined || !isUpdate) data.isPublic = Boolean(input.isPublic ?? true);
  if (input.subscribersCount !== undefined || !isUpdate) {
    data.subscribersCount = clampNumber(input.subscribersCount, 0, Infinity, 0);
  }
  if (input.pricePer1000Views !== undefined || !isUpdate) {
    data.pricePer1000Views = roundMoney(clampNumber(input.pricePer1000Views, 1, 3, 1));
  }
  if (input.isFavorite !== undefined || !isUpdate) data.isFavorite = Boolean(input.isFavorite ?? false);
  if (input.ownerTelegramId !== undefined || !isUpdate) data.ownerTelegramId = input.ownerTelegramId ?? '';
  if (input.ownerUsername !== undefined || !isUpdate) data.ownerUsername = input.ownerUsername ?? '';
  if (input.ownerName !== undefined || !isUpdate) data.ownerName = input.ownerName ?? '';

  if (input.approvalStatus !== undefined || !isUpdate) {
    const status = input.approvalStatus ?? 'pending_review';
    assertOneOf(status, CHANNEL_APPROVAL_STATUSES, 'approvalStatus');
    data.approvalStatus = status;
  }

  if (input.introPostSent !== undefined || !isUpdate) {
    data.introPostSent = Boolean(input.introPostSent ?? false);
  }
  if (input.referralCode !== undefined || !isUpdate) data.referralCode = input.referralCode ?? '';
  if (input.referralsCount !== undefined || !isUpdate) {
    data.referralsCount = clampNumber(input.referralsCount, 0, Infinity, 0);
  }
  if (input.lastSyncedAt !== undefined || !isUpdate) {
    data.lastSyncedAt = input.lastSyncedAt ? new Date(input.lastSyncedAt) : FieldValue.serverTimestamp();
  }

  if (!isUpdate || input.language !== undefined) {
    assertOneOf(input.language, ALLOWED_LANGUAGES, 'language');
    data.language = input.language;
  }

  if (!isUpdate || input.category !== undefined) {
    assertOneOf(input.category, ALLOWED_CATEGORIES, 'category');
    data.category = input.category;
  }

  if (!isUpdate || input.price !== undefined) {
    if (input.price === undefined || input.price === null || Number.isNaN(Number(input.price))) {
      throw new Error('Channel price is required.');
    }
    data.price = roundMoney(clampNumber(input.price, 1, 3));
  }

  if (input.botAdded !== undefined || !isUpdate) data.botAdded = Boolean(input.botAdded ?? false);
  if (input.botPermissionsOk !== undefined || !isUpdate) {
    data.botPermissionsOk = Boolean(input.botPermissionsOk ?? false);
  }
  if (input.lastPermissionCheckAt !== undefined || !isUpdate) {
    data.lastPermissionCheckAt = input.lastPermissionCheckAt
      ? new Date(input.lastPermissionCheckAt)
      : null;
  }

  if (!isUpdate) {
    data.createdAt = FieldValue.serverTimestamp();
  }
  data.updatedAt = FieldValue.serverTimestamp();

  return data;
}

function buildReferralDoc(input = {}, { isUpdate = false } = {}) {
  const data = {};

  if (!isUpdate || input.publisherTelegramId !== undefined) {
    if (!input.publisherTelegramId || !String(input.publisherTelegramId).trim()) {
      throw new Error('publisherTelegramId is required.');
    }
    data.publisherTelegramId = String(input.publisherTelegramId).trim();
  }

  if (input.channelId !== undefined || !isUpdate) data.channelId = input.channelId ?? null;

  if (!isUpdate || input.referredTelegramId !== undefined) {
    if (!input.referredTelegramId || !String(input.referredTelegramId).trim()) {
      throw new Error('referredTelegramId is required.');
    }
    data.referredTelegramId = String(input.referredTelegramId).trim();
  }

  if (input.referredUsername !== undefined || !isUpdate) {
    data.referredUsername = input.referredUsername ?? '';
  }

  if (input.sourceRole !== undefined || !isUpdate) {
    const role = input.sourceRole ?? 'user';
    assertOneOf(role, REFERRAL_SOURCE_ROLES, 'sourceRole');
    data.sourceRole = role;
  }

  if (input.commissionEligible !== undefined || !isUpdate) {
    data.commissionEligible = Boolean(input.commissionEligible ?? true);
  }

  if (!isUpdate) {
    data.createdAt = FieldValue.serverTimestamp();
  }
  data.updatedAt = FieldValue.serverTimestamp();

  return data;
}

function buildCampaignDoc(input = {}, { isUpdate = false } = {}) {
  const data = {};

  if (!isUpdate || input.title !== undefined) {
    if (!input.title || !String(input.title).trim()) {
      throw new Error('Campaign title is required.');
    }
    data.title = String(input.title).trim();
  }

  if (input.adText !== undefined || !isUpdate) {
    data.adText = input.adText ? String(input.adText).trim() : '';
  }

  if (input.mediaType !== undefined || !isUpdate) {
    const mediaType = input.mediaType ?? 'none';
    assertOneOf(mediaType, CAMPAIGN_MEDIA_TYPES, 'mediaType');
    data.mediaType = mediaType;
  }

  if (input.mediaData !== undefined || !isUpdate) data.mediaData = input.mediaData ?? '';
  if (input.mediaName !== undefined || !isUpdate) data.mediaName = input.mediaName ?? '';
  if (input.targetUrl !== undefined || !isUpdate) {
    data.targetUrl = input.targetUrl ? String(input.targetUrl).trim() : '';
  }

  if (input.buttonPreset !== undefined || !isUpdate) {
    const preset = input.buttonPreset ?? 'Open';
    assertOneOf(preset, CAMPAIGN_BUTTON_PRESETS, 'buttonPreset');
    data.buttonPreset = preset;
  }

  if (input.customButtonText !== undefined || !isUpdate) {
    data.customButtonText = input.customButtonText ? String(input.customButtonText).trim() : '';
  }

  if (input.budget !== undefined || !isUpdate) {
    data.budget = roundMoney(clampNumber(input.budget, 0, Infinity, 50));
  }
  if (input.spentAmount !== undefined || !isUpdate) {
    data.spentAmount = roundMoney(clampNumber(input.spentAmount, 0, Infinity, 0));
  }
  if (input.totalViews !== undefined || !isUpdate) {
    data.totalViews = clampNumber(input.totalViews, 0, Infinity, 0);
  }
  if (input.openTargeting !== undefined || !isUpdate) {
    data.openTargeting = Boolean(input.openTargeting ?? false);
  }

  if (!isUpdate || input.targetLanguage !== undefined) {
    assertOneOf(input.targetLanguage, ALLOWED_LANGUAGES, 'targetLanguage');
    data.targetLanguage = input.targetLanguage;
  }

  if (!isUpdate || input.targetCategory !== undefined) {
    assertOneOf(input.targetCategory, ALLOWED_CATEGORIES, 'targetCategory');
    data.targetCategory = input.targetCategory;
  }

  if (!isUpdate || input.maxPricePerPost !== undefined) {
    if (
      input.maxPricePerPost === undefined ||
      input.maxPricePerPost === null ||
      Number.isNaN(Number(input.maxPricePerPost))
    ) {
      throw new Error('maxPricePerPost is required.');
    }
    data.maxPricePerPost = roundMoney(clampNumber(input.maxPricePerPost, 1, 3));
  }

  if (input.scheduleMode !== undefined || !isUpdate) {
    const mode = input.scheduleMode ?? 'immediate';
    assertOneOf(mode, CAMPAIGN_SCHEDULE_MODES, 'scheduleMode');
    data.scheduleMode = mode;
  }

  if (input.scheduledAt !== undefined || !isUpdate) {
    data.scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
  }

  if (input.selectedChannelIds !== undefined || !isUpdate) {
    data.selectedChannelIds = Array.isArray(input.selectedChannelIds) ? input.selectedChannelIds : [];
  }

  if (input.publishedChannels !== undefined || !isUpdate) {
    data.publishedChannels = Array.isArray(input.publishedChannels) ? input.publishedChannels : [];
  }

  if (input.status !== undefined || !isUpdate) {
    const status = input.status ?? 'draft';
    assertOneOf(status, CAMPAIGN_STATUSES, 'status');
    data.status = status;
  }

  if (!isUpdate) {
    data.createdAt = FieldValue.serverTimestamp();
  }
  data.updatedAt = FieldValue.serverTimestamp();

  return data;
}

function buildWalletDoc(input = {}, { isUpdate = false } = {}) {
  const data = {};

  if (!isUpdate || input.ownerKey !== undefined) {
    if (!input.ownerKey || !String(input.ownerKey).trim()) {
      throw new Error('ownerKey is required.');
    }
    data.ownerKey = String(input.ownerKey).trim();
  }

  if (input.advertiserBalance !== undefined || !isUpdate) {
    data.advertiserBalance = roundMoney(clampNumber(input.advertiserBalance, 0, Infinity, 0));
  }

  if (input.publisherBalance !== undefined || !isUpdate) {
    data.publisherBalance = roundMoney(clampNumber(input.publisherBalance, 0, Infinity, 0));
  }

  if (!isUpdate) {
    data.createdAt = FieldValue.serverTimestamp();
  }
  data.updatedAt = FieldValue.serverTimestamp();

  return data;
}

function buildTransactionRecord(payload = {}) {
  if (!payload.userId || !String(payload.userId).trim()) {
    throw new Error('Transaction userId is required.');
  }
  if (!payload.type) {
    throw new Error('Transaction type is required.');
  }
  assertOneOf(payload.type, TRANSACTION_TYPES, 'type');

  const status = payload.status || 'completed';
  assertOneOf(status, TRANSACTION_STATUSES, 'status');

  const record = {
    userId: String(payload.userId).trim(),
    type: payload.type,
    amount: roundMoney(payload.amount),
    status,
    note: payload.note ? String(payload.note) : '',
    txid: payload.txid ? String(payload.txid).trim() : null,
    createdAt: payload.createdAt || nowIso()
  };

  if (payload.id !== undefined && payload.id !== null) {
    record.id = String(payload.id).trim();
  }
  if (payload.campaignId !== undefined) record.campaignId = payload.campaignId ?? null;
  if (payload.channelId !== undefined) record.channelId = payload.channelId ?? null;
  if (payload.idempotencyKey !== undefined) {
    record.idempotencyKey = payload.idempotencyKey ? String(payload.idempotencyKey).trim() : null;
  }

  return record;
}

function buildTransactionDoc(input = {}, { isUpdate = false } = {}) {
  const data = {};

  if (input.id !== undefined) {
    data.id = input.id ? String(input.id).trim() : null;
  }

  if (input.userId !== undefined) {
    data.userId = input.userId ? String(input.userId).trim() : null;
  }

  if (input.idempotencyKey !== undefined || !isUpdate) {
    data.idempotencyKey = input.idempotencyKey ? String(input.idempotencyKey).trim() : null;
  }

  if (input.walletRole !== undefined) {
    assertOneOf(input.walletRole, WALLET_ROLES, 'walletRole');
    data.walletRole = input.walletRole;
  }

  if (!isUpdate || input.type !== undefined) {
    assertOneOf(input.type, TRANSACTION_TYPES, 'type');
    data.type = input.type;
  }

  if (!isUpdate || input.amount !== undefined) {
    if (input.amount === undefined || input.amount === null || Number.isNaN(Number(input.amount))) {
      throw new Error('Transaction amount is required.');
    }
    data.amount = roundMoney(input.amount);
  }

  if (input.status !== undefined || !isUpdate) {
    const status = input.status ?? 'completed';
    assertOneOf(status, TRANSACTION_STATUSES, 'status');
    data.status = status;
  }

  if (input.txid !== undefined || !isUpdate) {
    data.txid = input.txid ? String(input.txid).trim() : null;
  }

  if (input.campaignId !== undefined || !isUpdate) data.campaignId = input.campaignId ?? null;
  if (input.channelId !== undefined || !isUpdate) data.channelId = input.channelId ?? null;
  if (input.note !== undefined || !isUpdate) data.note = input.note ?? '';

  if (!isUpdate) {
    data.createdAt = FieldValue.serverTimestamp();
  }
  data.updatedAt = FieldValue.serverTimestamp();

  return data;
}

function buildPublishLogDoc(input = {}, { isUpdate = false } = {}) {
  const data = {};

  if (!isUpdate || input.dedupKey !== undefined) {
    if (!input.dedupKey || !String(input.dedupKey).trim()) {
      throw new Error('dedupKey is required.');
    }
    data.dedupKey = String(input.dedupKey).trim();
  }

  if (!isUpdate || input.campaignId !== undefined) {
    if (!input.campaignId) {
      throw new Error('campaignId is required.');
    }
    data.campaignId = input.campaignId;
  }

  if (input.campaignTitle !== undefined || !isUpdate) {
    data.campaignTitle = input.campaignTitle ?? '';
  }

  if (!isUpdate || input.channelId !== undefined) {
    if (!input.channelId) {
      throw new Error('channelId is required.');
    }
    data.channelId = input.channelId;
  }

  if (input.channelName !== undefined || !isUpdate) {
    data.channelName = input.channelName ?? '';
  }

  if (input.messageId !== undefined || !isUpdate) {
    data.messageId = input.messageId ?? null;
  }

  if (input.status !== undefined || !isUpdate) {
    const status = input.status ?? 'published';
    assertOneOf(status, PUBLISH_LOG_STATUSES, 'status');
    data.status = status;
  }

  if (input.details !== undefined || !isUpdate) {
    data.details = input.details ?? '';
  }

  if (input.publishedAt !== undefined || !isUpdate) {
    data.publishedAt = input.publishedAt ? new Date(input.publishedAt) : FieldValue.serverTimestamp();
  }

  if (!isUpdate) {
    data.createdAt = FieldValue.serverTimestamp();
  }
  data.updatedAt = FieldValue.serverTimestamp();

  return data;
}

function buildNotificationDoc(input = {}, { isUpdate = false } = {}) {
  const data = {};

  if (input.audience !== undefined || !isUpdate) {
    const audience = input.audience ?? 'admin';
    assertOneOf(audience, NOTIFICATION_AUDIENCES, 'audience');
    data.audience = audience;
  }

  if (input.category !== undefined || !isUpdate) {
    const category = input.category ?? 'system';
    assertOneOf(category, NOTIFICATION_CATEGORIES, 'category');
    data.category = category;
  }

  if (!isUpdate || input.title !== undefined) {
    if (!input.title || !String(input.title).trim()) {
      throw new Error('Notification title is required.');
    }
    data.title = String(input.title).trim();
  }

  if (!isUpdate || input.message !== undefined) {
    if (!input.message || !String(input.message).trim()) {
      throw new Error('Notification message is required.');
    }
    data.message = String(input.message).trim();
  }

  if (input.isRead !== undefined || !isUpdate) {
    data.isRead = Boolean(input.isRead ?? false);
  }

  if (!isUpdate) {
    data.createdAt = FieldValue.serverTimestamp();
  }
  data.updatedAt = FieldValue.serverTimestamp();

  return data;
}

function buildBackupRecordDoc(input = {}, { isUpdate = false } = {}) {
  const data = {};

  if (!isUpdate || input.filename !== undefined) {
    if (!input.filename || !String(input.filename).trim()) {
      throw new Error('Backup filename is required.');
    }
    data.filename = String(input.filename).trim();
  }

  if (input.collectionsCount !== undefined || !isUpdate) {
    data.collectionsCount = clampNumber(input.collectionsCount, 0, Infinity, 0);
  }

  if (input.totalRecords !== undefined || !isUpdate) {
    data.totalRecords = clampNumber(input.totalRecords, 0, Infinity, 0);
  }

  if (input.status !== undefined || !isUpdate) {
    const status = input.status ?? 'completed';
    assertOneOf(status, BACKUP_STATUSES, 'status');
    data.status = status;
  }

  if (input.note !== undefined || !isUpdate) data.note = input.note ?? '';
  if (input.snapshotData !== undefined || !isUpdate) {
    data.snapshotData = input.snapshotData && typeof input.snapshotData === 'object' ? input.snapshotData : {};
  }

  if (!isUpdate) {
    data.createdAt = FieldValue.serverTimestamp();
  }
  data.updatedAt = FieldValue.serverTimestamp();

  return data;
}

function buildSecurityLogRecord(payload = {}) {
  if (!payload.action || !String(payload.action).trim()) {
    throw new Error('Security log action is required.');
  }

  const record = {
    actorId: payload.actorId ? String(payload.actorId).trim() : 'system',
    actorRole: payload.actorRole ? String(payload.actorRole).trim() : 'system',
    action: String(payload.action).trim(),
    targetId: payload.targetId ? String(payload.targetId).trim() : null,
    details: payload.details && typeof payload.details === 'object' ? payload.details : {},
    ip: payload.ip ? String(payload.ip).trim() : null,
    createdAt: payload.createdAt || nowIso()
  };

  if (payload.id !== undefined && payload.id !== null) {
    record.id = String(payload.id).trim();
  }

  return record;
}

function buildAuditLogRecord(payload = {}) {
  if (!payload.entityType) {
    throw new Error('Audit log entityType is required.');
  }
  assertOneOf(payload.entityType, AUDIT_ENTITY_TYPES, 'entityType');

  if (!payload.entityId || !String(payload.entityId).trim()) {
    throw new Error('Audit log entityId is required.');
  }

  const severity = payload.severity || 'medium';
  assertOneOf(severity, AUDIT_SEVERITIES, 'severity');

  const record = {
    entityType: payload.entityType,
    entityId: String(payload.entityId).trim(),
    severity,
    reason: payload.reason ? String(payload.reason).trim() : '',
    meta: payload.meta && typeof payload.meta === 'object' ? payload.meta : {},
    createdAt: payload.createdAt || nowIso()
  };

  if (payload.id !== undefined && payload.id !== null) {
    record.id = String(payload.id).trim();
  }

  return record;
}

function buildSmartAlertRecord(payload = {}) {
  if (!payload.userId || !String(payload.userId).trim()) {
    throw new Error('Smart alert userId is required.');
  }
  if (!payload.category) {
    throw new Error('Smart alert category is required.');
  }
  assertOneOf(payload.category, SMART_ALERT_CATEGORIES, 'category');

  if (!payload.title || !String(payload.title).trim()) {
    throw new Error('Smart alert title is required.');
  }
  if (!payload.message || !String(payload.message).trim()) {
    throw new Error('Smart alert message is required.');
  }

  const record = {
    userId: String(payload.userId).trim(),
    category: payload.category,
    title: String(payload.title).trim(),
    message: String(payload.message).trim(),
    read: Boolean(payload.read ?? false),
    createdAt: payload.createdAt || nowIso()
  };

  if (payload.id !== undefined && payload.id !== null) {
    record.id = String(payload.id).trim();
  }

  return record;
}

// ============================================================================
// 4. Exports
// ============================================================================

module.exports = {
  // Firebase Admin & Firestore
  admin,
  db,
  FieldValue,
  Timestamp,
  formatPrivateKey,
  initFirebaseAdmin,
  initFirebase,
  COLLECTIONS,
  collections,

  // Direct Collection Shortcuts
  users: collections.users,
  deposits: collections.deposits,
  withdrawals: collections.withdrawals,
  channels: collections.channels,
  referrals: collections.referrals,
  campaigns: collections.campaigns,
  wallets: collections.wallets,
  transactions: collections.transactions,
  earningsLocks: collections.earningsLocks,
  tickets: collections.tickets,
  broadcasts: collections.broadcasts,
  systemConfig: collections.systemConfig,
  publishLogs: collections.publishLogs,
  notifications: collections.notifications,
  backupRecords: collections.backupRecords,
  securityLogs: collections.securityLogs,
  auditLogs: collections.auditLogs,
  smartAlerts: collections.smartAlerts,

  // Constants, Rules & Validators
  RULES,
  ALLOWED_LANGUAGES,
  ALLOWED_CATEGORIES,
  USER_ROLES,
  CHANNEL_APPROVAL_STATUSES,
  CAMPAIGN_STATUSES,
  CAMPAIGN_MEDIA_TYPES,
  CAMPAIGN_BUTTON_PRESETS,
  CAMPAIGN_SCHEDULE_MODES,
  REFERRAL_SOURCE_ROLES,
  WALLET_ROLES,
  TRANSACTION_TYPES,
  TRANSACTION_STATUSES,
  PUBLISH_LOG_STATUSES,
  NOTIFICATION_AUDIENCES,
  NOTIFICATION_CATEGORIES,
  BACKUP_STATUSES,
  AUDIT_ENTITY_TYPES,
  AUDIT_SEVERITIES,
  SMART_ALERT_CATEGORIES,
  assertOneOf,
  clampNumber,
  roundMoney,
  nowIso,

  // Firestore Document Builders & Record Helpers
  createDefaultUser,
  buildUserDoc,
  buildChannelDoc,
  buildReferralDoc,
  buildCampaignDoc,
  buildWalletDoc,
  buildTransactionDoc,
  buildTransactionRecord,
  buildPublishLogDoc,
  buildNotificationDoc,
  buildBackupRecordDoc,
  buildSecurityLogRecord,
  buildAuditLogRecord,
  buildSmartAlertRecord
};
