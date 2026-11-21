const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    telegramId: { type: String, required: true, unique: true, index: true },
    username: { type: String, default: '' },
    firstName: { type: String, default: '' },
    lastName: { type: String, default: '' },
    languageCode: { type: String, enum: ['ar', 'en'], default: 'en' },
    balance: { type: Number, default: 0, min: 0 },
    adBalance: { type: Number, default: 0, min: 0 },
    referralEarnings: { type: Number, default: 0, min: 0 },
    referredBy: { type: String, default: null },
    referralsCount: { type: Number, default: 0, min: 0 },
    isAdmin: { type: Boolean, default: false },
    isBanned: { type: Boolean, default: false },
    lastActive: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

const channelSchema = new mongoose.Schema(
  {
    ownerId: { type: String, required: true, index: true },
    channelUsername: { type: String, required: true, unique: true, lowercase: true, trim: true },
    title: { type: String, required: true, trim: true },
    subscribers: { type: Number, default: 0, min: 0 },
    category: { type: String, default: 'general', trim: true },
    pricePerPost: { type: Number, required: true, min: 0.1 },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
    totalEarnings: { type: Number, default: 0, min: 0 }
  },
  { timestamps: true }
);

const campaignSchema = new mongoose.Schema(
  {
    advertiserId: { type: String, required: true, index: true },
    channelId: { type: mongoose.Schema.Types.ObjectId, ref: 'Channel', required: true, index: true },
    title: { type: String, required: true, trim: true },
    adText: { type: String, required: true, trim: true },
    targetUrl: { type: String, required: true, trim: true },
    budget: { type: Number, required: true, min: 0.1 },
    status: {
      type: String,
      enum: ['pending', 'active', 'completed', 'cancelled'],
      default: 'pending',
      index: true
    }
  },
  { timestamps: true }
);

const transactionSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    type: {
      type: String,
      enum: ['deposit', 'withdrawal', 'campaign_spend', 'channel_earn', 'referral_bonus'],
      required: true
    },
    amount: { type: Number, required: true },
    status: { type: String, enum: ['pending', 'completed', 'rejected'], default: 'completed', index: true },
    details: { type: String, default: '' }
  },
  { timestamps: true }
);

const securityLogSchema = new mongoose.Schema(
  {
    actorId: { type: String, required: true, index: true },
    action: { type: String, required: true },
    targetId: { type: String, default: '' },
    details: { type: String, default: '' },
    ip: { type: String, default: '' }
  },
  { timestamps: true }
);

const User = mongoose.models.User || mongoose.model('User', userSchema);
const Channel = mongoose.models.Channel || mongoose.model('Channel', channelSchema);
const Campaign = mongoose.models.Campaign || mongoose.model('Campaign', campaignSchema);
const Transaction = mongoose.models.Transaction || mongoose.model('Transaction', transactionSchema);
const SecurityLog = mongoose.models.SecurityLog || mongoose.model('SecurityLog', securityLogSchema);

module.exports = {
  User,
  Channel,
  Campaign,
  Transaction,
  SecurityLog
};
