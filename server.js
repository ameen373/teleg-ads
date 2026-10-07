require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const crypto = require('crypto');
const path = require('path');
const jwt = require('jsonwebtoken');

// استيراد النماذج الموحدة من ملف models
const { 
  User, 
  Campaign,
  AdCampaign, 
  ShortLink,
  ShortenedLink, 
  Ledger,
  Transaction, 
  SystemConfig, 
  VisitLog, 
  ActivityLog, 
  Withdrawal, 
  Deposit, 
  ReferralLog, 
  FraudAlert, 
  AdEvent 
} = require('./models');

const app = express();

// ==========================================
// قراءة وتحديد متغيرات البيئة المطلوب استهلاكها
// ==========================================
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const APP_DOMAIN = process.env.APP_DOMAIN || 'http://localhost:3000';
const SECRET_KEY = process.env.SECRET_KEY || 'telega_ads_default_secret_key_2026';
const JWT_SECRET = process.env.JWT_SECRET || 'telega_ads_super_secret_jwt_key_2026';
const BOT_TOKEN = process.env.BOT_TOKEN || '';
const BOT_USERNAME = process.env.BOT_USERNAME || 'AdTelega_bot';
const PLATFORM_BOT_URL = process.env.PLATFORM_BOT_URL || `https://t.me/${BOT_USERNAME}`;
const ADMIN_ID = String(process.env.ADMIN_ID || process.env.ADMIN_TELEGRAM_ID || '0');
const PLATFORM_NAME = process.env.PLATFORM_NAME || 'Telega Ads';
const PUBLISHER_SHARE = parseFloat(process.env.PUBLISHER_SHARE || '0.80');
const DEPOSIT_ADDRESS_TRC20 = process.env.DEPOSIT_ADDRESS_TRC20 || 'T9xR5aK8v2mL1nQ3pY7w4zE6uI8o0P2s1A';
const DEPOSIT_ADDRESS_BEP20 = process.env.DEPOSIT_ADDRESS_BEP20 || '0x71C7656EC7ab88b098defB751B7401B5f6d8976F';
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/telega_ads';

const TRC20_REGEX = /^T[a-zA-1-9]{33}$/;

const SYSTEM_DEPOSIT_ADDRESSES = {
  TRC20: DEPOSIT_ADDRESS_TRC20,
  BEP20: DEPOSIT_ADDRESS_BEP20
};

// ==========================================
// الإعدادات والبرمجيات الوسيطة الأساسية
// ==========================================
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// تسجيل الأحداث
const logEvent = (level, scope, message, meta = {}) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${level.toUpperCase()}] [${scope}]: ${message}`, Object.keys(meta).length ? JSON.stringify(meta) : '');
};

// الاتصال بقاعدة البيانات
const connectDB = async () => {
  try {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(MONGO_URI);
      logEvent('info', 'DATABASE', 'Connected to MongoDB successfully');
    }
  } catch (err) {
    logEvent('error', 'DATABASE', 'MongoDB connection failed', { error: err.message });
  }
};
connectDB();

// معالج الأخطاء للوظائف المزامنة والغير متزامنة (asyncHandler)
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// توليد معرفات الطلبات العشوائية
function generateRequestId(prefix) {
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${timestamp}-${random}`;
}

// ==========================================
// أدوات الحماية والتحقق من الهوية (Auth & Security)
// ==========================================

// التحقق من بيانات Telegram WebApp باستخدام BOT_TOKEN
const verifyTelegramInitData = (initData, botToken) => {
  if (!initData || !botToken) return null;
  try {
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');
    if (!hash) return null;

    urlParams.delete('hash');
    const params = [];
    for (const [key, value] of urlParams.entries()) {
      params.push(`${key}=${value}`);
    }
    params.sort();
    const dataCheckString = params.join('\n');

    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    if (calculatedHash === hash) {
      const userString = urlParams.get('user');
      if (userString) return JSON.parse(userString);
    }
    return null;
  } catch (err) {
    logEvent('error', 'AUTH', 'Telegram WebApp verification error', { error: err.message });
    return null;
  }
};

