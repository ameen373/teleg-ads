/**
 * =========================================================================
 * Telega.ads - Enterprise Server V6 (Unified & Optimized)
 * Backend Web Infrastructure & Telegram Mini App Engine
 * =========================================================================
 */

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const Redis = require('ioredis');
const cors = require('cors');
const crypto = require('crypto');
const cron = require('node-cron');
const validUrl = require('valid-url');
const path = require('path');
const winston = require('winston');

// --- Logger Setup ---
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

// --- App Configuration ---
const CONFIG = {
  APP_DOMAIN: process.env.APP_DOMAIN || 'telega.ads',
  DEFAULT_LANGUAGE: 'ar',
  SUPPORT_USERNAME: process.env.SUPPORT_USERNAME || '@Support'
};

const app = express();

// --- Security & Core Middlewares ---
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Trust proxy if behind Vercel or Nginx/Cloudflare
app.set('trust proxy', true);

// --- Database Connection ---
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/telega_ads';
mongoose.connect(MONGODB_URI, {
  serverSelectionTimeoutMS: 5000
}).then(() => {
  logger.info('✅ Connected to MongoDB successfully.');
}).catch(err => {
  logger.error('❌ MongoDB Connection Error:', err.message);
});

// --- Redis Setup & Safe Wrappers ---
let redisIsConnected = false;
const redis = new Redis(process.env.REDIS_URL || {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  retryStrategy: (times) => Math.min(times * 50, 2000)
});

redis.on('connect', () => {
  redisIsConnected = true;
  logger.info('✅ Connected to Redis successfully.');
});

redis.on('error', (err) => {
  redisIsConnected = false;
  logger.warn('⚠️ Redis Connection Warning: ' + err.message);
});

const safeRedisGet = async (key) => {
  if (!redisIsConnected) return null;
  try { return await redis.get(key); } catch (e) { return null; }
};

const safeRedisSet = async (key, value, mode, duration) => {
  if (!redisIsConnected) return;
  try {
    if (mode && duration) await redis.set(key, value, mode, duration);
    else await redis.set(key, value);
  } catch (e) {}
};

const safeRedisDel = async (key) => {
  if (!redisIsConnected) return;
  try { await redis.del(key); } catch (e) {}
};

// --- Mongoose Schemas & Models ---
const userSchema = new mongoose.Schema({
  telegramId: { type: Number, unique: true, sparse: true, index: true },
  username: String,
  availableBalance: { type: Number, default: 0 },
  pendingBalance: { type: Number, default: 0 },
  referralEarnings: { type: Number, default: 0 },
  referredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  defaultWallet: { type: String, default: '' },
  language: { type: String, default: 'ar' },
  isBanned: { type: Boolean, default: false },
  statsSummary: {
    totalLinksCreated: { type: Number, default: 0 }
  }
}, { timestamps: true });

const linkSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  publisherTelegramId: { type: Number, index: true },
  telegramId: Number,
  title: { type: String, default: 'رابط بدون عنوان' },
  targetUrl: { type: String, required: true },
  shortCode: { type: String, unique: true, index: true },
  isActive: { type: Boolean, default: true },
  views: { type: Number, default: 0 },
  validImpressions: { type: Number, default: 0 },
  invalidImpressions: { type: Number, default: 0 }
}, { timestamps: true });

const clickSessionSchema = new mongoose.Schema({
  linkId: { type: mongoose.Schema.Types.ObjectId, ref: 'Link', required: true },
  ip: { type: String, required: true },
  userAgent: String,
  adSource: { type: String, default: 'internal' },
  adId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ad', default: null }
}, { timestamps: true });

const impressionSchema = new mongoose.Schema({
  linkId: { type: mongoose.Schema.Types.ObjectId, ref: 'Link', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  publisherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  publisherTelegramId: Number,
  adSource: String,
  adId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ad', default: null },
  publisherEarnings: { type: Number, default: 0 },
  ip: String,
  userAgent: String
}, { timestamps: true });

const adSchema = new mongoose.Schema({
  advertiserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  remainingBudget: { type: Number, required: true },
  status: { type: String, enum: ['active', 'completed', 'paused'], default: 'active' },
  costPerImpression: { type: Number, default: 0.0015 },
  publisherEarningsPerImpression: { type: Number, default: 0.00135 },
  impressionsCount: { type: Number, default: 0 }
}, { timestamps: true });

const earningsHoldSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  telegramId: Number,
  amount: { type: Number, required: true },
  releaseAt: { type: Date, required: true, index: true },
  isReleased: { type: Boolean, default: false }
}, { timestamps: true });

const depositSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  advertiserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  advertiserTelegramId: Number,
  amount: { type: Number, required: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  rejectReason: String
}, { timestamps: true });

const withdrawSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  telegramId: Number,
  amount: { type: Number, required: true },
  netAmount: { type: Number, required: true },
  network: String,
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  rejectReason: String
}, { timestamps: true });

const User = mongoose.model('User', userSchema);
const Link = mongoose.model('Link', linkSchema);
const ClickSession = mongoose.model('ClickSession', clickSessionSchema);
const Impression = mongoose.model('Impression', impressionSchema);
const Ad = mongoose.model('Ad', adSchema);
const EarningsHold = mongoose.model('EarningsHold', earningsHoldSchema);
const Deposit = mongoose.model('Deposit', depositSchema);
const Withdraw = mongoose.model('Withdraw', withdrawSchema);

// --- Utility & Security Functions ---
const isPhishingOrMalicious = (url) => {
  const blacklist = ['malware.com', 'phishing.net', 'badsite.org'];
  try {
    const parsed = new URL(url);
    return blacklist.some(domain => parsed.hostname.includes(domain));
  } catch (e) {
    return true;
  }
};

