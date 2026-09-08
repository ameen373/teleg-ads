/**
 * Telega.ads Network Models - Telegram ID Primary Isolation Architecture
 * Platform: Telega.ads Advertising & Shortener Network
 * Primary Key & Unique Identifier: telegramId Across All Schemas
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
const enforceTenantKey = (tenantKey, keyName = 'telegramId') => {
  if (!tenantKey) {
    throw new Error(`Security Violation [Tenant Isolation]: Access denied. Missing strictly required parameter: ${keyName}`);
  }
};

// --------------------------------------------------
// 1. User Model (Primary Tenant Identifier: telegramId)
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
    type: String, 
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

// --------------------------------------------------
// 2. Isolated Wallet Model (Bound to telegramId)
// --------------------------------------------------
const walletSchema = new mongoose.Schema({
  telegramId: { 
    type: String, 
    ref: 'User',
    required: [true, 'Telegram ID is required for wallet binding'], 
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

walletSchema.statics.getWalletIsolated = function(telegramId) {
  enforceTenantKey(telegramId, 'telegramId');
  return this.findOne({ telegramId: String(telegramId).trim() });
};

// --------------------------------------------------
// 3. Isolated Transaction History Model
// --------------------------------------------------
const transactionSchema = new mongoose.Schema({
  telegramId: { 
    type: String, 
    ref: 'User',
    required: [true, 'Telegram ID is required for tenant isolation'], 
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

transactionSchema.index({ telegramId: 1, createdAt: -1 });
transactionSchema.index({ telegramId: 1, type: 1, createdAt: -1 });

transactionSchema.statics.getUserTransactionsIsolated = function(telegramId, filter = {}) {
  enforceTenantKey(telegramId, 'telegramId');
  return this.find({ ...filter, telegramId: String(telegramId).trim() }).sort({ createdAt: -1 });
};

// --------------------------------------------------
// 4. Self-Serve Ad Model (Campaigns - Bound to telegramId)
// --------------------------------------------------
const adSchema = new mongoose.Schema({
  advertiserTelegramId: {
    type: String,
    ref: 'User',
    required: [true, 'Advertiser Telegram ID is required'],
    index: true,
    trim: true
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

adSchema.index({ advertiserTelegramId: 1, status: 1, createdAt: -1 });
adSchema.index({ status: 1, remainingBudget: 1, createdAt: -1 });

adSchema.statics.findAdvertiserAdsIsolated = function(telegramId, filter = {}) {
  enforceTenantKey(telegramId, 'telegramId');
  return this.find({ ...filter, advertiserTelegramId: String(telegramId).trim() }).sort({ createdAt: -1 });
};

// --------------------------------------------------
// 5. Shortened Link Model (Bound to telegramId)
// --------------------------------------------------
const linkSchema = new mongoose.Schema({
  shortCode: { 
    type: String, 
    required: [true, 'Short code is required'], 
    unique: true, 
    index: true,
    trim: true 
  },
  telegramId: {
    type: String,
    ref: 'User',
    required: [true, 'Telegram ID is required for publisher link ownership'],
    index: true,
    trim: true
  },
  title: { 
    type: String, 
    default: 'Untitled Link', 
    trim: true,
    maxlength: 150 
  },
  targetUrl: { 
    type: String, 
    required: [true, 'Target URL is required'], 
    trim: true 
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

linkSchema.index({ telegramId: 1, createdAt: -1 });
linkSchema.index({ telegramId: 1, isActive: 1, createdAt: -1 });
linkSchema.index({ telegramId: 1, shortCode: 1 });

linkSchema.statics.getUserIsolatedLinks = function(telegramId, query = {}, options = {}) {
  enforceTenantKey(telegramId, 'telegramId');
  const safeQuery = { ...query, telegramId: String(telegramId).trim() };
  return this.find(safeQuery, null, options).sort({ createdAt: -1 });
};

linkSchema.statics.findOneIsolated = function(shortCode, telegramId) {
  enforceTenantKey(telegramId, 'telegramId');
  return this.findOne({ shortCode, telegramId: String(telegramId).trim() });
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
  publisherTelegramId: {
    type: String,
    ref: 'User',
    required: [true, 'Publisher Telegram ID is required'],
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

impressionSchema.index({ publisherTelegramId: 1, createdAt: -1 });
impressionSchema.index({ linkId: 1, publisherTelegramId: 1, createdAt: -1 });
impressionSchema.index({ ip: 1, linkId: 1, createdAt: -1 });

impressionSchema.statics.getPublisherImpressionsIsolated = function(publisherTelegramId, extraFilter = {}) {
  enforceTenantKey(publisherTelegramId, 'publisherTelegramId');
  return this.find({ ...extraFilter, publisherTelegramId: String(publisherTelegramId).trim() }).sort({ createdAt: -1 });
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
  publisherTelegramId: {
    type: String,
    ref: 'User',
    required: [true, 'Publisher Telegram ID is required'],
    trim: true,
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

clickSessionSchema.index({ linkId: 1, ip: 1 });
clickSessionSchema.index({ publisherTelegramId: 1, createdAt: -1 });
clickSessionSchema.index({ bridgeToken: 1 }, { unique: true });

// --------------------------------------------------
// 8. Withdraw Request Model (Bound to telegramId)
// --------------------------------------------------
const withdrawSchema = new mongoose.Schema({
  telegramId: {
    type: String,
    ref: 'User',
    required: [true, 'Telegram ID is required for withdrawal isolation'],
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

withdrawSchema.index({ telegramId: 1, status: 1, createdAt: -1 });

withdrawSchema.index(
  { telegramId: 1, status: 'pending' }, 
  { unique: true, partialFilterExpression: { status: 'pending' } }
);

withdrawSchema.statics.getUserWithdrawalsIsolated = function(telegramId, status = null) {
  enforceTenantKey(telegramId, 'telegramId');
  const query = { telegramId: String(telegramId).trim() };
  if (status) query.status = status;
  return this.find(query).sort({ createdAt: -1 });
};

// --------------------------------------------------
// 9. Earnings Hold Model (Bound to telegramId)
// --------------------------------------------------
const earningsHoldSchema = new mongoose.Schema({
  telegramId: {
    type: String,
    ref: 'User',
    required: [true, 'Telegram ID is required for holds isolation'],
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

earningsHoldSchema.index({ telegramId: 1, isReleased: 1, releaseAt: 1 });

earningsHoldSchema.statics.getUserHoldsIsolated = function(telegramId) {
  enforceTenantKey(telegramId, 'telegramId');
  return this.find({ telegramId: String(telegramId).trim(), isReleased: false }).sort({ releaseAt: 1 });
};

// --------------------------------------------------
// 10. Advertiser Deposit Model (Bound to telegramId)
// --------------------------------------------------
const depositSchema = new mongoose.Schema({
  advertiserTelegramId: {
    type: String,
    ref: 'User',
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

depositSchema.index({ advertiserTelegramId: 1, status: 1, createdAt: -1 });

depositSchema.statics.getAdvertiserDepositsIsolated = function(advertiserTelegramId) {
  enforceTenantKey(advertiserTelegramId, 'advertiserTelegramId');
  return this.find({ advertiserTelegramId: String(advertiserTelegramId).trim() }).sort({ createdAt: -1 });
};

// --------------------------------------------------
// 11. Announcement Model (Bound to targetTelegramId)
// --------------------------------------------------
const announcementSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  content: { type: String, required: true, trim: true },
  isActive: { type: Boolean, default: true, index: true },
  targetTelegramId: { type: String, ref: 'User', default: null, trim: true, index: true }
}, globalSchemaOptions);

announcementSchema.index({ isActive: 1, targetTelegramId: 1, createdAt: -1 });

announcementSchema.statics.getForUserIsolated = function(telegramId) {
  return this.find({
    isActive: true,
    $or: [
      { targetTelegramId: null },
      { targetTelegramId: String(telegramId).trim() }
    ]
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
