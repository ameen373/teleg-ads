require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const {
  admin,
  db,
  users,
  channels,
  campaigns,
  transactions,
  securityLogs
} = require('./models');

const app = express();

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Verify Firestore connectivity on startup without blocking serverless requests
db.listCollections()
  .then(() => console.log('Connected to Firebase Cloud Firestore'))
  .catch(err => console.error('Firestore connection check error:', err));

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

const toIsoString = (val) => {
  if (!val) return new Date().toISOString();
  if (typeof val.toDate === 'function') return val.toDate().toISOString();
  if (val instanceof Date) return val.toISOString();
  return new Date(val).toISOString();
};

const serializeDoc = (docSnap, extraFields = {}) => {
  if (!docSnap || !docSnap.exists) return null;
  const data = docSnap.data() || {};
  const obj = {
    _id: docSnap.id,
    id: docSnap.id,
    ...data,
    ...extraFields
  };
  if (obj.createdAt !== undefined) obj.createdAt = toIsoString(obj.createdAt);
  if (obj.lastActive !== undefined) obj.lastActive = toIsoString(obj.lastActive);
  return obj;
};

const serializeUser = (docSnap) => {
  if (!docSnap || !docSnap.exists) return null;
  const d = docSnap.data() || {};
  return {
    _id: docSnap.id,
    id: docSnap.id,
    telegramId: String(d.telegramId || docSnap.id),
    username: d.username || '',
    firstName: d.firstName || '',
    lastName: d.lastName || '',
    languageCode: d.languageCode || 'en',
    balance: Number(d.balance ?? 0),
    adBalance: Number(d.adBalance ?? 0),
    referralEarnings: Number(d.referralEarnings ?? 0),
    referredBy: d.referredBy ?? null,
    referralsCount: Number(d.referralsCount ?? 0),
    isAdmin: Boolean(d.isAdmin),
    isBanned: Boolean(d.isBanned),
    createdAt: toIsoString(d.createdAt),
    lastActive: toIsoString(d.lastActive)
  };
};

const sortDocsDesc = (docs, field = 'createdAt') => {
  return [...docs].sort((a, b) => {
    const aTime = new Date(toIsoString(a.data()?.[field])).getTime() || 0;
    const bTime = new Date(toIsoString(b.data()?.[field])).getTime() || 0;
    return bTime - aTime;
  });
};

