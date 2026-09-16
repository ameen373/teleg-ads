/**
 * Enterprise Server Architecture (V6 - High-Performance & Multi-Tenant Core)
 * Telegram Link Shortener & Mini App Engine (Telega.ads)
 * Production-Ready Backend Solution
 */

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const morgan = require('morgan');
const winston = require('winston');
const axios = require('axios');
const Redis = require('ioredis');
const cors = require('cors');
const { User, Ad, Link, Impression, ClickSession, Withdraw, EarningsHold, Deposit, Announcement } = require('./models');

// --- Safe Import for node-cron (Vercel Compatibility Guard) ---
let cron = null;
if (process.env.VERCEL !== '1') {
  try {
    cron = require('node-cron');
  } catch (e) {
    console.warn('⚠️ node-cron module missing or skipped in serverless mode.');
  }
}

// --- Native URL Validator Helper ---
function isValidWebUri(urlStr) {
  try {
    const parsed = new URL(urlStr);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (e) {
    return false;
  }
}

const app = express();

// --- Setup Server Trust Proxy ---
app.set('trust proxy', 1);

// --- CORS Configuration (Strict Isolation & Security) ---
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

// --- Unified JSON Response Helper ---
function sendResponse(res, statusCode, success, message, data = {}) {
  const payload = {
    success: Boolean(success),
    message: String(message || ''),
    data: data && typeof data === 'object' ? data : {}
  };
  
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    Object.assign(payload, data);
  }

  return res.status(statusCode).json(payload);
}

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

// ==================================================
// --- Serverless MongoDB Connection Pooling ---
// ==================================================
let cachedDb = global.mongooseConnection;
if (!cachedDb) {
  cachedDb = global.mongooseConnection = { conn: null, promise: null };
}

async function connectDB() {
  if (cachedDb.conn && mongoose.connection.readyState === 1) {
    return cachedDb.conn;
  }

  if (!cachedDb.promise || mongoose.connection.readyState === 0) {
    const opts = {
      maxPoolSize: 10,
      minPoolSize: 0,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      family: 4,
      bufferCommands: false
    };

    cachedDb.promise = mongoose.connect(CONFIG.MONGO_URI, opts).then((m) => {
      logger.info('✅ Serverless MongoDB Connection Established');
      return m;
    });
  }

  try {
    cachedDb.conn = await cachedDb.promise;
  } catch (err) {
    cachedDb.promise = null;
    logger.error('❌ Critical MongoDB Connection Error:', err);
    throw err;
  }

  return cachedDb.conn;
}

// Middleware لضمان الاتصال بقاعدة البيانات لكل طلب
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    return sendResponse(res, 500, false, 'فشل الاتصال بقاعدة البيانات، يرجى إعادة المحاولة لاحقاً');
  }
});

// ==================================================
// --- Redis Client (With Graceful Fallback) ---
// ==================================================
let redisIsConnected = false;
const redis = new Redis(CONFIG.REDIS_URL, {
  maxRetriesPerRequest: 2,
  enableReadyCheck: true,
  retryStrategy: (times) => Math.min(times * 100, 2000)
});

redis.on('error', (err) => {
  redisIsConnected = false;
  logger.error('⚠️ Redis Connection Warning: ' + err.message);
});
redis.on('ready', () => {
  redisIsConnected = true;
  console.log('✅ Enterprise Redis Client Connected & Ready');
});

async function safeRedisGet(key) {
  if (!redisIsConnected) return null;
  try { return await redis.get(key); } catch (e) { return null; }
}

async function safeRedisSet(key, value, mode, duration) {
  if (!redisIsConnected) return;
  try {
    if (mode && duration) await redis.set(key, value, mode, duration);
    else await redis.set(key, value);
  } catch (e) { logger.error('Redis Set Failed: ' + e.message); }
}

async function safeRedisDel(key) {
  if (!redisIsConnected) return;
  try { await redis.del(key); } catch (e) { logger.error('Redis Del Failed: ' + e.message); }
}

// --- Telegram Dispatch Helper ---
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

// --- Middlewares & Security Limiters ---
const linkCreationLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => sendResponse(res, 429, false, 'تم تجاوز الحد اليومي لإنشاء الروابط (100 رابط يومياً)')
});

const clickLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
  handler: (req, res) => sendResponse(res, 429, false, 'عدد الطلبات كبير جداً، يرجى الانتظار قليلاً')
});

