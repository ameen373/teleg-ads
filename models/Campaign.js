// models/Campaign.js
const mongoose = require('mongoose');

const campaignSchema = new mongoose.Schema(
  {
    // معرف المستخدم مالك الحملة
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'userId مطلوب'],
      index: true
    },

    // عنوان الحملة الإعلانية
    title: {
      type: String,
      required: [true, 'عنوان الحملة مطلوب'],
      trim: true
    },

    // الرابط المستهدف للحملة
    targetUrl: {
      type: String,
      required: [true, 'رابط الهدف مطلوب'],
      trim: true
    },

    // رابط صورة البانر للإعلان (اختياري)
    bannerUrl: {
      type: String,
      trim: true,
      default: ''
    },

    // سعر الـ 1000 ظهور (CPM)
    cpm: {
      type: Number,
      default: 1.50,
      min: [0.1, 'لا يمكن أن يكون سعر CPM أقل من $0.10']
    },

    // الميزانية الإجمالية للحملة
    totalBudget: {
      type: Number,
      required: [true, 'الميزانية الإجمالية مطلوبة'],
      min: [5, 'الحد الأدنى لميزانية الحملة هو $5']
    },

    // الميزانية المتبقية
    remainingBudget: {
      type: Number,
      required: [true, 'الميزانية المتبقية مطلوبة'],
      min: [0, 'لا يمكن أن تكون الميزانية المتبقية بالسالب']
    },

    // عدد المشاهدات المقدمة للآن
    impressionsDelivered: {
      type: Number,
      default: 0,
      min: 0
    },

    // حالة الحملة الإعلانية
    status: {
      type: String,
      enum: ['active', 'paused', 'completed'],
      default: 'active',
      index: true
    }
  },
  {
    timestamps: true
  }
);

// فهرس مركب للاستعلام السريع عن الحملات النشطة حسب الميزانية المتبقية
campaignSchema.index({ status: 1, remainingBudget: -1 });

module.exports = mongoose.model('Campaign', campaignSchema);
