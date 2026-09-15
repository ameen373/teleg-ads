/**
 * Ultra-Enterprise Models Architecture (V5.3 - Production-Ready & High-Load Optimized)
 * Platform: Telega.ads Advertising & Shortener Network
 * Security: Multi-Tenant Isolation, Strict Validation, Anti-Negative Balance Enforcement
 */

if (typeof window !== 'undefined') {
  throw new Error("Critical Security Alert: Mongoose models must run exclusively on the server side.");
}

const mongoose = require('mongoose');

/**
 * Precision currency formatter up to 5 decimal places.
 * Prevents IEEE 754 floating-point errors (e.g. 0.1 + 0.2 = 0.30000000000000004).
 */
const formatCurrency = (val) => {
  if (val === null || val === undefined || val === '') return 0;
  const num = Number(val);
  if (isNaN(num) || !isFinite(num)) return 0;
  return Math.round((num + Number.EPSILON) * 100000) / 100000;
};

/**
 * Global Schema Options for strict data isolation,
 * safe JSON serialization, and automatic timestamp generation (createdAt, updatedAt).
 */
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

/**
 * Helper validator to enforce non-empty tenant key for strict data isolation.
 */
const enforceTenantKey = (tenantKey, keyName = 'userId') => {
  if (!tenantKey) {
    throw new Error(`Security Violation [Tenant Isolation]: Access denied. Missing strictly required parameter: ${keyName}`);
  }
};

// --------------------------------------------------
// 1. User Model (Profiles, Balances & System Stats)
// --------------------------------------------------
const userSchema = new mongoose.Schema({
  telegramId: { 
    type: String, 
    required: [true, 'Telegram ID is strictly required'], 
    unique: true, 
    trim: true,
    maxlength: [50, 'Telegram ID is too long']
  },
  username: { 
    type: String, 
    default: '', 
    trim: true,
    lowercase: true,
    maxlength: [100, 'Username cannot exceed 100 characters']
  },
  language: {
    type: String,
    default: 'ar',
    trim: true,
    lowercase: true,
    maxlength: [10, 'Language code too long']
  },
  role: { 
    type: String, 
    enum: {
      values: ['user', 'admin'],
      message: 'Role must be either user or admin'
    }, 
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
    min: [0, 'Referral earnings cannot be negative'],
    set: formatCurrency 
  },
  defaultWallet: { 
    type: String, 
    default: '', 
    trim: true,
    maxlength: [120, 'Wallet address too long'],
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
    totalLinksCreated: { type: Number, default: 0, min: [0, 'Total links created cannot be negative'] },
    totalViewsReceived: { type: Number, default: 0, min: [0, 'Total views cannot be negative'] },
    totalValidViews: { type: Number, default: 0, min: [0, 'Total valid views cannot be negative'] },
    totalLifetimeEarned: { type: Number, default: 0, min: [0, 'Total lifetime earnings cannot be negative'], set: formatCurrency }
  }
}, globalSchemaOptions);

// Compound Indexes for Ultra-Fast Queries
userSchema.index({ telegramId: 1, isBanned: 1 });
userSchema.index({ role: 1, isBanned: 1 });

userSchema.statics.findByTelegramIdIsolated = function(telegramId) {
  enforceTenantKey(telegramId, 'telegramId');
  return this.findOne({ telegramId: String(telegramId).trim() });
};

// --------------------------------------------------
// 2. Wallet Model (Central Financial Ledger)
// --------------------------------------------------
const walletSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: [true, 'User ID is strictly required for wallet mapping'], 
    unique: true 
  },
  telegramId: { 
    type: String, 
    required: [true, 'Telegram ID is strictly required for wallet lookup'], 
    unique: true, 
    trim: true,
    maxlength: [50, 'Telegram ID is too long']
  },
  availableBalance: { 
    type: Number, 
    default: 0, 
    min: [0, 'Available wallet balance cannot be negative'], 
    set: formatCurrency 
  },
  pendingBalance: { 
    type: Number, 
    default: 0, 
    min: [0, 'Pending wallet balance cannot be negative'], 
    set: formatCurrency 
  },
  totalDeposited: { 
    type: Number, 
    default: 0, 
    min: [0, 'Total deposited amount cannot be negative'], 
    set: formatCurrency 
  },
  totalWithdrawn: { 
    type: Number, 
    default: 0, 
    min: [0, 'Total withdrawn amount cannot be negative'], 
    set: formatCurrency 
  },
  currency: { 
    type: String, 
    default: 'USDT', 
    uppercase: true, 
    trim: true,
    maxlength: [10, 'Currency code too long']
  }
}, globalSchemaOptions);

