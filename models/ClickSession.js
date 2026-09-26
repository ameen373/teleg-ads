const mongoose = require('mongoose');
const { 
  sanitizeTelegramId, 
  sanitizeString, 
  globalSchemaOptions 
} = require('./helpers');

const clickSessionSchema = new mongoose.Schema({
  linkId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Link', 
    required: [true, 'Link ID is required'] 
  },
  userId: {
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
  publisherId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true
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
  bridgeToken: { 
    type: String, 
    required: [true, 'Bridge token is required'],
    trim: true,
    set: sanitizeString
  },
  createdAt: { 
    type: Date, 
    default: Date.now, 
    expires: 300 
  }
}, globalSchemaOptions);

clickSessionSchema.pre('validate', function(next) {
  if (this.publisherId && !this.userId) this.userId = this.publisherId;
  if (this.userId && !this.publisherId) this.publisherId = this.userId;
  next();
});

clickSessionSchema.index({ linkId: 1, ip: 1 });
clickSessionSchema.index({ userId: 1, createdAt: -1 });
clickSessionSchema.index({ bridgeToken: 1 }, { unique: true, sparse: true });

const ClickSession = mongoose.models.ClickSession || mongoose.model('ClickSession', clickSessionSchema);

module.exports = ClickSession;
module.exports.ClickSession = ClickSession;
