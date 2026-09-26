const mongoose = require('mongoose');
const { 
  formatCurrency, 
  sanitizeTelegramId, 
  isObjectId, 
  globalSchemaOptions 
} = require('./helpers');

const withdrawSchema = new mongoose.Schema({
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
    required: [true, 'Total withdrawal amount is required'], 
    min: [30, 'Minimum withdrawal limit is $30'],
    set: formatCurrency 
  },
  fee: {
    type: Number,
    default: 3,
    min: [0, 'Fee cannot be negative'],
    set: formatCurrency
  },
  netAmount: {
    type: Number,
    required: [true, 'Net withdrawal amount is required'],
    min: [0, 'Net amount cannot be negative'],
    set: formatCurrency
  },
  network: {
    type: String,
    enum: ['BEP20', 'TRC20', 'TON'],
    required: [true, 'Please select network (BEP20, TRC20, or TON)'],
    trim: true,
    uppercase: true
  },
  walletAddress: { 
    type: String, 
    required: [true, 'Wallet address is required'], 
    trim: true 
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
  },
  note: { 
    type: String, 
    default: '', 
    trim: true 
  }
}, globalSchemaOptions);

withdrawSchema.pre('validate', function(next) {
  const amount = typeof this.amount === 'number' ? this.amount : parseFloat(this.amount) || 0;
  const fee = typeof this.fee === 'number' ? this.fee : parseFloat(this.fee) || 3;
  this.netAmount = formatCurrency(Math.max(0, amount - fee));
  next();
});

withdrawSchema.index({ userId: 1, createdAt: -1 });
withdrawSchema.index({ telegramId: 1, createdAt: -1 });
withdrawSchema.index({ telegramId: 1, status: 1, createdAt: -1 });

withdrawSchema.index(
  { telegramId: 1, status: 1 }, 
  { unique: true, sparse: true, partialFilterExpression: { status: 'pending' } }
);

withdrawSchema.statics.getUserWithdrawalsIsolated = function(identifier, status = null) {
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

  const query = { $or: conditions };
  if (status) query.status = status;
  return this.find(query).sort({ createdAt: -1 });
};

const Withdraw = mongoose.models.Withdraw || mongoose.model('Withdraw', withdrawSchema, 'withdraws');
const Withdrawal = mongoose.models.Withdrawal || mongoose.model('Withdrawal', withdrawSchema, 'withdraws');

module.exports = {
  Withdraw,
  Withdrawal
};
module.exports.Withdraw = Withdraw;
module.exports.Withdrawal = Withdrawal;