walletSchema.index({ userId: 1, telegramId: 1 });

walletSchema.statics.getWalletIsolated = function(userId) {
  enforceTenantKey(userId, 'userId');
  return this.findOne({ userId });
};

// --------------------------------------------------
// 3. Transaction History Model (Financial Audit Logs)
// --------------------------------------------------
const transactionSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: [true, 'User ID is strictly required for transaction logging'], 
    index: true 
  },
  telegramId: { 
    type: String, 
    required: [true, 'Telegram ID is strictly required for transaction audit'], 
    index: true, 
    trim: true,
    maxlength: [50, 'Telegram ID is too long']
  },
  type: { 
    type: String, 
    enum: {
      values: ['deposit', 'withdrawal', 'campaign_spend', 'publisher_earning', 'referral_bonus', 'refund'],
      message: 'Invalid transaction type'
    },
    required: [true, 'Transaction type is required'],
    index: true 
  },
  amount: { 
    type: Number, 
    required: [true, 'Transaction amount is required'], 
    min: [0.00001, 'Transaction amount must be greater than zero'],
    set: formatCurrency 
  },
  balanceAfter: { 
    type: Number, 
    required: [true, 'Balance after transaction is required'], 
    min: [0, 'Balance after transaction cannot be negative'],
    set: formatCurrency 
  },
  description: { 
    type: String, 
    default: '', 
    trim: true,
    maxlength: [255, 'Description cannot exceed 255 characters']
  },
  referenceId: { 
    type: mongoose.Schema.Types.ObjectId, 
    default: null,
    index: true 
  }
}, globalSchemaOptions);

// Performance Indexes for Financial Audit Ledger
transactionSchema.index({ userId: 1, createdAt: -1 });
transactionSchema.index({ telegramId: 1, createdAt: -1 });
transactionSchema.index({ userId: 1, type: 1, createdAt: -1 });
transactionSchema.index({ telegramId: 1, type: 1, createdAt: -1 });

transactionSchema.statics.getUserTransactionsIsolated = function(userId, filter = {}) {
  enforceTenantKey(userId, 'userId');
  return this.find({ ...filter, userId }).sort({ createdAt: -1 });
};

