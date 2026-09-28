const mongoose = require('mongoose');
const { 
  formatCurrency, 
  sanitizeTelegramId, 
  isObjectId, 
  globalSchemaOptions 
} = require('./helpers');

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
    trim: true
  },

  /* --- نوع الإعلان وحقول الوسائط المتقدمة --- */
  type: {
    type: String,
    enum: ['image', 'video', 'app', 'game'],
    default: 'image',
    index: true
  },
  mediaUrl: {
    type: String,
    trim: true,
    default: ''
  },
  appDownloadUrl: {
    type: String,
    trim: true,
    default: ''
  },
  gameEmbedUrl: {
    type: String,
    trim: true,
    default: ''
  },

  /* --- حقول الاستهداف المتقدم (Targeting) --- */
  targeting: {
    countries: {
      type: [String],
      default: ['ALL']
    },
    devices: {
      type: [String],
      enum: ['Android', 'iOS', 'Desktop'],
      default: ['Android', 'iOS', 'Desktop']
    },
    operatingSystems: {
      type: [String],
      default: ['ALL']
    }
  },

  /* --- حقل استهداف نوع المحتوى --- */
  targetCategory: {
    type: String,
    enum: ['all', 'video', 'image', 'app_game', 'file'],
    default: 'all',
    index: true,
    trim: true
  },

  /* --- حقول الميزانية والإحصائيات والأسعار --- */
  totalBudget: { 
    type: Number, 
    required: [true, 'Total budget is required'], 
    min: [5, 'Minimum campaign budget is $5'], 
    set: formatCurrency 
  },
  dailyBudget: {
    type: Number,
    default: 0,
    min: [0, 'Daily budget cannot be negative'],
    set: formatCurrency
  },
  remainingBudget: { 
    type: Number, 
    required: [true, 'Remaining budget is required'], 
    min: [0, 'Remaining budget cannot be negative'], 
    set: formatCurrency 
  },
  cpcRate: {
    type: Number,
    default: 0.05,
    min: [0, 'CPC rate cannot be negative'],
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
  clicksCount: {
    type: Number,
    default: 0,
    min: [0, 'Clicks count cannot be negative']
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
adSchema.index({ advertiserTelegramId: 1, status: 1, createdAt: -1 });
adSchema.index({ status: 1, targetCategory: 1, type: 1, remainingBudget: 1 });

adSchema.statics.findAdvertiserAdsIsolated = function(identifier, filter = {}) {
  if (!identifier) return this.find({ _id: { $exists: false } });
  
  const queryConditions = [];
  if (isObjectId(identifier)) {
    queryConditions.push({ userId: identifier }, { advertiserId: identifier });
  }
  const tgStr = sanitizeTelegramId(identifier);
  if (tgStr) {
    queryConditions.push({ telegramId: tgStr }, { advertiserTelegramId: tgStr });
  }

  if (queryConditions.length === 0) return this.find({ _id: { $exists: false } });

  return this.find({ ...filter, $or: queryConditions }).sort({ createdAt: -1 });
};

const Ad = mongoose.models.Ad || mongoose.model('Ad', adSchema, 'ads');
const Campaign = mongoose.models.Campaign || mongoose.model('Campaign', adSchema, 'ads');

module.exports = {
  Ad,
  Campaign
};
module.exports.Ad = Ad;
module.exports.Campaign = Campaign;
