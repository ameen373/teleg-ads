/**
 * Ultra-Enterprise Models Architecture (V6.0 - High-Precision Integer Math & Anti-Fraud)
 * Environment Guard: Server-Only Enforcement
 */

if (typeof window !== 'undefined') {
  throw new Error("Critical Security Alert: Mongoose models must run exclusively on the server side.");
}

const mongoose = require('mongoose');
const { Schema } = mongoose;

// --------------------------------------------------
// Global Helpers & Security Utilities
// --------------------------------------------------

// Regex validators for Multi-Chain crypto wallet addresses
const validateWalletAddress = (v) => {
  if (!v || v === '') return true;
  const isTron = /^T[A-Za-z1-9]{33}$/.test(v);
  const isEvm = /^0x[a-fA-F0-9]{40}$/.test(v);
  const isTon = /^[a-zA-Z0-9_-]{48}$/.test(v) || /^0:[a-fA-F0-9]{64}$/.test(v);
  return isTron || isEvm || isTon;
};

// Strict Integer Currency Validator (Enforces Micro-cents/Sents representation)
const integerValidator = {
  validator: Number.isInteger,
  message: '{PATH} must be a strict integer representation (e.g., Cents/Micro-units).'
};

// Global Schema Options for Clean Serialization & Isolation
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

const enforceTenantKey = (tenantKey, keyName = 'userId') => {
  if (!tenantKey) {
    throw new Error(`Security Violation: Missing required tenant scope parameter: ${keyName}`);
  }
};

// --------------------------------------------------
// 1. User Model (Profiles & Global Controls)
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
  defaultWallet: { 
    type: String, 
    default: '', 
    trim: true,
    validate: {
      validator: validateWalletAddress,
      message: 'Invalid wallet address format (USDT TRC20, BEP20, or TON)'
    }
  }
}, globalSchemaOptions);

userSchema.index({ telegramId: 1, isBanned: 1 });

userSchema.statics.findByTelegramIdIsolated = function(telegramId) {
  enforceTenantKey(telegramId, 'telegramId');
  return this.findOne({ telegramId: String(telegramId).trim() });
};

// --------------------------------------------------
// 2. High-Precision Wallet Model (Integer Balance)
// --------------------------------------------------
// Note: All financial values are stored in Micro-units (1 USD = 1,000,000 Micro-units / 100 Cents)
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

// --------------------------------------------------
// 3. Ledger Transactions Model (Immutable Financial Log)
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
    enum: ['deposit', 'withdrawal', 'earning', 'spend', 'referral_bonus', 'refund'], 
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
    default: 'pending',
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
// 4. Shortened Link Model (Routing & Metrics)
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

// --------------------------------------------------
// 5. Ad Campaigns Model (Budget & Bidding Controls)
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
    min: [1000, 'Minimum budget threshold not met'], // e.g. Min 1,000 cents/micro-units
    validate: integerValidator
  },
  remainingBudget: { 
    type: Number, 
    required: true,
    min: [0, 'Remaining budget cannot be negative'],
    validate: integerValidator
  },
  costPerClick: { 
    type: Number, 
    required: [true, 'Cost Per Click (CPC) is required'],
    min: [1, 'CPC must be greater than zero'],
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
campaignSchema.index({ status: 1, remainingBudget: 1 });

campaignSchema.statics.findAdvertiserCampaignsIsolated = function(userId, filter = {}) {
  enforceTenantKey(userId, 'userId');
  return this.find({ ...filter, userId }).sort({ createdAt: -1 });
};

// --------------------------------------------------
// 6. Anti-Bypass Click Session Model (Fraud Prevention)
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
clickSessionSchema.index({ bridgeToken: 1 }, { unique: true });

// --------------------------------------------------
// 7. Withdrawals Model (Atomic Queue & Fraud Guard)
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
  }
}, globalSchemaOptions);

withdrawSchema.index({ userId: 1, status: 1, createdAt: -1 });

// Prevents a user from creating multiple simultaneous pending withdrawal requests (Race Condition Guard)
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
// Exporting Enterprise-Grade Models
// --------------------------------------------------
const User = mongoose.models.User || mongoose.model('User', userSchema);
const Wallet = mongoose.models.Wallet || mongoose.model('Wallet', walletSchema);
const Transaction = mongoose.models.Transaction || mongoose.model('Transaction', transactionSchema);
const Link = mongoose.models.Link || mongoose.model('Link', linkSchema);
const Campaign = mongoose.models.Campaign || mongoose.model('Campaign', campaignSchema);
const ClickSession = mongoose.models.ClickSession || mongoose.model('ClickSession', clickSessionSchema);
const Withdraw = mongoose.models.Withdraw || mongoose.model('Withdraw', withdrawSchema);

module.exports = {
  User,
  Wallet,
  Transaction,
  Link,
  Campaign,
  ClickSession,
  Withdraw
};
