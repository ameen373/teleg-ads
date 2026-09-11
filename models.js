/**
 * Ultra-Enterprise Models Architecture (V5.4 - Dynamic Partial Updates & Telegram Link Support)
 * Platform: Telega.ads Advertising & Shortener Network
 * Security: Zero-Data-Leakage Enforcement, Dynamic Context Scoping, Dual-ID Ownership Bindings
 */

if (typeof window !== 'undefined') {
  throw new Error("Critical Security Alert: Mongoose models must run exclusively on the server side.");
}

const mongoose = require('mongoose');

// Precision currency formatter up to 5 decimal places (Prevents JS Floating-point flaws)
const formatCurrency = (val) => {
  if (typeof val !== 'number' || isNaN(val) || !isFinite(val)) return 0;
  return Math.round((val + Number.EPSILON) * 100000) / 100000;
};

/**
 * Universal Target URL & Telegram Link Validator
 * Fully supports:
 * - Long HTTP / HTTPS URLs with deep query parameters, fragments, and subdomains
 * - Standard t.me links (e.g. t.me/username, t.me/c/12345/678)
 * - Telegram bot start parameters (e.g. t.me/bot?start=ref123)
 * - Deep-link protocols (tg://resolve?domain=...)
 * - Telegram private join links (t.me/+AbCdEfGhIjK)
 */