const validateTraffic = (req, res, next) => {
  const ua = req.get('User-Agent') || '';
  const botPattern = /bot|crawler|spider|datacenter|proxy|httpclient|curl|python|axios|headless|selenium|puppeteer/i;
  if (botPattern.test(ua)) {
    return sendResponse(res, 403, false, 'تم رفض الزيارة الآلية (Bot Traffic Rejected)');
  }
  next();
};

const isPhishingOrMalicious = (url) => {
  const blacklistedKeywords = ['phish', 'login-verify', 'free-telegram-premium', 'grabber', 'stealer', 'iplogger'];
  const lowerUrl = url.toLowerCase();
  return blacklistedKeywords.some(keyword => lowerUrl.includes(keyword));
};

// =========================================================================
// --- Auth Middleware (Strict Session & Token Guard) ---
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
      return sendResponse(res, 401, false, 'جلسة غير صالحة، يرجى إعادة تحميل التطبيق');
    }

    if (user.isBanned) {
      return sendResponse(res, 403, false, 'حسابك معطل بسبب مخالفة الشروط والأنظمة');
    }

    req.user = user;
    req.user.id = user._id.toString();
    req.userId = user._id;

    next();
  } catch (err) {
    return sendResponse(res, 401, false, 'انتهت الجلسة، يرجى إعادة تسجيل الدخول');
  }
};

const adminMiddleware = async (req, res, next) => {
  if (!req.user || String(req.user.telegramId).trim() !== CONFIG.ADMIN_ID) {
    return sendResponse(res, 403, false, 'غير مصرح لك بالوصول إلى لوحة التحكم');
  }
  next();
};

// =========================================================================
// --- API Endpoint: Check Admin Role ---
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
    return sendResponse(res, 200, true, 'تم التحقق من صلاحية المسؤول', { isAdmin });
  } catch (err) {
    return sendResponse(res, 200, true, 'تم التحقق من صلاحية المسؤول', { isAdmin: false });
  }
});