// برمجية توثيق المستخدم الموحدة
const authMiddleware = async (req, res, next) => {
  try {
    const initData = req.headers['x-telegram-init-data'] || req.headers['authorization'];
    const customTgId = req.headers['x-telegram-id'];
    
    let tgUser = verifyTelegramInitData(initData, BOT_TOKEN);

    // دعم JWT Token إذا كان معطى
    if (!tgUser && initData && initData.startsWith('Bearer ')) {
      try {
        const token = initData.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        const dbUser = await User.findById(decoded.id);
        if (dbUser) {
          req.dbUser = dbUser;
          req.user = dbUser;
          return next();
        }
      } catch (e) {
        // الاستمرار لمسارات التحقق الأخرى
      }
    }

    // دعم الهيدر المباشر لتطبيقات الميني
    if (!tgUser && customTgId) {
      tgUser = {
        id: parseInt(customTgId, 10),
        username: req.headers['x-telegram-username'] || '',
        first_name: req.headers['x-telegram-firstname'] || 'User'
      };
    }

    // وضع التطوير المحلي
    if (!tgUser && NODE_ENV !== 'production' && req.headers['x-dev-user-id']) {
      tgUser = {
        id: parseInt(req.headers['x-dev-user-id'], 10),
        first_name: 'DevUser',
        username: 'dev_user',
        language_code: 'ar'
      };
    }

    if (!tgUser || !tgUser.id) {
      return res.status(401).json({ success: false, error: 'Unauthorized: Authentication credentials missing or invalid' });
    }

    req.tgUser = tgUser;
    let user = await User.findOne({ telegramId: String(tgUser.id) });
    
    if (!user) {
      const assignedRole = (String(tgUser.id) === ADMIN_ID) ? 'Admin' : 'User';

      user = await User.create({
        telegramId: String(tgUser.id),
        firstName: tgUser.first_name || 'User',
        lastName: tgUser.last_name || '',
        username: tgUser.username || '',
        language: tgUser.language_code || 'ar',
        role: assignedRole,
        isAdmin: assignedRole === 'Admin',
        lastActive: new Date(),
        referralCode: crypto.randomBytes(4).toString('hex')
      });
      logEvent('info', 'AUTH', `New user registered: ${tgUser.id}`);
    } else {
      user.lastActive = new Date();
      if (tgUser.username && user.username !== tgUser.username) {
        user.username = tgUser.username;
      }
      await user.save();
    }

    if (user.accountStatus === 'banned' || user.isBlocked) {
      return res.status(403).json({ success: false, error: 'Account is suspended' });
    }

    req.dbUser = user;
    req.user = user;
    next();
  } catch (err) {
    logEvent('error', 'AUTH_MIDDLEWARE', 'Authentication exception', { error: err.message });
    return res.status(500).json({ success: false, error: 'Internal server error during authentication' });
  }
};

// برمجية للتحقق من صلاحيات المسؤول (Admin)
const adminMiddleware = (req, res, next) => {
  if (req.dbUser && (req.dbUser.role === 'Admin' || req.dbUser.role === 'admin' || req.dbUser.telegramId === ADMIN_ID || req.dbUser.isAdmin)) {
    return next();
  }
  logEvent('warn', 'SECURITY', `Unauthorized admin access attempt by ID ${req.dbUser?.telegramId}`);
  return res.status(403).json({ success: false, error: 'Access denied: Admin privileges required' });
};

