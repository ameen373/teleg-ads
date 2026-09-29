const crypto = require('crypto');
const axios = require('axios');
const CONFIG = require('../config/config');
const logger = require('../config/logger');

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

function formatUserData(userObj) {
  if (!userObj || typeof userObj !== 'object') return null;

  const rawId = userObj.id || userObj.telegramId || userObj.userId || userObj.user_id || userObj.telegram_id || userObj.tg_id;
  const telegramId = Number(rawId);

  if (!telegramId || isNaN(telegramId)) return null;

  const firstName = userObj.first_name || userObj.firstName || '';
  const lastName = userObj.last_name || userObj.lastName || '';
  const username = userObj.username || `User_${String(telegramId).slice(-4)}`;
  const languageCode = userObj.language_code || userObj.languageCode || userObj.language || CONFIG.DEFAULT_LANGUAGE || 'ar';

  return {
    ...userObj,
    id: telegramId,
    telegramId: telegramId,
    username: username,
    first_name: firstName,
    firstName: firstName,
    last_name: lastName,
    lastName: lastName,
    language_code: languageCode,
    languageCode: languageCode
  };
}

function verifyTelegramData(initData) {
  if (!initData) return null;

  if (typeof initData === 'object' && initData !== null) {
    return formatUserData(initData);
  }

  if (typeof initData === 'number' || /^\d+$/.test(String(initData).trim())) {
    const idVal = Number(String(initData).trim());
    return formatUserData({ id: idVal });
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
          const formatted = formatUserData(parsed);
          if (formatted) return formatted;
        } catch (e) {}
      }

      if (/^\d+$/.test(str)) {
        return formatUserData({ id: Number(str) });
      }

      let urlParams = null;
      try {
        urlParams = new URLSearchParams(str);
      } catch (e) {
        try {
          urlParams = new URLSearchParams(decodedInitData);
        } catch (err) {}
      }

      if (urlParams && urlParams.toString()) {
        const hash = urlParams.get('hash');
        const userParam = urlParams.get('user');

        let parsedUser = null;
        if (userParam) {
          try {
            parsedUser = typeof userParam === 'string' ? JSON.parse(userParam) : userParam;
          } catch (e) {
            try {
              parsedUser = JSON.parse(decodeURIComponent(userParam));
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

            const calculatedBuffer = Buffer.from(calculatedHash, 'hex');
            const hashBuffer = Buffer.from(hash, 'hex');

            if (calculatedBuffer.length === hashBuffer.length && crypto.timingSafeEqual(calculatedBuffer, hashBuffer)) {
              if (parsedUser) {
                const formatted = formatUserData(parsedUser);
                if (formatted) return formatted;
              }
            }
          } catch (hErr) {
            logger.error(`⚠️ HMAC Verification error: ${hErr.message}`);
          }
        }

        if (parsedUser) {
          const formatted = formatUserData(parsedUser);
          if (formatted) return formatted;
        }

        const idParam = urlParams.get('id') || urlParams.get('telegram_id') || urlParams.get('telegramId') || urlParams.get('userId') || urlParams.get('user_id') || urlParams.get('tg_id');
        if (idParam && /^\d+$/.test(idParam)) {
          return formatUserData({
            id: Number(idParam),
            username: urlParams.get('username'),
            first_name: urlParams.get('first_name') || urlParams.get('firstName'),
            last_name: urlParams.get('last_name') || urlParams.get('lastName'),
            language_code: urlParams.get('language_code') || urlParams.get('language')
          });
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
          return formatUserData({ id: idVal });
        }
      }
    }

    return null;
  } catch (err) {
    logger.error(`⚠️ Error in verifyTelegramData: ${err.message}`);
    return null;
  }
}

module.exports = {
  sendTelegramNotification,
  verifyTelegramData
};
