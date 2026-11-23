const admin = require('firebase-admin');

// ============================================================================
// 1. Firebase Admin & Firestore Setup
// ============================================================================

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

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      'Missing Firebase Admin credentials: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY are required.'
    );
  }

  return admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey
    })
  });
}

initFirebaseAdmin();

const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

const FieldValue = admin.firestore.FieldValue;
const Timestamp = admin.firestore.Timestamp;

const collections = {
  users: db.collection('users'),
  channels: db.collection('channels'),
  referrals: db.collection('referrals'),
  campaigns: db.collection('campaigns'),
  wallets: db.collection('wallets'),
  transactions: db.collection('transactions'),
  publishLogs: db.collection('publishLogs'),
  notifications: db.collection('notifications'),
  backupRecords: db.collection('backupRecords'),
  securityLogs: db.collection('securityLogs')
};

// ============================================================================
// 2. Constants & Validation Helpers
// ============================================================================

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

const CHANNEL_APPROVAL_STATUSES = ['pending_review', 'approved', 'rejected'];
const CAMPAIGN_STATUSES = ['draft', 'scheduled', 'active', 'paused', 'completed'];
const CAMPAIGN_MEDIA_TYPES = ['none', 'photo', 'video'];
const CAMPAIGN_BUTTON_PRESETS = ['Open', 'View Offer', 'Join Channel', 'Custom'];
const CAMPAIGN_SCHEDULE_MODES = ['immediate', 'peak'];
const REFERRAL_SOURCE_ROLES = ['publisher', 'advertiser', 'user'];
const WALLET_ROLES = ['advertiser', 'publisher'];
const TRANSACTION_TYPES = ['deposit', 'withdraw', 'ad_spend', 'ad_earning', 'budget_topup'];
const PUBLISH_LOG_STATUSES = ['published', 'duplicate_prevented', 'failed'];
const NOTIFICATION_AUDIENCES = ['advertiser', 'publisher', 'admin'];
const NOTIFICATION_CATEGORIES = ['channel', 'campaign', 'wallet', 'system'];
const BACKUP_STATUSES = ['completed', 'failed'];

function assertOneOf(value, allowedList, fieldName) {
  if (!allowedList.includes(value)) {
    throw new Error(`Invalid ${fieldName}: "${value}". Allowed values: ${allowedList.join(', ')}`);
  }
}

function clampNumber(value, min, max, fallback = min) {
  const num = Number(value);
  if (Number.isNaN(num)) return fallback;
  if (typeof min === 'number' && num < min) return min;
  if (typeof max === 'number' && num > max) return max;
  return num;
}

// ============================================================================
// 3. Firestore Document Builders & Helpers
// ============================================================================

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
    data.pricePer1000Views = clampNumber(input.pricePer1000Views, 1, 3, 1);
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
    data.price = clampNumber(input.price, 1, 3);
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
    data.budget = clampNumber(input.budget, 0, Infinity, 50);
  }
  if (input.spentAmount !== undefined || !isUpdate) {
    data.spentAmount = clampNumber(input.spentAmount, 0, Infinity, 0);
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
    data.maxPricePerPost = clampNumber(input.maxPricePerPost, 1, 3);
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
    data.advertiserBalance = clampNumber(input.advertiserBalance, 0, Infinity, 0);
  }

  if (input.publisherBalance !== undefined || !isUpdate) {
    data.publisherBalance = clampNumber(input.publisherBalance, 0, Infinity, 0);
  }

  if (!isUpdate) {
    data.createdAt = FieldValue.serverTimestamp();
  }
  data.updatedAt = FieldValue.serverTimestamp();

  return data;
}

function buildTransactionDoc(input = {}, { isUpdate = false } = {}) {
  const data = {};

  if (input.idempotencyKey !== undefined || !isUpdate) {
    data.idempotencyKey = input.idempotencyKey ? String(input.idempotencyKey).trim() : null;
  }

  if (!isUpdate || input.walletRole !== undefined) {
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
    data.amount = Number(input.amount);
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
  collections,

  // Direct Collection Shortcuts
  users: collections.users,
  channels: collections.channels,
  referrals: collections.referrals,
  campaigns: collections.campaigns,
  wallets: collections.wallets,
  transactions: collections.transactions,
  publishLogs: collections.publishLogs,
  notifications: collections.notifications,
  backupRecords: collections.backupRecords,
  securityLogs: collections.securityLogs,

  // Constants & Validators
  ALLOWED_LANGUAGES,
  ALLOWED_CATEGORIES,
  CHANNEL_APPROVAL_STATUSES,
  CAMPAIGN_STATUSES,
  CAMPAIGN_MEDIA_TYPES,
  CAMPAIGN_BUTTON_PRESETS,
  CAMPAIGN_SCHEDULE_MODES,
  REFERRAL_SOURCE_ROLES,
  WALLET_ROLES,
  TRANSACTION_TYPES,
  PUBLISH_LOG_STATUSES,
  NOTIFICATION_AUDIENCES,
  NOTIFICATION_CATEGORIES,
  BACKUP_STATUSES,
  assertOneOf,
  clampNumber,

  // Firestore Document Builders
  buildChannelDoc,
  buildReferralDoc,
  buildCampaignDoc,
  buildWalletDoc,
  buildTransactionDoc,
  buildPublishLogDoc,
  buildNotificationDoc,
  buildBackupRecordDoc
};
