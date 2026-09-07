/**
 * Ultra-Enterprise Models Architecture (V6.2 - Strict Telegram ID Persistence & Multi-Tenant Isolation)
 * Platform: Telega.ads Advertising & Shortener Network
 * Engine: Mongoose / Node.js
 */

if (typeof window !== 'undefined') {
  throw new Error("Critical Security Alert: Mongoose models must run exclusively on the server side.");
}

const mongoose = require('mongoose');

// --------------------------------------------------
// Helper Functions: Integer Cents Financial Engine
// --------------------------------------------------
const dollarsToCents = (val) => {
  if (typeof val !== 'number' || isNaN(val) || !isFinite(val)) return 0;
  return Math.round(val * 100);
};

const centsToDollars = (val) => {
  if (typeof val !== 'number' || isNaN(val)) return 0;
  return val / 100;
};

const currencyCentsField = (options = {}) => ({
  type: Number,
  default: 0,
  get: centsToDollars,
  set: dollarsToCents,
  ...options
});

const globalSchemaOptions = {
  timestamps: true,
  versionKey: '__v',
  toJSON: {
    getters: true,
    transform: function (doc, ret) {
      delete ret.__v;
      return ret;
    }
  },
  toObject: {
    getters: true,
    transform: function (doc, ret) {
      delete ret.__v;
      return ret;
    }
  }
};

const enforceTenantKey = (tenantKey, keyName = 'telegramId') => {
  if (!tenantKey) {
    throw new Error(`Security Violation [Tenant Isolation]: Access Denied. Missing required parameter: ${keyName}`);
  }
};

// --------------------------------------------------
// 1. User Model
// --------------------------------------------------
const userSchema = new mongoose.Schema({
  telegramId: { 
    type: String, 
    required: [true, 'Telegram ID is required'], 
    unique: true, 
    index: true,
    trim: true 
  },
  username: { type: String, default: '', trim: true, lowercase: true },
  firstName: { type: String, default: '', trim: true },
  lastName: { type: String, default: '', trim: true },
  language: { type: String, default: 'ar', trim: true, lowercase: true },
  role: { type: String, enum: ['user', 'admin'], default: 'user', index: true },
  pendingBalance: currencyCentsField(),
  availableBalance: currencyCentsField(),
  isBanned: { type: Boolean, default: false, index: true },
  referredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  referralEarnings: currencyCentsField(),
  defaultWallet: { type: String, default: '', trim: true },
  statsSummary: {
    totalLinksCreated: { type: Number, default: 0, min: 0 },
    totalViewsReceived: { type: Number, default: 0, min: 0 },
    totalValidViews: { type: Number, default: 0, min: 0 },
    totalLifetimeEarned: currencyCentsField()
  }
}, globalSchemaOptions);

userSchema.index({ telegramId: 1, isBanned: 1 });

userSchema.statics.findByTelegramIdIsolated = function(telegramId) {
  enforceTenantKey(telegramId, 'telegramId');
  return this.findOne({ telegramId: String(telegramId).trim() });
};

// --------------------------------------------------
// 2. Wallet Model
// --------------------------------------------------
const walletSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  telegramId: { 
    type: String, 
    required: [true, 'Telegram ID is required'], 
    unique: true,
    index: true, 
    trim: true 
  },
  availableBalance: currencyCentsField(),
  pendingBalance: currencyCentsField(),
  totalDeposited: currencyCentsField(),
  totalWithdrawn: currencyCentsField(),
  totalEarned: currencyCentsField(),
  currency: { type: String, default: 'USDT', uppercase: true, trim: true }
}, globalSchemaOptions);

walletSchema.index({ telegramId: 1 });

walletSchema.statics.getWalletIsolated = function(telegramId) {
  enforceTenantKey(telegramId, 'telegramId');
  return this.findOne({ telegramId: String(telegramId).trim() });
};

// --------------------------------------------------
// 3. Transaction Model
// --------------------------------------------------
const transactionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  telegramId: { 
    type: String, 
    required: [true, 'Telegram ID is required'], 
    index: true, 
    trim: true 
  },
  type: { 
    type: String, 
    enum: ['deposit', 'withdrawal', 'campaign_spend', 'publisher_earning', 'referral_bonus', 'refund'], 
    required: true,
    index: true 
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'approved', 'rejected', 'failed'],
    default: 'completed',
    lowercase: true,
    index: true
  },
  amount: currencyCentsField({ required: true }),
  balanceAfter: currencyCentsField({ default: 0 }),
  description: { type: String, default: '', trim: true },
  referenceId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true }
}, globalSchemaOptions);

transactionSchema.index({ telegramId: 1, createdAt: -1 });

// --------------------------------------------------
// 4. Campaign / Ad Model
// --------------------------------------------------
const adSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  telegramId: {
    type: String,
    required: [true, 'Telegram ID is required'],
    index: true,
    trim: true
  },
  advertiserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  advertiserTelegramId: { type: String, trim: true },
  title: { 
    type: String, 
    required: [true, 'Ad title is required'], 
    trim: true, 
    maxlength: [100, 'Ad title must not exceed 100 characters'] 
  },
  targetUrl: { type: String, required: [true, 'Target URL is required'], trim: true },
  totalBudget: currencyCentsField({ required: [true, 'Total budget is required'] }),
  remainingBudget: currencyCentsField({ required: true }),
  cpmRate: currencyCentsField({ default: 1.50 }),
  costPerImpression: currencyCentsField({ default: 0.0015 }),
  publisherEarningsPerImpression: currencyCentsField({ default: 0.00135 }),
  platformFeePerImpression: currencyCentsField({ default: 0.00015 }),
  impressionsCount: { type: Number, default: 0, min: 0 },
  status: { type: String, enum: ['active', 'paused', 'completed'], default: 'active', index: true }
}, globalSchemaOptions);

