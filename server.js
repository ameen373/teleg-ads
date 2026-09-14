/**
 * ============================================================================
 * Ultra-Enterprise Autonomous Core (V10 - Superior Next-Gen Architecture)
 * Telega.ads Multi-Tenant Financial Infrastructure & Link Engine
 * Optimized for High-Concurrency, Serverless, Multi-Region & Fraud-Prevention
 * ============================================================================
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
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');

const { 
  User, Ad, Link, Impression, ClickSession, Withdraw, EarningsHold, Deposit, Announcement 
} = require('./models');

const app = express();

// ============================================================================
// 1. ADVANCED CONFIGURATION & IMMUTABLE GUARD
// ============================================================================
const CONFIG = Object.freeze({
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '3000', 10),
  BOT_TOKEN: process.env.BOT_TOKEN || '',
  MONGO_URI: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/shortener',
  ADMIN_ID: String(process.env.ADMIN_ID || '').trim(),
  JWT_SECRET: process.env.JWT_SECRET || 'super_secret_jwt_key_telega_ads_2026_enterprise',
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
  SUPPORT_USERNAME: '@' + (process.env.TELEGRAM_SUPPORT_URL || 'https://t.me/Te_AdsNs_bot').split('/').pop(),
  IS_SERVERLESS: Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME)
});

app.set('trust proxy', 1);

// Security Headers Infrastructure
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(mongoSanitize({ replaceWith: '_' }));
app.use(cors({ origin: true, credentials: true }));
app.options('*', cors());

app.use(express.json({ limit: '30kb' }));
app.use(express.urlencoded({ extended: true, limit: '30kb' }));
app.use(express.static(__dirname));

// Cache-Control & Precision API Response Headers
app.use('/api', (req, res, next) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Powered-By', 'Telega.ads Enterprise Engine V10');
  next();
});

// ============================================================================
// HELPER: URL NORMALIZATION & VALIDATION (UNIVERSAL SUPPORT INCL. T.ME)
// ============================================================================
function normalizeAndValidateUrl(inputUrl) {
  if (!inputUrl || typeof inputUrl !== 'string') return null;
  let clean = inputUrl.trim();
  if (!clean) return null;

  if (!/^https?:\/\//i.test(clean)) {
    clean = 'https://' + clean;
  }

  try {
    const parsed = new URL(clean);
    
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }

    if (!parsed.hostname) {
      return null;
    }

    const isShortTelegram = /^(t\.me|telegram\.me|telegram\.dog)$/i.test(parsed.hostname);
    if (!isShortTelegram && !parsed.hostname.includes('.')) {
      return null;
    }

    return parsed.toString();
  } catch (err) {
    return null;
  }
}

// ============================================================================
// 2. CENTRALIZED ENTERPRISE LOGGING ENGINE (SERVERLESS / VERCEL SAFE)
// ============================================================================
const logger = winston.createLogger({
  level: CONFIG.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    CONFIG.NODE_ENV === 'production'
      ? winston.format.json()
      : winston.format.combine(winston.format.colorize(), winston.format.simple())
  ),
  defaultMeta: { service: 'telega-core-v10' },
  transports: [
    new winston.transports.Console()
  ]
});

app.use(morgan('combined', { stream: { write: (msg) => logger.info(msg.trim()) } }));

// ============================================================================
// 3. HIGH-AVAILABILITY HYBRID CACHE & DISTRIBUTED LOCK ENGINE
// ============================================================================
let redisIsConnected = false;
const inMemoryCache = new Map();

const redis = new Redis(CONFIG.REDIS_URL, {
  maxRetriesPerRequest: 2,
  enableReadyCheck: true,
  lazyConnect: true,
  connectTimeout: 5000,
  retryStrategy: (times) => Math.min(times * 100, 3000)
});

redis.connect().then(() => {
  redisIsConnected = true;
  logger.info('✅ Enterprise Distributed Redis Cluster Active');
}).catch(err => {
  logger.warn('⚠️ Redis Connection Fallback Triggered (In-Memory Engine Active): ' + err.message);
});

redis.on('error', () => { redisIsConnected = false; });
redis.on('reconnecting', () => { redisIsConnected = false; });
redis.on('ready', () => { redisIsConnected = true; });

async function safeRedisGet(key) {
  if (redisIsConnected) {
    try { return await redis.get(key); } catch (e) {}
  }
  const item = inMemoryCache.get(key);
  if (item && item.expiry > Date.now()) return item.value;
  if (item) inMemoryCache.delete(key);
  return null;
}

async function safeRedisSet(key, value, mode, duration) {
  if (redisIsConnected) {
    try {
      if (mode && duration) await redis.set(key, value, mode, duration);
      else await redis.set(key, value);
      return;
    } catch (e) {}
  }
  const expiry = duration ? Date.now() + (duration * 1000) : Date.now() + 3600000;
  inMemoryCache.set(key, { value: String(value), expiry });
}

async function safeRedisDel(key) {
  if (redisIsConnected) {
    try { await redis.del(key); } catch (e) {}
  }
  inMemoryCache.delete(key);
}

async function acquireLock(lockKey, ttlMs = 5000) {
  if (redisIsConnected) {
    try {
      const result = await redis.set(lockKey, 'LOCKED', 'PX', ttlMs, 'NX');
      return result === 'OK';
    } catch (e) {}
  }
  const now = Date.now();
  const lock = inMemoryCache.get(lockKey);
  if (lock && lock.expiry > now) return false;
  inMemoryCache.set(lockKey, { value: 'LOCKED', expiry: now + ttlMs });
  return true;
}

async function releaseLock(lockKey) {
  await safeRedisDel(lockKey);
}

function roundMoney(value, decimals = 4) {
  const factor = Math.pow(10, decimals);
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

// ============================================================================
// 4. ENTERPRISE DATABASE INFRASTRUCTURE & TRANSACTION WRAPPER
// ============================================================================
let isReplicaSet = false;
let dbConnectingPromise = null;

async function connectDB() {
  if (mongoose.connection.readyState === 1) return;
  if (dbConnectingPromise) return dbConnectingPromise;

  dbConnectingPromise = (async () => {
    try {
      await mongoose.connect(CONFIG.MONGO_URI, {
        maxPoolSize: CONFIG.IS_SERVERLESS ? 10 : 100,
        minPoolSize: CONFIG.IS_SERVERLESS ? 1 : 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      });
      logger.info('✅ Connected to MongoDB Enterprise Cluster');

      try {
        const admin = mongoose.connection.db.admin();
        const status = await admin.command({ replSetGetStatus: 1 });
        isReplicaSet = Boolean(status && status.ok);
      } catch (e) {
        isReplicaSet = false;
      }
    } catch (err) {
      logger.error('❌ Database Critical Error:', err);
      throw err;
    } finally {
      dbConnectingPromise = null;
    }
  })();

  return dbConnectingPromise;
}

connectDB().catch(() => {});

async function executeTransaction(fn) {
  if (isReplicaSet) {
    const session = await mongoose.startSession();
    try {
      session.startTransaction();
      const result = await fn(session);
      await session.commitTransaction();
      return result;
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }
  } else {
    return await fn(null);
  }
}

app.use(async (req, res, next) => {
  if (mongoose.connection.readyState !== 1) {
    try {
      await connectDB();
    } catch (e) {
      return res.status(503).json({ success: false, error: 'الخدمة جاري تهيئتها، تعذر الاتصال بقاعدة البيانات. يرجى إعادة المحاولة' });
    }
  }
  next();
});

// ============================================================================
// 5. SECURITY, ANTI-FRAUD & INTEGRITY UTILITIES
// ============================================================================
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
    logger.error(`⚠️ Telegram Notification Delivery Failed [${telegramId}]: ${err.message}`);
  }
}

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
      const parsedUser = userParam ? JSON.parse(userParam) : null;
      const authDate = parseInt(urlParams.get('auth_date') || '0', 10);
      
      if (authDate && (Math.floor(Date.now() / 1000) - authDate > 86400)) {
        return null;
      }
      return parsedUser;
    }
    return null;
  } catch (err) {
    return null;
  }
}

const isPhishingOrMalicious = (url) => {
  const blacklistedKeywords = [
    'phish', 'login-verify', 'free-telegram-premium', 'grabber', 
    'stealer', 'iplogger', 'gift-telegram', 'claim-drop', 'bit.ly', 'tinyurl',
    'account-checker', 'session-thief'
  ];
  const lowerUrl = url.toLowerCase();
  return blacklistedKeywords.some(keyword => lowerUrl.includes(keyword));
};

// ============================================================================
// 6. ENTERPRISE RATE LIMITING & SECURITY MIDDLEWARES
// ============================================================================
const linkCreationLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 150,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'تم تجاوز الحد اليومي المسموح به لإنشاء الروابط' }
});

const clickLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
  message: { success: false, error: 'معدل طلبات مرتفع، يرجى الانتظار قليلاً' }
});

const validateTraffic = (req, res, next) => {
  const ua = req.get('User-Agent') || '';
  const botPattern = /bot|crawler|spider|datacenter|proxy|httpclient|curl|python|axios|headless|selenium|puppeteer|go-http-client/i;
  if (botPattern.test(ua)) {
    return res.status(403).json({ success: false, error: 'تم رفض الزيارة (Automated Bot Traffic Rejected)' });
  }
  next();
};

const telegramAuthMiddleware = async (req, res, next) => {
  try {
    let user = null;
    const initData = req.headers['x-telegram-init-data'] || req.body?.initData || req.query?.initData;
    const authHeader = req.headers.authorization;

    if (initData) {
      const telegramUser = verifyTelegramData(initData);
      if (telegramUser && telegramUser.id) {
        const tgId = String(telegramUser.id);
        const currentUsername = telegramUser.username || `User_${tgId.slice(-4)}`;
        const userLanguage = telegramUser.language_code || CONFIG.DEFAULT_LANGUAGE;

        user = await User.findOneAndUpdate(
          { telegramId: tgId },
          { 
            $setOnInsert: { 
              telegramId: tgId, 
              language: userLanguage,
              availableBalance: 0,
              pendingBalance: 0,
              referralEarnings: 0
            },
            $set: { username: currentUsername }
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
      }
    }

    if (!user && authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
        const decoded = jwt.verify(token, CONFIG.JWT_SECRET);
        user = await User.findById(decoded.userId);
      } catch (err) {}
    }

    if (!user) {
      const fallbackUserId = req.body?.userId || req.query?.userId;
      const fallbackTelegramId = req.body?.telegramId || req.query?.telegramId;

      if (fallbackUserId && mongoose.Types.ObjectId.isValid(fallbackUserId)) {
        user = await User.findById(fallbackUserId);
      } else if (fallbackTelegramId) {
        const tgId = String(fallbackTelegramId);
        user = await User.findOneAndUpdate(
          { telegramId: tgId },
          { 
            $setOnInsert: { 
              telegramId: tgId, 
              username: `User_${tgId.slice(-4)}`,
              language: CONFIG.DEFAULT_LANGUAGE,
              availableBalance: 0,
              pendingBalance: 0,
              referralEarnings: 0
            } 
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
      }
    }

    if (!user) {
      return res.status(401).json({ 
        success: false, 
        error: 'فشل التوثيق: تعذر استخراج Telegram initData أو معرف المستخدم userId' 
      });
    }

    if (user.isBanned) {
      return res.status(403).json({ success: false, error: `حسابك معطل حالياً بسبب مخالفة السياسات. الدعم: ${CONFIG.SUPPORT_USERNAME}` });
    }

    req.user = user;
    req.userId = user._id;
    req.telegramId = user.telegramId;

    next();
  } catch (err) {
    logger.error('Error in Auth Middleware:', err);
    res.status(401).json({ success: false, error: 'حدث خطأ أثناء التوثيق، يرجى إعادة التشغيل' });
  }
};

const adminMiddleware = async (req, res, next) => {
  if (!req.user || !CONFIG.ADMIN_ID || String(req.user.telegramId).trim() !== CONFIG.ADMIN_ID) {
    return res.status(403).json({ success: false, error: 'غير مصرح لك بالدعم أو الوصول لهذه اللوحة' });
  }
  next();
};

// ============================================================================
// 7. HIGH-SPEED AUTHENTICATION & CORE API ENDPOINTS
// ============================================================================

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

    const isAdmin = Boolean(CONFIG.ADMIN_ID && telegramIdToCheck && telegramIdToCheck === CONFIG.ADMIN_ID);
    return res.json({ success: true, isAdmin });
  } catch (err) {
    return res.json({ success: true, isAdmin: false });
  }
});

app.post('/api/auth/login', async (req, res, next) => {
  try {
    const initData = req.headers['x-telegram-init-data'] || req.body?.initData;
    const telegramUser = verifyTelegramData(initData);

    const tgId = telegramUser ? String(telegramUser.id) : (CONFIG.NODE_ENV !== 'production' ? String(req.headers['x-demo-user-id'] || req.body?.telegramId || '') : null);
    const { referrerId } = req.body;

    if (!tgId) return res.status(401).json({ success: false, error: 'بيانات اعتماد تليجرام المرفقة غير صالحة' });

    const currentUsername = telegramUser?.username || `User_${tgId.slice(-4)}`;
    const userLanguage = telegramUser?.language_code || CONFIG.DEFAULT_LANGUAGE;

    const user = await User.findOneAndUpdate(
      { telegramId: tgId },
      {
        $setOnInsert: {
          telegramId: tgId,
          language: userLanguage,
          referredBy: mongoose.Types.ObjectId.isValid(referrerId) ? referrerId : null,
          availableBalance: 0,
          pendingBalance: 0,
          referralEarnings: 0
        },
        $set: { username: currentUsername }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    if (user.isBanned) return res.status(403).json({ success: false, error: `الحساب معطل لمخالفة الشروط. تواصل مع الدعم: ${CONFIG.SUPPORT_USERNAME}` });

    const token = jwt.sign(
      { userId: user._id, telegramId: user.telegramId, role: user.role },
      CONFIG.JWT_SECRET,
      { expiresIn: '14d', algorithm: 'HS256' }
    );

    res.json({ 
      success: true, 
      token, 
      user, 
      language: user.language || CONFIG.DEFAULT_LANGUAGE,
      isAdmin: Boolean(CONFIG.ADMIN_ID && String(user.telegramId).trim() === CONFIG.ADMIN_ID),
      botUsername: CONFIG.BOT_USERNAME,
      supportUsername: CONFIG.SUPPORT_USERNAME,
      botUrl: CONFIG.OFFICIAL_BOT_URL,
      officialChannelUrl: CONFIG.OFFICIAL_CHANNEL_URL,
      supportUrl: CONFIG.TELEGRAM_SUPPORT_URL,
      depositWallets: {
        bep20: CONFIG.DEPOSIT_USDT_BEP20,
        trc20: CONFIG.DEPOSIT_USDT_TRC20
      }
    });
  } catch (err) {
    next(err);
  }
});

app.get('/api/user/data', telegramAuthMiddleware, async (req, res, next) => {
  try {
    const userId = req.userId;

    const [rawLinks, withdraws, announcements, ads, deposits] = await Promise.all([
      Link.find({ userId: userId }).sort({ createdAt: -1 }).lean(),
      Withdraw.find({ userId: userId }).sort({ createdAt: -1 }).lean(),
      Announcement.find({ $or: [{ isGlobal: true }, { targetUserId: userId }] }).sort({ createdAt: -1 }).lean(),
      Ad.find({ userId: userId }).sort({ createdAt: -1 }).lean(),
      Deposit.find({ userId: userId }).sort({ createdAt: -1 }).lean()
    ]);

    const links = rawLinks.map(link => {
      const totalViews = Number(link.views || 0);
      const validImp = Number(link.validImpressions || 0);
      const invalidImp = Number(link.invalidImpressions || 0);
      const ctr = totalViews > 0 ? ((validImp / totalViews) * 100).toFixed(1) : "0.0";
      const code = String(link.shortCode || '').trim();

      return { 
        _id: String(link._id),
        id: String(link._id),
        userId: String(link.userId),
        title: String(link.title || 'رابط بدون عنوان'),
        targetUrl: String(link.targetUrl || ''),
        shortCode: code,
        shortUrl: `https://${CONFIG.APP_DOMAIN}/r/${code}`,
        views: totalViews,
        validImpressions: validImp,
        invalidImpressions: invalidImp,
        isActive: Boolean(link.isActive),
        ctr: String(ctr),
        createdAt: link.createdAt
      };
    });

    const isAdmin = Boolean(CONFIG.ADMIN_ID && String(req.user.telegramId).trim() === CONFIG.ADMIN_ID);
    res.json({ 
      success: true,
      user: req.user, 
      language: req.user.language || CONFIG.DEFAULT_LANGUAGE,
      links, 
      withdraws, 
      announcements, 
      ads, 
      deposits, 
      isAdmin,
      botUsername: CONFIG.BOT_USERNAME,
      supportUsername: CONFIG.SUPPORT_USERNAME,
      botUrl: CONFIG.OFFICIAL_BOT_URL,
      officialChannelUrl: CONFIG.OFFICIAL_CHANNEL_URL,
      supportUrl: CONFIG.TELEGRAM_SUPPORT_URL,
      depositWallets: {
        bep20: CONFIG.DEPOSIT_USDT_BEP20,
        trc20: CONFIG.DEPOSIT_USDT_TRC20
      }
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// 8. FINANCIAL TRANSACTION ENGINE & AD MATRIX
// ============================================================================

app.post('/api/ads', telegramAuthMiddleware, async (req, res, next) => {
  const lockKey = `lock:ads:${req.userId}`;
  const locked = await acquireLock(lockKey);
  if (!locked) return res.status(429).json({ success: false, error: 'طلب قيد المعالجة، يرجى الانتظار ثوانٍ' });

  try {
    const { title, targetUrl, totalBudget } = req.body;
    const budget = roundMoney(totalBudget);

    if (!title || String(title).trim().length === 0) {
      return res.status(400).json({ success: false, error: 'اسم الحملة الإعلانية مطلوب' });
    }

    const validatedUrl = normalizeAndValidateUrl(targetUrl);
    if (!validatedUrl) {
      return res.status(400).json({ success: false, error: 'رابط الإعلان المستهدف غير صالح' });
    }

    if (isNaN(budget) || budget < 5) {
      return res.status(400).json({ success: false, error: 'الحد الأدنى لإنشاء حملة إعلانية هو $5' });
    }

    const createdAd = await executeTransaction(async (session) => {
      const updatedUser = await User.findOneAndUpdate(
        { _id: req.userId, availableBalance: { $gte: budget } },
        { $inc: { availableBalance: -budget } },
        { new: true, session }
      );

      if (!updatedUser) {
        throw new Error('رصيدك المتاح لا يكفي لإنشاء الحملة (الحد الأدنى $5)');
      }

      const ads = await Ad.create([{
        userId: req.userId,
        advertiserId: req.userId,
        advertiserTelegramId: req.user.telegramId,
        title: String(title).trim(),
        targetUrl: validatedUrl,
        totalBudget: budget,
        remainingBudget: budget,
        cpmRate: 1.50,
        costPerImpression: 0.0015,
        publisherEarningsPerImpression: 0.00135,
        platformFeePerImpression: 0.00015,
        status: 'active'
      }], { session });

      return ads[0];
    });

    res.json({ success: true, ad: createdAd });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message || 'فشل إنشاء الحملة الإعلانية' });
  } finally {
    await releaseLock(lockKey);
  }
});

app.get('/api/user/ads', telegramAuthMiddleware, async (req, res, next) => {
  try {
    const ads = await Ad.find({ userId: req.userId }).sort({ createdAt: -1 }).lean();
    res.json({ success: true, ads });
  } catch (err) {
    next(err);
  }
});

app.post('/api/ads/toggle', telegramAuthMiddleware, async (req, res, next) => {
  try {
    const { adId } = req.body;
    if (!mongoose.Types.ObjectId.isValid(adId)) return res.status(400).json({ success: false, error: 'معرف الإعلان غير صالح' });

    const ad = await Ad.findOne({ _id: adId, userId: req.userId });
    if (!ad) return res.status(404).json({ success: false, error: 'الإعلان غير موجود أو لا تملكه' });

    if (ad.status === 'completed') {
      return res.status(400).json({ success: false, error: 'الحملة مكملة ونفدت ميزانيتها بالفعل' });
    }

    ad.status = ad.status === 'active' ? 'paused' : 'active';
    await ad.save();

    res.json({ success: true, status: ad.status });
  } catch (err) {
    next(err);
  }
});

app.post('/api/deposit', telegramAuthMiddleware, async (req, res, next) => {
  try {
    const { amount, network, txid } = req.body;
    const numAmount = roundMoney(amount);
    const cleanNetwork = String(network || '').toUpperCase();
    const cleanTxid = String(txid || '').trim();

    if (isNaN(numAmount) || numAmount < 1) {
      return res.status(400).json({ success: false, error: 'الحد الأدنى للإيداع هو $1' });
    }

    if (!['BEP20', 'TRC20', 'TON'].includes(cleanNetwork)) {
      return res.status(400).json({ success: false, error: 'شبكة تحويل غير مدعومة (اختر BEP20, TRC20, TON)' });
    }

    if (!cleanTxid || cleanTxid.length < 8) {
      return res.status(400).json({ success: false, error: 'يرجى إدخال هاش المعاملة الصحيح (TxID)' });
    }

    const existingDeposit = await Deposit.findOne({ txid: cleanTxid });
    if (existingDeposit) {
      return res.status(400).json({ success: false, error: 'تم استخدام رمز TxID هذا في طلب سابق' });
    }

    const deposit = await Deposit.create({
      userId: req.userId,
      advertiserId: req.userId,
      advertiserTelegramId: req.user.telegramId,
      amount: numAmount,
      network: cleanNetwork,
      txid: cleanTxid,
      status: 'pending'
    });

    if (CONFIG.ADMIN_ID) {
      sendTelegramNotification(
        CONFIG.ADMIN_ID,
        `💳 <b>طلب إيداع جديد!</b>\nالمستخدم: <code>${req.user.username}</code>\nالمبلغ: <code>$${numAmount}</code>\nالشبكة: <code>${cleanNetwork}</code>\nTxID: <code>${cleanTxid}</code>`
      );
    }

    res.json({ success: true, deposit });
  } catch (err) {
    next(err);
  }
});

app.post('/api/withdraw', telegramAuthMiddleware, async (req, res, next) => {
  const lockKey = `lock:withdraw:${req.userId}`;
  const locked = await acquireLock(lockKey);
  if (!locked) return res.status(429).json({ success: false, error: 'جاري معالجة طلب سحب آخر حالياً' });

  try {
    const { amount, network, walletAddress } = req.body;
    const numAmt = roundMoney(amount);
    const cleanNetwork = String(network || '').toUpperCase();
    const cleanWallet = String(walletAddress || '').trim();
    const FEE = 3;

    if (isNaN(numAmt) || numAmt < 30) {
      return res.status(400).json({ success: false, error: 'الحد الأدنى المسموح به للسحب هو $30' });
    }

    if (!['BEP20', 'TRC20', 'TON'].includes(cleanNetwork)) {
      return res.status(400).json({ success: false, error: 'شبكة سحب غير صالحة' });
    }

    if (!cleanWallet || cleanWallet.length < 10) {
      return res.status(400).json({ success: false, error: 'عنوان المحفظة المدخل غير صالح' });
    }

    const activePending = await Withdraw.findOne({ userId: req.userId, status: 'pending' });
    if (activePending) {
      return res.status(400).json({ success: false, error: 'لديك طلب سحب معلق قيد المراجعة بالفعل' });
    }

    const netAmount = roundMoney(numAmt - FEE);

    const withdrawRequest = await executeTransaction(async (session) => {
      const updatedUser = await User.findOneAndUpdate(
        { _id: req.userId, availableBalance: { $gte: numAmt } },
        { $inc: { availableBalance: -numAmt }, defaultWallet: cleanWallet },
        { new: true, session }
      );

      if (!updatedUser) {
        throw new Error('رصيدك المتاح لا يكفي لإتمام عملية السحب');
      }

      const resArr = await Withdraw.create([{
        userId: req.userId,
        telegramId: req.user.telegramId,
        amount: numAmt,
        fee: FEE,
        netAmount: netAmount,
        network: cleanNetwork,
        walletAddress: cleanWallet,
        status: 'pending'
      }], { session });

      return resArr[0];
    });

    sendTelegramNotification(
      req.user.telegramId,
      `🔔 <b>تم تقديم طلب السحب بنجاح!</b>\nالمبلغ: <code>$${numAmt}</code>\nالرسوم: <code>$${FEE}</code>\nالصافي: <code>$${netAmount}</code>\nالشبكة: <code>${cleanNetwork}</code>\nالمحفظة: <code>${cleanWallet}</code>\nالحالة: ⏳ قيد المراجعة\n\nالدعم: ${CONFIG.SUPPORT_USERNAME}`
    );

    res.json({ success: true, withdraw: withdrawRequest });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message || 'حدث خطأ أثناء معالجة السحب' });
  } finally {
    await releaseLock(lockKey);
  }
});

// ============================================================================
// 9. HIGH-PERFORMANCE TRAFFIC ROUTER & ANTI-FRAUD IMPRESSION ENGINE
// ============================================================================

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
      const link = await Link.findOne({ shortCode: cleanCode, isActive: true }).select('_id userId publisherTelegramId telegramId').lean();
      if (!link) return res.status(404).json({ success: false, error: 'الرابط غير موجود أو تم تعطيله' });
      linkId = link._id.toString();
      linkOwnerId = link.userId.toString();
      linkOwnerTelegramId = link.publisherTelegramId || link.telegramId;
      await safeRedisSet(`link:data:${cleanCode}`, JSON.stringify({ id: linkId, userId: linkOwnerId, publisherTelegramId: linkOwnerTelegramId }), 'EX', 3600);
    }

    await ClickSession.deleteMany({ linkId, ip: req.ip });

    const activeAds = await Ad.aggregate([
      { 
        $match: { 
          status: 'active', 
          remainingBudget: { $gte: 0.0015 },
          userId: { $ne: new mongoose.Types.ObjectId(linkOwnerId) }
        } 
      },
      { $sample: { size: 1 } }
    ]);

    let adSource = 'adsgram';
    let selectedAd = null;

    if (activeAds && activeAds.length > 0) {
      adSource = 'internal';
      selectedAd = activeAds[0];
    }

    const bridgeToken = crypto.randomBytes(16).toString('hex');
    const session = await ClickSession.create({ 
      linkId, 
      userId: linkOwnerId,
      publisherId: linkOwnerId,
      ip: req.ip, 
      bridgeToken,
      adSource,
      adId: selectedAd ? selectedAd._id : null 
    });

    await safeRedisSet(`bridge:token:${session._id}`, bridgeToken, 'EX', 300);

    res.json({ 
      success: true,
      sessionId: session._id, 
      bridgeToken, 
      blockId: CONFIG.ADSGRAM_BLOCK_ID,
      adSource,
      language: CONFIG.DEFAULT_LANGUAGE,
      officialBotUrl: CONFIG.OFFICIAL_BOT_URL,
      officialChannelUrl: CONFIG.OFFICIAL_CHANNEL_URL,
      telegramSupportUrl: CONFIG.TELEGRAM_SUPPORT_URL,
      botUsername: CONFIG.BOT_USERNAME,
      supportUsername: CONFIG.SUPPORT_USERNAME,
      adData: selectedAd ? {
        id: selectedAd._id,
        title: selectedAd.title,
        targetUrl: selectedAd.targetUrl
      } : null
    });
  } catch (err) {
    next(err);
  }
});

app.post('/api/impression', validateTraffic, clickLimiter, async (req, res, next) => {
  try {
    const { sessionId, bridgeToken, duration } = req.body;
    if (!sessionId || !bridgeToken) {
      return res.status(400).json({ success: false, error: 'رمز حماية الجلسة مفقود' });
    }

    const cachedToken = await safeRedisGet(`bridge:token:${sessionId}`);
    if (cachedToken && cachedToken !== bridgeToken) {
      return res.status(403).json({ success: false, error: 'محاولة تجاوز الجلسة مرفوضة' });
    }

    const result = await executeTransaction(async (session) => {
      const clickSession = await ClickSession.findById(sessionId).session(session);
      if (!clickSession || clickSession.ip !== req.ip) {
        throw new Error('INVALID_SESSION');
      }

      const dwellTime = Date.now() - new Date(clickSession.createdAt).getTime();
      if (dwellTime < 4800 && (Number(duration) || 0) < 5) {
        throw new Error('DWELL_TIME_NOT_MET');
      }

      let dailyIpClicks = 1;
      if (redisIsConnected) {
        const dailyIpClickKey = `daily:ip:${req.ip}`;
        dailyIpClicks = await redis.incr(dailyIpClickKey);
        if (dailyIpClicks === 1) {
          await redis.expire(dailyIpClickKey, 86400);
        }
      }

      const lockKey = `imp:${clickSession.linkId}:${req.ip}`;
      const isDuplicate = await safeRedisGet(lockKey);

      const link = await Link.findById(clickSession.linkId).populate('userId').session(session);
      await ClickSession.findByIdAndDelete(sessionId).session(session);
      await safeRedisDel(`bridge:token:${sessionId}`);

      if (!link) {
        throw new Error('LINK_NOT_FOUND');
      }

      if (isDuplicate || dailyIpClicks > 25) {
        await Link.findByIdAndUpdate(link._id, { $inc: { views: 1, invalidImpressions: 1 } }, { session });
        return { targetUrl: link.targetUrl, counted: false };
      }

      await safeRedisSet(lockKey, '1', 'EX', 86400);

      await Impression.create([{
        linkId: link._id,
        userId: link.userId._id,
        publisherId: link.userId._id,
        publisherTelegramId: link.userId.telegramId,
        adSource: clickSession.adSource,
        adId: clickSession.adId,
        publisherEarnings: clickSession.adSource === 'internal' ? 0.00135 : 0,
        ip: req.ip,
        userAgent: req.get('User-Agent') || ''
      }], { session });

      await Link.findByIdAndUpdate(link._id, { $inc: { views: 1, validImpressions: 1 } }, { session });

      if (clickSession.adSource === 'internal' && clickSession.adId) {
        const ad = await Ad.findById(clickSession.adId).session(session);
        
        if (ad && ad.remainingBudget >= 0.0015 && ad.status === 'active') {
          const costPerImpression = ad.costPerImpression || 0.0015;
          let publisherShare = ad.publisherEarningsPerImpression || 0.00135;
          
          ad.remainingBudget = roundMoney(Math.max(0, ad.remainingBudget - costPerImpression));
          ad.impressionsCount += 1;
          if (ad.remainingBudget < costPerImpression) {
            ad.status = 'completed';
          }
          await ad.save({ session });

          if (link.userId && link.userId.referredBy) {
            const refBonus = roundMoney(publisherShare * 0.10, 5);
            publisherShare = roundMoney(publisherShare - refBonus, 5);

            await User.findByIdAndUpdate(
              link.userId.referredBy,
              { $inc: { availableBalance: refBonus, referralEarnings: refBonus } },
              { session }
            );
          }

          await User.findByIdAndUpdate(
            link.userId._id,
            { $inc: { pendingBalance: publisherShare } },
            { session }
          );

          const releaseDate = new Date();
          releaseDate.setDate(releaseDate.getDate() + 1);
          await EarningsHold.create([{
            userId: link.userId._id,
            telegramId: link.userId.telegramId,
            amount: publisherShare,
            releaseAt: releaseDate
          }], { session });
        }
      }

      return { targetUrl: link.targetUrl, counted: true };
    });

    res.json({ success: true, targetUrl: result.targetUrl, counted: result.counted });
  } catch (err) {
    if (err.message === 'INVALID_SESSION') return res.status(403).json({ success: false, error: 'جلسة غير صالحة' });
    if (err.message === 'DWELL_TIME_NOT_MET') return res.status(400).json({ success: false, error: 'لم يتم استيفاء وقت الانتظار الأدنى (5 ثوانٍ)' });
    if (err.message === 'LINK_NOT_FOUND') return res.status(404).json({ success: false, error: 'الرابط المطلوب غير موجود' });
    next(err);
  }
});

// ============================================================================
// 10. ADVANCED LINK SHORTENING MANAGEMENT ENGINE (ROBUST & RESILIENT)
// ============================================================================

/**
 * معالج إنشاء واختصار الرابط المحسّن بالكامل
 */