// ==========================================
// محرك كشف والاحتيال والتقييم (Fraud Engine)
// ==========================================
class FraudEngine {
  static async evaluateActivity({ userId, linkId, adId, type, ip, userAgent }) {
    let score = 0;
    const reasons = [];

    // تسجيل النشاط الحالي
    await ActivityLog.create({
      userId: userId ? String(userId) : '',
      ip,
      userAgent,
      action: type || 'click',
      details: { linkId, adId }
    });

    // 1. فحص تواتر الطلبات السريعة
    const recentLogs = await ActivityLog.find({ ip, createdAt: { $gt: new Date(Date.now() - 60000) } });
    if (recentLogs.length > 10) {
      score += 40;
      reasons.push('High frequency requests within 60s');
    }

    // 2. تحليل السرعة والمدة الزمنية بين النقرات
    const lastLogs = await ActivityLog.find({ ip }).sort({ createdAt: -1 }).limit(2);
    let interval = 0;
    if (lastLogs.length > 1) {
      interval = new Date(lastLogs[0].createdAt).getTime() - new Date(lastLogs[1].createdAt).getTime();
      if (interval < 800) {
        score += 35;
        reasons.push('Unnatural bot-like click speed (<800ms)');
      }
    }

    // 3. التحقق من متصفح الزائر (User Agent)
    const botPattern = /bot|crawl|spider|slurp|curl|wget|python|php|harvest|headless/i;
    if (!userAgent || botPattern.test(userAgent) || userAgent.length < 15) {
      score += 30;
      reasons.push('Suspicious or Bot User-Agent header');
    }

    // 4. الحسابات المتعددة من نفس عنوان IP
    const distinctUsersOnIp = await ActivityLog.distinct('userId', { ip, userId: { $ne: '' } });
    if (distinctUsersOnIp.length > 3) {
      score += 25;
      reasons.push('Multiple accounts active on same IP');
    }

    const finalScore = Math.min(100, score);
    let category = 'normal';
    if (finalScore >= 81) category = 'high_risk';
    else if (finalScore >= 61) category = 'suspicious';
    else if (finalScore >= 31) category = 'monitored';

    if (userId && finalScore >= 61) {
      const dbUser = await User.findById(userId);
      if (dbUser) {
        dbUser.riskScore = finalScore;
        dbUser.riskCategory = category;
        await dbUser.save();

        await FraudAlert.create({
          userId: dbUser._id,
          riskScore: finalScore,
          reason: reasons.join(' | ') || 'High Risk Behavioral Pattern Detected',
          details: { ip, userAgent, clickIntervalMs: interval }
        });
      }
    }

    return { finalScore, category, isFlagged: finalScore >= 61, interval };
  }
}

// دالة جلب أو إنشاء إعدادات النظام
const getOrCreateConfig = async () => {
  let config = await SystemConfig.findOne({ key: 'main_config' });
  if (!config) {
    config = await SystemConfig.create({ key: 'main_config' });
  }
  return config;
};

// ==========================================
// إتاحة الإعدادات العامة للواجهة الأمامية (Public Config API)
// ==========================================

app.get('/api/config', asyncHandler(async (req, res) => {
  const config = await getOrCreateConfig();
  
  // إرجاع كافة البيانات العامة والآمنة للواجهة دون كشف الأسرار مثل JWT_SECRET أو BOT_TOKEN
  res.json({
    success: true,
    platformName: PLATFORM_NAME,
    platformBotUrl: PLATFORM_BOT_URL,
    botUsername: BOT_USERNAME,
    publisherShare: PUBLISHER_SHARE,
    appDomain: APP_DOMAIN,
    depositAddresses: SYSTEM_DEPOSIT_ADDRESSES,
    config: {
      minWithdrawal: config.minWithdrawal,
      cpcRate: config.cpcRate,
      shortenerCpc: config.shortenerCpc,
      referralCommissionRate: config.referralCommissionRate,
      supportLink: config.supportLink,
      channelLink: config.channelLink
    }
  });
}));

// ==========================================
// مسارات المستخدمين (User API)
// ==========================================

