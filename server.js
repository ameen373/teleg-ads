require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const path = require('path');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');
const validUrl = require('valid-url');
const axios = require('axios');
const Redis = require('ioredis');
const winston = require('winston');
const morgan = require('morgan');

const { User, Link, Ad, Transaction, Impression, ClickSession, EarningsHold, Announcement } = require('./models');

const app = express();

// ==========================================
// 1. Configuration & Enterprise Logging
// ==========================================

app.set('trust proxy', 1);

app.use(cors({ origin: true, credentials: true }));
app.options('*', cors());
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(express.static(__dirname));

app.use('/api', (req, res, next) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  next();
});

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

const CONFIG = Object.freeze({
  BOT_TOKEN: process.env.BOT_TOKEN,
  MONGO_URI: process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/shortener',
  ADMIN_ID: process.env.ADMIN_ID || '123456789',
  JWT_SECRET: process.env.JWT_SECRET || 'super_secure_jwt_secret_key_production_32bytes',
  ADSGRAM_BLOCK_ID: process.env.ADSGRAM_BLOCK_ID || '1234',
  APP_DOMAIN: process.env.APP_DOMAIN || 'localhost:3000',
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

// ==========================================
// 2. Distributed Cache & Memory Locks (Redis)
// ==========================================

let redisIsConnected = false;
const redis = new Redis(CONFIG.REDIS_URL, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  retryStrategy: (times) => Math.min(times * 50, 2000)
});

redis.on('error', (err) => {
  redisIsConnected = false;
  logger.error('⚠️ Redis Connection Error: ' + err.message);
});

redis.on('ready', () => {
  redisIsConnected = true;
  console.log('✅ Enterprise Redis Distributed Cache Connected');
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
  } catch (e) { logger.error('Redis Set Exception: ' + e.message); }
}

async function safeRedisDel(key) {
  if (!redisIsConnected) return;
  try { await redis.del(key); } catch (e) { logger.error('Redis Del Exception: ' + e.message); }
}

async function safeRedisIncr(key) {
  if (!redisIsConnected) return 0;
  try { return await redis.incr(key); } catch (e) { return 0; }
}

// ==========================================
// 3. Helper Functions & Telegram Dispatch Engine
// ==========================================

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
  const blacklistedKeywords = ['phish', 'login-verify', 'free-telegram-premium', 'grabber', 'stealer', 'iplogger'];
  const lowerUrl = url.toLowerCase();
  return blacklistedKeywords.some(keyword => lowerUrl.includes(keyword));
};

// ==========================================
// 4. Rate-Limiters & Anti-Fraud Security
// ==========================================

const linkCreationLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'تم تجاوز الحد الأقصى اليومي لإنشاء الروابط' }
});

const clickLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
  message: { success: false, error: 'طلبات مكثفة، يرجى الانتظار قليلاً' }
});

const validateTraffic = (req, res, next) => {
  const ua = req.get('User-Agent') || '';
  const botPattern = /bot|crawler|spider|datacenter|proxy|httpclient|curl|python|axios|headless|selenium|puppeteer/i;
  if (botPattern.test(ua)) {
    return res.status(403).json({ success: false, error: 'ممنوع استخدام الزيارات الوهمية أو البوتات (Automated traffic rejected)' });
  }
  next();
};

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ success: false, error: 'غير مصرح: رمز الوصول مفقود' });

  try {
    const decoded = jwt.verify(token, CONFIG.JWT_SECRET);
    const userId = decoded.id || decoded.userId;
    const user = await User.findById(userId).lean();
    if (!user || user.isBanned) return res.status(403).json({ success: false, error: 'الحساب محظور أو غير موجود' });
    
    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ success: false, error: 'انتهت صلاحية الجلسة، يرجى إعادة الدخول' });
  }
};

const isAdmin = (req, res, next) => {
  const isUserAdminRole = req.user.role === 'admin';
  const isUserAdminId = String(req.user.telegramId) === String(CONFIG.ADMIN_ID);
  
  if (!isUserAdminRole && !isUserAdminId) {
    return res.status(403).json({ success: false, error: 'صلاحيات الأدمن مطلوبة لتنفيذ هذا الإجراء' });
  }
  next();
};

// ==========================================
// 5. Authentication & Profile Management
// ==========================================

