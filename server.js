/**
 * Telega.ads - Ultra-Enterprise Master Architecture (V6 Final Release)
 * Complete Unified Server Core: Anti-Fraud, Referral Engine, Micro-Cents Precision & Multi-Network Wallet
 */

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');
const path = require('path');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');
const winston = require('winston');
const morgan = require('morgan');
const validUrl = require('valid-url');
const axios = require('axios');
const Redis = require('ioredis');

// --- 1. النماذج الأساسية والتكامل المترابط ---
const models = require('./models');
const User = models.User || mongoose.model('User', new mongoose.Schema({
  telegramId: { type: String, required: true, unique: true, index: true },
  username: { type: String, default: '' },
  referredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  isBanned: { type: Boolean, default: false }
}, { timestamps: true }));

const Wallet = models.Wallet || mongoose.model('Wallet', new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
  balance: { type: Number, default: 0 },         // الرصيد المتاح للسحب والإعلانات
  pendingBalance: { type: Number, default: 0 },  // الرصيد المعلق قيد التسوية
  totalEarned: { type: Number, default: 0 },     // إجمالي الأرباح المحققة
  totalSpent: { type: Number, default: 0 },      // إجمالي المصروفات
  referralEarned: { type: Number, default: 0 }   // أرباح الإحالات 10%
}, { timestamps: true }));

const Transaction = models.Transaction || mongoose.model('Transaction', new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: { type: String, enum: ['deposit', 'withdrawal', 'spend', 'earning', 'referral'], required: true },
  amount: { type: Number, required: true },
  fee: { type: Number, default: 0 },
  netAmount: { type: Number, required: true },
  network: { type: String, enum: ['TRC20', 'BEP20', 'TON', 'INTERNAL'], default: 'TRC20' },
  status: { type: String, enum: ['pending', 'completed', 'rejected'], default: 'pending', index: true },
  description: String,
  referenceId: String
}, { timestamps: true }));

const Link = models.Link || mongoose.model('Link', new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  originalUrl: { type: String, required: true },
  targetUrl: { type: String, required: true },
  title: { type: String, default: 'رابط جديد' },
  shortCode: { type: String, required: true, unique: true, index: true },
  shortUrl: { type: String },
  views: { type: Number, default: 0 },
  validImpressions: { type: Number, default: 0 },
  invalidImpressions: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true }
}, { timestamps: true }));

const Campaign = models.Campaign || mongoose.model('Campaign', new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true },
  budget: { type: Number, required: true },
  remainingBudget: { type: Number, required: true },
  costPerClick: { type: Number, default: 0.0015 },
  targetUrl: { type: String, required: true },
  clicksCount: { type: Number, default: 0 },
  status: { type: String, enum: ['active', 'paused', 'completed'], default: 'active', index: true }
}, { timestamps: true }));

const Impression = models.Impression || mongoose.model('Impression', new mongoose.Schema({
  linkId: { type: mongoose.Schema.Types.ObjectId, ref: 'Link', required: true, index: true },
  publisherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign' },
  adSource: { type: String, enum: ['internal', 'adsgram'], default: 'internal' },
  publisherEarnings: { type: Number, default: 0 },
  referralEarnings: { type: Number, default: 0 },
  ip: String,
  userAgent: String
}, { timestamps: true }));

const ClickSession = models.ClickSession || mongoose.model('ClickSession', new mongoose.Schema({
  linkId: { type: mongoose.Schema.Types.ObjectId, ref: 'Link', required: true },
  publisherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  ip: String,
  bridgeToken: { type: String, required: true },
  adSource: String,
  campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign' },
  createdAt: { type: Date, default: Date.now, expires: 300 }
}));

const EarningsHold = models.EarningsHold || mongoose.model('EarningsHold', new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  amount: { type: Number, required: true },
  releaseAt: { type: Date, required: true, index: true },
  isReleased: { type: Boolean, default: false, index: true }
}, { timestamps: true }));

const app = express();

// =========================================================================
// --- 2. إعدادات الأمان والتسجيل المتكامل ---
// =========================================================================
app.set('trust proxy', 1);
app.use(cors({ origin: true, credentials: true }));
app.options('*', cors());
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(express.static(__dirname));

