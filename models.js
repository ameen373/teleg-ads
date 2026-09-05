/**
 * ============================================================================
 * Ultra-Enterprise High-Performance Models Architecture
 * File: models.js
 * Designed for High-Scale Telegram Mini Apps & Shortener Engines
 * ============================================================================
 */

import mongoose from 'mongoose';

if (typeof window !== 'undefined') {
  throw new Error("Critical Security Alert: Mongoose models must run exclusively on the server side.");
}

const { Schema, model } = mongoose;

// ============================================================================
// 1. USER SCHEMA & MODEL
// ============================================================================
const userSchema = new Schema(
  {
    telegramId: {
      type: Number,
      required: true,
      unique: true,
      index: true,
    },
    firstName: { type: String, required: true },
    lastName: { type: String, default: '' },
    username: { type: String, default: null, index: true },
    languageCode: { type: String, default: 'ar' },
    role: {
      type: String,
      enum: ['USER', 'PUBLISHER', 'ADVERTISER', 'ADMIN'],
      default: 'USER',
      index: true,
    },
    isBanned: { type: Boolean, default: false, index: true },
    banReason: { type: String, default: null },
    referredBy: { type: Number, default: null, index: true },
    referralCount: { type: Number, default: 0 },
    settings: {
      notificationsEnabled: { type: Boolean, default: true },
      twoFactorEnabled: { type: Boolean, default: false },
    },
    lastActiveAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

userSchema.index({ createdAt: -1 });

// ============================================================================
// 2. WALLET SCHEMA & FINANCIAL TRANSACTIONS
// ============================================================================
const walletSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    telegramId: { type: Number, required: true, unique: true, index: true },
    balanceUSDT: { type: Number, default: 0.0, min: 0 },
    frozenBalanceUSDT: { type: Number, default: 0.0, min: 0 },
    totalEarnedUSDT: { type: Number, default: 0.0 },
    totalSpentUSDT: { type: Number, default: 0.0 },
    trc20Address: { type: String, default: null },
  },
  { timestamps: true }
);

const transactionSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['DEPOSIT', 'WITHDRAWAL', 'AD_PAYMENT', 'SHORTENER_EARNING', 'REFERRAL_REWARD'],
      required: true,
      index: true,
    },
    amount: { type: Number, required: true },
    status: {
      type: String,
      enum: ['PENDING', 'COMPLETED', 'FAILED', 'CANCELLED'],
      default: 'PENDING',
      index: true,
    },
    txHash: { type: String, default: null, unique: true, sparse: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

transactionSchema.index({ userId: 1, createdAt: -1 });

// ============================================================================
// 3. CHANNEL / MINI APP PUBLISHER SCHEMA
// ============================================================================
const channelSchema = new Schema(
  {
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    channelTelegramId: { type: Number, required: true, unique: true, index: true },
    title: { type: String, required: true },
    username: { type: String, default: null },
    type: {
      type: String,
      enum: ['CHANNEL', 'GROUP', 'MINI_APP', 'BOT'],
      default: 'CHANNEL',
    },
    category: {
      type: String,
      enum: ['MOVIES_SERIES', 'TRADING', 'TECH', 'GAMES', 'GENERAL'],
      required: true,
      index: true,
    },
    memberCount: { type: Number, default: 0 },
    isVerified: { type: Boolean, default: false, index: true },
    isActive: { type: Boolean, default: true, index: true },
    eCPM: { type: Number, default: 1.0 },
  },
  { timestamps: true }
);

// ============================================================================
// 4. AD CAMPAIGN ENGINE SCHEMA
// ============================================================================
const adCampaignSchema = new Schema(
  {
    advertiserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    title: { type: String, required: true },
    content: {
      text: { type: String, required: true },
      mediaUrl: { type: String, default: null },
      buttonText: { type: String, default: null },
      targetUrl: { type: String, default: null },
    },
    budget: {
      totalUSDT: { type: Number, required: true },
      remainingUSDT: { type: Number, required: true },
      cpmUSDT: { type: Number, required: true },
    },
    targeting: {
      categories: [{ type: String }],
      languages: [{ type: String }],
    },
    stats: {
      views: { type: Number, default: 0 },
      clicks: { type: Number, default: 0 },
    },
    status: {
      type: String,
      enum: ['DRAFT', 'PENDING_APPROVAL', 'ACTIVE', 'PAUSED', 'COMPLETED', 'REJECTED'],
      default: 'PENDING_APPROVAL',
      index: true,
    },
  },
  { timestamps: true }
);

adCampaignSchema.index({ status: 1, 'budget.remainingUSDT': 1 });

// ============================================================================
// 5. URL SHORTENER & ANALYTICS SCHEMA
// ============================================================================
const shortUrlSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    shortCode: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    originalUrl: { type: String, required: true },
    title: { type: String, default: null },
    clicks: { type: Number, default: 0 },
    earningsUSDT: { type: Number, default: 0.0 },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

const clickAnalyticsSchema = new Schema(
  {
    urlId: {
      type: Schema.Types.ObjectId,
      ref: 'ShortUrl',
      required: true,
      index: true,
    },
    ipAddress: { type: String, required: true },
    country: { type: String, default: 'UNKNOWN', index: true },
    deviceType: { type: String, default: 'DESKTOP' },
    isUnique: { type: Boolean, default: true },
    publisherEarning: { type: Number, default: 0.0 },
  },
  { timestamps: true }
);

clickAnalyticsSchema.index({ urlId: 1, createdAt: -1 });

// ============================================================================
// MODEL EXPORTS
// ============================================================================
export const User = mongoose.models.User || model('User', userSchema);
export const Wallet = mongoose.models.Wallet || model('Wallet', walletSchema);
export const Transaction = mongoose.models.Transaction || model('Transaction', transactionSchema);
export const Channel = mongoose.models.Channel || model('Channel', channelSchema);
export const AdCampaign = mongoose.models.AdCampaign || model('AdCampaign', adCampaignSchema);
export const ShortUrl = mongoose.models.ShortUrl || model('ShortUrl', shortUrlSchema);
export const ClickAnalytics = mongoose.models.ClickAnalytics || model('ClickAnalytics', clickAnalyticsSchema);

export default {
  User,
  Wallet,
  Transaction,
  Channel,
  AdCampaign,
  ShortUrl,
  ClickAnalytics,
};
