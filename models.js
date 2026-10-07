const mongoose = require('mongoose');

// ==========================================
// الاتصال بقاعدة البيانات باستخدام process.env.MONGO_URI
// ==========================================
const connectDatabase = async () => {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (mongoUri && mongoose.connection.readyState === 0) {
    try {
      await mongoose.connect(mongoUri);
      console.log('[DATABASE] Connected successfully via models.js');
    } catch (err) {
      console.error('[DATABASE] Connection error in models.js:', err.message);
    }
  }
};

if (process.env.MONGO_URI || process.env.MONGODB_URI) {
  connectDatabase();
}

// ==========================================
// 1. مخطط المستخدمين (User Schema)
// ==========================================
const userSchema = new mongoose.Schema({
  telegramId: { type: String, required: true, unique: true, index: true },
  username: { type: String, default: '', trim: true },
  firstName: { type: String, default: '', trim: true },
  lastName: { type: String, default: '', trim: true },
  language: { type: String, default: 'ar' },
  role: { 
    type: String, 
    enum: ['user', 'advertiser', 'publisher', 'admin', 'User', 'Advertiser', 'Publisher', 'Admin'], 
    default: 'user', 
    index: true 
  },
  accountStatus: { 
    type: String, 
    enum: ['active', 'banned', 'suspended'], 
    default: 'active',
    index: true
  },
  
  // الأرصدة والمالية
  balance: { type: Number, default: 0.0, min: 0 },
  availableBalance: { type: Number, default: 0.0, min: 0 },
  reservedBalance: { type: Number, default: 0.0, min: 0 },
  pendingBalance: { type: Number, default: 0.0, min: 0 },
  pendingWithdrawal: { type: Number, default: 0.0, min: 0 },
  totalEarned: { type: Number, default: 0.0, min: 0 },
  totalSpent: { type: Number, default: 0.0, min: 0 },
  totalWithdrawn: { type: Number, default: 0.0, min: 0 },
  
  // الإحالات
  referrerId: { type: String, default: null, index: true },
  referredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  referralCode: { type: String, unique: true, sparse: true, index: true },
  referralCount: { type: Number, default: 0, min: 0 },
  referralEarnings: { type: Number, default: 0.0, min: 0 },

  // حماية وإعدادات حساب وتقييم المخاطر
  usdtTrc20Address: { type: String, default: '', trim: true },
  ipAddress: { type: String, default: '' },
  deviceHash: { type: String, default: '' },
  riskScore: { type: Number, default: 0, min: 0, max: 100 },
  riskCategory: { type: String, enum: ['normal', 'monitored', 'suspicious', 'high_risk'], default: 'normal' },
  isBlocked: { type: Boolean, default: false },
  isAdmin: { type: Boolean, default: false },
  lastActive: { type: Date, default: Date.now, index: true }
}, { timestamps: true });

// فهارس إضافية محسنة للاستعلامات السريعة
userSchema.index({ telegramId: 1, accountStatus: 1 });
userSchema.index({ role: 1, isBlocked: 1 });
userSchema.index({ createdAt: -1 });

// ==========================================
// 2. مخطط الحملات الإعلانية (Campaign Schema)
// ==========================================
const campaignSchema = new mongoose.Schema({
  advertiserId: { type: String, required: true, index: true },
  advertiserUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  title: { type: String, required: true, trim: true },
  url: { type: String, trim: true },
  targetUrl: { type: String, required: true, trim: true },
  adText: { type: String, default: '', trim: true },
  mediaUrl: { type: String, default: '' },
  bannerUrl: { type: String, default: '' },
  mediaType: { type: String, enum: ['image', 'video', 'none'], default: 'none' },
  videoDuration: { type: Number, default: 0, max: 60 },
  pricingType: { type: String, enum: ['CPC', 'CPM'], default: 'CPC' },
  
  // الميزانية والتكاليف
  budget: { type: Number, default: 0, min: 0 },
  totalBudget: { type: Number, required: true, min: 0.1 },
  remainingBudget: { type: Number, default: 0, min: 0 },
  reservedBudget: { type: Number, default: 0, min: 0 },
  spentBudget: { type: Number, default: 0, min: 0 },
  spent: { type: Number, default: 0, min: 0 },
  costPerClick: { type: Number, default: 0.01, min: 0 },
  cpc: { type: Number, default: 0.01, min: 0 },
  cpm: { type: Number, default: 0, min: 0 },
  
  // الإحصائيات والحالة
  impressions: { type: Number, default: 0, min: 0 },
  clicks: { type: Number, default: 0, min: 0 },
  totalClicks: { type: Number, default: 0, min: 0 },
  ctr: { type: Number, default: 0 },
  qualityScore: { type: Number, default: 1.0, min: 0.1, max: 10.0 },
  status: { 
    type: String, 
    enum: ['Draft', 'Pending Review', 'Active', 'Paused', 'Completed', 'Rejected', 'active', 'paused', 'completed', 'rejected'], 
    default: 'active',
    index: true 
  },
  startDate: { type: Date, default: Date.now, index: true },
  endDate: { type: Date, index: true }
}, { timestamps: true });

