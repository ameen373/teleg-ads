const mongoose = require('mongoose');
const { 
  formatCurrency, 
  sanitizeTelegramId, 
  isObjectId, 
  globalSchemaOptions 
} = require('./helpers');

const earningsHoldSchema = new mongoose.Schema({
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
  amount: { 
    type: Number, 
    required: [true, 'Hold amount is required'], 
    min: [0, 'Hold amount cannot be negative'],
    set: formatCurrency 
  },
  releaseAt: { 
    type: Date, 
    required: [true, 'Release date is required'], 
    default: () => new Date(Date.now() + 24 * 60 * 60 * 1000),
    index: true 
  },
  isReleased: { 
    type: Boolean, 
    default: false, 
    index: true 
  }
}, globalSchemaOptions);

earningsHoldSchema.index({ userId: 1, createdAt: -1 });
earningsHoldSchema.index({ telegramId: 1, isReleased: 1, releaseAt: 1 });

earningsHoldSchema.statics.getUserHoldsIsolated = function(identifier) {
  if (!identifier) return this.find({ _id: { $exists: false } });
  
  const conditions = [];
  if (isObjectId(identifier)) {
    conditions.push({ userId: identifier });
  }
  const tgStr = sanitizeTelegramId(identifier);
  if (tgStr) {
    conditions.push({ telegramId: tgStr });
  }

  if (conditions.length === 0) return this.find({ _id: { $exists: false } });

  return this.find({ $or: conditions, isReleased: false }).sort({ releaseAt: 1 });
};

const EarningsHold = mongoose.models.EarningsHold || mongoose.model('EarningsHold', earningsHoldSchema);

module.exports = EarningsHold;
module.exports.EarningsHold = EarningsHold;
