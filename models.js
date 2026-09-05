const mongoose = require('mongoose');

// 1. نموذج المستخدم (معزول تماماً)
const userSchema = new mongoose.Schema({
  telegramId: { type: String, required: true, unique: true, index: true },
  username: { type: String, default: 'Unknown' },
  firstName: { type: String, default: '' },
  isPremium: { type: Boolean, default: false },
  availableBalance: { type: Number, default: 0 },
  pendingBalance: { type: Number, default: 0 },
  referralEarnings: { type: Number, default: 0 },
  defaultWallet: { type: String, default: '' },
  referredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  isBanned: { type: Boolean, default: false }
}, { timestamps: true });

// 2. نموذج الروابط (مربوط بالمستخدم)
const linkSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, default: 'Untitled Link' },
  originalUrl: { type: String, required: true },
  shortCode: { type: String, required: true, unique: true },
  views: { type: Number, default: 0 },
  validImpressions: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

// 3. نموذج الإعلانات (مربوط بالمعلن/المستخدم)
const adSchema = new mongoose.Schema({
  advertiserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true },
  targetUrl: { type: String, required: true },
  totalBudget: { type: Number, required: true },
  remainingBudget: { type: Number, required: true },
  impressionsCount: { type: Number, default: 0 },
  status: { type: String, enum: ['active', 'paused', 'completed'], default: 'active' }
}, { timestamps: true });

// 4. نموذج المعاملات (السحب والشحن)
const transactionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: { type: String, enum: ['deposit', 'withdraw', 'earning', 'referral'], required: true },
  amount: { type: Number, required: true },
  status: { type: String, enum: ['pending', 'completed', 'rejected'], default: 'pending' },
  paymentMethod: { type: String },
  txHash: { type: String },
  walletAddress: { type: String },
  rejectReason: { type: String }
}, { timestamps: true });

module.exports = {
  User: mongoose.model('User', userSchema),
  Link: mongoose.model('Link', linkSchema),
  Ad: mongoose.model('Ad', adSchema),
  Transaction: mongoose.model('Transaction', transactionSchema)
};
