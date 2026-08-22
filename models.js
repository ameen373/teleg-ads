/**
 * ملف نماذج قاعدة البيانات (Mongoose Models)
 * تحذير: هذا الملف يعمل فقط على جهة الخادم (Node.js) ولا يمكن تشغيله في المتصفح.
 */

if (typeof window !== 'undefined') {
  throw new Error("Mongoose and database models cannot be used directly in the browser. This code must run on the server side.");
}

const mongoose = require('mongoose');

// دالة مساعدة لضبط الكسور العائمة مالياً إلى رقمين بعد الفاصلة
const roundMoney = (val) => Math.round((val + Number.EPSILON) * 100) / 100;

// --------------------------------------------------
// 1. نموذج المستخدم (User Model)
// --------------------------------------------------
const userSchema = new mongoose.Schema({
  telegramId: { 
    type: String, 
    required: true, 
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
    set: roundMoney 
  },
  availableBalance: { 
    type: Number, 
    default: 0, 
    min: [0, 'لا يمكن أن يكون الرصيد المتاح بالسالب'],
    set: roundMoney 
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
    set: roundMoney 
  },
  defaultWallet: { 
    type: String, 
    default: '', 
    trim: true,
    validate: {
      validator: function(v) {
        return v === '' || /^T[A-Za-z1-9]{33}$/.test(v) || /^0x[a-fA-F0-9]{40}$/.test(v);
      },
      message: 'عنوان المحفظة غير صالحة (يجب أن يكون USDT TRC20 أو ERC20)'
    }
  }
}, { 
  timestamps: true,
  versionKey: '__v'
});

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
  }
}, { 
  timestamps: true 
});

linkSchema.index({ userId: 1, isActive: 1 });

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

// --------------------------------------------------
// 4. جلسات المؤقت لمنع التكرار (ClickSession Model)
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
  createdAt: { 
    type: Date, 
    default: Date.now, 
    expires: 600 
  }
});

clickSessionSchema.index({ linkId: 1, ip: 1 }, { unique: true });

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
    set: roundMoney 
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
  note: { 
    type: String, 
    default: '', 
    trim: true 
  }
}, { 
  timestamps: true 
});

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
    set: roundMoney 
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

// --------------------------------------------------
// 7. نموذج الإعلانات/الإشعارات (Announcement Model)
// --------------------------------------------------
const announcementSchema = new mongoose.Schema({
  title: { type: String, required: true },
  content: { type: String, required: true },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

// تصدير النماذج لمنع إعادة تسجيل النموذج (Overwriting Model Error)
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
