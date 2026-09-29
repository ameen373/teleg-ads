const mongoose = require('mongoose');
const { 
  formatCurrency, 
  sanitizeTelegramId, 
  isObjectId, 
  globalSchemaOptions 
} = require('./helpers');

// دالة تنظيف وتأكيد عدم إرجاع null لمنع تعارض الفهرس الجزئي (Sparse Index)
const cleanTelegramId = (val) => {
  if (val === null || val === undefined) return undefined;
  const sanitized = sanitizeTelegramId ? sanitizeTelegramId(val) : val;
  if (!sanitized || sanitized === 'null' || sanitized === 'undefined') {
    return undefined; // إرجاع undefined يمنع Mongo من إضافة القيمة للفهرس
  }
  const str = String(sanitized).trim();
  return str.length > 0 ? str : undefined;
};

const userSchema = new mongoose.Schema({
  telegramId: { 
    type: String, 
    unique: true, 
    sparse: true,
    trim: true,
    set: cleanTelegramId
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
    default: undefined,
    index: true,
    trim: true,
    set: cleanTelegramId
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
  const tgStr = cleanTelegramId(telegramId);
  if (!tgStr) return null;
  
  let user = await this.findOne({
    $or: [
      { telegramId: tgStr },
      { telegram_id: tgStr }
    ]
  });

  if (!user) {
    try {
      user = await this.findOneAndUpdate(
        { $or: [{ telegramId: tgStr }, { telegram_id: tgStr }] },
        { 
          $set: {
            telegramId: tgStr,
            username: userData.username || '',
            firstName: userData.firstName || '',
            lastName: userData.lastName || '',
            language: userData.language || 'ar',
            referredBy: isObjectId(userData.referredBy) ? userData.referredBy : null,
            referredByTelegramId: cleanTelegramId(userData.referredByTelegramId),
            ...userData
          } 
        },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );
    } catch (err) {
      user = await this.findOne({
        $or: [
          { telegramId: tgStr },
          { telegram_id: tgStr }
        ]
      });
    }
  }
  return user;
};

const User = mongoose.models.User || mongoose.model('User', userSchema);

// تنظيف الفهارس القديمة المتعارضة مثل telegram_id_1 تلقائياً
if (mongoose.connection) {
  const cleanupIndexes = async () => {
    try {
      if (User.collection && User.collection.dropIndex) {
        await User.collection.dropIndex('telegram_id_1').catch(() => {});
      }
    } catch (e) {
      // Ignored
    }
  };
  if (mongoose.connection.readyState === 1) {
    cleanupIndexes();
  } else {
    mongoose.connection.once('connected', cleanupIndexes);
  }
}

module.exports = User;
module.exports.User = User;