app.use('/api', (req, res, next) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
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
app.use(morgan('combined', { stream: { write: (msg) => logger.info(msg.trim()) } }));

// =========================================================================
// --- 3. الثوابت وقواعد اتصالات Redis & MongoDB ---
// =========================================================================
const CONFIG = Object.freeze({
  BOT_TOKEN: process.env.BOT_TOKEN,
  MONGO_URI: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/telega_ads',
  ADMIN_ID: String(process.env.ADMIN_ID || '123456789').trim(),
  JWT_SECRET: process.env.JWT_SECRET || 'v6_ultra_secure_jwt_secret_key_32bytes!',
  ADSGRAM_BLOCK_ID: process.env.ADSGRAM_BLOCK_ID || '1234',
  APP_DOMAIN: process.env.APP_DOMAIN || 'teleg-ads.vercel.app',
  REDIS_URL: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
  WITHDRAWAL_FEE: 3.00, // رسوم ثابتة للسحب الخارجي $3
  MIN_WITHDRAWAL: 10.00, // الحد الأدنى للسحب $10
  PUBLISHER_CPM_RATE: 0.0012, // ربح الناشر لكل زيارة
  REFERRAL_COMMISSION: 0.10,  // 10% عمولة الإحالة
  DAILY_IP_CAP: 20            // أقصى عدد زيارات محسوبة لـ IP واحد يومياً
});

let redisConnected = false;
const redis = new Redis(CONFIG.REDIS_URL, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  retryStrategy: (times) => Math.min(times * 50, 2000)
});

redis.on('error', (err) => { redisConnected = false; logger.error('⚠️ Redis error: ' + err.message); });
redis.on('ready', () => { redisConnected = true; console.log('✅ Enterprise Redis Ready'); });

async function safeRedisGet(key) {
  if (!redisConnected) return null;
  try { return await redis.get(key); } catch { return null; }
}

async function safeRedisSet(key, val, mode, duration) {
  if (!redisConnected) return;
  try {
    if (mode && duration) await redis.set(key, val, mode, duration);
    else await redis.set(key, val);
  } catch (e) { logger.error('Redis Set Error: ' + e.message); }
}

async function safeRedisIncr(key, ttlSec = 86400) {
  if (!redisConnected) return 1;
  try {
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, ttlSec);
    return count;
  } catch { return 1; }
}

async function safeRedisDel(key) {
  if (!redisConnected) return;
  try { await redis.del(key); } catch {}
}

mongoose.connect(CONFIG.MONGO_URI, {
  maxPoolSize: 50,
  minPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000
}).then(() => console.log('✅ Master MongoDB V6 Connection Established'))
  .catch(err => { logger.error('❌ Mongo Critical Failure:', err); process.exit(1); });

// =========================================================================
// --- 4. أدوات الأمان والمكافحة التلقائية (Anti-Fraud Engines) ---
// =========================================================================
async function sendTelegramNotification(telegramId, text) {
  if (!CONFIG.BOT_TOKEN || !telegramId) return;
  try {
    await axios.post(`https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/sendMessage`, {
      chat_id: telegramId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true
    }, { timeout: 4000 });
  } catch (e) { logger.error(`Telegram Dispatch Error: ${e.message}`); }
}

function verifyTelegramData(initData) {
  if (!initData) return null;
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;
    params.delete('hash');

    const dataCheckString = Array.from(params.entries())
      .map(([k, v]) => `${k}=${v}`)
      .sort()
      .join('\n');

    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(CONFIG.BOT_TOKEN || '').digest();
    const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    const bufA = Buffer.from(calculatedHash, 'hex');
    const bufB = Buffer.from(hash, 'hex');

    if (bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB)) {
      const u = params.get('user');
      return u ? JSON.parse(u) : null;
    }
    return null;
  } catch { return null; }
}

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: { success: false, message: 'تم تجاوز حد الاستخدام المسموح به' }
});

const clickLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  keyGenerator: (req) => req.ip,
  message: { success: false, message: 'طلبات مكثفة جداً. يرجى الانتظار.' }
});