campaignSchema.index({ status: 1, totalBudget: 1, spentBudget: 1 });
campaignSchema.index({ advertiserId: 1, status: 1 });
campaignSchema.index({ status: 1, spent: 1, budget: 1 });

// ==========================================
// 3. مخطط اختصار الروابط (ShortLink Schema)
// ==========================================
const shortLinkSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  owner: { type: String, index: true },
  userRef: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  shortCode: { type: String, required: true, unique: true, index: true },
  shortId: { type: String, index: true },
  originalUrl: { type: String, required: true, trim: true },
  views: { type: Number, default: 0, min: 0 },
  clicks: { type: Number, default: 0, min: 0 },
  earnings: { type: Number, default: 0.0, min: 0 },
  status: { type: String, enum: ['active', 'disabled'], default: 'active', index: true },
  lastActivity: { type: Date, default: Date.now, index: true }
}, { timestamps: true });

shortLinkSchema.index({ userId: 1, createdAt: -1 });

// ==========================================
// 4. مخطط سجل الزيارات والحماية (VisitLog Schema)
// ==========================================
const visitLogSchema = new mongoose.Schema({
  linkId: { type: mongoose.Schema.Types.ObjectId, ref: 'ShortLink', index: true },
  visitorIp: { type: String, required: true, index: true },
  userAgent: { type: String, default: '' },
  telegramUserId: { type: String, default: '', index: true },
  fingerprint: { type: String, default: '' },
  fraudScore: { type: Number, default: 0 },
  status: { type: String, enum: ['Valid', 'Suspicious', 'Fraud'], default: 'Valid', index: true },
  type: { type: String, enum: ['view', 'click'], required: true },
  netEarnings: { type: Number, default: 0.0 },
  processed: { type: Boolean, default: false, index: true },
  unlockedAt: { type: Date, index: true }
}, { timestamps: true });

visitLogSchema.index({ visitorIp: 1, createdAt: -1 });

// ==========================================
// 5. مخطط الأحداث الإعلانية (AdEvent Schema)
// ==========================================
const adEventSchema = new mongoose.Schema({
  campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', required: true, index: true },
  publisherId: { type: String, index: true },
  type: { type: String, enum: ['impression', 'click'], required: true, index: true },
  cost: { type: Number, default: 0 },
  publisherEarnings: { type: Number, default: 0 },
  visitorIp: { type: String, default: '127.0.0.1', index: true },
  telegramId: { type: String, default: '', index: true }
}, { timestamps: true });

adEventSchema.index({ campaignId: 1, createdAt: -1 });

// ==========================================
// 6. مخطط السجل المالي والمعاملات (Ledger Schema)
// ==========================================
const ledgerSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  userRef: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  type: { 
    type: String, 
    enum: [
      'DEPOSIT', 'WITHDRAWAL', 'REFERRAL_BONUS', 'AD_SPEND', 
      'CAMPAIGN_RESERVE', 'CAMPAIGN_UNRESERVE', 'CPC_SPEND', 
      'CPM_SPEND', 'PUBLISHER_EARNING', 'SHORTENER_EARN', 'REFUND',
      'deposit', 'withdrawal', 'referral_bonus', 'ad_spend', 'shortener_earn', 'ad_click_earn'
    ], 
    required: true,
    index: true 
  },
  amount: { type: Number, required: true },
  availableChange: { type: Number, default: 0 },
  reservedChange: { type: Number, default: 0 },
  spentChange: { type: Number, default: 0 },
  status: { 
    type: String, 
    enum: ['pending', 'completed', 'failed', 'cancelled'], 
    default: 'completed',
    index: true 
  },
  referenceId: { type: mongoose.Schema.Types.ObjectId, index: true },
  description: { type: String, default: '' }
}, { timestamps: true });

ledgerSchema.index({ userId: 1, createdAt: -1 });
ledgerSchema.index({ type: 1, status: 1 });