// --------------------------------------------------
// 4. Ad Campaign Model (Campaigns)
// --------------------------------------------------
const adSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: [true, 'User ID is strictly required'], 
    index: true 
  },
  telegramId: {
    type: String,
    required: [true, 'Telegram ID is strictly required'],
    index: true,
    trim: true,
    maxlength: [50, 'Telegram ID is too long']
  },
  advertiserId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: [true, 'Advertiser User ID is strictly required'], 
    index: true 
  },
  advertiserTelegramId: {
    type: String,
    required: [true, 'Advertiser Telegram ID is required'],
    index: true,
    trim: true,
    maxlength: [50, 'Telegram ID is too long']
  },
  title: { 
    type: String, 
    required: [true, 'Ad title is required'], 
    trim: true, 
    maxlength: [100, 'Ad title must not exceed 100 characters'] 
  },
  targetUrl: { 
    type: String, 
    required: [true, 'Target URL is required'], 
    trim: true,
    maxlength: [2048, 'Target URL is too long'],
    validate: {
      validator: function(v) {
        return /^(https?:\/\/)?([\w.-]+)+[\w\-_~:/?#[\]@!$&'()*+,;=.]+$/i.test(v);
      },
      message: 'Please enter a valid target URL'
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
    required: [true, 'Remaining budget is required'], 
    min: [0, 'Remaining budget cannot be negative'], 
    set: formatCurrency 
  },
  cpmRate: { 
    type: Number, 
    default: 1.50,
    min: [0.1, 'CPM rate must be at least $0.10'],
    set: formatCurrency
  },
  costPerImpression: { 
    type: Number, 
    default: 0.0015,
    min: [0, 'Cost per impression cannot be negative'],
    set: formatCurrency
  },
  publisherEarningsPerImpression: {
    type: Number,
    default: 0.00135,
    min: [0, 'Publisher earnings per impression cannot be negative'],
    set: formatCurrency
  },
  platformFeePerImpression: {
    type: Number,
    default: 0.00015,
    min: [0, 'Platform fee per impression cannot be negative'],
    set: formatCurrency
  },
  impressionsCount: { 
    type: Number, 
    default: 0, 
    min: [0, 'Impressions count cannot be negative'] 
  },
  status: { 
    type: String, 
    enum: {
      values: ['active', 'paused', 'completed'],
      message: 'Status must be active, paused, or completed'
    }, 
    default: 'active', 
    index: true 
  }
}, globalSchemaOptions);

adSchema.pre('validate', function(next) {
  if (this.userId && !this.advertiserId) this.advertiserId = this.userId;
  if (this.advertiserId && !this.userId) this.userId = this.advertiserId;
  if (this.telegramId && !this.advertiserTelegramId) this.advertiserTelegramId = this.telegramId;
  if (this.advertiserTelegramId && !this.telegramId) this.telegramId = this.advertiserTelegramId;
  next();
});

// High-Concurrency Ad Bidding & Selection Indexes
adSchema.index({ status: 1, remainingBudget: 1, createdAt: -1 });
adSchema.index({ userId: 1, status: 1, createdAt: -1 });
adSchema.index({ telegramId: 1, status: 1, createdAt: -1 });
adSchema.index({ advertiserTelegramId: 1, status: 1, createdAt: -1 });

adSchema.statics.findAdvertiserAdsIsolated = function(userId, filter = {}) {
  enforceTenantKey(userId, 'userId');
  return this.find({ ...filter, $or: [{ userId }, { advertiserId: userId }] }).sort({ createdAt: -1 });
};

