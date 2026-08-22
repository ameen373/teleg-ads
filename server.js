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
const { User, Link, Impression, ClickSession, Withdraw, EarningsHold, Announcement } = require('./models');

const app = express();

// --- Express & CORS Configurations ---
app.set('trust proxy', true);

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-telegram-init-data', 'x-demo-user-id']
}));

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(express.static(__dirname));

// --- Centralized Logging Engine (Winston) ---
const logger = winston.createLogger({
  level: 'info',
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

// --- Environment Variables Configuration ---
const BOT_TOKEN = process.env.BOT_TOKEN;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/shortener';
const ADMIN_ID = process.env.ADMIN_ID || '123456789';
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_jwt_secret_key_32bytes_long!';
const ADSGRAM_BLOCK_ID = process.env.ADSGRAM_BLOCK_ID || '1234';
const APP_DOMAIN = process.env.APP_DOMAIN || 'localhost:3000';
const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

// --- Distributed Cache & Connection (Redis) ---
const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: false,
  retryStrategy: (times) => Math.min(times * 50, 2000)
});
redis.on('error', (err) => logger.error('⚠️ Redis Error: ' + err.message));

// --- Database Connection Pooling ---
mongoose.connect(MONGO_URI, {
  maxPoolSize: 50,
  minPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
}).then(() => console.log('✅ Enterprise MongoDB Pipeline Connected'))
  .catch(err => {
    logger.error('❌ Critical MongoDB Connection Failure:', err);
    process.exit(1);
  });

// --- Telegram Dispatch Helper ---
async function sendTelegramNotification(telegramId, message) {
  if (!BOT_TOKEN || !telegramId) return;
  try {
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
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
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN || '').digest();
    const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    if (crypto.timingSafeEqual(Buffer.from(calculatedHash), Buffer.from(hash))) {
      const userParam = urlParams.get('user');
      return userParam ? JSON.parse(userParam) : null;
    }
    return null;
  } catch (err) {
    return null;
  }
}

// --- Authentication & JWT Middleware ---
app.post('/api/auth/login', async (req, res) => {
  try {
    const initData = req.headers['x-telegram-init-data'];
    const telegramUser = verifyTelegramData(initData);
    
    const tgId = telegramUser ? String(telegramUser.id) : (process.env.NODE_ENV !== 'production' ? req.headers['x-demo-user-id'] : null);
    const { referrerId } = req.body;

    if (!tgId) return res.status(401).json({ error: 'مصادقة غير صالحة.' });

    let user = await User.findOne({ telegramId: tgId });
    if (!user) {
      user = await User.create({
        telegramId: tgId,
        username: telegramUser?.username || `User_${tgId.slice(-4)}`,
        referredBy: mongoose.Types.ObjectId.isValid(referrerId) ? referrerId : null
      });
    }

    if (user.isBanned) return res.status(403).json({ error: 'تم تعليق حسابك لنشاط مخالف.' });

    const token = jwt.sign(
      { userId: user._id, telegramId: user.telegramId, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d', algorithm: 'HS256' }
    );

    res.json({ success: true, token, user, isAdmin: String(user.telegramId) === String(ADMIN_ID) });
  } catch (err) {
    res.status(500).json({ error: 'خطأ أثناء معالجة الهوية' });
  }
});

const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'رمز الوصول مفقود' });
  
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId).lean();
    if (!user || user.isBanned) return res.status(403).json({ error: 'غير مصرح للوصول' });
    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ error: 'انتهت صلاحية الجلسة، يرجى إعادة تسجيل الدخول' });
  }
};

const adminMiddleware = async (req, res, next) => {
  if (!req.user || String(req.user.telegramId) !== String(ADMIN_ID)) {
    return res.status(403).json({ error: 'غير مصرح لك بالوصول لقسم الإدارة' });
  }
  next();
};

// --- Anti-Fraud Rate Limiters ---
const linkCreationLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 100,
  message: { error: 'تم تجاوز الحد الأقصى اليومي لإنشاء الروابط' }
});

const clickLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  keyGenerator: (req) => req.ip,
  message: { error: 'معدل زيارات عالٍ جداً. يرجى الانتظار' }
});

