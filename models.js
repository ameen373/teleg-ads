/**
 * Ultra-Enterprise High-Performance Models Architecture (v2.0 Extreme)
 * Engine for High-Scale Telegram Mini Apps, Shorteners & Ad Networks
 */

if (typeof window !== 'undefined') {
  throw new Error("Critical Security Alert: Mongoose models must run exclusively on the server side.");
}

const mongoose = require('mongoose');

// ==========================================
// 0. Utilities & Precise Financial Helpers
// ==========================================

// حماية الأرقام المالية دقيقة الحسابات من أخطاء التقريب البرمجي Float Precision
const safeFinance = (val) => {
  if (typeof val !== 'number' || isNaN(val) || !isFinite(val)) return 0;
  return Math.round((val + Number.EPSILON) * 100000) / 100000;
};

// ==========================================
// 1. User Schema (فائق الأمان والذكاء)
// ==========================================
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
    lowercase: true,
    index: true
  },
  firstName: { 
    type: String, 
    default: '', 
    trim: true 
  },
  language: {
    type: String,
    default: 'en',
    trim: true,
    lowercase: true
  },
  isPremium: { 
    type: Boolean, 
    default: false,
    index: true 
  },
  availableBalance: { 
    type: Number, 
    default: 0, 
    min: [0, 'Available balance cannot be negative'],
    set: safeFinance 
  },
  pendingBalance: { 
    type: Number, 
    default: 0, 
    min: [0, 'Pending balance cannot be negative'],
    set: safeFinance 
  },
  referralEarnings: { 
    type: Number, 
    default: 0, 
    min: [0, 'Referral earnings cannot be negative'],
    set: safeFinance 
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
      message: 'Invalid wallet address format (Supported: TRC20, BEP20/ERC20, TON)'
    }
  },
  referredBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    default: null, 
    index: true 
  },
  role: { 
    type: String, 
    enum: {
      values: ['user', 'admin', 'moderator'],
      message: '{VALUE} is not a valid role'
    }, 
    default: 'user',
    index: true 
  },
  isBanned: { 
    type: Boolean, 
    default: false, 
    index: true 
  }
}, { 
  timestamps: true,
  versionKey: false
});

// فهارس مركبة تسرع أداء الاستعلامات الضخمة والفلترة
userSchema.index({ telegramId: 1, isBanned: 1 });
userSchema.index({ role: 1, createdAt: -1 });

// دالة ذكية سريعة للتحقق المباشر من الصلاحيات
userSchema.methods.canPerformAction = function() {
  return !this.isBanned;
};

// ==========================================
// 2. Link Schema (مُحسّن لحركة المرور العالية)
// ==========================================
const linkSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: [true, 'Owner User ID is required'], 
    index: true 
  },
  title: { 
    type: String, 
    default: 'Untitled Link', 
    trim: true,
    maxlength: [150, 'Title length cannot exceed 150 characters']
  },
  originalUrl: { 
    type: String, 
    required: [true, 'Original target URL is required'], 
    trim: true,
    validate: {
      validator: function(v) {
        return /^(https?:\/\/)?([\w.-]+)+[\w\-_~:/?#[\]@!$&'()*+,;=.]+$/i.test(v);
      },
      message: 'Invalid target URL format'
    }
  },
  shortCode: { 
    type: String, 
    required: [true, 'Short code is required'], 
    unique: true, 
    index: true,
    trim: true 
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
  },
  isActive: { 
    type: Boolean, 
    default: true, 
    index: true 
  }
}, { 
  timestamps: true,
  versionKey: false
});

linkSchema.index({ userId: 1, isActive: 1, createdAt: -1 });
linkSchema.index({ shortCode: 1, isActive: 1 });
linkSchema.index({ validImpressions: -1 });

// ==========================================
// 3. Ad Schema (إدارة الحملات المتقدمة)
// ==========================================
const adSchema = new mongoose.Schema({
  advertiserId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: [true, 'Advertiser User ID is required'], 
    index: true 
  },
  title: { 
    type: String, 
    required: [true, 'Ad campaign title is required'], 
    trim: true,
    maxlength: [120, 'Title cannot exceed 120 characters']
  },
  targetUrl: { 
    type: String, 
    required: [true, 'Ad target URL is required'], 
    trim: true,
    validate: {
      validator: function(v) {
        return /^(https?:\/\/)?([\w.-]+)+[\w\-_~:/?#[\]@!$&'()*+,;=.]+$/i.test(v);
      },
      message: 'Invalid target URL format'
    }
  },
  totalBudget: { 
    type: Number, 
    required: [true, 'Total budget is required'], 
    min: [1, 'Minimum total budget is $1'],
    set: safeFinance 
  },
  remainingBudget: { 
    type: Number, 
    required: [true, 'Remaining budget is required'], 
    min: [0, 'Remaining budget cannot be negative'],
    set: safeFinance 
  },
  cpmRate: { 
    type: Number, 
    default: 1.50,
    min: 0,
    set: safeFinance
  },
  costPerImpression: { 
    type: Number, 
    default: 0.0015,
    min: 0,
    set: safeFinance
  },
  publisherEarningsPerImpression: {
    type: Number,
    default: 0.00135,
    min: 0,
    set: safeFinance
  },
  platformFeePerImpression: {
    type: Number,
    default: 0.00015,
    min: 0,
    set: safeFinance
  },
  impressionsCount: { 
    type: Number, 
    default: 0, 
    min: 0 
  },
  status: { 
    type: String, 
    enum: {
      values: ['active', 'paused', 'completed', 'rejected'],
      message: '{VALUE} is not a valid ad status'
    }, 
    default: 'active',
    index: true 
  }
}, { 
  timestamps: true,
  versionKey: false
});