const validateTraffic = (req, res, next) => {
  const ua = req.get('User-Agent') || '';
  const botPattern = /bot|crawler|spider|datacenter|proxy|httpclient|curl|python|axios|headless|selenium|puppeteer/i;
  if (botPattern.test(ua)) {
    return res.status(403).json({ success: false, message: 'تم رفض الحركة الآلية المشبوهة (Bot Traffic Blocked)' });
  }
  next();
};

const isPhishingOrMalicious = (url) => {
  const blacklist = ['phish', 'login-verify', 'free-telegram-premium', 'grabber', 'stealer', 'iplogger'];
  const lower = url.toLowerCase();
  return blacklist.some(word => lower.includes(word));
};

app.use('/api/', globalLimiter);

// =========================================================================
// --- 5. وسيط المصادقة المزدوج وإدارة الجلسات ---
// =========================================================================
const authenticateUser = async (req, res, next) => {
  try {
    let user = null;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
        const decoded = jwt.verify(token, CONFIG.JWT_SECRET);
        user = await User.findById(decoded.userId).lean();
      } catch {}
    }

    if (!user) {
      const initData = req.headers['x-telegram-init-data'];
      const tgUser = verifyTelegramData(initData);
      if (tgUser) {
        user = await User.findOne({ telegramId: String(tgUser.id) }).lean();
        if (!user) {
          const newUser = await User.create({
            telegramId: String(tgUser.id),
            username: tgUser.username || `User_${String(tgUser.id).slice(-4)}`
          });
          await Wallet.create({ userId: newUser._id });
          user = newUser.toObject();
        }
      }
    }

    if (!user) {
      return res.status(401).json({ success: false, message: 'جلسة غير صالحة، يرجى إعادة الفتح من تليجرام' });
    }

    if (user.isBanned) {
      return res.status(403).json({ success: false, message: 'حسابك معطل حالياً بسبب انتهاك الشروط' });
    }

    req.user = user;
    req.userId = user._id;
    next();
  } catch (error) {
    return res.status(500).json({ success: false, message: 'خطأ داخلي في نظام التوثيق', error: error.message });
  }
};

const requireAdmin = (req, res, next) => {
  if (!req.user || String(req.user.telegramId).trim() !== CONFIG.ADMIN_ID) {
    return res.status(403).json({ success: false, message: 'وصول مرفوض: صلاحديد الإدارة مطلوبة' });
  }
  next();
};

// =========================================================================
// --- 6. تسجيل الدخول ومعالجة كود الإحالة (/api/auth) ---
// =========================================================================
app.post('/api/auth/login', async (req, res) => {
  try {
    const initData = req.headers['x-telegram-init-data'];
    const { refCode } = req.body;
    const tgUser = verifyTelegramData(initData);

    const tgId = tgUser ? String(tgUser.id) : (process.env.NODE_ENV !== 'production' ? String(req.headers['x-demo-user-id'] || '') : null);
    if (!tgId) return res.status(401).json({ success: false, message: 'بيانات التوثيق مفقودة' });

    let user = await User.findOne({ telegramId: tgId });
    if (!user) {
      let referrerId = null;
      if (refCode) {
        const referrer = await User.findOne({ telegramId: String(refCode).trim() });
        if (referrer) referrerId = referrer._id;
      }

      user = await User.create({
        telegramId: tgId,
        username: tgUser?.username || `User_${tgId.slice(-4)}`,
        referredBy: referrerId
      });
      await Wallet.create({ userId: user._id });
    }

    const token = jwt.sign(
      { userId: user._id, telegramId: user.telegramId },
      CONFIG.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token,
      user,
      isAdmin: String(user.telegramId).trim() === CONFIG.ADMIN_ID
    });
  } catch (e) {
    res.status(500).json({ success: false, message: 'فشل عملية تسجيل الدخول', error: e.message });
  }
});

