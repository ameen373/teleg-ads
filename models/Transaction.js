const mongoose = require('mongoose');
const { 
  formatCurrency, 
  sanitizeTelegramId, 
  isObjectId, 
  globalSchemaOptions 
} = require('./helpers');

const transactionSchema = new mongoose.Schema({
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
  type: { 
    type: String, 
    enum: ['deposit', 'withdrawal', 'campaign_spend', 'publisher_earning', 'referral_bonus', 'refund', 'hold_release'], 
    required: [true, 'Transaction type is required'],
    index: true 
  },
  amount: { 
    type: Number, 
    required: [true, 'Transaction amount is required'],
    min: [0, 'Transaction amount cannot be negative'], 
    set: formatCurrency 
  },
  balanceAfter: { 
    type: Number, 
    required: [true, 'Balance after transaction is required'],
    min: [0, 'Balance after transaction cannot be negative'], 
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

transactionSchema.statics.getUserTransactionsIsolated = function(identifier, filter = {}) {
  if (!identifier) return this.find({ _id: { $exists: false } });
  
  const queryConditions = [];
  if (isObjectId(identifier)) {
    queryConditions.push({ userId: identifier });
  }
  const tgStr = sanitizeTelegramId(identifier);
  if (tgStr) {
    queryConditions.push({ telegramId: tgStr });
  }

  if (queryConditions.length === 0) return this.find({ _id: { $exists: false } });

  return this.find({ ...filter, $or: queryConditions }).sort({ createdAt: -1 });
};

const Transaction = mongoose.models.Transaction || mongoose.model('Transaction', transactionSchema);

module.exports = Transaction;
module.exports.Transaction = Transaction;
