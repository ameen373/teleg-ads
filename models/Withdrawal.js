// models/Withdrawal.js
const mongoose = require('mongoose');

const withdrawalSchema = new mongoose.Schema(
  {
    // معرف المستخدم صاحب طلب السحب
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'userId مطلوب'],
      index: true
    },

    // المبلغ الإجمالي المطلوب سحبه (بالدولار USDT)
    amount: {
      type: Number,
      required: [true, 'المبلغ المطلوب سحبه مطلوب'],
      min: [0, 'لا يمكن أن يكون المبلغ أقل من 0']
    },

    // قيمة العمولة المخصومة (3%)
    feeDeducted: {
      type: Number,
      required: [true, 'قيمة العمولة المخصومة مطلوبة'],
      min: [0, 'لا يمكن أن تكون قيمة العمولة بالسالب']
    },

    // المبلغ الصافي المرسل للمستخدم بعد خصم العمولة
    netAmount: {
      type: Number,
      required: [true, 'المبلغ الصافي مطلوب'],
      min: [0, 'لا يمكن أن يكون المبلغ الصافي بالسالب']
    },

    // عنوان محفظة USDT TRC20 الخاصة بالمستلم
    walletAddress: {
      type: String,
      required: [true, 'عنوان المحفظة مطلوب'],
      trim: true
    },

    // حالة طلب السحب
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true
    },

    // سبب الرفض وإعادة الرصيد للمستخدم في حال رفض الطلب
    rejectionReason: {
      type: String,
      trim: true,
      default: ''
    }
  },
  {
    // إضافة حقول createdAt و updatedAt تلقائياً
    timestamps: true
  }
);

const Withdrawal = mongoose.model('Withdrawal', withdrawalSchema);

module.exports = Withdrawal;

