const mongoose = require('mongoose');
const { 
  sanitizeTelegramId, 
  sanitizeString, 
  globalSchemaOptions 
} = require('./helpers');

const clickSessionSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: [true, 'Session ID is required'],
    unique: true,
    trim: true,
    index: true
  },
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
  visitorTelegramId: { 
    type: String, 
    default: null, 
    trim: true,
    index: true,
    set: sanitizeTelegramId
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
    required: [true, 'IP address is required'], 
    trim: true 
  },
  deviceFingerprint: {
    type: String,
    default: null,
    trim: true,
    set: sanitizeString
  },
  nonceToken: {
    type: String,
    required: [true, 'Nonce token is required'],
    trim: true,
    index: true,
    set: sanitizeString
  },
  bridgeToken: { 
    type: String, 
    required: [true, 'Bridge token is required'],
    trim: true,
    set: sanitizeString
  },
  userAgent: {
    type: String,
    default: '',
    trim: true
  },
  deviceType: {
    type: String,
    enum: ['mobile', 'desktop', 'tablet', 'unknown'],
    default: 'unknown'
  },
  browser: {
    type: String,
    default: 'unknown',
    trim: true
  },
  isVerified: {
    type: Boolean,
    default: false,
    index: true
  },
  verifiedAt: {
    type: Date,
    default: null
  },
  interactionTime: {
    type: Number,
    default: 0,
    min: 0
  },
  expiresAt: {
    type: Date,
    required: true,
    default: () => new Date(Date.now() + 15 * 60 * 1000), // 15 Minutes
    index: { expires: 0 }
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
}, globalSchemaOptions);

clickSessionSchema.pre('validate', function(next) {
  if (this.publisherId && !this.userId) this.userId = this.publisherId;
  if (this.userId && !this.publisherId) this.publisherId = this.userId;
  if (this.nonceToken && !this.bridgeToken) this.bridgeToken = this.nonceToken;
  if (this.bridgeToken && !this.nonceToken) this.nonceToken = this.bridgeToken;
  next();
});

clickSessionSchema.index({ linkId: 1, ip: 1 });
clickSessionSchema.index({ userId: 1, createdAt: -1 });
clickSessionSchema.index({ nonceToken: 1 }, { unique: true, sparse: true });
clickSessionSchema.index({ bridgeToken: 1 }, { unique: true, sparse: true });

const ClickSession = mongoose.models.ClickSession || mongoose.model('ClickSession', clickSessionSchema);

module.exports = ClickSession;
module.exports.ClickSession = ClickSession;