adSchema.pre('validate', function(next) {
  if (!this.advertiserTelegramId && this.telegramId) {
    this.advertiserTelegramId = this.telegramId;
  }
  next();
});

adSchema.index({ telegramId: 1, status: 1, createdAt: -1 });

// --------------------------------------------------
// 5. Shortened Link Model
// --------------------------------------------------
const linkSchema = new mongoose.Schema({
  shortCode: { 
    type: String, 
    required: [true, 'Short code is required'], 
    unique: true, 
    index: true,
    trim: true 
  },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  telegramId: {
    type: String,
    required: [true, 'Telegram ID is required'],
    index: true,
    trim: true
  },
  publisherTelegramId: { type: String, trim: true },
  title: { type: String, default: 'Untitled Link', trim: true, maxlength: 150 },
  targetUrl: { type: String, required: [true, 'Target URL is required'], trim: true },
  isActive: { type: Boolean, default: true, index: true },
  views: { type: Number, default: 0, min: 0 },
  validImpressions: { type: Number, default: 0, min: 0 },
  invalidImpressions: { type: Number, default: 0, min: 0 }
}, globalSchemaOptions);

linkSchema.pre('validate', function(next) {
  if (!this.publisherTelegramId && this.telegramId) {
    this.publisherTelegramId = this.telegramId;
  }
  next();
});

linkSchema.index({ telegramId: 1, createdAt: -1 });

// --------------------------------------------------
// 6. Traffic & Impressions Model
// --------------------------------------------------
const impressionSchema = new mongoose.Schema({
  linkId: { type: mongoose.Schema.Types.ObjectId, ref: 'Link', required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  telegramId: { type: String, required: true, trim: true, index: true },
  publisherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  publisherTelegramId: { type: String, default: '' },
  viewerTelegramId: { type: String, default: null, trim: true, index: true },
  adSource: { type: String, enum: ['internal', 'adsgram'], default: 'adsgram', index: true },
  adId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ad', default: null },
  publisherEarnings: currencyCentsField({ default: 0.00135 }),
  ip: { type: String, required: true, trim: true },
  userAgent: { type: String, default: '', trim: true },
  isUnique: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now, expires: '60d' }
}, globalSchemaOptions);

impressionSchema.index({ telegramId: 1, createdAt: -1 });

// --------------------------------------------------
// 7. Click Session Model
// --------------------------------------------------
const clickSessionSchema = new mongoose.Schema({
  linkId: { type: mongoose.Schema.Types.ObjectId, ref: 'Link', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  telegramId: { type: String, required: true, trim: true, index: true },
  publisherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  bridgeToken: { type: String, required: true, trim: true },
  createdAt: { type: Date, default: Date.now, expires: 300 }
}, globalSchemaOptions);

clickSessionSchema.index({ bridgeToken: 1 }, { unique: true });

// --------------------------------------------------
// 8. Withdraw Model
// --------------------------------------------------
const withdrawSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  telegramId: { type: String, required: true, trim: true, index: true },
  amount: currencyCentsField({ required: true }),
  fee: currencyCentsField({ default: 3 }),
  netAmount: currencyCentsField({ default: 0 }),
  network: { type: String, enum: ['BEP20', 'TRC20', 'TON'], required: true, uppercase: true },
  walletAddress: { type: String, required: true, trim: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', lowercase: true, index: true },
  rejectReason: { type: String, default: '', trim: true }
}, globalSchemaOptions);

withdrawSchema.pre('validate', function(next) {
  const amount = typeof this.amount === 'number' ? this.amount : 0;
  const fee = typeof this.fee === 'number' ? this.fee : 3;
  this.netAmount = Math.max(0, amount - fee);
  next();
});

withdrawSchema.index({ telegramId: 1, status: 1, createdAt: -1 });

// --------------------------------------------------
// 9. Earnings Hold Model
// --------------------------------------------------
const earningsHoldSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  telegramId: { type: String, required: true, trim: true, index: true },
  amount: currencyCentsField({ required: true }),
  releaseAt: { type: Date, required: true, default: () => new Date(Date.now() + 24 * 60 * 60 * 1000), index: true },
  isReleased: { type: Boolean, default: false, index: true }
}, globalSchemaOptions);

earningsHoldSchema.index({ telegramId: 1, isReleased: 1, releaseAt: 1 });

// --------------------------------------------------
// 10. Deposit Model
// --------------------------------------------------
const depositSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  telegramId: { type: String, required: true, trim: true, index: true },
  amount: currencyCentsField({ required: true }),
  network: { type: String, enum: ['BEP20', 'TRC20', 'TON'], required: true, uppercase: true },
  txid: { type: String, required: true, trim: true, unique: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', lowercase: true, index: true }
}, globalSchemaOptions);

depositSchema.index({ telegramId: 1, status: 1, createdAt: -1 });

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

announcementSchema.index({ isActive: 1, targetTelegramId: 1, createdAt: -1 });

// --------------------------------------------------
// Exporting Production Models
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
