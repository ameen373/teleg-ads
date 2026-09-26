if (typeof window !== 'undefined') {
  throw new Error("Critical Security Alert: Mongoose models must run exclusively on the server side.");
}

const mongoose = require('mongoose');

// Precision currency formatter up to 5 decimal places (Supports both Numbers and numeric Strings)
const formatCurrency = (val) => {
  const num = typeof val === 'string' ? parseFloat(val) : val;
  if (typeof num !== 'number' || isNaN(num) || !isFinite(num)) return 0;
  return Math.round((num + Number.EPSILON) * 100000) / 100000;
};

// Robust Telegram ID normalizer to handle numbers, strings, or nested user objects safely
const sanitizeTelegramId = (v) => {
  if (v === null || v === undefined) return undefined;
  if (typeof v === 'object' && v !== null) {
    if (v.telegramId) v = v.telegramId;
    else if (v.id) v = v.id;
  }
  const str = String(v).trim();
  if (str === '' || str === 'undefined' || str === 'null' || str === '[object Object]') return undefined;
  return str;
};

// Robust general string normalizer for unique fields (like txHash, txId, txid, tokens)
const sanitizeString = (v) => {
  if (v === null || v === undefined) return undefined;
  const str = String(v).trim();
  if (str === '' || str === 'undefined' || str === 'null' || str === '[object Object]') return undefined;
  return str;
};

// Helper to accurately distinguish valid 24-hex MongoDB ObjectIds from numeric Telegram IDs
const isObjectId = (val) => {
  if (!val) return false;
  if (val instanceof mongoose.Types.ObjectId) return true;
  if (typeof val === 'string' && /^[0-9a-fA-F]{24}$/.test(val)) return true;
  return false;
};

// Global Schema Options for strict data isolation, timestamps, and safe JSON serialization (including Virtuals)
const globalSchemaOptions = {
  timestamps: true,
  versionKey: '__v',
  toJSON: {
    virtuals: true,
    transform: function (doc, ret) {
      delete ret.__v;
      return ret;
    }
  },
  toObject: {
    virtuals: true,
    transform: function (doc, ret) {
      delete ret.__v;
      return ret;
    }
  }
};

module.exports = {
  formatCurrency,
  sanitizeTelegramId,
  sanitizeString,
  isObjectId,
  globalSchemaOptions
};