const logSecurityEvent = async (actorId, action, targetId, details, req) => {
  try {
    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '';
    await securityLogs.add({
      actorId: String(actorId),
      action: String(action),
      targetId: String(targetId || ''),
      details: String(details || ''),
      ip: String(ip),
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  } catch (error) {
    console.error('Security log error:', error);
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

    if (calculatedHash !== hash) return null;

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

const getUserByTelegramId = async (telegramId) => {
  const idStr = String(telegramId);
  const directDoc = await users.doc(idStr).get();
  if (directDoc.exists) return directDoc;

  const snap = await users.where('telegramId', '==', idStr).limit(1).get();
  if (!snap.empty) return snap.docs[0];
  return null;
};

const authMiddleware = asyncHandler(async (req, res, next) => {
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

  let userDoc = await getUserByTelegramId(telegramId);

  if (!userDoc) {
    let referredBy = null;
    if (verified.startParam && verified.startParam.startsWith('ref_')) {
      const refId = verified.startParam.replace('ref_', '').trim();
      if (refId && refId !== telegramId) {
        const referrerDoc = await getUserByTelegramId(refId);
        if (referrerDoc) {
          referredBy = refId;
          await referrerDoc.ref.update({
            referralsCount: admin.firestore.FieldValue.increment(1)
          });
        }
      }
    }

    const now = new Date();
    const userRef = users.doc(telegramId);
    await userRef.set({
      telegramId,
      username: tgUser.username || '',
      firstName: tgUser.first_name || '',
      lastName: tgUser.last_name || '',
      languageCode: tgUser.language_code === 'ar' ? 'ar' : 'en',
      balance: 0,
      adBalance: 0,
      referralEarnings: 0,
      referredBy,
      referralsCount: 0,
      isAdmin,
      isBanned: false,
      createdAt: now,
      lastActive: now
    });
    userDoc = await userRef.get();
  } else {
    const existingData = userDoc.data() || {};
    await userDoc.ref.update({
      username: tgUser.username || existingData.username || '',
      firstName: tgUser.first_name || existingData.firstName || '',
      lastName: tgUser.last_name || existingData.lastName || '',
      isAdmin,
      lastActive: new Date()
    });
    userDoc = await userDoc.ref.get();
  }

  const serialized = serializeUser(userDoc);

  if (serialized.isBanned) {
    return res.status(403).json({ success: false, message: 'Account Suspended' });
  }

  req.user = serialized;
  req.userRef = userDoc.ref;
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

// ================= USER & HOME ROUTES =================
app.get('/api/me', authMiddleware, asyncHandler(async (req, res) => {
  const [approvedSnap, userChannelsSnap, userCampaignsSnap, userTxSnap] = await Promise.all([
    channels.where('status', '==', 'approved').get(),
    channels.where('ownerId', '==', req.user.telegramId).get(),
    campaigns.where('advertiserId', '==', req.user.telegramId).get(),
    transactions.where('userId', '==', req.user.telegramId).get()
  ]);

  const sortedTx = sortDocsDesc(userTxSnap.docs, 'createdAt')
    .slice(0, 10)
    .map(doc => serializeDoc(doc));

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
      activeChannels: approvedSnap.size,
      userChannels: userChannelsSnap.size,
      userCampaigns: userCampaignsSnap.size
    },
    transactions: sortedTx
  });
}));

app.post('/api/user/language', authMiddleware, asyncHandler(async (req, res) => {
  const { lang } = req.body;
  if (!['ar', 'en'].includes(lang)) {
    return res.status(400).json({ success: false, message: 'Unsupported language' });
  }
  await req.userRef.update({ languageCode: lang });
  req.user.languageCode = lang;
  res.json({ success: true, languageCode: req.user.languageCode });
}));

// ================= CHANNELS ROUTES =================
app.get('/api/channels', authMiddleware, asyncHandler(async (req, res) => {
  const [myChannelsSnap, approvedChannelsSnap] = await Promise.all([
    channels.where('ownerId', '==', req.user.telegramId).get(),
    channels.where('status', '==', 'approved').get()
  ]);

  const myChannels = sortDocsDesc(myChannelsSnap.docs, 'createdAt')
    .map(doc => serializeDoc(doc));

  const marketplaceChannels = [...approvedChannelsSnap.docs]
    .sort((a, b) => Number(b.data()?.subscribers || 0) - Number(a.data()?.subscribers || 0))
    .map(doc => serializeDoc(doc));

  res.json({ success: true, myChannels, marketplaceChannels });
}));

app.post('/api/channels', authMiddleware, asyncHandler(async (req, res) => {
  const { channelUsername, title, subscribers, category, pricePerPost } = req.body;
  if (!channelUsername || !title || !pricePerPost) {
    return res.status(400).json({ success: false, message: 'Missing required fields' });
  }

  const cleanUsername = String(channelUsername).replace('@', '').trim();
  const numericPrice = Number(pricePerPost);
  if (Number.isNaN(numericPrice) || numericPrice < 0.1) {
    return res.status(400).json({ success: false, message: 'Invalid pricePerPost (minimum 0.1)' });
  }

  const existingSnap = await channels.where('channelUsername', '==', cleanUsername).limit(1).get();
  if (!existingSnap.empty) {
    return res.status(400).json({ success: false, message: 'Channel already registered' });
  }

  const newChannelRef = channels.doc();
  await newChannelRef.set({
    ownerId: req.user.telegramId,
    channelUsername: cleanUsername,
    title: String(title).trim(),
    subscribers: Number(subscribers) || 0,
    category: category || 'general',
    pricePerPost: numericPrice,
    status: 'pending',
    totalEarnings: 0,
    createdAt: new Date()
  });

  const createdSnap = await newChannelRef.get();
  const channel = serializeDoc(createdSnap);

  await logSecurityEvent(req.user.telegramId, 'CHANNEL_SUBMITTED', channel._id, `Channel @${cleanUsername} submitted`, req);
  res.json({ success: true, channel });
}));

// ================= CAMPAIGNS (PROMOTION) ROUTES =================
app.get('/api/campaigns', authMiddleware, asyncHandler(async (req, res) => {
  const userCampaignsSnap = await campaigns.where('advertiserId', '==', req.user.telegramId).get();
  const sortedDocs = sortDocsDesc(userCampaignsSnap.docs, 'createdAt');

  const uniqueChannelIds = [...new Set(
    sortedDocs
      .map(d => d.data()?.channelId)
      .filter(Boolean)
      .map(id => String(id))
  )];

  const channelMap = new Map();
  if (uniqueChannelIds.length > 0) {
    const refs = uniqueChannelIds.map(id => channels.doc(id));
    const channelSnaps = await db.getAll(...refs);
    for (const cSnap of channelSnaps) {
      if (cSnap.exists) {
        const cData = cSnap.data() || {};
        channelMap.set(cSnap.id, {
          _id: cSnap.id,
          id: cSnap.id,
          title: cData.title || '',
          channelUsername: cData.channelUsername || '',
          pricePerPost: Number(cData.pricePerPost ?? 0)
        });
      }
    }
  }

  const formattedCampaigns = sortedDocs.map(doc => {
    const rawChannelId = doc.data()?.channelId ? String(doc.data().channelId) : null;
    const populatedChannel = rawChannelId && channelMap.has(rawChannelId)
      ? channelMap.get(rawChannelId)
      : rawChannelId;

    return serializeDoc(doc, { channelId: populatedChannel });
  });

  res.json({ success: true, campaigns: formattedCampaigns });
}));

app.post('/api/campaigns', authMiddleware, asyncHandler(async (req, res) => {
  const { channelId, title, adText, targetUrl } = req.body;
  if (!channelId || !title || !adText || !targetUrl) {
    return res.status(400).json({ success: false, message: 'Missing campaign fields' });
  }

  const channelDoc = await channels.doc(String(channelId)).get();
  if (!channelDoc.exists) {
    return res.status(404).json({ success: false, message: 'Channel not available' });
  }

  const channelData = channelDoc.data() || {};
  if (channelData.status !== 'approved') {
    return res.status(404).json({ success: false, message: 'Channel not available' });
  }

  const cost = Number(channelData.pricePerPost);
  if (req.user.adBalance < cost) {
    return res.status(400).json({ success: false, message: 'Insufficient ad balance' });
  }

  const newCampaignRef = campaigns.doc();
  const newTxRef = transactions.doc();
  const now = new Date();

  await db.runTransaction(async (t) => {
    const freshUserSnap = await t.get(req.userRef);
    const freshUserData = freshUserSnap.data() || {};
    const currentAdBalance = Number(freshUserData.adBalance ?? 0);

    if (currentAdBalance < cost) {
      const err = new Error('Insufficient ad balance');
      err.statusCode = 400;
      throw err;
    }

    t.update(req.userRef, {
      adBalance: currentAdBalance - cost
    });

    t.set(newCampaignRef, {
      advertiserId: req.user.telegramId,
      channelId: channelDoc.id,
      title: String(title).trim(),
      adText: String(adText).trim(),
      targetUrl: String(targetUrl).trim(),
      budget: cost,
      status: 'pending',
      createdAt: now
    });

    t.set(newTxRef, {
      userId: req.user.telegramId,
      type: 'campaign_spend',
      amount: -cost,
      status: 'completed',
      details: `Ad campaign on @${channelData.channelUsername}`,
      createdAt: now
    });
  });

  const updatedAdBalance = Number((req.user.adBalance - cost).toFixed(4));
  const createdCampaignSnap = await newCampaignRef.get();
  const campaign = serializeDoc(createdCampaignSnap);

  await logSecurityEvent(req.user.telegramId, 'CAMPAIGN_CREATED', campaign._id, `Spent ${cost} on @${channelData.channelUsername}`, req);
  res.json({ success: true, campaign, adBalance: updatedAdBalance });
}));

// ================= WALLET ROUTES =================
app.post('/api/wallet/deposit', authMiddleware, asyncHandler(async (req, res) => {
  const amount = Number(req.body.amount);
  if (!amount || amount < 1) {
    return res.status(400).json({ success: false, message: 'Minimum deposit is 1 USD' });
  }

  const txRef = transactions.doc();
  await txRef.set({
    userId: req.user.telegramId,
    type: 'deposit',
    amount,
    status: 'pending',
    details: 'Telegram Stars / Crypto Deposit Request',
    createdAt: new Date()
  });

  const txSnap = await txRef.get();
  const tx = serializeDoc(txSnap);

  await logSecurityEvent(req.user.telegramId, 'DEPOSIT_REQUEST', tx._id, `Requested deposit of $${amount}`, req);
  res.json({ success: true, transaction: tx });
}));

app.post('/api/wallet/withdraw', authMiddleware, asyncHandler(async (req, res) => {
  const amount = Number(req.body.amount);
  const walletAddress = (req.body.walletAddress || '').trim();

  if (!amount || amount < 5 || !walletAddress) {
    return res.status(400).json({ success: false, message: 'Minimum withdrawal is $5 and wallet address is required' });
  }

  if (req.user.balance < amount) {
    return res.status(400).json({ success: false, message: 'Insufficient earnings balance' });
  }

  const txRef = transactions.doc();
  const now = new Date();

  await db.runTransaction(async (t) => {
    const freshUserSnap = await t.get(req.userRef);
    const freshUserData = freshUserSnap.data() || {};
    const currentBalance = Number(freshUserData.balance ?? 0);

    if (currentBalance < amount) {
      const err = new Error('Insufficient earnings balance');
      err.statusCode = 400;
      throw err;
    }

    t.update(req.userRef, {
      balance: currentBalance - amount
    });

    t.set(txRef, {
      userId: req.user.telegramId,
      type: 'withdrawal',
      amount: -amount,
      status: 'pending',
      details: `Withdraw to: ${walletAddress}`,
      createdAt: now
    });
  });

  const updatedBalance = Number((req.user.balance - amount).toFixed(4));
  const txSnap = await txRef.get();
  const tx = serializeDoc(txSnap);

  await logSecurityEvent(req.user.telegramId, 'WITHDRAWAL_REQUEST', tx._id, `Requested withdrawal of $${amount} to ${walletAddress}`, req);
  res.json({ success: true, balance: updatedBalance, transaction: tx });
}));

// ================= ADMIN PROTECTED ROUTES =================
app.get('/api/admin/dashboard', authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const [
    allUsersSnap,
    pendingChannelsSnap,
    pendingTxSnap,
    pendingCampaignsSnap,
    allLogsSnap
  ] = await Promise.all([
    users.get(),
    channels.where('status', '==', 'pending').get(),
    transactions.where('status', '==', 'pending').get(),
    campaigns.where('status', '==', 'pending').get(),
    securityLogs.get()
  ]);

  const pendingChannels = sortDocsDesc(pendingChannelsSnap.docs, 'createdAt')
    .map(doc => serializeDoc(doc));

  const pendingTransactions = sortDocsDesc(pendingTxSnap.docs, 'createdAt')
    .map(doc => serializeDoc(doc));

  const sortedPendingCampaignDocs = sortDocsDesc(pendingCampaignsSnap.docs, 'createdAt');
  const uniqueChannelIds = [...new Set(
    sortedPendingCampaignDocs
      .map(d => d.data()?.channelId)
      .filter(Boolean)
      .map(id => String(id))
  )];

  const channelMap = new Map();
  if (uniqueChannelIds.length > 0) {
    const refs = uniqueChannelIds.map(id => channels.doc(id));
    const channelSnaps = await db.getAll(...refs);
    for (const cSnap of channelSnaps) {
      if (cSnap.exists) {
        const cData = cSnap.data() || {};
        channelMap.set(cSnap.id, {
          _id: cSnap.id,
          id: cSnap.id,
          title: cData.title || '',
          channelUsername: cData.channelUsername || '',
          ownerId: cData.ownerId || ''
        });
      }
    }
  }

  const pendingCampaigns = sortedPendingCampaignDocs.map(doc => {
    const rawChannelId = doc.data()?.channelId ? String(doc.data().channelId) : null;
    const populatedChannel = rawChannelId && channelMap.has(rawChannelId)
      ? channelMap.get(rawChannelId)
      : rawChannelId;

    return serializeDoc(doc, { channelId: populatedChannel });
  });

  const formattedSecurityLogs = sortDocsDesc(allLogsSnap.docs, 'createdAt')
    .slice(0, 30)
    .map(doc => serializeDoc(doc));

  res.json({
    success: true,
    stats: {
      totalUsers: allUsersSnap.size,
      pendingChannelsCount: pendingChannels.length,
      pendingTransactionsCount: pendingTransactions.length,
      pendingCampaignsCount: pendingCampaigns.length
    },
    pendingChannels,
    pendingTransactions,
    pendingCampaigns,
    securityLogs: formattedSecurityLogs
  });
}));

app.post('/api/admin/channels/:id/review', authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const { action } = req.body;
  if (!['approved', 'rejected'].includes(action)) {
    return res.status(400).json({ success: false, message: 'Invalid action' });
  }

  const channelRef = channels.doc(String(req.params.id));
  const channelSnap = await channelRef.get();
  if (!channelSnap.exists) {
    return res.status(404).json({ success: false, message: 'Channel not found' });
  }

  await channelRef.update({ status: action });
  const updatedSnap = await channelRef.get();
  const channel = serializeDoc(updatedSnap);

  await logSecurityEvent(req.user.telegramId, `ADMIN_CHANNEL_${action.toUpperCase()}`, channel._id, `Channel @${channel.channelUsername} ${action}`, req);
  res.json({ success: true, channel });
}));