const validateUrlOrTelegram = (v) => {
  if (!v || typeof v !== 'string') return false;
  const trimmed = v.trim();
  
  // High-flexibility Regex for HTTP/HTTPS, TG Protocols, and t.me / telegram.me links
  const pattern = /^(https?:\/\/|tg:\/\/)?(www\.)?(t\.me|telegram\.me|[a-zA-Z0-9-]+\.[a-zA-Z]{2,})(:\d+)?(\/[a-zA-Z0-9_.~:\/?#\[\]@!$&'()*+,;=%\-\+]*)?$/i;
  return pattern.test(trimmed);
};

// Global Schema Options for strict data isolation and safe JSON serialization
const globalSchemaOptions = {
  timestamps: true,
  versionKey: '__v',
  toJSON: {
    transform: function (doc, ret) {
      delete ret.__v;
      return ret;
    }
  },
  toObject: {
    transform: function (doc, ret) {
      delete ret.__v;
      return ret;
    }
  }
};

// Helper validator to enforce non-empty ownership parameters
const enforceTenantKey = (tenantKey, keyName = 'userId') => {
  if (!tenantKey) {
    throw new Error(`Security Violation [Tenant Isolation]: Access denied. Missing strictly required parameter: ${keyName}`);
  }
};

// Helper to flatten nested objects for atomic standard $set partial updates
const flattenObject = (obj, prefix = '') => {
  if (!obj || typeof obj !== 'object') return {};
  return Object.keys(obj).reduce((acc, k) => {
    const pre = prefix.length ? prefix + '.' : '';
    if (
      typeof obj[k] === 'object' &&
      obj[k] !== null &&
      !Array.isArray(obj[k]) &&
      !(obj[k] instanceof Date) &&
      !(obj[k] instanceof mongoose.Types.ObjectId)
    ) {
      Object.assign(acc, flattenObject(obj[k], pre + k));
    } else if (obj[k] !== undefined) {
      acc[pre + k] = obj[k];
    }
    return acc;
  }, {});
};

// --------------------------------------------------
// 1. User Model (Isolated Profiles, Balances & Stats)
// --------------------------------------------------
const userSchema = new mongoose.Schema({
  telegramId: { 
    type: String, 
    required: [true, 'Telegram ID is required'], 
    unique: true, 
    index: true,
    trim: true 
  },
  username: { 
    type: String, 
    default: '', 
    trim: true,
    lowercase: true 
  },
  language: {
    type: String,
    default: 'ar',
    trim: true,
    lowercase: true
  },
  role: { 
    type: String, 
    enum: ['user', 'admin'], 
    default: 'user',
    index: true 
  },
  pendingBalance: { 
    type: Number, 
    default: 0, 
    min: [0, 'Pending balance cannot be negative'],
    set: formatCurrency 
  },
  availableBalance: { 
    type: Number, 
    default: 0, 
    min: [0, 'Available balance cannot be negative'],
    set: formatCurrency 
  },
  isBanned: { 
    type: Boolean, 
    default: false, 
    index: true 
  },
  referredBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    default: null, 
    index: true 
  },
  referralEarnings: { 
    type: Number, 
    default: 0, 
    min: 0,
    set: formatCurrency 
  },
  defaultWallet: { 
    type: String, 
    default: '', 
    trim: true,
    validate: {
      validator: function(v) {
        if (!v || v === '') return true;
        const isTron = /^T[A-Za-z1-9]{33}$/.test(v);
        const isEvm = /^0x[a-fA-F0-9]{40}$/.test(v);
        const isTon = /^[a-zA-Z0-9_-]{48}$/.test(v) || /^0:[a-fA-F0-9]{64}$/.test(v);
        return isTron || isEvm || isTon;
      },
      message: 'Invalid wallet address format (Must be USDT TRC20, BEP20/ERC20, or TON)'
    }
  },
  statsSummary: {
    totalLinksCreated: { type: Number, default: 0, min: 0 },
    totalViewsReceived: { type: Number, default: 0, min: 0 },
    totalValidViews: { type: Number, default: 0, min: 0 },
    totalLifetimeEarned: { type: Number, default: 0, min: 0, set: formatCurrency }
  }
}, globalSchemaOptions);

userSchema.index({ telegramId: 1, isBanned: 1 });

userSchema.statics.findByTelegramIdIsolated = function(telegramId) {
  enforceTenantKey(telegramId, 'telegramId');
  return this.findOne({ telegramId: String(telegramId).trim() });
};

// Rapid Upsert / Partial Update for User Data
userSchema.statics.upsertUser = function(telegramId, updateData = {}) {
  enforceTenantKey(telegramId, 'telegramId');
  const flatUpdate = flattenObject(updateData);
  return this.findOneAndUpdate(
    { telegramId: String(telegramId).trim() },
    { $set: flatUpdate },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );
};

// Atomic Balance & Stats Updates
userSchema.statics.atomicBalanceUpdate = function(telegramId, incFields = {}, setFields = {}) {
  enforceTenantKey(telegramId, 'telegramId');
  const updateQuery = {};
  if (Object.keys(incFields).length > 0) updateQuery.$inc = incFields;
  if (Object.keys(setFields).length > 0) updateQuery.$set = flattenObject(setFields);

  return this.findOneAndUpdate(
    { telegramId: String(telegramId).trim() },
    updateQuery,
    { new: true, runValidators: true }
  );
};

// --------------------------------------------------
// 2. Isolated Wallet Model (Central Balance Control)
// --------------------------------------------------
const walletSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: [true, 'User ID is required for tenant isolation'], 
    unique: true,
    index: true 
  },
  telegramId: { 
    type: String, 
    required: [true, 'Telegram ID is required for fast tenant lookup'], 
    unique: true,
    index: true, 
    trim: true 
  },
  availableBalance: { 
    type: Number, 
    default: 0, 
    min: [0, 'Available balance cannot be negative'], 
    set: formatCurrency 
  },
  pendingBalance: { 
    type: Number, 
    default: 0, 
    min: [0, 'Pending balance cannot be negative'], 
    set: formatCurrency 
  },
  totalDeposited: { 
    type: Number, 
    default: 0, 
    min: 0, 
    set: formatCurrency 
  },
  totalWithdrawn: { 
    type: Number, 
    default: 0, 
    min: 0, 
    set: formatCurrency 
  },
  currency: { 
    type: String, 
    default: 'USDT', 
    uppercase: true, 
    trim: true 
  }
}, globalSchemaOptions);

walletSchema.index({ userId: 1, telegramId: 1 });

walletSchema.statics.getWalletIsolated = function(userId) {
  enforceTenantKey(userId, 'userId');
  return this.findOne({ userId });
};

// Rapid Upsert / Partial Update for Wallet
walletSchema.statics.upsertWallet = function(userId, telegramId, updateData = {}) {
  enforceTenantKey(userId, 'userId');
  enforceTenantKey(telegramId, 'telegramId');
  const flatUpdate = flattenObject(updateData);
  return this.findOneAndUpdate(
    { userId },
    { 
      $setOnInsert: { telegramId: String(telegramId).trim() },
      $set: flatUpdate 
    },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );
};

// Atomic Financial Operations
walletSchema.statics.atomicDeposit = function(userId, amount) {
  enforceTenantKey(userId, 'userId');
  const formattedAmt = formatCurrency(amount);
  return this.findOneAndUpdate(
    { userId },
    { 
      $inc: { 
        availableBalance: formattedAmt, 
        totalDeposited: formattedAmt 
      } 
    },
    { new: true, upsert: true }
  );
};

