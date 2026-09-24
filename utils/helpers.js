const validUrl = require('valid-url');
const CONFIG = require('../config/constants');
const { User } = require('../models');

function normalizeAndValidateUrl(inputUrl) {
  if (!inputUrl) return null;
  let urlStr = String(inputUrl).trim();
  
  while (/^(https?:\/\/){2,}/i.test(urlStr)) {
    urlStr = urlStr.replace(/^(https?:\/\/)+/i, 'https://');
  }

  if (!/^https?:\/\//i.test(urlStr)) {
    urlStr = 'https://' + urlStr;
  }

  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol && parsed.hostname) {
      return parsed.href;
    }
  } catch (e) {}

  return validUrl.isWebUri(urlStr) ? urlStr : null;
}

function buildShortUrl(shortCode) {
  return `https://${CONFIG.APP_DOMAIN}/r/${shortCode}`;
}

async function findOrCreateUser(tgId, updateData = {}, setOnInsertData = {}) {
  if (!tgId) return null;
  const cleanId = String(tgId).trim();
  if (!cleanId || cleanId === 'null' || cleanId === 'undefined' || cleanId === '' || cleanId === 'NaN') {
    return null;
  }
  try {
    return await User.findOneAndUpdate(
      { telegramId: cleanId },
      {
        $setOnInsert: { telegramId: cleanId, ...setOnInsertData },
        $set: updateData
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } catch (err) {
    if (err.code === 11000) {
      return await User.findOne({ telegramId: cleanId });
    }
    throw err;
  }
}

function isPhishingOrMalicious(url) {
  const blacklistedKeywords = ['phish', 'login-verify', 'free-telegram-premium', 'grabber', 'stealer', 'iplogger'];
  const lowerUrl = url.toLowerCase();
  return blacklistedKeywords.some(keyword => lowerUrl.includes(keyword));
}

module.exports = {
  normalizeAndValidateUrl,
  buildShortUrl,
  findOrCreateUser,
  isPhishingOrMalicious
};
