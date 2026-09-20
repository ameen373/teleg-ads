/**
 * Enterprise Models Architecture (Optimized for High Scale & Concurrency)
 * Platform: Telega.ads Advertising & Shortener Network
 * Security: Zero-Data-Leakage Enforcement, Dynamic Context Scoping, Dual-ID Ownership Bindings
 */

if (typeof window !== 'undefined') {
  throw new Error("Critical Security Alert: Mongoose models must run exclusively on the server side.");
}

const mongoose = require('mongoose');

// Precision currency formatter up to 5 decimal places
const formatCurrency = (val) => {
  if (typeof val !== 'number' || isNaN(val) || !isFinite(val)) return 0;
  return Math.round((val + Number.EPSILON) * 100000) / 100000;
};

// Robust Telegram ID normalizer to prevent sparse unique index collisions with empty/undefined strings
const sanitizeTelegramId = (v) => {
  if (!v || v === 'undefined' || v === 'null' || String(v).trim() === '') return null;
  return String(v).trim();
};

// Global Schema Options for strict data isolation, timestamps, and safe JSON serialization
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

// Safe tenant key normalizer (prevents unhandled exceptions on new or unauthenticated users)
const enforceTenantKey = (tenantKey, keyName = 'userId') => {
  const cleaned = sanitizeTelegramId(tenantKey);
  return cleaned;
};

// ==================================================
// 1. User Model (Isolated Profiles, Balances & Stats)
// ==================================================
const userSchema = new mongoose.Schema({
  telegramId: { 
    type: String, 
    default: null,
    unique: true, 
    sparse: true,
    index: true,
    trim: true,
    set: sanitizeTelegramId
  },
  username: { 
    type: String, 
    default: '', 
    trim: true,
    lowercase: true,
    index: true
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
    validate: {
      validator: function(v) {
        if (!v || v === '' || typeof v !== 'string') return true;
        const cleanV = v.trim();
        if (cleanV === '') return true;
        const isTron = /^T[A-Za-z1-9]{33}$/.test(cleanV);
        const isEvm = /^0x[a-fA-F0-9]{40}$/.test(cleanV);
        return isTron || isEvm;
      },
      message: 'Invalid wallet address format (Must be valid USDT TRC20 or BEP20/ERC20 address)'
    }
  },
  statsSummary: {
    totalLinksCreated: { type: Number, default: 0, min: [0, 'Stats cannot be negative'] },
    totalViewsReceived: { type: Number, default: 0, min: [0, 'Stats cannot be negative'] },
    totalValidViews: { type: Number, default: 0, min: [0, 'Stats cannot be negative'] },
    totalLifetimeEarned: { type: Number, default: 0, min: [0, 'Stats cannot be negative'], set: formatCurrency },
    totalSpent: { type: Number, default: 0, min: [0, 'Stats cannot be negative'], set: formatCurrency }
  }
}, globalSchemaOptions);

userSchema.index({ telegramId: 1, isBanned: 1 }, { sparse: true });
userSchema.index({ createdAt: -1 });

// Fixed & Upgraded: Automatically provision/create new users if they don't exist in DB
userSchema.statics.findByTelegramIdIsolated = async function(telegramId, userData = {}) {
  const tgStr = enforceTenantKey(telegramId, 'telegramId');
  if (!tgStr) return null;
  let user = await this.findOne({ telegramId: tgStr });
  if (!user) {
    try {
      user = await this.create({
        telegramId: tgStr,
        username: userData.username || '',
        firstName: userData.firstName || '',
        lastName: userData.lastName || '',
        language: userData.language || 'ar'
      });
    } catch (err) {
      user = await this.findOne({ telegramId: tgStr });
    }
  }
  return user;
};

