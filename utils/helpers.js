const validUrl = require('valid-url');
const axios = require('axios');
const crypto = require('crypto');
const env = require('../config/env');
const CONFIG = env.CONFIG || env;
const logger = require('./logger');
const { User } = require('../models');

/**
 * تنظيف والتحقق من صحة الرابط (URL)
 */
function normalizeAndValidateUrl(inputUrl) {
  if (!inputUrl) return null;
  let urlStr = String(inputUrl).trim();
  
  // إزالة التكرار في بروتوكول http/https
  while (/^(https?:\/\/){2,}/i.test(urlStr)) {
    urlStr = urlStr.replace(/^(https?:\/\/)+/i, 'https://');
  }

  // إضافة https:// إذا لم يكن البروتوكول موجوداً
  if (!/^https?:\/\//i.test(urlStr)) {
    urlStr = 'https://' + urlStr;
  }

  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol && (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.hostname) {
      return parsed.href;
    }
  } catch (e) {}

  return validUrl.isWebUri(urlStr) ? urlStr : null;
}

/**
 * بناء الرابط المختصر باستغلال الإعدادات
 */
function buildShortUrl(shortCode) {
  if (!shortCode) return '';
  const domain = (CONFIG && CONFIG.APP_DOMAIN) ? CONFIG.APP_DOMAIN : 'localhost:3000';
  const cleanDomain = domain.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  return `https://${cleanDomain}/r/${shortCode}`;
}

/**
 * البحث عن المستخدم أو إنشائه في قاعدة البيانات
 */
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
        $setOnInsert: { telegramId: cleanId, ...setOnInsertData },$set: updateData
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } catch (err) {
    if (err.code === 11000) {
      return await User.findOne({ telegramId: cleanId });
    }
    if (logger && logger.error) {
      logger.error(`⚠️ Error in findOrCreateUser [ID: ${cleanId}]: ${err.message}`);
    }
    throw err;
  }
}

/**
 * إرسال إشعارات عبر بوت التليجرام
 */
async function sendTelegramNotification(telegramId, message) {
  const botToken = CONFIG && CONFIG.BOT_TOKEN;
  if (!botToken || !telegramId || !message) return false;
  try {
    await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      chat_id: telegramId,
      text: message,
      parse_mode: 'HTML',
      disable_web_page_preview: true
    }, { timeout: 4000 });
    return true;
  } catch (err) {
    if (logger && logger.error) {
      logger.error(`⚠️ Telegram Dispatch Failed [ID: ${telegramId}]: ${err.message}`);
    }
    return false;
  }
}

/**
 * التحقق من بيانات التليجرام واستخراج معلومات المستخدم
 */
function verifyTelegramData(initData) {
  if (!initData) return null;

  const defaultLang = (CONFIG && CONFIG.DEFAULT_LANGUAGE) || 'en';

  // 1. التعامل مع الكائنات المباشرة (Objects)
  if (typeof initData === 'object' && initData !== null) {
    const rawUser = initData.user || initData;
    const idVal = Number(rawUser.id || rawUser.telegramId || rawUser.userId || rawUser.user_id || rawUser.telegram_id);
    if (idVal && !isNaN(idVal)) {
      return {
        id: idVal,
        username: rawUser.username || `User_${String(idVal).slice(-4)}`,
        first_name: rawUser.first_name || rawUser.firstName || '',
        last_name: rawUser.last_name || rawUser.lastName || '',
        language_code: rawUser.language_code || rawUser.language || defaultLang
      };
    }
  }

  // 2. التعامل مع الأرقام المباشرة أو النصوص الرقمية
  if (typeof initData === 'number' || (typeof initData === 'string' && /^\d+$/.test(initData.trim()))) {
    const idVal = Number(String(initData).trim());
    if (idVal && !isNaN(idVal)) {
      return { id: idVal, username: `User_${String(idVal).slice(-4)}`, language_code: defaultLang };
    }
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

    const candidates = [cleanInitData, decodedInitData];

    for (const str of candidates) {
      // التعامل مع نصوص JSON
      if (str.startsWith('{') && str.endsWith('}')) {
        try {
          const parsed = JSON.parse(str);
          const rawUser = parsed.user || parsed;
          const parsedId = Number(rawUser.id || rawUser.telegramId || rawUser.userId || rawUser.user_id || rawUser.telegram_id);
          if (parsedId && !isNaN(parsedId)) {
            return {
              id: parsedId,
              username: rawUser.username || `User_${String(parsedId).slice(-4)}`,
              first_name: rawUser.first_name || rawUser.firstName || '',
              last_name: rawUser.last_name || rawUser.lastName || '',
              language_code: rawUser.language_code || rawUser.language || defaultLang
            };
          }
        } catch (e) {}
      }

      // الرقم المستقل
      if (/^\d+$/.test(str)) {
        const idVal = Number(str);
        if (idVal && !isNaN(idVal)) {
          return { id: idVal, username: `User_${String(idVal).slice(-4)}`, language_code: defaultLang };
        }
      }

      // تحليل معاملات الـ URL (Query Params)
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

        const botToken = CONFIG && CONFIG.BOT_TOKEN;
        if (botToken && hash) {
          try {
            const dataCheckArr = [];
            for (const [key, val] of urlParams.entries()) {
              if (key !== 'hash') {
                dataCheckArr.push(`${key}=${val}`);
              }
            }
            dataCheckArr.sort();
            const dataCheckString = dataCheckArr.join('\n');

            const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
            const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

            if (calculatedHash === hash && userData && (userData.id || userData.telegram_id)) {
              const idVal = Number(userData.id || userData.telegram_id);
              return {
                id: idVal,
                username: userData.username || `User_${String(idVal).slice(-4)}`,
                first_name: userData.first_name || userData.firstName || '',
                last_name: userData.last_name || userData.lastName || '',
                language_code: userData.language_code || userData.language || defaultLang
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
              language_code: userData.language_code || userData.language || defaultLang
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
            language_code: urlParams.get('language_code') || urlParams.get('language') || defaultLang
          };
        }
      }

      // البحث عن الأرقام بنمط Regex الاحتياطي
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
            language_code: defaultLang
          };
        }
      }
    }

    return null;
  } catch (err) {
    return null;
  }
}

/**
 * فحص الرابط والتأكد من عدم وجود كلمات مشبوهة أو خبيثة
 */
const isPhishingOrMalicious = (url) => {
  if (!url || typeof url !== 'string') return false;
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
