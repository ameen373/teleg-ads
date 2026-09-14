/**
 * Ultra-Enterprise Server Architecture (V7 - Cloud Optimized & Serverless Ready)
 * Telegram Link Shortener & Mini App Engine (Telega.ads)
 * Absolute Isolated Session System & High-Performance Connection Pooling
 */

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const morgan = require('morgan');
const winston = require('winston');
const validUrl = require('valid-url');
const axios = require('axios');
const Redis = require('ioredis');
const cors = require('cors');
const { User, Ad, Link, Impression, ClickSession, Withdraw, EarningsHold, Deposit, Announcement } = require('./models');

const app = express();

// --- Setup Server Trust Proxy ---
app.set('trust proxy', 1);

// --- CORS Configuration ---
app.use(cors({
  origin: true,
  credentials: true
}));
app.options('*', cors());

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(express.static(__dirname));

// --- Force UTF-8 JSON Response Headers & No-Cache Privacy Guard ---
app.use('/api', (req, res, next) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  next();
});

// --- Centralized Logging Engine ---
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({ format: winston.format.simple() }));
}

app.use(morgan('combined', { stream: { write: (message) => logger.info(message.trim()) } }));

// ==================================================
// --- System Constants & Environment Variables ---
// ==================================================
const CONFIG = Object.freeze({
  BOT_TOKEN: process.env.BOT_TOKEN,
  MONGO_URI: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/shortener',
  ADMIN_ID: String(process.env.ADMIN_ID || '123456789').trim(),
  JWT_SECRET: process.env.JWT_SECRET || 'fallback_jwt_secret_key_32bytes_long!',
  ADSGRAM_BLOCK_ID: process.env.ADSGRAM_BLOCK_ID || '1234',
  APP_DOMAIN: process.env.APP_DOMAIN || 'teleg-ads.vercel.app',
  REDIS_URL: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
  DEFAULT_LANGUAGE: 'ar',
  
  OFFICIAL_BOT_URL: process.env.OFFICIAL_BOT_URL || 'https://t.me/Ads_telegabot',
  OFFICIAL_CHANNEL_URL: process.env.OFFICIAL_CHANNEL_URL || 'https://t.me/ttelega_ads',
  TELEGRAM_SUPPORT_URL: process.env.TELEGRAM_SUPPORT_URL || 'https://t.me/Te_AdsNs_bot',
  
  DEPOSIT_USDT_BEP20: process.env.DEPOSIT_USDT_BEP20 || '',
  DEPOSIT_USDT_TRC20: process.env.DEPOSIT_USDT_TRC20 || '',

  BOT_USERNAME: '@' + (process.env.OFFICIAL_BOT_URL || 'https://t.me/Ads_telegabot').split('/').pop(),
  SUPPORT_USERNAME: '@' + (process.env.TELEGRAM_SUPPORT_URL || 'https://t.me/Te_AdsNs_bot').split('/').pop()
});

// --- Serverless-Optimized Redis Connection Pooling ---
let redis = null;
let redisIsConnected = false;

function getRedisClient() {
  if (!redis) {
    redis = new Redis(CONFIG.REDIS_URL, {
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
      retryStrategy: (times) => Math.min(times * 50, 1000),
      connectTimeout: 5000
    });

    redis.on('error', (err) => {
      redisIsConnected = false;
      logger.error('⚠️ Redis Connection Warning: ' + err.message);
    });
    
    redis.on('ready', () => {
      redisIsConnected = true;
    });
  }
  return redis;
}

async function safeRedisGet(key) {
  try {
    const client = getRedisClient();
    return await client.get(key);
  } catch (e) { return null; }
}

async function safeRedisSet(key, value, mode, duration) {
  try {
    const client = getRedisClient();
    if (mode && duration) await client.set(key, value, mode, duration);
    else await client.set(key, value);
  } catch (e) { logger.error('Redis Set Failed: ' + e.message); }
}

async function safeRedisDel(key) {
  try {
    const client = getRedisClient();
    await client.del(key);
  } catch (e) { logger.error('Redis Del Failed: ' + e.message); }
}

// --- Serverless-Optimized MongoDB Connection Pooling ---
let cachedMongooseConn = global.mongooseConn;

