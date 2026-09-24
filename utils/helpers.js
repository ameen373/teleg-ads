const validUrl = require('valid-url');
const axios = require('axios');
const crypto = require('crypto');
const { CONFIG } = require('../config/env');
const logger = require('./logger');
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

async function sendTelegramNotification(telegramId, message) {
  if (!CONFIG.BOT_TOKEN || !telegramId) return;
  try {
    await axios.post(`https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/sendMessage`, {
      chat_id: telegramId,
      text: message,
      parse_mode: 'HTML',
      disable_web_page_preview: true
    }, { timeout: 4000 });
  } catch (err) {
    logger.error(`⚠️ Telegram Dispatch Failed [ID: ${telegramId}]: ${err.message}`);
  }
}

function verifyTelegramData(initData) {
  if (!initData) return null;

  if (typeof initData === 'object' && initData !== null) {
    const idVal = Number(initData.id || initData.telegramId || initData.userId || initData.user_id || initData.telegram_id);
    if (idVal && !isNaN(idVal)) {
      return {
        id: idVal,
        username: initData.username || `User_${String(idVal).slice(-4)}`,
        first_name: initData.first_name || initData.firstName || '',
        last_name: initData.last_name || initData.lastName || '',
        language_code: initData.language_code || initData.language || CONFIG.DEFAULT_LANGUAGE
      };
    }
  }

  if (typeof initData === 'number' || /^\d+$/.test(String(initData).trim())) {
    const idVal = Number(String(initData).trim());
    return { id: idVal, username: `User_${String(idVal).slice(-4)}`, language_code: CONFIG.DEFAULT_LANGUAGE };
  }

  if (typeof initData !== 'string') return null;

  try {
    let cleanInitData = initData.trim();
    if (cleanInitData.startsWith('?')) cleanInitData = cleanInitData.slice(1);

    let decodedInitData = cleanInitData;
    try {
      if (cleanInitData.includes('%') || cleanInitData.includes('=%7B') || cleanInitData.includes('=%22')) {
        decodedInitData = decodeURIComponent(cleanInitData);
      }
    } catch (e) {}

    for (const str of [cleanInitData, decodedInitData]) {
      if (str.startsWith('{') && str.endsWith('}')) {
        try {
          const parsed = JSON.parse(str);
          const parsedId = Number(parsed.id || parsed.telegramId || parsed.userId || parsed.user_id || parsed.telegram_id);
          if (parsedId && !isNaN(parsedId)) {
            return {
              id: parsedId,
              username: parsed.username || `User_${String(parsedId).slice(-4)}`,
              first_name: parsed.first_name || parsed.firstName || '',
              last_name: parsed.last_name || parsed.lastName || '',
              language_code: parsed.language_code || parsed.language || CONFIG.DEFAULT_LANGUAGE
            };
          }
        } catch (e) {}
      }

      if (/^\d+$/.test(str)) {
        const idVal = Number(str);
        return { id: idVal, username: `User_${String(idVal).slice(-4)}`, language_code: CONFIG.DEFAULT_LANGUAGE };
      }

      let urlParams = null;
      try {
        urlParams = new URLSearchParams(str);
      } catch (e) {
        try {
          urlParams = new URLSearchParams(decodedInitData);
        } catch (err) {}
      }

      if (urlParams) {
        const hash = urlParams.get('hash');
        const userParam = urlParams.get('user');

        let userData = userParam;
        if (typeof userData === 'string') {
          try {
            userData = JSON.parse(userData);
          } catch (e) {
            try {
              userData = JSON.parse(decodeURIComponent(userParam));
            } catch (err) {}
          }
        }

        if (CONFIG.BOT_TOKEN && hash) {
          try {
            const dataCheckArr = [];
            for (const [key, val] of urlParams.entries()) {
              if (key !== 'hash') {
                dataCheckArr.push(`${key}=${val}`);
              }
            }
            dataCheckArr.sort();
            const dataCheckString = dataCheckArr.join('\n');

            const secretKey = crypto.createHmac('sha256', 'WebAppData').update(CONFIG.BOT_TOKEN).digest();
            const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

            if (calculatedHash === hash && userData && (userData.id || userData.telegram_id)) {
              const idVal = Number(userData.id || userData.telegram_id);
              return {
                id: idVal,
                username: userData.username || `User_${String(idVal).slice(-4)}`,
                first_name: userData.first_name || userData.firstName || '',
                last_name: userData.last_name || userData.lastName || '',
                language_code: userData.language_code || userData.language || CONFIG.DEFAULT_LANGUAGE
              };
            }
          } catch (hErr) {}
        }

        if (userData && typeof userData === 'object') {
          const idVal = Number(userData.id || userData.telegramId || userData.userId || userData.user_id || userData.telegram_id);
          if (idVal && !isNaN(idVal)) {
            return {
              id: idVal,
              username: userData.username || `User_${String(idVal).slice(-4)}`,
              first_name: userData.first_name || userData.firstName || '',
              last_name: userData.last_name || userData.lastName || '',
              language_code: userData.language_code || userData.language || CONFIG.DEFAULT_LANGUAGE
            };
          }
        }

        const idParam = urlParams.get('id') || urlParams.get('telegram_id') || urlParams.get('telegramId') || urlParams.get('userId') || urlParams.get('user_id') || urlParams.get('tg_id');
        if (idParam && /^\d+$/.test(idParam)) {
          const idVal = Number(idParam);
          return {
            id: idVal,
            username: urlParams.get('username') || `User_${String(idVal).slice(-4)}`,
            first_name: urlParams.get('first_name') || urlParams.get('firstName') || '',
            last_name: urlParams.get('last_name') || urlParams.get('lastName') || '',
            language_code: urlParams.get('language_code') || urlParams.get('language') || CONFIG.DEFAULT_LANGUAGE
          };
        }
      }

      const matchRegex = str.match(/%22id%22%3A(\d+)/) || 
                         str.match(/"id"\s*:\s*(\d+)/) || 
                         str.match(/id\s*[=:]\s*(\d+)/i) || 
                         str.match(/telegram_id\s*[=:]\s*(\d+)/i) || 
                         str.match(/user_id\s*[=:]\s*(\d+)/i) ||
                         str.match(/userId\s*[=:]\s*(\d+)/i);
      if (matchRegex && matchRegex[1]) {
        const idVal = Number(matchRegex[1]);
        if (idVal && !isNaN(idVal)) {
          return {
            id: idVal,
            username: `User_${String(idVal).slice(-4)}`,
            language_code: CONFIG.DEFAULT_LANGUAGE
          };
        }
      }
    }

    return null;
  } catch (err) {
    return null;
  }
}

const isPhishingOrMalicious = (url) => {
  const blacklistedKeywords = ['phish', 'login-verify', 'free-telegram-premium', 'grabber', 'stealer', 'iplogger'];
  const lowerUrl = url.toLowerCase();
  return blacklistedKeywords.some(keyword => lowerUrl.includes(keyword));
};

module.exports = {
  normalizeAndValidateUrl,
  buildShortUrl,
  findOrCreateUser,
  sendTelegramNotification,
  verifyTelegramData,
  isPhishingOrMalicious
};
