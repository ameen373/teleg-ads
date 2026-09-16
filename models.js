/**
 * Ultra-Enterprise Models Architecture (Multi-Tenant Isolated)
 * Platform: Telega.ads Advertising & Shortener Network
 * Security: Strict Multi-Tenant Isolation via Telegram userId
 */

if (typeof window !== 'undefined') {
  throw new Error("Critical Security Alert: Mongoose models must run exclusively on the server side.");
}

const mongoose = require('mongoose');

/**
 * Precision currency formatter up to 5 decimal places.
 * Prevents IEEE 754 floating-point rounding issues (e.g. 0.1 + 0.2 = 0.30000000000000004).
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
    throw new Error(`Security Violation [Tenant Isolation]: Missing strictly required parameter: ${keyName}`);
  }
};

// ==================================================
// 1. User Model (Users)
// ==================================================
const userSchema = new mongoose.Schema({
  userId: { 
    type: String, 
    required: [true, 'User ID (Telegram ID) is strictly required'], 
    unique: true, 
    trim: true,
    index: true
  },
  telegramId: { 
    type: String, 
    trim: true,
    index: true
  },
  username: { 
    type: String, 
    default: '', 
    trim: true,
    lowercase: true,
    maxlength: [100, 'Username cannot exceed 100 characters']
  },
  balance: { 
    type: Number, 
    default: 0, 
    min: [0, 'Balance cannot be negative'],
    set: formatCurrency 
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
  role: { 
    type: String, 
    enum: ['user', 'admin'], 
    default: 'user',
    index: true 
  },
  isBanned: { 
    type: Boolean, 
    default: false, 
    index: true 
  },
  referredBy: { 
    type: String, 
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
    trim: true
  }
}, globalSchemaOptions);

// Dynamic Field Syncing Hook
userSchema.pre('validate', function(next) {
  if (this.userId && !this.telegramId) this.telegramId = this.userId;
  if (this.telegramId && !this.userId) this.userId = this.telegramId;
  if (this.balance !== undefined && this.availableBalance === 0) {
    this.availableBalance = this.balance;
  }
  next();
});

userSchema.index({ userId: 1, isBanned: 1 });

userSchema.statics.findByUserIdIsolated = function(userId) {
  enforceTenantKey(userId, 'userId');
  return this.findOne({ userId: String(userId).trim() });
};

// ==================================================
// 2. Short Links Model (Link / ShortLink)
// ==================================================
const linkSchema = new mongoose.Schema({
  userId: { 
    type: String, 
    required: [true, 'User ID (Telegram ID) is strictly required'], 
    trim: true,
    index: true
  },
  originalUrl: { 
    type: String, 
    required: [true, 'Original URL is strictly required'], 
    trim: true,
    maxlength: [2048, 'URL is too long']
  },
  targetUrl: { 
    type: String, 
    trim: true
  },
  shortCode: { 
    type: String, 
    required: [true, 'Short code is strictly required'], 
    unique: true, 
    trim: true,
    index: true,
    maxlength: [50, 'Short code cannot exceed 50 characters']
  },
  clicks: { 
    type: Number, 
    default: 0, 
    min: [0, 'Clicks count cannot be negative'] 
  },
  views: { 
    type: Number, 
    default: 0, 
    min: [0, 'Views count cannot be negative'] 
  },
  title: { 
    type: String, 
    default: 'Untitled Link', 
    trim: true,
    maxlength: [150, 'Title cannot exceed 150 characters'] 
  },
  isActive: { 
    type: Boolean, 
    default: true, 
    index: true 
  }
}, globalSchemaOptions);

linkSchema.pre('validate', function(next) {
  if (this.originalUrl && !this.targetUrl) this.targetUrl = this.originalUrl;
  if (this.targetUrl && !this.originalUrl) this.originalUrl = this.targetUrl;
  if (this.clicks !== undefined && this.views === 0) this.views = this.clicks;
  if (this.views !== undefined && this.clicks === 0) this.clicks = this.views;
  next();
});

linkSchema.index({ userId: 1, createdAt: -1 });
linkSchema.index({ shortCode: 1, isActive: 1 });

linkSchema.statics.getUserIsolatedLinks = function(userId, query = {}, options = {}) {
  enforceTenantKey(userId, 'userId');
  return this.find({ ...query, userId }, null, options).sort({ createdAt: -1 });
};

linkSchema.statics.findOneIsolated = function(shortCode, userId) {
  enforceTenantKey(userId, 'userId');
  return this.findOne({ shortCode: String(shortCode).trim(), userId });
};

// ==================================================
// 3. Campaign / Ad Model (Campaign / Ad)
// ==================================================
const campaignSchema = new mongoose.Schema({
  userId: { 
    type: String, 
    required: [true, 'User ID (Telegram ID) is strictly required'], 
    trim: true,
    index: true
  },
  title: { 
    type: String, 
    required: [true, 'Campaign title is required'], 
    trim: true, 
    maxlength: [150, 'Campaign title cannot exceed 150 characters'] 
  },
  budget: { 
    type: Number, 
    required: [true, 'Budget is required'], 
    min: [0, 'Budget cannot be negative'], 
    set: formatCurrency 
  },
  totalBudget: { 
    type: Number, 
    set: formatCurrency 
  },
  remainingBudget: { 
    type: Number, 
    default: 0, 
    min: [0, 'Remaining budget cannot be negative'], 
    set: formatCurrency 
  },
  status: { 
    type: String, 
    enum: {
      values: ['active', 'paused', 'completed'],
      message: 'Status must be active, paused, or completed'
    }, 
    default: 'active', 
    index: true 
  },
  targetUrl: { 
    type: String, 
    trim: true,
    maxlength: [2048, 'Target URL is too long']
  },
  cpmRate: { 
    type: Number, 
    default: 1.50,
    set: formatCurrency
  },
  impressionsCount: { 
    type: Number, 
    default: 0, 
    min: [0, 'Impressions count cannot be negative'] 
  }
}, globalSchemaOptions);

campaignSchema.pre('validate', function(next) {
  if (this.budget !== undefined && this.totalBudget === undefined) this.totalBudget = this.budget;
  if (this.totalBudget !== undefined && this.budget === undefined) this.budget = this.totalBudget;
  if (this.isNew && this.remainingBudget === 0) this.remainingBudget = this.budget || 0;
  next();
});

campaignSchema.index({ userId: 1, status: 1, createdAt: -1 });

campaignSchema.statics.getUserCampaignsIsolated = function(userId, filter = {}) {
  enforceTenantKey(userId, 'userId');
  return this.find({ ...filter, userId }).sort({ createdAt: -1 });
};

// ==================================================
// 4. Transactions Model (Transaction)
// ==================================================
const transactionSchema = new mongoose.Schema({
  userId: { 
    type: String, 
    required: [true, 'User ID (Telegram ID) is strictly required'], 
    trim: true,
    index: true 
  },
  type: { 
    type: String, 
    enum: {
      values: ['deposit', 'withdraw', 'withdrawal', 'campaign_spend', 'publisher_earning', 'referral_bonus', 'refund'],
      message: 'Invalid transaction type'
    },
    required: [true, 'Transaction type is required'],
    index: true 
  },
  amount: { 
    type: Number, 
    required: [true, 'Transaction amount is required'], 
    min: [0.00001, 'Transaction amount must be positive'],
    set: formatCurrency 
  },
  status: { 
    type: String, 
    enum: {
      values: ['pending', 'completed', 'approved', 'rejected', 'failed'],
      message: 'Invalid status'
    }, 
    default: 'completed', 
    index: true 
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

transactionSchema.index({ userId: 1, createdAt: -1 });
transactionSchema.index({ userId: 1, type: 1, createdAt: -1 });

transactionSchema.statics.getUserTransactionsIsolated = function(userId, filter = {}) {
  enforceTenantKey(userId, 'userId');
  return this.find({ ...filter, userId }).sort({ createdAt: -1 });
};

// ==================================================
// 5. Wallet Model (Wallet)
// ==================================================
const walletSchema = new mongoose.Schema({
  userId: { 
    type: String, 
    required: [true, 'User ID is strictly required'], 
    unique: true,
    trim: true,
    index: true
  },
  availableBalance: { 
    type: Number, 
    default: 0, 
    min: [0, 'Balance cannot be negative'], 
    set: formatCurrency 
  },
  pendingBalance: { 
    type: Number, 
    default: 0, 
    min: [0, 'Balance cannot be negative'], 
    set: formatCurrency 
  },
  totalDeposited: { 
    type: Number, 
    default: 0, 
    set: formatCurrency 
  },
  totalWithdrawn: { 
    type: Number, 
    default: 0, 
    set: formatCurrency 
  },
  currency: { 
    type: String, 
    default: 'USDT', 
    uppercase: true 
  }
}, globalSchemaOptions);

walletSchema.statics.getWalletIsolated = function(userId) {
  enforceTenantKey(userId, 'userId');
  return this.findOne({ userId: String(userId).trim() });
};

// ==================================================
// 6. Impression & Traffic Model
// ==================================================
const impressionSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: [true, 'User ID is strictly required'],
    trim: true,
    index: true
  },
  linkId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Link', 
    required: [true, 'Link ID is required'], 
    index: true 
  },
  adSource: { 
    type: String, 
    enum: ['internal', 'adsgram'], 
    default: 'adsgram'
  },
  adId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Campaign', 
    default: null
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

// ==================================================
// 7. Click Session Model
// ==================================================
const clickSessionSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: [true, 'User ID is strictly required'],
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
    trim: true,
    unique: true,
    index: true 
  },
  createdAt: { 
    type: Date, 
    default: Date.now, 
    expires: 300 
  }
}, globalSchemaOptions);

clickSessionSchema.index({ userId: 1, createdAt: -1 });

// ==================================================
// 8. Withdrawals Model (Withdraw / Withdrawal)
// ==================================================
const withdrawSchema = new mongoose.Schema({
  userId: { 
    type: String, 
    required: [true, 'User ID is strictly required'], 
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
    set: formatCurrency
  },
  network: {
    type: String,
    enum: ['BEP20', 'TRC20', 'TON'],
    required: true,
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
  }
}, globalSchemaOptions);

withdrawSchema.pre('validate', function(next) {
  const amount = typeof this.amount === 'number' ? this.amount : 0;
  const fee = typeof this.fee === 'number' ? this.fee : 0;
  this.netAmount = formatCurrency(Math.max(0, amount - fee));
  next();
});

withdrawSchema.index({ userId: 1, status: 1, createdAt: -1 });

// ==================================================
// 9. Earnings Hold Model
// ==================================================
const earningsHoldSchema = new mongoose.Schema({
  userId: { 
    type: String, 
    required: [true, 'User ID is strictly required'], 
    trim: true,
    index: true 
  },
  amount: { 
    type: Number, 
    required: true, 
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

// ==================================================
// 10. Deposits Model (Deposit)
// ==================================================
const depositSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: [true, 'User ID is strictly required'],
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
    required: true,
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

depositSchema.index({ userId: 1, status: 1, createdAt: -1 });

// ==================================================
// 11. Announcement Model
// ==================================================
const announcementSchema = new mongoose.Schema({
  title: { 
    type: String, 
    required: true, 
    trim: true 
  },
  content: { 
    type: String, 
    required: true, 
    trim: true 
  },
  isActive: { 
    type: Boolean, 
    default: true, 
    index: true 
  },
  targetUserId: { 
    type: String, 
    default: null, 
    trim: true,
    index: true 
  }
}, globalSchemaOptions);

announcementSchema.index({ isActive: 1, targetUserId: 1, createdAt: -1 });

// ==================================================
// Safe Model Compilation & Universal Exports
// ==================================================
const User = mongoose.models.User || mongoose.model('User', userSchema);
const Link = mongoose.models.Link || mongoose.model('Link', linkSchema);
const Campaign = mongoose.models.Campaign || mongoose.model('Campaign', campaignSchema);
const Transaction = mongoose.models.Transaction || mongoose.model('Transaction', transactionSchema);
const Wallet = mongoose.models.Wallet || mongoose.model('Wallet', walletSchema);
const Impression = mongoose.models.Impression || mongoose.model('Impression', impressionSchema);
const ClickSession = mongoose.models.ClickSession || mongoose.model('ClickSession', clickSessionSchema);
const Withdraw = mongoose.models.Withdraw || mongoose.model('Withdraw', withdrawSchema);
const EarningsHold = mongoose.models.EarningsHold || mongoose.model('EarningsHold', earningsHoldSchema);
const Deposit = mongoose.models.Deposit || mongoose.model('Deposit', depositSchema);
const Announcement = mongoose.models.Announcement || mongoose.model('Announcement', announcementSchema);

module.exports = {
  // Required core multi-tenant schemas
  User,
  Link,
  ShortLink: Link, // Alias for backward compatibility
  Campaign,
  Ad: Campaign,    // Alias for backward compatibility
  Transaction,

  // Supplemental operational models
  Wallet,
  Impression,
  ClickSession,
  Withdraw,
  Withdrawal: Withdraw, // Alias for backward compatibility
  EarningsHold,
  Deposit,
  Announcement
};