async function connectDB() {
  if (cachedMongooseConn && mongoose.connection.readyState === 1) {
    return cachedMongooseConn;
  }

  try {
    const opts = {
      maxPoolSize: 10,
      minPoolSize: 2,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      bufferCommands: false
    };

    cachedMongooseConn = await mongoose.connect(CONFIG.MONGO_URI, opts);
    global.mongooseConn = cachedMongooseConn;
    console.log('✅ Enterprise MongoDB Pipeline Connected (Pooled)');
    return cachedMongooseConn;
  } catch (err) {
    logger.error('❌ Critical MongoDB Connection Failure:', err);
    throw err;
  }
}

// Middleware لضمان الاتصال بقاعدة البيانات قبل تنفيذ أي طلب
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    res.status(500).json({ success: false, error: 'تعذر الاتصال بقاعدة البيانات' });
  }
});

// --- Telegram Dispatch Helper ---
async function sendTelegramNotification(telegramId, message) {
  if (!CONFIG.BOT_TOKEN || !telegramId) return;
  try {
    await axios.post(`https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/sendMessage`, {
      chat_id: telegramId,
      text: message,
      parse_mode: 'HTML',
      disable_web_page_preview: true
    }, { timeout: 3000 });
  } catch (err) {
    logger.error(`⚠️ Telegram Dispatch Failed [ID: ${telegramId}]: ${err.message}`);
  }
}

// --- Cryptographic Telegram Authenticator ---
function verifyTelegramData(initData) {
  if (!initData) return null;
  try {
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');
    if (!hash) return null;

    urlParams.delete('hash');
    const paramsArr = Array.from(urlParams.entries())
      .map(([k, v]) => `${k}=${v}`)
      .sort();

    const dataCheckString = paramsArr.join('\n');
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(CONFIG.BOT_TOKEN || '').digest();
    const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    const calculatedBuffer = Buffer.from(calculatedHash, 'hex');
    const hashBuffer = Buffer.from(hash, 'hex');

    if (calculatedBuffer.length === hashBuffer.length && crypto.timingSafeEqual(calculatedBuffer, hashBuffer)) {
      const userParam = urlParams.get('user');
      return userParam ? JSON.parse(userParam) : null;
    }
    return null;
  } catch (err) {
    return null;
  }
}

// --- Middlewares & Security Limiters (Anti-Spam & DDoS Protection) ---
const globalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'تم تجاوز الحد المسموح من الطلبات، يرجى المحاولة لاحقاً' }
});
app.use('/api/', globalApiLimiter);

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
  keyGenerator: (req) => req.ip,
  message: { success: false, error: 'طلبات كثيرة جداً. يرجى الانتظار.' }
});

const validateTraffic = (req, res, next) => {
  const ua = req.get('User-Agent') || '';
  const botPattern = /bot|crawler|spider|datacenter|proxy|httpclient|curl|python|axios|headless|selenium|puppeteer/i;
  if (botPattern.test(ua)) {
    return res.status(403).json({ success: false, error: 'تم رفض الزيارة الآلية (Bot Traffic Rejected)' });
  }
  next();
};

const isPhishingOrMalicious = (url) => {
  const blacklistedKeywords = ['phish', 'login-verify', 'free-telegram-premium', 'grabber', 'stealer', 'iplogger'];
  const lowerUrl = url.toLowerCase();
  return blacklistedKeywords.some(keyword => lowerUrl.includes(keyword));
};

// =========================================================================
// --- Auth Middleware ---
// =========================================================================
const authMiddleware = async (req, res, next) => {
  try {
    let user = null;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
        const decoded = jwt.verify(token, CONFIG.JWT_SECRET);
        user = await User.findById(decoded.userId).lean();
      } catch (err) {}
    }

    if (!user) {
      const initData = req.headers['x-telegram-init-data'];
      const telegramUser = verifyTelegramData(initData);
      if (telegramUser) {
        user = await User.findOne({ telegramId: String(telegramUser.id) }).lean();
      }
    }

    if (!user) {
      return res.status(401).json({ success: false, error: 'جلسة غير صالحة، يرجى إعادة تحميل التطبيق' });
    }

    if (user.isBanned) {
      return res.status(403).json({ success: false, error: 'حسابك معطل بسبب مخالفة الشروط' });
    }

    req.user = user;
    req.user.id = user._id.toString();
    req.userId = user._id;

    next();
  } catch (err) {
    res.status(401).json({ success: false, error: 'انتهت الجلسة، يرجى إعادة التسجيل' });
  }
};

