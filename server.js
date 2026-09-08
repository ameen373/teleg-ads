/**
 * Telega.ads - Stateless Serverless Architecture for Vercel
 * Direct Database Persistence via Telegram ID (No Sessions)
 */

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');
const path = require('path');
const crypto = require('crypto');
const morgan = require('morgan');
const winston = require('winston');
const validUrl = require('valid-url');
const axios = require('axios');
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
  ADSGRAM_BLOCK_ID: process.env.ADSGRAM_BLOCK_ID || '1234',
  APP_DOMAIN: process.env.APP_DOMAIN || 'teleg-ads.vercel.app',
  DEFAULT_LANGUAGE: 'ar',
  
  OFFICIAL_BOT_URL: process.env.OFFICIAL_BOT_URL || 'https://t.me/Ads_telegabot',
  OFFICIAL_CHANNEL_URL: process.env.OFFICIAL_CHANNEL_URL || 'https://t.me/ttelega_ads',
  TELEGRAM_SUPPORT_URL: process.env.TELEGRAM_SUPPORT_URL || 'https://t.me/Te_AdsNs_bot',
  
  DEPOSIT_USDT_BEP20: process.env.DEPOSIT_USDT_BEP20 || '',
  DEPOSIT_USDT_TRC20: process.env.DEPOSIT_USDT_TRC20 || '',

  BOT_USERNAME: '@' + (process.env.OFFICIAL_BOT_URL || 'https://t.me/Ads_telegabot').split('/').pop(),
  SUPPORT_USERNAME: '@' + (process.env.TELEGRAM_SUPPORT_URL || 'https://t.me/Te_AdsNs_bot').split('/').pop()
});

// --- Database Connection Pipeline for Vercel Serverless ---
let cachedDb = null;
async function connectToDatabase() {
  if (cachedDb && mongoose.connection.readyState === 1) {
    return cachedDb;
  }
  cachedDb = await mongoose.connect(CONFIG.MONGO_URI, {
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  });
  console.log('✅ Connected to MongoDB Pipeline');
  return cachedDb;
}

