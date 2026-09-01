const mongoose = require('mongoose');

// نموذج المستخدم (User Schema)
const userSchema = new mongoose.Schema({
    telegramId: { 
        type: Number, 
        required: true, 
        unique: true,
        index: true 
    },
    firstName: { type: String, default: '' },
    lastName: { type: String, default: '' },
    username: { type: String, default: '' },
    isPremium: { type: Boolean, default: false },
    photoUrl: { type: String, default: '' },
    languageCode: { type: String, default: 'ar' },
    referredBy: { type: Number, default: null, index: true },
    availableBalance: { type: Number, default: 0, min: 0 },
    pendingBalance: { type: Number, default: 0, min: 0 },
    adBalance: { type: Number, default: 0, min: 0 },
    defaultWallet: { type: String, default: '' },
    isBanned: { type: Boolean, default: false, index: true },
    createdAt: { type: Date, default: Date.now }
});

// نموذج الروابط المختصرة (Link Schema)
const linkSchema = new mongoose.Schema({
    code: { 
        type: String, 
        required: true, 
        unique: true,
        index: true 
    },
    originalUrl: { type: String, required: true },
    title: { type: String, default: '' },
    userId: { type: Number, required: true, index: true },
    views: { type: Number, default: 0, min: 0 },
    earnings: { type: Number, default: 0, min: 0 },
    isActive: { type: Boolean, default: true, index: true },
    createdAt: { type: Date, default: Date.now }
});

// نموذج الحملات الإعلانية (Campaign Schema)
const campaignSchema = new mongoose.Schema({
    userId: { type: Number, required: true, index: true },
    title: { type: String, required: true },
    targetUrl: { type: String, required: true },
    budget: { type: Number, required: true, min: 0 },
    cpm: { type: Number, default: 1.50, min: 0 },
    totalViewsNeeded: { type: Number, required: true, min: 1 },
    viewsDelivered: { type: Number, default: 0, min: 0 },
    status: { 
        type: String, 
        enum: ['active', 'paused', 'completed'], 
        default: 'active',
        index: true 
    },
    createdAt: { type: Date, default: Date.now }
});

// نموذج الإيداع (Deposit Schema)
const depositSchema = new mongoose.Schema({
    userId: { type: Number, required: true, index: true },
    network: { type: String, enum: ['TRC20', 'BEP20'], required: true },
    amount: { type: Number, required: true, min: 0.01 },
    txId: { type: String, required: true, unique: true, trim: true, index: true },
    status: { 
        type: String, 
        enum: ['pending', 'approved', 'rejected'], 
        default: 'pending',
        index: true 
    },
    createdAt: { type: Date, default: Date.now }
});

// نموذج السحب (Withdraw Schema)
const withdrawSchema = new mongoose.Schema({
    userId: { type: Number, required: true, index: true },
    amount: { type: Number, required: true, min: 0.01 },
    fee: { type: Number, required: true, min: 0 },
    netAmount: { type: Number, required: true, min: 0 },
    walletAddress: { type: String, required: true, trim: true },
    status: { 
        type: String, 
        enum: ['pending', 'approved', 'rejected'], 
        default: 'pending',
        index: true 
    },
    rejectionReason: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now }
});

module.exports = {
    User: mongoose.models.User || mongoose.model('User', userSchema),
    Link: mongoose.models.Link || mongoose.model('Link', linkSchema),
    Campaign: mongoose.models.Campaign || mongoose.model('Campaign', campaignSchema),
    Deposit: mongoose.models.Deposit || mongoose.model('Deposit', depositSchema),
    Withdraw: mongoose.models.Withdraw || mongoose.model('Withdraw', withdrawSchema)
};
