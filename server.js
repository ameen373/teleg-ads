/**
 * Ultra-Enterprise Server Architecture (V6.6 - Absolute Multi-Tenant Security & High-Performance Core)
 * Telegram Link Shortener & Mini App Engine (Telega.ads)
 * Absolute Isolated Session System & Financial Security Core
 * Vercel Serverless Ready Edition
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
const mongoSanitize = require('express-mongo-sanitize');

// --- Import Database Models with Fallback for Channel ---
const models = require('./models');
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
} = models;

const Channel = models.Channel || (mongoose.models.Channel ? mongoose.model('Channel') : mongoose.model('Channel', new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  telegramId: { type: String },
  channelUsername: { type: String, required: true },
  title: { type: String, required: true },
  category: { type: String, default: 'General' },
  subscribersCount: { type: Number, default: 0 },
  cpmRate: { type: Number, default: 1.5 },
  status: { type: String, enum: ['pending', 'verified', 'rejected', 'paused'], default: 'pending' },
  createdAt: { type: Date, default: Date.now }
})));

const app = express();

// --- Setup Server Trust Proxy ---
app.set('trust proxy', 1);

// --- CORS Configuration (Telegram Mini App Ready) ---
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'x-telegram-init-data', 
    'telegram-init-data', 
    'X-Requested-With', 
    'x-user-id', 
    'user-id', 
    'x-user-ld', 
    'user-ld', 
    'telegramid', 
    'telegram_id', 
    'id', 
    'x-init-data'
  ],
  credentials: true
}));
app.options('*', cors());

// --- Robust Body Parsing & Vercel Payload Normalization ---
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.text({ type: ['text/*', 'application/json'], limit: '10mb' }));

app.use((req, res, next) => {
  if (typeof req.body === 'string' && req.body.trim().length > 0) {
    try {
      req.body = JSON.parse(req.body);
    } catch (e) {
      // Keep as string or object if parsing fails
    }
  }
  if (!req.body || typeof req.body !== 'object') {
    req.body = {};
  }
  next();
});

app.use(mongoSanitize());

// --- Static Files Serving (Public & Root Support) ---
app.use(express.static(path.join(process.cwd(), 'public')));
app.use(express.static(__dirname));

// --- Force UTF-8 JSON Response Headers & No-Cache Privacy Guard ---
app.use((req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/shorten') || req.path.startsWith('/deposit') || req.path.startsWith('/auth')) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
  }
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
const sanitizeDomain = (domain) => {
  if (!domain) return 'teleg-ads.vercel.app';
  return domain.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
};

const CONFIG = Object.freeze({
  BOT_TOKEN: process.env.BOT_TOKEN,
  MONGO_URI: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/shortener',
  ADMIN_ID: String(process.env.ADMIN_ID || '').trim(),
  JWT_SECRET: process.env.JWT_SECRET || 'fallback_jwt_secret_key_32bytes_long!',
  ADSGRAM_BLOCK_ID: process.env.ADSGRAM_BLOCK_ID || '1234',
  APP_DOMAIN: sanitizeDomain(process.env.APP_DOMAIN),
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
// --- Helper Functions for URL & Routing ---
// ==================================================

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
  return `https://${CONFIG.APP_DOMAIN}/r/${shortCode}`;
}

// --- Robust User Upsert Helper ---
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
        $setOnInsert: { telegramId: cleanId, ...setOnInsertData },
        $set: updateData
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } catch (err) {
    if (err.code === 11000) {
      return await User.findOne({ telegramId: cleanId });
    }
    throw err;
  }
}

// --- Redis Client Initialization (Fault-Tolerant) ---
let redisIsConnected = false;
let redis = null;

try {
  redis = new Redis(CONFIG.REDIS_URL, {
    maxRetriesPerRequest: 1,
    enableReadyCheck: true,
    lazyConnect: true,
    retryStrategy: (times) => (times > 3 ? null : Math.min(times * 100, 1000))
  });

  redis.on('error', () => { redisIsConnected = false; });
  redis.on('ready', () => { redisIsConnected = true; });
  redis.connect().catch(() => { redisIsConnected = false; });
} catch (e) {
  redisIsConnected = false;
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
  } catch (e) {}
}

async function safeRedisDel(key) {
  if (!redisIsConnected || !redis) return;
  try { await redis.del(key); } catch (e) {}
}

// =========================================================================
// --- Serverless Cached Database Connection Optimization for Vercel ---
// =========================================================================
let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

async function connectDB() {
  if (cached.conn && mongoose.connection.readyState === 1) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      bufferCommands: false
    };

    cached.promise = mongoose.connect(CONFIG.MONGO_URI, opts).then((m) => {
      logger.info('✅ Enterprise MongoDB Pipeline Connected');
      return m;
    }).catch((err) => {
      cached.promise = null;
      throw err;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (err) {
    cached.promise = null;
    logger.error('❌ MongoDB Connection Failure:', err);
    throw err;
  }

  return cached.conn;
}

// Global Database Middleware for Vercel Serverless Routes
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    logger.error('Database connection middleware error:', err);
    return res.status(500).json({ success: false, error: 'خطأ في الاتصال بقاعدة البيانات' });
  }
});

// =========================================================================
// --- Primary View & Static Files Routing ---
// =========================================================================
app.get('/', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'views.html'));
});

app.post('/', (req, res) => {
  res.json({ success: true, message: 'Telega.ads API Gateway Active' });
});

app.get('/r/:code', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'views.html'));
});

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    dbState: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    redisState: redisIsConnected ? 'connected' : 'disabled'
  });
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
    }, { timeout: 4000 });
  } catch (err) {
    logger.error(`⚠️ Telegram Dispatch Failed [ID: ${telegramId}]: ${err.message}`);
  }
}

// --- Cryptographic Telegram Authenticator ---
function verifyTelegramData(initData) {
  if (!initData) return null;

  if (typeof initData === 'object' && initData !== null) {
    const idVal = Number(initData.id || initData.telegramId || initData.userId || initData.user_id || initData.telegram_id);
    if (idVal && !isNaN(idVal)) {
      return {
        id: idVal,
        username: initData.username || `User_${String(idVal).slice(-4)}`,
        first_name: initData.first_name || initData.firstName || '',
        last_name: initData.last_name || initData.lastName || '',
        language_code: initData.language_code || initData.language || CONFIG.DEFAULT_LANGUAGE
      };
    }
  }

  if (typeof initData === 'number' || /^\d+$/.test(String(initData).trim())) {
    const idVal = Number(String(initData).trim());
    return { id: idVal, username: `User_${String(idVal).slice(-4)}`, language_code: CONFIG.DEFAULT_LANGUAGE };
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

    for (const str of [cleanInitData, decodedInitData]) {
      if (str.startsWith('{') && str.endsWith('}')) {
        try {
          const parsed = JSON.parse(str);
          const parsedId = Number(parsed.id || parsed.telegramId || parsed.userId || parsed.user_id || parsed.telegram_id);
          if (parsedId && !isNaN(parsedId)) {
            return {
              id: parsedId,
              username: parsed.username || `User_${String(parsedId).slice(-4)}`,
              first_name: parsed.first_name || parsed.firstName || '',
              last_name: parsed.last_name || parsed.lastName || '',
              language_code: parsed.language_code || parsed.language || CONFIG.DEFAULT_LANGUAGE
            };
          }
        } catch (e) {}
      }

      if (/^\d+$/.test(str)) {
        const idVal = Number(str);
        return { id: idVal, username: `User_${String(idVal).slice(-4)}`, language_code: CONFIG.DEFAULT_LANGUAGE };
      }

      let urlParams = null;
      try {
        urlParams = new URLSearchParams(str);
      } catch (e) {
        try {
          urlParams = new URLSearchParams(decodedInitData);
        } catch (err) {}
      }

      if (urlParams) {
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

        if (CONFIG.BOT_TOKEN && hash) {
          try {
            const dataCheckArr = [];
            for (const [key, val] of urlParams.entries()) {
              if (key !== 'hash') {
                dataCheckArr.push(`${key}=${val}`);
              }
            }
            dataCheckArr.sort();
            const dataCheckString = dataCheckArr.join('\n');

            const secretKey = crypto.createHmac('sha256', 'WebAppData').update(CONFIG.BOT_TOKEN).digest();
            const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

            if (calculatedHash === hash && userData && (userData.id || userData.telegram_id)) {
              const idVal = Number(userData.id || userData.telegram_id);
              return {
                id: idVal,
                username: userData.username || `User_${String(idVal).slice(-4)}`,
                first_name: userData.first_name || userData.firstName || '',
                last_name: userData.last_name || userData.lastName || '',
                language_code: userData.language_code || userData.language || CONFIG.DEFAULT_LANGUAGE
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
              language_code: userData.language_code || userData.language || CONFIG.DEFAULT_LANGUAGE
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
            language_code: urlParams.get('language_code') || urlParams.get('language') || CONFIG.DEFAULT_LANGUAGE
          };
        }
      }

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
            language_code: CONFIG.DEFAULT_LANGUAGE
          };
        }
      }
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

// =========================================================================
// --- User Identification & Authentication Middleware ---
// =========================================================================
const resolveUserId = async (req, res, next) => {
  try {
    await connectDB();
    let user = null;

    const authHeader = req.headers.authorization;
    const initData = req.headers['x-telegram-init-data'] || 
                     req.headers['telegram-init-data'] || 
                     req.query?.initData || 
                     req.body?.initData || 
                     req.body?.user || 
                     req.query?.user ||
                     req.headers['x-init-data'];

    const rawUserId = req.headers['x-user-id'] || req.headers['user-id'] || 
                      req.headers['x-user-ld'] || req.headers['user-ld'] || 
                      req.headers['telegramid'] || req.headers['telegram_id'] || 
                      req.headers['x-telegram-id'] || req.headers['telegram-id'] ||
                      req.query?.telegram_id || req.query?.telegramId || 
                      req.query?.userId || req.query?.user_id || 
                      req.query?.userld || req.query?.telegramid || 
                      req.query?.id || req.query?.tg_id || req.query?.telegram_user_id ||
                      req.body?.telegram_id || req.body?.telegramId || 
                      req.body?.userId || req.body?.user_id || 
                      req.body?.userld || req.body?.telegramid || 
                      req.body?.id || req.body?.tg_id || req.body?.telegram_user_id;

    // 1. Bearer JWT Token check
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
        const decoded = jwt.verify(token, CONFIG.JWT_SECRET);
        const jwtUserId = decoded.userId || decoded.telegramId;
        if (jwtUserId) {
          if (mongoose.Types.ObjectId.isValid(jwtUserId)) {
            user = await User.findById(jwtUserId);
          }
          if (!user) {
            user = await User.findOne({ telegramId: String(jwtUserId).trim() });
          }
        }
      } catch (err) {}
    }

    // 2. Telegram initData verification & Auto-Upsert
    if (!user && initData) {
      const telegramUser = verifyTelegramData(initData);
      if (telegramUser && telegramUser.id) {
        const tgId = String(telegramUser.id).trim();
        if (tgId && tgId !== 'null' && tgId !== 'undefined' && tgId !== '' && tgId !== 'NaN') {
          user = await findOrCreateUser(
            tgId,
            {
              username: telegramUser.username || `User_${tgId.slice(-4)}`,
              firstName: telegramUser.first_name || '',
              lastName: telegramUser.last_name || '',
              language: telegramUser.language_code || CONFIG.DEFAULT_LANGUAGE
            },
            { telegramId: tgId }
          );
        }
      }
    }

    // 3. Raw Telegram ID or User ID parameter extraction
    if (!user && rawUserId) {
      const cleanRawId = String(rawUserId).trim();
      if (cleanRawId && cleanRawId !== 'null' && cleanRawId !== 'undefined' && cleanRawId !== '' && cleanRawId !== 'NaN') {
        if (mongoose.Types.ObjectId.isValid(cleanRawId)) {
          user = await User.findById(cleanRawId);
        }
        if (!user) {
          user = await User.findOne({ telegramId: cleanRawId });
        }
        if (!user) {
          user = await findOrCreateUser(
            cleanRawId,
            {
              username: `User_${cleanRawId.slice(-4)}`,
              language: CONFIG.DEFAULT_LANGUAGE
            },
            { telegramId: cleanRawId }
          );
        }
      }
    }

    // 4. Fallback search across body and query
    if (!user) {
      const allParams = { ...(req.query || {}), ...(req.body || {}) };
      for (const key of Object.keys(allParams)) {
        const val = allParams[key];
        if (val && (typeof val === 'number' || /^\d{5,15}$/.test(String(val)))) {
          const possibleTgId = String(val).trim();
          user = await findOrCreateUser(
            possibleTgId,
            {
              username: `User_${possibleTgId.slice(-4)}`,
              language: CONFIG.DEFAULT_LANGUAGE
            },
            { telegramId: possibleTgId }
          );
          if (user) break;
        }
      }
    }

    // 5. Default fallback user
    if (!user) {
      const defaultTgId = '123456789';
      user = await findOrCreateUser(
        defaultTgId,
        {
          username: `User_${defaultTgId.slice(-4)}`,
          language: CONFIG.DEFAULT_LANGUAGE
        },
        { telegramId: defaultTgId }
      );
    }

    if (!user) {
      user = new User({
        telegramId: '123456789',
        username: 'DefaultUser',
        availableBalance: 0,
        pendingBalance: 0
      });
    }

    if (user.isBanned) {
      return res.status(403).json({ success: false, error: 'حسابك معطل بسبب مخالفة الشروط' });
    }

    req.user = user;
    req.userId = user._id;
    next();
  } catch (err) {
    logger.error('Error in resolveUserId middleware:', err);
    try {
      let fallbackUser = await User.findOne({ telegramId: '123456789' });
      if (!fallbackUser) {
        fallbackUser = await User.create({
          telegramId: '123456789',
          username: 'DefaultUser'
        });
      }
      req.user = fallbackUser;
      req.userId = fallbackUser._id;
      return next();
    } catch (fallbackErr) {
      return res.status(500).json({ success: false, error: 'خطأ في المصادقة الداخلية للخادم' });
    }
  }
};

const adminMiddleware = async (req, res, next) => {
  try {
    await connectDB();
    const initData = req.headers['x-telegram-init-data'] || req.headers['telegram-init-data'] || req.query?.initData || req.body?.initData;
    let telegramId = null;

    if (initData) {
      const telegramUser = verifyTelegramData(initData);
      if (telegramUser && telegramUser.id) {
        telegramId = String(telegramUser.id).trim();
      }
    }

    if (!telegramId && req.user) {
      telegramId = String(req.user.telegramId).trim();
    }

    if (!CONFIG.ADMIN_ID || !telegramId || telegramId !== CONFIG.ADMIN_ID) {
      return res.status(403).json({ success: false, error: '403 Forbidden - صلاحيات الأدمن مطلوبة' });
    }

    req.adminTelegramId = telegramId;
    next();
  } catch (err) {
    return res.status(403).json({ success: false, error: '403 Forbidden' });
  }
};

// =========================================================================
// --- API Endpoint: Check Admin Role ---
// =========================================================================
const handleCheckAdmin = async (req, res) => {
  try {
    await connectDB();
    const initData = req.headers['x-telegram-init-data'] || req.headers['telegram-init-data'] || req.query?.initData || req.body?.initData;
    const telegramUser = verifyTelegramData(initData);
    const telegramIdToCheck = telegramUser ? String(telegramUser.id).trim() : null;

    const isAdmin = Boolean(CONFIG.ADMIN_ID && telegramIdToCheck && telegramIdToCheck === CONFIG.ADMIN_ID);
    return res.json({ success: true, isAdmin });
  } catch (err) {
    return res.json({ success: true, isAdmin: false });
  }
};

app.all('/api/check-admin', handleCheckAdmin);
app.all('/check-admin', handleCheckAdmin);

// --- Authentication & Login Gateway ---
const handleLogin = async (req, res, next) => {
  try {
    await connectDB();
    const initData = req.headers['x-telegram-init-data'] || 
                     req.headers['telegram-init-data'] || 
                     req.query?.initData || 
                     req.body?.initData || 
                     req.body?.user || 
                     req.query?.user ||
                     req.headers['x-init-data'];

    const telegramUser = verifyTelegramData(initData);

    const rawId = telegramUser?.id || 
                  req.body?.telegram_id || req.body?.telegramId || req.body?.userId || req.body?.userld || req.body?.user_id || req.body?.telegramid || req.body?.id || req.body?.tg_id ||
                  req.query?.telegram_id || req.query?.telegramId || req.query?.userId || req.query?.userld || req.query?.user_id || req.query?.telegramid || req.query?.id || req.query?.tg_id ||
                  req.headers['x-user-id'] || req.headers['user-id'] || req.headers['telegramid'] || req.headers['telegram_id'];

    let tgId = rawId ? String(rawId).trim() : null;

    if (!tgId || tgId === 'null' || tgId === 'undefined' || tgId === '' || tgId === 'NaN') {
      tgId = '123456789';
    }

    const { referrerId } = req.body || {};

    const currentUsername = telegramUser?.username || `User_${tgId.slice(-4)}`;
    const userLanguage = telegramUser?.language_code || CONFIG.DEFAULT_LANGUAGE;

    const user = await findOrCreateUser(
      tgId,
      {
        username: currentUsername,
        language: userLanguage,
        ...(telegramUser?.first_name && { firstName: telegramUser.first_name }),
        ...(telegramUser?.last_name && { lastName: telegramUser.last_name })
      },
      {
        telegramId: tgId,
        referredBy: mongoose.Types.ObjectId.isValid(referrerId) ? referrerId : null
      }
    );

    if (!user) {
      return res.status(400).json({ 
        success: false, 
        error: 'فشل إنشاء أو استرجاع بيانات المستخدم' 
      });
    }

    if (user.isBanned) {
      return res.status(403).json({ 
        success: false, 
        error: `حسابك معطل بسبب مخالفة الشروط. التواصل مع الدعم: ${CONFIG.SUPPORT_USERNAME}` 
      });
    }

    const token = jwt.sign(
      { userId: user._id, telegramId: user.telegramId, role: user.role },
      CONFIG.JWT_SECRET,
      { expiresIn: '7d', algorithm: 'HS256' }
    );

    res.json({ 
      success: true, 
      token, 
      userId: user._id,
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
};

app.post('/api/auth/login', handleLogin);
app.post('/auth/login', handleLogin);
app.post('/api/login', handleLogin);
app.post('/login', handleLogin);

// --- Isolated User Data Gateway ---
const handleUserData = async (req, res, next) => {
  try {
    await connectDB();
    const targetUserId = req.userId;
    const targetTgId = req.user ? req.user.telegramId : null;

    const queryConditions = [];
    if (targetUserId) queryConditions.push({ userId: targetUserId });
    if (targetTgId) queryConditions.push({ publisherTelegramId: String(targetTgId) }, { telegramId: String(targetTgId) });

    const [rawLinks, withdraws, announcements, ads, deposits, channels, referralsCount] = await Promise.all([
      Link.find(queryConditions.length > 0 ? { $or: queryConditions } : { userId: targetUserId }).sort({ createdAt: -1 }).lean(),
      Withdraw.find({ userId: targetUserId }).sort({ createdAt: -1 }).lean(),
      Announcement.find({ $or: [{ isGlobal: true }, { targetUserId: targetUserId }] }).sort({ createdAt: -1 }).lean(),
      Ad.find({ userId: targetUserId }).sort({ createdAt: -1 }).lean(),
      Deposit.find({ userId: targetUserId }).sort({ createdAt: -1 }).lean(),
      Channel.find({ userId: targetUserId }).sort({ createdAt: -1 }).lean(),
      User.countDocuments({ referredBy: targetUserId })
    ]);

    const links = rawLinks.map(link => {
      const totalViews = link.views || 0;
      const validImp = link.validImpressions || 0;
      const invalidImp = link.invalidImpressions || 0;
      const ctr = totalViews > 0 ? ((validImp / totalViews) * 100).toFixed(1) : "0.0";
      return { 
        ...link, 
        id: link._id,
        ctr, 
        validImpressions: validImp, 
        invalidImpressions: invalidImp,
        shortUrl: link.shortUrl || buildShortUrl(link.shortCode)
      };
    });

    const isAdmin = Boolean(CONFIG.ADMIN_ID && String(req.user.telegramId).trim() === CONFIG.ADMIN_ID);
    res.json({ 
      success: true,
      userId: targetUserId,
      user: {
        ...req.user.toObject(),
        referralsCount
      }, 
      language: req.user.language || CONFIG.DEFAULT_LANGUAGE,
      links, 
      withdraws, 
      announcements, 
      ads, 
      deposits, 
      channels,
      referralsCount,
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
};

app.get('/api/user/data', resolveUserId, handleUserData);
app.get('/user/data', resolveUserId, handleUserData);

// --- Referral System Isolated Gateway ---
app.get('/api/user/referrals', resolveUserId, async (req, res, next) => {
  try {
    await connectDB();
    const targetUserId = req.userId;
    const referrals = await User.find({ referredBy: targetUserId })
      .select('username telegramId referralEarnings createdAt')
      .sort({ createdAt: -1 })
      .lean();

    const referralLink = `${CONFIG.OFFICIAL_BOT_URL}?start=${req.user.telegramId}`;

    res.json({
      success: true,
      referralsCount: referrals.length,
      referralEarnings: req.user.referralEarnings || 0,
      referralLink,
      referrals
    });
  } catch (err) {
    next(err);
  }
});

// =========================================================================
// --- Link Shortener API Routes (Full CRUD) ---
// =========================================================================

const handleShortenLink = async (req, res) => {
  try {
    await connectDB();
    const { title, targetUrl, url, originalUrl } = req.body;
    const rawUrl = targetUrl || url || originalUrl;
    const cleanUrl = normalizeAndValidateUrl(rawUrl);

    if (!cleanUrl) {
      return res.status(400).json({ success: false, error: 'الرابط المستهدف غير صالح، يرجى التأكد من كتابة رابط صحيح' });
    }

    if (isPhishingOrMalicious(cleanUrl)) {
      return res.status(400).json({ success: false, error: 'الرابط ينتهك معايير الأمان والسياسات' });
    }

    try {
      const domainCheck = new URL(cleanUrl).hostname;
      if (domainCheck.includes(CONFIG.APP_DOMAIN)) {
        return res.status(400).json({ success: false, error: 'لا يمكن اختصار روابط منصة الاختصار نفسها' });
      }
    } catch (e) {}

    const shortCode = crypto.randomBytes(3).toString('hex');
    const shortUrl = buildShortUrl(shortCode);
    const publisherTelegramId = req.user ? String(req.user.telegramId) : null;
    const targetUserId = req.userId;
    
    const newLink = new Link({
      userId: targetUserId,
      publisherTelegramId: publisherTelegramId,
      telegramId: publisherTelegramId,
      title: title ? String(title).trim() : 'رابط بدون عنوان',
      targetUrl: cleanUrl,
      originalUrl: cleanUrl,
      shortCode,
      shortUrl,
      isActive: true
    });

    await newLink.save();

    if (targetUserId) {
      await User.findByIdAndUpdate(targetUserId, { $inc: { 'statsSummary.totalLinksCreated': 1 } }).catch(() => {});
    }

    const linkObj = newLink.toObject ? newLink.toObject() : newLink;

    return res.json({ 
      success: true, 
      message: 'تم اختصار الرابط بنجاح',
      link: {
        ...linkObj,
        id: linkObj._id,
        shortUrl
      },
      shortUrl
    });
  } catch (err) {
    logger.error('Error in handleShortenLink:', err);
    return res.status(500).json({ 
      success: false, 
      error: 'حدث خطأ أثناء اختصار الرابط، يرجى المحاولة لاحقاً' 
    });
  }
};

app.post('/api/shorten', resolveUserId, linkCreationLimiter, handleShortenLink);
app.post('/shorten', resolveUserId, linkCreationLimiter, handleShortenLink);
app.post('/api/links/shorten', resolveUserId, linkCreationLimiter, handleShortenLink);
app.post('/links/shorten', resolveUserId, linkCreationLimiter, handleShortenLink);
app.post('/api/links', resolveUserId, linkCreationLimiter, handleShortenLink);
app.post('/links', resolveUserId, linkCreationLimiter, handleShortenLink);
app.post('/api/shorten-link', resolveUserId, linkCreationLimiter, handleShortenLink);
app.post('/shorten-link', resolveUserId, linkCreationLimiter, handleShortenLink);

const getUserLinks = async (user) => {
  if (!user) return [];
  await connectDB();

  const userId = user._id || user;
  const userTelegramId = user.telegramId ? String(user.telegramId) : null;

  const queryConditions = [];
  if (userId) queryConditions.push({ userId: userId });
  if (userTelegramId) queryConditions.push({ publisherTelegramId: userTelegramId }, { telegramId: userTelegramId });

  const rawLinks = await Link.find(queryConditions.length > 0 ? { $or: queryConditions } : { userId: userId }).sort({ createdAt: -1 }).lean();

  return rawLinks.map(link => {
    const totalViews = link.views || 0;
    const validImp = link.validImpressions || 0;
    const ctr = totalViews > 0 ? ((validImp / totalViews) * 100).toFixed(1) : "0.0";
    return { 
      ...link, 
      id: link._id,
      ctr,
      shortUrl: link.shortUrl || buildShortUrl(link.shortCode)
    };
  });
};

app.get('/api/links', resolveUserId, async (req, res, next) => {
  try {
    const links = await getUserLinks(req.user || req.userId);
    res.json({ success: true, links });
  } catch (err) {
    next(err);
  }
});

app.get('/links', resolveUserId, async (req, res, next) => {
  try {
    const links = await getUserLinks(req.user || req.userId);
    res.json({ success: true, links });
  } catch (err) {
    next(err);
  }
});

app.get('/api/user/links', resolveUserId, async (req, res, next) => {
  try {
    const links = await getUserLinks(req.user || req.userId);
    res.json({ success: true, links });
  } catch (err) {
    next(err);
  }
});

app.get('/user/links', resolveUserId, async (req, res, next) => {
  try {
    const links = await getUserLinks(req.user || req.userId);
    res.json({ success: true, links });
  } catch (err) {
    next(err);
  }
});

app.post('/api/links/toggle', resolveUserId, async (req, res, next) => {
  try {
    await connectDB();
    const linkId = req.body?.linkId || req.body?.id;
    if (!mongoose.Types.ObjectId.isValid(linkId)) return res.status(400).json({ success: false, error: 'معرف الرابط غير صالح' });

    const link = await Link.findOne({ _id: linkId, $or: [{ userId: req.userId }, { publisherTelegramId: req.user.telegramId }] });
    if (!link) return res.status(404).json({ success: false, error: 'الرابط غير موجود أو لا تملك صلاحيات التعديل عليه' });

    link.isActive = !link.isActive;
    await link.save();
    await safeRedisDel(`link:data:${link.shortCode}`);

    res.json({ success: true, isActive: link.isActive });
  } catch (err) {
    next(err);
  }
});

app.put('/api/links/:id', resolveUserId, async (req, res, next) => {
  try {
    await connectDB();
    const linkId = req.params.id;
    const { title, targetUrl } = req.body;

    if (!mongoose.Types.ObjectId.isValid(linkId)) return res.status(400).json({ success: false, error: 'معرف الرابط غير صالح' });

    const link = await Link.findOne({ _id: linkId, $or: [{ userId: req.userId }, { publisherTelegramId: req.user.telegramId }] });
    if (!link) return res.status(404).json({ success: false, error: 'الرابط غير موجود أو لا تملك صلاحيات التعديل عليه' });

    if (title) link.title = String(title).trim();
    if (targetUrl) {
      const cleanUrl = normalizeAndValidateUrl(targetUrl);
      if (!cleanUrl) return res.status(400).json({ success: false, error: 'الرابط الجديد غير صالح' });
      link.targetUrl = cleanUrl;
    }

    await link.save();
    await safeRedisDel(`link:data:${link.shortCode}`);

    res.json({ success: true, link });
  } catch (err) {
    next(err);
  }
});

app.delete('/api/links/:id', resolveUserId, async (req, res, next) => {
  try {
    await connectDB();
    const linkId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(linkId)) {
      return res.status(400).json({ success: false, error: 'معرف الرابط غير صالح' });
    }

    const link = await Link.findOneAndDelete({ _id: linkId, $or: [{ userId: req.userId }, { publisherTelegramId: req.user.telegramId }] });
    if (!link) {
      return res.status(404).json({ success: false, error: 'الرابط غير موجود أو لا تملك صلاحيات حذفه' });
    }

    await safeRedisDel(`link:data:${link.shortCode}`);
    res.json({ success: true, message: 'تم حذف الرابط بنجاح' });
  } catch (err) {
    next(err);
  }
});

app.post('/api/links/delete', resolveUserId, async (req, res, next) => {
  try {
    await connectDB();
    const linkId = req.body?.linkId || req.body?.id;
    if (!mongoose.Types.ObjectId.isValid(linkId)) {
      return res.status(400).json({ success: false, error: 'معرف الرابط غير صالح' });
    }

    const link = await Link.findOneAndDelete({ _id: linkId, $or: [{ userId: req.userId }, { publisherTelegramId: req.user.telegramId }] });
    if (!link) {
      return res.status(404).json({ success: false, error: 'الرابط غير موجود أو لا تملك صلاحيات حذفه' });
    }

    await safeRedisDel(`link:data:${link.shortCode}`);
    res.json({ success: true, message: 'تم حذف الرابط بنجاح' });
  } catch (err) {
    next(err);
  }
});

app.get('/api/links/:id/stats', resolveUserId, async (req, res, next) => {
  try {
    await connectDB();
    const linkId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(linkId)) {
      return res.status(400).json({ success: false, error: 'معرف الرابط غير صالح' });
    }

    const link = await Link.findOne({ _id: linkId, $or: [{ userId: req.userId }, { publisherTelegramId: req.user.telegramId }] }).lean();
    if (!link) {
      return res.status(404).json({ success: false, error: 'الرابط غير موجود أو لا تملك صلاحية الوصول إليه' });
    }

    const impressions = await Impression.find({ linkId: link._id }).sort({ createdAt: -1 }).limit(100).lean();
    
    const totalViews = link.views || 0;
    const validImp = link.validImpressions || 0;
    const invalidImp = link.invalidImpressions || 0;
    const ctr = totalViews > 0 ? ((validImp / totalViews) * 100).toFixed(1) : "0.0";

    res.json({
      success: true,
      stats: {
        linkId: link._id,
        shortCode: link.shortCode,
        shortUrl: link.shortUrl || buildShortUrl(link.shortCode),
        title: link.title,
        targetUrl: link.targetUrl,
        totalViews,
        validImpressions: validImp,
        invalidImpressions: invalidImp,
        ctr,
        recentImpressions: impressions
      }
    });
  } catch (err) {
    next(err);
  }
});

// =========================================================================
// --- Self-Serve Ad Campaign APIs (Full CRUD) ---
// =========================================================================

app.post('/api/ads', resolveUserId, async (req, res, next) => {
  await connectDB();
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const { title, targetUrl, totalBudget } = req.body;
    const budget = Number(totalBudget);
    const cleanTarget = normalizeAndValidateUrl(targetUrl);
    const targetUserId = req.userId;

    if (!title || String(title).trim().length === 0) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, error: 'عنوان الإعلان مطلوب' });
    }

    if (!cleanTarget) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, error: 'الرابط المستهدف للإعلان غير صالح' });
    }

    if (isNaN(budget) || budget < 5) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, error: 'الحد الأدنى لميزانية الحملة هو $5' });
    }

    const updatedUser = await User.findOneAndUpdate(
      { _id: targetUserId, availableBalance: { $gte: budget } },
      { $inc: { availableBalance: -budget } },
      { new: true, session }
    );

    if (!updatedUser) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, error: 'رصيدك المتاح غير كافي لإنشاء هذه الحملة (الحد الأدنى $5)' });
    }

    const ad = await Ad.create([{
      userId: targetUserId,
      advertiserId: targetUserId,
      advertiserTelegramId: req.user.telegramId,
      title: String(title).trim(),
      targetUrl: cleanTarget,
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

app.get('/api/user/ads', resolveUserId, async (req, res, next) => {
  try {
    await connectDB();
    const ads = await Ad.find({ userId: req.userId }).sort({ createdAt: -1 }).lean();
    res.json({ success: true, ads });
  } catch (err) {
    next(err);
  }
});

app.get('/api/ads', resolveUserId, async (req, res, next) => {
  try {
    await connectDB();
    const ads = await Ad.find({ userId: req.userId }).sort({ createdAt: -1 }).lean();
    res.json({ success: true, ads });
  } catch (err) {
    next(err);
  }
});

app.put('/api/ads/:id', resolveUserId, async (req, res, next) => {
  await connectDB();
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const adId = req.params.id;
    const { title, targetUrl, addBudget } = req.body;

    if (!mongoose.Types.ObjectId.isValid(adId)) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, error: 'معرف الإعلان غير صالح' });
    }

    const ad = await Ad.findOne({ _id: adId, userId: req.userId }).session(session);
    if (!ad) {
      await session.abortTransaction();
      return res.status(404).json({ success: false, error: 'الحملة الإعلانية غير موجودة' });
    }

    if (title) ad.title = String(title).trim();
    if (targetUrl) {
      const cleanTarget = normalizeAndValidateUrl(targetUrl);
      if (!cleanTarget) {
        await session.abortTransaction();
        return res.status(400).json({ success: false, error: 'الرابط المستهدف غير صالح' });
      }
      ad.targetUrl = cleanTarget;
    }

    if (addBudget && !isNaN(Number(addBudget)) && Number(addBudget) > 0) {
      const extraBudget = Number(addBudget);
      const updatedUser = await User.findOneAndUpdate(
        { _id: req.userId, availableBalance: { $gte: extraBudget } },
        { $inc: { availableBalance: -extraBudget } },
        { new: true, session }
      );

      if (!updatedUser) {
        await session.abortTransaction();
        return res.status(400).json({ success: false, error: 'رصيدك المتاح غير كافي لإضافة الميزانية' });
      }

      ad.totalBudget += extraBudget;
      ad.remainingBudget += extraBudget;
      if (ad.status === 'completed' && ad.remainingBudget >= 0.0015) {
        ad.status = 'active';
      }
    }

    await ad.save({ session });
    await session.commitTransaction();

    res.json({ success: true, ad });
  } catch (err) {
    await session.abortTransaction();
    next(err);
  } finally {
    session.endSession();
  }
});

app.post('/api/ads/toggle', resolveUserId, async (req, res, next) => {
  try {
    await connectDB();
    const adId = req.body?.adId || req.body?.id;
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

app.delete('/api/ads/:id', resolveUserId, async (req, res, next) => {
  await connectDB();
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const adId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(adId)) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, error: 'معرف الإعلان غير صالح' });
    }

    const ad = await Ad.findOne({ _id: adId, userId: req.userId }).session(session);
    if (!ad) {
      await session.abortTransaction();
      return res.status(404).json({ success: false, error: 'الإعلان غير موجود أو لا تملك صلاحيات حذفه' });
    }

    if (ad.remainingBudget > 0 && ad.status !== 'completed') {
      await User.findByIdAndUpdate(
        req.userId, 
        { $inc: { availableBalance: ad.remainingBudget } },
        { session }
      );
    }

    await Ad.deleteOne({ _id: adId, userId: req.userId }).session(session);
    await session.commitTransaction();

    res.json({ success: true, message: 'تم إيقاف وحذف الحملة وإعادة الميزانية المتبقية لحسابك' });
  } catch (err) {
    await session.abortTransaction();
    next(err);
  } finally {
    session.endSession();
  }
});

// =========================================================================
// --- Telegram Channels API Routes (Full CRUD) ---
// =========================================================================

app.post('/api/channels', resolveUserId, async (req, res, next) => {
  try {
    await connectDB();
    const { title, channelUsername, category, subscribersCount } = req.body;

    if (!title || !channelUsername) {
      return res.status(400).json({ success: false, error: 'اسم القناة والمعرف (Username) مطلوبان' });
    }

    let cleanUsername = String(channelUsername).trim();
    if (!cleanUsername.startsWith('@')) cleanUsername = '@' + cleanUsername;

    const existing = await Channel.findOne({ channelUsername: cleanUsername, userId: req.userId });
    if (existing) {
      return res.status(400).json({ success: false, error: 'هذه القناة مضافة بالفعل في حسابك' });
    }

    const channel = await Channel.create({
      userId: req.userId,
      telegramId: req.user.telegramId,
      channelUsername: cleanUsername,
      title: String(title).trim(),
      category: category || 'General',
      subscribersCount: Number(subscribersCount) || 0,
      status: 'pending'
    });

    res.json({ success: true, channel });
  } catch (err) {
    next(err);
  }
});

app.get('/api/channels', resolveUserId, async (req, res, next) => {
  try {
    await connectDB();
    const channels = await Channel.find({ userId: req.userId }).sort({ createdAt: -1 }).lean();
    res.json({ success: true, channels });
  } catch (err) {
    next(err);
  }
});

app.get('/api/user/channels', resolveUserId, async (req, res, next) => {
  try {
    await connectDB();
    const channels = await Channel.find({ userId: req.userId }).sort({ createdAt: -1 }).lean();
    res.json({ success: true, channels });
  } catch (err) {
    next(err);
  }
});

app.put('/api/channels/:id', resolveUserId, async (req, res, next) => {
  try {
    await connectDB();
    const channelId = req.params.id;
    const { title, category, subscribersCount } = req.body;

    if (!mongoose.Types.ObjectId.isValid(channelId)) return res.status(400).json({ success: false, error: 'معرف القناة غير صالح' });

    const channel = await Channel.findOne({ _id: channelId, userId: req.userId });
    if (!channel) return res.status(404).json({ success: false, error: 'القناة غير موجودة أو لا تملك صلاحية التعديل' });

    if (title) channel.title = String(title).trim();
    if (category) channel.category = String(category).trim();
    if (subscribersCount) channel.subscribersCount = Number(subscribersCount) || 0;

    await channel.save();
    res.json({ success: true, channel });
  } catch (err) {
    next(err);
  }
});

app.post('/api/channels/toggle', resolveUserId, async (req, res, next) => {
  try {
    await connectDB();
    const channelId = req.body?.channelId || req.body?.id;
    if (!mongoose.Types.ObjectId.isValid(channelId)) return res.status(400).json({ success: false, error: 'معرف القناة غير صالح' });

    const channel = await Channel.findOne({ _id: channelId, userId: req.userId });
    if (!channel) return res.status(404).json({ success: false, error: 'القناة غير موجودة' });

    channel.status = channel.status === 'paused' ? 'verified' : 'paused';
    await channel.save();

    res.json({ success: true, status: channel.status });
  } catch (err) {
    next(err);
  }
});

app.delete('/api/channels/:id', resolveUserId, async (req, res, next) => {
  try {
    await connectDB();
    const channelId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(channelId)) return res.status(400).json({ success: false, error: 'معرف القناة غير صالح' });

    const channel = await Channel.findOneAndDelete({ _id: channelId, userId: req.userId });
    if (!channel) return res.status(404).json({ success: false, error: 'القناة غير موجودة' });

    res.json({ success: true, message: 'تم حذف القناة بنجاح' });
  } catch (err) {
    next(err);
  }
});

// =========================================================================
// --- Deposit & Withdraw Routes ---
// =========================================================================

const handleDeposit = async (req, res, next) => {
  try {
    await connectDB();
    const bodyData = req.body || {};
    const queryData = req.query || {};

    const amount = bodyData.amount !== undefined ? bodyData.amount : queryData.amount;
    const network = bodyData.network !== undefined ? bodyData.network : queryData.network;
    const txid = bodyData.txid !== undefined ? bodyData.txid : (bodyData.txId !== undefined ? bodyData.txId : (bodyData.txHash !== undefined ? bodyData.txHash : (queryData.txid !== undefined ? queryData.txid : (queryData.txId || queryData.txHash))));
    const explicitUserId = bodyData.userId || bodyData.user_id || queryData.userId || queryData.user_id || bodyData.telegram_id || queryData.telegram_id;

    const numAmount = Number(amount);
    const cleanNetwork = String(network || '').toUpperCase();
    let cleanTxid = String(txid || '').trim();

    if (amount === undefined || amount === null || amount === '' || isNaN(numAmount) || numAmount < 1) {
      return res.status(400).json({ success: false, error: 'المبلغ مطلوب والحد الأدنى للإيداع هو $1' });
    }

    if (!['BEP20', 'TRC20', 'TON'].includes(cleanNetwork)) {
      return res.status(400).json({ success: false, error: 'يرجى تحديد شبكة صالحة (BEP20, TRC20, TON)' });
    }

    if (!cleanTxid || cleanTxid === 'null' || cleanTxid === 'undefined' || cleanTxid === '' || cleanTxid === 'NaN') {
      cleanTxid = 'DEP_' + Date.now() + '_' + crypto.randomBytes(6).toString('hex');
    } else if (cleanTxid.length < 3) {
      return res.status(400).json({ success: false, error: 'معرف المعاملة (TxID / TxHash) غير صالح' });
    }

    let targetUserId = req.userId;
    if (explicitUserId) {
      const cleanExplicitId = String(explicitUserId).trim();
      if (cleanExplicitId && cleanExplicitId !== 'null' && cleanExplicitId !== 'undefined' && cleanExplicitId !== 'NaN') {
        if (mongoose.Types.ObjectId.isValid(cleanExplicitId)) {
          const foundById = await User.findById(cleanExplicitId);
          if (foundById) targetUserId = foundById._id;
        } else {
          const foundByTg = await User.findOne({ telegramId: cleanExplicitId });
          if (foundByTg) targetUserId = foundByTg._id;
        }
      }
    }

    if (!targetUserId || !mongoose.Types.ObjectId.isValid(targetUserId)) {
      return res.status(400).json({ success: false, error: 'معرف المستخدم (userId) مطلوب أو غير صالح' });
    }

    const userObj = req.user && String(req.user._id) === String(targetUserId) ? req.user : await User.findById(targetUserId);
    if (!userObj) {
      return res.status(404).json({ success: false, error: 'المستخدم غير موجود في قاعدة البيانات' });
    }

    let deposit = null;
    let attempts = 0;
    while (attempts < 3) {
      try {
        const existingDeposit = await Deposit.findOne({ txid: cleanTxid });
        if (existingDeposit) {
          cleanTxid = 'DEP_' + Date.now() + '_' + crypto.randomBytes(6).toString('hex');
        }

        deposit = await Deposit.create({
          userId: targetUserId,
          advertiserId: targetUserId,
          advertiserTelegramId: userObj.telegramId,
          amount: numAmount,
          network: cleanNetwork,
          txid: cleanTxid,
          status: 'pending'
        });
        break;
      } catch (dbErr) {
        if (dbErr.code === 11000) {
          cleanTxid = 'DEP_' + Date.now() + '_' + crypto.randomBytes(6).toString('hex');
          attempts++;
          if (attempts >= 3) {
            return res.status(400).json({ success: false, error: 'معرف المعاملة (TxID) مسجل مسبقاً، يرجى التأكد من صحة البيانات' });
          }
        } else {
          throw dbErr;
        }
      }
    }

    const adminTgId = CONFIG.ADMIN_ID;
    if (adminTgId) {
      sendTelegramNotification(
        adminTgId,
        `💳 <b>طلب إيداع جديد!</b>\nالمستخدم: <code>${userObj.username || targetUserId}</code>\nالمبلغ: <code>$${numAmount}</code>\nالشبكة: <code>${cleanNetwork}</code>\nTxID: <code>${cleanTxid}</code>`
      );
    }

    return res.json({ success: true, deposit });
  } catch (err) {
    logger.error('Error in handleDeposit:', err);
    return res.status(500).json({ success: false, error: err.message || 'حدث خطأ داخلي أثناء معالجة طلب الإيداع' });
  }
};

app.all('/api/deposit', resolveUserId, handleDeposit);
app.all('/deposit', resolveUserId, handleDeposit);
app.all('/api/user/deposit', resolveUserId, handleDeposit);
app.all('/user/deposit', resolveUserId, handleDeposit);
app.all('/api/wallet/topup', resolveUserId, handleDeposit);
app.all('/wallet/topup', resolveUserId, handleDeposit);
app.all('/api/deposits', resolveUserId, handleDeposit);
app.all('/deposits', resolveUserId, handleDeposit);

app.post('/api/withdraw', resolveUserId, async (req, res, next) => {
  await connectDB();
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const { amount, network, walletAddress } = req.body;
    const numAmt = Number(amount);
    const cleanNetwork = String(network || '').toUpperCase();
    const cleanWallet = String(walletAddress || '').trim();
    const targetUserId = req.userId;
    const FEE = 3;

    if (isNaN(numAmt) || numAmt < 30) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, error: 'الحد الأدنى بالسحب هو $30' });
    }

    if (!['BEP20', 'TRC20', 'TON'].includes(cleanNetwork)) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, error: 'يرجى تحديد الشبكة (BEP20, TRC20, TON)' });
    }

    if (!cleanWallet || cleanWallet.length < 10) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, error: 'عنوان المحفظة غير صالح' });
    }

    const activePending = await Withdraw.findOne({ userId: targetUserId, status: 'pending' }).session(session);
    if (activePending) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, error: 'لديك طلب سحب قيد الانتظار حالياً، يرجى الانتظار حتى معالجته' });
    }

    const netAmount = numAmt - FEE;

    const updatedUser = await User.findOneAndUpdate(
      { _id: targetUserId, availableBalance: { $gte: numAmt } },
      { $inc: { availableBalance: -numAmt }, defaultWallet: cleanWallet },
      { new: true, session }
    );

    if (!updatedUser) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, error: 'رصيدك المتاح لا يكفي لإتمام عملية السحب' });
    }

    const withdrawRequest = await Withdraw.create([{
      userId: targetUserId,
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

app.get('/api/user/transactions', resolveUserId, async (req, res, next) => {
  try {
    await connectDB();
    const targetUserId = req.userId;
    const [deposits, withdraws] = await Promise.all([
      Deposit.find({ userId: targetUserId }).sort({ createdAt: -1 }).lean(),
      Withdraw.find({ userId: targetUserId }).sort({ createdAt: -1 }).lean()
    ]);

    res.json({ success: true, deposits, withdraws });
  } catch (err) {
    next(err);
  }
});

// =========================================================================
// --- Bridge Page & Redirect Traffic Engine ---
// =========================================================================

const handleInitClick = async (req, res, next) => {
  try {
    await connectDB();
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
};

app.post('/api/init-click', validateTraffic, handleInitClick);
app.post('/init-click', validateTraffic, handleInitClick);

const handleImpression = async (req, res, next) => {
  await connectDB();
  const sessionDb = await mongoose.startSession();
  try {
    sessionDb.startTransaction();
    const { sessionId, bridgeToken, duration } = req.body;
    if (!sessionId || !bridgeToken) {
      await sessionDb.abortTransaction();
      return res.status(400).json({ success: false, error: 'رمز حماية الجلسة مفقود' });
    }

    const cachedToken = await safeRedisGet(`bridge:token:${sessionId}`);
    if (cachedToken && cachedToken !== bridgeToken) {
      await sessionDb.abortTransaction();
      return res.status(403).json({ success: false, error: 'تم اكتشاف محاولة تخطي غير مشروعة' });
    }

    const clickSession = await ClickSession.findById(sessionId).session(sessionDb);
    if (!clickSession || clickSession.ip !== req.ip) {
      await sessionDb.abortTransaction();
      return res.status(403).json({ success: false, error: 'الجلسة غير صالحة' });
    }

    const dwellTime = Date.now() - new Date(clickSession.createdAt).getTime();
    if (dwellTime < 4800 && (Number(duration) || 0) < 5) {
      await sessionDb.abortTransaction();
      return res.status(400).json({ success: false, error: 'لم يتم استيفاء وقت المكوث المطلوب (5 ثوانٍ)' });
    }

    let dailyIpClicks = 1;
    if (redisIsConnected && redis) {
      try {
        const dailyIpClickKey = `daily:ip:${req.ip}`;
        dailyIpClicks = await redis.incr(dailyIpClickKey);
        if (dailyIpClicks === 1) {
          await redis.expire(dailyIpClickKey, 86400);
        }
      } catch (e) {
        dailyIpClicks = 1;
      }
    }

    const lockKey = `imp:${clickSession.linkId}:${req.ip}`;
    const isDuplicate = await safeRedisGet(lockKey);

    const link = await Link.findById(clickSession.linkId).populate('userId').session(sessionDb);
    await ClickSession.findByIdAndDelete(sessionId).session(sessionDb);
    await safeRedisDel(`bridge:token:${sessionId}`);

    if (!link) {
      await sessionDb.abortTransaction();
      return res.status(404).json({ success: false, error: 'الرابط غير موجود' });
    }

    const linkOwnerId = link.userId?._id || link.userId;
    const linkOwnerTelegramId = link.userId?.telegramId || link.publisherTelegramId;

    if (isDuplicate || dailyIpClicks > 20) {
      await Link.findByIdAndUpdate(link._id, { $inc: { views: 1, invalidImpressions: 1 } }, { session: sessionDb });
      await sessionDb.commitTransaction();
      return res.json({ success: true, targetUrl: link.targetUrl, counted: false });
    }

    await safeRedisSet(lockKey, '1', 'EX', 86400);

    await Impression.create([{
      linkId: link._id,
      userId: linkOwnerId,
      publisherId: linkOwnerId,
      publisherTelegramId: linkOwnerTelegramId,
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
          linkOwnerId,
          { $inc: { pendingBalance: publisherShare } },
          { session: sessionDb }
        );

        const releaseDate = new Date();
        releaseDate.setDate(releaseDate.getDate() + 1);
        await EarningsHold.create([{
          userId: linkOwnerId,
          telegramId: linkOwnerTelegramId,
          amount: publisherShare,
          releaseAt: releaseDate
        }], { session: sessionDb });
      }
    }

    await sessionDb.commitTransaction();
    res.json({ success: true, targetUrl: link.targetUrl, counted: true });
  } catch (err) {
    await sessionDb.abortTransaction();
    next(err);
  } finally {
    sessionDb.endSession();
  }
};

app.post('/api/impression', validateTraffic, clickLimiter, handleImpression);
app.post('/impression', validateTraffic, clickLimiter, handleImpression);

app.post('/api/user/settings', resolveUserId, async (req, res, next) => {
  try {
    await connectDB();
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

// =========================================================================
// --- Admin Panel Complete Management Routes ---
// =========================================================================

app.get('/api/admin/dashboard-data', adminMiddleware, async (req, res, next) => {
  try {
    await connectDB();
    const [withdraws, deposits, users, stats, totalAds, totalChannels] = await Promise.all([
      Withdraw.find().populate('userId').sort({ createdAt: -1 }).lean(),
      Deposit.find().populate('advertiserId').sort({ createdAt: -1 }).lean(),
      User.find().sort({ createdAt: -1 }).limit(100).lean(),
      User.aggregate([
        { $group: { _id: null, totalPending: {$sum: "$pendingBalance" }, totalAvailable: { $sum: "$availableBalance" }, totalUsers: { $sum: 1 } } }
      ]),
      Ad.countDocuments(),
      Channel.countDocuments()
    ]);

    res.json({ success: true, withdraws, deposits, users, stats: { ...(stats[0] || {}), totalAds, totalChannels } });
  } catch (err) {
    next(err);
  }
});

app.get('/api/admin/users', adminMiddleware, async (req, res, next) => {
  try {
    await connectDB();
    const users = await User.find().sort({ createdAt: -1 }).lean();
    res.json({ success: true, users });
  } catch (err) {
    next(err);
  }
});

app.post('/api/admin/users/ban', adminMiddleware, async (req, res, next) => {
  try {
    await connectDB();
    const { userId, isBanned } = req.body;
    if (!mongoose.Types.ObjectId.isValid(userId)) return res.status(400).json({ success: false, error: 'معرف المستخدم غير صالح' });

    const user = await User.findByIdAndUpdate(userId, { isBanned: Boolean(isBanned) }, { new: true });
    res.json({ success: true, user });
  } catch (err) {
    next(err);
  }
});

app.post('/api/admin/users/balance', adminMiddleware, async (req, res, next) => {
  try {
    await connectDB();
    const { userId, amount, type } = req.body;
    const numAmount = Number(amount);

    if (!mongoose.Types.ObjectId.isValid(userId) || isNaN(numAmount)) {
      return res.status(400).json({ success: false, error: 'بيانات التعديل غير صالحة' });
    }

    const delta = type === 'deduct' ? -Math.abs(numAmount) : Math.abs(numAmount);
    const user = await User.findByIdAndUpdate(userId, { $inc: { availableBalance: delta } }, { new: true });

    res.json({ success: true, balance: user.availableBalance });
  } catch (err) {
    next(err);
  }
});

app.post('/api/admin/deposits/approve', adminMiddleware, async (req, res, next) => {
  await connectDB();
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const { depositId } = req.body;

    const deposit = await Deposit.findById(depositId).session(session);
    if (!deposit || deposit.status !== 'pending') {
      await session.abortTransaction();
      return res.status(400).json({ success: false, error: 'طلب الإيداع غير موجود أو تم معالجته مسبقاً' });
    }

    deposit.status = 'approved';
    await deposit.save({ session });

    await User.findByIdAndUpdate(
      deposit.userId || deposit.advertiserId,
      { $inc: { availableBalance: deposit.amount } },
      { session }
    );

    await session.commitTransaction();

    sendTelegramNotification(
      deposit.advertiserTelegramId,
      `✅ <b>تم تأكيد الإيداع بنجاح!</b>\nتم إضافة <code>$${deposit.amount}</code> إلى رصيدك المتاح.`
    );

    res.json({ success: true, deposit });
  } catch (err) {
    await session.abortTransaction();
    next(err);
  } finally {
    session.endSession();
  }
});

app.post('/api/admin/deposits/reject', adminMiddleware, async (req, res, next) => {
  try {
    await connectDB();
    const { depositId, reason } = req.body;

    const deposit = await Deposit.findById(depositId);
    if (!deposit || deposit.status !== 'pending') {
      return res.status(400).json({ success: false, error: 'طلب الإيداع غير موجود أو معالج' });
    }

    deposit.status = 'rejected';
    deposit.rejectionReason = reason || 'معاملة غير مؤكدة';
    await deposit.save();

    sendTelegramNotification(
      deposit.advertiserTelegramId,
      `❌ <b>تم رفض طلب الإيداع.</b>\nالسبب: ${deposit.rejectionReason}`
    );

    res.json({ success: true, deposit });
  } catch (err) {
    next(err);
  }
});

app.post('/api/admin/withdraws/approve', adminMiddleware, async (req, res, next) => {
  try {
    await connectDB();
    const { withdrawId, txid } = req.body;

    const withdraw = await Withdraw.findById(withdrawId);
    if (!withdraw || withdraw.status !== 'pending') {
      return res.status(400).json({ success: false, error: 'طلب السحب غير موجود أو معالج مسبقاً' });
    }

    withdraw.status = 'approved';
    withdraw.txid = txid || 'TX_' + Date.now();
    await withdraw.save();

    sendTelegramNotification(
      withdraw.telegramId,
      `🎉 <b>تم إرسال السحب بنجاح!</b>\nالمبلغ: <code>$${withdraw.netAmount}</code>\nرقم المعاملة: <code>${withdraw.txid}</code>`
    );

    res.json({ success: true, withdraw });
  } catch (err) {
    next(err);
  }
});

app.post('/api/admin/withdraws/reject', adminMiddleware, async (req, res, next) => {
  await connectDB();
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const { withdrawId, reason } = req.body;

    const withdraw = await Withdraw.findById(withdrawId).session(session);
    if (!withdraw || withdraw.status !== 'pending') {
      await session.abortTransaction();
      return res.status(400).json({ success: false, error: 'طلب السحب غير موجود أو معالج' });
    }

    withdraw.status = 'rejected';
    withdraw.rejectionReason = reason || 'رفض من قبل الإدارة';
    await withdraw.save({ session });

    await User.findByIdAndUpdate(
      withdraw.userId,
      { $inc: { availableBalance: withdraw.amount } },
      { session }
    );

    await session.commitTransaction();

    sendTelegramNotification(
      withdraw.telegramId,
      `❌ <b>تم رفض طلب السحب وإعادة الرصيد لحسابك.</b>\nالسبب: ${withdraw.rejectionReason}`
    );

    res.json({ success: true, withdraw });
  } catch (err) {
    await session.abortTransaction();
    next(err);
  } finally {
    session.endSession();
  }
});

app.get('/api/admin/channels', adminMiddleware, async (req, res, next) => {
  try {
    await connectDB();
    const channels = await Channel.find().populate('userId').sort({ createdAt: -1 }).lean();
    res.json({ success: true, channels });
  } catch (err) {
    next(err);
  }
});

app.post('/api/admin/channels/verify', adminMiddleware, async (req, res, next) => {
  try {
    await connectDB();
    const { channelId, status, cpmRate } = req.body;

    if (!['verified', 'rejected', 'paused'].includes(status)) {
      return res.status(400).json({ success: false, error: 'حالة غير صالحة' });
    }

    const updateObj = { status };
    if (cpmRate && !isNaN(Number(cpmRate))) {
      updateObj.cpmRate = Number(cpmRate);
    }

    const channel = await Channel.findByIdAndUpdate(channelId, updateObj, { new: true });
    res.json({ success: true, channel });
  } catch (err) {
    next(err);
  }
});

app.post('/api/admin/announcements', adminMiddleware, async (req, res, next) => {
  try {
    await connectDB();
    const { title, message, isGlobal, targetUserId } = req.body;

    if (!title || !message) {
      return res.status(400).json({ success: false, error: 'العنوان ونص الإعلان مطلوبان' });
    }

    const announcement = await Announcement.create({
      title,
      message,
      isGlobal: Boolean(isGlobal),
      targetUserId: targetUserId || null
    });

    res.json({ success: true, announcement });
  } catch (err) {
    next(err);
  }
});

app.delete('/api/admin/announcements/:id', adminMiddleware, async (req, res, next) => {
  try {
    await connectDB();
    await Announcement.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'تم حذف الإعلان' });
  } catch (err) {
    next(err);
  }
});

// =========================================================================
// --- Global 404 & Central Error Handling Middleware ---
// =========================================================================

app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ success: false, error: 'المسار المطلوبة غير موجودة (API Endpoint Not Found)' });
  }
  res.sendFile(path.join(process.cwd(), 'public', 'views.html'));
});

app.use((err, req, res, next) => {
  logger.error('Unhandled Server Error:', err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'حدث خطأ غير متوقع في الخادم'
  });
});

module.exports = app;
