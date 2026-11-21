require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const { User, Channel, Campaign, Transaction, SecurityLog } = require('./models');

const app = express();

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ================= SERVERLESS-SAFE MONGODB CONNECTION =================
let cached = global.mongooseCache;
if (!cached) {
  cached = global.mongooseCache = { conn: null, promise: null };
}

const getMongoUri = () => {
  const candidate = process.env.MONGODB_URI || process.env.MONGO_URI || '';
  return typeof candidate === 'string' ? candidate.trim() : '';
};

const connectDB = async () => {
  const uri = getMongoUri();

  if (!uri) {
    throw new Error('MONGODB_URI (or MONGO_URI) environment variable is not defined');
  }

  if (!uri.startsWith('mongodb://') && !uri.startsWith('mongodb+srv://')) {
    throw new Error('MongoDB URI must start with mongodb:// or mongodb+srv://');
  }

  if (cached.conn && mongoose.connection.readyState === 1) {
    return cached.conn;
  }

  if (!cached.promise) {
    const options = {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 20000,
      maxPoolSize: 10
    };

    cached.promise = mongoose.connect(uri, options).then((mongooseInstance) => {
      console.log('Connected to MongoDB');
      return mongooseInstance;
    }).catch((err) => {
      cached.promise = null;
      console.error('MongoDB connection error:', err.message);
      throw err;
    });
  }

  cached.conn = await cached.promise;
  return cached.conn;
};

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

const dbMiddleware = asyncHandler(async (req, res, next) => {
  await connectDB();
  next();
});

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

const logSecurityEvent = async (actorId, action, targetId, details, req) => {
  try {
    await connectDB();
    const forwardedFor = req.headers['x-forwarded-for'];
    const ip = Array.isArray(forwardedFor)
      ? forwardedFor[0]
      : (forwardedFor ? forwardedFor.split(',')[0].trim() : (req.socket?.remoteAddress || ''));

    await SecurityLog.create({
      actorId: String(actorId),
      action,
      targetId: String(targetId || ''),
      details,
      ip
    });
  } catch (error) {
    console.error('Security log error:', error.message);
  }
};

const verifyTelegramWebAppData = (telegramInitData) => {
  if (!telegramInitData || !process.env.BOT_TOKEN) return null;
  try {
    const urlParams = new URLSearchParams(telegramInitData);
    const hash = urlParams.get('hash');
    if (!hash) return null;

    urlParams.delete('hash');
    const dataCheckArr = [];
    for (const [key, value] of urlParams.entries()) {
      dataCheckArr.push(`${key}=${value}`);
    }
    dataCheckArr.sort();
    const dataCheckString = dataCheckArr.join('\n');

    const secretKey = crypto.createHmac('sha256', 'WebAppData')
      .update(process.env.BOT_TOKEN)
      .digest();

    const calculatedHash = crypto.createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    const hashBuf = Buffer.from(calculatedHash, 'utf8');
    const expectedBuf = Buffer.from(hash, 'utf8');
    if (hashBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(hashBuf, expectedBuf)) {
      return null;
    }

    const userStr = urlParams.get('user');
    const startParam = urlParams.get('start_param') || null;
    if (!userStr) return null;

    return {
      user: JSON.parse(userStr),
      startParam
    };
  } catch (err) {
    return null;
  }
};

const authMiddleware = asyncHandler(async (req, res, next) => {
  await connectDB();

  const initData = req.headers['x-telegram-init-data'];
  const verified = verifyTelegramWebAppData(initData);

  if (!verified || !verified.user || !verified.user.id) {
    await logSecurityEvent('unknown', 'UNAUTHORIZED_ACCESS_ATTEMPT', req.originalUrl, 'Invalid or missing initData', req);
    return res.status(401).json({ success: false, message: 'Unauthorized Telegram Session' });
  }

  const tgUser = verified.user;
  const telegramId = String(tgUser.id);
  const adminList = (process.env.ADMIN_IDS || '').split(',').map(id => id.trim()).filter(Boolean);
  const isAdmin = adminList.includes(telegramId);

  let user = await User.findOne({ telegramId });

  if (!user) {
    let referredBy = null;
    if (verified.startParam && verified.startParam.startsWith('ref_')) {
      const refId = verified.startParam.replace('ref_', '').trim();
      if (refId && refId !== telegramId) {
        const referrer = await User.findOne({ telegramId: refId });
        if (referrer) {
          referredBy = refId;
          referrer.referralsCount += 1;
          await referrer.save();
        }
      }
    }

    user = await User.create({
      telegramId,
      username: tgUser.username || '',
      firstName: tgUser.first_name || '',
      lastName: tgUser.last_name || '',
      languageCode: tgUser.language_code === 'ar' ? 'ar' : 'en',
      isAdmin,
      referredBy
    });
  } else {
    user.username = tgUser.username || user.username;
    user.firstName = tgUser.first_name || user.firstName;
    user.lastName = tgUser.last_name || user.lastName;
    user.isAdmin = isAdmin;
    user.lastActive = new Date();
    await user.save();
  }

  if (user.isBanned) {
    return res.status(403).json({ success: false, message: 'Account Suspended' });
  }

  req.user = user;
  next();
});

