const rateLimit = require('express-rate-limit');
const { isIpBanned, checkRateLimit, banIp } = require('../config/redis');

const getRealIp = (req) => {
  const cfIp = req.headers['cf-connecting-ip'];
  const vercelIp = req.headers['x-vercel-forwarded-for'];
  const realIpHeader = req.headers['x-real-ip'];
  const forwardedFor = req.headers['x-forwarded-for'];

  if (cfIp) return cfIp.trim();
  if (vercelIp) return vercelIp.split(',')[0].trim();
  if (realIpHeader) return realIpHeader.trim();
  if (forwardedFor) return forwardedFor.split(',')[0].trim();
  return req.ip || req.connection?.remoteAddress || '0.0.0.0';
};

const linkCreationLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'تم تجاوز الحد اليومي لإنشاء الروابط' }
});

const clickLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => getRealIp(req),
  message: { success: false, error: 'طلبات كثيرة جداً. يرجى الانتظار.' }
});

const validateTraffic = async (req, res, next) => {
  try {
    const realIp = getRealIp(req);
    const userAgent = req.get('User-Agent') || '';
    const deviceFingerprint = req.headers['x-device-fingerprint'] || req.body?.deviceFingerprint || null;
    const country = req.headers['cf-ipcountry'] || req.headers['x-vercel-ip-country'] || 'XX';

    const banned = await isIpBanned(realIp);
    if (banned) {
      return res.status(403).json({
        success: false,
        error: 'تم حظر عنوان IP الخاص بك بسبب نشاط مشبوه (IP Banned)'
      });
    }

    const rateCheck = await checkRateLimit(realIp, 30, 60);
    if (!rateCheck.allowed) {
      if (rateCheck.current > 60) {
        await banIp(realIp, 3600, 'Exceeded rate limits aggressively');
      }
      return res.status(429).json({
        success: false,
        error: 'معدل الطلبات مرتفع جداً، يرجى المحاولة لاحقاً (Rate Limit Exceeded)'
      });
    }

    const botPattern = /bot|crawler|spider|datacenter|proxy|httpclient|curl|python|axios|node-fetch|headless|selenium|puppeteer|phantomjs|scrape|wget|go-http-client|java/i;
    const isBot = botPattern.test(userAgent);

    if (isBot) {
      return res.status(403).json({
        success: false,
        error: 'تم رفض الزيارة الآلية (Bot Traffic Rejected)'
      });
    }

    const proxyHeaders = [
      'via',
      'x-forwarded-host',
      'x-proxy-id',
      'forwarded',
      'proxy-connection',
      'x-roaming'
    ];
    let isProxy = false;
    for (const header of proxyHeaders) {
      if (req.headers[header]) {
        isProxy = true;
        break;
      }
    }

    req.trafficData = {
      realIp,
      userAgent,
      deviceFingerprint,
      country,
      isBot,
      isProxy,
      isBanned: false
    };

    req.realIp = realIp;

    next();
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getRealIp,
  linkCreationLimiter,
  clickLimiter,
  validateTraffic
};
