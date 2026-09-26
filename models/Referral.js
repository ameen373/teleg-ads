const mongoose = require('mongoose');
const { 
  formatCurrency, 
  sanitizeTelegramId, 
  isObjectId, 
  globalSchemaOptions 
} = require('./helpers');

const referralSchema = new mongoose.Schema({
  referrerTelegramId: {
    type: String,
    required: [true, 'Referrer Telegram ID is required'],
    index: true,
    trim: true,
    set: sanitizeTelegramId
  },
  referrerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true
  },
  referredTelegramId: {
    type: String,
    required: [true, 'Referred Telegram ID is required'],
    unique: true,
    sparse: true,
    index: true,
    trim: true,
    set: sanitizeTelegramId
  },
  referredId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true
  },
  commissionEarned: {
    type: Number,
    default: 0,
    min: [0, 'Commission earned cannot be negative'],
    set: formatCurrency
  },
  status: {
    type: String,
    enum: ['active', 'pending', 'blocked'],
    default: 'active',
    index: true
  }
}, globalSchemaOptions);

referralSchema.index({ referrerTelegramId: 1, createdAt: -1 });
referralSchema.index({ referrerId: 1, createdAt: -1 });

referralSchema.statics.getReferralsIsolated = function(identifier) {
  if (!identifier) return this.find({ _id: { $exists: false } });

  const conditions = [];
  if (isObjectId(identifier)) {
    conditions.push({ referrerId: identifier });
  }
  const tgStr = sanitizeTelegramId(identifier);
  if (tgStr) {
    conditions.push({ referrerTelegramId: tgStr });
  }

  if (conditions.length === 0) return this.find({ _id: { $exists: false } });

  return this.find({ $or: conditions }).sort({ createdAt: -1 });
};

const Referral = mongoose.models.Referral || mongoose.model('Referral', referralSchema);

module.exports = Referral;
module.exports.Referral = Referral;