// Middleware لضمان الاتصال بقاعدة البيانات قبل أي طلب
app.use(async (req, res, next) => {
  try {
    await connectToDatabase();
    next();
  } catch (err) {
    logger.error('❌ Critical MongoDB Connection Failure:', err);
    res.status(500).json({ success: false, error: 'فشل الاتصال بقاعدة البيانات' });
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

// =========================================================================
// --- Helper: Extract Telegram ID directly from Request ---
// =========================================================================
function getTelegramId(req) {
  let tgId = req.body?.telegram_id || req.query?.telegram_id || req.headers['x-telegram-id'];
  
  if (!tgId) {
    const initData = req.headers['x-telegram-init-data'];
    const tgUser = verifyTelegramData(initData);
    if (tgUser?.id) {
      tgId = String(tgUser.id);
    }
  }

  return tgId ? String(tgId).trim() : null;
}

// =========================================================================
// --- Stateless Direct User Auth Middleware (No Session Dependency) ---
// =========================================================================
const authMiddleware = async (req, res, next) => {
  try {
    const telegramId = getTelegramId(req);

    if (!telegramId) {
      return res.status(401).json({ success: false, error: 'معرف التليجرام (telegram_id) مفقود' });
    }

    const { username, language, referrerId } = req.body;

    // تحديث أو إنشاء المستخدم مباشرة بـ findOneAndUpdate لمنع التضارب وحفظ البيانات فوراً
    const user = await User.findOneAndUpdate(
      { telegramId },
      { 
        $setOnInsert: { 
          telegramId,
          language: language || CONFIG.DEFAULT_LANGUAGE,
          referredBy: mongoose.Types.ObjectId.isValid(referrerId) ? referrerId : null
        },
        ...(username && { username })
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    if (user.isBanned) {
      return res.status(403).json({ success: false, error: 'حسابك معطل بسبب مخالفة الشروط' });
    }

    req.user = user;
    req.userId = user._id;
    req.telegramId = telegramId;

    next();
  } catch (err) {
    res.status(401).json({ success: false, error: 'خطأ في المصادقة والوصول للبيانات' });
  }
};

const adminMiddleware = async (req, res, next) => {
  if (!req.telegramId || req.telegramId !== CONFIG.ADMIN_ID) {
    return res.status(403).json({ success: false, error: 'غير مصرح لك بالوصول للوحة التحكم' });
  }
  next();
};

// Security Limiters
const linkCreationLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'تم تجاوز الحد اليومي لإنشاء الروابط' }
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
// --- API Endpoints ---
// =========================================================================

// --- Check Admin Status ---
app.all('/api/check-admin', async (req, res) => {
  const telegramId = getTelegramId(req);
  const isAdmin = Boolean(telegramId && telegramId === CONFIG.ADMIN_ID);
  return res.json({ success: true, isAdmin });
});

// --- Fetch User Master Data ---
app.all('/api/user/data', authMiddleware, async (req, res, next) => {
  try {
    const telegramId = req.telegramId;

    // استعلام صريح مباشر بدون الاعتماد على Session
    const user = await User.findOne({ telegramId }).lean();
    if (!user) return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });

    const [rawLinks, withdraws, announcements, ads, deposits] = await Promise.all([
      Link.find({ telegramId }).sort({ createdAt: -1 }).lean(),
      Withdraw.find({ telegramId }).sort({ createdAt: -1 }).lean(),
      Announcement.find({ $or: [{ isGlobal: true }, { targetUserId: user._id }] }).sort({ createdAt: -1 }).lean(),
      Ad.find({ advertiserTelegramId: telegramId }).sort({ createdAt: -1 }).lean(),
      Deposit.find({ advertiserTelegramId: telegramId }).sort({ createdAt: -1 }).lean()
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

    const isAdmin = telegramId === CONFIG.ADMIN_ID;

    res.json({ 
      success: true,
      user, 
      language: user.language || CONFIG.DEFAULT_LANGUAGE,
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

// --- Direct Link Shortening Route ---
app.post('/api/links', authMiddleware, linkCreationLimiter, async (req, res) => {
  try {
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
    
    // إنشاء الحفظ المباشر بـ mongoDB باستخدام telegram_id
    const newLink = await Link.create({
      userId: req.userId,
      publisherTelegramId: req.telegramId,
      telegramId: req.telegramId,
      title: title ? String(title).trim() : 'رابط بدون عنوان',
      targetUrl: cleanUrl,
      shortCode,
      isActive: true
    });

    await User.findOneAndUpdate(
      { telegramId: req.telegramId }, 
      { $inc: { 'statsSummary.totalLinksCreated': 1 } }
    );

    const shortUrl = `https://${CONFIG.APP_DOMAIN}/r/${shortCode}`;

    return res.json({ 
      success: true, 
      link: { ...newLink.toObject(), shortUrl },
      shortUrl
    });
  } catch (err) {
    console.error('❌ Error in POST /api/links:', err);
    return res.status(500).json({ success: false, error: 'حدث خطأ أثناء اختصار الرابط' });
  }
});

app.get(['/api/links', '/api/user/links'], authMiddleware, async (req, res, next) => {
  try {
    const rawLinks = await Link.find({ telegramId: req.telegramId }).sort({ createdAt: -1 }).lean();
    const links = rawLinks.map(link => ({
      ...link,
      ctr: link.views > 0 ? ((link.validImpressions / link.views) * 100).toFixed(1) : "0.0",
      shortUrl: `https://${CONFIG.APP_DOMAIN}/r/${link.shortCode}`
    }));
    res.json({ success: true, links });
  } catch (err) {
    next(err);
  }
});

app.post('/api/links/toggle', authMiddleware, async (req, res, next) => {
  try {
    const { linkId } = req.body;
    if (!mongoose.Types.ObjectId.isValid(linkId)) return res.status(400).json({ success: false, error: 'معرف الرابط غير صالح' });

    const link = await Link.findOne({ _id: linkId, telegramId: req.telegramId });
    if (!link) return res.status(404).json({ success: false, error: 'الرابط غير موجود' });

    link.isActive = !link.isActive;
    await link.save();

    res.json({ success: true, isActive: link.isActive });
  } catch (err) {
    next(err);
  }
});

// --- Self-Serve Ad Campaign APIs ---
app.post('/api/ads', authMiddleware, async (req, res, next) => {
  try {
    const { title, targetUrl, totalBudget } = req.body;
    const budget = Number(totalBudget);

    if (!title || String(title).trim().length === 0) {
      return res.status(400).json({ success: false, error: 'عنوان الإعلان مطلوب' });
    }

    if (!validUrl.isWebUri(targetUrl)) {
      return res.status(400).json({ success: false, error: 'الرابط المستهدف غير صالح' });
    }

    if (isNaN(budget) || budget < 5) {
      return res.status(400).json({ success: false, error: 'الحد الأدنى لميزانية الحملة هو $5' });
    }

    // خصم الميزانية مباشرة بـ User.findOneAndUpdate والتأكد من توفر الرصيد
    const updatedUser = await User.findOneAndUpdate(
      { telegramId: req.telegramId, availableBalance: { $gte: budget } },
      { $inc: { availableBalance: -budget } },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(400).json({ success: false, error: 'رصيدك المتاح غير كافي لإنشاء هذه الحملة (الحد الأدنى $5)' });
    }

    const ad = await Ad.create({
      userId: req.userId,
      advertiserId: req.userId,
      advertiserTelegramId: req.telegramId,
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

    res.json({ success: true, ad });
  } catch (err) {
    next(err);
  }
});

app.get('/api/user/ads', authMiddleware, async (req, res, next) => {
  try {
    const ads = await Ad.find({ advertiserTelegramId: req.telegramId }).sort({ createdAt: -1 }).lean();
    res.json({ success: true, ads });
  } catch (err) {
    next(err);
  }
});

// --- Deposit & Withdraw Routes ---
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
      return res.status(400).json({ success: false, error: 'يرجى تحديد شبكة صالحة' });
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
      advertiserTelegramId: req.telegramId,
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
  try {
    const { amount, network, walletAddress } = req.body;
    const numAmt = Number(amount);
    const cleanNetwork = String(network || '').toUpperCase();
    const cleanWallet = String(walletAddress || '').trim();
    const FEE = 3;

    if (isNaN(numAmt) || numAmt < 30) {
      return res.status(400).json({ success: false, error: 'الحد الأدنى للسحب هو $30' });
    }

    if (!['BEP20', 'TRC20', 'TON'].includes(cleanNetwork)) {
      return res.status(400).json({ success: false, error: 'يرجى تحديد الشبكة' });
    }

    if (!cleanWallet || cleanWallet.length < 10) {
      return res.status(400).json({ success: false, error: 'عنوان المحفظة غير صالح' });
    }

    const activePending = await Withdraw.findOne({ telegramId: req.telegramId, status: 'pending' });
    if (activePending) {
      return res.status(400).json({ success: false, error: 'لديك طلب سحب قيد الانتظار حالياً' });
    }

    const netAmount = numAmt - FEE;

    // الخصم والتحديث المباشر عبر MongoDB
    const updatedUser = await User.findOneAndUpdate(
      { telegramId: req.telegramId, availableBalance: { $gte: numAmt } },
      { $inc: { availableBalance: -numAmt }, defaultWallet: cleanWallet },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(400).json({ success: false, error: 'رصيدك المتاح لا يكفي لإتمام عملية السحب' });
    }

    const withdrawRequest = await Withdraw.create({
      userId: req.userId,
      telegramId: req.telegramId,
      amount: numAmt,
      fee: FEE,
      netAmount: netAmount,
      network: cleanNetwork,
      walletAddress: cleanWallet,
      status: 'pending'
    });

    sendTelegramNotification(
      req.telegramId,
      `🔔 <b>تم تقديم طلب السحب بنجاح!</b>\nالمبلغ: <code>$${numAmt}</code>\nالصافي: <code>$${netAmount}</code>\nالشبكة: <code>${cleanNetwork}</code>\nالمحفظة: <code>${cleanWallet}</code>\nالحالة: ⏳ قيد المراجعة`
    );

    res.json({ success: true, withdraw: withdrawRequest });
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

    await User.findOneAndUpdate({ telegramId: req.telegramId }, updateData);
    res.json({ success: true, message: 'تم تحديث الإعدادات بنجاح' });
  } catch (err) {
    next(err);
  }
});

// --- Bridge Page & Traffic Engine ---
app.post('/api/init-click', validateTraffic, async (req, res, next) => {
  try {
    const { linkCode } = req.body;
    const cleanCode = String(linkCode || '').trim();
    if (!cleanCode) return res.status(400).json({ success: false, error: 'كود الرابط مطلوب' });

    const link = await Link.findOne({ shortCode: cleanCode, isActive: true }).lean();
    if (!link) return res.status(404).json({ success: false, error: 'الرابط غير موجود أو معطل' });

    const activeAds = await Ad.aggregate([
      { 
        $match: { 
          status: 'active', 
          remainingBudget: { $gte: 0.0015 },
          advertiserTelegramId: { $ne: link.telegramId }
        } 
      },
      { $sample: { size: 1 } }
    ]);

    let adSource = 'adsgram';
    let selectedAd = activeAds.length > 0 ? activeAds[0] : null;
    if (selectedAd) adSource = 'internal';

    const bridgeToken = crypto.randomBytes(16).toString('hex');
    const session = await ClickSession.create({ 
      linkId: link._id, 
      userId: link.userId,
      publisherId: link.userId,
      ip: req.ip, 
      bridgeToken,
      adSource,
      adId: selectedAd ? selectedAd._id : null 
    });

    res.json({ 
      success: true,
      sessionId: session._id, 
      bridgeToken, 
      blockId: CONFIG.ADSGRAM_BLOCK_ID,
      adSource,
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

app.post('/api/impression', validateTraffic, async (req, res, next) => {
  try {
    const { sessionId, bridgeToken } = req.body;
    if (!sessionId || !bridgeToken) {
      return res.status(400).json({ success: false, error: 'رمز الجلسة مفقود' });
    }

    const clickSession = await ClickSession.findById(sessionId);
    if (!clickSession || clickSession.bridgeToken !== bridgeToken) {
      return res.status(403).json({ success: false, error: 'الجلسة غير صالحة' });
    }

    const link = await Link.findById(clickSession.linkId);
    await ClickSession.findByIdAndDelete(sessionId);

    if (!link) return res.status(404).json({ success: false, error: 'الرابط غير موجود' });

    await Impression.create({
      linkId: link._id,
      userId: link.userId,
      publisherId: link.userId,
      publisherTelegramId: link.telegramId,
      adSource: clickSession.adSource,
      adId: clickSession.adId,
      publisherEarnings: clickSession.adSource === 'internal' ? 0.00135 : 0,
      ip: req.ip,
      userAgent: req.get('User-Agent') || ''
    });

    await Link.findByIdAndUpdate(link._id, { $inc: { views: 1, validImpressions: 1 } });

    if (clickSession.adSource === 'internal' && clickSession.adId) {
      const ad = await Ad.findById(clickSession.adId);
      if (ad && ad.remainingBudget >= 0.0015 && ad.status === 'active') {
        const costPerImpression = ad.costPerImpression || 0.0015;
        let publisherShare = ad.publisherEarningsPerImpression || 0.00135;
        
        ad.remainingBudget = Math.max(0, ad.remainingBudget - costPerImpression);
        ad.impressionsCount += 1;
        if (ad.remainingBudget < costPerImpression) ad.status = 'completed';
        await ad.save();

        await User.findOneAndUpdate({ telegramId: link.telegramId }, { $inc: { pendingBalance: publisherShare } });
      }
    }

    res.json({ success: true, targetUrl: link.targetUrl, counted: true });
  } catch (err) {
    next(err);
  }
});

// --- Admin Endpoints ---
app.get('/api/admin/dashboard-data', authMiddleware, adminMiddleware, async (req, res, next) => {
  try {
    const [withdraws, deposits, users, stats, totalAds] = await Promise.all([
      Withdraw.find().sort({ createdAt: -1 }).lean(),
      Deposit.find().sort({ createdAt: -1 }).lean(),
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
  try {
    const { depositId, action, reason } = req.body;
    const deposit = await Deposit.findById(depositId);

    if (!deposit || deposit.status !== 'pending') {
      return res.status(400).json({ success: false, error: 'طلب الإيداع غير موجود أو تم معالجته' });
    }

    deposit.status = action;
    if (action === 'rejected') deposit.rejectReason = String(reason || 'لم يتم تحديد سبب').trim();
    await deposit.save();

    if (action === 'approved') {
      await User.findOneAndUpdate(
        { telegramId: deposit.advertiserTelegramId },
        { $inc: { availableBalance: deposit.amount } }
      );

      sendTelegramNotification(deposit.advertiserTelegramId, `🎉 <b>تم تأكيد الإيداع!</b>\nتمت إضافة <code>$${deposit.amount}</code> إلى رصيدك.`);
    }

    res.json({ success: true, deposit });
  } catch (err) {
    next(err);
  }
});

// --- Static Delivery & Fallback ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'views.html')));
app.get(['/app', '/admin', '/r/:code'], (req, res) => res.sendFile(path.join(__dirname, 'views.html')));

app.use('/api/*', (req, res) => {
  res.status(404).json({ success: false, error: 'المسار المطلوب غير موجود' });
});

// Global Error Handler
app.use((err, req, res, next) => {
  logger.error('Unhandled Application Error:', err);
  res.status(err.status || 500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' ? 'حدث خطأ في الخادم' : err.message
  });
});

// التصدير لدعم بيئة Serverless الخاصة بـ Vercel
module.exports = app;

if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`🚀 Server running locally on port ${PORT}`));
}