app.post('/api/user/sync', authMiddleware, asyncHandler(async (req, res) => {
  const { startParam } = req.body;
  const user = req.dbUser;

  if (startParam && !user.referrerId && String(startParam) !== String(user.telegramId)) {
    const referrer = await User.findOne({ 
      $or: [{ telegramId: String(startParam) }, { referralCode: startParam }] 
    });
    
    if (referrer && String(referrer._id) !== String(user._id)) {
      user.referrerId = referrer.telegramId;
      user.referredBy = referrer._id;
      await user.save();
      
      referrer.referralCount = (referrer.referralCount || 0) + 1;
      await referrer.save();
      
      logEvent('info', 'REFERRAL', `User ${user.telegramId} linked to referrer ${referrer.telegramId}`);
    }
  }

  const config = await getOrCreateConfig();
  const isAdmin = (user.telegramId === ADMIN_ID || user.role === 'Admin' || user.isAdmin);

  res.json({
    success: true,
    user: {
      id: user._id,
      telegramId: user.telegramId,
      firstName: user.firstName,
      lastName: user.lastName,
      username: user.username,
      language: user.language,
      role: user.role,
      balance: user.balance || user.availableBalance || 0,
      pendingBalance: user.pendingBalance || user.pendingWithdrawal || 0,
      totalEarned: user.totalEarned || 0,
      totalSpent: user.totalSpent || 0,
      referralCount: user.referralCount || 0,
      referralEarnings: user.referralEarnings || 0,
      referralCode: user.referralCode,
      usdtTrc20Address: user.usdtTrc20Address || '',
      accountStatus: user.accountStatus || 'active',
      isAdmin
    },
    config
  });
}));

app.post('/api/user/language', authMiddleware, asyncHandler(async (req, res) => {
  const { language } = req.body;
  if (!['ar', 'en'].includes(language)) {
    return res.status(400).json({ success: false, error: 'Invalid language code' });
  }
  req.dbUser.language = language;
  await req.dbUser.save();
  res.json({ success: true, language: req.dbUser.language });
}));

// ==========================================
// مسارات اختصار الروابط (Shortener API)
// ==========================================

app.post('/api/shortener/create', authMiddleware, asyncHandler(async (req, res) => {
  const { originalUrl } = req.body;
  if (!originalUrl || !originalUrl.startsWith('http')) {
    return res.status(400).json({ success: false, error: 'Valid HTTP/HTTPS URL required' });
  }

  const shortCode = crypto.randomBytes(4).toString('hex');
  const link = await ShortenedLink.create({
    userId: req.dbUser.telegramId,
    owner: req.dbUser.telegramId,
    userRef: req.dbUser._id,
    shortCode,
    shortId: shortCode,
    originalUrl
  });

  const telegaBotUrl = `${PLATFORM_BOT_URL}?start=${shortCode}`;
  logEvent('info', 'SHORTENER', `Link created by ${req.dbUser.telegramId}: ${shortCode}`);
  res.json({ success: true, link, telegaBotUrl });
}));

app.get('/api/shortener/my-links', authMiddleware, asyncHandler(async (req, res) => {
  const links = await ShortenedLink.find({ 
    $or: [{ userId: req.dbUser.telegramId }, { owner: req.dbUser.telegramId }] 
  }).sort({ createdAt: -1 });
  res.json({ success: true, links });
}));

app.delete('/api/shortener/:code', authMiddleware, asyncHandler(async (req, res) => {
  const { code } = req.params;
  const link = await ShortenedLink.findOneAndDelete({
    $or: [{ shortCode: code }, { shortId: code }],$or: [{ userId: req.dbUser.telegramId }, { owner: req.dbUser.telegramId }]
  });

  if (!link) return res.status(404).json({ success: false, error: 'Link not found or unauthorized' });
  res.json({ success: true, message: 'Link deleted successfully' });
}));