walletSchema.statics.atomicWithdraw = function(userId, amount) {
  enforceTenantKey(userId, 'userId');
  const formattedAmt = formatCurrency(amount);
  return this.findOneAndUpdate(
    { userId, availableBalance: { $gte: formattedAmt } },
    { 
      $inc: { 
        availableBalance: -formattedAmt, 
        totalWithdrawn: formattedAmt 
      } 
    },
    { new: true }
  );
};

walletSchema.statics.atomicSpend = function(userId, amount) {
  enforceTenantKey(userId, 'userId');
  const formattedAmt = formatCurrency(amount);
  return this.findOneAndUpdate(
    { userId, availableBalance: { $gte: formattedAmt } },
    { $inc: { availableBalance: -formattedAmt } },
    { new: true }
  );
};

// --------------------------------------------------
// 3. Isolated Transaction History Model
// --------------------------------------------------
const transactionSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: [true, 'User ID is required for tenant isolation'], 
    index: true 
  },
  telegramId: { 
    type: String, 
    required: [true, 'Telegram ID is required for fast tenant lookup'], 
    index: true, 
    trim: true 
  },
  type: { 
    type: String, 
    enum: ['deposit', 'withdrawal', 'campaign_spend', 'publisher_earning', 'referral_bonus', 'refund'], 
    required: true,
    index: true 
  },
  amount: { 
    type: Number, 
    required: true, 
    set: formatCurrency 
  },
  balanceAfter: { 
    type: Number, 
    required: true, 
    set: formatCurrency 
  },
  description: { 
    type: String, 
    default: '', 
    trim: true 
  },
  referenceId: { 
    type: mongoose.Schema.Types.ObjectId, 
    default: null,
    index: true 
  }
}, globalSchemaOptions);

transactionSchema.index({ userId: 1, createdAt: -1 });
transactionSchema.index({ telegramId: 1, createdAt: -1 });
transactionSchema.index({ userId: 1, type: 1, createdAt: -1 });

transactionSchema.statics.getUserTransactionsIsolated = function(userId, filter = {}) {
  enforceTenantKey(userId, 'userId');
  return this.find({ ...filter, userId }).sort({ createdAt: -1 });
};

transactionSchema.statics.recordTransaction = function(data) {
  enforceTenantKey(data.userId, 'userId');
  enforceTenantKey(data.telegramId, 'telegramId');
  return this.create({
    ...data,
    telegramId: String(data.telegramId).trim()
  });
};

// --------------------------------------------------
// 4. Self-Serve Ad Model (Campaigns)
// --------------------------------------------------
const adSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: [true, 'User ID is required for tenant isolation'], 
    index: true 
  },
  telegramId: {
    type: String,
    required: [true, 'Telegram ID is required for fast tenant lookup'],
    index: true,
    trim: true
  },
  advertiserId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: [true, 'Advertiser User ID is required'], 
    index: true 
  },
  advertiserTelegramId: {
    type: String,
    required: [true, 'Advertiser Telegram ID is required for fast tenant lookup'],
    index: true,
    trim: true
  },
  title: { 
    type: String, 
    required: [true, 'Ad title is required'], 
    trim: true, 
    maxlength: [100, 'Ad title must not exceed 100 characters'] 
  },
  originalUrl: {
    type: String,
    required: false,
    trim: true,
    maxlength: [4096, 'Original URL is too long'],
    validate: {
      validator: function(v) {
        if (!v || v === '') return true;
        return validateUrlOrTelegram(v);
      },
      message: 'Invalid original URL or Telegram link format'
    }
  },
  targetUrl: { 
    type: String, 
    required: [true, 'Target URL is required'], 
    trim: true,
    maxlength: [4096, 'Target URL is too long'],
    validate: {
      validator: validateUrlOrTelegram,
      message: 'Please enter a valid target URL or Telegram link (e.g., https://t.me/...)'
    }
  },
  totalBudget: { 
    type: Number, 
    required: [true, 'Total budget is required'], 
    min: [5, 'Minimum campaign budget is $5'], 
    set: formatCurrency 
  },
  remainingBudget: { 
    type: Number, 
    required: true, 
    min: [0, 'Remaining budget cannot be negative'], 
    set: formatCurrency 
  },
  cpmRate: { 
    type: Number, 
    default: 1.50,
    min: 0,
    set: formatCurrency
  },
  costPerImpression: { 
    type: Number, 
    default: 0.0015,
    min: 0,
    set: formatCurrency
  },
  publisherEarningsPerImpression: {
    type: Number,
    default: 0.00135,
    min: 0,
    set: formatCurrency
  },
  platformFeePerImpression: {
    type: Number,
    default: 0.00015,
    min: 0,
    set: formatCurrency
  },
  impressionsCount: { 
    type: Number, 
    default: 0, 
    min: 0 
  },
  status: { 
    type: String, 
    enum: ['active', 'paused', 'completed'], 
    default: 'active', 
    index: true 
  }
}, globalSchemaOptions);

