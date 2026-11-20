const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  telegramId: { type: String, required: true, unique: true, index: true },
  username: { type: String, default: '' },
  firstName: { type: String, default: '' },
  lastName: { type: String, default: '' },
  languageCode: { type: String, default: 'en' },
  balance: { type: Number, default: 0, min: 0 },
  adBalance: { type: Number, default: 0, min: 0 },
  referralEarnings: { type: Number, default: 0, min: 0 },
  referredBy: { type: String, default: null },
  referralsCount: { type: Number, default: 0 },
  isAdmin: { type: Boolean, default: false },
  isBanned: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  lastActive: { type: Date, default: Date.now }
});

const channelSchema = new mongoose.Schema({
  ownerId: { type: String, required: true, index: true },
  channelUsername: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  subscribers: { type: Number, default: 0 },
  category: { type: String, default: 'general' },
  pricePerPost: { type: Number, required: true, min: 0.1 },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  totalEarnings: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

const campaignSchema = new mongoose.Schema({
  advertiserId: { type: String, required: true, index: true },
  channelId: { type: mongoose.Schema.Types.ObjectId, ref: 'Channel', required: true },
  title: { type: String, required: true },
  adText: { type: String, required: true },
  targetUrl: { type: String, required: true },
  budget: { type: Number, required: true, min: 0.1 },
  status: { type: String, enum: ['pending', 'active', 'completed', 'cancelled'], default: 'pending' },
  createdAt: { type: Date, default: Date.now }
});

const transactionSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  type: { type: String, enum: ['deposit', 'withdrawal', 'campaign_spend', 'channel_earn', 'referral_bonus'], required: true },
  amount: { type: Number, required: true },
  status: { type: String, enum: ['pending', 'completed', 'rejected'], default: 'completed' },
  details: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});

const securityLogSchema = new mongoose.Schema({
  actorId: { type: String, required: true },
  action: { type: String, required: true },
  targetId: { type: String, default: '' },
  details: { type: String, default: '' },
  ip: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Channel = mongoose.model('Channel', channelSchema);
const Campaign = mongoose.model('Campaign', campaignSchema);
const Transaction = mongoose.model('Transaction', transactionSchema);
const SecurityLog = mongoose.model('SecurityLog', securityLogSchema);

module.exports = {
  User,
  Channel,
  Campaign,
  Transaction,
  SecurityLog
};
