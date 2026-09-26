const mongoose = require('mongoose');
const { 
  formatCurrency, 
  sanitizeTelegramId, 
  isObjectId, 
  globalSchemaOptions 
} = require('./helpers');

const walletSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    default: null,
    index: true 
  },
  telegramId: { 
    type: String, 
    unique: true,
    sparse: true,
    index: true, 
    trim: true,
    set: sanitizeTelegramId
  },
  availableBalance: { 
    type: Number, 
    default: 0, 
    min: [0, 'Available balance cannot be negative'], 
    set: formatCurrency 
  },
  pendingBalance: { 
    type: Number, 
    default: 0, 
    min: [0, 'Pending balance cannot be negative'], 
    set: formatCurrency 
  },
  totalDeposited: { 
    type: Number, 
    default: 0, 
    min: [0, 'Total deposited cannot be negative'], 
    set: formatCurrency 
  },
  totalWithdrawn: { 
    type: Number, 
    default: 0, 
    min: [0, 'Total withdrawn cannot be negative'], 
    set: formatCurrency 
  },
  currency: { 
    type: String, 
    default: 'USDT', 
    uppercase: true, 
    trim: true 
  }
}, globalSchemaOptions);

walletSchema.index({ userId: 1, createdAt: -1 });
walletSchema.index({ userId: 1, telegramId: 1 });

walletSchema.statics.getWalletIsolated = async function(identifier) {
  if (!identifier) return null;
  let query = {};
  let tgStr = null;
  
  if (isObjectId(identifier)) {
    query = { userId: identifier };
  } else {
    tgStr = sanitizeTelegramId(identifier);
    if (!tgStr) return null;
    query = { telegramId: tgStr };
  }
  
  let wallet = await this.findOne(query);
  if (!wallet && tgStr) {
    let user = await mongoose.models.User.findOne({ telegramId: tgStr });
    if (!user) {
      try {
        user = await mongoose.models.User.create({ telegramId: tgStr });
      } catch (err) {
        user = await mongoose.models.User.findOne({ telegramId: tgStr });
      }
    }
    try {
      wallet = await this.create({
        telegramId: tgStr,
        userId: user ? user._id : null,
        availableBalance: 0,
        pendingBalance: 0
      });
    } catch (err) {
      wallet = await this.findOne(query);
    }
  }
  return wallet;
};

const Wallet = mongoose.models.Wallet || mongoose.model('Wallet', walletSchema);

module.exports = Wallet;
module.exports.Wallet = Wallet;