const validateTraffic = (req, res, next) => {
  const ua = req.get('User-Agent') || '';
  const botPattern = /bot|crawler|spider|datacenter|proxy|httpclient|curl|python|axios|headless|selenium|puppeteer/i;
  if (botPattern.test(ua)) {
    return res.status(403).json({ error: 'تم حظر حركة المرور التلقائية (Bot Traffic Rejected)' });
  }
  next();
};

// --- Link Click & Impression Handling ---
app.post('/api/init-click', validateTraffic, async (req, res) => {
  try {
    const { linkCode } = req.body;
    if (!linkCode) return res.status(400).json({ error: 'معرف الرابط مطلوب' });

    let linkId = await redis.get(`link:code:${linkCode}`);
    if (!linkId) {
      const link = await Link.findOne({ shortCode: linkCode, isActive: true }).select('_id').lean();
      if (!link) return res.status(404).json({ error: 'الرابط غير موجود أو تم إيقافه' });
      linkId = link._id.toString();
      await redis.set(`link:code:${linkCode}`, linkId, 'EX', 3600);
    }

    await ClickSession.deleteMany({ linkId, ip: req.ip });
    const session = await ClickSession.create({ linkId, ip: req.ip });

    res.json({ sessionId: session._id, blockId: ADSGRAM_BLOCK_ID });
  } catch (err) {
    res.status(500).json({ error: 'فشل بدء جلسة التوجيه' });
  }
});

app.post('/api/impression', validateTraffic, clickLimiter, async (req, res) => {
  try {
    const { sessionId, duration } = req.body;
    if (!sessionId) return res.status(400).json({ error: 'معرف الجلسة مفقود' });

    const session = await ClickSession.findById(sessionId);
    if (!session || session.ip !== req.ip) {
      return res.status(403).json({ error: 'جلسة غير صالحة أو غير آمنة' });
    }

    const dwellTime = Date.now() - new Date(session.createdAt).getTime();
    if (dwellTime < 4800 && (Number(duration) || 0) < 5) {
      return res.status(400).json({ error: 'لم يتم استيفاء الحد الأدنى لزمن المشاهدة (5 ثوانٍ)' });
    }

    const lockKey = `imp:${session.linkId}:${req.ip}`;
    const isDuplicate = await redis.get(lockKey);

    const link = await Link.findById(session.linkId);
    await ClickSession.findByIdAndDelete(sessionId);

    if (!link) return res.status(404).json({ error: 'الرابط غير موجود' });

    if (isDuplicate) {
      return res.json({ success: true, targetUrl: link.targetUrl, counted: false });
    }

    await redis.set(lockKey, '1', 'EX', 86400);

    await Promise.all([
      Impression.create({ linkId: link._id, ip: req.ip, userAgent: req.get('User-Agent') || '' }),
      Link.findByIdAndUpdate(link._id, { $inc: { views: 1, validImpressions: 1 } })
    ]);

    res.json({ success: true, targetUrl: link.targetUrl, counted: true });
  } catch (err) {
    res.status(500).json({ error: 'خطأ معالجة النقرة' });
  }
});

// --- Link CRUD Operations ---
app.post('/api/links', authMiddleware, linkCreationLimiter, async (req, res) => {
  try {
    let { title, targetUrl } = req.body;
    if (!validUrl.isWebUri(targetUrl)) return res.status(400).json({ error: 'الرابط الوجهة غير صالح' });
    
    try {
      const domainCheck = new URL(targetUrl).hostname;
      if (domainCheck.includes(APP_DOMAIN)) {
        return res.status(400).json({ error: 'غير مسموح باختصار روابط المنصة الذاتية' });
      }
    } catch(e) {}

    const shortCode = crypto.randomBytes(3).toString('hex');
    const link = await Link.create({
      userId: req.user._id,
      title: title?.trim() || 'بدون عنوان',
      targetUrl,
      shortCode
    });

    res.json({ success: true, link });
  } catch (err) {
    res.status(500).json({ error: 'فشل إنشاء الرابط المختصر' });
  }
});