// --------------------------------------------------
// 5. Short Link Model (Short Links - Multi-Tenant)
// --------------------------------------------------
const linkSchema = new mongoose.Schema({
  shortCode: { 
    type: String, 
    required: [true, 'Short code is strictly required'], 
    unique: true, 
    trim: true,
    maxlength: [30, 'Short code cannot exceed 30 characters']
  },
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    required: [true, 'User ID is strictly required'], 
    index: true
  },
  telegramId: {
    type: String,
    required: [true, 'Telegram ID is strictly required'],
    index: true,
    trim: true,
    maxlength: [50, 'Telegram ID is too long']
  },
  publisherTelegramId: {
    type: String,
    required: [true, 'Publisher Telegram ID is required'],
    index: true,
    trim: true,
    maxlength: [50, 'Telegram ID is too long']
  },
  title: { 
    type: String, 
    default: 'Untitled Link', 
    trim: true,
    maxlength: [150, 'Title cannot exceed 150 characters'] 
  },
  targetUrl: { 
    type: String, 
    required: [true, 'Target URL is required'], 
    trim: true,
    maxlength: [2048, 'Target URL is too long'],
    validate: {
      validator: function(v) {
        return /^(https?:\/\/)?([\w.-]+)+[\w\-_~:/?#[\]@!$&'()*+,;=.]+$/i.test(v);
      },
      message: 'Please enter a valid target URL'
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
    min: [0, 'Views count cannot be negative'] 
  },
  validImpressions: { 
    type: Number, 
    default: 0, 
    min: [0, 'Valid impressions cannot be negative'] 
  },
  invalidImpressions: { 
    type: Number, 
    default: 0, 
    min: [0, 'Invalid impressions cannot be negative'] 
  }
}, globalSchemaOptions);

linkSchema.pre('validate', function(next) {
  if (this.telegramId && !this.publisherTelegramId) this.publisherTelegramId = this.telegramId;
  if (this.publisherTelegramId && !this.telegramId) this.telegramId = this.publisherTelegramId;
  next();
});

// Ultra-Fast Link Resolution & User Dashboard Indexes
linkSchema.index({ shortCode: 1, isActive: 1 });
linkSchema.index({ userId: 1, createdAt: -1 });
linkSchema.index({ telegramId: 1, createdAt: -1 });
linkSchema.index({ publisherTelegramId: 1, createdAt: -1 });
linkSchema.index({ userId: 1, isActive: 1, createdAt: -1 });

linkSchema.statics.getUserIsolatedLinks = function(userId, query = {}, options = {}) {
  enforceTenantKey(userId, 'userId');
  const safeQuery = { ...query, userId };
  return this.find(safeQuery, null, options).sort({ createdAt: -1 });
};

linkSchema.statics.findOneIsolated = function(shortCode, userId) {
  enforceTenantKey(userId, 'userId');
  return this.findOne({ shortCode: String(shortCode).trim(), userId });
};

// --------------------------------------------------
// 6. Impression & Traffic Model
// --------------------------------------------------
const impressionSchema = new mongoose.Schema({
  linkId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Link', 
    required: [true, 'Link ID is required for impression recording'], 
    index: true 
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is strictly required'],
    index: true
  },
  telegramId: {
    type: String,
    required: [true, 'Telegram ID is strictly required'],
    trim: true,
    index: true,
    maxlength: [50, 'Telegram ID is too long']
  },
  publisherId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Publisher ID is required'],
    index: true
  },
  publisherTelegramId: {
    type: String,
    required: [true, 'Publisher Telegram ID is required'],
    trim: true,
    index: true,
    maxlength: [50, 'Telegram ID is too long']
  },
  viewerTelegramId: {
    type: String,
    default: null,
    trim: true,
    index: true,
    maxlength: [50, 'Telegram ID is too long']
  },
  adSource: { 
    type: String, 
    enum: {
      values: ['internal', 'adsgram'],
      message: 'Ad source must be internal or adsgram'
    }, 
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
    min: [0, 'Publisher earnings cannot be negative'],
    set: formatCurrency
  },
  ip: { 
    type: String, 
    required: [true, 'IP address is required for anti-fraud tracking'], 
    trim: true,
    maxlength: [45, 'IP address too long'] 
  },
  userAgent: { 
    type: String, 
    default: '', 
    trim: true,
    maxlength: [500, 'User agent too long'] 
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
  if (this.publisherTelegramId && !this.telegramId) this.telegramId = this.publisherTelegramId;
  next();
});

