/**
 * Enterprise Production Models Package
 * Telegram Link Shortener & Mini App Engine
 */

if (typeof window !== 'undefined') {
  throw new Error("Mongoose and database models cannot be used directly in the browser. This code must run on the server side.");
}

const mongoose = require('mongoose');

// دالة مساعدة معيارية لمعالجة وتحديد دقة الكسور المالية (حتى 4 أرقام بعد الفاصلة للأرباح)
const formatCurrency = (val) => {
  if (typeof val !== 'number' || isNaN(val)) return 0;
  return Math.round((val + Number.EPSILON) * 10000) / 10000;
};

// --------------------------------------------------
// 1. نموذج المستخدم (User Model)
// --------------------------------------------------
const userSchema = new mongoose.Schema({
  telegramId: { 
    type: String, 
    required: [true, 'معرف تليجرام مطلوب'], 
    unique: true, 
    index: true,
    trim: true 
  },
  username: { 
    type: String, 
    default: '', 
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
    min: [0, 'لا يمكن أن يكون الرصيد المعلق بالسالب'],
    set: formatCurrency 
  },
  availableBalance: { 
    type: Number, 
    default: 0, 
    min: [0, 'لا يمكن أن يكون الرصيد المتاح بالسالب'],
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
  referralEarnings: { 
    type: Number, 
    default: 0, 
    min: 0,
    set: formatCurrency 
  },
  defaultWallet: { 
    type: String, 
    default: '', 
    trim: true,
    validate: {
      validator: function(v) {
        if (!v || v === '') return true;
        // يدعم عائلة TRC20, ERC20/BEP20 وعناوين شبكة TON (سواء Raw أو User-friendly)
        const isTron = /^T[A-Za-z1-9]{33}$/.test(v);
        const isEvm = /^0x[a-fA-F0-9]{40}$/.test(v);
        const isTon = /^[a-zA-Z0-9_-]{48}$/.test(v) || /^0:[a-fA-F0-9]{64}$/.test(v);
        return isTron || isEvm || isTon;
      },
      message: 'عنوان المحفظة غير صالح (يجب أن يكون USDT TRC20, ERC20, أو TON Wallet)'
    }
  }
}, { 
  timestamps: true,
  versionKey: '__v'
});

userSchema.index({ telegramId: 1, isBanned: 1 });

// --------------------------------------------------
// 2. نموذج الرابط (Link Model)
// --------------------------------------------------
const linkSchema = new mongoose.Schema({
  shortCode: { 
    type: String, 
    required: true, 
    unique: true, 
    index: true,
    trim: true 
  },
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true, 
    index: true 
  },
  title: { 
    type: String, 
    default: 'بدون عنوان', 
    trim: true,
    maxlength: 150 
  },
  targetUrl: { 
    type: String, 
    required: true, 
    trim: true 
  },
  isActive: { 
    type: Boolean, 
    default: true, 
    index: true 
  },
  views: { 
    type: Number, 
    default: 0, 
    min: 0 
  },
  validImpressions: { 
    type: Number, 
    default: 0, 
    min: 0 
  },
  invalidImpressions: { 
    type: Number, 
    default: 0, 
    min: 0 
  }
}, { 
  timestamps: true 
});

linkSchema.index({ userId: 1, isActive: 1, createdAt: -1 });
linkSchema.index({ validImpressions: -1 });

// --------------------------------------------------
// 3. سجلات الترافيك (Impression Model)
// --------------------------------------------------
const impressionSchema = new mongoose.Schema({
  linkId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Link', 
    required: true, 
    index: true 
  },
  ip: { 
    type: String, 
    required: true, 
    trim: true 
  },
  userAgent: { 
    type: String, 
    default: '', 
    trim: true 
  },
  isUnique: { 
    type: Boolean, 
    default: true 
  },
  createdAt: { 
    type: Date, 
    default: Date.now, 
    expires: '60d' 
  }
});

impressionSchema.index({ linkId: 1, createdAt: -1 });
impressionSchema.index({ ip: 1, createdAt: -1 });

// --------------------------------------------------
// 4. جلسات المؤقت لمنع التكرار والتجاوز (ClickSession Model)
// --------------------------------------------------
const clickSessionSchema = new mongoose.Schema({
  linkId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Link', 
    required: true 
  },
  ip: { 
    type: String, 
    required: true, 
    trim: true 
  },
  bridgeToken: { 
    type: String, 
    required: true,
    trim: true 
  },
  createdAt: { 
    type: Date, 
    default: Date.now, 
    expires: 300 
  }
});

clickSessionSchema.index({ linkId: 1, ip: 1 });
clickSessionSchema.index({ bridgeToken: 1 });

// --------------------------------------------------
// 5. طلبات السحب (Withdraw Model)
// --------------------------------------------------
const withdrawSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true, 
    index: true 
  },
  amount: { 
    type: Number, 
    required: true, 
    min: [10, 'الحد الأدنى للسحب هو 10'],
    set: formatCurrency 
  },
  walletAddress: { 
    type: String, 
    required: true, 
    trim: true 
  },
  status: { 
    type: String, 
    enum: ['Pending', 'Completed', 'Rejected'], 
    default: 'Pending', 
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
}, { 
  timestamps: true 
});

withdrawSchema.index({ userId: 1, status: 1, createdAt: -1 });
withdrawSchema.index({ status: 1, createdAt: -1 });

// --------------------------------------------------
// 6. محرك الحجز المؤقت للأرباح (EarningsHold Model)
// --------------------------------------------------
const earningsHoldSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true, 
    index: true 
  },
  amount: { 
    type: Number, 
    required: true, 
    min: 0,
    set: formatCurrency 
  },
  releaseAt: { 
    type: Date, 
    required: true, 
    index: true 
  },
  isReleased: { 
    type: Boolean, 
    default: false, 
    index: true 
  }
}, { 
  timestamps: true 
});

earningsHoldSchema.index({ isReleased: 1, releaseAt: 1 });
earningsHoldSchema.index({ userId: 1, isReleased: 1 });

// --------------------------------------------------
// 7. نموذج الإعلانات/الإشعارات (Announcement Model)
// --------------------------------------------------
const announcementSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  content: { type: String, required: true, trim: true },
  isActive: { type: Boolean, default: true, index: true }
}, { timestamps: true });

announcementSchema.index({ isActive: 1, createdAt: -1 });

// Export Compiled Models safely to prevent Mongoose Overwrite Error
const User = mongoose.models.User || mongoose.model('User', userSchema);
const Link = mongoose.models.Link || mongoose.model('Link', linkSchema);
const Impression = mongoose.models.Impression || mongoose.model('Impression', impressionSchema);
const ClickSession = mongoose.models.ClickSession || mongoose.model('ClickSession', clickSessionSchema);
const Withdraw = mongoose.models.Withdraw || mongoose.model('Withdraw', withdrawSchema);
const EarningsHold = mongoose.models.EarningsHold || mongoose.model('EarningsHold', earningsHoldSchema);
const Announcement = mongoose.models.Announcement || mongoose.model('Announcement', announcementSchema);

module.exports = {
  User,
  Link,
  Impression,
  ClickSession,
  Withdraw,
  EarningsHold,
  Announcement
};
