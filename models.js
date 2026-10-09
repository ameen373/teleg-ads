const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  telegramId: { type: String, required: true, unique: true, index: true },
  username: { type: String, default: '' },
  firstName: { type: String, default: '' },
  lastName: { type: String, default: '' },
  languageCode: { type: String, default: 'en' },
  role: { type: String, enum: ['publisher', 'advertiser', 'admin'], default: 'publisher', index: true },
  balance: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

userSchema.index({ telegramId: 1, role: 1 });

const linkSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  originalUrl: { type: String, required: true },
  shortCode: { type: String, required: true, unique: true, index: true },
  viewsCount: { type: Number, default: 0 },
  earnings: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

linkSchema.index({ userId: 1, createdAt: -1 });

const adSchema = new mongoose.Schema({
  advertiserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true },
  content: { type: String, required: true },
  targetUrl: { type: String, required: true },
  budget: { type: Number, required: true },
  cpm: { type: Number, required: true },
  viewsDelivered: { type: Number, default: 0 },
  status: { type: String, enum: ['pending', 'active', 'paused', 'completed'], default: 'active', index: true }
}, { timestamps: true });

adSchema.index({ status: 1, cpm: -1 });

const transactionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: { type: String, enum: ['deposit', 'withdrawal', 'earning', 'ad_spend'], required: true, index: true },
  amount: { type: Number, required: true },
  status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'completed' },
  details: { type: String, default: '' }
}, { timestamps: true });

transactionSchema.index({ userId: 1, createdAt: -1 });

const User = mongoose.model('User', userSchema);
const Link = mongoose.model('Link', linkSchema);
const Ad = mongoose.model('Ad', adSchema);
const Transaction = mongoose.model('Transaction', transactionSchema);

module.exports = {
  User,
  Link,
  Ad,
  Transaction
};