// مسار التوجيه وزيارة الرابط المختصر
app.get('/s/:code', asyncHandler(async (req, res) => {
  const { code } = req.params;
  const link = await ShortenedLink.findOne({ $or: [{ shortCode: code }, { shortId: code }] });

  if (!link) {
    return res.status(404).send('Shortened link not found or expired');
  }

  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || '127.0.0.1';
  const userAgent = req.headers['user-agent'] || '';

  const evaluation = await FraudEngine.evaluateActivity({
    userId: link.userRef,
    linkId: link._id,
    type: 'click',
    ip,
    userAgent
  });

  if (!evaluation.isFlagged) {
    const config = await getOrCreateConfig();
    link.clicks = (link.clicks || 0) + 1;
    const earnings = config.shortenerCpc || 0.004;
    link.earnings = (link.earnings || 0) + earnings;
    await link.save();

    const owner = await User.findOne({ telegramId: link.userId });
    if (owner) {
      owner.balance = (owner.balance || 0) + earnings;
      owner.totalEarned = (owner.totalEarned || 0) + earnings;
      await owner.save();

      await Transaction.create({
        userId: owner.telegramId,
        userRef: owner._id,
        type: 'shortener_earn',
        amount: earnings,
        status: 'completed',
        description: `Earnings for link ${code}`
      });

      // احتساب عمولة الإحالة
      if (owner.referrerId) {
        const referrer = await User.findOne({ telegramId: owner.referrerId });
        if (referrer && !referrer.isBlocked) {
          const refBonus = earnings * (config.referralCommissionRate || 0.10);
          referrer.balance = (referrer.balance || 0) + refBonus;
          referrer.totalEarned = (referrer.totalEarned || 0) + refBonus;
          referrer.referralEarnings = (referrer.referralEarnings || 0) + refBonus;
          await referrer.save();

          await ReferralLog.create({
            referrer: referrer._id,
            referredUser: owner._id,
            source: 'SHORTENER_COMMISSION',
            amount: earnings,
            commission: refBonus,
            status: 'Paid'
          });
        }
      }
    }
  }

  res.redirect(link.originalUrl);
}));

// ==========================================
// مسارات الحملات الإعلانية (Ads API)
// ==========================================

app.post('/api/ads/create', authMiddleware, asyncHandler(async (req, res) => {
  const { title, url, targetUrl, budget, totalBudget, costPerClick, cpc, cpm, pricingType } = req.body;
  
  const finalTitle = title;
  const finalUrl = url || targetUrl;
  const numBudget = parseFloat(budget || totalBudget);
  const numCpc = parseFloat(costPerClick || cpc || 0.01);

  if (!finalTitle || !finalUrl || isNaN(numBudget) || numBudget <= 0) {
    return res.status(400).json({ success: false, error: 'Invalid parameters for ad campaign' });
  }

  if (req.dbUser.balance < numBudget) {
    return res.status(400).json({ success: false, error: 'Insufficient balance for campaign budget' });
  }

  req.dbUser.balance -= numBudget;
  req.dbUser.totalSpent = (req.dbUser.totalSpent || 0) + numBudget;
  if (req.dbUser.role === 'User' || req.dbUser.role === 'user') req.dbUser.role = 'Advertiser';
  await req.dbUser.save();

  const campaign = await AdCampaign.create({
    advertiserId: req.dbUser.telegramId,
    advertiserUser: req.dbUser._id,
    title: finalTitle,
    url: finalUrl,
    targetUrl: finalUrl,
    budget: numBudget,
    totalBudget: numBudget,
    remainingBudget: numBudget,
    costPerClick: numCpc,
    cpc: numCpc,
    cpm: parseFloat(cpm || 1.0),
    pricingType: pricingType || 'CPC',
    status: 'active'
  });

  await Transaction.create({
    userId: req.dbUser.telegramId,
    userRef: req.dbUser._id,
    type: 'ad_spend',
    amount: -numBudget,
    status: 'completed',
    description: `Campaign created: ${finalTitle}`
  });

  logEvent('info', 'ADS', `Campaign created by ${req.dbUser.telegramId}: ${finalTitle}`);
  res.json({ success: true, campaign, newBalance: req.dbUser.balance });
}));

app.get('/api/ads/my-ads', authMiddleware, asyncHandler(async (req, res) => {
  const campaigns = await AdCampaign.find({ advertiserId: req.dbUser.telegramId }).sort({ createdAt: -1 });
  res.json({ success: true, campaigns });
}));

app.get('/api/ads/active', authMiddleware, asyncHandler(async (req, res) => {
  const activeAds = await AdCampaign.find({ 
    status: 'active',
    $expr: {$lt: ["$spent", "$budget"] }
  }).limit(20);
  
  res.json({ success: true, ads: activeAds });
}));

