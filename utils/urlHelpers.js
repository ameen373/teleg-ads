const validUrl = require('valid-url');
const crypto = require('crypto');
const CONFIG = require('../config/config');

const SECRET_KEY = CONFIG.JWT_SECRET || 'telega_ads_bridge_secret_key_2026';

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

function getGeoLocation(req, ip) {
  if (!req) return 'ALL';
  const headers = req.headers || {};

  const countryHeader = headers['cf-ipcountry'] || headers['x-vercel-ip-country'] || headers['x-country-code'];
  if (countryHeader && countryHeader !== 'XX' && countryHeader !== 'T1') {
    return countryHeader.toUpperCase().trim();
  }

  return 'ALL';
}

function getDeviceType(userAgent) {
  if (!userAgent) return 'desktop';
  const ua = String(userAgent).toLowerCase();

  if (/android/i.test(ua)) return 'android';
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  return 'desktop';
}

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
  const domain = CONFIG.APP_DOMAIN || 'localhost:3000';
  const protocol = domain.includes('localhost') ? 'http://' : 'https://';
  return `${protocol}${domain}/r/${shortCode}`;
}

function isPhishingOrMalicious(url) {
  const blacklistedKeywords = [
    'phish', 'login-verify', 'free-telegram-premium', 'grabber', 
    'stealer', 'iplogger', 'malware', 'hack', 'pirate-login'
  ];
  const lowerUrl = url.toLowerCase();
  return blacklistedKeywords.some(keyword => lowerUrl.includes(keyword));
}

function sanitizeDomain(urlStr) {
  try {
    const parsed = new URL(normalizeAndValidateUrl(urlStr));
    return parsed.hostname.toLowerCase().replace(/^www\./, '');
  } catch (e) {
    return '';
  }
}

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
