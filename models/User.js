const mongoose = require('mongoose');
const { 
  formatCurrency, 
  sanitizeTelegramId, 
  isObjectId, 
  globalSchemaOptions 
} = require('./helpers');

const userSchema = new mongoose.Schema({
  telegramId: { 
    type: String, 
    unique: true, 
    sparse: true,
    index: true,
    trim: true,
    set: sanitizeTelegramId
  },
  username: { 
    type: String, 
    default: '', 
    trim: true,
    lowercase: true,
    index: true
  },
  firstName: {
    type: String,
    default: '',
    trim: true
  },
  lastName: {
    type: String,
    default: '',
    trim: true
  },
  language: {
    type: String,
    default: 'ar',
    trim: true,
    lowercase: true
  },
  role: { 
    type: String, 
    enum: ['user', 'admin'], 
    default: 'user',
    index: true 
  },
  pendingBalance: { 
    type: Number, 
    default: 0, 
    min: [0, 'Pending balance cannot be negative'],
    set: formatCurrency 
  },
  availableBalance: { 
    type: Number, 
    default: 0, 
    min: [0, 'Available balance cannot be negative'],
    set: formatCurrency 
  },
  isBanned: { 
    type: Boolean, 
    default: false, 
    index: true 
  },
  referredBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    default: null, 
    index: true 
  },
  referredByTelegramId: {
    type: String,
    default: null,
    index: true,
    trim: true,
    set: sanitizeTelegramId
  },
  referralEarnings: { 
    type: Number, 
    default: 0, 
    min: [0, 'Referral earnings cannot be negative'],
    set: formatCurrency 
  },
  defaultWallet: { 
    type: String, 
    default: '', 
    trim: true,
    validate: {
      validator: function(v) {
        if (!v || v === '' || typeof v !== 'string') return true;
        const cleanV = v.trim();
        if (cleanV === '') return true;
        const isTron = /^T[A-Za-z1-9]{33}$/.test(cleanV);
        const isEvm = /^0x[a-fA-F0-9]{40}$/.test(cleanV);
        const isTon = /^[a-zA-Z0-9_\-]{48,66}$/.test(cleanV);
        return isTron || isEvm || isTon;
      },
      message: 'Invalid wallet address format (Must be valid USDT TRC20, BEP20/ERC20, or TON address)'
    }
  },
  statsSummary: {
    totalLinksCreated: { type: Number, default: 0, min: [0, 'Stats cannot be negative'] },
    totalViewsReceived: { type: Number, default: 0, min: [0, 'Stats cannot be negative'] },
    totalValidViews: { type: Number, default: 0, min: [0, 'Stats cannot be negative'] },
    totalLifetimeEarned: { type: Number, default: 0, min: [0, 'Stats cannot be negative'], set: formatCurrency },
    totalSpent: { type: Number, default: 0, min: [0, 'Stats cannot be negative'], set: formatCurrency }
  }
}, globalSchemaOptions);

userSchema.virtual('links', {
  ref: 'Link',
  localField: 'telegramId',
  foreignField: 'telegramId',
  justOne: false
});

userSchema.virtual('referrals', {
  ref: 'Referral',
  localField: 'telegramId',
  foreignField: 'referrerTelegramId',
  justOne: false
});

userSchema.index({ telegramId: 1, isBanned: 1 }, { sparse: true });
userSchema.index({ createdAt: -1 });

userSchema.statics.findByTelegramIdIsolated = async function(telegramId, userData = {}) {
  const tgStr = sanitizeTelegramId(telegramId);
  if (!tgStr) return null;
  let user = await this.findOne({ telegramId: tgStr });
  if (!user) {
    try {
      user = await this.create({
        telegramId: tgStr,
        username: userData.username || '',
        firstName: userData.firstName || '',
        lastName: userData.lastName || '',
        language: userData.language || 'ar',
        referredBy: isObjectId(userData.referredBy) ? userData.referredBy : null,
        referredByTelegramId: sanitizeTelegramId(userData.referredByTelegramId),
        ...userData
      });
    } catch (err) {
      user = await this.findOne({ telegramId: tgStr });
    }
  }
  return user;
};

const User = mongoose.models.User || mongoose.model('User', userSchema);

module.exports = User;
module.exports.User = User;