app.post('/api/ads/click', authMiddleware, asyncHandler(async (req, res) => {
  const { campaignId } = req.body;
  const campaign = await AdCampaign.findById(campaignId);

  if (!campaign || campaign.status !== 'active' || (campaign.spent >= campaign.budget)) {
    return res.status(400).json({ success: false, error: 'Campaign is not active or exhausted' });
  }

  if (String(campaign.advertiserId) === String(req.dbUser.telegramId)) {
    return res.status(400).json({ success: false, error: 'Cannot click your own ad' });
  }

  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || '127.0.0.1';
  const userAgent = req.headers['user-agent'] || '';

  const evaluation = await FraudEngine.evaluateActivity({
    userId: req.dbUser._id,
    adId: campaign._id,
    type: 'click',
    ip,
    userAgent
  });

  if (evaluation.isFlagged) {
    return res.status(400).json({ success: false, error: 'Invalid click pattern detected' });
  }

  const cpc = campaign.costPerClick || campaign.cpc || 0.01;
  campaign.spent = (campaign.spent || 0) + cpc;
  campaign.clicks = (campaign.clicks || 0) + 1;
  campaign.totalClicks = (campaign.totalClicks || 0) + 1;
  if (campaign.spent >= campaign.budget) {
    campaign.status = 'completed';
  }
  await campaign.save();

  const userEarn = cpc * PUBLISHER_SHARE;
  req.dbUser.balance += userEarn;
  req.dbUser.totalEarned = (req.dbUser.totalEarned || 0) + userEarn;
  await req.dbUser.save();

  await Transaction.create({
    userId: req.dbUser.telegramId,
    userRef: req.dbUser._id,
    type: 'ad_click_earn',
    amount: userEarn,
    status: 'completed',
    description: `Ad click reward for campaign ${campaign._id}`
  });

  await AdEvent.create({
    campaignId: campaign._id,
    publisherId: req.dbUser.telegramId,
    type: 'click',
    cost: cpc,
    publisherEarnings: userEarn,
    visitorIp: ip,
    telegramId: req.dbUser.telegramId
  });

  res.json({ success: true, redirectUrl: campaign.url || campaign.targetUrl, reward: userEarn });
}));

// ==========================================
// مسارات المحفظة والسحب والإيداع (Wallet API)
// ==========================================

app.get('/api/wallet/info', authMiddleware, asyncHandler(async (req, res) => {
  const user = req.dbUser;
  const referralLink = `${PLATFORM_BOT_URL}?start=ref_${user.referralCode}`;

  res.json({
    success: true,
    data: {
      balance: user.balance || 0,
      pendingWithdrawal: user.pendingWithdrawal || user.pendingBalance || 0,
      usdtTrc20Address: user.usdtTrc20Address || '',
      totalEarned: user.totalEarned || 0,
      totalWithdrawn: user.totalWithdrawn || 0,
      referralCode: user.referralCode,
      referralLink
    }
  });
}));

app.post('/api/wallet/address', authMiddleware, asyncHandler(async (req, res) => {
  const { address } = req.body;
  if (!address || !TRC20_REGEX.test(address.trim())) {
    return res.status(400).json({ success: false, error: 'عنوان USDT TRC20 غير صحيح' });
  }

  req.dbUser.usdtTrc20Address = address.trim();
  await req.dbUser.save();

  res.json({ success: true, message: 'تم حفظ عنوان السحب بنجاح', address: req.dbUser.usdtTrc20Address });
}));

app.post('/api/wallet/deposit', authMiddleware, asyncHandler(async (req, res) => {
  const { network, amount, txid } = req.body;
  const numAmount = parseFloat(amount);

  if (txid) {
    if (!['TRC20', 'BEP20'].includes(network)) {
      return res.status(400).json({ success: false, error: 'شبكة الإيداع غير صالحة' });
    }
    if (isNaN(numAmount) || numAmount < 10) {
      return res.status(400).json({ success: false, error: 'الحد الأدنى للإيداع هو $10' });
    }

    const cleanTxid = txid.trim();
    const existingDeposit = await Deposit.findOne({ txid: cleanTxid });
    if (existingDeposit) {
      return res.status(400).json({ success: false, error: 'تم استخدام TXID هذا سابقاً' });
    }

    const deposit = await Deposit.create({
      requestId: generateRequestId('DP'),
      user: req.dbUser._id,
      userId: req.dbUser._id,
      network,
      amount: numAmount,
      txid: cleanTxid,
      status: 'Pending'
    });

    return res.json({ success: true, message: 'تم إرسال طلب الإيداع قيد المراجعة', deposit });
  }

  if (isNaN(numAmount) || numAmount <= 0) {
    return res.status(400).json({ success: false, error: 'Invalid deposit amount' });
  }

  req.dbUser.balance += numAmount;
  await req.dbUser.save();

  await Transaction.create({
    userId: req.dbUser.telegramId,
    userRef: req.dbUser._id,
    type: 'deposit',
    amount: numAmount,
    status: 'completed',
    description: 'Direct wallet deposit'
  });

  res.json({ success: true, balance: req.dbUser.balance });
}));