const handleShortenLink = async (req, res) => {
  try {
    // 1. التأكد من حالة الاتصال بقاعدة البيانات
    if (mongoose.connection.readyState !== 1) {
      await connectDB();
    }

    // 2. استخراج التوثيق أو الإنشاء الفوري للمستخدم إن لم يكن موجوداً
    let userId = req.userId || req.user?._id;
    let telegramId = req.telegramId || req.user?.telegramId;

    if (!userId) {
      const initData = req.headers['x-telegram-init-data'] || req.body?.initData || req.query?.initData;
      const fallbackTelegramId = req.body?.telegramId || req.query?.telegramId;
      let tgId = null;
      let tgUsername = null;
      let tgLang = CONFIG.DEFAULT_LANGUAGE;

      if (initData) {
        const parsedUser = verifyTelegramData(initData);
        if (parsedUser && parsedUser.id) {
          tgId = String(parsedUser.id);
          tgUsername = parsedUser.username || `User_${tgId.slice(-4)}`;
          tgLang = parsedUser.language_code || CONFIG.DEFAULT_LANGUAGE;
        }
      }

      if (!tgId && fallbackTelegramId) {
        tgId = String(fallbackTelegramId);
        tgUsername = `User_${tgId.slice(-4)}`;
      }

      if (tgId) {
        const user = await User.findOneAndUpdate(
          { telegramId: tgId },
          {
            $setOnInsert: {
              telegramId: tgId,
              language: tgLang,
              availableBalance: 0,
              pendingBalance: 0,
              referralEarnings: 0
            },
            $set: {
              username: tgUsername || `User_${tgId.slice(-4)}`
            }
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        userId = user._id;
        telegramId = user.telegramId;
      }
    }

    if (!userId) {
      return res.status(401).json({ success: false, error: 'غير مصرح: معرف المستخدم مفقود' });
    }

    // 3. استخراج الرابط واختبار كافة الأسماء المحتملة في req.body
    const { title, targetUrl, url, link, originalUrl } = req.body || {};
    const rawUrl = String(targetUrl || url || link || originalUrl || '').trim();

    if (!rawUrl) {
      return res.status(400).json({ success: false, error: 'يرجى إدخال الرابط المراد اختصاره' });
    }

    // 4. التحقق من صحة وصلاحية الرابط المدخل
    const cleanUrl = normalizeAndValidateUrl(rawUrl);
    if (!cleanUrl) {
      return res.status(400).json({ success: false, error: 'الرابط المستهدف غير صالح، يرجى التأكد من كتابته بشكل صحيح' });
    }

    // 5. فحص الروابط المشبوهة
    if (isPhishingOrMalicious(cleanUrl)) {
      return res.status(400).json({ success: false, error: 'الرابط مخالف لشروط وأحكام الاستخدام' });
    }

    // 6. منع اختصار روابط النطاق الخاص بالمنصة
    try {
      const domainCheck = new URL(cleanUrl).hostname;
      if (domainCheck.includes(CONFIG.APP_DOMAIN)) {
        return res.status(400).json({ success: false, error: 'لا يمكن اختصار روابط المنصة نفسها' });
      }
    } catch (e) {}

    // 7. توليد كود فريد ومقاوم للتصادامات (Collision Prevention)
    let shortCode = '';
    let isUnique = false;
    let attempts = 0;

    while (!isUnique && attempts < 10) {
      attempts++;
      const byteLen = attempts > 5 ? 5 : 3;
      shortCode = crypto.randomBytes(byteLen).toString('hex');
      
      const existingLink = await Link.findOne({ shortCode }).lean();
      if (!existingLink) {
        isUnique = true;
      }
    }

    if (!isUnique) {
      shortCode = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
    }

    // 8. حفظ الرابط في قاعدة البيانات
    const newLink = await Link.create({
      userId: userId,
      publisherTelegramId: telegramId ? String(telegramId) : null,
      telegramId: telegramId ? String(telegramId) : null,
      title: title ? String(title).trim() : 'رابط بدون عنوان',
      targetUrl: cleanUrl,
      shortCode: shortCode,
      isActive: true,
      views: 0,
      validImpressions: 0,
      invalidImpressions: 0
    });

    // تحديث إحصائيات الروابط المنشأة للمستخدم
    await User.findByIdAndUpdate(userId, { $inc: { 'statsSummary.totalLinksCreated': 1 } }).catch(() => {});

    const shortUrl = `https://${CONFIG.APP_DOMAIN}/r/${shortCode}`;

    // 9. كائن الاستجابة المنظم للواجهة الأمامية
    const formattedLink = {
      _id: String(newLink._id),
      id: String(newLink._id),
      userId: String(newLink.userId),
      title: String(newLink.title),
      targetUrl: String(newLink.targetUrl),
      shortCode: String(newLink.shortCode),
      shortUrl: String(shortUrl),
      views: 0,
      validImpressions: 0,
      invalidImpressions: 0,
      isActive: Boolean(newLink.isActive),
      ctr: "0.0",
      createdAt: newLink.createdAt
    };

    return res.json({ 
      success: true, 
      link: formattedLink,
      shortUrl: String(shortUrl)
    });

  } catch (err) {
    logger.error('❌ Error in Link Creation Engine (Shorten API):', err);
    return res.status(500).json({ 
      success: false, 
      error: `حدث خطأ أثناء اختصار الرابط: ${err.message || 'خطأ غير معروف في قاعدة البيانات'}`
    });
  }
};

app.post('/api/shorten', telegramAuthMiddleware, linkCreationLimiter, handleShortenLink);
app.post('/api/links/shorten', telegramAuthMiddleware, linkCreationLimiter, handleShortenLink);
app.post('/api/links', telegramAuthMiddleware, linkCreationLimiter, handleShortenLink);

const getUserLinks = async (userId) => {
  if (!userId) return [];

  const rawLinks = await Link.find({ userId: userId }).sort({ createdAt: -1 }).lean();

  return rawLinks.map(link => {
    const totalViews = Number(link.views || 0);
    const validImp = Number(link.validImpressions || 0);
    const invalidImp = Number(link.invalidImpressions || 0);
    const ctr = totalViews > 0 ? ((validImp / totalViews) * 100).toFixed(1) : "0.0";
    const code = String(link.shortCode || '').trim();

    return { 
      _id: String(link._id),
      id: String(link._id),
      userId: String(link.userId),
      title: String(link.title || 'رابط بدون عنوان'),
      targetUrl: String(link.targetUrl || ''),
      shortCode: code,
      shortUrl: `https://${CONFIG.APP_DOMAIN}/r/${code}`,
      views: totalViews,
      validImpressions: validImp,
      invalidImpressions: invalidImp,
      isActive: Boolean(link.isActive),
      ctr: String(ctr),
      createdAt: link.createdAt
    };
  });
};

app.get('/api/my-links', telegramAuthMiddleware, async (req, res, next) => {
  try {
    const links = await getUserLinks(req.userId);
    res.json({ success: true, links });
  } catch (err) {
    res.status(500).json({ success: false, error: 'فشل جلب الروابط من قاعدة البيانات' });
  }
});

app.get('/api/links', telegramAuthMiddleware, async (req, res, next) => {
  try {
    const links = await getUserLinks(req.userId);
    res.json({ success: true, links });
  } catch (err) {
    res.status(500).json({ success: false, error: 'فشل جلب الروابط من قاعدة البيانات' });
  }
});

app.get('/api/user/links', telegramAuthMiddleware, async (req, res, next) => {
  try {
    const links = await getUserLinks(req.userId);
    res.json({ success: true, links });
  } catch (err) {
    res.status(500).json({ success: false, error: 'فشل جلب الروابط من قاعدة البيانات' });
  }
});

app.post('/api/links/toggle', telegramAuthMiddleware, async (req, res, next) => {
  try {
    const { linkId } = req.body;
    const userId = req.userId;

    if (!userId) return res.status(401).json({ success: false, error: 'معرف المستخدم مفقود' });
    if (!mongoose.Types.ObjectId.isValid(linkId)) return res.status(400).json({ success: false, error: 'معرف الرابط غير صالح' });

    const link = await Link.findOne({ _id: linkId, userId: userId });
    if (!link) return res.status(404).json({ success: false, error: 'الرابط غير موجود أو لا تملك صلاحية التعديل' });

    link.isActive = !link.isActive;
    await link.save();
    await safeRedisDel(`link:data:${link.shortCode}`);

    res.json({ success: true, isActive: link.isActive });
  } catch (err) {
    res.status(500).json({ success: false, error: 'فشل في تغيير حالة الرابط' });
  }
});

app.post('/api/user/settings', telegramAuthMiddleware, async (req, res, next) => {
  try {
    const { defaultWallet, language } = req.body;
    const updateData = {};
    
    if (defaultWallet !== undefined) updateData.defaultWallet = String(defaultWallet).trim();
    if (language !== undefined) updateData.language = String(language).trim().toLowerCase() || CONFIG.DEFAULT_LANGUAGE;

    await User.findByIdAndUpdate(req.userId, updateData);
    res.json({ success: true, message: 'تم تحديث البيانات بنجاح' });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// 11. ADMIN EXECUTIVE CONTROL SUITE
// ============================================================================

app.get('/api/admin/dashboard-data', telegramAuthMiddleware, adminMiddleware, async (req, res, next) => {
  try {
    const [withdraws, deposits, users, stats, totalAds] = await Promise.all([
      Withdraw.find().populate('userId').sort({ createdAt: -1 }).lean(),
      Deposit.find().populate('advertiserId').sort({ createdAt: -1 }).lean(),
      User.find().sort({ createdAt: -1 }).limit(100).lean(),
      User.aggregate([
        { $group: { _id: null, totalPending: { $sum: "$pendingBalance" }, totalAvailable: { $sum: "$availableBalance" }, totalUsers: { $sum: 1 } } }
      ]),
      Ad.countDocuments()
    ]);

    res.json({ success: true, withdraws, deposits, users, stats: { ...(stats[0] || {}), totalAds } });
  } catch (err) {
    next(err);
  }
});

app.post('/api/admin/deposit/action', telegramAuthMiddleware, adminMiddleware, async (req, res, next) => {
  const { depositId, action, reason } = req.body;
  if (!mongoose.Types.ObjectId.isValid(depositId)) return res.status(400).json({ success: false, error: 'معرف طلب الإيداع غير صالح' });

  try {
    const deposit = await executeTransaction(async (session) => {
      const dep = await Deposit.findById(depositId).populate('advertiserId').session(session);

      if (!dep || dep.status !== 'pending') {
        throw new Error('طلب الإيداع غير موجود أو تم معالجته سابقاً');
      }

      if (!['approved', 'rejected'].includes(action)) {
        throw new Error('إجراء معالجة غير صالح');
      }

      dep.status = action;
      if (action === 'rejected') {
        dep.rejectReason = String(reason || 'لم يتم تحديد سبب').trim();
      }
      await dep.save({ session });

      if (action === 'approved') {
        const targetUserId = dep.userId || dep.advertiserId._id;
        await User.findByIdAndUpdate(
          targetUserId,
          { $inc: { availableBalance: dep.amount } },
          { session }
        );
      }

      return dep;
    });

    if (action === 'approved') {
      sendTelegramNotification(
        deposit.advertiserTelegramId || deposit.advertiserId.telegramId,
        `🎉 <b>تم تأكيد عملية الإيداع!</b>\nتمت إضافة <code>$${deposit.amount}</code> لـ رصيدك المتاح بنجاح.`
      );
    } else {
      sendTelegramNotification(
        deposit.advertiserTelegramId || deposit.advertiserId.telegramId,
        `❌ <b>تم رفض طلب الإيداع</b>\nالمبلغ: <code>$${deposit.amount}</code>\n⚠️ <b>السبب:</b> ${deposit.rejectReason}\n\nالدعم: ${CONFIG.SUPPORT_USERNAME}`
      );
    }

    res.json({ success: true, deposit });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message || 'خطأ في معالجة طلب الإيداع' });
  }
});

app.post('/api/admin/withdraw/action', telegramAuthMiddleware, adminMiddleware, async (req, res, next) => {
  const { withdrawId, action, reason } = req.body;
  if (!mongoose.Types.ObjectId.isValid(withdrawId)) return res.status(400).json({ success: false, error: 'معرف السحب غير صالح' });

  try {
    const withdraw = await executeTransaction(async (session) => {
      const w = await Withdraw.findById(withdrawId).populate('userId').session(session);

      if (!w || w.status !== 'pending') {
        throw new Error('طلب السحب غير موجود أو تمت معالجته بالفعل');
      }

      if (!['approved', 'rejected'].includes(action)) {
        throw new Error('إجراء غير مسموح به');
      }

      w.status = action;
      if (action === 'rejected') {
        w.rejectReason = String(reason || 'لم يتم تحديد سبب').trim();
      }
      await w.save({ session });

      if (action === 'rejected') {
        await User.findByIdAndUpdate(
          w.userId._id, 
          { $inc: { availableBalance: w.amount } }, 
          { session }
        );
      }

      return w;
    });

    if (action === 'rejected') {
      sendTelegramNotification(
        withdraw.telegramId || withdraw.userId.telegramId,
        `❌ <b>تم رفض طلب السحب</b>\nإجمالي المبلغ: <code>$${withdraw.amount}</code>\n⚠️ <b>السبب:</b> ${withdraw.rejectReason}\nتمت إعادة المبلغ لحسابك المتاح.\nالدعم: ${CONFIG.SUPPORT_USERNAME}`
      );
    } else if (action === 'approved') {
      sendTelegramNotification(
        withdraw.telegramId || withdraw.userId.telegramId,
        `🎉 <b>تمت أتمتة وتحويل السحب!</b>\nالمبلغ الإجمالي: <code>$${withdraw.amount}</code>\nالصافي المحول: <code>$${withdraw.netAmount}</code>\nالشبكة: <code>${withdraw.network}</code>\nشكراً لاستخدامك شبكتنا!`
      );
    }

    res.json({ success: true, withdraw });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message || 'خطأ في تنفيذ الإجراء على السحب' });
  }
});

app.post('/api/admin/distribute-revenue', telegramAuthMiddleware, adminMiddleware, async (req, res, next) => {
  try {
    const { totalRevenue } = req.body;
    const revenue = roundMoney(totalRevenue);

    if (isNaN(revenue) || revenue <= 0) {
      return res.status(400).json({ success: false, error: 'قيمة الإيراد غير صالحة' });
    }

    const resultMessage = await executeTransaction(async (session) => {
      const aggregateTotal = await Link.aggregate([
        { $group: { _id: null, total: { $sum: '$validImpressions' } } }
      ]).session(session);

      const totalImp = aggregateTotal[0]?.total || 0;
      if (totalImp === 0) {
        throw new Error('لا توجد زيارات مؤكدة للتوزيع حالياً');
      }

      const links = await Link.find({ validImpressions: { $gt: 0 } }).populate('userId').session(session);
      const releaseDate = new Date();
      releaseDate.setDate(releaseDate.getDate() + 1);

      for (let link of links) {
        let earned = roundMoney((link.validImpressions / totalImp) * revenue, 4);

        if (link.userId && link.userId.referredBy) {
          const refBonus = roundMoney(earned * 0.10, 4);
          earned = roundMoney(earned - refBonus, 4);

          await User.findByIdAndUpdate(
            link.userId.referredBy,
            { $inc: { availableBalance: refBonus, referralEarnings: refBonus } },
            { session }
          );
        }

        if (link.userId) {
          await User.findByIdAndUpdate(link.userId._id, { $inc: { pendingBalance: earned } }, { session });
          await EarningsHold.create([{ userId: link.userId._id, telegramId: link.userId.telegramId, amount: earned, releaseAt: releaseDate }], { session });
        }

        link.validImpressions = 0;
        await link.save({ session });
      }

      return `تم توزيع $${revenue} بنجاح على ${links.length} رابط نشط.`;
    });

    res.json({ success: true, message: resultMessage });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message || 'فشل توزيع الأرباح الإجمالية' });
  }
});