// إغلاق الإعلان تلقائياً عند استهلاك كامل الميزانية
adSchema.pre('save', function(next) {
  if (this.remainingBudget <= 0 && this.status === 'active') {
    this.status = 'completed';
  }
  next();
});

adSchema.index({ status: 1, remainingBudget: 1, createdAt: -1 });
adSchema.index({ advertiserId: 1, status: 1 });

// ==========================================
// 4. Transaction Schema (سجل العمليات الشامل)
// ==========================================
const transactionSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: [true, 'User ID is required'], 
    index: true 
  },
  type: { 
    type: String, 
    enum: {
      values: ['deposit', 'withdraw', 'earning', 'referral', 'refund', 'ad_spend'],
      message: '{VALUE} is not a valid transaction type'
    }, 
    required: true,
    index: true 
  },
  amount: { 
    type: Number, 
    required: [true, 'Transaction amount is required'], 
    set: safeFinance 
  },
  fee: {
    type: Number,
    default: 0,
    set: safeFinance
  },
  netAmount: {
    type: Number,
    default: 0,
    set: safeFinance
  },
  status: { 
    type: String, 
    enum: {
      values: ['pending', 'completed', 'rejected', 'cancelled'],
      message: '{VALUE} is not a valid status'
    }, 
    default: 'pending',
    index: true 
  },
  paymentMethod: { 
    type: String, 
    trim: true,
    default: 'USDT' 
  },
  network: {
    type: String,
    enum: ['BEP20', 'TRC20', 'TON', 'INTERNAL', 'NONE'],
    default: 'NONE',
    trim: true,
    uppercase: true
  },
  txHash: { 
    type: String, 
    trim: true,
    sparse: true,
    index: true 
  },
  walletAddress: { 
    type: String, 
    trim: true 
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

// الحساب الأوتوماتيكي للمبلغ الصافي بناءً على الرسوم قبل الحفظ
transactionSchema.pre('save', function(next) {
  if (this.amount && this.fee) {
    this.netAmount = safeFinance(Math.max(0, this.amount - this.fee));
  } else if (this.amount) {
    this.netAmount = safeFinance(this.amount);
  }
  next();
});

transactionSchema.index({ userId: 1, type: 1, status: 1, createdAt: -1 });
transactionSchema.index({ status: 1, createdAt: -1 });

// ==========================================
// 5. Impression Schema (تتبع الزيارات الدقيق)
// ==========================================
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
    set: safeFinance
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
    expires: '60d' // مسح أوتوماتيكي بعد 60 يوماً لتوفير مساحة الـ Database
  }
}, { versionKey: false });

impressionSchema.index({ linkId: 1, createdAt: -1 });
impressionSchema.index({ ip: 1, createdAt: -1 });

// ==========================================
// 6. ClickSession Schema (نظام حماية Anti-Bypass)
// ==========================================
const clickSessionSchema = new mongoose.Schema({
  linkId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Link', 
    required: true 
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
    expires: 300 // تنظيف الذاكرة وتدمير الجلسة تلقائياً بعد 5 دقائق
  }
}, { versionKey: false });

clickSessionSchema.index({ linkId: 1, ip: 1 });
clickSessionSchema.index({ bridgeToken: 1 }, { unique: true });

// ==========================================
// 7. EarningsHold Schema (نظام تعليق الأرباح المؤقت)
// ==========================================
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
    set: safeFinance 
  },
  releaseAt: { 
    type: Date, 
    required: true, 
    default: () => new Date(Date.now() + 24 * 60 * 60 * 1000), // الإفراج التلقائي بعد 24 ساعة
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
earningsHoldSchema.index({ userId: 1, isReleased: 1 });

// ==========================================
// 8. Announcement Schema (إعلانات وإشعارات المنصة)
// ==========================================
const announcementSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  content: { type: String, required: true, trim: true },
  isActive: { type: Boolean, default: true, index: true }
}, { 
  timestamps: true,
  versionKey: false 
});

announcementSchema.index({ isActive: 1, createdAt: -1 });

// ==========================================
// Model Export Engine (تجنب Overwrite Error)
// ==========================================
const User = mongoose.models.User || mongoose.model('User', userSchema);
const Link = mongoose.models.Link || mongoose.model('Link', linkSchema);
const Ad = mongoose.models.Ad || mongoose.model('Ad', adSchema);
const Transaction = mongoose.models.Transaction || mongoose.model('Transaction', transactionSchema);
const Impression = mongoose.models.Impression || mongoose.model('Impression', impressionSchema);
const ClickSession = mongoose.models.ClickSession || mongoose.model('ClickSession', clickSessionSchema);
const EarningsHold = mongoose.models.EarningsHold || mongoose.model('EarningsHold', earningsHoldSchema);
const Announcement = mongoose.models.Announcement || mongoose.model('Announcement', announcementSchema);

module.exports = {
  User,
  Link,
  Ad,
  Transaction,
  Impression,
  ClickSession,
  EarningsHold,
  Announcement
};