const adminMiddleware = asyncHandler(async (req, res, next) => {
  const adminList = (process.env.ADMIN_IDS || '').split(',').map(id => id.trim()).filter(Boolean);
  if (!req.user || !req.user.isAdmin || !adminList.includes(req.user.telegramId)) {
    await logSecurityEvent(
      req.user ? req.user.telegramId : 'unknown',
      'ADMIN_PRIVILEGE_ESCALATION_ATTEMPT',
      req.originalUrl,
      'Non-admin user attempted to access admin route',
      req
    );
    return res.status(403).json({ success: false, message: 'Access Denied: Admin Privileges Required' });
  }
  next();
});

// ================= HEALTH CHECK =================
app.get('/api/health', dbMiddleware, asyncHandler(async (req, res) => {
  res.json({ success: true, dbState: mongoose.connection.readyState });
}));

// ================= USER & HOME ROUTES =================
app.get('/api/me', authMiddleware, asyncHandler(async (req, res) => {
  const activeChannels = await Channel.countDocuments({ status: 'approved' });
  const userChannels = await Channel.countDocuments({ ownerId: req.user.telegramId });
  const userCampaigns = await Campaign.countDocuments({ advertiserId: req.user.telegramId });
  const recentTransactions = await Transaction.find({ userId: req.user.telegramId })
    .sort({ createdAt: -1 })
    .limit(10);

  res.json({
    success: true,
    user: {
      telegramId: req.user.telegramId,
      username: req.user.username,
      firstName: req.user.firstName,
      lastName: req.user.lastName,
      languageCode: req.user.languageCode,
      balance: req.user.balance,
      adBalance: req.user.adBalance,
      referralEarnings: req.user.referralEarnings,
      referralsCount: req.user.referralsCount,
      isAdmin: req.user.isAdmin
    },
    stats: {
      activeChannels,
      userChannels,
      userCampaigns
    },
    transactions: recentTransactions
  });
}));

app.post('/api/user/language', authMiddleware, asyncHandler(async (req, res) => {
  const { lang } = req.body;
  if (!['ar', 'en'].includes(lang)) {
    return res.status(400).json({ success: false, message: 'Unsupported language' });
  }
  req.user.languageCode = lang;
  await req.user.save();
  res.json({ success: true, languageCode: req.user.languageCode });
}));

// ================= CHANNELS ROUTES =================
app.get('/api/channels', authMiddleware, asyncHandler(async (req, res) => {
  const myChannels = await Channel.find({ ownerId: req.user.telegramId }).sort({ createdAt: -1 });
  const marketplaceChannels = await Channel.find({ status: 'approved' }).sort({ subscribers: -1 });
  res.json({ success: true, myChannels, marketplaceChannels });
}));

app.post('/api/channels', authMiddleware, asyncHandler(async (req, res) => {
  const { channelUsername, title, subscribers, category, pricePerPost } = req.body;
  if (!channelUsername || !title || !pricePerPost) {
    return res.status(400).json({ success: false, message: 'Missing required fields' });
  }

  const cleanUsername = String(channelUsername).replace('@', '').trim().toLowerCase();
  const parsedPrice = Number(pricePerPost);
  if (!cleanUsername || Number.isNaN(parsedPrice) || parsedPrice < 0.1) {
    return res.status(400).json({ success: false, message: 'Invalid channel username or price' });
  }

  const existing = await Channel.findOne({ channelUsername: cleanUsername });
  if (existing) {
    return res.status(400).json({ success: false, message: 'Channel already registered' });
  }

  const channel = await Channel.create({
    ownerId: req.user.telegramId,
    channelUsername: cleanUsername,
    title: String(title).trim(),
    subscribers: Math.max(0, Number(subscribers) || 0),
    category: category || 'general',
    pricePerPost: parsedPrice,
    status: 'pending'
  });

  await logSecurityEvent(req.user.telegramId, 'CHANNEL_SUBMITTED', channel._id, `Channel @${cleanUsername} submitted`, req);
  res.json({ success: true, channel });
}));