// =========================================================================
// --- 7. المحرك المالي الذري والشبكات متعددة الخيارات (/api/wallet) ---
// =========================================================================
app.get('/api/wallet', authenticateUser, async (req, res) => {
  try {
    let wallet = await Wallet.findOne({ userId: req.userId });
    if (!wallet) wallet = await Wallet.create({ userId: req.userId });
    
    const transactions = await Transaction.find({ userId: req.userId }).sort({ createdAt: -1 }).limit(30).lean();
    res.json({ success: true, wallet, transactions });
  } catch (error) {
    res.status(500).json({ success: false, message: 'فشل جلب بيانات المحفظة', error: error.message });
  }
});

app.post('/api/wallet/deposit', authenticateUser, async (req, res) => {
  const { amount, network, txid } = req.body;
  const numAmount = Number(amount);

  if (isNaN(numAmount) || numAmount < 1.0) {
    return res.status(400).json({ success: false, message: 'الحد الأدنى للإيداع هو $1.00' });
  }

  const cleanTxid = String(txid || '').trim();
  if (cleanTxid.length < 8) {
    return res.status(400).json({ success: false, message: 'يرجى تزويد الـ TxID الصحيح للمعاملة' });
  }

  const selectedNetwork = ['TRC20', 'BEP20', 'TON'].includes(network) ? network : 'TRC20';

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const existingTx = await Transaction.findOne({ referenceId: cleanTxid }).session(session);
      if (existingTx) throw new Error('تم تسجيل هذا الـ TxID مسبقاً في النظام');

      await Transaction.create([{
        userId: req.userId,
        type: 'deposit',
        amount: numAmount,
        fee: 0,
        netAmount: numAmount,
        network: selectedNetwork,
        status: 'pending',
        description: `طلب إيداع عبر شبكة ${selectedNetwork}`,
        referenceId: cleanTxid
      }], { session });
    });

    sendTelegramNotification(
      CONFIG.ADMIN_ID,
      `💳 <b>طلب إيداع جديد!</b>\nالمستخدم: <code>${req.user.username}</code>\nالمبلغ: <code>$${numAmount}</code>\nالشبكة: <code>${selectedNetwork}</code>\nTxID: <code>${cleanTxid}</code>`
    );

    res.json({ success: true, message: 'تم إرسال طلب الإيداع وهو قيد التدقيق حالياً' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
});

app.post('/api/wallet/withdraw', authenticateUser, async (req, res) => {
  const { amount, walletAddress, network } = req.body;
  const numAmount = Number(amount);

  if (isNaN(numAmount) || numAmount < CONFIG.MIN_WITHDRAWAL) {
    return res.status(400).json({ success: false, message: `الحد الأدنى للسحب هو $${CONFIG.MIN_WITHDRAWAL}` });
  }

  if (!walletAddress || walletAddress.length < 10) {
    return res.status(400).json({ success: false, message: 'عنوان المحفظة المستهدفة غير صالح' });
  }

  const selectedNetwork = ['TRC20', 'BEP20', 'TON'].includes(network) ? network : 'TRC20';
  const fee = CONFIG.WITHDRAWAL_FEE;
  const netAmount = numAmount - fee;

  if (netAmount <= 0) {
    return res.status(400).json({ success: false, message: `المبلغ اقل من رسوم الشبكة ($${fee})` });
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const wallet = await Wallet.findOneAndUpdate(
        { userId: req.userId, balance: { $gte: numAmount } },
        { $inc: { balance: -numAmount, totalSpent: numAmount } },
        { new: true, session }
      );

      if (!wallet) throw new Error('الرصيد المتاح غير كافٍ لإتمام طلب السحب والرسوم');

      await Transaction.create([{
        userId: req.userId,
        type: 'withdrawal',
        amount: numAmount,
        fee: fee,
        netAmount: netAmount,
        network: selectedNetwork,
        status: 'pending',
        description: `طلب سحب إلى ${walletAddress} عبر شبكة ${selectedNetwork}`
      }], { session });
    });

    sendTelegramNotification(
      req.user.telegramId,
      `🔔 <b>تم تسليم طلب السحب</b>\nالمبلغ المطلق: <code>$${numAmount}</code>\nالصافي للتسلم: <code>$${netAmount}</code>\nالشبكة: <code>${selectedNetwork}</code>\nالحالة: ⏳ قيد التوثيق`
    );

    res.json({ success: true, message: 'تم خصم وتوثيق طلب السحب بنجاح' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
});

// =========================================================================
// --- 8. محرك اختصار الروابط التكيّفي (/api/links) ---
// =========================================================================
app.post('/api/links', authenticateUser, async (req, res) => {
  try {
    const { originalUrl, targetUrl, title, shortCode } = req.body;
    const cleanUrl = String(originalUrl || targetUrl || '').trim();

    if (!cleanUrl || !validUrl.isWebUri(cleanUrl)) {
      return res.status(400).json({ success: false, message: 'عنوان URL المقدم غير صالح' });
    }

    if (isPhishingOrMalicious(cleanUrl)) {
      return res.status(400).json({ success: false, message: 'الرابط مرفوض لأسباب متعلقة بالأمان' });
    }

    if (cleanUrl.includes(CONFIG.APP_DOMAIN)) {
      return res.status(400).json({ success: false, message: 'لا يمكن اختصار روابط النطاق نفسه' });
    }

    const code = shortCode || crypto.randomBytes(3).toString('hex');

    const newLink = await Link.create({
      userId: req.userId,
      originalUrl: cleanUrl,
      targetUrl: cleanUrl,
      title: title ? String(title).trim() : 'رابط جديد',
      shortCode: code,
      shortUrl: code,
      isActive: true
    });

    const shortFullUrl = `https://${CONFIG.APP_DOMAIN}/r/${code}`;
    res.json({ success: true, message: 'تم التخصيص بنجاح', link: newLink, shortUrl: shortFullUrl });
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ success: false, message: 'الرمز الاختصاري مستخدم مسبقاً' });
    res.status(500).json({ success: false, message: 'فشل إنشاء الرابط', error: error.message });
  }
});

