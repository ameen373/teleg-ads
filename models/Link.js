// models/Link.js
const mongoose = require('mongoose');

const linkSchema = new mongoose.Schema(
  {
    // الكود الفريد المولد للرابط المختصر
    code: {
      type: String,
      required: [true, 'كود الرابط مطلوب'],
      unique: true,
      index: true,
      trim: true
    },

    // المعرف الخاص بالمرسل/المالك للرابط (مرتبط بجداول User)
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'userId مطلوب'],
      index: true
    },

    // الرابط الأصلي المستهدف
    originalUrl: {
      type: String,
      required: [true, 'الرابط الأصلي مطلوب'],
      trim: true
    },

    // عنوان اختياري للرابط لتسهيل التنظيم
    title: {
      type: String,
      trim: true,
      default: ''
    },

    // حالة الرابط (نشط / معطل)
    isActive: {
      type: Boolean,
      default: true,
      index: true
    },

    // إجمالي عدد النقرات/الزيارات للرابط
    totalClicks: {
      type: Number,
      default: 0,
      min: 0
    },

    // عدد المشاهدات/الزيارات المحسوبة والصالحة للربح
    validImpressions: {
      type: Number,
      default: 0,
      min: 0
    },

    // إجمالي الأرباح الناتجة من هذا الرابط (بالدولار USDT)
    earningsGenerated: {
      type: Number,
      default: 0,
      min: 0
    }
  },
  {
    timestamps: true
  }
);

// فهرس مركب لتحسين البحث المزدوج بحسب المستخدم والتاريخ
linkSchema.index({ userId: 1, createdAt: -1 });

const Link = mongoose.model('Link', linkSchema);

module.exports = Link;
