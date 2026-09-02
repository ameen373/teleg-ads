// models/Campaign.js
const mongoose = require('mongoose');

const campaignSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    targetUrl: {
      type: String,
      required: true,
      trim: true
    },
    bannerUrl: {
      type: String,
      trim: true,
      default: ''
    },
    totalBudget: {
      type: Number,
      required: true,
      min: 5
    },
    remainingBudget: {
      type: Number,
      required: true
    },
    impressionsDelivered: {
      type: Number,
      default: 0
    },
    status: {
      type: String,
      enum: ['active', 'paused', 'completed'],
      default: 'active',
      index: true
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Campaign', campaignSchema);