app.post('/api/wallet/withdraw', authMiddleware, asyncHandler(async (req, res) => {
  const { amount } = req.body;
  const numAmount = parseFloat(amount);
  const config = await getOrCreateConfig();
  const minWithdrawal = config.minWithdrawal || 5.0;

  if (isNaN(numAmount) || numAmount < minWithdrawal) {
    return res.status(400).json({ success: false, error: `الحد الأدنى للسحب هو $${minWithdrawal}` });
  }

  if (req.dbUser.balance < numAmount) {
    return res.status(400).json({ success: false, error: 'رصيدك المتاح غير كافٍ' });
  }

  if (!req.dbUser.usdtTrc20Address) {
    return res.status(400).json({ success: false, error: 'يرجى حفظ عنوان USDT TRC20 أولاً' });
  }

  req.dbUser.balance -= numAmount;
  req.dbUser.pendingWithdrawal = (req.dbUser.pendingWithdrawal || 0) + numAmount;
  await req.dbUser.save();

  const withdrawal = await Withdrawal.create({
    requestId: generateRequestId('WD'),
    user: req.dbUser._id,
    userId: req.dbUser._id,
    amount: numAmount,
    fee: 1,
    netAmount: numAmount - 1,
    address: req.dbUser.usdtTrc20Address,
    walletAddress: req.dbUser.usdtTrc20Address,
    status: 'Pending'
  });

  await Transaction.create({
    userId: req.dbUser.telegramId,
    userRef: req.dbUser._id,
    type: 'withdrawal',
    amount: -numAmount,
    status: 'pending',
    description: 'Withdrawal request submitted'
  });

  res.json({ success: true, balance: req.dbUser.balance, withdrawal });
}));

app.get('/api/wallet/transactions', authMiddleware, asyncHandler(async (req, res) => {
  const transactions = await Transaction.find({ userId: req.dbUser.telegramId }).sort({ createdAt: -1 }).limit(50);
  res.json({ success: true, transactions });
}));

app.get('/api/wallet/deposit-addresses', authMiddleware, (req, res) => {
  res.json({ success: true, addresses: SYSTEM_DEPOSIT_ADDRESSES, minDeposit: 10 });
}));

// ==========================================
// مسارات الإحالة (Referral API)
// ==========================================

app.get('/api/referrals/stats', authMiddleware, asyncHandler(async (req, res) => {
  const referrals = await User.find({ 
    $or: [{ referrerId: req.dbUser.telegramId }, { referredBy: req.dbUser._id }] 
  }, 'firstName username registeredAt createdAt').sort({ createdAt: -1 });

  const logs = await ReferralLog.find({ referrer: req.dbUser._id }).sort({ createdAt: -1 });

  res.json({ 
    success: true, 
    referralCount: req.dbUser.referralCount || referrals.length,
    referralEarnings: req.dbUser.referralEarnings || 0,
    referrals,
    logs
  });
}));

// ==========================================
// مسارات لوحة التحكم الإدارية (Admin API)
// ==========================================