adSchema.pre('validate', function(next) {
  if (this.userId && !this.advertiserId) this.advertiserId = this.userId;
  if (this.advertiserId && !this.userId) this.userId = this.advertiserId;
  if (this.telegramId && !this.advertiserTelegramId) this.advertiserTelegramId = this.telegramId;
  if (this.advertiserTelegramId && !this.telegramId) this.telegramId = this.telegramId;
  
  if (this.originalUrl && !this.targetUrl) {
    this.targetUrl = this.originalUrl;
  } else if (this.targetUrl && !this.originalUrl) {
    this.originalUrl = this.targetUrl;
  }
  
  next();
});

adSchema.index({ userId: 1, status: 1, createdAt: -1 });
adSchema.index({ telegramId: 1, status: 1, createdAt: -1 });
adSchema.index({ advertiserTelegramId: 1, status: 1, createdAt: -1 });
adSchema.index({ status: 1, remainingBudget: 1, createdAt: -1 });

adSchema.statics.findAdvertiserAdsIsolated = function(userId, filter = {}) {
  enforceTenantKey(userId, 'userId');
  return this.find({ ...filter, $or: [{ userId }, { advertiserId: userId }] }).sort({ createdAt: -1 });
};

// Dynamic Upsert & Partial Update for Ads with Remaining Budget Auto-sync
adSchema.statics.upsertAd = function(adId, userId, updateData = {}) {
  enforceTenantKey(userId, 'userId');
  const flatUpdate = flattenObject(updateData);
  
  if (flatUpdate.originalUrl && !flatUpdate.targetUrl) {
    flatUpdate.targetUrl = flatUpdate.originalUrl;
  } else if (flatUpdate.targetUrl && !flatUpdate.originalUrl) {
    flatUpdate.originalUrl = flatUpdate.targetUrl;
  }

  if (adId) {
    return this.findOneAndUpdate(
      { _id: adId, $or: [{ userId }, { advertiserId: userId }] },
      { $set: flatUpdate },
      { new: true, runValidators: true }
    );
  }
  
  const mergedData = { ...updateData, userId, advertiserId: userId };
  if (!mergedData.remainingBudget && mergedData.totalBudget) {
    mergedData.remainingBudget = mergedData.totalBudget;
  }
  return this.create(mergedData);
};

// Atomic Impression & Budget Consumption
adSchema.statics.recordImpressionAndDeduct = function(adId, costPerImpression) {
  const cost = formatCurrency(costPerImpression);
  return this.findOneAndUpdate(
    { _id: adId, remainingBudget: { $gte: cost }, status: 'active' },
    { 
      $inc: { 
        impressionsCount: 1, 
        remainingBudget: -cost 
      } 
    },
    { new: true }
  );
};

// --------------------------------------------------
// 5. Shortened Link Model (Links - Isolated Multi-Tenant)
// --------------------------------------------------
const linkSchema = new mongoose.Schema({
  shortCode: { 
    type: String, 
    required: [true, 'Short code is required'], 
    unique: true, 
    index: true,
    trim: true 
  },
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    required: [true, 'User ID is required for tenant isolation'], 
    index: true
  },
  telegramId: {
    type: String,
    required: [true, 'Telegram ID is required for zero-leakage index queries'],
    index: true,
    trim: true
  },
  publisherTelegramId: {
    type: String,
    required: [true, 'Publisher Telegram ID is required for zero-leakage index queries'],
    index: true,
    trim: true
  },
  title: { 
    type: String, 
    default: 'Untitled Link', 
    trim: true,
    maxlength: 150 
  },
  originalUrl: {
    type: String,
    required: false,
    trim: true,
    maxlength: [4096, 'Original URL is too long'],
    validate: {
      validator: function(v) {
        if (!v || v === '') return true;
        return validateUrlOrTelegram(v);
      },
      message: 'Invalid original URL or Telegram link format'
    }
  },
  targetUrl: { 
    type: String, 
    required: [true, 'Target URL is required'], 
    trim: true,
    maxlength: [4096, 'Target URL is too long'],
    validate: {
      validator: validateUrlOrTelegram,
      message: 'Invalid target URL format (Must be valid HTTP/HTTPS or t.me Telegram link)'
    }
  },
  isActive: { 
    type: Boolean, 
    default: true, 
    index: true 
  },
  views: { 
    type: Number, 
    default: 0, 
    min: 0 
  },
  validImpressions: { 
    type: Number, 
    default: 0, 
    min: 0 
  },
  invalidImpressions: { 
    type: Number, 
    default: 0, 
    min: 0 
  }
}, globalSchemaOptions);

