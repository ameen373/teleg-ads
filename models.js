/**
 * Ultra-Enterprise Models Architecture (V5.3 - Strict Multi-Tenant Isolation)
 * Platform: Telega.ads Advertising & Shortener Network
 * Security Enforcement: Mandatory userId Ownership Binding across all schemas
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

// Global Schema Options for strict data isolation and clean JSON serialization
const globalSchemaOptions = {
  timestamps: true,
  versionKey: '__v',
  toJSON: {
    virtuals: true,
    transform: function (doc, ret) {
      delete ret.__v;
      return ret;
    }
  },
  toObject: {
    virtuals: true,
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
  balance: {
    type: Number,
    default: 0,
    min: [0, 'Balance cannot be negative'],
    set: formatCurrency
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
        const isTon = /^[a-zA-Z0-9_-]{48}$/.test(v) \vert{}\vert{} /^0:[a-fA-F0-9]{64}$/.test(v);
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

userSchema.pre('save', function(next) {
  if (this.isModified('availableBalance')) {
    this.balance = this.availableBalance;
  } else if (this.isModified('balance')) {
    this.availableBalance = this.balance;
  }
  next();
});

userSchema.index({ telegramId: 1, isBanned: 1 });

userSchema.statics.findByTelegramIdIsolated = function(telegramId) {
  enforceTenantKey(telegramId, 'telegramId');
  return this.findOne({ telegramId: String(telegramId).trim() });
};

// --------------------------------------------------
// 2. ShortLink Schema (Isolated Multi-Tenant Links)
// --------------------------------------------------
const shortLinkSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    required: [true, 'User ID is strictly required for 100% tenant isolation'], 
    index: true
  },
  telegramId: {
    type: String,
    required: [true, 'Telegram ID is required for tenant isolation'],
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
  originalUrl: { 
    type: String, 
    required: [true, 'Original target URL is required'], 
    trim: true 
  },
  targetUrl: { 
    type: String, 
    required: [true, 'Target URL is required'], 
    trim: true 
  },
  title: { 
    type: String, 
    default: 'Untitled Link', 
    trim: true,
    maxlength: 150 
  },
  clicks: { 
    type: Number, 
    default: 0, 
    min: 0 
  },
  views: { 
    type: Number, 
    default: 0, 
    min: 0 
  },
  earnings: {
    type: Number,
    default: 0,
    min: 0,
    set: formatCurrency
  },
  isActive: { 
    type: Boolean, 
    default: true, 
    index: true 
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

shortLinkSchema.pre('validate', function(next) {
  if (this.originalUrl && !this.targetUrl) this.targetUrl = this.originalUrl;
  if (this.targetUrl && !this.originalUrl) this.originalUrl = this.targetUrl;
  next();
});

shortLinkSchema.index({ userId: 1, createdAt: -1 });
shortLinkSchema.index({ userId: 1, shortCode: 1 });
shortLinkSchema.index({ userId: 1, isActive: 1, createdAt: -1 });

shortLinkSchema.statics.getUserIsolatedLinks = function(userId, query = {}, options = {}) {
  enforceTenantKey(userId, 'userId');
  return this.find({ ...query, userId }, null, options).sort({ createdAt: -1 });
};

shortLinkSchema.statics.findOneIsolated = function(shortCode, userId) {
  enforceTenantKey(userId, 'userId');
  return this.findOne({ shortCode, userId });
};

// --------------------------------------------------
// 3. Campaign Schema (Ads / Campaigns)
// --------------------------------------------------
const campaignSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: [true, 'User ID is strictly required for tenant isolation'], 
    index: true 
  },
  telegramId: {
    type: String,
    required: [true, 'Telegram ID is required for fast tenant lookup'],
    index: true,
    trim: true
  },
  title: { 
    type: String, 
    required: [true, 'Campaign title is required'], 
    trim: true, 
    maxlength: [100, 'Title must not exceed 100 characters'] 
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
  budget: { 
    type: Number, 
    required: [true, 'Campaign budget is required'], 
    min: [1, 'Minimum campaign budget is $1'], 
    set: formatCurrency 
  },
  totalBudget: { 
    type: Number, 
    required: [true, 'Total budget is required'], 
    min: [1, 'Minimum campaign budget is $1'], 
    set: formatCurrency 
  },
  spent: {
    type: Number,
    default: 0,
    min: [0, 'Spent amount cannot be negative'],
    set: formatCurrency
  },
  remainingBudget: { 
    type: Number, 
    required: true, 
    min: [0, 'Remaining budget cannot be negative'], 
    set: formatCurrency 
  },
  status: { 
    type: String, 
    enum: ['active', 'paused', 'completed', 'failed', 'cancelled'], 
    default: 'active', 
    index: true 
  },
  impressions: { 
    type: Number, 
    default: 0, 
    min: 0 
  },
  clicks: { 
    type: Number, 
    default: 0, 
    min: 0 
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
  }
}, globalSchemaOptions);

campaignSchema.pre('validate', function(next) {
  if (typeof this.budget === 'number' && !this.totalBudget) this.totalBudget = this.budget;
  if (typeof this.totalBudget === 'number' && !this.budget) this.budget = this.totalBudget;
  if (typeof this.remainingBudget !== 'number') {
    this.remainingBudget = Math.max(0, (this.totalBudget || 0) - (this.spent || 0));
  }
  next();
});

campaignSchema.index({ userId: 1, status: 1, createdAt: -1 });
campaignSchema.index({ status: 1, remainingBudget: 1, createdAt: -1 });

campaignSchema.statics.findUserCampaignsIsolated = function(userId, filter = {}) {
  enforceTenantKey(userId, 'userId');
  return this.find({ ...filter, userId }).sort({ createdAt: -1 });
};

// --------------------------------------------------
// 4. Deposit Schema
// --------------------------------------------------
const depositSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is strictly required for tenant isolation'],
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
    required: [true, 'Deposit amount is required'],
    min: [1, 'Minimum deposit limit is $1'],
    set: formatCurrency
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'approved', 'rejected'],
    default: 'pending',
    lowercase: true,
    index: true
  },
  paymentMethod: {
    type: String,
    required: [true, 'Payment method is required'],
    default: 'Crypto',
    trim: true
  },
  network: {
    type: String,
    enum: ['BEP20', 'TRC20', 'TON', 'PAYEER', 'OTHER'],
    default: 'BEP20',
    trim: true,
    uppercase: true
  },
  transactionId: {
    type: String,
    required: [true, 'Transaction ID / TxID is required'],
    trim: true,
    unique: true,
    index: true
  },
  txid: {
    type: String,
    trim: true
  },
  rejectReason: {
    type: String,
    default: '',
    trim: true
  }
}, globalSchemaOptions);

depositSchema.pre('validate', function(next) {
  if (this.transactionId && !this.txid) this.txid = this.transactionId;
  if (this.txid && !this.transactionId) this.transactionId = this.txid;
  next();
});

depositSchema.index({ userId: 1, status: 1, createdAt: -1 });

depositSchema.statics.getUserDepositsIsolated = function(userId) {
  enforceTenantKey(userId, 'userId');
  return this.find({ userId }).sort({ createdAt: -1 });
};

// --------------------------------------------------
// 5. Withdrawal Schema
// --------------------------------------------------
const withdrawalSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: [true, 'User ID is strictly required for tenant isolation'], 
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
    required: [true, 'Withdrawal amount is required'], 
    min: [1, 'Minimum withdrawal limit is $1'],
    set: formatCurrency 
  },
  fee: {
    type: Number,
    default: 0,
    set: formatCurrency
  },
  netAmount: {
    type: Number,
    required: true,
    set: formatCurrency
  },
  walletAddress: { 
    type: String, 
    required: [true, 'Wallet address or payout detail is required'], 
    trim: true 
  },
  network: {
    type: String,
    enum: ['BEP20', 'TRC20', 'TON', 'PAYEER', 'OTHER'],
    default: 'BEP20',
    trim: true,
    uppercase: true
  },
  status: { 
    type: String, 
    enum: ['pending', 'completed', 'rejected', 'approved', 'failed'], 
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

withdrawalSchema.pre('validate', function(next) {
  const amount = typeof this.amount === 'number' ? this.amount : 0;
  const fee = typeof this.fee === 'number' ? this.fee : 0;
  this.netAmount = formatCurrency(Math.max(0, amount - fee));
  next();
});

withdrawalSchema.index({ userId: 1, status: 1, createdAt: -1 });

withdrawalSchema.statics.getUserWithdrawalsIsolated = function(userId, status = null) {
  enforceTenantKey(userId, 'userId');
  const query = { userId };
  if (status) query.status = status;
  return this.find(query).sort({ createdAt: -1 });
};

// --------------------------------------------------
// 6. Transaction Log Schema
// --------------------------------------------------
const transactionSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: [true, 'User ID is strictly required for tenant isolation'], 
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
    enum: ['deposit', 'withdraw', 'withdrawal', 'earning', 'publisher_earning', 'spend', 'campaign_spend', 'referral_bonus', 'refund'], 
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
    default: 0, 
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
transactionSchema.index({ userId: 1, type: 1, createdAt: -1 });

transactionSchema.statics.getUserTransactionsIsolated = function(userId, filter = {}) {
  enforceTenantKey(userId, 'userId');
  return this.find({ ...filter, userId }).sort({ createdAt: -1 });
};

// --------------------------------------------------
// 7. Wallet Central Ledger Model
// --------------------------------------------------
const walletSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: [true, 'User ID is strictly required for tenant isolation'], 
    unique: true,
    index: true 
  },
  telegramId: { 
    type: String, 
    required: [true, 'Telegram ID is required'], 
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

walletSchema.statics.getWalletIsolated = function(userId) {
  enforceTenantKey(userId, 'userId');
  return this.findOne({ userId });
};

// --------------------------------------------------
// 8. Traffic & Impression Tracking Model
// --------------------------------------------------
const impressionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is strictly required for tenant isolation'],
    index: true
  },
  telegramId: {
    type: String,
    required: [true, 'Telegram ID is required'],
    trim: true,
    index: true
  },
  linkId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Link', 
    required: true, 
    index: true 
  },
  adId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Campaign', 
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

impressionSchema.index({ userId: 1, createdAt: -1 });

impressionSchema.statics.getPublisherImpressionsIsolated = function(userId, extraFilter = {}) {
  enforceTenantKey(userId, 'userId');
  return this.find({ ...extraFilter, userId }).sort({ createdAt: -1 });
};

// --------------------------------------------------
// 9. Anti-Bypass Click Session Model
// --------------------------------------------------
const clickSessionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is strictly required for tenant isolation'],
    index: true
  },
  telegramId: {
    type: String,
    required: [true, 'Telegram ID is required'],
    trim: true,
    index: true
  },
  linkId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Link', 
    required: true 
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

clickSessionSchema.index({ linkId: 1, ip: 1 });
clickSessionSchema.index({ userId: 1, createdAt: -1 });
clickSessionSchema.index({ bridgeToken: 1 }, { unique: true });

// --------------------------------------------------
// 10. Earnings Hold Model
// --------------------------------------------------
const earningsHoldSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: [true, 'User ID is strictly required for tenant isolation'], 
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

earningsHoldSchema.statics.getUserHoldsIsolated = function(userId) {
  enforceTenantKey(userId, 'userId');
  return this.find({ userId, isReleased: false }).sort({ releaseAt: 1 });
};

// --------------------------------------------------
// 11. Announcements Model
// --------------------------------------------------
const announcementSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true
  },
  title: { type: String, required: true, trim: true },
  content: { type: String, required: true, trim: true },
  isActive: { type: Boolean, default: true, index: true },
  targetTelegramId: { type: String, default: null, trim: true, index: true }
}, globalSchemaOptions);

announcementSchema.index({ isActive: 1, userId: 1, createdAt: -1 });

announcementSchema.statics.getForUserIsolated = function(userId, telegramId) {
  return this.find({
    isActive: true,
    $or: [
      { userId: null, targetTelegramId: null },
      { userId: userId },
      { targetTelegramId: String(telegramId) }
    ]
  }).sort({ createdAt: -1 });
};

// --------------------------------------------------
// Model Compilations & Backward Compatibility Exports
// --------------------------------------------------
const User = mongoose.models.User || mongoose.model('User', userSchema);
const ShortLink = mongoose.models.ShortLink || mongoose.model('ShortLink', shortLinkSchema);
const Link = mongoose.models.Link || mongoose.models.ShortLink || mongoose.model('Link', shortLinkSchema);
const Campaign = mongoose.models.Campaign || mongoose.model('Campaign', campaignSchema);
const Ad = mongoose.models.Ad || mongoose.models.Campaign || mongoose.model('Ad', campaignSchema);
const Deposit = mongoose.models.Deposit || mongoose.model('Deposit', depositSchema);
const Withdrawal = mongoose.models.Withdrawal || mongoose.model('Withdrawal', withdrawalSchema);
const Withdraw = mongoose.models.Withdraw || mongoose.models.Withdrawal || mongoose.model('Withdraw', withdrawalSchema);
const Transaction = mongoose.models.Transaction || mongoose.model('Transaction', transactionSchema);
const Wallet = mongoose.models.Wallet || mongoose.model('Wallet', walletSchema);
const Impression = mongoose.models.Impression || mongoose.model('Impression', impressionSchema);
const ClickSession = mongoose.models.ClickSession || mongoose.model('ClickSession', clickSessionSchema);
const EarningsHold = mongoose.models.EarningsHold || mongoose.model('EarningsHold', earningsHoldSchema);
const Announcement = mongoose.models.Announcement || mongoose.model('Announcement', announcementSchema);

module.exports = {
  User,
  ShortLink,
  Link,
  Campaign,
  Ad,
  Deposit,
  Withdrawal,
  Withdraw,
  Transaction,
  Wallet,
  Impression,
  ClickSession,
  EarningsHold,
  Announcement
};