app.post('/api/auth/login', async (req, res, next) => {
  try {
    const initData = req.headers['x-telegram-init-data'];
    const { telegramUserInfo, referrerId } = req.body;
    let validatedTgUser = verifyTelegramData(initData);

    let tgId, username, firstName, isPremium, languageCode;

    if (validatedTgUser) {
      tgId = String(validatedTgUser.id);
      username = validatedTgUser.username;
      firstName = validatedTgUser.first_name;
      isPremium = validatedTgUser.is_premium || false;
      languageCode = validatedTgUser.language_code;
    } else if (process.env.NODE_ENV !== 'production' && telegramUserInfo?.id) {
      tgId = String(telegramUserInfo.id);
      username = telegramUserInfo.username;
      firstName = telegramUserInfo.first_name;
      isPremium = telegramUserInfo.is_premium || false;
      languageCode = 'ar';
    } else {
      return res.status(403).json({ success: false, error: 'بيانات التليجرام غير صالحة أو تم التلاعب بها' });
    }

    let user = await User.findOne({ telegramId: tgId });

    if (!user) {
      user = new User({
        telegramId: tgId,
        username: username || `user_${tgId.slice(-4)}`,
        firstName: firstName || 'User',
        isPremium: isPremium,
        language: languageCode || CONFIG.DEFAULT_LANGUAGE,
        role: String(tgId) === String(CONFIG.ADMIN_ID) ? 'admin' : 'user',
        referredBy: mongoose.Types.ObjectId.isValid(referrerId) ? referrerId : null
      });
      await user.save();
    } else {
      let isUpdated = false;
      if (username && user.username !== username) { user.username = username; isUpdated = true; }
      if (firstName && user.firstName !== firstName) { user.firstName = firstName; isUpdated = true; }
      if (isUpdated) await user.save();
    }

    if (user.isBanned) return res.status(403).json({ success: false, error: `حسابك محظور. للتواصل مع الدعم: ${CONFIG.SUPPORT_USERNAME}` });

    const token = jwt.sign(
      { id: user._id, userId: user._id, role: user.role, telegramId: user.telegramId }, 
      CONFIG.JWT_SECRET, 
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token,
      isAdmin: user.role === 'admin' || String(user.telegramId) === String(CONFIG.ADMIN_ID),
      user,
      language: user.language || CONFIG.DEFAULT_LANGUAGE,
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
  } catch (error) {
    next(error);
  }
});

app.get('/api/user/data', authenticateToken, async (req, res, next) => {
  try {
    const currentUserId = req.user._id;

    // تم إصلاح تسريب البيانات: تصفية كل البيانات بحسب معرف المستخدم req.user._id حصراً
    const [rawLinks, ads, withdraws, deposits, announcements] = await Promise.all([
      Link.find({ userId: currentUserId }).sort({ createdAt: -1 }).lean(),
      Ad.find({ advertiserId: currentUserId }).sort({ createdAt: -1 }).lean(),
      Transaction.find({ userId: currentUserId, type: 'withdraw' }).sort({ createdAt: -1 }).lean(),
      Transaction.find({ userId: currentUserId, type: 'deposit' }).sort({ createdAt: -1 }).lean(),
      Announcement ? Announcement.find({ isActive: true }).sort({ createdAt: -1 }).limit(5).lean() : []
    ]);
    
    const links = rawLinks.map(l => {
      const views = l.views || 0;
      const valid = l.validImpressions || 0;
      const ctr = views > 0 ? ((valid / views) * 100).toFixed(1) : "0.0";
      return {
        ...l,
        ctr,
        shortUrl: `https://${CONFIG.APP_DOMAIN}/r/${l.shortCode}`
      };
    });

    res.json({
      success: true,
      user: req.user,
      isAdmin: req.user.role === 'admin' || String(req.user.telegramId) === String(CONFIG.ADMIN_ID),
      links,
      ads,
      withdraws,
      deposits,
      announcements,
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

app.post('/api/user/settings', authenticateToken, async (req, res, next) => {
  try {
    const { defaultWallet, language } = req.body;
    const updateObj = {};
    if (defaultWallet !== undefined) updateObj.defaultWallet = String(defaultWallet).trim();
    if (language !== undefined) updateObj.language = String(language).trim().toLowerCase();

    await User.findByIdAndUpdate(req.user._id, updateObj);
    res.json({ success: true, message: 'تم تحديث الإعدادات بنجاح' });
  } catch (err) {
    next(err);
  }
});

// ==========================================
// 6. Link Management Engine
// ==========================================

app.post('/api/links', authenticateToken, linkCreationLimiter, async (req, res, next) => {
  try {
    const { title, targetUrl } = req.body;
    const cleanUrl = String(targetUrl || '').trim();

    if (!cleanUrl || !validUrl.isWebUri(cleanUrl)) {
      return res.status(400).json({ success: false, error: 'الرابط المستهدف غير صالحة صيغته' });
    }

    if (isPhishingOrMalicious(cleanUrl)) {
      return res.status(400).json({ success: false, error: 'الرابط ينتهك معايير أمان المنصة' });
    }

    try {
      const hostname = new URL(cleanUrl).hostname;
      if (hostname.includes(CONFIG.APP_DOMAIN)) {
        return res.status(400).json({ success: false, error: 'لا يمكن اختصار روابط من نفس المنصة' });
      }
    } catch (e) {}

    const shortCode = crypto.randomBytes(3).toString('hex');
    const newLink = new Link({
      userId: req.user._id,
      title: title ? String(title).trim() : 'بدون عنوان',
      originalUrl: cleanUrl,
      shortCode: shortCode,
      isActive: true
    });

    await newLink.save();
    
    await safeRedisSet(`link:data:${shortCode}`, JSON.stringify({
      id: newLink._id.toString(),
      userId: req.user._id.toString(),
      targetUrl: cleanUrl
    }), 'EX', 86400);

    res.json({
      success: true,
      ...newLink.toObject(),
      shortUrl: `https://${CONFIG.APP_DOMAIN}/r/${shortCode}`
    });
  } catch (err) {
    next(err);
  }
});

app.post('/api/links/toggle', authenticateToken, async (req, res, next) => {
  try {
    const link = await Link.findOne({ _id: req.body.linkId, userId: req.user._id });
    if (!link) return res.status(404).json({ success: false, error: 'الرابط غير موجود أو غير مملوك لك' });
    
    link.isActive = !link.isActive;
    await link.save();

    await safeRedisDel(`link:data:${link.shortCode}`);
    res.json({ success: true, isActive: link.isActive });
  } catch (err) {
    next(err);
  }
});

// ==========================================
// 7. Ads & Transactions Engine
// ==========================================

app.post('/api/ads', authenticateToken, async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const { title, targetUrl, totalBudget } = req.body;
    const budget = Number(totalBudget);

    if (!title || !validUrl.isWebUri(targetUrl) || isNaN(budget) || budget < 5) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, error: 'بيانات الحملة غير صحيحة، الحد الأدنى للميزانية هو $5' });
    }

    const updatedUser = await User.findOneAndUpdate(
      { _id: req.user._id, availableBalance: { $gte: budget } },
      { $inc: { availableBalance: -budget } },
      { new: true, session }
    );

    if (!updatedUser) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, error: 'رصيدك غير كافٍ لإطلاق هذه الحملة' });
    }

    const newAd = new Ad({
      advertiserId: req.user._id,
      title: String(title).trim(),
      targetUrl: String(targetUrl).trim(),
      totalBudget: budget,
      remainingBudget: budget,
      costPerImpression: 0.0015,
      publisherEarningsPerImpression: 0.00135,
      status: 'active'
    });

    await newAd.save({ session });
    await session.commitTransaction();

    res.json({ success: true, ad: newAd });
  } catch (err) {
    await session.abortTransaction();
    next(err);
  } finally {
    session.endSession();
  }
});