linkSchema.pre('validate', function(next) {
  if (this.telegramId && !this.publisherTelegramId) this.publisherTelegramId = this.telegramId;
  if (this.publisherTelegramId && !this.telegramId) this.telegramId = this.publisherTelegramId;
  
  if (this.originalUrl && !this.targetUrl) {
    this.targetUrl = this.originalUrl;
  } else if (this.targetUrl && !this.originalUrl) {
    this.originalUrl = this.targetUrl;
  }
  
  next();
});

linkSchema.index({ userId: 1, createdAt: -1 });
linkSchema.index({ telegramId: 1, createdAt: -1 });
linkSchema.index({ publisherTelegramId: 1, createdAt: -1 });
linkSchema.index({ userId: 1, isActive: 1, createdAt: -1 });
linkSchema.index({ userId: 1, shortCode: 1 });

linkSchema.statics.getUserIsolatedLinks = function(userId, query = {}, options = {}) {
  enforceTenantKey(userId, 'userId');
  const safeQuery = { ...query, userId };
  return this.find(safeQuery, null, options).sort({ createdAt: -1 });
};

linkSchema.statics.findOneIsolated = function(shortCode, userId) {
  enforceTenantKey(userId, 'userId');
  return this.findOne({ shortCode, userId });
};

// Save or Dynamic Upsert Short Link supporting partial fields & long Telegram URLs
linkSchema.statics.upsertLink = function(userId, telegramId, linkData = {}) {
  enforceTenantKey(userId, 'userId');
  enforceTenantKey(telegramId, 'telegramId');
  
  const flatUpdate = flattenObject(linkData);
  if (flatUpdate.originalUrl && !flatUpdate.targetUrl) {
    flatUpdate.targetUrl = flatUpdate.originalUrl;
  } else if (flatUpdate.targetUrl && !flatUpdate.originalUrl) {
    flatUpdate.originalUrl = flatUpdate.targetUrl;
  }

  const queryFilter = linkData.shortCode 
    ? { shortCode: linkData.shortCode, userId }
    : (linkData._id ? { _id: linkData._id, userId } : null);

  if (queryFilter) {
    return this.findOneAndUpdate(
      queryFilter,
      { 
        $setOnInsert: { 
          telegramId: String(telegramId).trim(),
          publisherTelegramId: String(telegramId).trim()
        },
        $set: flatUpdate 
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
  }

  return this.create({
    ...linkData,
    userId,
    telegramId: String(telegramId).trim(),
    publisherTelegramId: String(telegramId).trim()
  });
};

// Rapid Partial Update for Link
linkSchema.statics.updatePartial = function(shortCode, userId, updateData = {}) {
  enforceTenantKey(userId, 'userId');
  const flatUpdate = flattenObject(updateData);
  if (flatUpdate.originalUrl && !flatUpdate.targetUrl) {
    flatUpdate.targetUrl = flatUpdate.originalUrl;
  } else if (flatUpdate.targetUrl && !flatUpdate.originalUrl) {
    flatUpdate.originalUrl = flatUpdate.targetUrl;
  }
  return this.findOneAndUpdate(
    { shortCode, userId },
    { $set: flatUpdate },
    { new: true, runValidators: true }
  );
};

// Atomic View Counters Inc
linkSchema.statics.incrementStats = function(shortCode, valid = true) {
  const incQuery = { views: 1 };
  if (valid) incQuery.validImpressions = 1;
  else incQuery.invalidImpressions = 1;

  return this.findOneAndUpdate(
    { shortCode },
    { $inc: incQuery },
    { new: true }
  );
};

// --------------------------------------------------
// 6. Traffic & Impressions Model
// --------------------------------------------------
const impressionSchema = new mongoose.Schema({
  linkId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Link', 
    required: true, 
    index: true 
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required for tenant isolation'],
    index: true
  },
  telegramId: {
    type: String,
    required: [true, 'Telegram ID is required for tenant isolation'],
    trim: true,
    index: true
  },
  publisherId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  publisherTelegramId: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  viewerTelegramId: {
    type: String,
    default: null,
    trim: true,
    index: true
  },
  adSource: { 
    type: String, 
    enum: ['internal', 'adsgram'], 
    default: 'adsgram',
    index: true
  },
  adId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Ad', 
    default: null,
    index: true
  },
  publisherEarnings: {
    type: Number,
    default: 0.00135,
    set: formatCurrency
  },
  ip: { 
    type: String, 
    required: true, 
    trim: true 
  },
  userAgent: { 
    type: String, 
    default: '', 
    trim: true 
  },
  isUnique: { 
    type: Boolean, 
    default: true 
  },
  createdAt: { 
    type: Date, 
    default: Date.now, 
    expires: '60d' 
  }
}, globalSchemaOptions);

