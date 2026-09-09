/**
 * Ultra-Enterprise Server Architecture (V6 - Absolute Multi-Tenant Security & High-Performance Core)
 * Telegram Link Shortener & Mini App Engine (Telega.ads)
 * Optimized for Standalone Express & Vercel Serverless Deployments
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

// 1. استيراد كافة الـ Models من ملف models.js
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

// --- Force UTF-8 JSON Response Headers & No-Cache Guard ---
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
    new winston.transports.Console({ format: winston.format.simple() })
  ]
});

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
  REDIS_URL: process.env.REDIS_URL || '',
  DEFAULT_LANGUAGE: 'ar',
  
  OFFICIAL_BOT_URL: process.env.OFFICIAL_BOT_URL || 'https://t.me/Ads_telegabot',
  OFFICIAL_CHANNEL_URL: process.env.OFFICIAL_CHANNEL_URL || 'https://t.me/ttelega_ads',
  TELEGRAM_SUPPORT_URL: process.env.TELEGRAM_SUPPORT_URL || 'https://t.me/Te_AdsNs_bot',
  
  DEPOSIT_USDT_BEP20: process.env.DEPOSIT_USDT_BEP20 || '',
  DEPOSIT_USDT_TRC20: process.env.DEPOSIT_USDT_TRC20 || '',

  BOT_USERNAME: '@' + (process.env.OFFICIAL_BOT_URL || 'https://t.me/Ads_telegabot').split('/').pop(),
  SUPPORT_USERNAME: '@' + (process.env.TELEGRAM_SUPPORT_URL || 'https://t.me/Te_AdsNs_bot').split('/').pop()
});

// --- MongoDB Serverless Re-connection Helper ---
let isDbConnected = false;
async function connectDB() {
  if (isDbConnected && mongoose.connection.readyState === 1) return;
  try {
    const db = await mongoose.connect(CONFIG.MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    isDbConnected = db.connections[0].readyState === 1;
  } catch (err) {
    logger.error('❌ Database Connection Error: ' + err.message);
  }
}

// Middleware لضمان توفر قاعدة البيانات قبل معالجة أي طلب
app.use(async (req, res, next) => {
  await connectDB();
  next();
});

// --- Redis Client Initialization ---
let redisIsConnected = false;
let redis = null;

if (CONFIG.REDIS_URL) {
  redis = new Redis(CONFIG.REDIS_URL, {
    maxRetriesPerRequest: 1,
    enableReadyCheck: true,
    lazyConnect: true,
    retryStrategy: () => false
  });

  redis.on('error', (err) => {
    redisIsConnected = false;
  });
  redis.on('ready', () => {
    redisIsConnected = true;
  });
  redis.connect().catch(() => { redisIsConnected = false; });
}

async function safeRedisGet(key) {
  if (!redisIsConnected || !redis) return null;
  try { return await redis.get(key); } catch (e) { return null; }
}

async function safeRedisSet(key, value, mode, duration) {
  if (!redisIsConnected || !redis) return;
  try {
    if (mode && duration) await redis.set(key, value, mode, duration);
    else await redis.set(key, value);
  } catch (e) { }
}

async function safeRedisDel(key) {
  if (!redisIsConnected || !redis) return;
  try { await redis.del(key); } catch (e) { }
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

// --- Middleware للتحقق من هوية المستخدم ---
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
// --- API Endpoints ---
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

// --- Shortener Link Operations ---
app.post('/api/links', authMiddleware, linkCreationLimiter, async (req, res) => {
  try {
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ 
        success: false, 
        error: 'غير مصرح: معرف المستخدم (userId) مفقود' 
      });
    }

    const { title, targetUrl } = req.body;
    const cleanUrl = String(targetUrl || '').trim();

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
    logger.error('❌ Error in POST /api/links: ' + err.message);
    return res.status(500).json({ 
      success: false, 
      error: 'حدث خطأ أثناء اختصار الرابط، يرجى المحاولة لاحقاً' 
    });
  }
});

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

// --- Admin Panel Routes ---
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

// --- Static HTML & Client Catch-all Routes ---
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views.html'));
});

app.get(['/app', '/admin', '/r/:code'], (req, res) => {
  res.sendFile(path.join(__dirname, 'views.html'));
});

// --- Catch-all API 404 Handler ---
app.use('/api/*', (req, res) => {
  res.status(404).json({ success: false, error: 'المسار المطلوب غير موجود' });
});

// --- Global Error Handler ---
app.use((err, req, res, next) => {
  logger.error('Unhandled Application Error: ' + err.stack);

  const statusCode = err.status || err.statusCode || 500;
  const message = process.env.NODE_ENV === 'production' 
    ? 'حدث خطأ غير متوقع في الخادم' 
    : (err.message || 'خطأ داخلي');

  res.status(statusCode).json({
    success: false,
    error: message
  });
});

// --- Local Execution & Vercel Module Export ---
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`🚀 Enterprise Server Active on Port ${PORT}`));
}

module.exports = app;