app.get('/api/links', authenticateUser, async (req, res) => {
  try {
    const links = await Link.find({ userId: req.userId }).sort({ createdAt: -1 }).lean();
    const formatted = links.map(link => ({
      ...link,
      shortUrl: `https://${CONFIG.APP_DOMAIN}/r/${link.shortCode || link.shortUrl}`
    }));
    res.json({ success: true, links: formatted });
  } catch (error) {
    res.status(500).json({ success: false, message: 'فشل جلب الروابط', error: error.message });
  }
});

// =========================================================================
// --- 9. محرك الإعلانات والجسر ومحساب الاحتساب اليومي والاحتيال ---
// =========================================================================
app.post('/api/campaigns', authenticateUser, async (req, res) => {
  const { title, budget, costPerClick, targetUrl } = req.body;
  const numBudget = Number(budget);

  if (!title || !numBudget || numBudget < 5 || !targetUrl) {
    return res.status(400).json({ success: false, message: 'البيانات غير مكتملة. الحد الأدنى للميزانية هو $5' });
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const wallet = await Wallet.findOneAndUpdate(
        { userId: req.userId, balance: { $gte: numBudget } },
        { $inc: { balance: -numBudget, totalSpent: numBudget } },
        { new: true, session }
      );

      if (!wallet) throw new Error('الرصيد المتاح غير كافٍ لإنشاء الحملة الإعلانية');

      const campaign = await Campaign.create([{
        userId: req.userId,
        title,
        budget: numBudget,
        remainingBudget: numBudget,
        costPerClick: costPerClick || 0.0015,
        targetUrl,
        status: 'active'
      }], { session });

      await Transaction.create([{
        userId: req.userId,
        type: 'spend',
        amount: numBudget,
        fee: 0,
        netAmount: numBudget,
        status: 'completed',
        description: `تمويل حملة إعلانية: ${title}`,
        referenceId: campaign[0]._id
      }], { session });
    });

    res.json({ success: true, message: 'تم إطلاق الحملة وتخصيص الميزانية بنجاح' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
});

app.post('/api/init-click', validateTraffic, async (req, res) => {
  try {
    const { linkCode } = req.body;
    const cleanCode = String(linkCode || '').trim();
    if (!cleanCode) return res.status(400).json({ success: false, message: 'رمز الرابط مفقود' });

    let linkData = await safeRedisGet(`link:data:${cleanCode}`);
    let linkId, linkOwnerId;

    if (linkData) {
      const parsed = JSON.parse(linkData);
      linkId = parsed.id;
      linkOwnerId = parsed.userId;
    } else {
      const link = await Link.findOne({
        $or: [{ shortCode: cleanCode }, { shortUrl: cleanCode }],
        isActive: true
      }).select('_id userId').lean();

      if (!link) return res.status(404).json({ success: false, message: 'الرابط غير موجود أو معطل' });
      linkId = link._id.toString();
      linkOwnerId = link.userId.toString();
      await safeRedisSet(`link:data:${cleanCode}`, JSON.stringify({ id: linkId, userId: linkOwnerId }), 'EX', 3600);
    }

    const activeCampaigns = await Campaign.aggregate([
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

    if (activeCampaigns && activeCampaigns.length > 0) {
      adSource = 'internal';
      selectedAd = activeCampaigns[0];
    }

    const bridgeToken = crypto.randomBytes(16).toString('hex');
    const clickSession = await ClickSession.create({
      linkId,
      publisherId: linkOwnerId,
      ip: req.ip,
      bridgeToken,
      adSource,
      campaignId: selectedAd ? selectedAd._id : null
    });

    await safeRedisSet(`bridge:token:${clickSession._id}`, bridgeToken, 'EX', 300);

    res.json({
      success: true,
      sessionId: clickSession._id,
      bridgeToken,
      blockId: CONFIG.ADSGRAM_BLOCK_ID,
      adSource,
      adData: selectedAd ? { id: selectedAd._id, title: selectedAd.title, targetUrl: selectedAd.targetUrl } : null
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'خطأ أثناء تجهيز جلسة التوجيه', error: error.message });
  }
});

app.post('/api/impression', validateTraffic, clickLimiter, async (req, res) => {
  const sessionDb = await mongoose.startSession();
  try {
    sessionDb.startTransaction();
    const { sessionId, bridgeToken, duration } = req.body;

    if (!sessionId || !bridgeToken) {
      await sessionDb.abortTransaction();
      return res.status(400).json({ success: false, message: 'بيانات التوثيق للجلسة مفقودة' });
    }

    const cachedToken = await safeRedisGet(`bridge:token:${sessionId}`);
    if (cachedToken && cachedToken !== bridgeToken) {
      await sessionDb.abortTransaction();
      return res.status(403).json({ success: false, message: 'تم كشف التلاعب بتوكن الجلسة' });
    }

    const clickSession = await ClickSession.findById(sessionId).session(sessionDb);
    if (!clickSession || clickSession.ip !== req.ip) {
      await sessionDb.abortTransaction();
      return res.status(403).json({ success: false, message: 'الجلسة غير صالحة أو منتهية الصلاحية' });
    }

    const dwellTime = Date.now() - new Date(clickSession.createdAt).getTime();
    if (dwellTime < 4500 && (Number(duration) || 0) < 5) {
      await sessionDb.abortTransaction();
      return res.status(400).json({ success: false, message: 'لم يتم استيفاء وقت المكوث (5 ثوانٍ)' });
    }

    const link = await Link.findById(clickSession.linkId).session(sessionDb);
    await ClickSession.findByIdAndDelete(sessionId).session(sessionDb);
    await safeRedisDel(`bridge:token:${sessionId}`);

    if (!link) {
      await sessionDb.abortTransaction();
      return res.status(404).json({ success: false, message: 'الرابط المستهدف غير موجود' });
    }

    // فحص وتطبيق حد الزيارات اليومية الحقيقية لكل IP
    const dailyIpKey = `daily:ip:${req.ip}`;
    const currentIpCount = await safeRedisIncr(dailyIpKey, 86400);

    const lockKey = `imp:${clickSession.linkId}:${req.ip}`;
    const isDuplicate = await safeRedisGet(lockKey);

    // إذا تم تجاوز الحد اليومي للـ IP أو كشف تكرار مفرط
    if (isDuplicate || currentIpCount > CONFIG.DAILY_IP_CAP) {
      await Link.findByIdAndUpdate(link._id, { $inc: { views: 1, invalidImpressions: 1 } }, { session: sessionDb });
      await sessionDb.commitTransaction();
      return res.json({ success: true, targetUrl: link.originalUrl || link.targetUrl, counted: false });
    }

    await safeRedisSet(lockKey, '1', 'EX', 86400);

    const publisherEarning = CONFIG.PUBLISHER_CPM_RATE; // $0.0012

    // استعلام المحيل وإعداد نسب الأرباح التراكمية (10% Referral Engine)
    const publisherUser = await User.findById(link.userId).session(sessionDb);
    let referralEarning = 0;

    if (publisherUser && publisherUser.referredBy) {
      referralEarning = publisherEarning * CONFIG.REFERRAL_COMMISSION; // $0.00012
    }

    await Impression.create([{
      linkId: link._id,
      publisherId: link.userId,
      campaignId: clickSession.campaignId,
      adSource: clickSession.adSource,
      publisherEarnings: publisherEarning,
      referralEarnings: referralEarning,
      ip: req.ip,
      userAgent: req.get('User-Agent') || ''
    }], { session: sessionDb });

    await Link.findByIdAndUpdate(link._id, { $inc: { views: 1, validImpressions: 1 } }, { session: sessionDb });

    if (clickSession.adSource === 'internal' && clickSession.campaignId) {
      const campaign = await Campaign.findById(clickSession.campaignId).session(sessionDb);
      if (campaign && campaign.remainingBudget >= 0.0015) {
        campaign.remainingBudget -= 0.0015;
        campaign.clicksCount = (campaign.clicksCount || 0) + 1;
        if (campaign.remainingBudget < 0.0015) campaign.status = 'completed';
        await campaign.save({ session: sessionDb });
      }
    }

    // إضافة الأرباح المعلقة للناشر
    await Wallet.findOneAndUpdate(
      { userId: link.userId },
      { $inc: { pendingBalance: publisherEarning, totalEarned: publisherEarning } },
      { session: sessionDb }
    );

    const releaseDate = new Date();
    releaseDate.setDate(releaseDate.getDate() + 1);

    await EarningsHold.create([{
      userId: link.userId,
      amount: publisherEarning,
      releaseAt: releaseDate
    }], { session: sessionDb });

    // إضافة أرباح الإحالة المباشرة للمُحيل في حال وجوده
    if (publisherUser && publisherUser.referredBy && referralEarning > 0) {
      await Wallet.findOneAndUpdate(
        { userId: publisherUser.referredBy },
        { $inc: { balance: referralEarning, totalEarned: referralEarning, referralEarned: referralEarning } },
        { session: sessionDb }
      );

      await Transaction.create([{
        userId: publisherUser.referredBy,
        type: 'referral',
        amount: referralEarning,
        fee: 0,
        netAmount: referralEarning,
        status: 'completed',
        description: `عمولة إحالة 10% من زيارة ناجحة للناشر ${publisherUser.username}`
      }], { session: sessionDb });
    }

    await sessionDb.commitTransaction();
    res.json({ success: true, targetUrl: link.originalUrl || link.targetUrl, counted: true });
  } catch (error) {
    await sessionDb.abortTransaction();
    res.status(500).json({ success: false, message: 'خطأ أثناء تسجيل مشاهدة الإعلان', error: error.message });
  } finally {
    sessionDb.endSession();
  }
});

// =========================================================================
// --- 10. لوحة الإحصائيات والإدارة الفائقة (Admin & Comprehensive Stats) ---
// =========================================================================
app.get('/api/stats', authenticateUser, async (req, res) => {
  try {
    const userId = req.userId;
    const [wallet, totalLinks, totalCampaigns] = await Promise.all([
      Wallet.findOne({ userId }),
      Link.countDocuments({ userId }),
      Campaign.countDocuments({ userId })
    ]);

    res.json({
      success: true,
      stats: {
        balance: wallet ? wallet.balance : 0,
        pendingBalance: wallet ? wallet.pendingBalance : 0,
        totalEarned: wallet ? wallet.totalEarned : 0,
        referralEarned: wallet ? wallet.referralEarned : 0,
        totalSpent: wallet ? wallet.totalSpent : 0,
        totalLinks,
        totalCampaigns
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'فشل جلب الإحصائيات العامة', error: error.message });
  }
});

app.get('/api/admin/dashboard', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const [pendingTx, totalUsers, totalLinks, totalCampaigns] = await Promise.all([
      Transaction.find({ status: 'pending' }).populate('userId').sort({ createdAt: -1 }).lean(),
      User.countDocuments(),
      Link.countDocuments(),
      Campaign.countDocuments()
    ]);

    res.json({
      success: true,
      pendingTransactions: pendingTx,
      metrics: { totalUsers, totalLinks, totalCampaigns }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'فشل جلب بيانات لوحة التحكم', error: error.message });
  }
});

app.post('/api/admin/transaction/action', authenticateUser, requireAdmin, async (req, res) => {
  const { transactionId, action } = req.body;
  if (!['approve', 'reject'].includes(action)) {
    return res.status(400).json({ success: false, message: 'الإجراء المحدد غير صالح' });
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const tx = await Transaction.findById(transactionId).populate('userId').session(session);
      if (!tx || tx.status !== 'pending') throw new Error('المعاملة غير موجودة أو تمت معالجتها مسبقاً');

      if (action === 'approve') {
        tx.status = 'completed';
        if (tx.type === 'deposit') {
          await Wallet.findOneAndUpdate(
            { userId: tx.userId._id },
            { $inc: { balance: tx.netAmount, totalEarned: tx.netAmount } },
            { session }
          );
        }
        sendTelegramNotification(
          tx.userId.telegramId,
          `✅ <b>تمت الموافقة على معاملتك</b>\nالنوع: <code>${tx.type}</code>\nالمبلغ: <code>$${tx.netAmount}</code>`
        );
      } else {
        tx.status = 'rejected';
        if (tx.type === 'withdrawal') {
          // إعادة المبلغ المخصوم للمستخدم عند رفض طلب السحب
          await Wallet.findOneAndUpdate(
            { userId: tx.userId._id },
            { $inc: { balance: tx.amount, totalSpent: -tx.amount } },
            { session }
          );
        }
        sendTelegramNotification(
          tx.userId.telegramId,
          `❌ <b>تم رفض معاملتك</b>\nالنوع: <code>${tx.type}</code>\nالمبلغ: <code>$${tx.amount}</code>`
        );
      }
      await tx.save({ session });
    });

    res.json({ success: true, message: `تم تنفيذ الإجراء بنجاح: ${action}` });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
});

// =========================================================================
// --- 11. جدول تسوية الأرباح المعلقة والمستحقة (Settlement Cron Engine) ---
// =========================================================================
cron.schedule('0 * * * *', async () => {
  try {
    const readyHolds = await EarningsHold.find({ releaseAt: { $lte: new Date() }, isReleased: false }).lean();
    for (const hold of readyHolds) {
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          await Wallet.findOneAndUpdate(
            { userId: hold.userId },
            { $inc: { pendingBalance: -hold.amount, balance: hold.amount } },
            { session }
          );
          await EarningsHold.findByIdAndUpdate(hold._id, { isReleased: true }, { session });
        });
      } catch (err) {
        logger.error(`Error Releasing Hold ID [${hold._id}]: ${err.message}`);
      } finally {
        session.endSession();
      }
    }
  } catch (err) {
    logger.error('Cron Settlement Engine Error: ' + err.message);
  }
});

// =========================================================================
// --- 12. مسارات العرض ومعالجة الاستثناءات ---
// =========================================================================
app.get(['/', '/app', '/admin', '/r/:code'], (req, res) => {
  res.sendFile(path.join(__dirname, 'views.html'));
});

app.use((err, req, res, next) => {
  logger.error('Unhandled System Exception:', err);
  res.status(err.status || 500).json({
    success: false,
    message: process.env.NODE_ENV === 'production' ? 'حدث خطأ غير متوقع في الخادم' : err.message
  });
});

process.on('uncaughtException', (err) => logger.error('Uncaught Exception Caught: ' + err.stack));
process.on('unhandledRejection', (reason) => logger.error('Unhandled Rejection Caught: ' + reason));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Telega.ads Master V6 Active & Listening on Port ${PORT}`));
