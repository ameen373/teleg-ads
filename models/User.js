// models/User.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    // المعرف الخاص بحساب المستخدم في تيليجرام
    telegramId: {
      type: Number,
      required: [true, 'telegramId مطلوب'],
      unique: true,
      index: true
    },

    // الاسم الأول للمستخدم
    firstName: {
      type: String,
      trim: true,
      default: ''
    },

    // اسم العائلة
    lastName: {
      type: String,
      trim: true,
      default: ''
    },

    // اسم المستخدم على تيليجرام (بدون @)
    username: {
      type: String,
      trim: true,
      default: ''
    },

    // هل المستخدم مشترك في Telegram Premium
    isPremium: {
      type: Boolean,
      default: false
    },

    // رابط صورة البروفايل
    photoUrl: {
      type: String,
      trim: true,
      default: ''
    },

    // رمز لغة المستخدم
    languageCode: {
      type: String,
      default: 'ar',
      trim: true
    },

    // دور المستخدم في النظام
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
      index: true
    },

    // كائن الأرصدة الموحد لضمان التوافق التام مع جميع المتحكمات
    balances: {
      available: {
        type: Number,
        default: 0,
        min: [0, 'لا يمكن أن يكون الرصيد المتاح بالسالب']
      },
      pending: {
        type: Number,
        default: 0,
        min: [0, 'لا يمكن أن يكون الرصيد المعلق بالسالب']
      },
      totalEarned: {
        type: Number,
        default: 0,
        min: [0, 'لا يمكن أن يكون إجمالي الأرباح بالسالب']
      },
      referralEarned: {
        type: Number,
        default: 0,
        min: [0, 'لا يمكن أن تكون أرباح الإحالة بالسالب']
      }
    },

    // حقول الأرصدة التقليدية لضمان التوافقية مع الأكواد السابقة
    availableBalance: {
      type: Number,
      default: 0,
      min: 0
    },

    pendingBalance: {
      type: Number,
      default: 0,
      min: 0
    },

    totalEarned: {
      type: Number,
      default: 0,
      min: 0
    },

    referralEarnings: {
      type: Number,
      default: 0,
      min: 0
    },

    // عنوان محفظة USDT TRC20 الافتراضي للسحب
    defaultWalletAddress: {
      type: String,
      trim: true,
      default: ''
    },

    // telegramId للمستخدم الذي قام بدعوته (المُحيل)
    referredBy: {
      type: Number,
      default: null,
      index: true
    },

    // حالة حظر المستخدم من النظام
    isBanned: {
      type: Boolean,
      default: false,
      index: true
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// مزامنة الأرصدة تلقائياً قبل الحفظ لتفادي التعارض بين بنية الأرصدة القديمة والجديدة
userSchema.pre('save', function (next) {
  if (this.isModified('balances')) {
    if (this.balances) {
      this.availableBalance = this.balances.available;
      this.pendingBalance = this.balances.pending;
      this.totalEarned = this.balances.totalEarned;
      this.referralEarnings = this.balances.referralEarned;
    }
  } else if (
    this.isModified('availableBalance') ||
    this.isModified('pendingBalance') ||
    this.isModified('totalEarned') ||
    this.isModified('referralEarnings')
  ) {
    if (!this.balances) {
      this.balances = {};
    }
    this.balances.available = this.availableBalance;
    this.balances.pending = this.pendingBalance;
    this.balances.totalEarned = this.totalEarned;
    this.balances.referralEarned = this.referralEarnings;
  }
  next();
});

const User = mongoose.model('User', userSchema);

module.exports = User;