const adminMiddleware = async (req, res, next) => {
  if (!req.user || String(req.user.telegramId).trim() !== CONFIG.ADMIN_ID) {
    return res.status(403).json({ success: false, error: 'غير مصرح لك بالوصول للوحة التحكم' });
  }
  next();
};

// =========================================================================
// --- Core API Endpoints ---
// =========================================================================

app.all('/api/check-admin', async (req, res) => {
  try {
    let targetUserId = req.body?.userId || req.query?.userId;
    let telegramIdToCheck = null;

    if (targetUserId && mongoose.Types.ObjectId.isValid(targetUserId)) {
      const u = await User.findById(targetUserId).lean();
      if (u) telegramIdToCheck = String(u.telegramId).trim();
    } else if (targetUserId) {
      telegramIdToCheck = String(targetUserId).trim();
    }

    if (!telegramIdToCheck) {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
          const token = authHeader.split(' ')[1];
          const decoded = jwt.verify(token, CONFIG.JWT_SECRET);
          telegramIdToCheck = String(decoded.telegramId).trim();
        } catch (e) {}
      }
    }

    if (!telegramIdToCheck) {
      const initData = req.headers['x-telegram-init-data'];
      const telegramUser = verifyTelegramData(initData);
      if (telegramUser) {
        telegramIdToCheck = String(telegramUser.id).trim();
      }
    }

    const isAdmin = Boolean(telegramIdToCheck && telegramIdToCheck === CONFIG.ADMIN_ID);
    return res.json({ success: true, isAdmin });
  } catch (err) {
    return res.json({ success: true, isAdmin: false });
  }
});

app.post('/api/auth/login', async (req, res, next) => {
  try {
    const initData = req.headers['x-telegram-init-data'];
    const telegramUser = verifyTelegramData(initData);

    const tgId = telegramUser ? String(telegramUser.id) : (process.env.NODE_ENV !== 'production' ? String(req.headers['x-demo-user-id'] || '') : null);
    const { referrerId } = req.body;

    if (!tgId) return res.status(401).json({ success: false, error: 'بيانات الاعتماد الخاصة بتليجرام غير صالحة' });

    const currentUsername = telegramUser?.username || `User_${tgId.slice(-4)}`;
    const userLanguage = telegramUser?.language_code || CONFIG.DEFAULT_LANGUAGE;

    let user = await User.findOne({ telegramId: tgId });
    if (!user) {
      user = await User.create({
        telegramId: tgId,
        username: currentUsername,
        language: userLanguage,
        referredBy: mongoose.Types.ObjectId.isValid(referrerId) ? referrerId : null
      });
    } else {
      let updated = false;
      if (user.username !== currentUsername) { user.username = currentUsername; updated = true; }
      if (!user.language) { user.language = userLanguage; updated = true; }
      if (updated) await user.save();
    }

    if (user.isBanned) return res.status(403).json({ success: false, error: `حسابك معطل بسبب مخالفة الشروط.` });

    const token = jwt.sign(
      { userId: user._id, telegramId: user.telegramId, role: user.role },
      CONFIG.JWT_SECRET,
      { expiresIn: '7d', algorithm: 'HS256' }
    );

    res.json({ 
      success: true, 
      token, 
      user, 
      language: user.language || CONFIG.DEFAULT_LANGUAGE,
      isAdmin: String(user.telegramId).trim() === CONFIG.ADMIN_ID,
      botUsername: CONFIG.BOT_USERNAME,
      supportUsername: CONFIG.SUPPORT_USERNAME,
      botUrl: CONFIG.OFFICIAL_BOT_URL,
      officialChannelUrl: CONFIG.OFFICIAL_CHANNEL_URL,
      supportUrl: CONFIG.TELEGRAM_SUPPORT_URL,
      depositWallets: { bep20: CONFIG.DEPOSIT_USDT_BEP20, trc20: CONFIG.DEPOSIT_USDT_TRC20 }
    });
  } catch (err) {
    next(err);
  }
});