app.post('/api/ads/toggle', authenticateToken, async (req, res, next) => {
  try {
    const { adId } = req.body;
    const ad = await Ad.findOne({ _id: adId, advertiserId: req.user._id });
    if (!ad) return res.status(404).json({ success: false, error: 'الإعلان غير موجود' });

    if (ad.status === 'completed') {
      return res.status(400).json({ success: false, error: 'لا يمكن تفعيل حملة مكتملة ومستنفذة للميزانية' });
    }

    ad.status = ad.status === 'active' ? 'paused' : 'active';
    await ad.save();

    res.json({ success: true, status: ad.status });
  } catch (err) {
    next(err);
  }
});

app.post('/api/deposit', authenticateToken, async (req, res, next) => {
  try {
    const { amount, paymentMethod, network, txHash, txid } = req.body;
    const numAmount = Number(amount);
    const hash = String(txHash || txid || '').trim();

    if (isNaN(numAmount) || numAmount < 1) {
      return res.status(400).json({ success: false, error: 'مبلغ الإيداع يجب أن يكون $1 على الأقل' });
    }

    if (!hash || hash.length < 8) {
      return res.status(400).json({ success: false, error: 'يرجى إدخال هاش المعاملة الصحيح (TxID)' });
    }

    const tx = new Transaction({
      userId: req.user._id,
      type: 'deposit',
      amount: numAmount,
      paymentMethod: paymentMethod || network || 'Crypto',
      network: String(network || 'TRC20').toUpperCase(),
      txHash: hash,
      status: 'pending'
    });

    await tx.save();

    sendTelegramNotification(
      CONFIG.ADMIN_ID,
      `💳 <b>طلب إيداع جديد!</b>\nالمستخدم: <code>${req.user.username}</code>\nالمبلغ: <code>$${numAmount}</code>\nطريقة الدفع: <code>${tx.paymentMethod}</code>\nHash: <code>${tx.txHash}</code>`
    );

    res.json({ success: true, transaction: tx });
  } catch (err) {
    next(err);
  }
});

