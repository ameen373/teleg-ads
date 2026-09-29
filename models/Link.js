const mongoose = require('mongoose');
const { 
  formatCurrency, 
  sanitizeTelegramId, 
  isObjectId, 
  globalSchemaOptions 
} = require('./helpers');

const linkSchema = new mongoose.Schema({
  // حقل الكود الموحد والمطلوب والفريد
  code: {
    type: String,
    required: [true, 'Link code is required'],
    unique: true,
    index: true,
    trim: true
  },
  shortCode: { 
    type: String, 
    unique: true, 
    sparse: true,
    index: true,
    trim: true 
  },
  shortUrl: {
    type: String,
    default: '',
    trim: true
  },
  originalUrl: {
    type: String,
    required: [true, 'Original URL is required'],
    trim: true
  },
  targetUrl: { 
    type: String, 
    trim: true 
  },
  // ربط المستخدم إجبارياً بحقل userId لمنع تداخل البيانات
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    required: [true, 'User ID is required'],
    index: true
  },
  telegramId: {
    type: String,
    default: null,
    index: true,
    trim: true,
    set: sanitizeTelegramId
  },
  publisherTelegramId: {
    type: String,
    default: null,
    index: true,
    trim: true,
    set: sanitizeTelegramId
  },
  title: { 
    type: String, 
    default: 'Untitled Link', 
    trim: true,
    maxlength: 150 
  },

  /* --- حقول التصنيف والميتا داتا --- */
  category: {
    type: String,
    enum: ['video', 'image', 'app_game', 'file', 'general'],
    default: 'general',
    index: true,
    trim: true
  },
  previewTitle: {
    type: String,
    default: '',
    trim: true
  },
  previewImage: {
    type: String,
    default: '',
    trim: true
  },
  fileSize: {
    type: String,
    default: '',
    trim: true
  },

  /* --- حقول التتبع والتفاعل --- */
  isActive: { 
    type: Boolean, 
    default: true, 
    index: true 
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
  validImpressions: { 
    type: Number, 
    default: 0, 
    min: [0, 'Valid impressions count cannot be negative'] 
  },
  invalidImpressions: { 
    type: Number, 
    default: 0, 
    min: [0, 'Invalid impressions count cannot be negative'] 
  },
  totalEarnings: {
    type: Number,
    default: 0,
    min: [0, 'Total earnings cannot be negative'],
    set: formatCurrency
  }
}, globalSchemaOptions);

// مزامنة الكود والروابط قبل الفحص
linkSchema.pre('validate', function(next) {
  if (this.code && !this.shortCode) {
    this.shortCode = this.code;
  } else if (this.shortCode && !this.code) {
    this.code = this.shortCode;
  }

  if (this.originalUrl && !this.targetUrl) this.targetUrl = this.originalUrl;
  if (this.targetUrl && !this.originalUrl) this.originalUrl = this.targetUrl;

  if (this.telegramId && !this.publisherTelegramId) this.publisherTelegramId = this.telegramId;
  if (this.publisherTelegramId && !this.telegramId) this.telegramId = this.publisherTelegramId;

  if (this.clicks > 0 && this.views === 0) this.views = this.clicks;
  if (this.views > 0 && this.clicks === 0) this.clicks = this.views;

  next();
});

linkSchema.index({ userId: 1, createdAt: -1 });
linkSchema.index({ telegramId: 1, createdAt: -1 });
linkSchema.index({ code: 1, isActive: 1 });
linkSchema.index({ shortCode: 1, isActive: 1 });
linkSchema.index({ category: 1, createdAt: -1 });

linkSchema.statics.getUserIsolatedLinks = function(identifier, query = {}, options = {}) {
  if (!identifier) return this.find({ _id: { $exists: false } });
  
  const conditions = [];
  if (isObjectId(identifier)) {
    conditions.push({ userId: identifier });
  }
  const tgStr = sanitizeTelegramId(identifier);
  if (tgStr) {
    conditions.push({ telegramId: tgStr }, { publisherTelegramId: tgStr });
  }

  if (conditions.length === 0) return this.find({ _id: { $exists: false } });

  const safeQuery = { 
    ...query, 
    $or: conditions 
  };
  return this.find(safeQuery, null, options).sort({ createdAt: -1 });
};

linkSchema.statics.findOneIsolated = function(code, identifier) {
  if (!code || !identifier) return this.findOne({ _id: null });
  
  const searchCode = String(code).trim();
  const conditions = [];
  if (isObjectId(identifier)) {
    conditions.push({ userId: identifier });
  }
  const tgStr = sanitizeTelegramId(identifier);
  if (tgStr) {
    conditions.push({ telegramId: tgStr }, { publisherTelegramId: tgStr });
  }

  if (conditions.length === 0) return this.findOne({ _id: null });

  return this.findOne({ 
    $and: [
      { $or: [{ code: searchCode }, { shortCode: searchCode }] },
      { $or: conditions }
    ]
  });
};

linkSchema.statics.findByShortCode = function(code) {
  if (!code) return this.findOne({ _id: null });
  const searchCode = String(code).trim();
  return this.findOne({ 
    $or: [{ code: searchCode }, { shortCode: searchCode }],
    isActive: true 
  });
};

const Link = mongoose.models.Link || mongoose.model('Link', linkSchema, 'links');
const ShortLink = mongoose.models.ShortLink || mongoose.model('ShortLink', linkSchema, 'links');

module.exports = {
  Link,
  ShortLink
};