app.post('/api/links/toggle', authMiddleware, async (req, res) => {
  try {
    const { linkId } = req.body;
    const link = await Link.findOne({ _id: linkId, userId: req.user._id });
    if (!link) return res.status(404).json({ error: 'الرابط غير موجود' });

    link.isActive = !link.isActive;
    await link.save();
    await redis.del(`link:code:${link.shortCode}`);

    res.json({ success: true, isActive: link.isActive });
  } catch (err) {
    res.status(500).json({ error: 'فشل تعديل حالة الرابط' });
  }
});

app.get('/api/user/data', authMiddleware, async (req, res) => {
  try {
    const [links, withdraws, announcements] = await Promise.all([
      Link.find({ userId: req.user._id }).sort({ createdAt: -1 }).lean(),
      Withdraw.find({ userId: req.user._id }).sort({ createdAt: -1 }).lean(),
      Announcement.find({ isActive: true }).sort({ createdAt: -1 }).limit(5).lean()
    ]);
    const isAdmin = String(req.user.telegramId) === String(ADMIN_ID);
    res.json({ user: req.user, links, withdraws, announcements, isAdmin });
  } catch (err) {
    res.status(500).json({ error: 'فشل استرجاع بيانات الحساب' });
  }
});

app.post('/api/user/settings', authMiddleware, async (req, res) => {
  try {
    const { defaultWallet } = req.body;
    await User.findByIdAndUpdate(req.user._id, { defaultWallet: defaultWallet ? defaultWallet.trim() : '' });
    res.json({ success: true, message: 'تم حفظ عنوان المحفظة بنجاح' });
  } catch (err) {
    res.status(400).json({ error: err.message || 'خطأ في تحديث البيانات' });
  }
});

app.post('/api/withdraw', authMiddleware, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { amount, walletAddress } = req.body;
    const numAmt = Number(amount);

    if (isNaN(numAmt) || numAmt < 10) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ error: 'الحد الأدنى للسحب هو 10 USDT' });
    }

    if (!walletAddress || walletAddress.trim().length < 5) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ error: 'عنوان المحفظة غير صالح' });
    }

    const updatedUser = await User.findOneAndUpdate(
      { _id: req.user._id, availableBalance: { $gte: numAmt } },
      { $inc: { availableBalance: -numAmt }, defaultWallet: walletAddress.trim() },
      { new: true, session }
    );

    if (!updatedUser) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ error: 'الرصيد المتاح غير كافٍ لإتمام العملية' });
    }

    const withdrawRequest = await Withdraw.create([{
      userId: req.user._id,
      amount: numAmt,
      walletAddress: walletAddress.trim()
    }], { session });

    await session.commitTransaction();
    session.endSession();

    sendTelegramNotification(
      req.user.telegramId,
      `🔔 <b>تم تقديم طلب سحب جديد!</b>\nالمبلغ: <code>$${numAmt}</code>\nالمحفظة: <code>${walletAddress}</code>\nالحالة: قيد المراجعة`
    );

    res.json({ success: true, withdraw: withdrawRequest[0] });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ error: 'فشل معالجة طلب السحب' });
  }
});

// --- Admin APIs (Protected by JWT & Telegram Admin ID Check) ---
app.get('/api/admin/dashboard-data', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const [withdraws, users, stats] = await Promise.all([
      Withdraw.find({ status: 'Pending' }).populate('userId').sort({ createdAt: -1 }),
      User.find().sort({ createdAt: -1 }).limit(100),
      User.aggregate([{ $group: { _id: null, totalPending: { $sum: "$pendingBalance" }, totalAvailable: { $sum: "$availableBalance" }, totalUsers: { $sum: 1 } } }])
    ]);
    
    res.json({ withdraws, users, stats: stats[0] || {} });
  } catch (err) {
    res.status(500).json({ error: 'فشل استرجاع بيانات لوحة التحكم' });
  }
});

