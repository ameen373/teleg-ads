const validUrl = require('valid-url');
const crypto = require('crypto');
const CONFIG = require('../config/config');

// مفتاح التشفير السري الخاص بالتوكينات
const SECRET_KEY = CONFIG.JWT_SECRET || CONFIG.SESSION_SECRET || 'telega_ads_bridge_secret_key_2026';

/**
 * توليد كود عشوائي فريد باستخدام وحدة crypto المدمجة
 */
function generateUniqueCode(length = 7) {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.randomBytes(length);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters[bytes[i] % characters.length];
  }
  return result;
}

/**
 * التحقق من صحة الرابط المدخل
 */
function isValidUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsedUrl = new URL(url.trim());
    return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
  } catch (e) {
    return false;
  }
}

/**
 * دالة استخراج الـ IP الحقيقي للزائر بدقة عالية
 */
function getRealIp(req) {
  if (!req) return '127.0.0.1';

  const headers = req.headers || {};

  const cfIp = headers['cf-connecting-ip'];
  if (cfIp) return cfIp.trim();

  const vercelIp = headers['x-vercel-forwarded-for'];
  if (vercelIp) return vercelIp.split(',')[0].trim();

  const xRealIp = headers['x-real-ip'];
  if (xRealIp) return xRealIp.trim();

  const xForwardedFor = headers['x-forwarded-for'];
  if (xForwardedFor) {
    const ips = xForwardedFor.split(',');
    return ips[0].trim();
  }

  let rawIp = req.ip || (req.socket && req.socket.remoteAddress) || '127.0.0.1';
  
  if (rawIp === '::1' || rawIp === '::ffff:127.0.0.1') {
    rawIp = '127.0.0.1';
  } else if (rawIp.startsWith('::ffff:')) {
    rawIp = rawIp.replace('::ffff:', '');
  }

  return rawIp;
}

/**
 * دالة فحص تحديد الدولة بناءً على رؤوس الطلب أو الـ IP
 */
function getGeoLocation(req, ip) {
  if (!req) return 'ALL';
  const headers = req.headers || {};

  const countryHeader = headers['cf-ipcountry'] || headers['x-vercel-ip-country'] || headers['x-country-code'];
  if (countryHeader && countryHeader !== 'XX' && countryHeader !== 'T1') {
    return countryHeader.toUpperCase().trim();
  }

  return 'ALL';
}

/**
 * دالة التعرف على نوع جهاز الزائر
 */
function getDeviceType(userAgent) {
  if (!userAgent) return 'desktop';
  const ua = String(userAgent).toLowerCase();

  if (/android/i.test(ua)) return 'android';
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  return 'desktop';
}

/**
 * دالة تنظيف وتدقيق صحة الروابط المستهدفة
 */
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

/**
 * دالة بناء الرابط المختصر النهائي
 */
function buildShortUrl(shortCode) {
  const domain = CONFIG.APP_DOMAIN || 'localhost:3000';
  const protocol = domain.includes('localhost') ? 'http://' : 'https://';
  return `${protocol}${domain}/r/${shortCode}`;
}

/**
 * فحص أمان الرابط ومنع الروابط الضارة الخبيثة
 */
function isPhishingOrMalicious(url) {
  const blacklistedKeywords = [
    'phish', 'login-verify', 'free-telegram-premium', 'grabber', 
    'stealer', 'iplogger', 'malware', 'hack', 'pirate-login'
  ];
  const lowerUrl = String(url).toLowerCase();
  return blacklistedKeywords.some(keyword => lowerUrl.includes(keyword));
}

/**
 * استخراج النطاق الرئيسي الصافي
 */
function sanitizeDomain(urlStr) {
  try {
    const parsed = new URL(normalizeAndValidateUrl(urlStr));
    return parsed.hostname.toLowerCase().replace(/^www\./, '');
  } catch (e) {
    return '';
  }
}

/**
 * توليد توكين مشفر أحادي الاستخدام
 */
function generateBridgeToken(shortCode, ip, ttlSeconds = 300) {
  const expiresAt = Date.now() + (ttlSeconds * 1000);
  const nonce = crypto.randomBytes(8).toString('hex');
  const payloadStr = `${shortCode}:${ip}:${expiresAt}:${nonce}`;

  const signature = crypto
    .createHmac('sha256', SECRET_KEY)
    .update(payloadStr)
    .digest('hex');

  const tokenData = Buffer.from(JSON.stringify({
    c: shortCode,
    e: expiresAt,
    n: nonce,
    s: signature
  })).toString('base64url');

  return tokenData;
}

/**
 * التحقق من صحة وصلاحية التوكين المشفر
 */
function verifyBridgeToken(token, expectedShortCode, expectedIp) {
  if (!token) return { valid: false, error: 'التوكين غير موجود' };

  try {
    const decoded = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
    const { c: shortCode, e: expiresAt, n: nonce, s: signature } = decoded;

    if (!shortCode || !expiresAt || !nonce || !signature) {
      return { valid: false, error: 'صيغة التوكين غير صحيحة' };
    }

    if (shortCode !== expectedShortCode) {
      return { valid: false, error: 'كود الرابط غير مطابق' };
    }

    if (Date.now() > expiresAt) {
      return { valid: false, error: 'انتهت صلاحية التوكين الزمني' };
    }

    const payloadStr = `${shortCode}:${expectedIp}:${expiresAt}:${nonce}`;
    const expectedSignature = crypto
      .createHmac('sha256', SECRET_KEY)
      .update(payloadStr)
      .digest('hex');

    const flexPayloadStr = `${shortCode}:${expiresAt}:${nonce}`;
    const flexSignature = crypto
      .createHmac('sha256', SECRET_KEY)
      .update(flexPayloadStr)
      .digest('hex');

    if (signature !== expectedSignature && signature !== flexSignature) {
      return { valid: false, error: 'توقيع التوكين غير صالح' };
    }

    return { valid: true, expiresAt, nonce };
  } catch (err) {
    return { valid: false, error: 'فشل فك تشفير التوكين' };
  }
}

module.exports = {
  generateUniqueCode,
  isValidUrl,
  getRealIp,
  getGeoLocation,
  getDeviceType,
  normalizeAndValidateUrl,
  buildShortUrl,
  isPhishingOrMalicious,
  sanitizeDomain,
  generateBridgeToken,
  verifyBridgeToken
};