app.post('/api/withdraw', authenticateToken, async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const { amount, walletAddress, network } = req.body;
    const numAmt = Number(amount);
    const fee = 3;

    if (isNaN(numAmt) || numAmt < 30) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, error: 'الحد الأدنى للسحب هو 30 دولار' });
    }

    const netAmount = numAmt - fee;

    const updatedUser = await User.findOneAndUpdate(
      { _id: req.user._id, availableBalance: { $gte: numAmt } },
      { $inc: { availableBalance: -numAmt }, defaultWallet: walletAddress },
      { new: true, session }
    );

    if (!updatedUser) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, error: 'الرصيد المتاح غير كافٍ لإجراء عملية السحب' });
    }

    const tx = new Transaction({
      userId: req.user._id,
      type: 'withdraw',
      amount: numAmt,
      fee: fee,
      netAmount: netAmount,
      network: String(network || 'TRC20').toUpperCase(),
      walletAddress: String(walletAddress).trim(),
      status: 'pending'
    });

    await tx.save({ session });
    await session.commitTransaction();

    sendTelegramNotification(
      req.user.telegramId,
      `🔔 <b>تم تقديم طلب السحب بنجاح!</b>\nالمبلغ الإجمالي: <code>$${numAmt}</code>\nالصافي: <code>$${netAmount}</code>\nالعنوان: <code>${walletAddress}</code>\nالحالة: ⏳ قيد المراجعة`
    );

    res.json({ success: true, transaction: tx });
  } catch (err) {
    await session.abortTransaction();
    next(err);
  } finally {
    session.endSession();
  }
});

// ==========================================
// 8. Bridge & Ad Execution Engine
// ==========================================