// ==================================================
// 2. Wallet Model (Central Balance Control)
// ==================================================
const walletSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    default: null,
    index: true 
  },
  telegramId: { 
    type: String, 
    default: null,
    unique: true,
    sparse: true,
    index: true, 
    trim: true,
    set: sanitizeTelegramId
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
  currency: { 
    type: String, 
    default: 'USDT', 
    uppercase: true, 
    trim: true 
  }
}, globalSchemaOptions);

walletSchema.index({ userId: 1, createdAt: -1 });
walletSchema.index({ userId: 1, telegramId: 1 });

walletSchema.statics.getWalletIsolated = async function(identifier) {
  if (!identifier) return null;
  let query = {};
  let tgStr = null;
  
  if (mongoose.Types.ObjectId.isValid(identifier)) {
    query = { userId: identifier };
  } else {
    tgStr = sanitizeTelegramId(identifier);
    if (!tgStr) return null;
    query = { telegramId: tgStr };
  }
  
  let wallet = await this.findOne(query);
  if (!wallet && tgStr) {
    let user = await mongoose.models.User.findOne({ telegramId: tgStr });
    if (!user) {
      try {
        user = await mongoose.models.User.create({ telegramId: tgStr });
      } catch (err) {
        user = await mongoose.models.User.findOne({ telegramId: tgStr });
      }
    }
    try {
      wallet = await this.create({
        telegramId: tgStr,
        userId: user ? user._id : null,
        availableBalance: 0,
        pendingBalance: 0
      });
    } catch (err) {
      wallet = await this.findOne(query);
    }
  }
  return wallet;
};

