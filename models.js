/**
 * Enterprise Models Architecture (V6.0 Production)
 * Platform: Telega.ads Advertising & Shortener Network
 * Features: Absolute Multi-Tenant Isolation, Dynamic Scoping, High-Throughput Indexes, Precise Currency Formatting
 */

if (typeof window !== 'undefined') {
  throw new Error("Critical Security Alert: Mongoose models must run exclusively on the server side.");
}

const mongoose = require('mongoose');

// Precision currency formatter up to 5 decimal places (Prevents JS Floating-point flaws in balances)
const formatCurrency = (val) => {
  if (typeof val !== 'number' || isNaN(val) || !isFinite(val)) return 0;
  return Math.round((val + Number.EPSILON) * 100000) / 100000;
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

// Security helper to enforce non-empty ownership keys
const enforceTenantKey = (tenantKey, keyName = 'userId') => {
  if (!tenantKey) {
    throw new Error(`Security Violation [Tenant Isolation]: Access denied. Missing strictly required parameter: ${keyName}`);
  }
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
  firstName: {
    type: String,
    default: '',
    trim: true
  },
  lastName: {
    type: String,
    default: '',
    trim: true
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
  banReason: {
    type: String,
    default: '',
    trim: true
  },
  referredBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    default: null, 
    index: true 
  },
  referralCode: {
    type: String,
    default: null,
    index: true,
    trim: true
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
userSchema.index({ createdAt: -1 });

userSchema.statics.findByTelegramIdIsolated = function(telegramId) {
  enforceTenantKey(telegramId, 'telegramId');
  return this.findOne({ telegramId: String(telegramId).trim() });
};

userSchema.statics.findOrCreateFromTelegram = async function(telegramData) {
  if (!telegramData || !telegramData.id) {
    throw new Error('Telegram payload must include a valid id');
  }
  const tgIdStr = String(telegramData.id).trim();
  let user = await this.findOne({ telegramId: tgIdStr });

  if (!user) {
    user = await this.create({
      telegramId: tgIdStr,
      username: telegramData.username || '',
      firstName: telegramData.first_name || '',
      lastName: telegramData.last_name || '',
      language: telegramData.language_code || 'ar',
      referralCode: tgIdStr
    });
  } else {
    let updated = false;
    if (telegramData.username && user.username !== telegramData.username) {
      user.username = telegramData.username;
      updated = true;
    }
    if (telegramData.first_name && user.firstName !== telegramData.first_name) {
      user.firstName = telegramData.first_name;
      updated = true;
    }
    if (telegramData.last_name && user.lastName !== telegramData.last_name) {
      user.lastName = telegramData.last_name;
      updated = true;
    }
    if (updated) {
      await user.save();
    }
  }
  return user;
};

// --------------------------------------------------
// 2. Wallet Model (Central Balance Control)
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
    min: [0, 'Total deposited cannot be negative'], 
    set: formatCurrency 
  },
  totalWithdrawn: { 
    type: Number, 
    default: 0, 
    min: [0, 'Total withdrawn cannot be negative'], 
    set: formatCurrency 
  },
  totalSpent: {
    type: Number,
    default: 0,
    min: [0, 'Total spent cannot be negative'],
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

walletSchema.statics.getWalletByTelegramIdIsolated = function(telegramId) {
  enforceTenantKey(telegramId, 'telegramId');
  return this.findOne({ telegramId: String(telegramId).trim() });
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
    enum: [
      'deposit', 
      'withdrawal', 
      'campaign_spend', 
      'publisher_earning', 
      'referral_bonus', 
      'refund',
      'hold_release'
    ], 
    required: [true, 'Transaction type is required'],
    index: true 
  },
  amount: { 
    type: Number, 
    required: [true, 'Transaction amount is required'], 
    set: formatCurrency 
  },
  balanceAfter: { 
    type: Number, 
    required: [true, 'Balance after transaction is required'], 
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
  },
  status: {
    type: String,
    enum: ['completed', 'pending', 'failed', 'cancelled'],
    default: 'completed',
    index: true
  }
}, globalSchemaOptions);

transactionSchema.index({ userId: 1, createdAt: -1 });
transactionSchema.index({ telegramId: 1, createdAt: -1 });
transactionSchema.index({ userId: 1, type: 1, createdAt: -1 });
transactionSchema.index({ telegramId: 1, type: 1, createdAt: -1 });

transactionSchema.statics.getUserTransactionsIsolated = function(userId, filter = {}) {
  enforceTenantKey(userId, 'userId');
  return this.find({ ...filter, userId }).sort({ createdAt: -1 });
};

transactionSchema.statics.getByTelegramIdIsolated = function(telegramId, filter = {}) {
  enforceTenantKey(telegramId, 'telegramId');
  return this.find({ ...filter, telegramId: String(telegramId).trim() }).sort({ createdAt: -1 });
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
  description: {
    type: String,
    default: '',
    trim: true,
    maxlength: [300, 'Description must not exceed 300 characters']
  },
  targetUrl: { 
    type: String, 
    required: [true, 'Target URL is required'], 
    trim: true,
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
    min: [1, 'Minimum campaign budget is $1'], 
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
    min: [0, 'CPM rate cannot be negative'],
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
    min: [0, 'Publisher earnings cannot be negative'],
    set: formatCurrency
  },
  platformFeePerImpression: {
    type: Number,
    default: 0.00015,
    min: [0, 'Platform fee cannot be negative'],
    set: formatCurrency
  },
  impressionsCount: { 
    type: Number, 
    default: 0, 
    min: [0, 'Impressions count cannot be negative'] 
  },
  clicksCount: {
    type: Number,
    default: 0,
    min: [0, 'Clicks count cannot be negative']
  },
  status: { 
    type: String, 
    enum: ['active', 'paused', 'completed', 'cancelled', 'pending_approval'], 
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

adSchema.index({ userId: 1, status: 1, createdAt: -1 });
adSchema.index({ telegramId: 1, status: 1, createdAt: -1 });
adSchema.index({ advertiserTelegramId: 1, status: 1, createdAt: -1 });
adSchema.index({ status: 1, remainingBudget: 1, createdAt: -1 });

adSchema.statics.findAdvertiserAdsIsolated = function(userId, filter = {}) {
  enforceTenantKey(userId, 'userId');
  return this.find({ ...filter, $or: [{ userId }, { advertiserId: userId }] }).sort({ createdAt: -1 });
};

adSchema.statics.findAdvertiserAdsByTelegramIdIsolated = function(telegramId, filter = {}) {
  enforceTenantKey(telegramId, 'telegramId');
  const tgId = String(telegramId).trim();
  return this.find({ ...filter, $or: [{ telegramId: tgId }, { advertiserTelegramId: tgId }] }).sort({ createdAt: -1 });
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
    maxlength: [150, 'Link title must not exceed 150 characters'] 
  },
  targetUrl: { 
    type: String, 
    required: [true, 'Target URL is required'], 
    trim: true,
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
    min: [0, 'Valid impressions count cannot be negative'] 
  },
  invalidImpressions: { 
    type: Number, 
    default: 0, 
    min: [0, 'Invalid impressions count cannot be negative'] 
  },
  totalEarnings: {
    type: Number,
    default: 0,
    min: [0, 'Total earnings cannot be negative'],
    set: formatCurrency
  }
}, globalSchemaOptions);

linkSchema.pre('validate', function(next) {
  if (this.telegramId && !this.publisherTelegramId) this.publisherTelegramId = this.telegramId;
  if (this.publisherTelegramId && !this.telegramId) this.telegramId = this.publisherTelegramId;
  next();
});

linkSchema.index({ userId: 1, createdAt: -1 });
linkSchema.index({ telegramId: 1, createdAt: -1 });
linkSchema.index({ publisherTelegramId: 1, createdAt: -1 });
linkSchema.index({ userId: 1, isActive: 1, createdAt: -1 });
linkSchema.index({ telegramId: 1, isActive: 1, createdAt: -1 });
linkSchema.index({ userId: 1, shortCode: 1 });
linkSchema.index({ telegramId: 1, shortCode: 1 });

linkSchema.statics.getUserIsolatedLinks = function(userId, query = {}, options = {}) {
  enforceTenantKey(userId, 'userId');
  const safeQuery = { ...query, userId };
  return this.find(safeQuery, null, options).sort({ createdAt: -1 });
};

linkSchema.statics.getLinksByTelegramIdIsolated = function(telegramId, query = {}, options = {}) {
  enforceTenantKey(telegramId, 'telegramId');
  const safeQuery = { ...query, telegramId: String(telegramId).trim() };
  return this.find(safeQuery, null, options).sort({ createdAt: -1 });
};

linkSchema.statics.findOneIsolated = function(shortCode, userId) {
  enforceTenantKey(userId, 'userId');
  return this.findOne({ shortCode: String(shortCode).trim(), userId });
};

linkSchema.statics.findOneByTelegramIdIsolated = function(shortCode, telegramId) {
  enforceTenantKey(telegramId, 'telegramId');
  return this.findOne({ shortCode: String(shortCode).trim(), telegramId: String(telegramId).trim() });
};

// --------------------------------------------------
// 6. Traffic & Impressions Model
// --------------------------------------------------
const impressionSchema = new mongoose.Schema({
  linkId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Link', 
    required: [true, 'Link ID is required'], 
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
    enum: ['internal', 'adsgram', 'direct'], 
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
    required: [true, 'IP address is required'], 
    trim: true 
  },
  userAgent: { 
    type: String, 
    default: '', 
    trim: true 
  },
  isUnique: { 
    type: Boolean, 
    default: true,
    index: true
  },
  isValid: {
    type: Boolean,
    default: true,
    index: true
  },
  createdAt: { 
    type: Date, 
    default: Date.now, 
    expires: '90d' 
  }
}, globalSchemaOptions);