app.get('/api/user/data', authMiddleware, async (req, res, next) => {
  try {
    const userId = req.userId;

    const [rawLinks, withdraws, announcements, ads, deposits] = await Promise.all([
      Link.find({ $or: [{ userId: userId }, { userId: userId.toString() }] }).sort({ createdAt: -1 }).lean(),
      Withdraw.find({ userId: userId }).sort({ createdAt: -1 }).lean(),
      Announcement.find({ $or: [{ isGlobal: true }, { targetUserId: userId }] }).sort({ createdAt: -1 }).lean(),
      Ad.find({ userId: userId }).sort({ createdAt: -1 }).lean(),
      Deposit.find({ userId: userId }).sort({ createdAt: -1 }).lean()
    ]);

    const links = rawLinks.map(link => {
      const totalViews = link.views || 0;
      const validImp = link.validImpressions || 0;
      const invalidImp = link.invalidImpressions || 0;
      const ctr = totalViews > 0 ? ((validImp / totalViews) * 100).toFixed(1) : "0.0";
      return { 
        ...link, 
        ctr, 
        validImpressions: validImp, 
        invalidImpressions: invalidImp,
        shortUrl: `https://${CONFIG.APP_DOMAIN}/r/${link.shortCode}`
      };
    });

    const isAdmin = String(req.user.telegramId).trim() === CONFIG.ADMIN_ID;
    res.json({ 
      success: true,
      user: req.user, 
      language: req.user.language || CONFIG.DEFAULT_LANGUAGE,
      links, withdraws, announcements, ads, deposits, isAdmin,
      botUsername: CONFIG.BOT_USERNAME,
      supportUsername: CONFIG.SUPPORT_USERNAME,
      botUrl: CONFIG.OFFICIAL_BOT_URL,
      officialChannelUrl: CONFIG.OFFICIAL_CHANNEL_URL,
      supportUrl: CONFIG.TELEGRAM_SUPPORT_URL,
      depositWallets: { bep20: CONFIG.DEPOSIT_USDT_BEP20, trc20: CONFIG.DEPOSIT_USDT_TRC20 }
    });
  } catch (err) {
    next(err);
  }
});

// --- Link Shortening Handler ---
const handleShortenLink = async (req, res) => {
  try {
    const userId = req.userId;
    const { title, targetUrl, url } = req.body;
    const cleanUrl = String(targetUrl || url || '').trim();

    if (!cleanUrl || !validUrl.isWebUri(cleanUrl)) {
      return res.status(400).json({ success: false, error: 'الرابط المستهدف غير صالح' });
    }

    if (isPhishingOrMalicious(cleanUrl)) {
      return res.status(400).json({ success: false, error: 'الرابط ينتهك معايير الأمان' });
    }

    const shortCode = crypto.randomBytes(3).toString('hex');
    const publisherTelegramId = req.user?.telegramId || null;
    
    const newLink = new Link({
      userId: userId,
      publisherTelegramId: publisherTelegramId,
      telegramId: publisherTelegramId,
      title: title ? String(title).trim() : 'رابط بدون عنوان',
      targetUrl: cleanUrl,
      shortCode,
      isActive: true
    });

    await newLink.save();
    const shortUrl = `https://${CONFIG.APP_DOMAIN}/r/${shortCode}`;

    return res.json({ success: true, link: { ...newLink.toObject(), shortUrl }, shortUrl });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'حدث خطأ أثناء اختصار الرابط' });
  }
};

app.post('/api/links/shorten', authMiddleware, linkCreationLimiter, handleShortenLink);
app.post('/api/links', authMiddleware, linkCreationLimiter, handleShortenLink);

const getUserLinks = async (userId) => {
  if (!userId) return [];
  const rawLinks = await Link.find({ $or: [{ userId: userId }, { userId: userId.toString() }] }).sort({ createdAt: -1 }).lean();
  return rawLinks.map(link => {
    const totalViews = link.views || 0;
    const validImp = link.validImpressions || 0;
    const ctr = totalViews > 0 ? ((validImp / totalViews) * 100).toFixed(1) : "0.0";
    return { ...link, ctr, shortUrl: `https://${CONFIG.APP_DOMAIN}/r/${link.shortCode}` };
  });
};

app.get('/api/links', authMiddleware, async (req, res, next) => {
  try {
    const links = await getUserLinks(req.userId);
    res.json({ success: true, links });
  } catch (err) { next(err); }
});