// ================= CAMPAIGNS (PROMOTION) ROUTES =================
app.get('/api/campaigns', authMiddleware, asyncHandler(async (req, res) => {
  const campaigns = await Campaign.find({ advertiserId: req.user.telegramId })
    .populate('channelId', 'title channelUsername pricePerPost')
    .sort({ createdAt: -1 });
  res.json({ success: true, campaigns });
}));

app.post('/api/campaigns', authMiddleware, asyncHandler(async (req, res) => {
  const { channelId, title, adText, targetUrl } = req.body;
  if (!channelId || !title || !adText || !targetUrl) {
    return res.status(400).json({ success: false, message: 'Missing campaign fields' });
  }

  if (!isValidObjectId(channelId)) {
    return res.status(400).json({ success: false, message: 'Invalid channel ID' });
  }

  const channel = await Channel.findById(channelId);
  if (!channel || channel.status !== 'approved') {
    return res.status(404).json({ success: false, message: 'Channel not available' });
  }

  const cost = Number(channel.pricePerPost);
  if (req.user.adBalance < cost) {
    return res.status(400).json({ success: false, message: 'Insufficient ad balance' });
  }

  req.user.adBalance = Number((req.user.adBalance - cost).toFixed(2));
  await req.user.save();

  const campaign = await Campaign.create({
    advertiserId: req.user.telegramId,
    channelId: channel._id,
    title: String(title).trim(),
    adText: String(adText).trim(),
    targetUrl: String(targetUrl).trim(),
    budget: cost,
    status: 'pending'
  });

  await Transaction.create({
    userId: req.user.telegramId,
    type: 'campaign_spend',
    amount: -cost,
    status: 'completed',
    details: `Ad campaign on @${channel.channelUsername}`
  });

  await logSecurityEvent(req.user.telegramId, 'CAMPAIGN_CREATED', campaign._id, `Spent ${cost} on @${channel.channelUsername}`, req);
  res.json({ success: true, campaign, adBalance: req.user.adBalance });
}));

// ================= WALLET ROUTES =================
app.post('/api/wallet/deposit', authMiddleware, asyncHandler(async (req, res) => {
  const amount = Number(req.body.amount);
  if (!amount || Number.isNaN(amount) || amount < 1) {
    return res.status(400).json({ success: false, message: 'Minimum deposit is 1 USD' });
  }

  const tx = await Transaction.create({
    userId: req.user.telegramId,
    type: 'deposit',
    amount,
    status: 'pending',
    details: 'Telegram Stars / Crypto Deposit Request'
  });

  await logSecurityEvent(req.user.telegramId, 'DEPOSIT_REQUEST', tx._id, `Requested deposit of $${amount}`, req);
  res.json({ success: true, transaction: tx });
}));

app.post('/api/wallet/withdraw', authMiddleware, asyncHandler(async (req, res) => {
  const amount = Number(req.body.amount);
  const walletAddress = String(req.body.walletAddress || '').trim();

  if (!amount || Number.isNaN(amount) || amount < 5 || !walletAddress) {
    return res.status(400).json({ success: false, message: 'Minimum withdrawal is $5 and wallet address is required' });
  }

  if (req.user.balance < amount) {
    return res.status(400).json({ success: false, message: 'Insufficient earnings balance' });
  }

  req.user.balance = Number((req.user.balance - amount).toFixed(2));
  await req.user.save();

  const tx = await Transaction.create({
    userId: req.user.telegramId,
    type: 'withdrawal',
    amount: -amount,
    status: 'pending',
    details: `Withdraw to: ${walletAddress}`
  });

  await logSecurityEvent(req.user.telegramId, 'WITHDRAWAL_REQUEST', tx._id, `Requested withdrawal of $${amount} to ${walletAddress}`, req);
  res.json({ success: true, balance: req.user.balance, transaction: tx });
}));

// ================= ADMIN PROTECTED ROUTES =================
app.get('/api/admin/dashboard', authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const totalUsers = await User.countDocuments();
  const pendingChannels = await Channel.find({ status: 'pending' }).sort({ createdAt: -1 });
  const pendingTransactions = await Transaction.find({ status: 'pending' }).sort({ createdAt: -1 });
  const pendingCampaigns = await Campaign.find({ status: 'pending' })
    .populate('channelId', 'title channelUsername ownerId')
    .sort({ createdAt: -1 });
  const securityLogs = await SecurityLog.find().sort({ createdAt: -1 }).limit(30);

  res.json({
    success: true,
    stats: {
      totalUsers,
      pendingChannelsCount: pendingChannels.length,
      pendingTransactionsCount: pendingTransactions.length,
      pendingCampaignsCount: pendingCampaigns.length
    },
    pendingChannels,
    pendingTransactions,
    pendingCampaigns,
    securityLogs
  });
}));

