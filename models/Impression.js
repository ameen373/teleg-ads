const mongoose = require('mongoose');
const { 
  formatCurrency, 
  sanitizeTelegramId, 
  sanitizeString,
  isObjectId, 
  globalSchemaOptions 
} = require('./helpers');

const impressionSchema = new mongoose.Schema({
  linkId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Link', 
    required: [true, 'Link ID is required'], 
    index: true 
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true
  },
  publisherId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true
  },
  telegramId: {
    type: String,
    default: null,
    trim: true,
    index: true,
    set: sanitizeTelegramId
  },
  publisherTelegramId: {
    type: String,
    default: null,
    trim: true,
    index: true,
    set: sanitizeTelegramId
  },
  viewerTelegramId: {
    type: String,
    default: null,
    trim: true,
    index: true,
    set: sanitizeTelegramId
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
    min: [0, 'Earnings cannot be negative'],
    set: formatCurrency
  },
  cost: {
    type: Number,
    default: 0.0015,
    min: [0, 'Cost cannot be negative'],
    set: formatCurrency
  },
  viewerIp: { 
    type: String, 
    required: [true, 'Viewer IP address is required'], 
    trim: true,
    index: true
  },
  ip: { 
    type: String, 
    trim: true 
  },
  deviceFingerprint: {
    type: String,
    default: null,
    trim: true,
    index: true,
    set: sanitizeString
  },
  country: {
    type: String,
    default: 'XX',
    trim: true,
    uppercase: true,
    maxLength: 3
  },
  status: {
    type: String,
    enum: ['valid', 'flagged', 'rejected'],
    default: 'valid',
    index: true
  },
  userAgent: { 
    type: String, 
    default: '', 
    trim: true 
  },
  isUnique: { 
    type: Boolean, 
    default: true,
    index: true 
  },
  createdAt: { 
    type: Date, 
    default: Date.now, 
    expires: '60d' 
  }
}, globalSchemaOptions);

impressionSchema.pre('validate', function(next) {
  if (this.publisherId && !this.userId) this.userId = this.publisherId;
  if (this.userId && !this.publisherId) this.publisherId = this.userId;
  if (this.telegramId && !this.publisherTelegramId) this.publisherTelegramId = this.telegramId;
  if (this.publisherTelegramId && !this.telegramId) this.telegramId = this.publisherTelegramId;
  if (this.viewerIp && !this.ip) this.ip = this.viewerIp;
  if (this.ip && !this.viewerIp) this.viewerIp = this.ip;
  next();
});

impressionSchema.index({ userId: 1, createdAt: -1 });
impressionSchema.index({ telegramId: 1, createdAt: -1 });
impressionSchema.index({ adId: 1, createdAt: -1 });
impressionSchema.index({ viewerIp: 1, createdAt: -1 });
impressionSchema.index({ deviceFingerprint: 1, createdAt: -1 });
impressionSchema.index({ linkId: 1, viewerIp: 1, createdAt: -1 });

impressionSchema.statics.getPublisherImpressionsIsolated = function(identifier, extraFilter = {}) {
  if (!identifier) return this.find({ _id: { $exists: false } });
  
  const conditions = [];
  if (isObjectId(identifier)) {
    conditions.push({ userId: identifier }, { publisherId: identifier });
  }
  const tgStr = sanitizeTelegramId(identifier);
  if (tgStr) {
    conditions.push({ telegramId: tgStr }, { publisherTelegramId: tgStr }, { viewerTelegramId: tgStr });
  }

  if (conditions.length === 0) return this.find({ _id: { $exists: false } });

  return this.find({ ...extraFilter, $or: conditions }).sort({ createdAt: -1 });
};

const Impression = mongoose.models.Impression || mongoose.model('Impression', impressionSchema);

module.exports = Impression;
module.exports.Impression = Impression;