app.post('/api/admin/transactions/:id/review', authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const { action } = req.body;
  if (!['completed', 'rejected'].includes(action)) {
    return res.status(400).json({ success: false, message: 'Invalid action' });
  }

  const txRef = transactions.doc(String(req.params.id));
  const txSnap = await txRef.get();
  if (!txSnap.exists || txSnap.data()?.status !== 'pending') {
    return res.status(404).json({ success: false, message: 'Pending transaction not found' });
  }

  const txData = txSnap.data() || {};
  const targetUserDoc = await getUserByTelegramId(txData.userId);
  if (!targetUserDoc) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }

  await db.runTransaction(async (t) => {
    const freshTxSnap = await t.get(txRef);
    const freshTxData = freshTxSnap.data() || {};
    if (!freshTxSnap.exists || freshTxData.status !== 'pending') {
      const err = new Error('Pending transaction not found');
      err.statusCode = 404;
      throw err;
    }

    const freshUserSnap = await t.get(targetUserDoc.ref);
    const freshUserData = freshUserSnap.data() || {};
    const txAmount = Number(freshTxData.amount || 0);

    if (freshTxData.type === 'deposit' && action === 'completed') {
      t.update(targetUserDoc.ref, {
        adBalance: Number(freshUserData.adBalance ?? 0) + txAmount
      });
    } else if (freshTxData.type === 'withdrawal' && action === 'rejected') {
      t.update(targetUserDoc.ref, {
        balance: Number(freshUserData.balance ?? 0) + Math.abs(txAmount)
      });
    }

    t.update(txRef, { status: action });
  });

  const updatedTxSnap = await txRef.get();
  const transaction = serializeDoc(updatedTxSnap);

  await logSecurityEvent(req.user.telegramId, `ADMIN_TX_${action.toUpperCase()}`, transaction._id, `Transaction ${transaction.type} ($${transaction.amount}) marked ${action}`, req);
  res.json({ success: true, transaction });
}));

