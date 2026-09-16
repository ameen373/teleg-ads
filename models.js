const mongoose = require('mongoose');

// ==========================================
// 1. نموذج المستخدم (User Schema)
// ==========================================
const userSchema = new mongoose.Schema({
  userId: { 
    type: String, 
    required: true, 
    unique: true, 
    index: true 
  },
  username: { 
    type: String, 
    default: '' 
  },
  firstName: { 
    type: String, 
    default: '' 
  },
  lastName: { 
    type: String, 
    default: '' 
  },
  balance: { 
    type: Number, 
    default: 0, 
    min: [0, 'لا يمكن أن يكون الرصيد بالسالب'] 
  },
  totalEarned: { 
    type: Number, 
    default: 0 
  },
  totalSpent: { 
    type: Number, 
    default: 0 
  },
  role: { 
    type: String, 
    enum: ['user', 'admin'], 
    default: 'user' 
  },
  status: { 
    type: String, 
    enum: ['active', 'banned'], 
    default: 'active' 
  }
}, { 
  timestamps: true 
});

// ==========================================
// 2. نموذج الروابط المختصرة (Short Link Schema)
// ==========================================
const linkSchema = new mongoose.Schema({
  userId: { 
    type: String, 
    required: true, 
    index: true 
  },
  originalUrl: { 
    type: String, 
    required: [true, 'الرابط الأصلي مطلوب'] 
  },
  shortCode: { 
    type: String, 
    required: true, 
    unique: true, 
    index: true 
  },
  title: { 
    type: String, 
    default: 'رابط بدون عنوان' 
  },
  views: { 
    type: Number, 
    default: 0 
  },
  earnings: { 
    type: Number, 
    default: 0 
  },
  status: { 
    type: String, 
    enum: ['active', 'disabled'], 
    default: 'active' 
  }
}, { 
  timestamps: true 
});

// فهرس مركب لسرعة استعلام روابط المستخدم
linkSchema.index({ userId: 1, createdAt: -1 });

// ==========================================
// 3. نموذج الحملات الإعلانية (Campaign Schema)
// ==========================================
const campaignSchema = new mongoose.Schema({
  userId: { 
    type: String, 
    required: true, 
    index: true 
  },
  title: { 
    type: String, 
    required: [true, 'عنوان الحملة مطلوب'] 
  },
  targetUrl: { 
    type: String, 
    required: [true, 'رابط الهدف مطلوب'] 
  },
  budget: { 
    type: Number, 
    required: [true, 'ميزانية الحملة مطلوبة'], 
    min: [1, 'الميزانية الأدنى هي 1'] 
  },
  spent: { 
    type: Number, 
    default: 0 
  },
  cpm: { 
    type: Number, 
    default: 1 // التكلفة لكل ألف ظهور
  },
  impressions: { 
    type: Number, 
    default: 0 
  },
  status: { 
    type: String, 
    enum: ['pending', 'active', 'paused', 'completed', 'rejected'], 
    default: 'pending', 
    index: true 
  }
}, { 
  timestamps: true 
});

// فهرس مركب للحملات
campaignSchema.index({ userId: 1, status: 1 });

// ==========================================
// 4. نموذج العمليات المالية والمحفظة (Transaction Schema)
// ==========================================
const transactionSchema = new mongoose.Schema({
  userId: { 
    type: String, 
    required: true, 
    index: true 
  },
  type: { 
    type: String, 
    enum: ['deposit', 'withdrawal', 'reward', 'campaign_spend'], 
    required: true 
  },
  amount: { 
    type: Number, 
    required: [true, 'المبلغ مطلوب'], 
    min: [0.01, 'أدنى مبلغ للعملية هو 0.01'] 
  },
  method: { 
    type: String, 
    default: 'system' // e.g. 'Payeer', 'Kuraimi', 'Crypto', 'AdsGram'
  },
  status: { 
    type: String, 
    enum: ['pending', 'completed', 'failed', 'cancelled'], 
    default: 'pending', 
    index: true 
  },
  details: { 
    type: String, 
    default: '' 
  }
}, { 
  timestamps: true 
});

// فهرس مركب لسجل المعاملات
transactionSchema.index({ userId: 1, createdAt: -1 });

// ==========================================
// تصدير النماذج
// ==========================================
const User = mongoose.models.User || mongoose.model('User', userSchema);
const Link = mongoose.models.Link || mongoose.model('Link', linkSchema);
const Campaign = mongoose.models.Campaign || mongoose.model('Campaign', campaignSchema);
const Transaction = mongoose.models.Transaction || mongoose.model('Transaction', transactionSchema);

module.exports = {
  User,
  Link,
  Campaign,
  Transaction
};