app.post('/api/admin/user/toggle-ban', telegramAuthMiddleware, adminMiddleware, async (req, res, next) => {
  const { userId } = req.body;
  if (!mongoose.Types.ObjectId.isValid(userId)) return res.status(400).json({ success: false, error: 'معرف المستخدم غير صالح' });

  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });

    user.isBanned = !user.isBanned;
    await user.save();

    if (user.isBanned) {
      sendTelegramNotification(user.telegramId, `🚫 <b>تنبيه إداري:</b> تم تقييد حسابك لتجاوز الشروط.\nالدعم: ${CONFIG.SUPPORT_USERNAME}`);
    }

    res.json({ success: true, isBanned: user.isBanned });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// 12. AUTOMATED BATCH SETTLEMENT & WORKER ENGINE
// ============================================================================

if (!CONFIG.IS_SERVERLESS) {
  cron.schedule('0 0 * * *', async () => {
    const cronLock = await acquireLock('cron:settlement:lock', 45000);
    if (!cronLock) return;

    try {
      logger.info('🔄 Launching High-Efficiency Settlement Cron Worker...');
      const BATCH_SIZE = 100;
      let hasMore = true;

      while (hasMore) {
        const readyHolds = await EarningsHold.find({ releaseAt: { $lte: new Date() }, isReleased: false })
          .limit(BATCH_SIZE)
          .lean();

        if (readyHolds.length === 0) {
          hasMore = false;
          break;
        }

        for (let hold of readyHolds) {
          try {
            const userUpdate = await executeTransaction(async (session) => {
              const user = await User.findByIdAndUpdate(
                hold.userId,
                { $inc: { pendingBalance: -hold.amount, availableBalance: hold.amount } },
                { session, new: true }
              );

              await EarningsHold.findByIdAndUpdate(hold._id, { isReleased: true }, { session });
              return user;
            });

            if (userUpdate && userUpdate.telegramId) {
              sendTelegramNotification(
                userUpdate.telegramId,
                `✅ <b>إطلاق الأرباح المحررة!</b>\nتم تحويل <code>$${hold.amount.toFixed(4)}</code> إلى رصيدك المتاح للسحب.`
              );
            }
          } catch (err) {
            logger.error(`Failed processing hold release ID ${hold._id}: ${err.message}`);
          }
        }
      }
    } catch (err) {
      logger.error('❌ Cron Settlement Execution Error: ' + err.message);
    } finally {
      await releaseLock('cron:settlement:lock');
    }
  });
}