// ==================================================
// 3. Transaction History Model
// ==================================================
const transactionSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    default: null, 
    index: true 
  },
  telegramId: { 
    type: String, 
    default: null,
    index: true, 
    trim: true,
    set: sanitizeTelegramId
  },
  type: { 
    type: String, 
    enum: ['deposit', 'withdrawal', 'campaign_spend', 'publisher_earning', 'referral_bonus', 'refund', 'hold_release'], 
    required: [true, 'Transaction type is required'],
    index: true 
  },
  amount: { 
    type: Number, 
    required: [true, 'Transaction amount is required'],
    min: [0, 'Transaction amount cannot be negative'], 
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

transactionSchema.statics.getUserTransactionsIsolated = function(telegramId, filter = {}) {
  const tgStr = enforceTenantKey(telegramId, 'telegramId');
  if (!tgStr) return this.find({ _id: { $exists: false } });
  return this.find({ ...filter, $or: [{ telegramId: tgStr }] }).sort({ createdAt: -1 });
};

// ==================================================
// 4. Ad Campaign Model (Ad / Campaign)
// ==================================================
const adSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    default: null, 
    index: true 
  },
  telegramId: {
    type: String,
    default: null,
    index: true,
    trim: true,
    set: sanitizeTelegramId
  },
  advertiserId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    default: null, 
    index: true 
  },
  advertiserTelegramId: {
    type: String,
    default: null,
    index: true,
    trim: true,
    set: sanitizeTelegramId
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
        if (!v) return false;
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
  status: { 
    type: String, 
    enum: ['active', 'paused', 'completed', 'cancelled', 'pending'], 
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

adSchema.index({ userId: 1, createdAt: -1 });
adSchema.index({ userId: 1, status: 1, createdAt: -1 });
adSchema.index({ telegramId: 1, status: 1, createdAt: -1 });
adSchema.index({ advertiserTelegramId: 1, status: 1, createdAt: -1 });
adSchema.index({ status: 1, remainingBudget: 1, createdAt: -1 });

adSchema.statics.findAdvertiserAdsIsolated = function(telegramId, filter = {}) {
  const tgStr = enforceTenantKey(telegramId, 'telegramId');
  if (!tgStr) return this.find({ _id: { $exists: false } });
  return this.find({ ...filter, $or: [{ telegramId: tgStr }, { advertiserTelegramId: tgStr }] }).sort({ createdAt: -1 });
};

// ==================================================
// 5. Shortened Link Model (Link / ShortLink)
// ==================================================
const linkSchema = new mongoose.Schema({
  shortCode: { 
    type: String, 
    required: [true, 'Short code is required'], 
    unique: true, 
    sparse: true,
    index: true,
    trim: true 
  },
  originalUrl: {
    type: String,
    required: [true, 'Original URL is required'],
    trim: true
  },
  targetUrl: { 
    type: String, 
    trim: true 
  },
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    default: null,
    index: true
  },
  telegramId: {
    type: String,
    default: null,
    index: true,
    trim: true,
    set: sanitizeTelegramId
  },
  publisherTelegramId: {
    type: String,
    default: null,
    index: true,
    trim: true,
    set: sanitizeTelegramId
  },
  title: { 
    type: String, 
    default: 'Untitled Link', 
    trim: true,
    maxlength: 150 
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
  clicks: {
    type: Number,
    default: 0,
    min: [0, 'Clicks count cannot be negative']
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
  if (this.originalUrl && !this.targetUrl) this.targetUrl = this.originalUrl;
  if (this.targetUrl && !this.originalUrl) this.originalUrl = this.targetUrl;

  if (this.telegramId && !this.publisherTelegramId) this.publisherTelegramId = this.telegramId;
  if (this.publisherTelegramId && !this.telegramId) this.telegramId = this.publisherTelegramId;

  if (this.clicks > 0 && this.views === 0) this.views = this.clicks;
  if (this.views > 0 && this.clicks === 0) this.clicks = this.views;

  next();
});

linkSchema.index({ userId: 1, createdAt: -1 });
linkSchema.index({ telegramId: 1, createdAt: -1 });
linkSchema.index({ publisherTelegramId: 1, createdAt: -1 });
linkSchema.index({ telegramId: 1, isActive: 1, createdAt: -1 });
linkSchema.index({ shortCode: 1, isActive: 1 });

linkSchema.statics.getUserIsolatedLinks = function(telegramId, query = {}, options = {}) {
  const tgStr = enforceTenantKey(telegramId, 'telegramId');
  if (!tgStr) return this.find({ _id: { $exists: false } });
  const safeQuery = { 
    ...query, 
    $or: [{ telegramId: tgStr }, { publisherTelegramId: tgStr }] 
  };
  return this.find(safeQuery, null, options).sort({ createdAt: -1 });
};

linkSchema.statics.findOneIsolated = function(shortCode, telegramId) {
  const tgStr = enforceTenantKey(telegramId, 'telegramId');
  if (!tgStr || !shortCode) return null;
  return this.findOne({ 
    shortCode: String(shortCode).trim(), 
    $or: [{ telegramId: tgStr }, { publisherTelegramId: tgStr }] 
  });
};

linkSchema.statics.findByShortCode = function(shortCode) {
  if (!shortCode) return null;
  return this.findOne({ shortCode: String(shortCode).trim(), isActive: true });
};

// ==================================================
// 6. Traffic & Impressions Model (Impression)
// ==================================================
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
    default: null,
    index: true
  },
  telegramId: {
    type: String,
    default: null,
    trim: true,
    index: true,
    set: sanitizeTelegramId
  },
  publisherId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true
  },
  publisherTelegramId: {
    type: String,
    default: null,
    trim: true,
    index: true,
    set: sanitizeTelegramId
  },
  viewerTelegramId: {
    type: String,
    default: null,
    trim: true,
    index: true,
    set: sanitizeTelegramId
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
    min: [0, 'Earnings cannot be negative'],
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

impressionSchema.index({ userId: 1, createdAt: -1 });
impressionSchema.index({ telegramId: 1, createdAt: -1 });
impressionSchema.index({ publisherTelegramId: 1, createdAt: -1 });
impressionSchema.index({ linkId: 1, telegramId: 1, createdAt: -1 });
impressionSchema.index({ ip: 1, linkId: 1, createdAt: -1 });

impressionSchema.statics.getPublisherImpressionsIsolated = function(telegramId, extraFilter = {}) {
  const tgStr = enforceTenantKey(telegramId, 'telegramId');
  if (!tgStr) return this.find({ _id: { $exists: false } });
  return this.find({ ...extraFilter, $or: [{ telegramId: tgStr }, { publisherTelegramId: tgStr }, { viewerTelegramId: tgStr }] }).sort({ createdAt: -1 });
};

// ==================================================
// 7. Anti-Bypass Click Session Model (ClickSession)
// ==================================================
const clickSessionSchema = new mongoose.Schema({
  linkId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Link', 
    required: [true, 'Link ID is required'] 
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true
  },
  telegramId: {
    type: String,
    default: null,
    trim: true,
    index: true,
    set: sanitizeTelegramId
  },
  publisherId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true
  },
  visitorTelegramId: { 
    type: String, 
    default: null, 
    trim: true,
    index: true,
    set: sanitizeTelegramId
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
    trim: true 
  },
  bridgeToken: { 
    type: String, 
    required: [true, 'Bridge token is required'],
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
clickSessionSchema.index({ bridgeToken: 1 }, { unique: true, sparse: true });

// ==================================================
// 8. Withdrawal Model (Withdraw / Withdrawal)
// ==================================================
const withdrawSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    default: null,
    index: true 
  },
  telegramId: {
    type: String,
    default: null,
    trim: true,
    index: true,
    set: sanitizeTelegramId
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
    required: [true, 'Net withdrawal amount is required'],
    min: [0, 'Net amount cannot be negative'],
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
    enum: ['pending', 'completed', 'approved', 'rejected'], 
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

withdrawSchema.index({ userId: 1, createdAt: -1 });
withdrawSchema.index({ telegramId: 1, createdAt: -1 });
withdrawSchema.index({ telegramId: 1, status: 1, createdAt: -1 });

withdrawSchema.index(
  { telegramId: 1, status: 'pending' }, 
  { unique: true, sparse: true, partialFilterExpression: { status: 'pending' } }
);

withdrawSchema.statics.getUserWithdrawalsIsolated = function(telegramId, status = null) {
  const tgStr = enforceTenantKey(telegramId, 'telegramId');
  if (!tgStr) return this.find({ _id: { $exists: false } });
  const query = { $or: [{ telegramId: tgStr }] };
  if (status) query.status = status;
  return this.find(query).sort({ createdAt: -1 });
};

// ==================================================
// 9. Earnings Hold Model (EarningsHold)
// ==================================================
const earningsHoldSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    default: null, 
    index: true 
  },
  telegramId: {
    type: String,
    default: null,
    trim: true,
    index: true,
    set: sanitizeTelegramId
  },
  amount: { 
    type: Number, 
    required: [true, 'Hold amount is required'], 
    min: [0, 'Hold amount cannot be negative'],
    set: formatCurrency 
  },
  releaseAt: { 
    type: Date, 
    required: [true, 'Release date is required'], 
    default: () => new Date(Date.now() + 24 * 60 * 60 * 1000),
    index: true 
  },
  isReleased: { 
    type: Boolean, 
    default: false, 
    index: true 
  }
}, globalSchemaOptions);