app.post('/api/admin/distribute-revenue', authMiddleware, adminMiddleware, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { totalRevenue } = req.body;
    const revenue = Number(totalRevenue);
    if (isNaN(revenue) || revenue <= 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ error: 'مبلغ الإيراد غير صحيح' });
    }

    const aggregateTotal = await Link.aggregate([
      { $group: { _id: null, total: { $sum: '$validImpressions' } } }
    ]).session(session);

    const totalImp = aggregateTotal[0]?.total || 0;
    if (totalImp === 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ error: 'لا توجد مشاهدات معتمدة لتوزيع الأرباح عليها' });
    }

    const links = await Link.find({ validImpressions: { $gt: 0 } }).populate('userId').session(session);
    const releaseDate = new Date();
    releaseDate.setDate(releaseDate.getDate() + 14);

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
        await EarningsHold.create([{ userId: link.userId._id, amount: earned, releaseAt: releaseDate }], { session });
      }

      link.validImpressions = 0;
      await link.save({ session });
    }

    await session.commitTransaction();
    session.endSession();
    res.json({ success: true, message: `تم توزيع $${revenue} بنجاح على ${links.length} رابط.` });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ error: 'فشل محرك توزيع الأرباح' });
  }
});

app.post('/api/admin/user/toggle-ban', authMiddleware, adminMiddleware, async (req, res) => {
  const { userId } = req.body;
  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });

    user.isBanned = !user.isBanned;
    await user.save();
    res.json({ success: true, isBanned: user.isBanned });
  } catch (err) {
    res.status(500).json({ error: 'فشل تغيير حالة المستخدم' });
  }
});

app.post('/api/admin/withdraw/action', authMiddleware, adminMiddleware, async (req, res) => {
  const { withdrawId, action, note } = req.body;

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const withdraw = await Withdraw.findById(withdrawId).populate('userId').session(session);
    if (!withdraw || withdraw.status !== 'Pending') {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ error: 'طلب غير صالح أو تم اتخاذ إجراء عليه سابقاً' });
    }

    withdraw.status = action;
    withdraw.note = note || '';
    await withdraw.save({ session });

    if (action === 'Rejected') {
      await User.findByIdAndUpdate(withdraw.userId._id, { $inc: { availableBalance: withdraw.amount } }, { session });
      sendTelegramNotification(
        withdraw.userId.telegramId,
        `❌ <b>تم رفض طلب السحب</b>\nالمبلغ: <code>$${withdraw.amount}</code>\nالسبب: ${note || 'لا يوجد'}`
      );
    } else if (action === 'Completed') {
      sendTelegramNotification(
        withdraw.userId.telegramId,
        `💸 <b>تمت الموافقة على السحب!</b>\nتم تحويل <code>$${withdraw.amount}</code> إلى محفظتك بنجاح.`
      );
    }

    await session.commitTransaction();
    session.endSession();
    res.json({ success: true, withdraw });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ error: 'فشل تنفيذ الإجراء الإداري' });
  }
});

// --- Automated Cron Job: Earnings Hold Release ---
cron.schedule('0 0 * * *', async () => {
  try {
    const readyHolds = await EarningsHold.find({ releaseAt: { $lte: new Date() }, isReleased: false }).populate('userId');
    
    for (let hold of readyHolds) {
      if (!hold.userId) continue;
      const session = await mongoose.startSession();
      session.startTransaction();
      try {
        await User.findByIdAndUpdate(
          hold.userId._id,
          { $inc: { pendingBalance: -hold.amount, availableBalance: hold.amount } },
          { session }
        );
        hold.isReleased = true;
        await hold.save({ session });

        await session.commitTransaction();
        session.endSession();

        sendTelegramNotification(
          hold.userId.telegramId,
          `✅ <b>تحرير رصيد الأرباح!</b>\nتم نقل <code>$${hold.amount.toFixed(2)}</code> إلى رصيدك المتاح للسحب.`
        );
      } catch (err) {
        await session.abortTransaction();
        session.endSession();
      }
    }
  } catch (err) {
    logger.error('❌ Error executing Cron Settlement: ' + err.message);
  }
});

// --- Fallback & Static View Routing ---
app.get('/r/:code', (req, res) => res.sendFile(path.join(__dirname, 'views.html')));
app.get('/app', (req, res) => res.sendFile(path.join(__dirname, 'views.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'views.html')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'views.html')));

app.use('/api/*', (req, res) => res.status(404).json({ error: 'المسار المطلوب غير موجود' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Enterprise Server Active on Port ${PORT}`));
