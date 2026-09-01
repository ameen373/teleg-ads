const mongoose = require('mongoose');

// نموذج المستخدم
const userSchema = new mongoose.Schema({
    telegramId: { type: Number, required: true, unique: true },
    firstName: String,
    lastName: String,
    username: String,
    isPremium: { type: Boolean, default: false },
    photoUrl: String,
    referredBy: { type: Number, default: null },
    availableBalance: { type: Number, default: 0 },
    pendingBalance: { type: Number, default: 0 },
    adBalance: { type: Number, default: 0 },
    defaultWallet: { type: String, default: '' },
    isBanned: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

// نموذج الروابط المختصرة
const linkSchema = new mongoose.Schema({
    code: { type: String, required: true, unique: true },
    originalUrl: { type: String, required: true },
    title: { type: String, default: '' },
    userId: { type: Number, required: true },
    views: { type: Number, default: 0 },
    earnings: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
});

// نموذج الحملات الإعلانية
const campaignSchema = new mongoose.Schema({
    userId: { type: Number, required: true },
    title: { type: String, required: true },
    targetUrl: { type: String, required: true },
    budget: { type: Number, required: true },
    cpm: { type: Number, default: 1.50 },
    totalViewsNeeded: { type: Number, required: true },
    viewsDelivered: { type: Number, default: 0 },
    status: { type: String, enum: ['active', 'paused', 'completed'], default: 'active' },
    createdAt: { type: Date, default: Date.now }
});

// نموذج الإيداع
const depositSchema = new mongoose.Schema({
    userId: { type: Number, required: true },
    network: { type: String, enum: ['TRC20', 'BEP20'], required: true },
    amount: { type: Number, required: true },
    txId: { type: String, required: true, unique: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    createdAt: { type: Date, default: Date.now }
});

// نموذج السحب
const withdrawSchema = new mongoose.Schema({
    userId: { type: Number, required: true },
    amount: { type: Number, required: true },
    fee: { type: Number, required: true },
    netAmount: { type: Number, required: true },
    walletAddress: { type: String, required: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    rejectionReason: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now }
});

module.exports = {
    User: mongoose.model('User', userSchema),
    Link: mongoose.model('Link', linkSchema),
    Campaign: mongoose.model('Campaign', campaignSchema),
    Deposit: mongoose.model('Deposit', depositSchema),
    Withdraw: mongoose.model('Withdraw', withdrawSchema)
};