earningsHoldSchema.index({ userId: 1, createdAt: -1 });
earningsHoldSchema.index({ telegramId: 1, isReleased: 1, releaseAt: 1 });

earningsHoldSchema.statics.getUserHoldsIsolated = function(telegramId) {
  const tgStr = enforceTenantKey(telegramId, 'telegramId');
  if (!tgStr) return this.find({ _id: { $exists: false } });
  return this.find({ telegramId: tgStr, isReleased: false }).sort({ releaseAt: 1 });
};

// ==================================================
// 10. Advertiser Deposit Model (Deposit)
// ==================================================
const depositSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true
  },
  telegramId: {
    type: String,
    default: null,
    trim: true,
    index: true,
    set: sanitizeTelegramId
  },
  advertiserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true
  },
  advertiserTelegramId: {
    type: String,
    default: null,
    trim: true,
    index: true,
    set: sanitizeTelegramId
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
    required: [true, 'Please select network (BEP20, TRC20, or TON)'],
    trim: true,
    uppercase: true
  },
  txid: {
    type: String,
    required: [true, 'Transaction hash (TxID) is required'],
    trim: true,
    unique: true,
    sparse: true
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'approved', 'rejected'],
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

depositSchema.index({ userId: 1, createdAt: -1 });
depositSchema.index({ telegramId: 1, status: 1, createdAt: -1 });
depositSchema.index({ advertiserTelegramId: 1, status: 1, createdAt: -1 });