impressionSchema.pre('validate', function(next) {
  if (this.publisherId && !this.userId) this.userId = this.publisherId;
  if (this.userId && !this.publisherId) this.publisherId = this.userId;
  if (this.telegramId && !this.publisherTelegramId) this.publisherTelegramId = this.telegramId;
  if (this.publisherTelegramId && !this.telegramId) this.telegramId = this.telegramId;
  next();
});

impressionSchema.index({ userId: 1, createdAt: -1 });
impressionSchema.index({ telegramId: 1, createdAt: -1 });
impressionSchema.index({ publisherTelegramId: 1, createdAt: -1 });
impressionSchema.index({ linkId: 1, userId: 1, createdAt: -1 });
impressionSchema.index({ ip: 1, linkId: 1, createdAt: -1 });

impressionSchema.statics.getPublisherImpressionsIsolated = function(userId, extraFilter = {}) {
  enforceTenantKey(userId, 'userId');
  return this.find({ ...extraFilter, $or: [{ userId }, { publisherId: userId }] }).sort({ createdAt: -1 });
};

// --------------------------------------------------
// 7. Anti-Bypass Click Session Model
// --------------------------------------------------
const clickSessionSchema = new mongoose.Schema({
  linkId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Link', 
    required: true 
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required for tenant isolation'],
    index: true
  },
  telegramId: {
    type: String,
    required: [true, 'Telegram ID is required for tenant isolation'],
    trim: true,
    index: true
  },
  publisherId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  visitorTelegramId: { 
    type: String, 
    default: null, 
    trim: true,
    index: true 
  },
  adSource: { 
    type: String, 
    enum: ['internal', 'adsgram'], 
    default: 'adsgram'
  },
  adId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Ad', 
    default: null 
  },
  ip: { 
    type: String, 
    required: true, 
    trim: true 
  },
  bridgeToken: { 
    type: String, 
    required: true,
    trim: true 
  },
  createdAt: { 
    type: Date, 
    default: Date.now, 
    expires: 300 
  }
}, globalSchemaOptions);

clickSessionSchema.pre('validate', function(next) {
  if (this.publisherId && !this.userId) this.userId = this.publisherId;
  if (this.userId && !this.publisherId) this.publisherId = this.userId;
  next();
});

clickSessionSchema.index({ linkId: 1, ip: 1 });
clickSessionSchema.index({ userId: 1, createdAt: -1 });
clickSessionSchema.index({ telegramId: 1, createdAt: -1 });
clickSessionSchema.index({ bridgeToken: 1 }, { unique: true });

// --------------------------------------------------
// 8. Withdraw Request Model (Withdrawals)
// --------------------------------------------------
const withdrawSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: [true, 'User ID is required for tenant isolation'], 
    index: true 
  },
  telegramId: {
    type: String,
    required: [true, 'Telegram ID is required for tenant isolation'],
    trim: true,
    index: true
  },
  amount: { 
    type: Number, 
    required: [true, 'Total withdrawal amount is required'], 
    min: [30, 'Minimum withdrawal limit is $30'],
    set: formatCurrency 
  },
  fee: {
    type: Number,
    default: 3,
    set: formatCurrency
  },
  netAmount: {
    type: Number,
    required: true,
    set: formatCurrency
  },
  network: {
    type: String,
    enum: ['BEP20', 'TRC20', 'TON'],
    required: [true, 'Please select network (BEP20, TRC20, or TON)'],
    trim: true,
    uppercase: true
  },
  walletAddress: { 
    type: String, 
    required: [true, 'Wallet address is required'], 
    trim: true 
  },
  status: { 
    type: String, 
    enum: ['pending', 'approved', 'rejected'], 
    default: 'pending', 
    lowercase: true,
    index: true 
  },
  rejectReason: { 
    type: String, 
    default: '', 
    trim: true 
  },
  note: { 
    type: String, 
    default: '', 
    trim: true 
  }
}, globalSchemaOptions);

