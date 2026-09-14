/**
 * ============================================================================
 * Ultra-Enterprise Autonomous Core (V10.1 - Refined & Secured Architecture)
 * Telega.ads Multi-Tenant Financial Infrastructure & Link Engine
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

app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(mongoSanitize({ replaceWith: '_' }));
app.use(cors({ origin: true, credentials: true }));
app.options('*', cors());

app.use(express.json({ limit: '30kb' }));
app.use(express.urlencoded({ extended: true, limit: '30kb' }));
app.use(express.static(__dirname));

app.use('/api', (req, res, next) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('X-Powered-By', 'Telega.ads Enterprise Engine V10.1');
  next();
});

// ============================================================================
// HELPER: URL NORMALIZATION & VALIDATION
// ============================================================================
function normalizeAndValidateUrl(inputUrl) {
  if (!inputUrl || typeof inputUrl !== 'string') return null;
  let clean = inputUrl.trim();
  if (!clean) return null;

  if (!/^https?:\/\//i.test(clean) && !/^(tg|telegram):\/\//i.test(clean)) {
    clean = 'https://' + clean;
  }

  try {
    const parsed = new URL(clean);
    if (!['http:', 'http:', 'https:', 'tg:', 'telegram:'].includes(parsed.protocol)) return null;
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      if (!parsed.hostname) return null;
      const isShortTelegram = /^(t\.me|telegram\.me|telegram\.dog)$/i.test(parsed.hostname);
      if (!isShortTelegram && !parsed.hostname.includes('.')) return null;
    }
    return parsed.toString();
  } catch (err) {
    return null;
  }
}

// ============================================================================
// 2. CENTRALIZED ENTERPRISE LOGGING ENGINE
// ============================================================================
const logger = winston.createLogger({
  level: CONFIG.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    CONFIG.NODE_ENV === 'production' ? winston.format.json() : winston.format.combine(winston.format.colorize(), winston.format.simple())
  ),
  defaultMeta: { service: 'telega-core-v10.1' },
  transports: [new winston.transports.Console()]
});

app.use(morgan('combined', { stream: { write: (msg) => logger.info(msg.trim()) } }));

// ============================================================================
// 3. HYBRID CACHE & DISTRIBUTED LOCK ENGINE
// ============================================================================
let redisIsConnected = false;
const inMemoryCache = new Map();

const redis = new Redis(CONFIG.REDIS_URL, {
  maxRetriesPerRequest: 2,
  enableReadyCheck: true,
  lazyConnect: false,
  connectTimeout: 5000,
  retryStrategy: (times) => Math.min(times * 100, 3000)
});

redis.on('connect', () => { redisIsConnected = true; logger.info('✅ Redis Cluster Active'); });
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
  inMemoryCache.set(key, { value: String(value), expiry: duration ? Date.now() + (duration * 1000) : Date.now() + 3600000 });
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

function roundMoney(value, decimals = 5) {
  const factor = Math.pow(10, decimals);
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

// ============================================================================
// 4. DATABASE INFRASTRUCTURE & TRANSACTION WRAPPER
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
      logger.info('✅ Connected to MongoDB');
      try {
        const admin = mongoose.connection.db.admin();
        const status = await admin.command({ replSetGetStatus: 1 });
        isReplicaSet = Boolean(status && status.ok);
      } catch (e) {
        isReplicaSet = false;
      }
    } catch (err) {
      logger.error('❌ Database Connection Error:', err);
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
    try { await connectDB(); } catch (e) {
      return res.status(503).json({ success: false, error: 'الخدمة جاري تهيئتها، يرجى المحاولة لاحقاً' });
    }
  }
  next();
});

// ============================================================================
// 5. SECURITY & TELEGRAM VERIFICATION UTILITIES
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
    logger.error(`⚠️ Telegram Notification Failed [${telegramId}]: ${err.message}`);
  }
}

function verifyTelegramData(initData) {
  if (!initData) return null;
  try {
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');
    if (!hash) return null;

    urlParams.delete('hash');
    const paramsArr = Array.from(urlParams.entries()).map(([k, v]) => `${k}=${v}`).sort();
    const dataCheckString = paramsArr.join('\n');
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(CONFIG.BOT_TOKEN || '').digest();
    const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    if (crypto.timingSafeEqual(Buffer.from(calculatedHash, 'hex'), Buffer.from(hash, 'hex'))) {
      const userParam = urlParams.get('user');
      const authDate = parseInt(urlParams.get('auth_date') || '0', 10);
      if (authDate && (Math.floor(Date.now() / 1000) - authDate > 86400)) return null;
      return userParam ? JSON.parse(userParam) : null;
    }
    return null;
  } catch (err) {
    return null;
  }
}

const isPhishingOrMalicious = (url) => {
  const blacklistedKeywords = ['phish', 'login-verify', 'grabber', 'stealer', 'iplogger', 'bit.ly', 'tinyurl', 'session-thief'];
  const lowerUrl = url.toLowerCase();
  return blacklistedKeywords.some(keyword => lowerUrl.includes(keyword));
};

// ============================================================================
// 6. RATE LIMITING & SECURITY MIDDLEWARES
// ============================================================================
const linkCreationLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 150,
  message: { success: false, error: 'تم تجاوز الحد اليومي المسموح به لإنشاء الروابط' }
});

const clickLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 40,
  keyGenerator: (req) => req.ip,
  message: { success: false, error: 'معدل طلبات مرتفع، يرجى الانتظار قليلاً' }
});

const validateTraffic = (req, res, next) => {
  const ua = req.get('User-Agent') || '';
  if (/bot|crawler|spider|datacenter|proxy|httpclient|curl|python|axios|headless|selenium|puppeteer/i.test(ua)) {
    return res.status(403).json({ success: false, error: 'تم رفض الزيارة (Automated Bot Traffic)' });
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
      if (telegramUser?.id) {
        const tgId = String(telegramUser.id);
        user = await User.findOne({ telegramId: tgId });
        if (!user) {
          user = await User.create({ telegramId: tgId, username: telegramUser.username || `User_${tgId.slice(-4)}`, language: telegramUser.language_code || CONFIG.DEFAULT_LANGUAGE });
        }
      }
    }

    if (!user && authHeader?.startsWith('Bearer ')) {
      try {
        const decoded = jwt.verify(authHeader.split(' ')[1], CONFIG.JWT_SECRET);
        user = await User.findById(decoded.userId);
      } catch (e) {}
    }

    if (!user) {
      const fallbackId = req.body?.userId || req.query?.userId || req.body?.telegramId || req.query?.telegramId;
      if (fallbackId) {
        user = mongoose.Types.ObjectId.isValid(fallbackId) ? await User.findById(fallbackId) : await User.findOne({ telegramId: String(fallbackId) });
      }
    }

    if (!user) return res.status(401).json({ success: false, error: 'فشل التوثيق: بيانات المستخدم مفقودة' });
    if (user.isBanned) return res.status(403).json({ success: false, error: `الحساب معطل. الدعم: ${CONFIG.SUPPORT_USERNAME}` });

    req.user = user;
    req.userId = user._id;
    req.telegramId = user.telegramId;
    next();
  } catch (err) {
    res.status(401).json({ success: false, error: 'خطأ في المصادقة' });
  }
};

const adminMiddleware = async (req, res, next) => {
  if (!req.user || !CONFIG.ADMIN_ID || String(req.user.telegramId).trim() !== CONFIG.ADMIN_ID) {
    return res.status(403).json({ success: false, error: 'غير مصرح بالوصول لهذه اللوحة' });
  }
  next();
};

// ============================================================================
// 7. CORE API ENDPOINTS
// ============================================================================

app.post('/api/auth/login', async (req, res, next) => {
  try {
    const initData = req.headers['x-telegram-init-data'] || req.body?.initData;
    const telegramUser = verifyTelegramData(initData);
    const tgId = telegramUser ? String(telegramUser.id) : (CONFIG.NODE_ENV !== 'production' ? String(req.body?.telegramId || '') : null);

    if (!tgId) return res.status(401).json({ success: false, error: 'بيانات اعتماد تليجرام غير صالحة' });

    let user = await User.findOne({ telegramId: tgId });
    if (!user) {
      user = await User.create({
        telegramId: tgId,
        username: telegramUser?.username || `User_${tgId.slice(-4)}`,
        language: telegramUser?.language_code || CONFIG.DEFAULT_LANGUAGE
      });
    }

    if (user.isBanned) return res.status(403).json({ success: false, error: 'الحساب معطل' });

    const token = jwt.sign({ userId: user._id, telegramId: user.telegramId, role: user.role }, CONFIG.JWT_SECRET, { expiresIn: '14d' });

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
      depositWallets: { bep20: CONFIG.DEPOSIT_USDT_BEP20, trc20: CONFIG.DEPOSIT_USDT_TRC20 }
    });
  } catch (err) {
    next(err);
  }
});

app.get('/api/user/data', telegramAuthMiddleware, async (req, res, next) => {
  try {
    const [rawLinks, withdraws, announcements, ads, deposits] = await Promise.all([
      Link.getUserIsolatedLinks(req.userId).lean(),
      Withdraw.getUserWithdrawalsIsolated(req.userId).lean(),
      Announcement.getForUserIsolated(req.userId, req.telegramId).lean(),
      Ad.findAdvertiserAdsIsolated(req.userId).lean(),
      Deposit.getAdvertiserDepositsIsolated(req.userId).lean()
    ]);

    const links = rawLinks.map(link => {
      const views = Number(link.views || 0);
      const valid = Number(link.validImpressions || 0);
      return {
        ...link,
        id: String(link._id),
        shortUrl: `https://${CONFIG.APP_DOMAIN}/r/${link.shortCode}`,
        ctr: views > 0 ? ((valid / views) * 100).toFixed(1) : "0.0"
      };
    });

    res.json({
      success: true,
      user: req.user,
      language: req.user.language || CONFIG.DEFAULT_LANGUAGE,
      links, withdraws, announcements, ads, deposits,
      isAdmin: Boolean(CONFIG.ADMIN_ID && String(req.user.telegramId).trim() === CONFIG.ADMIN_ID),
      botUsername: CONFIG.BOT_USERNAME,
      supportUsername: CONFIG.SUPPORT_USERNAME
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
  if (!await acquireLock(lockKey)) return res.status(429).json({ success: false, error: 'طلب قيد المعالجة، انتظر قليلاً' });

  try {
    const { title, targetUrl, totalBudget } = req.body;
    const budget = roundMoney(totalBudget);
    const validatedUrl = normalizeAndValidateUrl(targetUrl);

    if (!title || !validatedUrl || isNaN(budget) || budget < 5) {
      return res.status(400).json({ success: false, error: 'البيانات المدخلة غير صالحة أو أقل من الحد الأدنى ($5)' });
    }

    const createdAd = await executeTransaction(async (session) => {
      const user = await User.findOneAndUpdate(
        { _id: req.userId, availableBalance: { $gte: budget } },
        { $inc: { availableBalance: -budget } },
        { new: true, session }
      );
      if (!user) throw new Error('الرصيد المتاح غير كافٍ');

      const ads = await Ad.create([{
        userId: req.userId,
        telegramId: req.user.telegramId,
        advertiserId: req.userId,
        advertiserTelegramId: req.user.telegramId,
        title: String(title).trim(),
        targetUrl: validatedUrl,
        totalBudget: budget,
        remainingBudget: budget,
        status: 'active'
      }], { session });
      return ads[0];
    });

    res.json({ success: true, ad: createdAd });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message || 'فشل إنشاء الحملة' });
  } finally {
    await releaseLock(lockKey);
  }
});

app.post('/api/deposit', telegramAuthMiddleware, async (req, res, next) => {
  try {
    const { amount, network, txid } = req.body;
    const numAmount = roundMoney(amount);
    const cleanNetwork = String(network || '').toUpperCase();
    const cleanTxid = String(txid || '').trim();

    if (isNaN(numAmount) || numAmount < 1 || !['BEP20', 'TRC20', 'TON'].includes(cleanNetwork) || cleanTxid.length < 8) {
      return res.status(400).json({ success: false, error: 'بيانات الإيداع غير صالحة' });
    }

    if (await Deposit.findOne({ txid: cleanTxid })) {
      return res.status(400).json({ success: false, error: 'رمز TxID مستخدم مسبقاً' });
    }

    const deposit = await Deposit.create({
      userId: req.userId,
      telegramId: req.user.telegramId,
      advertiserId: req.userId,
      advertiserTelegramId: req.user.telegramId,
      amount: numAmount,
      network: cleanNetwork,
      txid: cleanTxid,
      status: 'pending'
    });

    if (CONFIG.ADMIN_ID) {
      sendTelegramNotification(CONFIG.ADMIN_ID, `💳 <b>طلب إيداع جديد!</b>\nالمبلغ: <code>$${numAmount}</code>\nTxID: <code>${cleanTxid}</code>`);
    }

    res.json({ success: true, deposit });
  } catch (err) {
    next(err);
  }
});

app.post('/api/withdraw', telegramAuthMiddleware, async (req, res, next) => {
  const lockKey = `lock:withdraw:${req.userId}`;
  if (!await acquireLock(lockKey)) return res.status(429).json({ success: false, error: 'جاري معالجة طلب سحب آخر' });

  try {
    const { amount, network, walletAddress } = req.body;
    const numAmt = roundMoney(amount);
    const cleanNetwork = String(network || '').toUpperCase();
    const cleanWallet = String(walletAddress || '').trim();
    const FEE = 3;

    if (isNaN(numAmt) || numAmt < 30 || !['BEP20', 'TRC20', 'TON'].includes(cleanNetwork) || cleanWallet.length < 10) {
      return res.status(400).json({ success: false, error: 'بيانات السحب غير مطابقة للشروط ($30 كحد أدنى)' });
    }

    if (await Withdraw.findOne({ userId: req.userId, status: 'pending' })) {
      return res.status(400).json({ success: false, error: 'لديك طلب سحب معلق بالفعل' });
    }

    const withdrawRequest = await executeTransaction(async (session) => {
      const user = await User.findOneAndUpdate(
        { _id: req.userId, availableBalance: { $gte: numAmt } },
        { $inc: { availableBalance: -numAmt }, defaultWallet: cleanWallet },
        { new: true, session }
      );
      if (!user) throw new Error('الرصيد المتاح لا يكفي');

      const w = await Withdraw.create([{
        userId: req.userId,
        telegramId: req.user.telegramId,
        amount: numAmt,
        fee: FEE,
        netAmount: roundMoney(numAmt - FEE),
        network: cleanNetwork,
        walletAddress: cleanWallet,
        status: 'pending'
      }], { session });
      return w[0];
    });

    res.json({ success: true, withdraw: withdrawRequest });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message || 'حدث خطأ أثناء السحب' });
  } finally {
    await releaseLock(lockKey);
  }
});

// ============================================================================
// 9. TRAFFIC ROUTER & ANTI-FRAUD IMPRESSION ENGINE
// ============================================================================

app.post('/api/init-click', validateTraffic, async (req, res, next) => {
  try {
    const { linkCode } = req.body;
    const cleanCode = String(linkCode || '').trim();
    if (!cleanCode) return res.status(400).json({ success: false, error: 'كود الرابط مطلوب' });

    const link = await Link.findOne({ shortCode: cleanCode, isActive: true }).lean();
    if (!link) return res.status(404).json({ success: false, error: 'الرابط غير موجود أو معطل' });

    await ClickSession.deleteMany({ linkId: link._id, ip: req.ip });

    const activeAds = await Ad.aggregate([
      { $match: { status: 'active', remainingBudget: { $gte: 0.0015 }, userId: { $ne: link.userId } } },
      { $sample: { size: 1 } }
    ]);

    const selectedAd = activeAds?.[0] || null;
    const bridgeToken = crypto.randomBytes(16).toString('hex');
    const session = await ClickSession.create({
      linkId: link._id,
      userId: link.userId,
      telegramId: link.telegramId,
      publisherId: link.userId,
      publisherTelegramId: link.telegramId,
      ip: req.ip,
      bridgeToken,
      adSource: selectedAd ? 'internal' : 'adsgram',
      adId: selectedAd?._id || null
    });

    await safeRedisSet(`bridge:token:${session._id}`, bridgeToken, 'EX', 300);

    res.json({
      success: true,
      sessionId: session._id,
      bridgeToken,
      blockId: CONFIG.ADSGRAM_BLOCK_ID,
      adSource: session.adSource,
      adData: selectedAd ? { id: selectedAd._id, title: selectedAd.title, targetUrl: selectedAd.targetUrl } : null
    });
  } catch (err) {
    next(err);
  }
});

app.post('/api/impression', validateTraffic, clickLimiter, async (req, res, next) => {
  try {
    const { sessionId, bridgeToken, duration } = req.body;
    if (!sessionId || !bridgeToken || (await safeRedisGet(`bridge:token:${sessionId}`)) !== bridgeToken) {
      return res.status(403).json({ success: false, error: 'جلسة غير صالحة' });
    }

    const result = await executeTransaction(async (session) => {
      const clickSession = await ClickSession.findById(sessionId).session(session);
      if (!clickSession || clickSession.ip !== req.ip) throw new Error('INVALID_SESSION');
      if ((Date.now() - new Date(clickSession.createdAt).getTime() < 4800) && (Number(duration) || 0) < 5) {
        throw new Error('DWELL_TIME_NOT_MET');
      }

      const link = await Link.findById(clickSession.linkId).populate('userId').session(session);
      await ClickSession.findByIdAndDelete(sessionId).session(session);
      await safeRedisDel(`bridge:token:${sessionId}`);

      if (!link) throw new Error('LINK_NOT_FOUND');

      const isDup = await safeRedisGet(`imp:${link._id}:${req.ip}`);
      if (isDup) {
        await Link.findByIdAndUpdate(link._id, { $inc: { views: 1, invalidImpressions: 1 } }, { session });
        return { targetUrl: link.targetUrl, counted: false };
      }

      await safeRedisSet(`imp:${link._id}:${req.ip}`, '1', 'EX', 86400);

      await Impression.create([{
        linkId: link._id,
        userId: link.userId._id,
        telegramId: link.userId.telegramId,
        publisherId: link.userId._id,
        publisherTelegramId: link.userId.telegramId,
        adSource: clickSession.adSource,
        adId: clickSession.adId,
        ip: req.ip
      }], { session });

      await Link.findByIdAndUpdate(link._id, { $inc: { views: 1, validImpressions: 1 } }, { session });

      if (clickSession.adSource === 'internal' && clickSession.adId) {
        const ad = await Ad.findById(clickSession.adId).session(session);
        if (ad && ad.remainingBudget >= 0.0015 && ad.status === 'active') {
          ad.remainingBudget = roundMoney(Math.max(0, ad.remainingBudget - 0.0015));
          ad.impressionsCount += 1;
          if (ad.remainingBudget < 0.0015) ad.status = 'completed';
          await ad.save({ session });

          let share = 0.00135;
          if (link.userId.referredBy) {
            const refBonus = roundMoney(share * 0.10);
            share = roundMoney(share - refBonus);
            await User.findByIdAndUpdate(link.userId.referredBy, { $inc: { availableBalance: refBonus, referralEarnings: refBonus } }, { session });
          }

          await User.findByIdAndUpdate(link.userId._id, { $inc: { pendingBalance: share } }, { session });
          const releaseDate = new Date();
          releaseDate.setDate(releaseDate.getDate() + 1);
          await EarningsHold.create([{ userId: link.userId._id, telegramId: link.userId.telegramId, amount: share, releaseAt: releaseDate }], { session });
        }
      }

      return { targetUrl: link.targetUrl, counted: true };
    });

    res.json({ success: true, targetUrl: result.targetUrl, counted: result.counted });
  } catch (err) {
    if (err.message === 'DWELL_TIME_NOT_MET') return res.status(400).json({ success: false, error: 'لم يتم استيفاء وقت الانتظار' });
    next(err);
  }
});

// ============================================================================
// 10. LINK SHORTENING MANAGEMENT ENGINE
// ============================================================================

const handleShortenLink = async (req, res) => {
  try {
    let userId = req.userId;
    let telegramId = req.telegramId;

    const rawUrl = String(req.body?.targetUrl || req.body?.url || req.body?.link || '').trim();
    const cleanUrl = normalizeAndValidateUrl(rawUrl);

    if (!cleanUrl || isPhishingOrMalicious(cleanUrl)) {
      return res.status(400).json({ success: false, error: 'الرابط غير صالح أو مخالف لشروط الاستخدام' });
    }

    let shortCode = crypto.randomBytes(3).toString('hex');
    while (await Link.findOne({ shortCode }).lean()) {
      shortCode = crypto.randomBytes(4).toString('hex');
    }

    const newLink = await Link.create({
      userId,
      telegramId,
      publisherTelegramId: telegramId,
      title: req.body?.title ? String(req.body.title).trim() : 'رابط بدون عنوان',
      targetUrl: cleanUrl,
      shortCode
    });

    await User.findByIdAndUpdate(userId, { $inc: { 'statsSummary.totalLinksCreated': 1 } });

    res.json({
      success: true,
      link: { ...newLink.toObject(), id: String(newLink._id), shortUrl: `https://${CONFIG.APP_DOMAIN}/r/${shortCode}` }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'خطأ أثناء اختصار الرابط' });
  }
};

app.post(['/api/shorten', '/api/links/shorten', '/api/links'], telegramAuthMiddleware, linkCreationLimiter, handleShortenLink);

app.get(['/api/my-links', '/api/links', '/api/user/links'], telegramAuthMiddleware, async (req, res) => {
  const links = await Link.getUserIsolatedLinks(req.userId).lean();
  res.json({ success: true, links: links.map(l => ({ ...l, id: String(l._id), shortUrl: `https://${CONFIG.APP_DOMAIN}/r/${l.shortCode}` })) });
});

app.post('/api/links/toggle', telegramAuthMiddleware, async (req, res) => {
  const link = await Link.findOne({ _id: req.body?.linkId, userId: req.userId });
  if (!link) return res.status(404).json({ success: false, error: 'الرابط غير موجود' });
  link.isActive = !link.isActive;
  await link.save();
  res.json({ success: true, isActive: link.isActive });
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
      User.aggregate([{ $group: { _id: null, totalPending: { $sum: "$pendingBalance" }, totalAvailable: { $sum: "$availableBalance" }, totalUsers: { $sum: 1 } } }]),
      Ad.countDocuments()
    ]);
    res.json({ success: true, withdraws, deposits, users, stats: { ...(stats[0] || {}), totalAds } });
  } catch (err) {
    next(err);
  }
});

app.post('/api/admin/deposit/action', telegramAuthMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { depositId, action, reason } = req.body;
    const dep = await executeTransaction(async (session) => {
      const deposit = await Deposit.findById(depositId).populate('advertiserId').session(session);
      if (!deposit || deposit.status !== 'pending') throw new Error('طلب غير موجود أو عولج مسبقاً');
      
      deposit.status = action;
      if (action === 'rejected') deposit.rejectReason = String(reason || 'بدون سبب').trim();
      await deposit.save({ session });

      if (action === 'approved') {
        await User.findByIdAndUpdate(deposit.userId || deposit.advertiserId._id, { $inc: { availableBalance: deposit.amount } }, { session });
      }
      return deposit;
    });

    res.json({ success: true, deposit: dep });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/withdraw/action', telegramAuthMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { withdrawId, action, reason } = req.body;
    const w = await executeTransaction(async (session) => {
      const withdraw = await Withdraw.findById(withdrawId).populate('userId').session(session);
      if (!withdraw || withdraw.status !== 'pending') throw new Error('طلب السحب غير موجود');

      withdraw.status = action;
      if (action === 'rejected') {
        withdraw.rejectReason = String(reason || '').trim();
        await User.findByIdAndUpdate(withdraw.userId._id, { $inc: { availableBalance: withdraw.amount } }, { session });
      }
      await withdraw.save({ session });
      return withdraw;
    });

    res.json({ success: true, withdraw: w });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ============================================================================
// 12. ROUTING & STATIC DELIVERY
// ============================================================================

app.get(['/', '/app', '/admin', '/r/:code'], (req, res) => res.sendFile(path.join(__dirname, 'views.html')));

app.get('/:shortCode', async (req, res, next) => {
  const { shortCode } = req.params;
  if (['app', 'admin', 'r', 'api', 'views.html'].includes(shortCode.toLowerCase()) || /\.[a-z0-9]+$/i.test(shortCode)) {
    return next();
  }

  const link = await Link.findOneAndUpdate({ shortCode, isActive: true }, { $inc: { views: 1 } });
  if (!link) return res.status(404).send('الرابط غير موجود');
  res.redirect(302, link.targetUrl);
});

app.use((err, req, res, next) => {
  logger.error('Core Error:', err);
  res.status(err.status || 500).json({ success: false, error: err.message || 'خطأ داخلي في الخادم' });
});

if (require.main === module) {
  app.listen(CONFIG.PORT, () => logger.info(`🚀 Server V10.1 Active on Port ${CONFIG.PORT}`));
}

module.exports = app;