app.post('/api/init-click', validateTraffic, async (req, res, next) => {
  try {
    const { linkCode } = req.body;
    const cleanCode = String(linkCode || '').trim();

    if (!cleanCode) return res.status(400).json({ success: false, error: 'كود الرابط مطلوب' });

    let cachedLink = await safeRedisGet(`link:data:${cleanCode}`);
    let linkId, linkOwnerId;

    if (cachedLink) {
      const parsed = JSON.parse(cachedLink);
      linkId = parsed.id;
      linkOwnerId = parsed.userId;
    } else {
      const link = await Link.findOne({ shortCode: cleanCode, isActive: true }).lean();
      if (!link) return res.status(404).json({ success: false, error: 'الرابط غير موجود أو معطل' });

      linkId = link._id.toString();
      linkOwnerId = link.userId.toString();
      
      await safeRedisSet(`link:data:${cleanCode}`, JSON.stringify({
        id: linkId,
        userId: linkOwnerId,
        targetUrl: link.originalUrl
      }), 'EX', 3600);
    }

    if (ClickSession) {
      await ClickSession.deleteMany({ linkId, ip: req.ip });
    }

    const activeAds = await Ad.aggregate([
      { 
        $match: { 
          status: 'active', 
          remainingBudget: { $gte: 0.0015 },
          advertiserId: { $ne: new mongoose.Types.ObjectId(linkOwnerId) }
        } 
      },
      { $sample: { size: 1 } }
    ]);

    const selectedAd = activeAds.length > 0 ? activeAds[0] : null;
    const bridgeToken = crypto.randomBytes(16).toString('hex');
    
    let sessionId;
    if (ClickSession) {
      const dbSession = await ClickSession.create({
        linkId,
        ip: req.ip,
        bridgeToken,
        adSource: selectedAd ? 'internal' : 'adsgram',
        adId: selectedAd ? selectedAd._id : null
      });
      sessionId = dbSession._id.toString();
    } else {
      sessionId = crypto.randomBytes(12).toString('hex');
    }

    await safeRedisSet(`click:session:${sessionId}`, JSON.stringify({
      linkId,
      ip: req.ip,
      bridgeToken,
      adId: selectedAd ? selectedAd._id.toString() : null,
      createdAt: Date.now()
    }), 'EX', 300);

    res.json({
      success: true,
      sessionId: sessionId,
      bridgeToken,
      adSource: selectedAd ? 'internal' : 'adsgram',
      adData: selectedAd ? { id: selectedAd._id, title: selectedAd.title, targetUrl: selectedAd.targetUrl } : null,
      blockId: CONFIG.ADSGRAM_BLOCK_ID
    });
  } catch (err) {
    next(err);
  }
});

app.post('/api/impression', validateTraffic, clickLimiter, async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const { linkCode, duration, sessionId, bridgeToken } = req.body;

    if (Number(duration) < 5) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, error: 'زيارة غير صالحة (مدة البقاء أقل من 5 ثوانٍ)' });
    }

    const ipDailyKey = `daily:ip:${req.ip}`;
    const dailyClicks = await safeRedisIncr(ipDailyKey);
    if (dailyClicks === 1) {
      await safeRedisSet(ipDailyKey, '1', 'EX', 86400);
    }
    if (dailyClicks > 20) {
      await session.abortTransaction();
      return res.status(429).json({ success: false, error: 'تم التوصل للحد الأقصى للزيارات من هذا العنوان اليوم' });
    }

    let sessionData = null;
    if (sessionId) {
      const rawSession = await safeRedisGet(`click:session:${sessionId}`);
      if (rawSession) sessionData = JSON.parse(rawSession);
    }

    if (!sessionData || (sessionData.bridgeToken && sessionData.bridgeToken !== bridgeToken)) {
      await session.abortTransaction();
      return res.status(403).json({ success: false, error: 'تم اكتشاف محاولة تجاوز أمان التوكن (Anti-Bypass Triggered)' });
    }

    const now = Date.now();
    const elapsedSeconds = (now - sessionData.createdAt) / 1000;
    if (elapsedSeconds < 4.5) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, error: 'فترة الانتظار الزمانية غير كافية لتحقيق النقرة' });
    }

    const link = await Link.findOne({ shortCode: linkCode }).populate('userId').session(session);
    if (!link) {
      await session.abortTransaction();
      return res.status(404).json({ success: false, error: 'الرابط غير موجود' });
    }

    const lockKey = `impression:lock:${link._id}:${req.ip}`;
    const isDuplicate = await safeRedisGet(lockKey);

    if (isDuplicate) {
      await Link.findByIdAndUpdate(link._id, { $inc: { views: 1, invalidImpressions: 1 } }, { session });
      await session.commitTransaction();
      return res.json({ success: true, targetUrl: link.originalUrl, counted: false });
    }

    await safeRedisSet(lockKey, '1', 'EX', 86400);

    const earningAmount = 0.00135;
    link.views = (link.views || 0) + 1;
    link.validImpressions = (link.validImpressions || 0) + 1;
    await link.save({ session });

    if (sessionData && sessionData.adId) {
      const ad = await Ad.findById(sessionData.adId).session(session);
      if (ad && ad.remainingBudget >= 0.0015) {
        ad.remainingBudget -= 0.0015;
        if (ad.remainingBudget < 0.0015) ad.status = 'completed';
        await ad.save({ session });
      }
    }

    if (link.userId) {
      let publisherShare = earningAmount;

      if (link.userId.referredBy) {
        const refBonus = publisherShare * 0.10;
        publisherShare -= refBonus;

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

      if (EarningsHold) {
        await EarningsHold.create([{
          userId: link.userId._id,
          amount: publisherShare,
          releaseAt: releaseDate
        }], { session });
      }
    }

    if (sessionId) await safeRedisDel(`click:session:${sessionId}`);

    await session.commitTransaction();
    res.json({ success: true, targetUrl: link.originalUrl, counted: true });
  } catch (err) {
    await session.abortTransaction();
    next(err);
  } finally {
    session.endSession();
  }
});

