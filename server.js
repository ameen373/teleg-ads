/**
 * Ultra-Enterprise Server Architecture (V6.6 - Absolute Multi-Tenant Security & High-Performance Core)
 * Telegram Link Shortener & Mini App Engine (Telega.ads)
 * Modularized Architecture - Step 1 Completed
 */

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const morgan = require('morgan');
const cors = require('cors');
const mongoSanitize = require('express-mongo-sanitize');

// System Configurations & Utilities
const CONFIG = require('./config/config');
const logger = require('./config/logger');
const connectDB = require('./config/db');
const { redis, getRedisStatus, safeRedisGet, safeRedisSet, safeRedisDel } = require('./config/redis');

// Helpers
const { normalizeAndValidateUrl, buildShortUrl, isPhishingOrMalicious } = require('./utils/urlHelpers');
const { sendTelegramNotification, verifyTelegramData } = require('./utils/telegram');
const { findOrCreateUser } = require('./utils/userHelpers');

// Middlewares
const { linkCreationLimiter, clickLimiter, validateTraffic } = require('./middleware/traffic');
const { resolveUserId, adminMiddleware } = require('./middleware/auth');

// Models
const { User, Ad, Link, Impression, ClickSession, Withdraw, EarningsHold, Deposit, Announcement } = require('./models');

const app = express();

// --- Setup Server Trust Proxy ---
app.set('trust proxy', 1);

// --- CORS Configuration ---
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-telegram-init-data', 'telegram-init-data', 'X-Requested-With', 'x-user-id', 'user-id', 'x-user-ld', 'user-ld', 'telegramid', 'telegram_id', 'id', 'x-init-data'],
  credentials: true
}));
app.options('*', cors());

// --- Robust Body Parsing & Vercel Payload Normalization ---
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(express.text({ type: ['text/*', 'application/json'], limit: '10kb' }));

app.use((req, res, next) => {
  if (typeof req.body === 'string' && req.body.trim().length > 0) {
    try {
      req.body = JSON.parse(req.body);
    } catch (e) {}
  }
  if (!req.body || typeof req.body !== 'object') {
    req.body = {};
  }
  next();
});

app.use(mongoSanitize());

// --- Static Files Serving ---
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

app.use(morgan('combined', { stream: { write: (message) => logger.info(message.trim()) } }));

// Middleware لضمان اكتمال الاتصال بقاعدة البيانات لكل طلب
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

    const [rawLinks, withdraws, announcements, ads, deposits, referralsCount] = await Promise.all([
      Link.find(queryConditions.length > 0 ? { $or: queryConditions } : { userId: targetUserId }).sort({ createdAt: -1 }).lean(),
      Withdraw.find({ userId: targetUserId }).sort({ createdAt: -1 }).lean(),
      Announcement.find({ $or: [{ isGlobal: true }, { targetUserId: targetUserId }] }).sort({ createdAt: -1 }).lean(),
      Ad.find({ userId: targetUserId }).sort({ createdAt: -1 }).lean(),
      Deposit.find({ userId: targetUserId }).sort({ createdAt: -1 }).lean(),
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
// --- Link Shortener API Routes ---
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
// --- Self-Serve Ad Campaign APIs ---
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
    if (getRedisStatus() && redis) {
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
// --- Admin Panel Routes ---
// =========================================================================

app.get('/api/admin/dashboard-data', adminMiddleware, async (req, res, next) => {
  try {
    await connectDB();
    const [withdraws, deposits, users, stats, totalAds] = await Promise.all([
      Withdraw.find().populate('userId').sort({ createdAt: -1 }).lean(),
      Deposit.find().populate('advertiserId').sort({ createdAt: -1 }).lean(),
      User.find().sort({ createdAt: -1 }).limit(100).lean(),
      User.aggregate([
        { $group: { _id: null, totalPending: {$sum: "$pendingBalance" }, totalAvailable: { $sum: "$availableBalance" }, totalUsers: { $sum: 1 } } }
      ]),
      Ad.countDocuments()
    ]);

    res.json({ success: true, withdraws, deposits, users, stats: { ...(stats[0] || {}), totalAds } });
  } catch (err) {
    next(err);
  }
});

module.exports = app;