// Analytics & Fraud Detection Indexes
impressionSchema.index({ linkId: 1, createdAt: -1 });
impressionSchema.index({ userId: 1, createdAt: -1 });
impressionSchema.index({ telegramId: 1, createdAt: -1 });
impressionSchema.index({ publisherTelegramId: 1, createdAt: -1 });
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
    required: [true, 'Link ID is required for click session'] 
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is strictly required'],
    index: true
  },
  telegramId: {
    type: String,
    required: [true, 'Telegram ID is strictly required'],
    trim: true,
    index: true,
    maxlength: [50, 'Telegram ID is too long']
  },
  publisherId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Publisher ID is required'],
    index: true
  },
  visitorTelegramId: { 
    type: String, 
    default: null, 
    trim: true,
    index: true,
    maxlength: [50, 'Telegram ID is too long'] 
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
    required: [true, 'IP address is required'], 
    trim: true,
    maxlength: [45, 'IP address too long'] 
  },
  bridgeToken: { 
    type: String, 
    required: [true, 'Bridge token is required'], 
    trim: true,
    unique: true,
    maxlength: [128, 'Token too long'] 
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

// --------------------------------------------------
// 8. Withdraw Request Model (Withdrawals)
// --------------------------------------------------
const withdrawSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: [true, 'User ID is strictly required'], 
    index: true 
  },
  telegramId: {
    type: String,
    required: [true, 'Telegram ID is strictly required'],
    trim: true,
    index: true,
    maxlength: [50, 'Telegram ID is too long']
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
    min: [0, 'Fee cannot be negative'],
    set: formatCurrency
  },
  netAmount: {
    type: Number,
    required: [true, 'Net amount is required'],
    min: [0, 'Net withdrawal amount cannot be negative'],
    set: formatCurrency
  },
  network: {
    type: String,
    enum: {
      values: ['BEP20', 'TRC20', 'TON'],
      message: 'Network must be BEP20, TRC20, or TON'
    },
    required: [true, 'Please select network (BEP20, TRC20, or TON)'],
    trim: true,
    uppercase: true
  },
  walletAddress: { 
    type: String, 
    required: [true, 'Wallet address is required'], 
    trim: true,
    maxlength: [120, 'Wallet address too long'],
    validate: {
      validator: function(v) {
        if (!v) return false;
        const isTron = /^T[A-Za-z1-9]{33}$/.test(v);
        const isEvm = /^0x[a-fA-F0-9]{40}$/.test(v);
        const isTon = /^[a-zA-Z0-9_-]{48}$/.test(v) || /^0:[a-fA-F0-9]{64}$/.test(v);
        return isTron || isEvm || isTon;
      },
      message: 'Invalid withdrawal wallet address format'
    }
  },
  status: { 
    type: String, 
    enum: {
      values: ['pending', 'approved', 'rejected'],
      message: 'Status must be pending, approved, or rejected'
    }, 
    default: 'pending', 
    lowercase: true,
    index: true 
  },
  rejectReason: { 
    type: String, 
    default: '', 
    trim: true,
    maxlength: [255, 'Reason cannot exceed 255 characters']
  },
  note: { 
    type: String, 
    default: '', 
    trim: true,
    maxlength: [255, 'Note cannot exceed 255 characters']
  }
}, globalSchemaOptions);

withdrawSchema.pre('validate', function(next) {
  const amount = typeof this.amount === 'number' ? this.amount : 0;
  const fee = typeof this.fee === 'number' ? this.fee : 3;
  this.netAmount = formatCurrency(Math.max(0, amount - fee));
  next();
});

// Admin Review & User History Indexes
withdrawSchema.index({ userId: 1, status: 1, createdAt: -1 });
withdrawSchema.index({ telegramId: 1, status: 1, createdAt: -1 });
withdrawSchema.index({ status: 1, createdAt: -1 });

// Strict Partial Unique Index: Prevents multiple pending withdrawals for the same user simultaneously
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

