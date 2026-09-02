// models/Deposit.js
const mongoose = require('mongoose');

const depositSchema = new mongoose.Schema(
  {
    // معرف المستخدم صاحب طلب الإيداع
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'userId مطلوب'],
      index: true
    },

    // شبكة التحويل المستخدمة للإيداع
    network: {
      type: String,
      required: [true, 'شبكة التحويل مطلوبة'],
      enum: {
        values: ['TRC20', 'BEP20'],
        message: 'الشبكة المسموح بها هي TRC20 أو BEP20 فقط'
      }
    },

    // المبلغ المودع (بالدولار USDT)
    amount: {
      type: Number,
      required: [true, 'مبلغ الإيداع مطلوب'],
      min: [0, 'لا يمكن أن يكون المبلغ أقل من 0']
    },

    // رمز التمرير / المعاملة (TxHash / TxID) الفريد لعملية التحويل على البلوكشين
    txHash: {
      type: String,
      required: [true, 'رمز المعاملة txHash مطلوب'],
      unique: true,
      trim: true,
      index: true
    },

    // حالة طلب الإيداع
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true
    },

    // سبب الرفض في حال تم رفض الطلب من قبل الآدمين
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

const Deposit = mongoose.model('Deposit', depositSchema);

module.exports = Deposit;