app.get('/api/user/links', authMiddleware, async (req, res, next) => {
  try {
    const links = await getUserLinks(req.userId);
    res.json({ success: true, links });
  } catch (err) { next(err); }
});

// --- Bridge & Traffic Engine (Low Latency Click & Impression) ---
app.post('/api/init-click', validateTraffic, async (req, res, next) => {
  try {
    const { linkCode } = req.body;
    const cleanCode = String(linkCode || '').trim();
    if (!cleanCode) return res.status(400).json({ success: false, error: 'كود الرابط مطلوب' });

    let linkData = await safeRedisGet(`link:data:${cleanCode}`);
    let linkId, linkOwnerId, linkOwnerTelegramId;

    if (linkData) {
      const parsed = JSON.parse(linkData);
      linkId = parsed.id;
      linkOwnerId = parsed.userId;
      linkOwnerTelegramId = parsed.publisherTelegramId;
    } else {
      const link = await Link.findOne({ shortCode: cleanCode, isActive: true }).select('_id userId publisherTelegramId').lean();
      if (!link) return res.status(404).json({ success: false, error: 'الرابط غير موجود أو معطل' });
      linkId = link._id.toString();
      linkOwnerId = link.userId.toString();
      linkOwnerTelegramId = link.publisherTelegramId;
      await safeRedisSet(`link:data:${cleanCode}`, JSON.stringify({ id: linkId, userId: linkOwnerId, publisherTelegramId: linkOwnerTelegramId }), 'EX', 3600);
    }

    const bridgeToken = crypto.randomBytes(16).toString('hex');
    const session = await ClickSession.create({ 
      linkId, userId: linkOwnerId, publisherId: linkOwnerId, ip: req.ip, bridgeToken, adSource: 'adsgram'
    });

    await safeRedisSet(`bridge:token:${session._id}`, bridgeToken, 'EX', 300);

    res.json({ 
      success: true,
      sessionId: session._id, 
      bridgeToken, 
      blockId: CONFIG.ADSGRAM_BLOCK_ID,
      adSource: 'adsgram',
      language: CONFIG.DEFAULT_LANGUAGE,
      botUsername: CONFIG.BOT_USERNAME,
      supportUsername: CONFIG.SUPPORT_USERNAME
    });
  } catch (err) {
    next(err);
  }
});

app.post('/api/impression', validateTraffic, clickLimiter, async (req, res, next) => {
  try {
    const { sessionId, bridgeToken } = req.body;
    if (!sessionId || !bridgeToken) {
      return res.status(400).json({ success: false, error: 'رمز الجلسة مفقود' });
    }

    const cachedToken = await safeRedisGet(`bridge:token:${sessionId}`);
    if (cachedToken && cachedToken !== bridgeToken) {
      return res.status(403).json({ success: false, error: 'محاولة تخطي غير مشروعة' });
    }

    const clickSession = await ClickSession.findById(sessionId);
    if (!clickSession || clickSession.ip !== req.ip) {
      return res.status(403).json({ success: false, error: 'الجلسة غير صالحة' });
    }

    const link = await Link.findById(clickSession.linkId).populate('userId');
    await ClickSession.findByIdAndDelete(sessionId);
    await safeRedisDel(`bridge:token:${sessionId}`);

    if (!link) return res.status(404).json({ success: false, error: 'الرابط غير موجود' });

    await Link.findByIdAndUpdate(link._id, { $inc: { views: 1, validImpressions: 1 } });

    res.json({ success: true, targetUrl: link.targetUrl, counted: true });
  } catch (err) {
    next(err);
  }
});

// --- Static HTML Delivery & Fallback ---
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views.html'));
});

app.get(['/app', '/admin', '/r/:code'], (req, res) => {
  res.sendFile(path.join(__dirname, 'views.html'));
});

app.use('/api/*', (req, res) => {
  res.status(404).json({ success: false, error: 'المسار المطلوب غير موجود' });
});

// --- Global Error Handler ---
app.use((err, req, res, next) => {
  logger.error('Unhandled Application Error:', err);
  res.status(err.status || 500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' ? 'حدث خطأ غير متوقع في الخادم' : err.message
  });
});

// تصدير التطبيق ليعمل بسلاسة على Vercel Serverless Functions
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`🚀 Enterprise Server Active on Port ${PORT}`));
}

module.exports = app;
