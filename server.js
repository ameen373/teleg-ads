/**
 * Ultra-Enterprise Server Architecture (V8 - Dynamic Multi-Tenant Security & High-Performance Core)
 * Telegram Link Shortener & Mini App Engine (Telega.ads)
 * Engine Standard: Production Grade / Serverless & Scalable Core
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

// استدعاء النماذج البرمجية
const { 
  User, 
  Ad, 
  Link, 
  Impression, 
  ClickSession, 
  Withdraw, 
  EarningsHold, 
  Deposit, 
  Announcement 
} = require('./models');

const app = express();

// ==================================================
// --- 1. System Constants & Immutable Environment Config ---
// ==================================================
const CONFIG = Object.freeze({
  ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT, 10) || 3000,
  BOT_TOKEN: (process.env.BOT_TOKEN || '').trim(),
  MONGO_URI: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/shortener',
  ADMIN_ID: String(process.env.ADMIN_ID || '123456789').trim(),
  JWT_SECRET: process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex'),
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

// --- Trust Proxy Configuration ---
app.set('trust proxy', 1);

// --- CORS Protection Layer ---
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-telegram-init-data', 'x-demo-user-id']
}));
app.options('*', cors());

// --- Body Parsing with Strict Controls ---
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(express.static(__dirname));

// --- Security & Privacy Response Headers ---
app.use('/api', (req, res, next) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// ==================================================
// --- 2. High-Performance Enterprise Logging Engine ---
// ==================================================
const logger = winston.createLogger({
  level: CONFIG.ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'telega-core-engine' },
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error', maxsize: 5242880, maxFiles: 5 }),
    new winston.transports.File({ filename: 'logs/combined.log', maxsize: 10485760, maxFiles: 5 })
  ]
});

if (CONFIG.ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(winston.format.colorize(), winston.format.simple())
  }));
}

app.use(morgan('combined', { stream: { write: (message) => logger.info(message.trim()) } }));

// ==================================================
// --- 3. Database & Memory Caching Architecture ---
// ==================================================
let cachedMongoConn = null;
async function connectToDatabase() {
  if (cachedMongoConn && mongoose.connection.readyState === 1) {
    return cachedMongoConn;
  }
  
  mongoose.set('strictQuery', true);
  cachedMongoConn = await mongoose.connect(CONFIG.MONGO_URI, {
    maxPoolSize: 50,
    minPoolSize: 5,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    bufferCommands: false
  });
  
  logger.info('✅ Enterprise MongoDB Pipeline Connected Successfully');
  return cachedMongoConn;
}

// Middleware لضمان الاتصال المباشر بقاعدة البيانات عند استخدام Serverless / Vercel
app.use(async (req, res, next) => {
  try {
    await connectToDatabase();
    next();
  } catch (err) {
    logger.error('❌ Database Gate Connection Error:', err);
    res.status(500).json({ success: false, error: 'تعذر الاتصال بقاعدة البيانات' });
  }
});

// --- Enterprise Hybrid Cache System (Redis + In-Memory Fallback) ---
let redisIsConnected = false;
const inMemoryCache = new Map();

const redis = new Redis(CONFIG.REDIS_URL, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: true,
  retryStrategy: (times) => Math.min(times * 100, 3000)
});

redis.connect().catch((err) => {
  logger.warn(`⚠️ Redis Connection Notice: ${err.message} (Fallback System Active)`);
});

redis.on('error', (err) => {
  redisIsConnected = false;
});

redis.on('ready', () => {
  redisIsConnected = true;
  logger.info('✅ Enterprise Redis Client Connected & Ready');
});

// Cache Abstraction Helpers
async function safeRedisGet(key) {
  if (redisIsConnected) {
    try { return await redis.get(key); } catch (e) { logger.error('Redis Get Error:', e); }
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
    } catch (e) { logger.error('Redis Set Error:', e); }
  }
  let expiry = Number.MAX_SAFE_INTEGER;
  if (mode === 'EX' && duration) expiry = Date.now() + (duration * 1000);
  inMemoryCache.set(key, { value, expiry });
}

async function safeRedisDel(key) {
  if (redisIsConnected) {
    try { await redis.del(key); } catch (e) { logger.error('Redis Del Error:', e); }
  }
  inMemoryCache.delete(key);
}

// Atomic Distributed Lock Engine
async function acquireLock(lockKey, ttlMs = 5000) {
  const lockToken = crypto.randomBytes(16).toString('hex');
  if (redisIsConnected) {
    try {
      const result = await redis.set(`lock:${lockKey}`, lockToken, 'PX', ttlMs, 'NX');
      return result === 'OK' ? lockToken : null;
    } catch (e) { return null; }
  }
  if (!inMemoryCache.has(`lock:${lockKey}`)) {
    inMemoryCache.set(`lock:${lockKey}`, { value: lockToken, expiry: Date.now() + ttlMs });
    return lockToken;
  }
  return null;
}

async function releaseLock(lockKey, lockToken) {
  if (redisIsConnected) {
    try {
      const luaScript = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("del", KEYS[1])
        else
            return 0
        end
      `;
      await redis.eval(luaScript, 1, `lock:${lockKey}`, lockToken);
      return;
    } catch (e) {}
  }
  const item = inMemoryCache.get(`lock:${lockKey}`);
  if (item && item.value === lockToken) {
    inMemoryCache.delete(`lock:${lockKey}`);
  }
}

// ==================================================
// --- 4. Security & Utility Core Helpers ---
// ==================================================

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

const isPhishingOrMalicious = (url) => {
  const blacklistedKeywords = [
    'phish', 'login-verify', 'free-telegram-premium', 'grabber', 
    'stealer', 'iplogger', 'bit.ly', 'tinyurl.com', 'hack'
  ];
  const lowerUrl = url.toLowerCase();
  return blacklistedKeywords.some(keyword => lowerUrl.includes(keyword));
};

// ==================================================
// --- 5. Traffic Filtering & Rate Limiting ---
// ==================================================
const linkCreationLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'تم تجاوز الحد اليومي لإنشاء الروابط' }
});

const clickLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
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

// ==================================================
// --- 6. Security Authentication Middlewares ---
// ==================================================
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

// ==================================================
// --- 7. Core Production API Routes ---
// ==================================================

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

    const tgId = telegramUser ? String(telegramUser.id) : (CONFIG.ENV !== 'production' ? String(req.headers['x-demo-user-id'] || '') : null);
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
      if (user.username !== currentUsername) {
        user.username = currentUsername;
        updated = true;
      }
      if (!user.language) {
        user.language = userLanguage;
        updated = true;
      }
      if (updated) await user.save();
    }

    if (user.isBanned) return res.status(403).json({ success: false, error: `حسابك معطل بسبب مخالفة الشروط. التواصل مع الدعم: ${CONFIG.SUPPORT_USERNAME}` });

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
      depositWallets: {
        bep20: CONFIG.DEPOSIT_USDT_BEP20,
        trc20: CONFIG.DEPOSIT_USDT_TRC20
      }
    });
  } catch (err) {
    next(err);
  }
});

app.get('/api/user/data', authMiddleware, async (req, res, next) => {
  try {
    const userId = req.userId;

    if (!userId) {
      return res.json({
        success: true,
        user: req.user,
        language: req.user.language || CONFIG.DEFAULT_LANGUAGE,
        links: [],
        withdraws: [],
        announcements: [],
        ads: [],
        deposits: [],
        isAdmin: false
      });
    }

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

app.post('/api/ads', authMiddleware, async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const { title, targetUrl, totalBudget } = req.body;
    const budget = Number(totalBudget);

    if (!title || String(title).trim().length === 0) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, error: 'عنوان الإعلان مطلوب' });
    }

    if (!validUrl.isWebUri(targetUrl)) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, error: 'الرابط المستهدف غير صالح' });
    }

    if (isNaN(budget) || budget < 5) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, error: 'الحد الأدنى لميزانية الحملة هو $5' });
    }

    const updatedUser = await User.findOneAndUpdate(
      { _id: req.userId, availableBalance: { $gte: budget } },
      { $inc: { availableBalance: -budget } },
      { new: true, session }
    );

    if (!updatedUser) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, error: 'رصيدك المتاح غير كافي لإنشاء هذه الحملة (الحد الأدنى $5)' });
    }

    const ad = await Ad.create([{
      userId: req.userId,
      advertiserId: req.userId,
      advertiserTelegramId: req.user.telegramId,
      title: String(title).trim(),
      targetUrl: String(targetUrl).trim(),
      totalBudget: budget,
      remainingBudget: budget,
      cpmRate: 1.50,
      costPerImpression: 0.0015,
      publisherEarningsPerImpression: 0.00135,
      platformFeePerImpression: 0.00015,
      status: 'active'
    }], { session });

    await session.commitTransaction();
    res.json({ success: true, ad: ad[0] });
  } catch (err) {
    await session.abortTransaction();
    next(err);
  } finally {
    session.endSession();
  }
});

app.get('/api/user/ads', authMiddleware, async (req, res, next) => {
  try {
    const ads = await Ad.find({ userId: req.userId }).sort({ createdAt: -1 }).lean();
    res.json({ success: true, ads });
  } catch (err) {
    next(err);
  }
});

app.post('/api/ads/toggle', authMiddleware, async (req, res, next) => {
  try {
    const { adId } = req.body;
    if (!mongoose.Types.ObjectId.isValid(adId)) return res.status(400).json({ success: false, error: 'معرف الإعلان غير صالح' });

    const ad = await Ad.findOne({ _id: adId, userId: req.userId });
    if (!ad) return res.status(404).json({ success: false, error: 'الإعلان غير موجود أو لا تملك صلاحية تعديله' });

    if (ad.status === 'completed') {
      return res.status(400).json({ success: false, error: 'لا يمكن تفعيل حملة مكتملة ونفاذ ميزانيتها' });
    }

    ad.status = ad.status === 'active' ? 'paused' : 'active';
    await ad.save();

    res.json({ success: true, status: ad.status });
  } catch (err) {
    next(err);
  }
});

app.post('/api/deposit', authMiddleware, async (req, res, next) => {
  try {
    const { amount, network, txid } = req.body;
    const numAmount = Number(amount);
    const cleanNetwork = String(network || '').toUpperCase();
    const cleanTxid = String(txid || '').trim();

    if (isNaN(numAmount) || numAmount < 1) {
      return res.status(400).json({ success: false, error: 'الحد الأدنى للإيداع هو $1' });
    }

    if (!['BEP20', 'TRC20', 'TON'].includes(cleanNetwork)) {
      return res.status(400).json({ success: false, error: 'يرجى تحديد شبكة صالحة (BEP20, TRC20, TON)' });
    }

    if (!cleanTxid || cleanTxid.length < 8) {
      return res.status(400).json({ success: false, error: 'يرجى إدخال هاش المعاملة الصحيح (TxID)' });
    }

    const existingDeposit = await Deposit.findOne({ txid: cleanTxid });
    if (existingDeposit) {
      return res.status(400).json({ success: false, error: 'تم تقديم رقم هذه المعاملة (TxID) من قبل' });
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

    sendTelegramNotification(
      CONFIG.ADMIN_ID,
      `💳 <b>طلب إيداع جديد!</b>\nالمستخدم: <code>${req.user.username}</code>\nالمبلغ: <code>$${numAmount}</code>\nالشبكة: <code>${cleanNetwork}</code>\nTxID: <code>${cleanTxid}</code>`
    );

    res.json({ success: true, deposit });
  } catch (err) {
    next(err);
  }
});

app.post('/api/withdraw', authMiddleware, async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const { amount, network, walletAddress } = req.body;
    const numAmt = Number(amount);
    const cleanNetwork = String(network || '').toUpperCase();
    const cleanWallet = String(walletAddress || '').trim();
    const FEE = 3;

    if (isNaN(numAmt) || numAmt < 30) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, error: 'الحد الأدنى للسحب هو $30' });
    }

    if (!['BEP20', 'TRC20', 'TON'].includes(cleanNetwork)) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, error: 'يرجى تحديد الشبكة (BEP20, TRC20, TON)' });
    }

    if (!cleanWallet || cleanWallet.length < 10) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, error: 'عنوان المحفظة غير صالح' });
    }

    const activePending = await Withdraw.findOne({ userId: req.userId, status: 'pending' }).session(session);
    if (activePending) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, error: 'لديك طلب سحب قيد الانتظار حالياً، يرجى الانتظار حتى معالجته' });
    }

    const netAmount = numAmt - FEE;

    const updatedUser = await User.findOneAndUpdate(
      { _id: req.userId, availableBalance: { $gte: numAmt } },
      { $inc: { availableBalance: -numAmt }, defaultWallet: cleanWallet },
      { new: true, session }
    );

    if (!updatedUser) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, error: 'رصيدك المتاح لا يكفي لإتمام عملية السحب' });
    }

    const withdrawRequest = await Withdraw.create([{
      userId: req.userId,
      telegramId: req.user.telegramId,
      amount: numAmt,
      fee: FEE,
      netAmount: netAmount,
      network: cleanNetwork,
      walletAddress: cleanWallet,
      status: 'pending'
    }], { session });

    await session.commitTransaction();

    sendTelegramNotification(
      req.user.telegramId,
      `🔔 <b>تم تقديم طلب السحب بنجاح!</b>\nالمبلغ: <code>$${numAmt}</code>\nالرسوم: <code>$${FEE}</code>\nالصافي: <code>$${netAmount}</code>\nالشبكة: <code>${cleanNetwork}</code>\nالمحفظة: <code>${cleanWallet}</code>\nالحالة: ⏳ قيد المراجعة\n\nالدعم: ${CONFIG.SUPPORT_USERNAME}`
    );

    res.json({ success: true, withdraw: withdrawRequest[0] });
  } catch (err) {
    await session.abortTransaction();
    next(err);
  } finally {
    session.endSession();
  }
});

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
  const { sessionId, bridgeToken, duration } = req.body;
  if (!sessionId || !bridgeToken) {
    return res.status(400).json({ success: false, error: 'رمز حماية الجلسة مفقود' });
  }

  const lockKey = `proc_imp:${sessionId}`;
  const lockToken = await acquireLock(lockKey, 10000);
  if (!lockToken) {
    return res.status(429).json({ success: false, error: 'جاري معالجة الطلب بالفعل، يرجى الانتظار' });
  }

  const sessionDb = await mongoose.startSession();
  try {
    sessionDb.startTransaction();

    const cachedToken = await safeRedisGet(`bridge:token:${sessionId}`);
    if (cachedToken && cachedToken !== bridgeToken) {
      await sessionDb.abortTransaction();
      await releaseLock(lockKey, lockToken);
      return res.status(403).json({ success: false, error: 'تم اكتشاف محاولة تخطي غير مشروعة' });
    }

    const clickSession = await ClickSession.findById(sessionId).session(sessionDb);
    if (!clickSession || clickSession.ip !== req.ip) {
      await sessionDb.abortTransaction();
      await releaseLock(lockKey, lockToken);
      return res.status(403).json({ success: false, error: 'الجلسة غير صالحة' });
    }

    const dwellTime = Date.now() - new Date(clickSession.createdAt).getTime();
    if (dwellTime < 4800 && (Number(duration) || 0) < 5) {
      await sessionDb.abortTransaction();
      await releaseLock(lockKey, lockToken);
      return res.status(400).json({ success: false, error: 'لم يتم استيفاء وقت المكوث المطلوب (5 ثوانٍ)' });
    }

    let dailyIpClicks = 1;
    if (redisIsConnected) {
      const dailyIpClickKey = `daily:ip:${req.ip}`;
      dailyIpClicks = await redis.incr(dailyIpClickKey);
      if (dailyIpClicks === 1) {
        await redis.expire(dailyIpClickKey, 86400);
      }
    }

    const impLockKey = `imp:${clickSession.linkId}:${req.ip}`;
    const isDuplicate = await safeRedisGet(impLockKey);

    const link = await Link.findById(clickSession.linkId).populate('userId').session(sessionDb);
    await ClickSession.findByIdAndDelete(sessionId).session(sessionDb);
    await safeRedisDel(`bridge:token:${sessionId}`);

    if (!link) {
      await sessionDb.abortTransaction();
      await releaseLock(lockKey, lockToken);
      return res.status(404).json({ success: false, error: 'الرابط غير موجود' });
    }

    if (isDuplicate || dailyIpClicks > 20) {
      await Link.findByIdAndUpdate(link._id, { $inc: { views: 1, invalidImpressions: 1 } }, { session: sessionDb });
      await sessionDb.commitTransaction();
      await releaseLock(lockKey, lockToken);
      return res.json({ success: true, targetUrl: link.targetUrl, counted: false });
    }

    await safeRedisSet(impLockKey, '1', 'EX', 86400);

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
    }], { session: sessionDb });

    await Link.findByIdAndUpdate(link._id, { $inc: { views: 1, validImpressions: 1 } }, { session: sessionDb });

    if (clickSession.adSource === 'internal' && clickSession.adId) {
      const ad = await Ad.findById(clickSession.adId).session(sessionDb);
      
      if (ad && ad.remainingBudget >= 0.0015 && ad.status === 'active') {
        const costPerImpression = ad.costPerImpression || 0.0015;
        let publisherShare = ad.publisherEarningsPerImpression || 0.00135;
        
        ad.remainingBudget = Math.max(0, ad.remainingBudget - costPerImpression);
        ad.impressionsCount += 1;
        if (ad.remainingBudget < costPerImpression) {
          ad.status = 'completed';
        }
        await ad.save({ session: sessionDb });

        if (link.userId && link.userId.referredBy) {
          const refBonus = Math.round((publisherShare * 0.10 + Number.EPSILON) * 100000) / 100000;
          publisherShare = Math.round((publisherShare - refBonus + Number.EPSILON) * 100000) / 100000;

          await User.findByIdAndUpdate(
            link.userId.referredBy,
            { $inc: { availableBalance: refBonus, referralEarnings: refBonus } },
            { session: sessionDb }
          );
        }

        await User.findByIdAndUpdate(
          link.userId._id,
          { $inc: { pendingBalance: publisherShare } },
          { session: sessionDb }
        );

        const releaseDate = new Date();
        releaseDate.setDate(releaseDate.getDate() + 1);
        await EarningsHold.create([{
          userId: link.userId._id,
          telegramId: link.userId.telegramId,
          amount: publisherShare,
          releaseAt: releaseDate
        }], { session: sessionDb });
      }
    }

    await sessionDb.commitTransaction();
    await releaseLock(lockKey, lockToken);
    res.json({ success: true, targetUrl: link.targetUrl, counted: true });
  } catch (err) {
    await sessionDb.abortTransaction();
    await releaseLock(lockKey, lockToken);
    next(err);
  } finally {
    sessionDb.endSession();
  }
});

const handleShortenLink = async (req, res) => {
  try {
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ 
        success: false, 
        error: 'غير مصرح: معرف المستخدم (userId) مفقود' 
      });
    }

    const { title, targetUrl, url } = req.body;
    const cleanUrl = String(targetUrl || url || '').trim();

    if (!cleanUrl || !validUrl.isWebUri(cleanUrl)) {
      return res.status(400).json({ success: false, error: 'الرابط المستهدف غير صالح' });
    }

    if (isPhishingOrMalicious(cleanUrl)) {
      return res.status(400).json({ success: false, error: 'الرابط ينتهك معايير الأمان' });
    }

    try {
      const domainCheck = new URL(cleanUrl).hostname;
      if (domainCheck.includes(CONFIG.APP_DOMAIN)) {
        return res.status(400).json({ success: false, error: 'لا يمكن اختصار روابط الموقع نفسه' });
      }
    } catch (e) {}

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

    if (mongoose.Types.ObjectId.isValid(userId)) {
      await User.findByIdAndUpdate(userId, { $inc: { 'statsSummary.totalLinksCreated': 1 } }).catch(() => {});
    }

    const linkObj = newLink.toObject ? newLink.toObject() : newLink;
    const shortUrl = `https://${CONFIG.APP_DOMAIN}/r/${shortCode}`;

    return res.json({ 
      success: true, 
      link: {
        ...linkObj,
        shortUrl
      },
      shortUrl
    });
  } catch (err) {
    logger.error('❌ Error in Link Shortening Route:', err);
    return res.status(500).json({ 
      success: false, 
      error: 'حدث خطأ أثناء اختصار الرابط، يرجى المحاولة لاحقاً' 
    });
  }
};

app.post('/api/links/shorten', authMiddleware, linkCreationLimiter, handleShortenLink);
app.post('/api/links', authMiddleware, linkCreationLimiter, handleShortenLink);

const getUserLinks = async (userId) => {
  if (!userId) return [];

  const rawLinks = await Link.find({
    $or: [
      { userId: userId },
      { userId: userId.toString() }
    ]
  }).sort({ createdAt: -1 }).lean();

  return rawLinks.map(link => {
    const totalViews = link.views || 0;
    const validImp = link.validImpressions || 0;
    const ctr = totalViews > 0 ? ((validImp / totalViews) * 100).toFixed(1) : "0.0";
    return { 
      ...link, 
      ctr,
      shortUrl: `https://${CONFIG.APP_DOMAIN}/r/${link.shortCode}`
    };
  });
};

app.get('/api/links', authMiddleware, async (req, res, next) => {
  try {
    const links = await getUserLinks(req.userId);
    res.json({ success: true, links });
  } catch (err) {
    next(err);
  }
});

app.get('/api/user/links', authMiddleware, async (req, res, next) => {
  try {
    const links = await getUserLinks(req.userId);
    res.json({ success: true, links });
  } catch (err) {
    next(err);
  }
});

app.post('/api/links/toggle', authMiddleware, async (req, res, next) => {
  try {
    const { linkId } = req.body;
    const userId = req.userId;

    if (!userId) return res.status(401).json({ success: false, error: 'معرف المستخدم مفقود' });
    if (!mongoose.Types.ObjectId.isValid(linkId)) return res.status(400).json({ success: false, error: 'معرف الرابط غير صالح' });

    const link = await Link.findOne({ _id: linkId, $or: [{ userId: userId }, { userId: userId.toString() }] });
    if (!link) return res.status(404).json({ success: false, error: 'الرابط غير موجود أو لا تملك صلاحيات التعديل عليه' });

    link.isActive = !link.isActive;
    await link.save();
    await safeRedisDel(`link:data:${link.shortCode}`);

    res.json({ success: true, isActive: link.isActive });
  } catch (err) {
    next(err);
  }
});

app.post('/api/user/settings', authMiddleware, async (req, res, next) => {
  try {
    const { defaultWallet, language } = req.body;
    const updateData = {};
    
    if (defaultWallet !== undefined) updateData.defaultWallet = String(defaultWallet).trim();
    if (language !== undefined) updateData.language = String(language).trim().toLowerCase() || CONFIG.DEFAULT_LANGUAGE;

    await User.findByIdAndUpdate(req.userId, updateData);
    res.json({ success: true, message: 'تم تحديث الإعدادات بنجاح' });
  } catch (err) {
    next(err);
  }
});

// ==================================================
// --- 8. Admin Control Panel Gateway ---
// ==================================================
app.get('/api/admin/dashboard-data', authMiddleware, adminMiddleware, async (req, res, next) => {
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

app.post('/api/admin/deposit/action', authMiddleware, adminMiddleware, async (req, res, next) => {
  const { depositId, action, reason } = req.body;
  if (!mongoose.Types.ObjectId.isValid(depositId)) return res.status(400).json({ success: false, error: 'معرف الإيداع غير صالح' });

  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const deposit = await Deposit.findById(depositId).populate('advertiserId').session(session);

    if (!deposit || deposit.status !== 'pending') {
      await session.abortTransaction();
      return res.status(400).json({ success: false, error: 'طلب الإيداع غير موجود أو تم معالجته سابقاً' });
    }

    if (!['approved', 'rejected'].includes(action)) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, error: 'الإجراء غير صالح' });
    }

    deposit.status = action;
    if (action === 'rejected') {
      deposit.rejectReason = String(reason || 'لم يتم تحديد سبب').trim();
    }
    await deposit.save({ session });

    if (action === 'approved') {
      const targetUserId = deposit.userId || deposit.advertiserId._id;
      await User.findByIdAndUpdate(
        targetUserId,
        { $inc: { availableBalance: deposit.amount } },
        { session }
      );

      sendTelegramNotification(
        deposit.advertiserTelegramId || deposit.advertiserId.telegramId,
        `🎉 <b>تم تأكيد الإيداع!</b>\nتمت إضافة <code>$${deposit.amount}</code> إلى رصيدك المتاح.`
      );
    } else {
      sendTelegramNotification(
        deposit.advertiserTelegramId || deposit.advertiserId.telegramId,
        `❌ <b>تم رفض طلب الإيداع</b>\nالمبلغ: <code>$${deposit.amount}</code>\n⚠️ <b>السبب:</b> ${deposit.rejectReason}\n\nالدعم: ${CONFIG.SUPPORT_USERNAME}`
      );
    }

    await session.commitTransaction();
    res.json({ success: true, deposit });
  } catch (err) {
    await session.abortTransaction();
    next(err);
  } finally {
    session.endSession();
  }
});

app.post('/api/admin/withdraw/action', authMiddleware, adminMiddleware, async (req, res, next) => {
  const { withdrawId, action, reason } = req.body;
  if (!mongoose.Types.ObjectId.isValid(withdrawId)) return res.status(400).json({ success: false, error: 'معرف السحب غير صالح' });

  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const withdraw = await Withdraw.findById(withdrawId).populate('userId').session(session);

    if (!withdraw || withdraw.status !== 'pending') {
      await session.abortTransaction();
      return res.status(400).json({ success: false, error: 'طلب السحب غير موجود أو تم معالجته سابقاً' });
    }

    if (!['approved', 'rejected'].includes(action)) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, error: 'الإجراء غير صالح' });
    }

    withdraw.status = action;
    if (action === 'rejected') {
      withdraw.rejectReason = String(reason || 'لم يتم تحديد سبب').trim();
    }
    await withdraw.save({ session });

    if (action === 'rejected') {
      await User.findByIdAndUpdate(
        withdraw.userId._id, 
        { $inc: { availableBalance: withdraw.amount } }, 
        { session }
      );

      sendTelegramNotification(
        withdraw.telegramId || withdraw.userId.telegramId,
        `❌ <b>تم رفض طلب السحب</b>\nإجمالي المبلغ: <code>$${withdraw.amount}</code>\n⚠️ <b>السبب:</b> ${withdraw.rejectReason}\nتم إعادة المبلغ لرصيدك المتاح.\nالدعم: ${CONFIG.SUPPORT_USERNAME}`
      );
    } else if (action === 'approved') {
      sendTelegramNotification(
        withdraw.telegramId || withdraw.userId.telegramId,
        `🎉 <b>تمت الموافقة على السحب!</b>\nإجمالي المبلغ: <code>$${withdraw.amount}</code>\nالصافي المحول: <code>$${withdraw.netAmount}</code>\nالشبكة: <code>${withdraw.network}</code>\nشكراً لاستخدامك منصتنا!`
      );
    }

    await session.commitTransaction();
    res.json({ success: true, withdraw });
  } catch (err) {
    await session.abortTransaction();
    next(err);
  } finally {
    session.endSession();
  }
});

app.post('/api/admin/distribute-revenue', authMiddleware, adminMiddleware, async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const { totalRevenue } = req.body;
    const revenue = Number(totalRevenue);

    if (isNaN(revenue) || revenue <= 0) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, error: 'مبلغ الإيرادات غير صالح' });
    }

    const aggregateTotal = await Link.aggregate([
      { $group: { _id: null, total: { $sum: '$validImpressions' } } }
    ]).session(session);

    const totalImp = aggregateTotal[0]?.total || 0;
    if (totalImp === 0) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, error: 'لا توجد مشاهدات مؤكدة لتوزيع الأرباح' });
    }

    const links = await Link.find({ validImpressions: { $gt: 0 } }).populate('userId').session(session);
    
    const releaseDate = new Date();
    releaseDate.setDate(releaseDate.getDate() + 1);

    for (let link of links) {
      let earned = Number(((link.validImpressions / totalImp) * revenue).toFixed(4));

      if (link.userId && link.userId.referredBy) {
        const refBonus = Number((earned * 0.10).toFixed(4));
        earned = Number((earned - refBonus).toFixed(4));

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

    await session.commitTransaction();
    res.json({ success: true, message: `تم توزيع $${revenue} بنجاح على ${links.length} رابطاً.` });
  } catch (err) {
    await session.abortTransaction();
    next(err);
  } finally {
    session.endSession();
  }
});

app.post('/api/admin/user/toggle-ban', authMiddleware, adminMiddleware, async (req, res, next) => {
  const { userId } = req.body;
  if (!mongoose.Types.ObjectId.isValid(userId)) return res.status(400).json({ success: false, error: 'معرف المستخدم غير صالح' });

  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });

    user.isBanned = !user.isBanned;
    await user.save();

    if (user.isBanned) {
      sendTelegramNotification(user.telegramId, `🚫 <b>تنبيه من الإدارة:</b> تم حظر حسابك بسبب مخالفة الشروط.\nالدعم: ${CONFIG.SUPPORT_USERNAME}`);
    }

    res.json({ success: true, isBanned: user.isBanned });
  } catch (err) {
    next(err);
  }
});

// ==================================================
// --- 9. Cron Job System & Automation ---
// ==================================================
if (!process.env.VERCEL) {
  cron.schedule('0 0 * * *', async () => {
    try {
      const readyHolds = await EarningsHold.find({ releaseAt: { $lte: new Date() }, isReleased: false }).lean();

      for (let hold of readyHolds) {
        const session = await mongoose.startSession();
        try {
          session.startTransaction();
          
          const userUpdate = await User.findByIdAndUpdate(
            hold.userId,
            { $inc: { pendingBalance: -hold.amount, availableBalance: hold.amount } },
            { session, new: true }
          );

          await EarningsHold.findByIdAndUpdate(hold._id, { isReleased: true }, { session });

          await session.commitTransaction();

          if (userUpdate && userUpdate.telegramId) {
            sendTelegramNotification(
              userUpdate.telegramId,
              `✅ <b>تم إطلاق الأرباح!</b>\nتم تحويل <code>$${hold.amount.toFixed(4)}</code> إلى رصيدك المتاح.`
            );
          }
        } catch (err) {
          await session.abortTransaction();
          logger.error(`Error processing hold release for ID ${hold._id}: ${err.message}`);
        } finally {
          session.endSession();
        }
      }
    } catch (err) {
      logger.error('❌ Error executing Cron Settlement: ' + err.message);
    }
  });
}

// ==================================================
// --- 10. Static Routing & Error Handling Boundary ---
// ==================================================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views.html'));
});

app.get(['/app', '/admin', '/r/:code'], (req, res) => {
  res.sendFile(path.join(__dirname, 'views.html'));
});

app.use('/api/*', (req, res) => {
  res.status(404).json({ success: false, error: 'المسار المطلوب غير موجود' });
});

app.use((err, req, res, next) => {
  logger.error('Unhandled Application Error:', err);

  const statusCode = err.status || err.statusCode || 500;
  const message = CONFIG.ENV === 'production' 
    ? 'حدث خطأ غير متوقع في الخادم' 
    : (err.message || 'خطأ داخلي');

  res.status(statusCode).json({
    success: false,
    error: message,
    ...(CONFIG.ENV !== 'production' && { stack: err.stack })
  });
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception Detected: ' + err.stack);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// ==================================================
// --- 11. Export / Boot Initialization ---
// ==================================================
if (process.env.VERCEL) {
  module.exports = app;
} else {
  app.listen(CONFIG.PORT, () => console.log(`🚀 Ultra-Enterprise Server V8 Active on Port ${CONFIG.PORT}`));
}