// ==========================================
// 9. Enterprise Admin Control Panel APIs
// ==========================================

app.get('/api/admin/dashboard-data', authenticateToken, isAdmin, async (req, res, next) => {
  try {
    const [withdraws, deposits, users, stats, totalAds] = await Promise.all([
      Transaction.find({ type: 'withdraw' }).populate('userId').sort({ createdAt: -1 }).lean(),
      Transaction.find({ type: 'deposit' }).populate('userId').sort({ createdAt: -1 }).lean(),
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

app.post('/api/admin/deposit/action', authenticateToken, isAdmin, async (req, res, next) => {
  const { depositId, action, reason } = req.body;
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const deposit = await Transaction.findById(depositId).populate('userId').session(session);

    if (!deposit || deposit.status !== 'pending') {
      await session.abortTransaction();
      return res.status(400).json({ success: false, error: 'طلب الإيداع غير موجود أو تم معالجته سابقاً' });
    }

    deposit.status = action;
    if (action === 'rejected') deposit.rejectReason = String(reason || '').trim();
    await deposit.save({ session });

    if (action === 'approved') {
      await User.findByIdAndUpdate(
        deposit.userId._id,
        { $inc: { availableBalance: deposit.amount } },
        { session }
      );

      sendTelegramNotification(
        deposit.userId.telegramId,
        `🎉 <b>تم تأكيد الإيداع!</b>\nتمت إضافة <code>$${deposit.amount}</code> إلى رصيدك المتاح.`
      );
    } else {
      sendTelegramNotification(
        deposit.userId.telegramId,
        `❌ <b>تم رفض طلب الإيداع</b>\nالمبلغ: <code>$${deposit.amount}</code>\n⚠️ <b>السبب:</b> ${deposit.rejectReason}`
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

app.post('/api/admin/withdraw/action', authenticateToken, isAdmin, async (req, res, next) => {
  const { withdrawId, action, reason } = req.body;
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const withdraw = await Transaction.findById(withdrawId).populate('userId').session(session);

    if (!withdraw || withdraw.status !== 'pending') {
      await session.abortTransaction();
      return res.status(400).json({ success: false, error: 'طلب السحب غير موجود أو تم معالجته سابقاً' });
    }

    withdraw.status = action;
    if (action === 'rejected') withdraw.rejectReason = String(reason || '').trim();
    await withdraw.save({ session });

    if (action === 'approved') {
      sendTelegramNotification(
        withdraw.userId.telegramId,
        `✅ <b>تمت إجابة طلب السحب بنجاح!</b>\nالمبلغ الصافي: <code>$${withdraw.netAmount}</code>\nتم التحويل للعنوان: <code>${withdraw.walletAddress}</code>`
      );
    } else {
      await User.findByIdAndUpdate(
        withdraw.userId._id,
        { $inc: { availableBalance: withdraw.amount } },
        { session }
      );

      sendTelegramNotification(
        withdraw.userId.telegramId,
        `❌ <b>تم رفض طلب السحب وإعادة الرصيد للحساب</b>\nالمبلغ: <code>$${withdraw.amount}</code>\n⚠️ <b>السبب:</b> ${withdraw.rejectReason}`
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

app.post('/api/admin/distribute-revenue', authenticateToken, isAdmin, async (req, res, next) => {
  const { totalRevenuePool } = req.body;
  const pool = Number(totalRevenuePool);

  if (isNaN(pool) || pool <= 0) {
    return res.status(400).json({ success: false, error: 'المبلغ المخصص للتوزيع يجب أن يكون أكبر من 0' });
  }

  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const totalValidImpressions = await Link.aggregate([
      { $group: { _id: null, total: { $sum: "$validImpressions" } } }
    ]);

    const globalValid = totalValidImpressions[0]?.total || 0;
    if (globalValid === 0) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, error: 'لا توجد أي زيارات صالحة ومحتسبة حالياً للتوزيع' });
    }

    const ratePerImpression = pool / globalValid;
    const links = await Link.find({ validImpressions: { $gt: 0 } }).populate('userId').session(session);

    for (let link of links) {
      if (!link.userId) continue;

      const linkEarnings = link.validImpressions * ratePerImpression;
      let publisherEarnings = linkEarnings;

      if (link.userId.referredBy) {
        const refBonus = linkEarnings * 0.10;
        publisherEarnings -= refBonus;

        await User.findByIdAndUpdate(
          link.userId.referredBy,
          { $inc: { availableBalance: refBonus, referralEarnings: refBonus } },
          { session }
        );
      }

      await User.findByIdAndUpdate(
        link.userId._id,
        { $inc: { availableBalance: publisherEarnings } },
        { session }
      );
    }

    await session.commitTransaction();
    res.json({ success: true, message: `تم توزيع الميزانية بقيمة $${pool} بنجاح على الناشرين.`, globalValid, ratePerImpression });
  } catch (err) {
    await session.abortTransaction();
    next(err);
  } finally {
    session.endSession();
  }
});

app.post('/api/admin/user/toggle-ban', authenticateToken, isAdmin, async (req, res, next) => {
  try {
    const user = await User.findById(req.body.userId);
    if (!user) return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });

    user.isBanned = !user.isBanned;
    await user.save();

    if (user.isBanned && user.telegramId) {
      sendTelegramNotification(
        user.telegramId,
        `⚠️ <b>تم حظر حسابك على المنصة</b>\nإذا كنت تعتقد أن هذا حدث عن طريق الخطأ يرجى مراسلة الدعم: ${CONFIG.SUPPORT_USERNAME}`
      );
    }

    res.json({ success: true, isBanned: user.isBanned });
  } catch (err) {
    next(err);
  }
});

// ==========================================
// 10. Automated Settlement Cron Engine
// ==========================================

cron.schedule('0 0 * * *', async () => {
  logger.info('🔄 Executing automated earnings hold release cron...');
  try {
    if (EarningsHold) {
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

          if (userUpdate?.telegramId) {
            sendTelegramNotification(
              userUpdate.telegramId,
              `✅ <b>تم تحرير أرباحك اليومية!</b>\nتمت إضافة <code>$${hold.amount.toFixed(4)}</code> إلى رصيدك المتاح للسحب.`
            );
          }
        } catch (e) {
          await session.abortTransaction();
        } finally {
          session.endSession();
        }
      }
    } else {
      const usersWithPending = await User.find({ pendingBalance: { $gt: 0 } });
      for (let user of usersWithPending) {
        const amountToRelease = user.pendingBalance;
        user.availableBalance += amountToRelease;
        user.pendingBalance = 0;
        await user.save();

        sendTelegramNotification(
          user.telegramId,
          `✅ <b>تم تحرير أرباحك اليومية!</b>\nتمت إضافة <code>$${amountToRelease.toFixed(4)}</code> إلى رصيدك المتاح للسحب.`
        );
      }
    }
  } catch (err) {
    logger.error('❌ Cron Settlement Failure: ' + err.message);
  }
});

// ==========================================
// 11. Routing & Server Launch Safeguards
// ==========================================

app.get(['/', '/app', '/admin', '/r/:code'], (req, res) => {
  res.sendFile(path.join(__dirname, 'views.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'views.html'));
});

app.use('/api/*', (req, res) => {
  res.status(404).json({ success: false, error: 'المسار المطلوب غير موجود (Endpoint not found)' });
});

app.use((err, req, res, next) => {
  logger.error('Unhandled Application Error:', err);
  res.status(err.status || 500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' ? 'Internal Server Error' : err.message
  });
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception Detected: ' + err.stack);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

mongoose.connect(CONFIG.MONGO_URI, {
  maxPoolSize: 50,
  minPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000
}).then(() => {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`🚀 Ultra-Enterprise Engine Active on Port ${PORT}`));
}).catch(err => {
  logger.error('❌ DB Connection Error:', err);
  process.exit(1);
});