depositSchema.statics.getAdvertiserDepositsIsolated = function(telegramId) {
  const tgStr = enforceTenantKey(telegramId, 'telegramId');
  if (!tgStr) return this.find({ _id: { $exists: false } });
  return this.find({ $or: [{ telegramId: tgStr }, { advertiserTelegramId: tgStr }] }).sort({ createdAt: -1 });
};

// ==================================================
// 11. Announcement Model (Announcement)
// ==================================================
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
    set: sanitizeTelegramId 
  }
}, globalSchemaOptions);

announcementSchema.index({ isActive: 1, targetUser: 1, createdAt: -1 });
announcementSchema.index({ isActive: 1, targetTelegramId: 1, createdAt: -1 });

announcementSchema.statics.getForUserIsolated = function(userId, telegramId) {
  const targetTgId = sanitizeTelegramId(telegramId);
  const orConditions = [
    { targetUser: null, targetTelegramId: null }
  ];
  if (userId) orConditions.push({ targetUser: userId });
  if (targetTgId) orConditions.push({ targetTelegramId: targetTgId });

  return this.find({
    isActive: true,
    $or: orConditions
  }).sort({ createdAt: -1 });
};

// ==================================================
// Model Instantiation & Aliases (Serverless & Overwrite Safe)
// ==================================================
const User = mongoose.models.User || mongoose.model('User', userSchema);
const Wallet = mongoose.models.Wallet || mongoose.model('Wallet', walletSchema);
const Transaction = mongoose.models.Transaction || mongoose.model('Transaction', transactionSchema);

const Ad = mongoose.models.Ad || mongoose.model('Ad', adSchema, 'ads');
const Campaign = mongoose.models.Campaign || mongoose.model('Campaign', adSchema, 'ads');

const Link = mongoose.models.Link || mongoose.model('Link', linkSchema, 'links');
const ShortLink = mongoose.models.ShortLink || mongoose.model('ShortLink', linkSchema, 'links');

const Impression = mongoose.models.Impression || mongoose.model('Impression', impressionSchema);
const ClickSession = mongoose.models.ClickSession || mongoose.model('ClickSession', clickSessionSchema);

const Withdraw = mongoose.models.Withdraw || mongoose.model('Withdraw', withdrawSchema, 'withdraws');
const Withdrawal = mongoose.models.Withdrawal || mongoose.model('Withdrawal', withdrawSchema, 'withdraws');

const EarningsHold = mongoose.models.EarningsHold || mongoose.model('EarningsHold', earningsHoldSchema);
const Deposit = mongoose.models.Deposit || mongoose.model('Deposit', depositSchema);
const Announcement = mongoose.models.Announcement || mongoose.model('Announcement', announcementSchema);

// ==================================================
// Module Exports
// ==================================================
module.exports = {
  User,
  Wallet,
  Transaction,
  Ad,
  Campaign,
  Link,
  ShortLink,
  Impression,
  ClickSession,
  Withdraw,
  Withdrawal,
  EarningsHold,
  Deposit,
  Announcement
};
