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
      trim: true
    },

    // اسم العائلة
    lastName: {
      type: String,
      trim: true
    },

    // اسم المستخدم على تيليجرام (بدون @)
    username: {
      type: String,
      trim: true
    },

    // هل المستخدم مشترك في Telegram Premium
    isPremium: {
      type: Boolean,
      default: false
    },

    // رابط صورة البروفايل
    photoUrl: {
      type: String,
      trim: true
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
      default: 'user'
    },

    // الرصيد المتاح للسحب (بالدولار USDT)
    availableBalance: {
      type: Number,
      default: 0,
      min: 0
    },

    // الرصيد المعلق (تحت التحقق)
    pendingBalance: {
      type: Number,
      default: 0,
      min: 0
    },

    // إجمالي الأرباح المحققة منذ البداية
    totalEarned: {
      type: Number,
      default: 0,
      min: 0
    },

    // عنوان محفظة USDT TRC20 الافتراضي للسحب
    defaultWalletAddress: {
      type: String,
      trim: true
    },

    // telegramId للمستخدم الذي قام بدعوته (المُحيل)
    referredBy: {
      type: Number,
      default: null,
      index: true
    },

    // إجمالي الأرباح المكتسبة من نظام الإحالات
    referralEarnings: {
      type: Number,
      default: 0,
      min: 0
    },

    // حالة حظر المستخدم من النظام
    isBanned: {
      type: Boolean,
      default: false
    }
  },
  {
    // إضافة حقول createdAt و updatedAt تلقائياً
    timestamps: true
  }
);

const User = mongoose.model('User', userSchema);

module.exports = User;

