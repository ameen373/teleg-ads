/**
 * Enterprise Production Models Package (Ultra-Optimized Architecture)
 * Telegram Link Shortener & Mini App Engine v3.0
 */

if (typeof window !== 'undefined') {
  throw new Error("Mongoose models must run exclusively on the server side environment.");
}

const mongoose = require('mongoose');

// Precise fixed-point currency formatter (5 decimal places, prevents IEEE 754 precision issues)
const formatCurrency = (val) => {
  if (typeof val !== 'number' || isNaN(val) || !isFinite(val)) return 0;
  return Math.round((val + Number.EPSILON) * 100000) / 100000;
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
    default: 'en',
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
  advertiserBalance: { 
    type: Number, 
    default: 0, 
    min: [0, 'Advertiser balance cannot be negative'],
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
        return isTron || isEvm;
      },
      message: 'Invalid wallet address format (Must be USDT TRC20 or BEP20/ERC20)'
    }
  }
}, { 
  timestamps: true,
  versionKey: false
});

// Highly Optimized Compound Indexes for Fast Dynamic Querying
userSchema.index({ telegramId: 1, isBanned: 1 });
userSchema.index({ role: 1, createdAt: -1 });

// High-Precision Race-Condition Safe Atomic Mutators
userSchema.methods.creditAvailableBalance = function(amount, session = null) {
  const formatted = formatCurrency(amount);
  return mongoose.model('User').findByIdAndUpdate(
    this._id,
    { $inc: { availableBalance: formatted } },
    { new: true, session, runValidators: true }
  );
};

userSchema.methods.deductAdvertiserBalance = function(amount, session = null) {
  const formatted = formatCurrency(amount);
  return mongoose.model('User').findOneAndUpdate(
    { _id: this._id, advertiserBalance: { $gte: formatted } },
    { $inc: { advertiserBalance: -formatted } },
    { new: true, session, runValidators: true }
  );
};

// --------------------------------------------------
// 2. Self-Serve Ad Model
// --------------------------------------------------
const adSchema = new mongoose.Schema({
  advertiserId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: [true, 'Advertiser ID is required'], 
    index: true 
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
}, { 
  timestamps: true,
  versionKey: false
});

adSchema.index({ status: 1, remainingBudget: 1, createdAt: -1 });
adSchema.index({ advertiserId: 1, status: 1, createdAt: -1 });

// Atomic Budget Deduction & Dynamic Auto-Completion Logic
adSchema.statics.consumeImpressionBudget = async function(adId, costPerImpression, session = null) {
  const formattedCost = formatCurrency(costPerImpression);
  
  // High-performance pipeline update logic
  return await this.findOneAndUpdate(
    { _id: adId, status: 'active', remainingBudget: { $gte: formattedCost } },
    [
      {
        $set: {
          remainingBudget: { $round: [{ $subtract: ["$remainingBudget", formattedCost] }, 5] },
          impressionsCount: { $add: ["$impressionsCount", 1] },
          status: {
            $cond: {
              if: { $lte: [{ $subtract: ["$remainingBudget", formattedCost] }, 0] },
              then: 'completed',
              else: '$status'
            }
          }
        }
      }
    ],
    { new: true, session }
  );
};

// --------------------------------------------------
// 3. Shortened Link Model
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
}, { 
  timestamps: true,
  versionKey: false
});

linkSchema.index({ userId: 1, isActive: 1, createdAt: -1 });
linkSchema.index({ validImpressions: -1 });

// --------------------------------------------------
// 4. Traffic & Impressions Model
// --------------------------------------------------
const impressionSchema = new mongoose.Schema({
  linkId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Link', 
    required: true, 
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
}, { versionKey: false });

impressionSchema.index({ linkId: 1, createdAt: -1 });
impressionSchema.index({ ip: 1, createdAt: -1 });
impressionSchema.index({ linkId: 1, ip: 1, createdAt: -1 });

// --------------------------------------------------
// 5. Anti-Bypass Click Session Model
// --------------------------------------------------
const clickSessionSchema = new mongoose.Schema({
  linkId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Link', 
    required: true,
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
}, { versionKey: false });

clickSessionSchema.index({ linkId: 1, ip: 1 });
clickSessionSchema.index({ bridgeToken: 1 }, { unique: true });