app.get('/api/admin/stats', authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const totalUsers = await User.countDocuments();
  const totalAds = await AdCampaign.countDocuments();
  const totalLinks = await ShortenedLink.countDocuments();
  const pendingWithdrawals = await Withdrawal.countDocuments({ status: 'Pending' });

  const totalSpentResult = await AdCampaign.aggregate([
    { $group: { _id: null, total: { $sum: "$spent" } } }
  ]);
  const platformRevenue = totalSpentResult[0]?.total || 0;

  res.json({
    success: true,
    stats: { totalUsers, totalAds, totalLinks, platformRevenue, pendingWithdrawals }
  });
}));

app.get('/api/admin/users', authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const users = await User.find().sort({ createdAt: -1 }).limit(100);
  res.json({ success: true, users });
}));

app.post('/api/admin/config', authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const { minWithdrawal, cpcRate, shortenerCpc, referralCommissionRate, supportLink, channelLink } = req.body;
  const config = await getOrCreateConfig();

  if (minWithdrawal !== undefined) config.minWithdrawal = parseFloat(minWithdrawal);
  if (cpcRate !== undefined) config.cpcRate = parseFloat(cpcRate);
  if (shortenerCpc !== undefined) config.shortenerCpc = parseFloat(shortenerCpc);
  if (referralCommissionRate !== undefined) config.referralCommissionRate = parseFloat(referralCommissionRate);
  if (supportLink !== undefined) config.supportLink = supportLink;
  if (channelLink !== undefined) config.channelLink = channelLink;

  await config.save();
  res.json({ success: true, config });
}));

app.get('/api/admin/withdrawals', authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const list = await Withdrawal.find().populate('user userId').sort({ createdAt: -1 });
  res.json({ success: true, withdrawals: list });
}));

app.put('/api/admin/withdrawals/:id/status', authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const { status, rejectionReason, txid } = req.body;
  const withdrawal = await Withdrawal.findById(req.params.id);

  if (!withdrawal) return res.status(404).json({ success: false, error: 'Withdrawal request not found' });

  if (status === 'Rejected' && withdrawal.status !== 'Rejected') {
    await User.findByIdAndUpdate(withdrawal.user || withdrawal.userId, {
      $inc: { balance: withdrawal.amount, pendingWithdrawal: -withdrawal.amount }
    });
    withdrawal.rejectionReason = rejectionReason || 'Rejected by Admin';
  }

  if (status === 'Paid' && withdrawal.status !== 'Paid') {
    await User.findByIdAndUpdate(withdrawal.user || withdrawal.userId, {
      $inc: { pendingWithdrawal: -withdrawal.amount, totalWithdrawn: withdrawal.amount }
    });
    if (txid) withdrawal.txid = txid;
  }

  withdrawal.status = status;
  await withdrawal.save();

  res.json({ success: true, message: `Withdrawal status updated to ${status}`, withdrawal });
}));

app.get('/api/admin/deposits', authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const list = await Deposit.find().populate('user userId').sort({ createdAt: -1 });
  res.json({ success: true, deposits: list });
}));

app.put('/api/admin/deposits/:id/status', authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const { status, rejectionReason } = req.body;
  const deposit = await Deposit.findById(req.params.id);

  if (!deposit) return res.status(404).json({ success: false, error: 'Deposit request not found' });
  if (deposit.status !== 'Pending') return res.status(400).json({ success: false, error: 'Deposit request already processed' });

  if (status === 'Approved') {
    await User.findByIdAndUpdate(deposit.user || deposit.userId, { $inc: { balance: deposit.amount } });
  } else if (status === 'Rejected') {
    deposit.rejectionReason = rejectionReason || 'Verification failed';
  }

  deposit.status = status;
  await deposit.save();

  res.json({ success: true, message: `Deposit status updated to ${status}`, deposit });
}));

// ==========================================
// معالجة الأخطاء والتشغيل (Global Error & Start)
// ==========================================

app.use((err, req, res, next) => {
  logEvent('error', 'SERVER_EXCEPTION', err.message, { stack: err.stack });
  res.status(500).json({ success: false, error: err.message || 'An unexpected internal error occurred' });
});

if (NODE_ENV !== 'production' || require.main === module) {
  app.listen(PORT, () => {
    logEvent('info', 'SERVER', `Telega Ads Server running smoothly on port ${PORT}`);
  });
}

module.exports = app;
