/**
 * Enterprise Mongoose Models Architecture
 * Platform: Telega.ads Advertising & Shortener Network
 * Persistent MongoDB Database Integration
 */

if (typeof window !== 'undefined') {
  throw new Error("Critical Security Alert: Mongoose models must run exclusively on the server side.");
}

const mongoose = require('mongoose');

// تنسيق دقيق للعملة لتفادي مشاكل الأعداد العشرية في JavaScript
const formatCurrency = (val) => {
  if (typeof val !== 'number' || isNaN(val) || !isFinite(val)) return 0;
  return Math.round((val + Number.EPSILON) * 100000) / 100000;
};

// خيارات عامة لجميع الهياكل (إضافة التوقيتات وحذف __v عند التحويل لـ JSON)
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

// دالة تحقق لأمان البيانات وعزل المستخِدمين (Tenant Isolation)
const enforceTenantKey = (tenantKey, keyName = 'userId') => {
  if (!tenantKey) {
    throw new Error(`Security Violation [Tenant Isolation]: Access denied. Missing strictly required parameter: ${keyName}`);
  }
};

// ==================================================
// 1. User Schema (المستخدمين والرصيد والبيانات الشخصية)
// ==================================================
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
  name: {
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
  // رصيد المحفظة المتاح للاستخدام أو السحب
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
    trim: true
  },
  statsSummary: {
    totalLinksCreated: { type: Number, default: 0, min: 0 },
    totalViewsReceived: { type: Number, default: 0, min: 0 },
    totalValidViews: { type: Number, default: 0, min: 0 },
    totalLifetimeEarned: { type: Number, default: 0, min: 0, set: formatCurrency }
  }
}, globalSchemaOptions);

// المزامنة التلقائية بين balance و availableBalance قبل الحفظ
userSchema.pre('save', function(next) {
  if (this.isModified('availableBalance') && !this.isModified('balance')) {
    this.balance = this.availableBalance;
  } else if (this.isModified('balance') && !this.isModified('availableBalance')) {
    this.availableBalance = this.balance;
  }
  next();
});

userSchema.index({ telegramId: 1, isBanned: 1 });

userSchema.statics.findByTelegramIdIsolated = function(telegramId) {
  enforceTenantKey(telegramId, 'telegramId');
  return this.findOne({ telegramId: String(telegramId).trim() });
};

// ==================================================
// 2. Campaign / Ad Schema (الحملات الإعلانية المربوطة بـ userId)
// ==================================================
const adSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: [true, 'User ID is required for campaign ownership'], 
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
    index: true 
  },
  advertiserTelegramId: {
    type: String,
    trim: true
  },
  title: { 
    type: String, 
    required: [true, 'Campaign title is required'], 
    trim: true, 
    maxlength: [100, 'Campaign title must not exceed 100 characters'] 
  },
  targetUrl: { 
    type: String, 
    required: [true, 'Target URL is required'], 
    trim: true
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

adSchema.pre('validate', function(next) {
  if (this.userId && !this.advertiserId) this.advertiserId = this.userId;
  if (this.advertiserId && !this.userId) this.userId = this.advertiserId;
  if (this.telegramId && !this.advertiserTelegramId) this.advertiserTelegramId = this.telegramId;
  if (this.advertiserTelegramId && !this.telegramId) this.telegramId = this.advertiserTelegramId;
  next();
});

adSchema.index({ userId: 1, status: 1, createdAt: -1 });
adSchema.statics.findUserCampaigns = function(userId, filter = {}) {
  enforceTenantKey(userId, 'userId');
  return this.find({ ...filter, userId }).sort({ createdAt: -1 });
};

// ==================================================
// 3. Transaction Schema (الإيداعات والسحوبات المربوطة بـ userId)
// ==================================================
const transactionSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: [true, 'User ID is required for transaction isolation'], 
    index: true 
  },
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

transactionSchema.index({ userId: 1, createdAt: -1 });
transactionSchema.statics.getUserTransactionsIsolated = function(userId, filter = {}) {
  enforceTenantKey(userId, 'userId');
  return this.find({ ...filter, userId }).sort({ createdAt: -1 });
};

