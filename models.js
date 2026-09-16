/**
 * Ultra-Enterprise Models Architecture (Production Grade V6.0)
 * Platform: Telega.ads Advertising & Shortener Network
 * Security: Multi-Tenant Data Isolation & Dynamic Context Scoping
 */

if (typeof window !== 'undefined') {
  throw new Error("تنبيه أمني حرِج: يجب تشغيل نماذج Mongoose حصرياً على جانب الخادم (Server-side).");
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
const enforceTenantKey = (tenantKey, keyName = 'userId / telegramId') => {
  if (!tenantKey || String(tenantKey).trim() === '') {
    throw new Error(`خرق أمني [عزل البيانات]: تم رفض الوصول. المعلمة المطلوبة مفقودة: ${keyName}`);
  }
};

// --------------------------------------------------
// 1. User Model (Isolated Profiles, Balances & Stats)
// --------------------------------------------------
const userSchema = new mongoose.Schema({
  telegramId: { 
    type: String, 
    required: [true, 'معرف التليجرام مطلوب بشكل إجباري'], 
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
    min: [0, 'لا يمكن أن يكون الرصيد المعلق سالباً'],
    set: formatCurrency 
  },
  availableBalance: { 
    type: Number, 
    default: 0, 
    min: [0, 'لا يمكن أن يكون الرصيد المتاح سالباً'],
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
    min: [0, 'أرباح الإحالة لا يمكن أن تكون سالبة'],
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
      message: 'صيغة عنوان المحفظة غير صالحة (يجب أن تكون USDT TRC20, BEP20, أو TON)'
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
// 2. Isolated Wallet Model (Central Balance Control)
// --------------------------------------------------
const walletSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: [true, 'معرف المستخدم مطلوب لعزل البيانات'], 
    unique: true,
    index: true 
  },
  telegramId: { 
    type: String, 
    required: [true, 'معرف التليجرام مطلوب للبحث السريع وعزل البيانات'], 
    unique: true,
    index: true, 
    trim: true 
  },
  availableBalance: { 
    type: Number, 
    default: 0, 
    min: [0, 'لا يمكن أن يكون الرصيد المتاح سالباً'], 
    set: formatCurrency 
  },
  pendingBalance: { 
    type: Number, 
    default: 0, 
    min: [0, 'لا يمكن أن يكون الرصيد المعلق سالباً'], 
    set: formatCurrency 
  },
  totalDeposited: { 
    type: Number, 
    default: 0, 
    min: [0, 'إجمالي الإيداع لا يمكن أن يكون سالباً'], 
    set: formatCurrency 
  },
  totalWithdrawn: { 
    type: Number, 
    default: 0, 
    min: [0, 'إجمالي السحوبات لا يمكن أن يكون سالباً'], 
    set: formatCurrency 
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

walletSchema.statics.getWalletByTelegramIdIsolated = function(telegramId) {
  enforceTenantKey(telegramId, 'telegramId');
  return this.findOne({ telegramId: String(telegramId).trim() });
};

// --------------------------------------------------
// 3. Isolated Transaction History Model
// --------------------------------------------------
const transactionSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: [true, 'معرف المستخدم مطلوب لعزل البيانات'], 
    index: true 
  },
  telegramId: { 
    type: String, 
    required: [true, 'معرف التليجرام مطلوب للبحث السريع وعزل البيانات'], 
    index: true, 
    trim: true 
  },
  type: { 
    type: String, 
    enum: ['deposit', 'withdrawal', 'campaign_spend', 'publisher_earning', 'referral_bonus', 'refund'], 
    required: [true, 'نوع المعاملة المالية مطلوب'],
    index: true 
  },
  amount: { 
    type: Number, 
    required: [true, 'مبلغ المعاملة مطلوب'], 
    set: formatCurrency 
  },
  balanceAfter: { 
    type: Number, 
    required: [true, 'الرصيد المتبقي بعد المعاملة مطلوب'], 
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
transactionSchema.index({ telegramId: 1, type: 1, createdAt: -1 });

transactionSchema.statics.getUserTransactionsIsolated = function(userId, filter = {}) {
  enforceTenantKey(userId, 'userId');
  return this.find({ ...filter, userId }).sort({ createdAt: -1 });
};

transactionSchema.statics.getTelegramTransactionsIsolated = function(telegramId, filter = {}) {
  enforceTenantKey(telegramId, 'telegramId');
  return this.find({ ...filter, telegramId: String(telegramId).trim() }).sort({ createdAt: -1 });
};

// --------------------------------------------------
// 4. Self-Serve Ad Model (Campaigns)
// --------------------------------------------------
const adSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: [true, 'معرف المستخدم مطلوب لعزل البيانات'], 
    index: true 
  },
  telegramId: {
    type: String,
    required: [true, 'معرف التليجرام مطلوب للبحث السريع وعزل البيانات'],
    index: true,
    trim: true
  },
  advertiserId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: [true, 'معرف المعلن مطلوب'], 
    index: true 
  },
  advertiserTelegramId: {
    type: String,
    required: [true, 'معرف التليجرام للمعلن مطلوب'],
    index: true,
    trim: true
  },
  title: { 
    type: String, 
    required: [true, 'عنوان الحملة الإعلانية مطلوب'], 
    trim: true, 
    maxlength: [100, 'يجب ألا يتجاوز عنوان الحملة 100 حرف'] 
  },
  targetUrl: { 
    type: String, 
    required: [true, 'رابط الهدف مطلوب'], 
    trim: true,
    validate: {
      validator: function(v) {
        return /^(https?:\/\/)?([\w.-]+)+[\w\-_~:/?#[\]@!$&'()*+,;=.]+$/i.test(v);
      },
      message: 'يرجى إدخال رابط مستهدف صحيح'
    }
  },
  totalBudget: { 
    type: Number, 
    required: [true, 'إجمالي الميزانية مطلوب'], 
    min: [5, 'الحد الأدنى لميزانية الحملة هو $5'], 
    set: formatCurrency 
  },
  remainingBudget: { 
    type: Number, 
    required: true, 
    min: [0, 'الميزانية المتبقية لا يمكن أن تكون سالبة'], 
    set: formatCurrency 
  },
  cpmRate: { 
    type: Number, 
    default: 1.50,
    min: [0, 'سعر الـ CPM لا يمكن أن يكون سالباً'],
    set: formatCurrency
  },
  costPerImpression: { 
    type: Number, 
    default: 0.0015,
    min: [0, 'تكلفة الظهور لا يمكن أن تكون سالبة'],
    set: formatCurrency
  },
  publisherEarningsPerImpression: {
    type: Number,
    default: 0.00135,
    min: [0, 'ربح الناشر لا يمكن أن يكون سالباً'],
    set: formatCurrency
  },
  platformFeePerImpression: {
    type: Number,
    default: 0.00015,
    min: [0, 'رسوم المنصة لا يمكن أن تكون سالبة'],
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
adSchema.index({ telegramId: 1, status: 1, createdAt: -1 });
adSchema.index({ advertiserTelegramId: 1, status: 1, createdAt: -1 });
adSchema.index({ status: 1, remainingBudget: 1, createdAt: -1 });

adSchema.statics.findAdvertiserAdsIsolated = function(userId, filter = {}) {
  enforceTenantKey(userId, 'userId');
  return this.find({ ...filter, $or: [{ userId }, { advertiserId: userId }] }).sort({ createdAt: -1 });
};

adSchema.statics.findAdvertiserAdsByTelegramIdIsolated = function(telegramId, filter = {}) {
  enforceTenantKey(telegramId, 'telegramId');
  const tId = String(telegramId).trim();
  return this.find({ ...filter, $or: [{ telegramId: tId }, { advertiserTelegramId: tId }] }).sort({ createdAt: -1 });
};

// --------------------------------------------------
// 5. Shortened Link Model (Links - Isolated Multi-Tenant)
// --------------------------------------------------
const linkSchema = new mongoose.Schema({
  shortCode: { 
    type: String, 
    required: [true, 'الكود المختصر مطلوب'], 
    unique: true, 
    index: true,
    trim: true 
  },
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    required: [true, 'معرف المستخدم مطلوب لعزل البيانات'], 
    index: true
  },
  telegramId: {
    type: String,
    required: [true, 'معرف التليجرام مطلوب لمنع تداخل البيانات'],
    index: true,
    trim: true
  },
  publisherTelegramId: {
    type: String,
    required: [true, 'معرف التليجرام للناشر مطلوب لمنع تداخل البيانات'],
    index: true,
    trim: true
  },
  title: { 
    type: String, 
    default: 'رابط بدون عنوان', 
    trim: true,
    maxlength: [150, 'عنوان الرابط لا يجب أن يتجاوز 150 حرفاً'] 
  },
  targetUrl: { 
    type: String, 
    required: [true, 'الرابط المستهدف مطلوب'], 
    trim: true,
    validate: {
      validator: function(v) {
        return /^(https?:\/\/)?([\w.-]+)+[\w\-_~:/?#[\]@!$&'()*+,;=.]+$/i.test(v);
      },
      message: 'يرجى إدخال رابط مستهدف صحيح'
    }
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

linkSchema.pre('validate', function(next) {
  if (this.telegramId && !this.publisherTelegramId) this.publisherTelegramId = this.telegramId;
  if (this.publisherTelegramId && !this.telegramId) this.telegramId = this.publisherTelegramId;
  next();
});

linkSchema.index({ userId: 1, createdAt: -1 });
linkSchema.index({ telegramId: 1, createdAt: -1 });
linkSchema.index({ publisherTelegramId: 1, createdAt: -1 });
linkSchema.index({ userId: 1, isActive: 1, createdAt: -1 });
linkSchema.index({ telegramId: 1, isActive: 1, createdAt: -1 });
linkSchema.index({ userId: 1, shortCode: 1 });
linkSchema.index({ telegramId: 1, shortCode: 1 });

linkSchema.statics.getUserIsolatedLinks = function(userId, query = {}, options = {}) {
  enforceTenantKey(userId, 'userId');
  const safeQuery = { ...query, userId };
  return this.find(safeQuery, null, options).sort({ createdAt: -1 });
};

linkSchema.statics.getTelegramIsolatedLinks = function(telegramId, query = {}, options = {}) {
  enforceTenantKey(telegramId, 'telegramId');
  const safeQuery = { ...query, telegramId: String(telegramId).trim() };
  return this.find(safeQuery, null, options).sort({ createdAt: -1 });
};

linkSchema.statics.findOneIsolated = function(shortCode, userId) {
  enforceTenantKey(userId, 'userId');
  return this.findOne({ shortCode: String(shortCode).trim(), userId });
};

linkSchema.statics.findOneByTelegramIsolated = function(shortCode, telegramId) {
  enforceTenantKey(telegramId, 'telegramId');
  return this.findOne({ shortCode: String(shortCode).trim(), telegramId: String(telegramId).trim() });
};

// --------------------------------------------------
// 6. Traffic & Impressions Model
// --------------------------------------------------
const impressionSchema = new mongoose.Schema({
  linkId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Link', 
    required: [true, 'معرف الرابط مطلوب'], 
    index: true 
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'معرف المستخدم مطلوب لعزل البيانات'],
    index: true
  },
  telegramId: {
    type: String,
    required: [true, 'معرف التليجرام مطلوب لعزل البيانات'],
    trim: true,
    index: true
  },
  publisherId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  publisherTelegramId: {
    type: String,
    required: true,
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
    min: 0,
    set: formatCurrency
  },
  ip: { 
    type: String, 
    required: [true, 'عنوان IP مطلوب لتدقيق الزيارات'], 
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
    expires: 5184000 // Automatically purge detailed logs after 60 days to keep DB performant
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
impressionSchema.index({ linkId: 1, userId: 1, createdAt: -1 });
impressionSchema.index({ ip: 1, linkId: 1, createdAt: -1 });

impressionSchema.statics.getPublisherImpressionsIsolated = function(userId, extraFilter = {}) {
  enforceTenantKey(userId, 'userId');
  return this.find({ ...extraFilter, $or: [{ userId }, { publisherId: userId }] }).sort({ createdAt: -1 });
};

impressionSchema.statics.getPublisherImpressionsByTelegramIsolated = function(telegramId, extraFilter = {}) {
  enforceTenantKey(telegramId, 'telegramId');
  const tId = String(telegramId).trim();
  return this.find({ ...extraFilter, $or: [{ telegramId: tId }, { publisherTelegramId: tId }] }).sort({ createdAt: -1 });
};

// --------------------------------------------------
// 7. Anti-Bypass Click Session Model
// --------------------------------------------------
const clickSessionSchema = new mongoose.Schema({
  linkId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Link', 
    required: [true, 'معرف الرابط مطلوب للجلسة'] 
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'معرف المستخدم مطلوب لعزل البيانات'],
    index: true
  },
  telegramId: {
    type: String,
    required: [true, 'معرف التليجرام مطلوب لعزل البيانات'],
    trim: true,
    index: true
  },
  publisherId: {
    type: mongoose.Schema.Types.ObjectId,
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
    required: [true, 'عنوان IP مطلوب لتدقيق الجلسة'], 
    trim: true 
  },
  bridgeToken: { 
    type: String, 
    required: [true, 'رمز العبور (Bridge Token) مطلوب لمنع الاحتيال'], 
    trim: true 
  },
  createdAt: { 
    type: Date, 
    default: Date.now, 
    expires: 300 // Temporary token valid for 5 minutes only
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
clickSessionSchema.index({ bridgeToken: 1 }, { unique: true });

// --------------------------------------------------
// 8. Withdraw Request Model (Withdrawals)
// --------------------------------------------------
const withdrawSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: [true, 'معرف المستخدم مطلوب لعزل البيانات'], 
    index: true 
  },
  telegramId: {
    type: String,
    required: [true, 'معرف التليجرام مطلوب لعزل البيانات'],
    trim: true,
    index: true
  },
  amount: { 
    type: Number, 
    required: [true, 'مبلغ السحب الإجمالي مطلوب'], 
    min: [30, 'الحد الأدنى للسحب هو $30'],
    set: formatCurrency 
  },
  fee: {
    type: Number,
    default: 3,
    min: 0,
    set: formatCurrency
  },
  netAmount: {
    type: Number,
    required: true,
    min: 0,
    set: formatCurrency
  },
  network: {
    type: String,
    enum: ['BEP20', 'TRC20', 'TON'],
    required: [true, 'يرجى اختيار شبكة السحب (BEP20, TRC20, أو TON)'],
    trim: true,
    uppercase: true
  },
  walletAddress: { 
    type: String, 
    required: [true, 'عنوان المحفظة مطلوب'], 
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

withdrawSchema.index({ userId: 1, status: 1, createdAt: -1 });
withdrawSchema.index({ telegramId: 1, status: 1, createdAt: -1 });

// Partial Index: Enforces ONLY ONE pending withdrawal request per user at any given time (Prevents Double-Spend Attacks)
withdrawSchema.index(
  { userId: 1 }, 
  { unique: true, partialFilterExpression: { status: 'pending' } }
);

withdrawSchema.index(
  { telegramId: 1 }, 
  { unique: true, partialFilterExpression: { status: 'pending' } }
);

withdrawSchema.statics.getUserWithdrawalsIsolated = function(userId, status = null) {
  enforceTenantKey(userId, 'userId');
  const query = { userId };
  if (status) query.status = status;
  return this.find(query).sort({ createdAt: -1 });
};

withdrawSchema.statics.getTelegramWithdrawalsIsolated = function(telegramId, status = null) {
  enforceTenantKey(telegramId, 'telegramId');
  const query = { telegramId: String(telegramId).trim() };
  if (status) query.status = status;
  return this.find(query).sort({ createdAt: -1 });
};

// --------------------------------------------------
// 9. Earnings Hold Model
// --------------------------------------------------
const earningsHoldSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: [true, 'معرف المستخدم مطلوب لعزل البيانات'], 
    index: true 
  },
  telegramId: {
    type: String,
    required: [true, 'معرف التليجرام مطلوب لعزل البيانات'],
    trim: true,
    index: true
  },
  amount: { 
    type: Number, 
    required: true, 
    min: [0, 'المبلغ لا يمكن أن يكون سالباً'],
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
earningsHoldSchema.index({ telegramId: 1, isReleased: 1, releaseAt: 1 });

earningsHoldSchema.statics.getUserHoldsIsolated = function(userId) {
  enforceTenantKey(userId, 'userId');
  return this.find({ userId, isReleased: false }).sort({ releaseAt: 1 });
};

earningsHoldSchema.statics.getTelegramHoldsIsolated = function(telegramId) {
  enforceTenantKey(telegramId, 'telegramId');
  return this.find({ telegramId: String(telegramId).trim(), isReleased: false }).sort({ releaseAt: 1 });
};

// --------------------------------------------------
// 10. Advertiser Deposit Model (Deposits)
// --------------------------------------------------
const depositSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'معرف المستخدم مطلوب لعزل البيانات'],
    index: true
  },
  telegramId: {
    type: String,
    required: [true, 'معرف التليجرام مطلوب للبحث السريع وعزل البيانات'],
    trim: true,
    index: true
  },
  advertiserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'معرف المعلن مطلوب'],
    index: true
  },
  advertiserTelegramId: {
    type: String,
    required: [true, 'معرف التليجرام للمعلن مطلوب'],
    trim: true,
    index: true
  },
  amount: {
    type: Number,
    required: [true, 'مبلغ الإيداع مطلوب'],
    min: [1, 'الحد الأدنى للإيداع هو $1'],
    set: formatCurrency
  },
  network: {
    type: String,
    enum: ['BEP20', 'TRC20', 'TON'],
    required: [true, 'يرجى اختيار شبكة الإيداع (BEP20, TRC20, TON)'],
    trim: true,
    uppercase: true
  },
  txid: {
    type: String,
    required: [true, 'معرف المعاملة (TxID / Transaction Hash) مطلوب'],
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

depositSchema.pre('validate', function(next) {
  if (this.userId && !this.advertiserId) this.advertiserId = this.userId;
  if (this.advertiserId && !this.userId) this.userId = this.advertiserId;
  if (this.telegramId && !this.advertiserTelegramId) this.advertiserTelegramId = this.telegramId;
  if (this.advertiserTelegramId && !this.telegramId) this.telegramId = this.advertiserTelegramId;
  next();
});

depositSchema.index({ userId: 1, status: 1, createdAt: -1 });
depositSchema.index({ telegramId: 1, status: 1, createdAt: -1 });
depositSchema.index({ advertiserTelegramId: 1, status: 1, createdAt: -1 });

depositSchema.statics.getAdvertiserDepositsIsolated = function(userId) {
  enforceTenantKey(userId, 'userId');
  return this.find({ $or: [{ userId }, { advertiserId: userId }] }).sort({ createdAt: -1 });
};

depositSchema.statics.getAdvertiserDepositsByTelegramIsolated = function(telegramId) {
  enforceTenantKey(telegramId, 'telegramId');
  const tId = String(telegramId).trim();
  return this.find({ $or: [{ telegramId: tId }, { advertiserTelegramId: tId }] }).sort({ createdAt: -1 });
};

// --------------------------------------------------
// 11. Announcement Model
// --------------------------------------------------
const announcementSchema = new mongoose.Schema({
  title: { 
    type: String, 
    required: [true, 'عنوان الإعلان مطلوب'], 
    trim: true 
  },
  content: { 
    type: String, 
    required: [true, 'محتوى الإعلان مطلوب'], 
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
    index: true 
  }
}, globalSchemaOptions);

announcementSchema.index({ isActive: 1, targetUser: 1, createdAt: -1 });
announcementSchema.index({ isActive: 1, targetTelegramId: 1, createdAt: -1 });

announcementSchema.statics.getForUserIsolated = function(userId, telegramId) {
  const queryOr = [{ targetUser: null, targetTelegramId: null }];
  if (userId) queryOr.push({ targetUser: userId });
  if (telegramId) queryOr.push({ targetTelegramId: String(telegramId).trim() });

  return this.find({
    isActive: true,
    $or: queryOr
  }).sort({ createdAt: -1 });
};

// Exporting Optimized Safe Models for Multi-Tenant Serverless / Persistent Deployments
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