app.post('/api/admin/campaigns/:id/complete', authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const campaignRef = campaigns.doc(String(req.params.id));
  const campaignSnap = await campaignRef.get();
  if (!campaignSnap.exists || campaignSnap.data()?.status !== 'pending') {
    return res.status(404).json({ success: false, message: 'Pending campaign not found' });
  }

  const campaignData = campaignSnap.data() || {};
  const channelIdStr = campaignData.channelId ? String(campaignData.channelId) : '';
  const channelDoc = channelIdStr ? await channels.doc(channelIdStr).get() : null;
  if (!channelDoc || !channelDoc.exists) {
    return res.status(404).json({ success: false, message: 'Associated channel not found' });
  }

  const channelData = channelDoc.data() || {};
  const ownerIdStr = String(channelData.ownerId || '');
  const ownerDoc = ownerIdStr ? await getUserByTelegramId(ownerIdStr) : null;

  let referrerDoc = null;
  let bonus = 0;
  if (ownerDoc) {
    const ownerData = ownerDoc.data() || {};
    if (ownerData.referredBy) {
      const rate = Number(process.env.REFERRAL_COMMISSION_RATE) || 0.05;
      bonus = Number((Number(campaignData.budget || 0) * rate).toFixed(2));
      if (bonus > 0) {
        referrerDoc = await getUserByTelegramId(String(ownerData.referredBy));
      }
    }
  }

  const now = new Date();
  const earnTxRef = transactions.doc();
  const refTxRef = transactions.doc();

  await db.runTransaction(async (t) => {
    const freshCampSnap = await t.get(campaignRef);
    const freshCampData = freshCampSnap.data() || {};
    if (!freshCampSnap.exists || freshCampData.status !== 'pending') {
      const err = new Error('Pending campaign not found');
      err.statusCode = 404;
      throw err;
    }

    const budget = Number(freshCampData.budget || 0);
    t.update(campaignRef, { status: 'completed' });

    if (ownerDoc) {
      const freshOwnerSnap = await t.get(ownerDoc.ref);
      const freshOwnerData = freshOwnerSnap.data() || {};
      t.update(ownerDoc.ref, {
        balance: Number(freshOwnerData.balance ?? 0) + budget
      });

      t.set(earnTxRef, {
        userId: String(freshOwnerData.telegramId || ownerDoc.id),
        type: 'channel_earn',
        amount: budget,
        status: 'completed',
        details: `Ad completed on @${channelData.channelUsername}`,
        createdAt: now
      });

      if (referrerDoc && bonus > 0) {
        const freshRefSnap = await t.get(referrerDoc.ref);
        const freshRefData = freshRefSnap.data() || {};
        t.update(referrerDoc.ref, {
          balance: Number(freshRefData.balance ?? 0) + bonus,
          referralEarnings: Number(freshRefData.referralEarnings ?? 0) + bonus
        });

        t.set(refTxRef, {
          userId: String(freshRefData.telegramId || referrerDoc.id),
          type: 'referral_bonus',
          amount: bonus,
          status: 'completed',
          details: `Referral commission from user ${String(freshOwnerData.telegramId || ownerDoc.id)}`,
          createdAt: now
        });
      }
    }
  });

  const updatedCampSnap = await campaignRef.get();
  const campaign = serializeDoc(updatedCampSnap, {
    channelId: {
      _id: channelDoc.id,
      id: channelDoc.id,
      title: channelData.title || '',
      channelUsername: channelData.channelUsername || '',
      ownerId: channelData.ownerId || ''
    }
  });

  await logSecurityEvent(req.user.telegramId, 'ADMIN_CAMPAIGN_COMPLETED', campaign._id, `Campaign completed & funds released`, req);
  res.json({ success: true, campaign });
}));

app.use((err, req, res, next) => {
  console.error('Server Error:', err);
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    message: err.message || 'Internal Server Error'
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Telega-Ads running on port ${PORT}`);
  });
}

module.exports = app;
