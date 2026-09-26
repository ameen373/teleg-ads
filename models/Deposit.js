const mongoose = require('mongoose');
const { 
  formatCurrency, 
  sanitizeTelegramId, 
  sanitizeString, 
  isObjectId, 
  globalSchemaOptions 
} = require('./helpers');

const depositSchema = new mongoose.Schema({
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
  advertiserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true
  },
  advertiserTelegramId: {
    type: String,
    default: null,
    trim: true,
    index: true,
    set: sanitizeTelegramId
  },
  amount: {
    type: Number,
    required: [true, 'Deposit amount is required'],
    min: [1, 'Minimum deposit limit is $1'],
    set: formatCurrency
  },
  network: {
    type: String,
    enum: ['BEP20', 'TRC20', 'TON'],
    required: [true, 'Please select network (BEP20, TRC20, or TON)'],
    trim: true,
    uppercase: true
  },
  txHash: {
    type: String,
    default: undefined,
    trim: true,
    unique: true,
    sparse: true,
    set: sanitizeString
  },
  txId: {
    type: String,
    default: undefined,
    trim: true,
    unique: true,
    sparse: true,
    set: sanitizeString
  },
  txid: {
    type: String,
    default: undefined,
    trim: true,
    unique: true,
    sparse: true,
    set: sanitizeString
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'approved', 'rejected'],
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

  const rawHash = this.txHash || this.txId || this.txid;
  if (rawHash) {
    const cleanHash = sanitizeString(rawHash);
    this.txHash = cleanHash;
    this.txId = cleanHash;
    this.txid = cleanHash;
  } else {
    this.txHash = undefined;
    this.txId = undefined;
    this.txid = undefined;
  }

  next();
});

depositSchema.index({ userId: 1, createdAt: -1 });
depositSchema.index({ telegramId: 1, status: 1, createdAt: -1 });

depositSchema.statics.getAdvertiserDepositsIsolated = function(identifier) {
  if (!identifier) return this.find({ _id: { $exists: false } });
  
  const conditions = [];
  if (isObjectId(identifier)) {
    conditions.push({ userId: identifier }, { advertiserId: identifier });
  }
  const tgStr = sanitizeTelegramId(identifier);
  if (tgStr) {
    conditions.push({ telegramId: tgStr }, { advertiserTelegramId: tgStr });
  }

  if (conditions.length === 0) return this.find({ _id: { $exists: false } });

  return this.find({ $or: conditions }).sort({ createdAt: -1 });
};

const Deposit = mongoose.models.Deposit || mongoose.model('Deposit', depositSchema);

module.exports = Deposit;
module.exports.Deposit = Deposit;