// ============================================================================
// 13. UI DELIVERY, SHORT LINK REDIRECT & FALLBACK HANDLERS
// ============================================================================

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views.html'));
});

app.get(['/app', '/admin', '/r/:code'], (req, res) => {
  res.sendFile(path.join(__dirname, 'views.html'));
});

app.get('/:shortCode', async (req, res, next) => {
  try {
    const { shortCode } = req.params;
    const reservedRoutes = ['app', 'admin', 'r', 'api', 'views.html', 'favicon.ico'];

    if (reservedRoutes.includes(shortCode.toLowerCase())) {
      return next();
    }

    if (mongoose.connection.readyState !== 1) {
      await connectDB();
    }

    const link = await Link.findOneAndUpdate(
      { shortCode, isActive: true },
      { $inc: { views: 1 } },
      { new: true }
    );

    if (!link) {
      return res.status(404).send('الرابط غير موجود أو تم تعطيله');
    }

    return res.redirect(302, link.targetUrl);
  } catch (err) {
    next(err);
  }
});

app.use('/api/*', (req, res) => {
  res.status(404).json({ success: false, error: 'المسار البرمجي المطلوب غير متاح' });
});

// Centralized Resilience Error Handler
app.use((err, req, res, next) => {
  logger.error('Unhandled Enterprise Core Error:', err);

  const statusCode = err.status || err.statusCode || 500;
  const message = CONFIG.NODE_ENV === 'production' 
    ? 'حدث خطأ داخلي في الخادم، جاري المعالجة' 
    : (err.message || 'Internal Server Error');

  res.status(statusCode).json({
    success: false,
    error: message,
    ...(CONFIG.NODE_ENV !== 'production' && { stack: err.stack })
  });
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception Blocked: ' + err.stack);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection at:', promise, 'reason:', reason);
});

if (require.main === module) {
  app.listen(CONFIG.PORT, () => logger.info(`🚀 Telega.ads Enterprise Core V10 Active on Port ${CONFIG.PORT}`));
}

module.exports = app;