// ==========================================
// 7. مخطط طلبات السحب (Withdrawal Schema)
// ==========================================
const withdrawalSchema = new mongoose.Schema({
  requestId: { type: String, required: true, unique: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  amount: { type: Number, required: true, min: 0 },
  fee: { type: Number, required: true, default: 0 },
  netAmount: { type: Number, required: true },
  address: { type: String, required: true, trim: true },
  walletAddress: { type: String, trim: true },
  status: {
    type: String,
    enum: ['Pending', 'Approved', 'Processing', 'Paid', 'Rejected'],
    default: 'Pending',
    index: true
  },
  rejectionReason: { type: String, default: '' },
  txid: { type: String, default: '' }
}, { timestamps: true });

withdrawalSchema.index({ status: 1, createdAt: -1 });

// ==========================================
// 8. مخطط طلبات الإيداع (Deposit Schema)
// ==========================================
const depositSchema = new mongoose.Schema({
  requestId: { type: String, required: true, unique: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  network: { type: String, enum: ['TRC20', 'BEP20'], required: true },
  amount: { type: Number, required: true, min: 0 },
  txid: { type: String, required: true, unique: true, trim: true, index: true },
  status: {
    type: String,
    enum: ['Pending', 'Approved', 'Rejected'],
    default: 'Pending',
    index: true
  },
  rejectionReason: { type: String, default: '' }
}, { timestamps: true });

depositSchema.index({ status: 1, createdAt: -1 });

// ==========================================
// 9. مخطط سجلات الإحالة (ReferralLog Schema)
// ==========================================
const referralLogSchema = new mongoose.Schema({
  referrer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  referredUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  source: { type: String, required: true, default: 'EARNING' },
  amount: { type: Number, required: true },
  commission: { type: Number, required: true },
  status: { type: String, enum: ['Eligible', 'Paid', 'Blocked'], default: 'Eligible', index: true },
  flagReason: { type: String, default: '' }
}, { timestamps: true });

referralLogSchema.index({ referrer: 1, createdAt: -1 });

// ==========================================
// 10. مخطط إعدادات النظام (SystemConfig Schema)
// ==========================================
const systemConfigSchema = new mongoose.Schema({
  key: { type: String, default: 'main_config', unique: true, index: true },
  minWithdrawal: { type: Number, default: 5.0 },
  cpcRate: { type: Number, default: 0.05 },
  shortenerCpc: { type: Number, default: 0.02 },
  referralCommissionRate: { type: Number, default: 0.10 },
  supportLink: { type: String, default: 'https://t.me/support' },
  channelLink: { type: String, default: 'https://t.me/channel' }
}, { timestamps: true });

// ==========================================
// 11. مخطط سجلات النشاط (ActivityLog Schema)
// ==========================================
const activityLogSchema = new mongoose.Schema({
  userId: { type: String, default: '', index: true },
  ip: { type: String, required: true, index: true },
  userAgent: { type: String, default: '' },
  action: { type: String, default: 'click' },
  details: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

activityLogSchema.index({ ip: 1, createdAt: -1 });

// ==========================================
// 12. مخطط تنبيهات الاحتيال (FraudAlert Schema)
// ==========================================
const fraudAlertSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  riskScore: { type: Number, required: true, index: true },
  reason: { type: String, required: true },
  details: { type: mongoose.Schema.Types.Mixed, default: {} },
  status: { type: String, enum: ['new', 'reviewed', 'dismissed'], default: 'new', index: true }
}, { timestamps: true });

fraudAlertSchema.index({ createdAt: -1 });

// ==========================================
// تسجيل النماذج وتصديرها (Models Compilation)
// ==========================================
const User = mongoose.models.User || mongoose.model('User', userSchema);
const Campaign = mongoose.models.Campaign || mongoose.model('Campaign', campaignSchema);
const ShortLink = mongoose.models.ShortLink || mongoose.model('ShortLink', shortLinkSchema);
const VisitLog = mongoose.models.VisitLog || mongoose.model('VisitLog', visitLogSchema);
const AdEvent = mongoose.models.AdEvent || mongoose.model('AdEvent', adEventSchema);
const Ledger = mongoose.models.Ledger || mongoose.model('Ledger', ledgerSchema);
const Withdrawal = mongoose.models.Withdrawal || mongoose.model('Withdrawal', withdrawalSchema);
const Deposit = mongoose.models.Deposit || mongoose.model('Deposit', depositSchema);
const ReferralLog = mongoose.models.ReferralLog || mongoose.model('ReferralLog', referralLogSchema);
const SystemConfig = mongoose.models.SystemConfig || mongoose.model('SystemConfig', systemConfigSchema);
const ActivityLog = mongoose.models.ActivityLog || mongoose.model('ActivityLog', activityLogSchema);
const FraudAlert = mongoose.models.FraudAlert || mongoose.model('FraudAlert', fraudAlertSchema);

module.exports = {
  User,
  Campaign,
  AdCampaign: Campaign,        // اسم مستعار للتوافق العكسي
  ShortLink,
  ShortenedLink: ShortLink,    // اسم مستعار للتوافق العكسي
  Link: ShortLink,             // اسم مستعار للتوافق العكسي
  VisitLog,
  AdEvent,
  Ledger,
  Transaction: Ledger,         // اسم مستعار للتوافق العكسي
  Withdrawal,
  Deposit,
  ReferralLog,
  SystemConfig,
  ActivityLog,
  FraudAlert
};