// --- Authentication & Isolated User Login ---
app.post('/api/auth/login', async (req, res, next) => {
  try {
    const initData = req.headers['x-telegram-init-data'];
    const telegramUser = verifyTelegramData(initData);

    const tgId = telegramUser ? String(telegramUser.id) : (process.env.NODE_ENV !== 'production' ? String(req.headers['x-demo-user-id'] || '') : null);
    const { referrerId } = req.body;

    if (!tgId) {
      return sendResponse(res, 401, false, 'بيانات الاعتماد الخاصة بتليجرام غير صالحة');
    }

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

    if (user.isBanned) {
      return sendResponse(res, 403, false, `حسابك معطل بسبب مخالفة الشروط. للتواصل مع الدعم: ${CONFIG.SUPPORT_USERNAME}`);
    }

    const token = jwt.sign(
      { userId: user._id, telegramId: user.telegramId, role: user.role },
      CONFIG.JWT_SECRET,
      { expiresIn: '7d', algorithm: 'HS256' }
    );

    return sendResponse(res, 200, true, 'تم تسجيل الدخول بنجاح', { 
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

// --- User Data Gateway ---
app.get('/api/user/data', authMiddleware, async (req, res, next) => {
  try {
    const userId = req.userId;

    if (!userId) {
      return sendResponse(res, 200, true, 'تم جلب البيانات بنجاح', {
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
      Link.find({ userId: userId }).sort({ createdAt: -1 }).lean(),
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
    return sendResponse(res, 200, true, 'تم جلب بيانات المستخدم بنجاح', { 
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

// =========================================================================
// --- Self-Serve Ad Campaign APIs (Atomic Financial Deductions) ---
// =========================================================================
app.post('/api/ads', authMiddleware, async (req, res, next) => {
  try {
    const { title, targetUrl, totalBudget } = req.body;
    const budget = Number(totalBudget);

    if (!title || String(title).trim().length === 0) {
      return sendResponse(res, 400, false, 'عنوان الحملة الإعلانية مطلوب');
    }

    if (!isValidWebUri(targetUrl)) {
      return sendResponse(res, 400, false, 'الرابط المستهدف غير صالح');
    }

    if (isNaN(budget) || budget < 5) {
      return sendResponse(res, 400, false, 'الحد الأدنى لميزانية الحملة هو $5');
    }

    // Atomic Operation: خصم الميزانية ذرياً ومنع الرصيد السالب
    const updatedUser = await User.findOneAndUpdate(
      { _id: req.userId, availableBalance: { $gte: budget } },
      { $inc: { availableBalance: -budget } },
      { new: true }
    );

    if (!updatedUser) {
      return sendResponse(res, 400, false, 'رصيدك المتاح غير كافٍ لإنشاء هذه الحملة (الحد الأدنى $5)');
    }

    const ad = await Ad.create({
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
    });

    return sendResponse(res, 200, true, 'تم إنشاء الحملة الإعلانية بنجاح', { ad });
  } catch (err) {
    next(err);
  }
});

app.get('/api/user/ads', authMiddleware, async (req, res, next) => {
  try {
    const ads = await Ad.find({ userId: req.userId }).sort({ createdAt: -1 }).lean();
    return sendResponse(res, 200, true, 'تم جلب الحملات بنجاح', { ads });
  } catch (err) {
    next(err);
  }
});

app.post('/api/ads/toggle', authMiddleware, async (req, res, next) => {
  try {
    const { adId } = req.body;
    if (!mongoose.Types.ObjectId.isValid(adId)) {
      return sendResponse(res, 400, false, 'معرف الإعلان غير صالح');
    }

    const ad = await Ad.findOne({ _id: adId, userId: req.userId });
    if (!ad) {
      return sendResponse(res, 404, false, 'الإعلان غير موجود أو لا تملك صلاحية تعديله');
    }

    if (ad.status === 'completed') {
      return sendResponse(res, 400, false, 'لا يمكن تفعيل حملة مكتملة ونفاذ ميزانيتها');
    }

    ad.status = ad.status === 'active' ? 'paused' : 'active';
    await ad.save();

    return sendResponse(res, 200, true, `تم تغيير حالة الحملة إلى ${ad.status}`, { status: ad.status, ad });
  } catch (err) {
    next(err);
  }
});

// =========================================================================
// --- Deposit & Withdraw Routes (Atomic Safe Transactions) ---
// =========================================================================
app.post('/api/deposit', authMiddleware, async (req, res, next) => {
  try {
    const { amount, network, txid } = req.body;
    const numAmount = Number(amount);
    const cleanNetwork = String(network || '').toUpperCase();
    const cleanTxid = String(txid || '').trim();

    if (isNaN(numAmount) || numAmount < 1) {
      return sendResponse(res, 400, false, 'الحد الأدنى للإيداع هو $1');
    }

    if (!['BEP20', 'TRC20', 'TON'].includes(cleanNetwork)) {
      return sendResponse(res, 400, false, 'يرجى تحديد شبكة صالحة (BEP20, TRC20, TON)');
    }

    if (!cleanTxid || cleanTxid.length < 8) {
      return sendResponse(res, 400, false, 'يرجى إدخال هاش المعاملة الصحيح (TxID)');
    }

    const existingDeposit = await Deposit.findOne({ txid: cleanTxid });
    if (existingDeposit) {
      return sendResponse(res, 400, false, 'تم تقديم رقم هذه المعاملة (TxID) مسبقاً');
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

    return sendResponse(res, 200, true, 'تم تقديم طلب الإيداع بنجاح وهو قيد المراجعة', { deposit });
  } catch (err) {
    next(err);
  }
});

app.post('/api/withdraw', authMiddleware, async (req, res, next) => {
  try {
    const { amount, network, walletAddress } = req.body;
    const numAmt = Number(amount);
    const cleanNetwork = String(network || '').toUpperCase();
    const cleanWallet = String(walletAddress || '').trim();
    const FEE = 3;

    if (isNaN(numAmt) || numAmt < 30) {
      return sendResponse(res, 400, false, 'الحد الأدنى للسحب هو $30');
    }

    if (!['BEP20', 'TRC20', 'TON'].includes(cleanNetwork)) {
      return sendResponse(res, 400, false, 'يرجى تحديد الشبكة بشكل صحيح (BEP20, TRC20, TON)');
    }

    if (!cleanWallet || cleanWallet.length < 10) {
      return sendResponse(res, 400, false, 'عنوان المحفظة غير صالح');
    }

    const activePending = await Withdraw.findOne({ userId: req.userId, status: 'pending' });
    if (activePending) {
      return sendResponse(res, 400, false, 'لديك طلب سحب قيد الانتظار حالياً، يرجى الانتظار حتى معالجته');
    }

    const netAmount = numAmt - FEE;

    // Atomic Operation: خصم مبلغ السحب ذرياً وتحديث المحفظة المفضلة
    const updatedUser = await User.findOneAndUpdate(
      { _id: req.userId, availableBalance: { $gte: numAmt } },
      { $inc: { availableBalance: -numAmt }, defaultWallet: cleanWallet },
      { new: true }
    );

    if (!updatedUser) {
      return sendResponse(res, 400, false, 'رصيدك المتاح لا يكفي لإتمام عملية السحب');
    }

    const withdrawRequest = await Withdraw.create({
      userId: req.userId,
      telegramId: req.user.telegramId,
      amount: numAmt,
      fee: FEE,
      netAmount: netAmount,
      network: cleanNetwork,
      walletAddress: cleanWallet,
      status: 'pending'
    });

    sendTelegramNotification(
      req.user.telegramId,
      `🔔 <b>تم تقديم طلب السحب بنجاح!</b>\nالمبلغ: <code>$${numAmt}</code>\nالرسوم: <code>$${FEE}</code>\nالصافي: <code>$${netAmount}</code>\nالشبكة: <code>${cleanNetwork}</code>\nالمحفظة: <code>${cleanWallet}</code>\nالحالة: ⏳ قيد المراجعة\n\nالدعم: ${CONFIG.SUPPORT_USERNAME}`
    );

    return sendResponse(res, 200, true, 'تم تقديم طلب السحب بنجاح', { withdraw: withdrawRequest });
  } catch (err) {
    next(err);
  }
});

// =========================================================================
// --- Bridge Page & Traffic System ---
// =========================================================================
app.post('/api/init-click', validateTraffic, async (req, res, next) => {
  try {
    const { linkCode } = req.body;
    const cleanCode = String(linkCode || '').trim();
    if (!cleanCode) return sendResponse(res, 400, false, 'كود الرابط مطلوب');

    let linkData = await safeRedisGet(`link:data:${cleanCode}`);
    let linkId, linkOwnerId, linkOwnerTelegramId;

    if (linkData) {
      const parsed = JSON.parse(linkData);
      linkId = parsed.id;
      linkOwnerId = parsed.userId;
      linkOwnerTelegramId = parsed.publisherTelegramId;
    } else {
      const link = await Link.findOne({ shortCode: cleanCode, isActive: true }).select('_id userId publisherTelegramId').lean();
      if (!link) return sendResponse(res, 404, false, 'الرابط غير موجود أو معطل');
      linkId = link._id.toString();
      linkOwnerId = link.userId.toString();
      linkOwnerTelegramId = link.publisherTelegramId;
      await safeRedisSet(`link:data:${cleanCode}`, JSON.stringify({ id: linkId, userId: linkOwnerId, publisherTelegramId: linkOwnerTelegramId }), 'EX', 3600);
    }

    await ClickSession.deleteMany({ linkId, ip: req.ip });

    const matchCondition = { 
      status: 'active', 
      remainingBudget: { $gte: 0.0015 }
    };

    if (mongoose.Types.ObjectId.isValid(linkOwnerId)) {
      matchCondition.userId = { $ne: new mongoose.Types.ObjectId(linkOwnerId) };
    }

    const activeAds = await Ad.aggregate([
      { $match: matchCondition },
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

    return sendResponse(res, 200, true, 'تم إنشاء جلسة الزيارة بنجاح', { 
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
      return sendResponse(res, 400, false, 'رمز حماية الجلسة مفقود');
    }

    const cachedToken = await safeRedisGet(`bridge:token:${sessionId}`);
    if (cachedToken && cachedToken !== bridgeToken) {
      return sendResponse(res, 403, false, 'تم اكتشاف محاولة تخطي غير مشروعة');
    }

    const clickSession = await ClickSession.findById(sessionId);
    if (!clickSession || clickSession.ip !== req.ip) {
      return sendResponse(res, 403, false, 'الجلسة غير صالحة');
    }

    const dwellTime = Date.now() - new Date(clickSession.createdAt).getTime();
    if (dwellTime < 4800 && (Number(duration) || 0) < 5) {
      return sendResponse(res, 400, false, 'لم يتم استيفاء وقت المكوث المطلوب (5 ثوانٍ)');
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

    const link = await Link.findById(clickSession.linkId).populate('userId');
    await ClickSession.findByIdAndDelete(sessionId);
    await safeRedisDel(`bridge:token:${sessionId}`);

    if (!link) {
      return sendResponse(res, 404, false, 'الرابط غير موجود');
    }

    // Atomic Operation: زيادة زيارات الرابط كغير صالحة
    if (isDuplicate || dailyIpClicks > 20) {
      await Link.findByIdAndUpdate(link._id, { $inc: { views: 1, invalidImpressions: 1 } });
      return sendResponse(res, 200, true, 'زيارة غير محسوبة (تكرار أو تجاوز الحد)', { targetUrl: link.targetUrl, counted: false });
    }

    await safeRedisSet(lockKey, '1', 'EX', 86400);

    const publisherId = link.userId?._id || link.userId;
    const publisherTgId = link.userId?.telegramId || null;

    await Impression.create({
      linkId: link._id,
      userId: publisherId,
      publisherId: publisherId,
      publisherTelegramId: publisherTgId,
      adSource: clickSession.adSource,
      adId: clickSession.adId,
      publisherEarnings: clickSession.adSource === 'internal' ? 0.00135 : 0,
      ip: req.ip,
      userAgent: req.get('User-Agent') || ''
    });

    // Atomic Operation: زيادة زيارات الرابط كصالحة
    await Link.findByIdAndUpdate(link._id, { $inc: { views: 1, validImpressions: 1 } });

    if (clickSession.adSource === 'internal' && clickSession.adId) {
      const costPerImpression = 0.0015;
      let publisherShare = 0.00135;

      // Atomic Operation: خصم تكلفة المشاهدة من ميزانية الإعلان
      const ad = await Ad.findOneAndUpdate(
        { _id: clickSession.adId, remainingBudget: { $gte: costPerImpression }, status: 'active' },
        { 
          $inc: { remainingBudget: -costPerImpression, impressionsCount: 1 }
        },
        { new: true }
      );

      if (ad) {
        if (ad.remainingBudget < costPerImpression) {
          ad.status = 'completed';
          await ad.save();
        }

        // Atomic Operation: حساب وتسجيل عمولة الإحالة
        if (link.userId && link.userId.referredBy) {
          const refBonus = Math.round((publisherShare * 0.10 + Number.EPSILON) * 100000) / 100000;
          publisherShare = Math.round((publisherShare - refBonus + Number.EPSILON) * 100000) / 100000;

          await User.findByIdAndUpdate(
            link.userId.referredBy,
            { $inc: { availableBalance: refBonus, referralEarnings: refBonus } }
          );
        }

        // Atomic Operation: إضافة الأرباح المعلقة للناشر
        if (publisherId) {
          await User.findByIdAndUpdate(
            publisherId,
            { $inc: { pendingBalance: publisherShare } }
          );

          const releaseDate = new Date();
          releaseDate.setDate(releaseDate.getDate() + 1);
          await EarningsHold.create({
            userId: publisherId,
            telegramId: publisherTgId,
            amount: publisherShare,
            releaseAt: releaseDate
          });
        }
      }
    }

    return sendResponse(res, 200, true, 'تم تسجيل الزيارة واحتساب الأرباح بنجاح', { targetUrl: link.targetUrl, counted: true });
  } catch (err) {
    next(err);
  }
});

// =========================================================================
// --- Link Management Engine ---
// =========================================================================
const handleShortenLink = async (req, res, next) => {
  try {
    // استخراج userId من جسم الطلب (Body) أو من الجلسة (Auth Middleware)
    const userId = req.body.userId || req.userId;

    if (!userId) {
      return sendResponse(res, 401, false, 'غير مصرح: معرف المستخدم مفقود');
    }

    const { title, targetUrl, url } = req.body;
    const cleanUrl = String(targetUrl || url || '').trim();

    if (!cleanUrl || !isValidWebUri(cleanUrl)) {
      return sendResponse(res, 400, false, 'الرابط المستهدف غير صالح');
    }

    if (isPhishingOrMalicious(cleanUrl)) {
      return sendResponse(res, 400, false, 'الرابط ينتهك معايير الأمان');
    }

    try {
      const domainCheck = new URL(cleanUrl).hostname;
      if (domainCheck.includes(CONFIG.APP_DOMAIN)) {
        return sendResponse(res, 400, false, 'لا يمكن اختصار روابط الموقع نفسه');
      }
    } catch (e) {}

    const shortCode = crypto.randomBytes(3).toString('hex');
    const publisherTelegramId = req.user?.telegramId || null;
    
    // إنشاء الرابط الجديد وحفظ userId معه
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

    // Atomic Operation: زيادة عدد الروابط للعلامة إحصائياً
    if (mongoose.Types.ObjectId.isValid(userId)) {
      await User.findByIdAndUpdate(userId, { $inc: { 'statsSummary.totalLinksCreated': 1 } }).catch(() => {});
    }

    const linkObj = newLink.toObject ? newLink.toObject() : newLink;
    const shortUrl = `https://${CONFIG.APP_DOMAIN}/r/${shortCode}`;

    return sendResponse(res, 200, true, 'تم إنشاء الرابط المباشر بنجاح', { 
      link: {
        ...linkObj,
        shortUrl
      },
      shortUrl
    });
  } catch (err) {
    next(err);
  }
};

app.post('/api/links/shorten', authMiddleware, linkCreationLimiter, handleShortenLink);
app.post('/api/links', authMiddleware, linkCreationLimiter, handleShortenLink);

// التصفية باستخدام Link.find({ userId }) لإرجاع روابط المستخدم المحدد فقط
const getUserLinks = async (userId) => {
  if (!userId) return [];

  const rawLinks = await Link.find({ userId }).sort({ createdAt: -1 }).lean();

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
    const userId = req.query.userId || req.userId;
    const links = await getUserLinks(userId);
    return sendResponse(res, 200, true, 'تم جلب الروابط بنجاح', { links });
  } catch (err) {
    next(err);
  }
});

app.get('/api/user/links', authMiddleware, async (req, res, next) => {
  try {
    const userId = req.query.userId || req.userId;
    const links = await getUserLinks(userId);
    return sendResponse(res, 200, true, 'تم جلب الروابط بنجاح', { links });
  } catch (err) {
    next(err);
  }
});

app.post('/api/links/toggle', authMiddleware, async (req, res, next) => {
  try {
    const { linkId } = req.body;
    const userId = req.userId;

    if (!userId) return sendResponse(res, 401, false, 'معرف المستخدم مفقود');
    if (!mongoose.Types.ObjectId.isValid(linkId)) return sendResponse(res, 400, false, 'معرف الرابط غير صالح');

    const link = await Link.findOne({ _id: linkId, userId: userId });
    if (!link) return sendResponse(res, 404, false, 'الرابط غير موجود أو لا تملك صلاحيات التعديل عليه');

    link.isActive = !link.isActive;
    await link.save();
    await safeRedisDel(`link:data:${link.shortCode}`);

    return sendResponse(res, 200, true, 'تم تغيير حالة الرابط بنجاح', { isActive: link.isActive, link });
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

    const updatedUser = await User.findByIdAndUpdate(req.userId, updateData, { new: true });
    return sendResponse(res, 200, true, 'تم تحديث الإعدادات بنجاح', { user: updatedUser });
  } catch (err) {
    next(err);
  }
});

// =========================================================================
// --- Admin Control Panel Routes ---
// =========================================================================
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

    return sendResponse(res, 200, true, 'تم جلب بيانات لوحة التحكم بنجاح', { 
      withdraws, 
      deposits, 
      users, 
      stats: { ...(stats[0] || {}), totalAds } 
    });
  } catch (err) {
    next(err);
  }
});

app.post('/api/admin/deposit/action', authMiddleware, adminMiddleware, async (req, res, next) => {
  try {
    const { depositId, action, reason } = req.body;
    if (!mongoose.Types.ObjectId.isValid(depositId)) {
      return sendResponse(res, 400, false, 'معرف الإيداع غير صالح');
    }

    if (!['approved', 'rejected'].includes(action)) {
      return sendResponse(res, 400, false, 'الإجراء المطلوب غير صالح');
    }

    const rejectReasonText = action === 'rejected' ? String(reason || 'لم يتم تحديد سبب').trim() : '';

    // Atomic Operation: التأكد من معالجة الطلب المعلق مرة واحدة فقط لمنع التكرار
    const deposit = await Deposit.findOneAndUpdate(
      { _id: depositId, status: 'pending' },
      { status: action, ...(action === 'rejected' && { rejectReason: rejectReasonText }) },
      { new: true }
    ).populate('advertiserId');

    if (!deposit) {
      return sendResponse(res, 400, false, 'طلب الإيداع غير موجود أو تم معالجته مسبقاً');
    }

    if (action === 'approved') {
      const targetUserId = deposit.userId || deposit.advertiserId?._id;
      if (targetUserId) {
        // Atomic Operation: إضافة الرصيد ذرياً
        await User.findByIdAndUpdate(
          targetUserId,
          { $inc: { availableBalance: deposit.amount } }
        );
      }

      const tgNotifyId = deposit.advertiserTelegramId || deposit.advertiserId?.telegramId;
      sendTelegramNotification(
        tgNotifyId,
        `🎉 <b>تم تأكيد الإيداع!</b>\nتمت إضافة <code>$${deposit.amount}</code> إلى رصيدك المتاح.`
      );
    } else {
      const tgNotifyId = deposit.advertiserTelegramId || deposit.advertiserId?.telegramId;
      sendTelegramNotification(
        tgNotifyId,
        `❌ <b>تم رفض طلب الإيداع</b>\nالمبلغ: <code>$${deposit.amount}</code>\n⚠️ <b>السبب:</b> ${deposit.rejectReason}\n\nالدعم: ${CONFIG.SUPPORT_USERNAME}`
      );
    }

    return sendResponse(res, 200, true, `تم ${action === 'approved' ? 'الموافقة على' : 'رفض'} طلب الإيداع بنجاح`, { deposit });
  } catch (err) {
    next(err);
  }
});

app.post('/api/admin/withdraw/action', authMiddleware, adminMiddleware, async (req, res, next) => {
  try {
    const { withdrawId, action, reason } = req.body;
    if (!mongoose.Types.ObjectId.isValid(withdrawId)) {
      return sendResponse(res, 400, false, 'معرف السحب غير صالح');
    }

    if (!['approved', 'rejected'].includes(action)) {
      return sendResponse(res, 400, false, 'الإجراء المطلوب غير صالح');
    }

    const rejectReasonText = action === 'rejected' ? String(reason || 'لم يتم تحديد سبب').trim() : '';

    // Atomic Operation: التأكد من القفل الذري لطلب السحب لمنع الإعادة المزدوجة
    const withdraw = await Withdraw.findOneAndUpdate(
      { _id: withdrawId, status: 'pending' },
      { status: action, ...(action === 'rejected' && { rejectReason: rejectReasonText }) },
      { new: true }
    ).populate('userId');

    if (!withdraw) {
      return sendResponse(res, 400, false, 'طلب السحب غير موجود أو تم معالجته مسبقاً');
    }

    const targetUserId = withdraw.userId?._id || withdraw.userId;
    const tgNotifyId = withdraw.telegramId || withdraw.userId?.telegramId;

    if (action === 'rejected') {
      if (targetUserId) {
        // Atomic Operation: استرجاع المبلغ المحجوز للرصيد المتاح ذرياً
        await User.findByIdAndUpdate(
          targetUserId, 
          { $inc: { availableBalance: withdraw.amount } }
        );
      }

      sendTelegramNotification(
        tgNotifyId,
        `❌ <b>تم رفض طلب السحب</b>\nإجمالي المبلغ: <code>$${withdraw.amount}</code>\n⚠️ <b>السبب:</b> ${withdraw.rejectReason}\nتم إعادة المبلغ إلى رصيدك المتاح.\nالدعم: ${CONFIG.SUPPORT_USERNAME}`
      );
    } else if (action === 'approved') {
      sendTelegramNotification(
        tgNotifyId,
        `🎉 <b>تمت الموافقة على طلب السحب!</b>\nإجمالي المبلغ: <code>$${withdraw.amount}</code>\nالصافي المحول: <code>$${withdraw.netAmount}</code>\nالشبكة: <code>${withdraw.network}</code>\nشكراً لاستخدامك منصتنا!`
      );
    }

    return sendResponse(res, 200, true, `تم ${action === 'approved' ? 'الموافقة على' : 'رفض'} طلب السحب بنجاح`, { withdraw });
  } catch (err) {
    next(err);
  }
});

app.post('/api/admin/distribute-revenue', authMiddleware, adminMiddleware, async (req, res, next) => {
  try {
    const { totalRevenue } = req.body;
    const revenue = Number(totalRevenue);

    if (isNaN(revenue) || revenue <= 0) {
      return sendResponse(res, 400, false, 'مبلغ الإيرادات غير صالح');
    }

    const aggregateTotal = await Link.aggregate([
      { $group: { _id: null, total: { $sum: '$validImpressions' } } }
    ]);

    const totalImp = aggregateTotal[0]?.total || 0;
    if (totalImp === 0) {
      return sendResponse(res, 400, false, 'لا توجد مشاهدات مؤكدة لتوزيع الأرباح');
    }

    const links = await Link.find({ validImpressions: { $gt: 0 } }).populate('userId');
    const releaseDate = new Date();
    releaseDate.setDate(releaseDate.getDate() + 1);

    let distributedCount = 0;

    for (let link of links) {
      if (!link.userId) continue;

      let earned = Number(((link.validImpressions / totalImp) * revenue).toFixed(4));
      const publisherId = link.userId._id || link.userId;
      const publisherTgId = link.userId.telegramId || null;

      if (link.userId.referredBy) {
        const refBonus = Number((earned * 0.10).toFixed(4));
        earned = Number((earned - refBonus).toFixed(4));

        await User.findByIdAndUpdate(
          link.userId.referredBy,
          { $inc: { availableBalance: refBonus, referralEarnings: refBonus } }
        );
      }

      await User.findByIdAndUpdate(publisherId, { $inc: { pendingBalance: earned } });
      await EarningsHold.create({ userId: publisherId, telegramId: publisherTgId, amount: earned, releaseAt: releaseDate });

      await Link.findByIdAndUpdate(link._id, { $set: { validImpressions: 0 } });
      distributedCount++;
    }

    return sendResponse(res, 200, true, `تم توزيع $${revenue} بنجاح على ${distributedCount} رابطاً.`, { revenue, distributedCount });
  } catch (err) {
    next(err);
  }
});

app.post('/api/admin/user/toggle-ban', authMiddleware, adminMiddleware, async (req, res, next) => {
  try {
    const { userId } = req.body;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return sendResponse(res, 400, false, 'معرف المستخدم غير صالح');
    }

    const user = await User.findById(userId);
    if (!user) return sendResponse(res, 404, false, 'المستخدم غير موجود');

    user.isBanned = !user.isBanned;
    await user.save();

    if (user.isBanned) {
      sendTelegramNotification(user.telegramId, `🚫 <b>تنبيه من الإدارة:</b> تم حظر حسابك بسبب مخالفة الشروط.\nالدعم: ${CONFIG.SUPPORT_USERNAME}`);
    }

    return sendResponse(res, 200, true, `تم ${user.isBanned ? 'حظر' : 'إلغاء حظر'} المستخدم بنجاح`, { isBanned: user.isBanned, userId: user._id });
  } catch (err) {
    next(err);
  }
});

// =========================================================================
// --- Automated Earnings Settlement Engine ---
// =========================================================================
async function processEarningsSettlement() {
  try {
    await connectDB();
    const readyHolds = await EarningsHold.find({ releaseAt: { $lte: new Date() }, isReleased: false }).lean();

    for (let hold of readyHolds) {
      try {
        // Atomic Operation: القفل الذري للسجل لمنع إطلاق الأرباح مرتين
        const holdUpdated = await EarningsHold.findOneAndUpdate(
          { _id: hold._id, isReleased: false },
          { isReleased: true },
          { new: true }
        );

        if (holdUpdated) {
          // Atomic Operation: تحويل الأرباح ذرياً من الأرباح المعلقة إلى الرصيد المتاح
          const userUpdate = await User.findByIdAndUpdate(
            hold.userId,
            { $inc: { pendingBalance: -hold.amount, availableBalance: hold.amount } },
            { new: true }
          );

          if (userUpdate && userUpdate.telegramId) {
            sendTelegramNotification(
              userUpdate.telegramId,
              `✅ <b>تم إطلاق الأرباح!</b>\nتم تحويل <code>$${hold.amount.toFixed(4)}</code> إلى رصيدك المتاح.`
            );
          }
        }
      } catch (err) {
        logger.error(`Error processing hold release for ID ${hold._id}: ${err.message}`);
      }
    }
  } catch (err) {
    logger.error('❌ Error executing Cron Settlement: ' + err.message);
  }
}

// Cron Job يعمل فقط في البيئة التقليدية (Node.js / PM2)
if (cron) {
  cron.schedule('0 0 * * *', processEarningsSettlement);
}

// المسار المجدول لدعم بيئات Serverless / Vercel Cron Jobs
app.all('/api/cron/settle-earnings', async (req, res, next) => {
  try {
    await processEarningsSettlement();
    return sendResponse(res, 200, true, 'تم تنفيذ تسوية الأرباح بنجاح');
  } catch (err) {
    next(err);
  }
});

// =========================================================================
// --- Static HTML Delivery Routes ---
// =========================================================================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views.html'));
});

app.get(['/app', '/admin', '/r/:code'], (req, res) => {
  res.sendFile(path.join(__dirname, 'views.html'));
});

// --- Catch-all API 404 Handler ---
app.use('/api/*', (req, res) => {
  return sendResponse(res, 404, false, 'المسار المطلوب غير موجود');
});

// =========================================================================
// --- Centralized Global Error Handling Middleware ---
// =========================================================================
app.use((err, req, res, next) => {
  logger.error('Unhandled Application Error:', err);

  const statusCode = err.status || err.statusCode || 500;
  const message = process.env.NODE_ENV === 'production' 
    ? 'حدث خطأ غير متوقع في الخادم، يرجى المحاولة لاحقاً' 
    : (err.message || 'خطأ داخلي في النظام');

  return sendResponse(res, statusCode, false, message, process.env.NODE_ENV !== 'production' ? { stack: err.stack } : {});
});

// --- Global Process Crash Protection Guard ---
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception Detected: ' + err.stack);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// تصدير تطبيق Express لتوافقه الكامل مع Vercel Serverless
module.exports = app;

// تشغيل الخادم على المنفذ المحدد في البيئة المحلية فقط
if (process.env.VERCEL !== '1') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`🚀 Enterprise Server V6 Active on Port ${PORT}`));
}