withdrawSchema.pre('validate', function(next) {
  const amount = typeof this.amount === 'number' ? this.amount : 0;
  const fee = typeof this.fee === 'number' ? this.fee : 3;
  this.netAmount = formatCurrency(Math.max(0, amount - fee));
  next();
});

withdrawSchema.index({ userId: 1, status: 1, createdAt: -1 });
withdrawSchema.index({ telegramId: 1, status: 1, createdAt: -1 });

withdrawSchema.index(
  { userId: 1, status: 'pending' }, 
  { unique: true, partialFilterExpression: { status: 'pending' } }
);

withdrawSchema.statics.getUserWithdrawalsIsolated = function(userId, status = null) {
  enforceTenantKey(userId, 'userId');
  const query = { userId };
  if (status) query.status = status;
  return this.find(query).sort({ createdAt: -1 });
};

// Create Request / Dynamic Partial Update for Withdrawals
withdrawSchema.statics.createRequest = function(data) {
  enforceTenantKey(data.userId, 'userId');
  enforceTenantKey(data.telegramId, 'telegramId');
  return this.create({
    ...data,
    telegramId: String(data.telegramId).trim()
  });
};

withdrawSchema.statics.upsertWithdraw = function(withdrawId, userId, updateData = {}) {
  enforceTenantKey(userId, 'userId');
  const flatUpdate = flattenObject(updateData);
  if (withdrawId) {
    return this.findOneAndUpdate(
      { _id: withdrawId, userId },
      { $set: flatUpdate },
      { new: true, runValidators: true }
    );
  }
  return this.create({ ...updateData, userId });
};

withdrawSchema.statics.updateStatus = function(withdrawId, status, rejectReason = '') {
  return this.findByIdAndUpdate(
    withdrawId,
    { $set: { status, rejectReason } },
    { new: true, runValidators: true }
  );
};

// --------------------------------------------------
// 9. Earnings Hold Model
// --------------------------------------------------
const earningsHoldSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: [true, 'User ID is required for tenant isolation'], 
    index: true 
  },
  telegramId: {
    type: String,
    required: [true, 'Telegram ID is required for tenant isolation'],
    trim: true,
    index: true
  },
  amount: { 
    type: Number, 
    required: true, 
    min: 0,
    set: formatCurrency 
  },
  releaseAt: { 
    type: Date, 
    required: true, 
    default: () => new Date(Date.now() + 24 * 60 * 60 * 1000),
    index: true 
  },
  isReleased: { 
    type: Boolean, 
    default: false, 
    index: true 
  }
}, globalSchemaOptions);

earningsHoldSchema.index({ userId: 1, isReleased: 1, releaseAt: 1 });
earningsHoldSchema.index({ telegramId: 1, isReleased: 1, releaseAt: 1 });

earningsHoldSchema.statics.getUserHoldsIsolated = function(userId) {
  enforceTenantKey(userId, 'userId');
  return this.find({ userId, isReleased: false }).sort({ releaseAt: 1 });
};

earningsHoldSchema.statics.markReleased = function(holdIds = []) {
  return this.updateMany(
    { _id: { $in: holdIds } },
    { $set: { isReleased: true } }
  );
};

// --------------------------------------------------
// 10. Advertiser Deposit Model (Deposits)
// --------------------------------------------------
const depositSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required for tenant isolation'],
    index: true
  },
  telegramId: {
    type: String,
    required: [true, 'Telegram ID is required for fast tenant lookup'],
    trim: true,
    index: true
  },
  advertiserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Advertiser User ID is required'],
    index: true
  },
  advertiserTelegramId: {
    type: String,
    required: [true, 'Advertiser Telegram ID is required'],
    trim: true,
    index: true
  },
  amount: {
    type: Number,
    required: [true, 'Deposit amount is required'],
    min: [1, 'Minimum deposit limit is $1'],
    set: formatCurrency
  },
  network: {
    type: String,
    enum: ['BEP20', 'TRC20', 'TON'],
    required: [true, 'Please select network (BEP20, TRC20, TON)'],
    trim: true,
    uppercase: true
  },
  txid: {
    type: String,
    required: [true, 'Transaction hash (TxID) is required'],
    trim: true,
    unique: true
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
    lowercase: true,
    index: true
  },
  rejectReason: {
    type: String,
    default: '',
    trim: true
  }
}, globalSchemaOptions);

