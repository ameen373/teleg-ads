/**
 * Enterprise Production Models (Mongoose Architecture)
 * Project: Telega.ads Advertising & Shortener Network
 * Currency Standard: Stored strictly as Integer Cents to guarantee zero precision loss.
 */

if (typeof window !== 'undefined') {
  throw new Error("Critical Security Alert: Mongoose models must run exclusively on the server side.");
}

const mongoose = require('mongoose');

// Helper Functions to Convert Dollars <-> Cents
const dollarsToCents = (val) => {
  if (typeof val !== 'number' || isNaN(val) || !isFinite(val)) return 0;
  return Math.round(val * 100);
};

const centsToDollars = (val) => {
  if (typeof val !== 'number' || isNaN(val)) return 0;
  return val / 100;
};

// Currency Field Configurator for Mongoose Schemas
const currencyCentsField = (options = {}) => ({
  type: Number,
  default: 0,
  get: centsToDollars,
  set: dollarsToCents,
  ...options
});

// Global Options for Clean JSON Transformations
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

const enforceTenantKey = (tenantKey, keyName = 'userId') => {
  if (!tenantKey) {
    throw new Error(`Security Violation [Tenant Isolation]: Missing required parameter: ${keyName}`);
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
  pendingBalance: currencyCentsField(),
  availableBalance: currencyCentsField(),
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
  referralEarnings: currencyCentsField(),
  defaultWallet: { 
    type: String, 
    default: '', 
    trim: true 
  },
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
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true, 
    unique: true,
    index: true 
  },
  telegramId: { 
    type: String, 
    required: true, 
    unique: true,
    index: true, 
    trim: true 
  },
  availableBalance: currencyCentsField(),
  pendingBalance: currencyCentsField(),
  totalDeposited: currencyCentsField(),
  totalWithdrawn: currencyCentsField(),
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
// 3. Transaction Model
// --------------------------------------------------
const transactionSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
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
  amount: currencyCentsField({ required: true }),
  balanceAfter: currencyCentsField({ required: true }),
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

transactionSchema.statics.getUserTransactionsIsolated = function(userId, filter = {}) {
  enforceTenantKey(userId, 'userId');
  return this.find({ ...filter, userId }).sort({ createdAt: -1 });
};

// --------------------------------------------------
// 4. Campaign Ad Model
// --------------------------------------------------
const adSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
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
  title: { 
    type: String, 
    required: true, 
    trim: true, 
    maxlength: 100 
  },
  targetUrl: { 
    type: String, 
    required: true, 
    trim: true 
  },
  totalBudget: currencyCentsField({ required: true }),
  remainingBudget: currencyCentsField({ required: true }),
  cpmRate: currencyCentsField({ default: 1.50 }),
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

adSchema.index({ userId: 1, status: 1, createdAt: -1 });

adSchema.statics.findAdvertiserAdsIsolated = function(userId, filter = {}) {
  enforceTenantKey(userId, 'userId');
  return this.find({ ...filter, userId }).sort({ createdAt: -1 });
};

// --------------------------------------------------
// 5. Shortened Links Model
// --------------------------------------------------
const linkSchema = new mongoose.Schema({
  shortCode: { 
    type: String, 
    required: true, 
    unique: true, 
    index: true,
    trim: true 
  },
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
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
  title: { 
    type: String, 
    default: 'Untitled Link', 
    trim: true,
    maxlength: 150 
  },
  targetUrl: { 
    type: String, 
    required: true, 
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

linkSchema.index({ userId: 1, createdAt: -1 });

linkSchema.statics.getUserIsolatedLinks = function(userId, query = {}, options = {}) {
  enforceTenantKey(userId, 'userId');
  return this.find({ ...query, userId }, null, options).sort({ createdAt: -1 });
};

linkSchema.statics.findOneIsolated = function(shortCode, userId) {
  enforceTenantKey(userId, 'userId');
  return this.findOne({ shortCode, userId });
};

// --------------------------------------------------
// 6. Deposit Model
// --------------------------------------------------
const depositSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  telegramId: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  amount: currencyCentsField({ required: true }),
  network: {
    type: String,
    enum: ['BEP20', 'TRC20', 'TON'],
    required: true,
    trim: true,
    uppercase: true
  },
  txid: {
    type: String,
    required: true,
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

depositSchema.statics.getAdvertiserDepositsIsolated = function(userId) {
  enforceTenantKey(userId, 'userId');
  return this.find({ userId }).sort({ createdAt: -1 });
};

// --------------------------------------------------
// 7. Withdraw Model
// --------------------------------------------------
const withdrawSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true, 
    index: true 
  },
  telegramId: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  amount: currencyCentsField({ required: true }),
  fee: currencyCentsField({ default: 3 }),
  netAmount: currencyCentsField({ required: true }),
  network: {
    type: String,
    enum: ['BEP20', 'TRC20', 'TON'],
    required: true,
    trim: true,
    uppercase: true
  },
  walletAddress: { 
    type: String, 
    required: true, 
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
  }
}, globalSchemaOptions);

withdrawSchema.index({ userId: 1, status: 1, createdAt: -1 });

withdrawSchema.statics.getUserWithdrawalsIsolated = function(userId, status = null) {
  enforceTenantKey(userId, 'userId');
  const query = { userId };
  if (status) query.status = status;
  return this.find(query).sort({ createdAt: -1 });
};

// Export Ready Models
const User = mongoose.models.User || mongoose.model('User', userSchema);
const Wallet = mongoose.models.Wallet || mongoose.model('Wallet', walletSchema);
const Transaction = mongoose.models.Transaction || mongoose.model('Transaction', transactionSchema);
const Ad = mongoose.models.Ad || mongoose.model('Ad', adSchema);
const Link = mongoose.models.Link || mongoose.model('Link', linkSchema);
const Deposit = mongoose.models.Deposit || mongoose.model('Deposit', depositSchema);
const Withdraw = mongoose.models.Withdraw || mongoose.model('Withdraw', withdrawSchema);

module.exports = {
  User,
  Wallet,
  Transaction,
  Ad,
  Link,
  Deposit,
  Withdraw
};
