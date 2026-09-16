const mongoose = require('mongoose');
const { Schema } = mongoose;

// -----------------------------------------
// 1. نموذج المستخدم (User)
// -----------------------------------------
const userSchema = new Schema({
    telegramId: { 
        type: Number, 
        required: true, 
        unique: true, 
        index: true // فهرس لتسريع البحث عبر معرف تليجرام
    },
    username: { 
        type: String, 
        trim: true 
    },
    role: { 
        type: String, 
        enum: ['publisher', 'advertiser', 'both'], 
        default: 'both' 
    },
    isActive: { 
        type: Boolean, 
        default: true 
    }
}, { timestamps: true });


// -----------------------------------------
// 2. نموذج المحفظة (Wallet)
// -----------------------------------------
const walletSchema = new Schema({
    userId: { 
        type: Schema.Types.ObjectId, 
        ref: 'User', 
        required: true, 
        unique: true, 
        index: true 
    },
    // يُفضل تخزين الرصيد كأعداد صحيحة (مثلاً: 1 دولار = 100 سنت) لتجنب أخطاء الفاصلة العائمة
    balance: { 
        type: Number, 
        required: true, 
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
    }
}, { timestamps: true });


// -----------------------------------------
// 3. نموذج الحركات المالية (Transaction)
// -----------------------------------------
const transactionSchema = new Schema({
    userId: { 
        type: Schema.Types.ObjectId, 
        ref: 'User', 
        required: true,
        index: true
    },
    type: { 
        type: String, 
        enum: ['deposit', 'withdrawal', 'earning', 'spend'], 
        required: true,
        index: true
    },
    amount: { 
        type: Number, 
        required: true,
        validate: {
            validator: Number.isInteger,
            message: 'يجب أن تكون القيمة عدداً صحيحاً (بالسنتات/النقاط)'
        }
    },
    status: { 
        type: String, 
        enum: ['pending', 'completed', 'failed'], 
        default: 'pending',
        index: true
    },
    description: { 
        type: String, 
        trim: true 
    },
    // مرجع اختياري لربط الحركة بحملة إعلانية أو رابط معين
    referenceId: { 
        type: Schema.Types.ObjectId 
    }
}, { timestamps: true });


// -----------------------------------------
// 4. نموذج الروابط المختصرة (Link)
// -----------------------------------------
const linkSchema = new Schema({
    userId: { 
        type: Schema.Types.ObjectId, 
        ref: 'User', 
        required: true,
        index: true
    },
    originalUrl: { 
        type: String, 
        required: true,
        trim: true,
        match: [/^https?:\/\/.+/, 'الرابط غير صالح']
    },
    shortUrl: { 
        type: String, 
        required: true, 
        unique: true,
        index: true // فهرس أساسي لتسريع عملية إعادة التوجيه (Routing)
    },
    clicksCount: { 
        type: Number, 
        default: 0 
    },
    status: { 
        type: String, 
        enum: ['active', 'disabled'], 
        default: 'active'
    }
}, { timestamps: true });


// -----------------------------------------
// 5. نموذج الحملات الإعلانية (Campaign)
// -----------------------------------------
const campaignSchema = new Schema({
    userId: { 
        type: Schema.Types.ObjectId, 
        ref: 'User', 
        required: true,
        index: true
    },
    title: { 
        type: String, 
        required: true, 
        trim: true 
    },
    budget: { 
        type: Number, 
        required: true,
        min: [1, 'يجب أن تكون الميزانية أكبر من صفر']
    },
    costPerClick: { 
        type: Number, 
        required: true,
        min: [1, 'يجب تحديد تكلفة النقرة']
    },
    remainingBudget: { 
        type: Number, 
        required: true 
    },
    status: { 
        type: String, 
        enum: ['active', 'paused', 'completed'], 
        default: 'active',
        index: true
    },
    targetUrl: { 
        type: String, 
        required: true 
    },
    totalClicks: { 
        type: Number, 
        default: 0 
    }
}, { timestamps: true });

// تحديث الميزانية المتبقية تلقائياً عند إنشاء الحملة أول مرة
campaignSchema.pre('validate', function(next) {
    if (this.isNew && this.remainingBudget === undefined) {
        this.remainingBudget = this.budget;
    }
    next();
});

// تصدير النماذج
module.exports = {
    User: mongoose.model('User', userSchema),
    Wallet: mongoose.model('Wallet', walletSchema),
    Transaction: mongoose.model('Transaction', transactionSchema),
    Link: mongoose.model('Link', linkSchema),
    Campaign: mongoose.model('Campaign', campaignSchema)
};
