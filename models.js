/**
 * Ultra-Enterprise Models Architecture (V7.0 Supreme - Precision Integer Math, Zero Data-Leakage & Fraud Guard)
 * Platform: Telega.ads Network & Shortener Engine
 * Security: Multi-Tenant Isolation, Partial Index Race-Condition Protection, Micro-Unit Currency Standard
 */

if (typeof window !== 'undefined') {
  throw new Error("Critical Security Alert: Mongoose models must run exclusively on the server side.");
}

const mongoose = require('mongoose');
const { Schema } = mongoose;

// --------------------------------------------------
// Global Helpers, Currency Standard & Security Utilities
// --------------------------------------------------

/**
 * Currency Micro-Unit Converter
 * 1 USD = 1,000,000 Micro-units (1 Micro-unit = $0.000001 USD)
 * Prevents JavaScript IEEE-754 Floating-Point errors completely.
 */
const CurrencyUtils = {
  MICRO_FACTOR: 1000000,
  usdToMicro: (usd) => Math.round((Number(usd) || 0) * 1000000),
  microToUsd: (micro) => (Number(micro) || 0) / 1000000
};

// Strict Integer Currency Validator
const integerValidator = {
  validator: Number.isInteger,
  message: '{PATH} must be a strict integer micro-unit representation (1 USD = 1,000,000 Micro-units).'
};

// Multi-Chain Crypto Wallet Validator
const validateWalletAddress = (v) => {
  if (!v || v === '') return true;
  const isTron = /^T[A-Za-z1-9]{33}$/.test(v);
  const isEvm = /^0x[a-fA-F0-9]{40}$/.test(v);
  const isTon = /^[a-zA-Z0-9_-]{48}$/.test(v) || /^0:[a-fA-F0-9]{64}$/.test(v);
  return isTron || isEvm || isTon;
};

// Global Schema Serialization Options
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

// Tenant Isolation Guard
const enforceTenantKey = (tenantKey, keyName = 'userId') => {
  if (!tenantKey) {
    throw new Error(`Security Violation [Tenant Isolation]: Access denied. Missing strictly required parameter: ${keyName}`);
  }
};

// --------------------------------------------------
// 1. User Model (Profile, Global Controls & Stats)
// --------------------------------------------------
const userSchema = new Schema({
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
    lowercase: true,
    trim: true
  },
  role: { 
    type: String, 
    enum: ['publisher', 'advertiser', 'both', 'admin'], 
    default: 'both',
    index: true 
  },
  isActive: { 
    type: Boolean, 
    default: true,
    index: true 
  },
  isBanned: { 
    type: Boolean, 
    default: false, 
    index: true 
  },
  referredBy: { 
    type: Schema.Types.ObjectId, 
    ref: 'User', 
    default: null, 
    index: true 
  },
  referralEarnings: {
    type: Number,
    default: 0,
    min: 0,
    validate: integerValidator
  },
  defaultWallet: { 
    type: String, 
    default: '', 
    trim: true,
    validate: {
      validator: validateWalletAddress,
      message: 'Invalid wallet address format (USDT TRC20, BEP20, or TON)'
    }
  },
  statsSummary: {
    totalLinksCreated: { type: Number, default: 0, min: 0, validate: integerValidator },
    totalViewsReceived: { type: Number, default: 0, min: 0, validate: integerValidator },
    totalValidViews: { type: Number, default: 0, min: 0, validate: integerValidator },
    totalLifetimeEarned: { type: Number, default: 0, min: 0, validate: integerValidator }
  }
}, globalSchemaOptions);

userSchema.index({ telegramId: 1, isBanned: 1 });

userSchema.statics.findByTelegramIdIsolated = function(telegramId) {
  enforceTenantKey(telegramId, 'telegramId');
  return this.findOne({ telegramId: String(telegramId).trim() });
};