app.post('/api/admin/channels/:id/review', authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ success: false, message: 'Invalid channel ID' });
  }

  const { action } = req.body;
  if (!['approved', 'rejected'].includes(action)) {
    return res.status(400).json({ success: false, message: 'Invalid action' });
  }

  const channel = await Channel.findById(req.params.id);
  if (!channel) return res.status(404).json({ success: false, message: 'Channel not found' });

  channel.status = action;
  await channel.save();

  await logSecurityEvent(req.user.telegramId, `ADMIN_CHANNEL_${action.toUpperCase()}`, channel._id, `Channel @${channel.channelUsername} ${action}`, req);
  res.json({ success: true, channel });
}));

app.post('/api/admin/transactions/:id/review', authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ success: false, message: 'Invalid transaction ID' });
  }

  const { action } = req.body;
  if (!['completed', 'rejected'].includes(action)) {
    return res.status(400).json({ success: false, message: 'Invalid action' });
  }

  const tx = await Transaction.findById(req.params.id);
  if (!tx || tx.status !== 'pending') {
    return res.status(404).json({ success: false, message: 'Pending transaction not found' });
  }

  const targetUser = await User.findOne({ telegramId: tx.userId });
  if (!targetUser) return res.status(404).json({ success: false, message: 'User not found' });

  if (tx.type === 'deposit' && action === 'completed') {
    targetUser.adBalance = Number((targetUser.adBalance + tx.amount).toFixed(2));
    await targetUser.save();
  } else if (tx.type === 'withdrawal' && action === 'rejected') {
    targetUser.balance = Number((targetUser.balance + Math.abs(tx.amount)).toFixed(2));
    await targetUser.save();
  }

  tx.status = action;
  await tx.save();

  await logSecurityEvent(req.user.telegramId, `ADMIN_TX_${action.toUpperCase()}`, tx._id, `Transaction ${tx.type} ($${tx.amount}) marked ${action}`, req);
  res.json({ success: true, transaction: tx });
}));

app.post('/api/admin/campaigns/:id/complete', authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ success: false, message: 'Invalid campaign ID' });
  }

  const campaign = await Campaign.findById(req.params.id).populate('channelId');
  if (!campaign || campaign.status !== 'pending') {
    return res.status(404).json({ success: false, message: 'Pending campaign not found' });
  }

  campaign.status = 'completed';
  await campaign.save();

  if (campaign.channelId) {
    campaign.channelId.totalEarnings = Number(((campaign.channelId.totalEarnings || 0) + campaign.budget).toFixed(2));
    await campaign.channelId.save();

    const channelOwner = await User.findOne({ telegramId: campaign.channelId.ownerId });
    if (channelOwner) {
      channelOwner.balance = Number((channelOwner.balance + campaign.budget).toFixed(2));
      await channelOwner.save();

      await Transaction.create({
        userId: channelOwner.telegramId,
        type: 'channel_earn',
        amount: campaign.budget,
        status: 'completed',
        details: `Ad completed on @${campaign.channelId.channelUsername}`
      });

      if (channelOwner.referredBy) {
        const rate = Number(process.env.REFERRAL_COMMISSION_RATE) || 0.05;
        const bonus = Number((campaign.budget * rate).toFixed(2));
        const referrer = await User.findOne({ telegramId: channelOwner.referredBy });
        if (referrer && bonus > 0) {
          referrer.balance = Number((referrer.balance + bonus).toFixed(2));
          referrer.referralEarnings = Number((referrer.referralEarnings + bonus).toFixed(2));
          await referrer.save();

          await Transaction.create({
            userId: referrer.telegramId,
            type: 'referral_bonus',
            amount: bonus,
            status: 'completed',
            details: `Referral commission from user ${channelOwner.telegramId}`
          });
        }
      }
    }
  }

  await logSecurityEvent(req.user.telegramId, 'ADMIN_CAMPAIGN_COMPLETED', campaign._id, 'Campaign completed & funds released', req);
  res.json({ success: true, campaign });
}));

// ================= API 404 & ERROR HANDLERS =================
app.use('/api', (req, res) => {
  res.status(404).json({ success: false, message: 'API route not found' });
});

app.use((err, req, res, next) => {
  console.error('Server Error:', err);
  res.status(500).json({
    success: false,
    message: err.message || 'Internal Server Error'
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Telega-Ads running on port ${PORT}`);
  });
}

module.exports = app;