// ==================================================
// 4. Link Schema (الروابط المختصرة المربوطة بـ userId)
// ==================================================
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
    required: [true, 'User ID is required for link ownership'], 
    index: true
  },
  telegramId: {
    type: String,
    required: [true, 'Telegram ID is required'],
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

linkSchema.index({ userId: 1, createdAt: -1 });
linkSchema.statics.getUserIsolatedLinks = function(userId, query = {}, options = {}) {
  enforceTenantKey(userId, 'userId');
  return this.find({ ...query, userId }, null, options).sort({ createdAt: -1 });
};

// ==================================================
// 5. Additional Supporting Models (المحفظة، السحوبات، الإيداعات)
// ==================================================

// Wallet Model
const walletSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
  telegramId: { type: String, required: true, unique: true, index: true, trim: true },
  availableBalance: { type: Number, default: 0, min: 0, set: formatCurrency },
  pendingBalance: { type: Number, default: 0, min: 0, set: formatCurrency },
  totalDeposited: { type: Number, default: 0, min: 0, set: formatCurrency },
  totalWithdrawn: { type: Number, default: 0, min: 0, set: formatCurrency },
  currency: { type: String, default: 'USDT', uppercase: true, trim: true }
}, globalSchemaOptions);

// Withdraw Model
const withdrawSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  telegramId: { type: String, required: true, trim: true, index: true },
  amount: { type: Number, required: true, min: [30, 'Minimum withdrawal limit is $30'], set: formatCurrency },
  fee: { type: Number, default: 3, set: formatCurrency },
  netAmount: { type: Number, required: true, set: formatCurrency },
  network: { type: String, enum: ['BEP20', 'TRC20', 'TON'], required: true, trim: true, uppercase: true },
  walletAddress: { type: String, required: true, trim: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', lowercase: true, index: true },
  rejectReason: { type: String, default: '', trim: true }
}, globalSchemaOptions);

withdrawSchema.pre('validate', function(next) {
  const amount = typeof this.amount === 'number' ? this.amount : 0;
  const fee = typeof this.fee === 'number' ? this.fee : 3;
  this.netAmount = formatCurrency(Math.max(0, amount - fee));
  next();
});

// Deposit Model
const depositSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  telegramId: { type: String, required: true, trim: true, index: true },
  amount: { type: Number, required: true, min: [1, 'Minimum deposit limit is $1'], set: formatCurrency },
  network: { type: String, enum: ['BEP20', 'TRC20', 'TON'], required: true, trim: true, uppercase: true },
  txid: { type: String, required: true, trim: true, unique: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', lowercase: true, index: true },
  rejectReason: { type: String, default: '', trim: true }
}, globalSchemaOptions);

// Click Session & Traffic Impression Models
const impressionSchema = new mongoose.Schema({
  linkId: { type: mongoose.Schema.Types.ObjectId, ref: 'Link', required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  telegramId: { type: String, required: true, trim: true, index: true },
  ip: { type: String, required: true, trim: true },
  publisherEarnings: { type: Number, default: 0.00135, set: formatCurrency },
  createdAt: { type: Date, default: Date.now, expires: '60d' }
}, globalSchemaOptions);

const clickSessionSchema = new mongoose.Schema({
  linkId: { type: mongoose.Schema.Types.ObjectId, ref: 'Link', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  telegramId: { type: String, required: true, trim: true, index: true },
  ip: { type: String, required: true, trim: true },
  bridgeToken: { type: String, required: true, trim: true },
  createdAt: { type: Date, default: Date.now, expires: 300 }
}, globalSchemaOptions);

// Announcement Model
const announcementSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  content: { type: String, required: true, trim: true },
  isActive: { type: Boolean, default: true, index: true }
}, globalSchemaOptions);

// ==================================================
// تسجيل وتصدير الموديلز (Mongoose Exporting)
// ==================================================
const User = mongoose.models.User || mongoose.model('User', userSchema);
const Campaign = mongoose.models.Ad || mongoose.model('Ad', adSchema); // Ad / Campaign Model
const Ad = Campaign;
const Transaction = mongoose.models.Transaction || mongoose.model('Transaction', transactionSchema);
const Link = mongoose.models.Link || mongoose.model('Link', linkSchema);
const Wallet = mongoose.models.Wallet || mongoose.model('Wallet', walletSchema);
const Impression = mongoose.models.Impression || mongoose.model('Impression', impressionSchema);
const ClickSession = mongoose.models.ClickSession || mongoose.model('ClickSession', clickSessionSchema);
const Withdraw = mongoose.models.Withdraw || mongoose.model('Withdraw', withdrawSchema);
const Deposit = mongoose.models.Deposit || mongoose.model('Deposit', depositSchema);
const Announcement = mongoose.models.Announcement || mongoose.model('Announcement', announcementSchema);

module.exports = {
  User,
  Campaign,
  Ad,
  Transaction,
  Link,
  Wallet,
  Impression,
  ClickSession,
  Withdraw,
  Deposit,
  Announcement
};