// --------------------------------------------------
// 6. Enterprise Comprehensive Transaction Model
// --------------------------------------------------
const transactionSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: [true, 'User ID is required'], 
    index: true 
  },
  type: { 
    type: String, 
    enum: [
      'deposit', 
      'withdraw', 
      'impression_earning', 
      'referral_earning', 
      'ad_spend', 
      'manual_adjustment'
    ], 
    required: [true, 'Transaction type is required'],
    lowercase: true,
    index: true 
  },
  amount: { 
    type: Number, 
    required: [true, 'Transaction amount is required'], 
    set: formatCurrency 
  },
  referenceId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null,
    index: true
  },
  details: { 
    type: String, 
    required: [true, 'Payment or withdrawal details are required'], 
    trim: true 
  },
  status: { 
    type: String, 
    enum: ['pending', 'approved', 'rejected', 'completed'], 
    default: 'completed', 
    lowercase: true,
    index: true 
  }
}, { 
  timestamps: true,
  versionKey: false
});

transactionSchema.index({ userId: 1, type: 1, createdAt: -1 });
transactionSchema.index({ status: 1, createdAt: -1 });

// Static Engine Method to Record Double-Entry Ledger Transactions
transactionSchema.statics.recordTransaction = async function(txData, session = null) {
  const formattedAmount = formatCurrency(txData.amount);
  const transaction = new this({
    ...txData,
    amount: formattedAmount
  });
  return await transaction.save({ session });
};

// --------------------------------------------------
// 7. Withdraw Request Model
// --------------------------------------------------
const withdrawSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: [true, 'User ID is required'], 
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
    enum: ['BEP20', 'TRC20'],
    required: [true, 'Please select network (BEP20 or TRC20)'],
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
}, { 
  timestamps: true,
  versionKey: false
});

withdrawSchema.pre('validate', function(next) {
  const amount = typeof this.amount === 'number' ? this.amount : 0;
  const fee = typeof this.fee === 'number' ? this.fee : 3;
  this.netAmount = formatCurrency(Math.max(0, amount - fee));
  next();
});

withdrawSchema.index({ userId: 1, status: 1, createdAt: -1 });
withdrawSchema.index({ status: 1, createdAt: -1 });

// --------------------------------------------------
// 8. Temporary Earnings Settlement Hold Model
// --------------------------------------------------
const earningsHoldSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true, 
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
}, { 
  timestamps: true,
  versionKey: false
});

earningsHoldSchema.index({ isReleased: 1, releaseAt: 1 });
earningsHoldSchema.index({ userId: 1, isReleased: 1, createdAt: -1 });

// --------------------------------------------------
// 9. Advertiser Deposit Model
// --------------------------------------------------
const depositSchema = new mongoose.Schema({
  advertiserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Advertiser ID is required'],
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
    enum: ['BEP20', 'TRC20'],
    required: [true, 'Please select network (BEP20 or TRC20)'],
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
}, { 
  timestamps: true,
  versionKey: false
});

depositSchema.index({ advertiserId: 1, status: 1, createdAt: -1 });

// --------------------------------------------------
// 10. Announcement Model
// --------------------------------------------------
const announcementSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  content: { type: String, required: true, trim: true },
  isActive: { type: Boolean, default: true, index: true }
}, { 
  timestamps: true,
  versionKey: false
});

announcementSchema.index({ isActive: 1, createdAt: -1 });

// Safe singleton instantiation
const User = mongoose.models.User || mongoose.model('User', userSchema);
const Ad = mongoose.models.Ad || mongoose.model('Ad', adSchema);
const Link = mongoose.models.Link || mongoose.model('Link', linkSchema);
const Impression = mongoose.models.Impression || mongoose.model('Impression', impressionSchema);
const ClickSession = mongoose.models.ClickSession || mongoose.model('ClickSession', clickSessionSchema);
const Transaction = mongoose.models.Transaction || mongoose.model('Transaction', transactionSchema);
const Withdraw = mongoose.models.Withdraw || mongoose.model('Withdraw', withdrawSchema);
const EarningsHold = mongoose.models.EarningsHold || mongoose.model('EarningsHold', earningsHoldSchema);
const Deposit = mongoose.models.Deposit || mongoose.model('Deposit', depositSchema);
const Announcement = mongoose.models.Announcement || mongoose.model('Announcement', announcementSchema);

module.exports = {
  User,
  Ad,
  Link,
  Impression,
  ClickSession,
  Transaction,
  Withdraw,
  EarningsHold,
  Deposit,
  Announcement
};