const sendTelegramNotification = async (telegramId, message) => {
  if (!telegramId || !process.env.TELEGRAM_BOT_TOKEN) return;
  try {
    await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: telegramId,
        text: message,
        parse_mode: 'HTML'
      })
    });
  } catch (err) {
    logger.error('Telegram Notification Error: ' + err.message);
  }
};

// --- Custom Middlewares ---
const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'غير مصرح: رمز المصادقة مفقود' });
    }
    const token = authHeader.split(' ')[1];
    
    const user = await User.findOne({ telegramId: Number(token) || token });
    if (!user || user.isBanned) {
      return res.status(403).json({ success: false, error: 'المستخدم محظور أو غير مسجل' });
    }

    req.userId = user._id;
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: 'فشل المصادقة' });
  }
};

const adminMiddleware = async (req, res, next) => {
  const adminIds = (process.env.ADMIN_TELEGRAM_IDS || '').split(',').map(id => Number(id.trim()));
  if (!req.user || !adminIds.includes(req.user.telegramId)) {
    return res.status(403).json({ success: false, error: 'غير مصرح: صلاحيات مسؤولي النظام مطلوبة' });
  }
  next();
};

const validateTraffic = (req, res, next) => {
  next();
};

const clickLimiter = async (req, res, next) => {
  if (!redisIsConnected) return next();
  try {
    const ip = req.ip;
    const limitKey = `ratelimit:click:${ip}`;
    const count = await redis.incr(limitKey);
    if (count === 1) await redis.expire(limitKey, 60); // 1 minute window
    if (count > 30) {
      // ✅ تم تصحيح خطأ بناء الجملة هنا (SyntaxError Fix)
      return res.status(429).json({ success: false, error: 'تم تجاوز الحد المسموح من الطلبات، يرجى المحاولة لاحقاً' });
    }
    next();
  } catch (e) {
    next();
  }
};

const linkCreationLimiter = async (req, res, next) => {
  if (!redisIsConnected) return next();
  try {
    const userId = req.userId;
    const limitKey = `ratelimit:link:${userId}`;
    const count = await redis.incr(limitKey);
    if (count === 1) await redis.expire(limitKey, 60);
    if (count > 15) {
      return res.status(429).json({ success: false, error: 'تخفيف السرعة: قمت بإنشاء روابط كثيرة جداً في فترة قصيرة' });
    }
    next();
  } catch (e) {
    next();
  }
};

// =========================================================================
// --- Core Redirection & Tracking Engine ---
// =========================================================================

app.get('/r/:code', async (req, res, next) => {
  try {
    const { code } = req.params;
    const link = await Link.findOne({ shortCode: code, isActive: true });
    
    if (!link) {
      return res.status(404).send('الرابط غير موجود أو تم تعطيله.');
    }

    const sessionId = new mongoose.Types.ObjectId();
    const bridgeToken = crypto.randomBytes(16).toString('hex');

    await safeRedisSet(`bridge:token:${sessionId}`, bridgeToken, 'EX', 300);

    const clickSession = new ClickSession({
      _id: sessionId,
      linkId: link._id,
      ip: req.ip,
      userAgent: req.get('User-Agent') || '',
      adSource: 'internal'
    });
    await clickSession.save();

    res.redirect(`https://${CONFIG.APP_DOMAIN}/app?sessionId=${sessionId}&token=${bridgeToken}`);
  } catch (err) {
    next(err);
  }
});

// =========================================================================
// --- Impression & Monetization Engine ---
// =========================================================================

app.post('/api/impression', validateTraffic, clickLimiter, async (req, res, next) => {
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
    if (redisIsConnected) {
      const dailyIpClickKey = `daily:ip:${req.ip}`;
      dailyIpClicks = await redis.incr(dailyIpClickKey);
      if (dailyIpClicks === 1) {
        await redis.expire(dailyIpClickKey, 86400);
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

    if (isDuplicate || dailyIpClicks > 20) {
      await Link.findByIdAndUpdate(link._id, { $inc: { views: 1, invalidImpressions: 1 } }, { session: sessionDb });
      await sessionDb.commitTransaction();
      return res.json({ success: true, targetUrl: link.targetUrl, counted: false });
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
    res.json({ success: true, targetUrl: link.targetUrl, counted: true });
  } catch (err) {
    await sessionDb.abortTransaction();
    next(err);
  } finally {
    sessionDb.endSession();
  }
});

// =========================================================================
// --- Link Management Engine ---
// =========================================================================

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

// =========================================================================
// --- Admin Panel Routes ---
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

// --- Automated Cron Task for Earnings Settlement ---
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

// --- Static HTML Delivery Routes ---
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

// ==================================================
// --- Global Error Handling Middleware ---
// ==================================================
app.use((err, req, res, next) => {
  logger.error('Unhandled Application Error:', err);

  const statusCode = err.status || err.statusCode || 500;
  const message = process.env.NODE_ENV === 'production' 
    ? 'حدث خطأ غير متوقع في الخادم' 
    : (err.message || 'خطأ داخلي');

  res.status(statusCode).json({
    success: false,
    error: message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
});

// --- Global Crash Guard ---
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception Detected: ' + err.stack);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

const PORT = process.env.PORT || 3000;

// ✅ تشغيل السيرفر محلياً وعدم تداخله مع بيئة Vercel Serverless
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  app.listen(PORT, () => console.log(`🚀 Enterprise Server V6 Active on Port ${PORT}`));
}

// ✅ تصدير التطبيق ليعمل بسلاسة كـ Serverless Function على Vercel
module.exports = app;