// --------------------------------------------------
// 2. High-Precision Isolated Wallet Model
// --------------------------------------------------
const walletSchema = new Schema({
  userId: { 
    type: Schema.Types.ObjectId, 
    ref: 'User', 
    required: [true, 'User ID is required for tenant isolation'], 
    unique: true, 
    index: true 
  },
  telegramId: {
    type: String,
    required: [true, 'Telegram ID is required'],
    index: true,
    trim: true
  },
  availableBalance: { 
    type: Number, 
    required: true, 
    default: 0,
    min: [0, 'Available balance cannot be negative'],
    validate: integerValidator
  },
  pendingBalance: { 
    type: Number, 
    required: true, 
    default: 0,
    min: [0, 'Pending balance cannot be negative'],
    validate: integerValidator
  },
  totalEarned: { 
    type: Number, 
    default: 0,
    min: 0,
    validate: integerValidator
  },
  totalSpent: { 
    type: Number, 
    default: 0,
    min: 0,
    validate: integerValidator
  },
  totalWithdrawn: {
    type: Number,
    default: 0,
    min: 0,
    validate: integerValidator
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

// Atomic Balance Credit Helper
walletSchema.statics.creditBalanceAtomic = async function(userId, amountMicro, target = 'availableBalance', session = null) {
  enforceTenantKey(userId, 'userId');
  if (!Number.isInteger(amountMicro) || amountMicro <= 0) throw new Error('Invalid credit amount');
  
  const updateQuery = { $inc: { [target]: amountMicro } };
  if (target === 'availableBalance' || target === 'pendingBalance') {
    updateQuery.$inc.totalEarned = amountMicro;
  }
  
  return this.findOneAndUpdate({ userId }, updateQuery, { new: true, session });
};

// Atomic Balance Debit Helper
walletSchema.statics.debitBalanceAtomic = async function(userId, amountMicro, target = 'availableBalance', session = null) {
  enforceTenantKey(userId, 'userId');
  if (!Number.isInteger(amountMicro) || amountMicro <= 0) throw new Error('Invalid debit amount');

  return this.findOneAndUpdate(
    { userId, [target]: { $gte: amountMicro } },
    { $inc: { [target]: -amountMicro, totalSpent: amountMicro } },
    { new: true, session }
  );
};

// --------------------------------------------------
// 3. Immutable Ledger Transactions Model
// --------------------------------------------------
const transactionSchema = new Schema({
  userId: { 
    type: Schema.Types.ObjectId, 
    ref: 'User', 
    required: true,
    index: true
  },
  telegramId: {
    type: String,
    required: true,
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
    validate: integerValidator
  },
  balanceAfter: {
    type: Number,
    required: true,
    validate: integerValidator
  },
  status: { 
    type: String, 
    enum: ['pending', 'completed', 'failed', 'refunded'], 
    default: 'completed',
    index: true
  },
  description: { 
    type: String, 
    default: '',
    trim: true 
  },
  referenceId: { 
    type: Schema.Types.ObjectId,
    default: null,
    index: true
  }
}, globalSchemaOptions);

transactionSchema.index({ userId: 1, createdAt: -1 });
transactionSchema.index({ telegramId: 1, createdAt: -1 });

transactionSchema.statics.getUserTransactionsIsolated = function(userId, filter = {}) {
  enforceTenantKey(userId, 'userId');
  return this.find({ ...filter, userId }).sort({ createdAt: -1 });
};

// --------------------------------------------------
// 4. Multi-Tenant Shortened Link Model
// --------------------------------------------------
const linkSchema = new Schema({
  userId: { 
    type: Schema.Types.ObjectId, 
    ref: 'User', 
    required: [true, 'User ID is required for multi-tenancy'],
    index: true
  },
  telegramId: {
    type: String,
    required: true,
    index: true,
    trim: true
  },
  shortCode: { 
    type: String, 
    required: [true, 'Short code is required'], 
    unique: true, 
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
    required: [true, 'Original target URL is required'],
    trim: true,
    match: [/^https?:\/\/.+/, 'Please present a valid HTTP/HTTPS URL']
  },
  clicksCount: { 
    type: Number, 
    default: 0,
    min: 0,
    validate: integerValidator
  },
  validImpressions: {
    type: Number,
    default: 0,
    min: 0,
    validate: integerValidator
  },
  invalidImpressions: {
    type: Number,
    default: 0,
    min: 0,
    validate: integerValidator
  },
  status: { 
    type: String, 
    enum: ['active', 'disabled'], 
    default: 'active',
    index: true
  }
}, globalSchemaOptions);

linkSchema.index({ userId: 1, createdAt: -1 });
linkSchema.index({ userId: 1, shortCode: 1 });

linkSchema.statics.getUserIsolatedLinks = function(userId, query = {}, options = {}) {
  enforceTenantKey(userId, 'userId');
  return this.find({ ...query, userId }, null, options).sort({ createdAt: -1 });
};

linkSchema.statics.findOneIsolated = function(shortCode, userId) {
  enforceTenantKey(userId, 'userId');
  return this.findOne({ shortCode, userId });
};

// --------------------------------------------------
// 5. High-Precision Campaign & Ad Model
// --------------------------------------------------
const campaignSchema = new Schema({
  userId: { 
    type: Schema.Types.ObjectId, 
    ref: 'User', 
    required: [true, 'Advertiser User ID is required'],
    index: true
  },
  telegramId: {
    type: String,
    required: true,
    index: true,
    trim: true
  },
  title: { 
    type: String, 
    required: [true, 'Campaign title is required'], 
    trim: true,
    maxlength: 120
  },
  targetUrl: { 
    type: String, 
    required: [true, 'Target URL is required'],
    trim: true,
    match: [/^https?:\/\/.+/,'Invalid target URL format']
  },
  budget: { 
    type: Number, 
    required: [true, 'Total campaign budget is required'],
    min: [1000000, 'Minimum budget is $1.00 USD (1,000,000 Micro-units)'],
    validate: integerValidator
  },
  remainingBudget: { 
    type: Number, 
    required: true,
    min: [0, 'Remaining budget cannot be negative'],
    validate: integerValidator
  },
  cpmRate: {
    type: Number,
    default: 1500000, // Default $1.50 CPM
    min: 0,
    validate: integerValidator
  },
  costPerClick: { 
    type: Number, 
    default: 10000, // Default $0.01 CPC
    min: 0,
    validate: integerValidator
  },
  costPerImpression: {
    type: Number,
    default: 1500, // $0.0015
    min: 0,
    validate: integerValidator
  },
  publisherEarningsPerImpression: {
    type: Number,
    default: 1350, // $0.00135
    min: 0,
    validate: integerValidator
  },
  platformFeePerImpression: {
    type: Number,
    default: 150, // $0.00015
    min: 0,
    validate: integerValidator
  },
  impressionsCount: { 
    type: Number, 
    default: 0,
    min: 0,
    validate: integerValidator
  },
  totalClicks: { 
    type: Number, 
    default: 0,
    min: 0,
    validate: integerValidator
  },
  status: { 
    type: String, 
    enum: ['active', 'paused', 'completed'], 
    default: 'active',
    index: true
  }
}, globalSchemaOptions);

campaignSchema.pre('validate', function(next) {
  if (this.isNew && this.remainingBudget === undefined) {
    this.remainingBudget = this.budget;
  }
  next();
});

campaignSchema.index({ userId: 1, status: 1, createdAt: -1 });
campaignSchema.index({ status: 1, remainingBudget: 1, createdAt: -1 });

campaignSchema.statics.findAdvertiserCampaignsIsolated = function(userId, filter = {}) {
  enforceTenantKey(userId, 'userId');
  return this.find({ ...filter, userId }).sort({ createdAt: -1 });
};

// --------------------------------------------------
// 6. Real-Time Impressions & Traffic Analytics Model
// --------------------------------------------------
const impressionSchema = new Schema({
  linkId: { 
    type: Schema.Types.ObjectId, 
    ref: 'Link', 
    required: true, 
    index: true 
  },
  publisherId: {
    type: Schema.Types.ObjectId,
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
  campaignId: { 
    type: Schema.Types.ObjectId, 
    ref: 'Campaign', 
    default: null,
    index: true
  },
  publisherEarnings: {
    type: Number,
    default: 1350, // $0.00135 in Micro-units
    validate: integerValidator
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
    expires: '60d' // Automatic 60-day document pruning
  }
}, globalSchemaOptions);

impressionSchema.index({ publisherId: 1, createdAt: -1 });
impressionSchema.index({ publisherTelegramId: 1, createdAt: -1 });
impressionSchema.index({ linkId: 1, publisherId: 1, createdAt: -1 });
impressionSchema.index({ ip: 1, linkId: 1, createdAt: -1 });

impressionSchema.statics.getPublisherImpressionsIsolated = function(userId, extraFilter = {}) {
  enforceTenantKey(userId, 'userId');
  return this.find({ ...extraFilter, publisherId: userId }).sort({ createdAt: -1 });
};

// --------------------------------------------------
// 7. Anti-Bypass Click Session Model (Fraud Prevention)
// --------------------------------------------------
const clickSessionSchema = new Schema({
  linkId: { 
    type: Schema.Types.ObjectId, 
    ref: 'Link', 
    required: true,
    index: true
  },
  publisherId: {
    type: Schema.Types.ObjectId,
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
  campaignId: { 
    type: Schema.Types.ObjectId, 
    ref: 'Campaign', 
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
    trim: true,
    unique: true
  },
  createdAt: { 
    type: Date, 
    default: Date.now, 
    expires: 300 // Auto-expires after 5 minutes (TTL Index)
  }
}, globalSchemaOptions);

clickSessionSchema.index({ linkId: 1, ip: 1 });
clickSessionSchema.index({ publisherId: 1, createdAt: -1 });
clickSessionSchema.index({ bridgeToken: 1 }, { unique: true });

// --------------------------------------------------
// 8. Atomic Withdrawals Queue & Fraud Guard Model
// --------------------------------------------------
const withdrawSchema = new Schema({
  userId: { 
    type: Schema.Types.ObjectId, 
    ref: 'User', 
    required: [true, 'User ID is required'], 
    index: true 
  },
  telegramId: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  amount: { 
    type: Number, 
    required: true,
    min: [30000000, 'Minimum withdrawal limit is $30.00 USD'], // $30 USD in Micro-units
    validate: integerValidator
  },
  fee: {
    type: Number,
    default: 3000000, // $3.00 USD Fee
    validate: integerValidator
  },
  netAmount: {
    type: Number,
    required: true,
    validate: integerValidator
  },
  network: {
    type: String,
    enum: ['BEP20', 'TRC20', 'TON'],
    required: [true, 'Withdrawal network selection is required'],
    trim: true,
    uppercase: true
  },
  walletAddress: { 
    type: String, 
    required: true, 
    trim: true,
    validate: {
      validator: validateWalletAddress,
      message: 'Invalid withdrawal wallet address format'
    }
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
  const fee = typeof this.fee === 'number' ? this.fee : 3000000;
  this.netAmount = Math.max(0, amount - fee);
  next();
});

withdrawSchema.index({ userId: 1, status: 1, createdAt: -1 });
withdrawSchema.index({ telegramId: 1, status: 1, createdAt: -1 });

// Partial Unique Index: Race-Condition Guard against double withdrawals
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
// 9. Earnings Hold Model (Pending Escrow Engine)
// --------------------------------------------------
const earningsHoldSchema = new Schema({
  userId: { 
    type: Schema.Types.ObjectId, 
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
    validate: integerValidator
  },
  releaseAt: { 
    type: Date, 
    required: true, 
    default: () => new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 Hours Default Hold
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

// --------------------------------------------------
// 10. Advertiser Deposit Model (Cryptocurrency Gateways)
// --------------------------------------------------
const depositSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required for tenant isolation'],
    index: true
  },
  telegramId: {
    type: String,
    required: [true, 'Telegram ID is required'],
    trim: true,
    index: true
  },
  amount: {
    type: Number,
    required: [true, 'Deposit amount is required'],
    min: [1000000, 'Minimum deposit limit is $1.00 USD'],
    validate: integerValidator
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

depositSchema.index({ userId: 1, status: 1, createdAt: -1 });
depositSchema.index({ telegramId: 1, status: 1, createdAt: -1 });

depositSchema.statics.getAdvertiserDepositsIsolated = function(userId) {
  enforceTenantKey(userId, 'userId');
  return this.find({ userId }).sort({ createdAt: -1 });
};

// --------------------------------------------------
// 11. System Announcements Model
// --------------------------------------------------
const announcementSchema = new Schema({
  title: { type: String, required: true, trim: true },
  content: { type: String, required: true, trim: true },
  isActive: { type: Boolean, default: true, index: true },
  targetUser: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
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

// --------------------------------------------------
// Model Compilation & Safe Singleton Export
// --------------------------------------------------
const User = mongoose.models.User || mongoose.model('User', userSchema);
const Wallet = mongoose.models.Wallet || mongoose.model('Wallet', walletSchema);
const Transaction = mongoose.models.Transaction || mongoose.model('Transaction', transactionSchema);
const Link = mongoose.models.Link || mongoose.model('Link', linkSchema);
const Campaign = mongoose.models.Campaign || mongoose.model('Campaign', campaignSchema);
const Impression = mongoose.models.Impression || mongoose.model('Impression', impressionSchema);
const ClickSession = mongoose.models.ClickSession || mongoose.model('ClickSession', clickSessionSchema);
const Withdraw = mongoose.models.Withdraw || mongoose.model('Withdraw', withdrawSchema);
const EarningsHold = mongoose.models.EarningsHold || mongoose.model('EarningsHold', earningsHoldSchema);
const Deposit = mongoose.models.Deposit || mongoose.model('Deposit', depositSchema);
const Announcement = mongoose.models.Announcement || mongoose.model('Announcement', announcementSchema);

module.exports = {
  CurrencyUtils,
  User,
  Wallet,
  Transaction,
  Link,
  Campaign,
  Impression,
  ClickSession,
  Withdraw,
  EarningsHold,
  Deposit,
  Announcement
};