impressionSchema.pre('validate', function(next) {
  if (this.publisherId && !this.userId) this.userId = this.publisherId;
  if (this.userId && !this.publisherId) this.publisherId = this.userId;
  if (this.telegramId && !this.publisherTelegramId) this.publisherTelegramId = this.telegramId;
  if (this.publisherTelegramId && !this.telegramId) this.telegramId = this.publisherTelegramId;
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

impressionSchema.statics.getPublisherImpressionsByTelegramIdIsolated = function(telegramId, extraFilter = {}) {
  enforceTenantKey(telegramId, 'telegramId');
  const tgId = String(telegramId).trim();
  return this.find({ ...extraFilter, $or: [{ telegramId: tgId }, { publisherTelegramId: tgId }] }).sort({ createdAt: -1 });
};

// --------------------------------------------------
// 7. Anti-Bypass Click Session Model
// --------------------------------------------------
const clickSessionSchema = new mongoose.Schema({
  linkId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Link', 
    required: [true, 'Link ID is required'] 
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
    enum: ['internal', 'adsgram', 'direct'], 
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
    trim: true 
  },
  bridgeToken: { 
    type: String, 
    required: [true, 'Bridge token is required'],
    trim: true 
  },
  isCompleted: {
    type: Boolean,
    default: false
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
    min: [10, 'Minimum withdrawal limit is $10'],
    set: formatCurrency 
  },
  fee: {
    type: Number,
    default: 1,
    min: [0, 'Fee cannot be negative'],
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
    enum: ['pending', 'approved', 'rejected', 'processing'], 
    default: 'pending', 
    lowercase: true,
    index: true 
  },
  rejectReason: { 
    type: String, 
    default: '', 
    trim: true 
  },
  txHash: {
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
  const fee = typeof this.fee === 'number' ? this.fee : 1;
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

withdrawSchema.statics.getWithdrawalsByTelegramIdIsolated = function(telegramId, status = null) {
  enforceTenantKey(telegramId, 'telegramId');
  const query = { telegramId: String(telegramId).trim() };
  if (status) query.status = status;
  return this.find(query).sort({ createdAt: -1 });
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
  impressionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Impression',
    default: null,
    index: true
  },
  amount: { 
    type: Number, 
    required: [true, 'Hold amount is required'], 
    min: [0, 'Hold amount cannot be negative'],
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

earningsHoldSchema.statics.getHoldsByTelegramIdIsolated = function(telegramId) {
  enforceTenantKey(telegramId, 'telegramId');
  return this.find({ telegramId: String(telegramId).trim(), isReleased: false }).sort({ releaseAt: 1 });
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
    unique: true,
    index: true
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
  if (this.advertiserTelegramId && !this.telegramId) this.telegramId = this.advertiserTelegramId;
  next();
});

depositSchema.index({ userId: 1, status: 1, createdAt: -1 });
depositSchema.index({ telegramId: 1, status: 1, createdAt: -1 });
depositSchema.index({ advertiserTelegramId: 1, status: 1, createdAt: -1 });

depositSchema.statics.getAdvertiserDepositsIsolated = function(userId) {
  enforceTenantKey(userId, 'userId');
  return this.find({ $or: [{ userId }, { advertiserId: userId }] }).sort({ createdAt: -1 });
};

depositSchema.statics.getDepositsByTelegramIdIsolated = function(telegramId) {
  enforceTenantKey(telegramId, 'telegramId');
  const tgId = String(telegramId).trim();
  return this.find({ $or: [{ telegramId: tgId }, { advertiserTelegramId: tgId }] }).sort({ createdAt: -1 });
};

// --------------------------------------------------
// 11. Announcement Model
// --------------------------------------------------
const announcementSchema = new mongoose.Schema({
  title: { 
    type: String, 
    required: [true, 'Announcement title is required'], 
    trim: true 
  },
  content: { 
    type: String, 
    required: [true, 'Announcement content is required'], 
    trim: true 
  },
  type: {
    type: String,
    enum: ['info', 'warning', 'success', 'alert'],
    default: 'info'
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
    index: true 
  }
}, globalSchemaOptions);

announcementSchema.index({ isActive: 1, targetUser: 1, createdAt: -1 });
announcementSchema.index({ isActive: 1, targetTelegramId: 1, createdAt: -1 });

announcementSchema.statics.getForUserIsolated = function(userId, telegramId = null) {
  const queryArr = [{ targetUser: null, targetTelegramId: null }];
  if (userId) queryArr.push({ targetUser: userId });
  if (telegramId) queryArr.push({ targetTelegramId: String(telegramId).trim() });

  return this.find({
    isActive: true,
    $or: queryArr
  }).sort({ createdAt: -1 });
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