depositSchema.pre('validate', function(next) {
  if (this.userId && !this.advertiserId) this.advertiserId = this.userId;
  if (this.advertiserId && !this.userId) this.userId = this.advertiserId;
  if (this.telegramId && !this.advertiserTelegramId) this.advertiserTelegramId = this.telegramId;
  if (this.advertiserTelegramId && !this.telegramId) this.telegramId = this.telegramId;
  next();
});

depositSchema.index({ userId: 1, status: 1, createdAt: -1 });
depositSchema.index({ telegramId: 1, status: 1, createdAt: -1 });
depositSchema.index({ advertiserTelegramId: 1, status: 1, createdAt: -1 });

depositSchema.statics.getAdvertiserDepositsIsolated = function(userId) {
  enforceTenantKey(userId, 'userId');
  return this.find({ $or: [{ userId }, { advertiserId: userId }] }).sort({ createdAt: -1 });
};

// Create / Dynamic Partial Update for Deposits
depositSchema.statics.createDeposit = function(data) {
  enforceTenantKey(data.userId || data.advertiserId, 'userId');
  return this.create({
    ...data,
    telegramId: String(data.telegramId || data.advertiserTelegramId).trim()
  });
};

depositSchema.statics.upsertDeposit = function(depositId, userId, updateData = {}) {
  enforceTenantKey(userId, 'userId');
  const flatUpdate = flattenObject(updateData);
  if (depositId) {
    return this.findOneAndUpdate(
      { _id: depositId, $or: [{ userId }, { advertiserId: userId }] },
      { $set: flatUpdate },
      { new: true, runValidators: true }
    );
  }
  return this.create({ ...updateData, userId, advertiserId: userId });
};

depositSchema.statics.updateStatus = function(depositId, status, rejectReason = '') {
  return this.findByIdAndUpdate(
    depositId,
    { $set: { status, rejectReason } },
    { new: true, runValidators: true }
  );
};

// --------------------------------------------------
// 11. Announcement Model
// --------------------------------------------------
const announcementSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  content: { type: String, required: true, trim: true },
  isActive: { type: Boolean, default: true, index: true },
  targetUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  targetTelegramId: { type: String, default: null, trim: true, index: true }
}, globalSchemaOptions);

announcementSchema.index({ isActive: 1, targetUser: 1, createdAt: -1 });
announcementSchema.index({ isActive: 1, targetTelegramId: 1, createdAt: -1 });

announcementSchema.statics.getForUserIsolated = function(userId, telegramId) {
  return this.find({
    isActive: true,
    $or: [
      { targetUser: null, targetTelegramId: null },
      { targetUser: userId },
      { targetTelegramId: String(telegramId) }
    ]
  }).sort({ createdAt: -1 });
};

announcementSchema.statics.upsertAnnouncement = function(id, data = {}) {
  const flatUpdate = flattenObject(data);
  if (id) {
    return this.findByIdAndUpdate(id, { $set: flatUpdate }, { new: true, runValidators: true });
  }
  return this.create(data);
};

// Exporting Optimized Safe Models
const User = mongoose.models.User || mongoose.model('User', userSchema);
const Wallet = mongoose.models.Wallet || mongoose.model('Wallet', walletSchema);
const Transaction = mongoose.models.Transaction || mongoose.model('Transaction', transactionSchema);
const Ad = mongoose.models.Ad || mongoose.model('Ad', adSchema);
const Link = mongoose.models.Link || mongoose.model('Link', linkSchema);
const Impression = mongoose.models.Impression || mongoose.model('Impression', impressionSchema);
const ClickSession = mongoose.models.ClickSession || mongoose.model('ClickSession', clickSessionSchema);
const Withdraw = mongoose.models.Withdraw || mongoose.model('Withdraw', withdrawSchema);
const EarningsHold = mongoose.models.EarningsHold || mongoose.model('EarningsHold', earningsHoldSchema);
const Deposit = mongoose.models.Deposit || mongoose.model('Deposit', depositSchema);
const Announcement = mongoose.models.Announcement || mongoose.model('Announcement', announcementSchema);

module.exports = {
  User,
  Wallet,
  Transaction,
  Ad,
  Link,
  Impression,
  ClickSession,
  Withdraw,
  EarningsHold,
  Deposit,
  Announcement
};