// --------------------------------------------------
// 9. Earnings Hold Model (Rolling Security Holds)
// --------------------------------------------------
const earningsHoldSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: [true, 'User ID is strictly required'], 
    index: true 
  },
  telegramId: {
    type: String,
    required: [true, 'Telegram ID is strictly required'],
    trim: true,
    index: true,
    maxlength: [50, 'Telegram ID is too long']
  },
  amount: { 
    type: Number, 
    required: [true, 'Hold amount is required'], 
    min: [0, 'Hold amount cannot be negative'],
    set: formatCurrency 
  },
  releaseAt: { 
    type: Date, 
    required: [true, 'Release timestamp is required'], 
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
earningsHoldSchema.index({ releaseAt: 1, isReleased: 1 });

earningsHoldSchema.statics.getUserHoldsIsolated = function(userId) {
  enforceTenantKey(userId, 'userId');
  return this.find({ userId, isReleased: false }).sort({ releaseAt: 1 });
};

// --------------------------------------------------
// 10. Advertiser Deposit Model (Deposits)
// --------------------------------------------------
const depositSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is strictly required'],
    index: true
  },
  telegramId: {
    type: String,
    required: [true, 'Telegram ID is strictly required'],
    trim: true,
    index: true,
    maxlength: [50, 'Telegram ID is too long']
  },
  advertiserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Advertiser User ID is strictly required'],
    index: true
  },
  advertiserTelegramId: {
    type: String,
    required: [true, 'Advertiser Telegram ID is required'],
    trim: true,
    index: true,
    maxlength: [50, 'Telegram ID is too long']
  },
  amount: {
    type: Number,
    required: [true, 'Deposit amount is required'],
    min: [1, 'Minimum deposit limit is $1'],
    set: formatCurrency
  },
  network: {
    type: String,
    enum: {
      values: ['BEP20', 'TRC20', 'TON'],
      message: 'Network must be BEP20, TRC20, or TON'
    },
    required: [true, 'Please select network (BEP20, TRC20, TON)'],
    trim: true,
    uppercase: true
  },
  txid: {
    type: String,
    required: [true, 'Transaction hash (TxID) is required'],
    trim: true,
    unique: true,
    maxlength: [120, 'TxID cannot exceed 120 characters']
  },
  status: {
    type: String,
    enum: {
      values: ['pending', 'approved', 'rejected'],
      message: 'Status must be pending, approved, or rejected'
    },
    default: 'pending',
    lowercase: true,
    index: true
  },
  rejectReason: {
    type: String,
    default: '',
    trim: true,
    maxlength: [255, 'Reason cannot exceed 255 characters']
  }
}, globalSchemaOptions);

depositSchema.pre('validate', function(next) {
  if (this.userId && !this.advertiserId) this.advertiserId = this.userId;
  if (this.advertiserId && !this.userId) this.userId = this.advertiserId;
  if (this.telegramId && !this.advertiserTelegramId) this.advertiserTelegramId = this.telegramId;
  if (this.advertiserTelegramId && !this.telegramId) this.telegramId = this.advertiserTelegramId;
  next();
});

// Deposit Verification & Index Queries
depositSchema.index({ userId: 1, status: 1, createdAt: -1 });
depositSchema.index({ telegramId: 1, status: 1, createdAt: -1 });
depositSchema.index({ advertiserTelegramId: 1, status: 1, createdAt: -1 });
depositSchema.index({ status: 1, createdAt: -1 });

depositSchema.statics.getAdvertiserDepositsIsolated = function(userId) {
  enforceTenantKey(userId, 'userId');
  return this.find({ $or: [{ userId }, { advertiserId: userId }] }).sort({ createdAt: -1 });
};

// --------------------------------------------------
// 11. Announcement Model (System Notifications)
// --------------------------------------------------
const announcementSchema = new mongoose.Schema({
  title: { 
    type: String, 
    required: [true, 'Announcement title is required'], 
    trim: true,
    maxlength: [150, 'Title cannot exceed 150 characters'] 
  },
  content: { 
    type: String, 
    required: [true, 'Announcement content is required'], 
    trim: true,
    maxlength: [2000, 'Content cannot exceed 2000 characters'] 
  },
  isActive: { 
    type: Boolean, 
    default: true, 
    index: true 
  },
  targetUser: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    default: null, 
    index: true 
  },
  targetTelegramId: { 
    type: String, 
    default: null, 
    trim: true, 
    index: true,
    maxlength: [50, 'Telegram ID is too long'] 
  }
}, globalSchemaOptions);

announcementSchema.index({ isActive: 1, createdAt: -1 });
announcementSchema.index({ isActive: 1, targetUser: 1, createdAt: -1 });
announcementSchema.index({ isActive: 1, targetTelegramId: 1, createdAt: -1 });

announcementSchema.statics.getForUserIsolated = function(userId, telegramId) {
  return this.find({
    isActive: true,
    $or: [
      { targetUser: null, targetTelegramId: null },
      { targetUser: userId },
      { targetTelegramId: telegramId ? String(telegramId).trim() : null }
    ]
  }).sort({ createdAt: -1 });
};

// --------------------------------------------------
// Exporting Safe Compiled Mongoose Models
// --------------------------------------------------
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
