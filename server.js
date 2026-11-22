'use strict';

require('dotenv').config();
const path = require('path');
const crypto = require('crypto');
const cors = require('cors');
const helmet = require('helmet');
const express = require('express');
const admin = require('firebase-admin');

const models = require('./models');
const {
  db,
  users,
  channels,
  campaigns,
  transactions,
  securityLogs,
} = models;

const app = express();
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN || '';
const BOT_USERNAME = (process.env.BOT_USERNAME || 'adTelega_bot').replace(/^@/, '');
const MINI_APP_URL = process.env.MINI_APP_URL || 'https://teleg-ads.vercel.app';
const ADMIN_IDS = String(process.env.ADMIN_TELEGRAM_IDS || process.env.ADMIN_IDS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

models.initFirestore();

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);
app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Verify Firestore connectivity on startup without blocking serverless requests
db.listCollections()
  .then(() => console.log('Connected to Firebase Cloud Firestore'))
  .catch((err) => console.error('Firestore connection check error:', err));

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
    ...extraFields,
  };
  if (obj.createdAt !== undefined) obj.createdAt = toIsoString(obj.createdAt);
  if (obj.updatedAt !== undefined) obj.updatedAt = toIsoString(obj.updatedAt);
  if (obj.lastActive !== undefined) obj.lastActive = toIsoString(obj.lastActive);
  return obj;
};

const serializeUser = (docSnap) => {
  if (!docSnap || !docSnap.exists) return null;
  const d = docSnap.data() || {};
  const telegramId = String(d.telegramId || docSnap.id);
  return {
    _id: docSnap.id,
    id: docSnap.id,
    telegramId,
    username: d.username || '',
    firstName: d.firstName || '',
    lastName: d.lastName || '',
    languageCode: d.languageCode || 'en',
    balance: Number(d.balance ?? 0),
    adBalance: Number(d.adBalance ?? 0),
    referralEarnings: Number(d.referralEarnings ?? 0),
    referredBy: d.referredBy ?? null,
    referralsCount: Number(d.referralsCount ?? d.referralCount ?? 0),
    referralCount: Number(d.referralCount ?? d.referralsCount ?? 0),
    isAdmin: Boolean(d.isAdmin) || ADMIN_IDS.includes(telegramId),
    isBanned: Boolean(d.isBanned),
    createdAt: toIsoString(d.createdAt),
    lastActive: toIsoString(d.lastActive || d.updatedAt),
  };
};

const sortDocsDesc = (docs, field = 'createdAt') => {
  return [...docs].sort((a, b) => {
    const aTime = new Date(toIsoString(a.data()?.[field])).getTime() || 0;
    const bTime = new Date(toIsoString(b.data()?.[field])).getTime() || 0;
    return bTime - aTime;
  });
};

const recordAuditLog = async (actorId, action, targetId, details, req) => {
  try {
    const ip = req?.headers?.['x-forwarded-for'] || req?.socket?.remoteAddress || req?.ip || '';
    const payload = {
      actorId: String(actorId),
      action: String(action),
      targetId: String(targetId || ''),
      details: String(details || ''),
      ip: String(ip),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    await Promise.all([
      securityLogs.add(payload),
      models.logSecurityEvent(action, {
        actorId: String(actorId),
        targetId: String(targetId || ''),
        details: String(details || ''),
        ip: String(ip),
      }),
    ]);
  } catch (error) {
    console.error('Security log error:', error);
  }
};

function parseInitData(initDataRaw) {
  if (!initDataRaw || typeof initDataRaw !== 'string' || !BOT_TOKEN) {
    return null;
  }
  try {
    const params = new URLSearchParams(initDataRaw);
    const hash = params.get('hash');
    if (!hash) {
      return null;
    }

    params.delete('hash');
    const keys = Array.from(params.keys()).sort();
    const dataCheckString = keys.map((k) => `${k}=${params.get(k)}`).join('\n');

    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
    const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    if (computedHash !== hash) {
      return null;
    }

    const userStr = params.get('user');
    let user = null;
    if (userStr) {
      user = JSON.parse(userStr);
    }

    return {
      user,
      startParam: params.get('start_param') || null,
      authDate: Number(params.get('auth_date') || 0),
    };
  } catch (err) {
    return null;
  }
}

const verifyTelegramWebAppData = (telegramInitData) => {
  const parsed = parseInitData(telegramInitData);
  if (!parsed || !parsed.user || !parsed.user.id) return null;
  return {
    user: parsed.user,
    startParam: parsed.startParam,
    authDate: parsed.authDate,
  };
};

const getUserByTelegramId = async (telegramId) => {
  const idStr = String(telegramId);
  const directDoc = await users.doc(idStr).get();
  if (directDoc.exists) return directDoc;

  const snap = await users.where('telegramId', '==', idStr).limit(1).get();
  if (!snap.empty) return snap.docs[0];
  return null;
};

function authenticateUser(req, res, next) {
  const initDataHeader =
    req.headers['x-telegram-init-data'] || req.body?.initData || req.query?.initData;
  const verified = parseInitData(initDataHeader);

  if (verified && verified.user && verified.user.id) {
    req.telegramUser = verified.user;
    req.startParam = verified.startParam;
    return next();
  }

  if (process.env.ALLOW_DEV_USER_HEADER === 'true' && req.headers['x-dev-user-id']) {
    req.telegramUser = {
      id: String(req.headers['x-dev-user-id']),
      username: req.headers['x-dev-username'] || 'dev_user',
      first_name: req.headers['x-dev-first-name'] || 'Developer',
      language_code: req.headers['x-dev-language'] || 'ar',
    };
    req.startParam = req.headers['x-dev-start-param'] || null;
    return next();
  }

  models.logSecurityEvent('UNAUTHORIZED_API_ACCESS', {
    path: req.originalUrl,
    ip: req.ip,
  });

  return res.status(401).json({
    ok: false,
    success: false,
    error: 'UNAUTHORIZED_TELEGRAM_SESSION',
    message: 'Invalid or missing Telegram WebApp authentication data',
  });
}

function requireAdmin(req, res, next) {
  const uid = req.telegramUser
    ? String(req.telegramUser.id)
    : req.user
    ? String(req.user.telegramId)
    : '';

  if (!uid || !ADMIN_IDS.includes(uid)) {
    models.logSecurityEvent('FORBIDDEN_ADMIN_ACCESS', {
      userId: uid || 'unknown',
      path: req.originalUrl,
    });
    return res.status(403).json({
      ok: false,
      success: false,
      error: 'ADMIN_ACCESS_REQUIRED',
      message: 'Admin privileges are required for this action',
    });
  }
  return next();
}

const authMiddleware = asyncHandler(async (req, res, next) => {
  const initData =
    req.headers['x-telegram-init-data'] || req.body?.initData || req.query?.initData;
  let verified = verifyTelegramWebAppData(initData);

  if ((!verified || !verified.user || !verified.user.id) &&
      process.env.ALLOW_DEV_USER_HEADER === 'true' &&
      req.headers['x-dev-user-id']) {
    verified = {
      user: {
        id: String(req.headers['x-dev-user-id']),
        username: req.headers['x-dev-username'] || 'dev_user',
        first_name: req.headers['x-dev-first-name'] || 'Developer',
        last_name: req.headers['x-dev-last-name'] || '',
        language_code: req.headers['x-dev-language'] || 'ar',
      },
      startParam: req.headers['x-dev-start-param'] || null,
    };
  }

  if (!verified || !verified.user || !verified.user.id) {
    await recordAuditLog(
      'unknown',
      'UNAUTHORIZED_ACCESS_ATTEMPT',
      req.originalUrl,
      'Invalid or missing initData',
      req
    );
    return res.status(401).json({
      ok: false,
      success: false,
      error: 'UNAUTHORIZED_TELEGRAM_SESSION',
      message: 'Unauthorized Telegram Session',
    });
  }

  const tgUser = verified.user;
  const telegramId = String(tgUser.id);
  const isAdmin = ADMIN_IDS.includes(telegramId);

  req.telegramUser = tgUser;
  req.startParam = verified.startParam;

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
            referralsCount: admin.firestore.FieldValue.increment(1),
            referralCount: admin.firestore.FieldValue.increment(1),
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
      referralCount: 0,
      isAdmin,
      isBanned: false,
      createdAt: now,
      lastActive: now,
    });
    userDoc = await userRef.get();
  } else {
    const existingData = userDoc.data() || {};
    await userDoc.ref.update({
      username: tgUser.username || existingData.username || '',
      firstName: tgUser.first_name || existingData.firstName || '',
      lastName: tgUser.last_name || existingData.lastName || '',
      isAdmin,
      lastActive: new Date(),
    });
    userDoc = await userDoc.ref.get();
  }

  const serialized = serializeUser(userDoc);

  if (serialized.isBanned) {
    return res.status(403).json({
      ok: false,
      success: false,
      message: 'Account Suspended',
    });
  }

  req.user = serialized;
  req.userRef = userDoc.ref;
  return next();
});

const adminMiddleware = asyncHandler(async (req, res, next) => {
  const actorId = req.user
    ? req.user.telegramId
    : req.telegramUser
    ? String(req.telegramUser.id)
    : 'unknown';

  if (!ADMIN_IDS.includes(String(actorId)) || (req.user && !req.user.isAdmin)) {
    await recordAuditLog(
      actorId,
      'ADMIN_PRIVILEGE_ESCALATION_ATTEMPT',
      req.originalUrl,
      'Non-admin user attempted to access admin route',
      req
    );
    return res.status(403).json({
      ok: false,
      success: false,
      message: 'Access Denied: Admin Privileges Required',
    });
  }
  return next();
});

async function callTelegramApi(method, payload = {}) {
  if (!BOT_TOKEN) {
    throw new Error('TELEGRAM_BOT_TOKEN_NOT_CONFIGURED');
  }
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/${method}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!data.ok) {
    const err = new Error(data.description || `TELEGRAM_API_${method}_FAILED`);
    err.telegramError = data;
    throw err;
  }
  return data.result;
}

function parseChannelIdentifier(channelInput) {
  const raw = String(channelInput || '').trim();
  if (!raw) {
    return null;
  }

  if (/^-100\d+$/.test(raw) || /^-?\d+$/.test(raw)) {
    return { chatId: raw, username: '' };
  }

  const tmeMatch = raw.match(
    /(?:https?:\/\/)?(?:t\.me|telegram\.me|telegram\.dog)\/([A-Za-z0-9_]{4,})/i
  );
  if (tmeMatch && tmeMatch[1]) {
    const slug = tmeMatch[1];
    if (slug.startsWith('+') || slug.toLowerCase() === 'joinchat') {
      return {
        inviteLink: raw.startsWith('http') ? raw : `https://${raw}`,
        chatId: null,
        username: '',
      };
    }
    return { chatId: `@${slug}`, username: slug };
  }

  const cleanUsername = raw.replace(/^@/, '');
  if (/^[A-Za-z0-9_]{4,}$/.test(cleanUsername)) {
    return { chatId: `@${cleanUsername}`, username: cleanUsername };
  }

  return null;
}

function buildPublisherReferralUrl(publisherUserId) {
  const cleanUserId = encodeURIComponent(String(publisherUserId));
  return `https://t.me/${BOT_USERNAME}?start=ref_${cleanUserId}`;
}

function buildPromoMessageText() {
  return [
    '✨ إعلانك يصل بدقة، وقناتك تكسب بدون تعقيد.',
    'أطلق حملتك أو حقق الدخل من قناتك مع تتبع لحظي وعوائد إحالة مستمرة ⚡',
  ].join('\n');
}

async function publishChannelVerificationPromo(channelChatId, publisherUserId) {
  const refUrl = buildPublisherReferralUrl(publisherUserId);
  const result = await callTelegramApi('sendMessage', {
    chat_id: channelChatId,
    text: buildPromoMessageText(),
    protect_content: true,
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: 'Open ←',
            url: refUrl,
          },
        ],
      ],
    },
  });
  return result;
}

function buildCampaignFinalText(campaign, publisherUserId) {
  const refUrl = buildPublisherReferralUrl(publisherUserId);
  const baseText = String(campaign.text || campaign.adText || '').trim();
  const attributionLine = `📢 عبر منصة [Telega.ads](${refUrl})`;
  return baseText ? `${baseText}\n\n${attributionLine}` : attributionLine;
}

function buildCampaignReplyMarkup(campaign, publisherUserId, channelId) {
  const refUrl = buildPublisherReferralUrl(publisherUserId);
  const rows = [];

  if (campaign.ctaButton && campaign.ctaButton.label && campaign.ctaButton.url) {
    rows.push([
      {
        text: String(campaign.ctaButton.label).slice(0, 64),
        url: campaign.ctaButton.url,
      },
    ]);
  } else if (campaign.targetUrl) {
    rows.push([
      {
        text: 'Open',
        url: campaign.targetUrl,
      },
    ]);
  }

  rows.push([
    {
      text: '⚡ Telega.ads',
      url: refUrl,
    },
  ]);

  return { inline_keyboard: rows };
}

async function deliverCampaignToChannel(campaign, channel) {
  const existingPost = await models.getCampaignPost(campaign.campaignId, channel.chatId);
  if (existingPost && existingPost.status === 'published') {
    return { skipped: true, reason: 'ALREADY_PUBLISHED' };
  }

  const postCost = Number(channel.price ?? channel.pricePerPost ?? models.MIN_PRICE);
  const advertiser = await models.getUserById(campaign.advertiserId);
  const availableBudget = Number(advertiser?.adBalance || 0) + Number(advertiser?.balance || 0);

  if (!advertiser || availableBudget < postCost) {
    await models.updateCampaignStatus(campaign.campaignId, 'paused', {
      pauseReason: 'INSUFFICIENT_BALANCE',
    });
    return { paused: true, reason: 'INSUFFICIENT_BALANCE' };
  }

  let balanceSource = 'balance';
  if (Number(advertiser.adBalance || 0) >= postCost) {
    balanceSource = 'adBalance';
    await db.runTransaction(async (t) => {
      const uRef = users.doc(String(campaign.advertiserId));
      const snap = await t.get(uRef);
      const curr = Number(snap.data()?.adBalance || 0);
      if (curr < postCost) {
        throw new Error('INSUFFICIENT_BALANCE');
      }
      t.update(uRef, {
        adBalance: Number((curr - postCost).toFixed(4)),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });
  } else {
    await models.adjustUserBalance(campaign.advertiserId, -postCost, {
      recordTx: true,
      type: 'campaign_spend',
      meta: { campaignId: campaign.campaignId, channelId: channel.chatId },
    });
  }

  const formattedText = buildCampaignFinalText(campaign, channel.ownerId);
  const replyMarkup = buildCampaignReplyMarkup(campaign, channel.ownerId, channel.chatId);

  try {
    let sentMessage = null;
    const mediaSource = campaign.mediaFileId || campaign.mediaUrl;

    if (campaign.mediaType === 'photo' && mediaSource) {
      sentMessage = await callTelegramApi('sendPhoto', {
        chat_id: channel.chatId,
        photo: mediaSource,
        caption: formattedText,
        parse_mode: 'Markdown',
        protect_content: true,
        reply_markup: replyMarkup,
      });
    } else if (campaign.mediaType === 'video' && mediaSource) {
      sentMessage = await callTelegramApi('sendVideo', {
        chat_id: channel.chatId,
        video: mediaSource,
        caption: formattedText,
        parse_mode: 'Markdown',
        protect_content: true,
        reply_markup: replyMarkup,
      });
    } else {
      sentMessage = await callTelegramApi('sendMessage', {
        chat_id: channel.chatId,
        text: formattedText,
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
        protect_content: true,
        reply_markup: replyMarkup,
      });
    }

    await models.recordCampaignPost({
      campaignId: campaign.campaignId,
      channelId: channel.chatId,
      publisherId: channel.ownerId,
      messageId: sentMessage.message_id,
      cost: postCost,
      status: 'published',
      publishedAt: new Date().toISOString(),
    });

    await models.incrementCampaignStats(campaign.campaignId, {
      publishedCount: 1,
      budgetSpent: postCost,
    });

    return { published: true, messageId: sentMessage.message_id, cost: postCost };
  } catch (err) {
    if (balanceSource === 'adBalance') {
      await db.runTransaction(async (t) => {
        const uRef = users.doc(String(campaign.advertiserId));
        const snap = await t.get(uRef);
        const curr = Number(snap.data()?.adBalance || 0);
        t.update(uRef, {
          adBalance: Number((curr + postCost).toFixed(4)),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });
    } else {
      await models.adjustUserBalance(campaign.advertiserId, postCost, {
        recordTx: true,
        type: 'campaign_refund',
        meta: { campaignId: campaign.campaignId, channelId: channel.chatId, reason: err.message },
      });
    }

    await models.recordCampaignPost({
      campaignId: campaign.campaignId,
      channelId: channel.chatId,
      publisherId: channel.ownerId,
      cost: postCost,
      status: 'failed',
      error: err.message,
    });

    await models.incrementCampaignStats(campaign.campaignId, {
      failedCount: 1,
    });

    return { published: false, error: err.message };
  }
}

async function runCampaignDispatch(campaign) {
  const currentCampaign = await models.getCampaignById(campaign.campaignId);
  if (!currentCampaign || !['active', 'scheduled'].includes(currentCampaign.status)) {
    return { status: currentCampaign ? currentCampaign.status : 'missing', results: [] };
  }

  if (currentCampaign.status === 'scheduled') {
    await models.updateCampaignStatus(currentCampaign.campaignId, 'active');
  }

  const matchedChannels = await models.getMatchingApprovedChannels(currentCampaign.targeting);
  const results = [];

  for (const ch of matchedChannels) {
    const latestCamp = await models.getCampaignById(currentCampaign.campaignId);
    if (!latestCamp || latestCamp.status !== 'active') {
      break;
    }
    const res = await deliverCampaignToChannel(latestCamp, ch);
    results.push({ channelId: ch.chatId, ...res });
    if (res.paused) {
      break;
    }
  }

  const finalCamp = await models.getCampaignById(currentCampaign.campaignId);
  return { status: finalCamp.status, results };
}

async function refreshChannelLiveMetrics(chatId) {
  const existing = await models.getChannelById(chatId);
  if (!existing) {
    return null;
  }

  const chatInfo = await callTelegramApi('getChat', { chat_id: existing.chatId });
  const subscribersCount = await callTelegramApi('getChatMemberCount', { chat_id: existing.chatId });

  let botIsAdmin = false;
  try {
    const me = await callTelegramApi('getMe');
    const member = await callTelegramApi('getChatMember', {
      chat_id: existing.chatId,
      user_id: me.id,
    });
    botIsAdmin = ['administrator', 'creator'].includes(member.status);
  } catch (err) {
    botIsAdmin = false;
  }

  return models.syncChannelSmartMetadata(existing.chatId, {
    title: chatInfo.title || existing.title,
    username: chatInfo.username || existing.username || '',
    subscribersCount: Number(subscribersCount ?? existing.subscribersCount ?? 0),
    botIsAdmin,
  });
}

function extractReferralFromStartParam(startParam) {
  if (!startParam || typeof startParam !== 'string') {
    return null;
  }
  const match = startParam.match(/^ref_(.+)$/);
  return match ? match[1] : null;
}

// ================= HEALTH & CONFIG ROUTES =================
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    success: true,
    botUsername: BOT_USERNAME,
    miniAppUrl: MINI_APP_URL,
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/config', (req, res) => {
  res.json({
    ok: true,
    success: true,
    botUsername: BOT_USERNAME,
    botLink: `https://t.me/${BOT_USERNAME}`,
    minPrice: models.MIN_PRICE,
    maxPrice: models.MAX_PRICE,
    autoApproveThreshold: models.AUTO_APPROVE_SUBSCRIBERS_THRESHOLD,
    languages: models.SUPPORTED_LANGUAGES,
    categories: models.SUPPORTED_CATEGORIES,
  });
});

// ================= SESSION & USER ROUTES =================
app.post(
  '/api/session',
  authenticateUser,
  asyncHandler(async (req, res) => {
    const refCode =
      extractReferralFromStartParam(req.startParam) || req.body?.referralCode || null;
    const user = await models.getOrCreateUser(req.telegramUser, refCode);
    const isAdmin = ADMIN_IDS.includes(String(user.id));

    return res.json({
      ok: true,
      success: true,
      user,
      isAdmin,
      referralLink: buildPublisherReferralUrl(user.id),
    });
  })
);

app.get(
  '/api/me',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const [approvedSnap, userChannelsSnap, userCampaignsSnap, userTxSnap] = await Promise.all([
      channels.where('status', '==', 'approved').get(),
      channels.where('ownerId', '==', req.user.telegramId).get(),
      campaigns.where('advertiserId', '==', req.user.telegramId).get(),
      transactions.where('userId', '==', req.user.telegramId).get(),
    ]);

    const sortedTx = sortDocsDesc(userTxSnap.docs, 'createdAt')
      .slice(0, 10)
      .map((doc) => serializeDoc(doc));

    return res.json({
      ok: true,
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
        isAdmin: req.user.isAdmin,
      },
      referralLink: buildPublisherReferralUrl(req.user.telegramId),
      stats: {
        activeChannels: approvedSnap.size,
        userChannels: userChannelsSnap.size,
        userCampaigns: userCampaignsSnap.size,
      },
      transactions: sortedTx,
    });
  })
);

app.post(
  '/api/user/language',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { lang } = req.body;
    const isSupported =
      ['ar', 'en'].includes(lang) ||
      models.SUPPORTED_LANGUAGES.some((item) => item.code === lang);

    if (!isSupported) {
      return res.status(400).json({
        ok: false,
        success: false,
        message: 'Unsupported language',
      });
    }

    await req.userRef.update({ languageCode: lang });
    req.user.languageCode = lang;
    return res.json({
      ok: true,
      success: true,
      languageCode: req.user.languageCode,
    });
  })
);

// ================= CHANNELS ROUTES =================
app.post(
  '/api/channels/verify',
  authenticateUser,
  asyncHandler(async (req, res) => {
    const { channelInput } = req.body;
    const parsed = parseChannelIdentifier(channelInput);
    if (!parsed || !parsed.chatId) {
      return res.status(400).json({
        ok: false,
        success: false,
        error: 'INVALID_CHANNEL_IDENTIFIER',
        message: 'يرجى إدخال رابط قناة عام صحيح أو معرف @username أو رقم القناة',
      });
    }

    const chatInfo = await callTelegramApi('getChat', { chat_id: parsed.chatId });
    if (!['channel', 'supergroup'].includes(chatInfo.type)) {
      return res.status(400).json({
        ok: false,
        success: false,
        error: 'NOT_A_CHANNEL',
        message: 'الرابط المدخل لا يمثل قناة تليجرام',
      });
    }

    const me = await callTelegramApi('getMe');
    const botMember = await callTelegramApi('getChatMember', {
      chat_id: chatInfo.id,
      user_id: me.id,
    });

    const isAdmin = ['administrator', 'creator'].includes(botMember.status);
    const canPostMessages =
      botMember.status === 'creator' || Boolean(botMember.can_post_messages);

    if (!isAdmin || !canPostMessages) {
      return res.status(400).json({
        ok: false,
        success: false,
        error: 'BOT_MISSING_ADMIN_PERMISSIONS',
        message: `يجب إضافة البوت @${BOT_USERNAME} كمشرف في القناة ومنحه صلاحية نشر الرسائل`,
      });
    }

    const subscribersCount = Number(
      await callTelegramApi('getChatMemberCount', { chat_id: chatInfo.id })
    );

    return res.json({
      ok: true,
      success: true,
      verified: true,
      channel: {
        chatId: String(chatInfo.id),
        title: chatInfo.title,
        username: chatInfo.username || parsed.username || '',
        subscribersCount,
        botIsAdmin: true,
        autoApproveEligible: subscribersCount > models.AUTO_APPROVE_SUBSCRIBERS_THRESHOLD,
      },
    });
  })
);

app.post(
  '/api/channels',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const ownerId = String(req.telegramUser.id);
    const { channelInput, price, language, category } = req.body;

    const numericPrice = Number(price);
    if (
      Number.isNaN(numericPrice) ||
      numericPrice < models.MIN_PRICE ||
      numericPrice > models.MAX_PRICE
    ) {
      return res.status(400).json({
        ok: false,
        success: false,
        error: 'INVALID_PRICE_RANGE',
        message: `سعر القناة يجب أن يكون بين ${models.MIN_PRICE}$ و ${models.MAX_PRICE}$`,
      });
    }

    const validLang = models.SUPPORTED_LANGUAGES.some((l) => l.code === language);
    if (!validLang) {
      return res.status(400).json({
        ok: false,
        success: false,
        error: 'INVALID_LANGUAGE',
        message: 'يرجى اختيار لغة صحيحة للقناة',
      });
    }

    if (!models.SUPPORTED_CATEGORIES.includes(category)) {
      return res.status(400).json({
        ok: false,
        success: false,
        error: 'INVALID_CATEGORY',
        message: 'يرجى اختيار تصنيف صحيح للقناة',
      });
    }

    const parsed = parseChannelIdentifier(channelInput);
    if (!parsed || !parsed.chatId) {
      return res.status(400).json({
        ok: false,
        success: false,
        error: 'INVALID_CHANNEL_IDENTIFIER',
        message: 'يرجى إدخال رابط أو معرف قناة صحيح',
      });
    }

    const chatInfo = await callTelegramApi('getChat', { chat_id: parsed.chatId });
    const me = await callTelegramApi('getMe');
    const botMember = await callTelegramApi('getChatMember', {
      chat_id: chatInfo.id,
      user_id: me.id,
    });

    const isAdmin = ['administrator', 'creator'].includes(botMember.status);
    const canPostMessages =
      botMember.status === 'creator' || Boolean(botMember.can_post_messages);

    if (!isAdmin || !canPostMessages) {
      return res.status(400).json({
        ok: false,
        success: false,
        error: 'BOT_NOT_ADMIN',
        message: `تأكد من إضافة @${BOT_USERNAME} كمشرف مع صلاحية نشر الرسائل ثم أعد التحقق`,
      });
    }

    const subscribersCount = Number(
      await callTelegramApi('getChatMemberCount', { chat_id: chatInfo.id })
    );

    const isAboveThreshold = subscribersCount > models.AUTO_APPROVE_SUBSCRIBERS_THRESHOLD;
    const status = isAboveThreshold ? 'approved' : 'pending_admin';

    let promoMessageId = null;
    let promoPostPublished = false;

    if (isAboveThreshold) {
      const sentPromo = await publishChannelVerificationPromo(chatInfo.id, ownerId);
      promoMessageId = sentPromo.message_id;
      promoPostPublished = true;
    }

    const savedChannel = await models.upsertChannel({
      chatId: String(chatInfo.id),
      ownerId,
      title: chatInfo.title,
      username: chatInfo.username || parsed.username || '',
      subscribersCount,
      price: numericPrice,
      language,
      category,
      status,
      promoPostPublished,
      promoMessageId,
      botIsAdmin: true,
    });

    await recordAuditLog(
      ownerId,
      'CHANNEL_SUBMITTED',
      savedChannel.chatId,
      `Channel ${savedChannel.title} (${savedChannel.chatId}) saved with status ${status}`,
      req
    );

    return res.status(201).json({
      ok: true,
      success: true,
      channel: savedChannel,
      autoApproved: isAboveThreshold,
    });
  })
);

app.get(
  '/api/channels',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const ownerId = String(req.telegramUser.id);
    const [myChannelsList, approvedChannelsSnap] = await Promise.all([
      models.getChannelsByOwner(ownerId),
      channels.where('status', '==', 'approved').get(),
    ]);

    const marketplaceChannels = [...approvedChannelsSnap.docs]
      .sort(
        (a, b) =>
          Number(b.data()?.subscribersCount ?? b.data()?.subscribers ?? 0) -
          Number(a.data()?.subscribersCount ?? a.data()?.subscribers ?? 0)
      )
      .map((doc) => serializeDoc(doc));

    return res.json({
      ok: true,
      success: true,
      channels: myChannelsList,
      myChannels: myChannelsList,
      marketplaceChannels,
    });
  })
);

app.post(
  '/api/channels/:chatId/sync',
  authenticateUser,
  asyncHandler(async (req, res) => {
    const ownerId = String(req.telegramUser.id);
    const existing = await models.getChannelById(req.params.chatId);
    if (!existing) {
      return res.status(404).json({ ok: false, success: false, error: 'CHANNEL_NOT_FOUND' });
    }
    if (existing.ownerId !== ownerId && !ADMIN_IDS.includes(ownerId)) {
      return res
        .status(403)
        .json({ ok: false, success: false, error: 'FORBIDDEN_CHANNEL_ACCESS' });
    }

    const synced = await refreshChannelLiveMetrics(existing.chatId);
    return res.json({
      ok: true,
      success: true,
      channel: synced,
    });
  })
);

// ================= CAMPAIGNS (PROMOTION) ROUTES =================
app.post(
  '/api/campaigns',
  authenticateUser,
  asyncHandler(async (req, res) => {
    const advertiserId = String(req.telegramUser.id);
    const {
      title,
      text,
      adText,
      mediaType,
      mediaUrl,
      mediaFileId,
      targeting = {},
      ctaButton = {},
      targetUrl,
      scheduleType = 'immediate',
      scheduledAt = null,
      budgetAllocated = 0,
      publishNow = true,
    } = req.body;

    const finalText = String(text || adText || '').trim();

    if (!title || !String(title).trim()) {
      return res.status(400).json({
        ok: false,
        success: false,
        error: 'CAMPAIGN_TITLE_REQUIRED',
        message: 'عنوان الحملة مطلوب',
      });
    }

    if (!finalText && !mediaUrl && !mediaFileId) {
      return res.status(400).json({
        ok: false,
        success: false,
        error: 'CAMPAIGN_CONTENT_REQUIRED',
        message: 'يجب إدخال نص المنشور الإعلاني أو إرفاق صورة/فيديو',
      });
    }

    const minPrice = Number(targeting.minPrice ?? models.MIN_PRICE);
    const maxPrice = Number(targeting.maxPrice ?? models.MAX_PRICE);
    if (
      Number.isNaN(minPrice) ||
      Number.isNaN(maxPrice) ||
      minPrice < models.MIN_PRICE ||
      maxPrice > models.MAX_PRICE ||
      minPrice > maxPrice
    ) {
      return res.status(400).json({
        ok: false,
        success: false,
        error: 'INVALID_TARGET_PRICE_RANGE',
        message: `نطاق السعر المستهدف يجب أن يكون بين ${models.MIN_PRICE}$ و ${models.MAX_PRICE}$`,
      });
    }

    const resolvedCtaUrl = (ctaButton && ctaButton.url) || targetUrl || '';
    if (resolvedCtaUrl) {
      const urlStr = String(resolvedCtaUrl).trim();
      if (!/^https?:\/\/.+/i.test(urlStr)) {
        return res.status(400).json({
          ok: false,
          success: false,
          error: 'INVALID_CTA_URL',
          message: 'رابط الزر التفاعلي يجب أن يبدأ بـ http:// أو https://',
        });
      }
    }

    const initialStatus = scheduleType === 'scheduled' ? 'scheduled' : 'active';

    const campaign = await models.createCampaign({
      advertiserId,
      title: String(title).trim(),
      text: finalText,
      mediaType: mediaType || 'none',
      mediaUrl: mediaUrl || null,
      mediaFileId: mediaFileId || null,
      targeting: {
        openTargeting: Boolean(targeting.openTargeting),
        minPrice,
        maxPrice,
        language: targeting.language || null,
        category: targeting.category || null,
      },
      ctaButton: {
        type: (ctaButton && ctaButton.type) || 'custom',
        label: (ctaButton && ctaButton.label) || 'Open',
        url: resolvedCtaUrl || buildPublisherReferralUrl(advertiserId),
      },
      scheduleType,
      scheduledAt: scheduleType === 'scheduled' ? scheduledAt : null,
      status: initialStatus,
      budgetAllocated: Number(budgetAllocated || 0),
    });

    let dispatchSummary = null;
    if (initialStatus === 'active' && publishNow !== false) {
      dispatchSummary = await runCampaignDispatch(campaign);
    }

    const refreshedCampaign = await models.getCampaignById(campaign.campaignId);

    await recordAuditLog(
      advertiserId,
      'CAMPAIGN_CREATED',
      refreshedCampaign.campaignId,
      `Created campaign ${refreshedCampaign.title}`,
      req
    );

    return res.status(201).json({
      ok: true,
      success: true,
      campaign: refreshedCampaign,
      dispatch: dispatchSummary,
    });
  })
);

app.get(
  '/api/campaigns',
  authenticateUser,
  asyncHandler(async (req, res) => {
    const advertiserId = String(req.telegramUser.id);
    const userCampaigns = await models.getCampaignsByAdvertiser(advertiserId);
    return res.json({
      ok: true,
      success: true,
      campaigns: userCampaigns,
    });
  })
);

app.post(
  '/api/campaigns/:campaignId/resume',
  authenticateUser,
  asyncHandler(async (req, res) => {
    const userId = String(req.telegramUser.id);
    const campaign = await models.getCampaignById(req.params.campaignId);

    if (!campaign) {
      return res
        .status(404)
        .json({ ok: false, success: false, error: 'CAMPAIGN_NOT_FOUND' });
    }
    if (campaign.advertiserId !== userId && !ADMIN_IDS.includes(userId)) {
      return res
        .status(403)
        .json({ ok: false, success: false, error: 'FORBIDDEN_CAMPAIGN_ACCESS' });
    }

    const topUpAmount = Number(req.body.topUpAmount || 0);
    if (topUpAmount < 0) {
      return res.status(400).json({
        ok: false,
        success: false,
        error: 'INVALID_TOPUP_AMOUNT',
        message: 'مبلغ الشحن غير صالح',
      });
    }

    if (topUpAmount > 0) {
      await models.adjustUserBalance(campaign.advertiserId, topUpAmount, {
        recordTx: true,
        type: 'campaign_topup',
        meta: { campaignId: campaign.campaignId },
      });
      await models
        .getDb()
        .collection(models.COLLECTIONS.CAMPAIGNS)
        .doc(campaign.campaignId)
        .update({
          budgetAllocated: admin.firestore.FieldValue.increment(topUpAmount),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
    }

    await models.updateCampaignStatus(campaign.campaignId, 'active', {
      pauseReason: null,
    });

    const resumedCampaign = await models.getCampaignById(campaign.campaignId);
    const dispatchSummary = await runCampaignDispatch(resumedCampaign);
    const updatedCampaign = await models.getCampaignById(campaign.campaignId);
    const updatedUser = await models.getUserById(campaign.advertiserId);

    return res.json({
      ok: true,
      success: true,
      campaign: updatedCampaign,
      user: updatedUser,
      dispatch: dispatchSummary,
    });
  })
);

app.post(
  '/api/campaigns/dispatch-due',
  asyncHandler(async (req, res) => {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && req.headers['x-cron-secret'] !== cronSecret) {
      return res
        .status(401)
        .json({ ok: false, success: false, error: 'UNAUTHORIZED_CRON' });
    }

    const dueCampaigns = await models.getDueCampaigns();
    const outcomes = [];

    for (const camp of dueCampaigns) {
      const outcome = await runCampaignDispatch(camp);
      outcomes.push({ campaignId: camp.campaignId, ...outcome });
    }

    return res.json({
      ok: true,
      success: true,
      processedCount: outcomes.length,
      outcomes,
    });
  })
);

// ================= WALLET ROUTES =================
app.post(
  '/api/wallet/deposit',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const amount = Number(req.body.amount);
    if (!amount || amount < 1) {
      return res
        .status(400)
        .json({ ok: false, success: false, message: 'Minimum deposit is 1 USD' });
    }

    const txRef = transactions.doc();
    await txRef.set({
      userId: req.user.telegramId,
      type: 'deposit',
      amount,
      status: 'pending',
      details: 'Telegram Stars / Crypto Deposit Request',
      createdAt: new Date(),
    });

    const txSnap = await txRef.get();
    const tx = serializeDoc(txSnap);

    await recordAuditLog(
      req.user.telegramId,
      'DEPOSIT_REQUEST',
      tx._id,
      `Requested deposit of $${amount}`,
      req
    );
    return res.json({ ok: true, success: true, transaction: tx });
  })
);

app.post(
  '/api/wallet/withdraw',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const amount = Number(req.body.amount);
    const walletAddress = (req.body.walletAddress || '').trim();

    if (!amount || amount < 5 || !walletAddress) {
      return res.status(400).json({
        ok: false,
        success: false,
        message: 'Minimum withdrawal is $5 and wallet address is required',
      });
    }

    if (req.user.balance < amount) {
      return res
        .status(400)
        .json({ ok: false, success: false, message: 'Insufficient earnings balance' });
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
        balance: currentBalance - amount,
      });

      t.set(txRef, {
        userId: req.user.telegramId,
        type: 'withdrawal',
        amount: -amount,
        status: 'pending',
        details: `Withdraw to: ${walletAddress}`,
        createdAt: now,
      });
    });

    const updatedBalance = Number((req.user.balance - amount).toFixed(4));
    const txSnap = await txRef.get();
    const tx = serializeDoc(txSnap);

    await recordAuditLog(
      req.user.telegramId,
      'WITHDRAWAL_REQUEST',
      tx._id,
      `Requested withdrawal of $${amount} to ${walletAddress}`,
      req
    );
    return res.json({
      ok: true,
      success: true,
      balance: updatedBalance,
      transaction: tx,
    });
  })
);

// ================= ADMIN PROTECTED ROUTES =================
app.get(
  '/api/admin/channels/pending',
  authMiddleware,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const [pendingAdminList, pendingLegacySnap] = await Promise.all([
      models.getPendingAdminChannels(),
      channels.where('status', '==', 'pending').get(),
    ]);

    const mergedMap = new Map();
    for (const ch of pendingAdminList) {
      mergedMap.set(String(ch.chatId || ch.id), ch);
    }
    for (const doc of pendingLegacySnap.docs) {
      const serialized = serializeDoc(doc);
      const key = String(serialized.chatId || serialized.id);
      if (!mergedMap.has(key)) {
        mergedMap.set(key, serialized);
      }
    }

    return res.json({
      ok: true,
      success: true,
      channels: Array.from(mergedMap.values()),
    });
  })
);

app.post(
  '/api/admin/channels/:chatId/decision',
  authMiddleware,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { decision } = req.body;
    if (!['approve', 'reject'].includes(decision)) {
      return res.status(400).json({
        ok: false,
        success: false,
        error: 'INVALID_DECISION',
        message: 'Decision must be approve or reject',
      });
    }

    const channel = await models.getChannelById(req.params.chatId);
    if (!channel) {
      return res
        .status(404)
        .json({ ok: false, success: false, error: 'CHANNEL_NOT_FOUND' });
    }

    let promoMessageId = channel.promoMessageId || null;
    let promoPostPublished = Boolean(channel.promoPostPublished);

    if (decision === 'approve' && !promoPostPublished) {
      const sentPromo = await publishChannelVerificationPromo(
        channel.chatId,
        channel.ownerId
      );
      promoMessageId = sentPromo.message_id;
      promoPostPublished = true;
    }

    const nextStatus = decision === 'approve' ? 'approved' : 'rejected';
    const updated = await models.upsertChannel({
      ...channel,
      status: nextStatus,
      promoPostPublished,
      promoMessageId,
    });

    await recordAuditLog(
      req.user.telegramId,
      'ADMIN_CHANNEL_DECISION',
      channel.chatId,
      `Decision: ${decision}`,
      req
    );

    return res.json({
      ok: true,
      success: true,
      channel: updated,
    });
  })
);

app.get(
  '/api/admin/dashboard',
  authMiddleware,
  adminMiddleware,
  asyncHandler(async (req, res) => {
    const [
      allUsersSnap,
      pendingChannelsSnap,
      pendingAdminChannelsSnap,
      pendingTxSnap,
      pendingCampaignsSnap,
      allLogsSnap,
    ] = await Promise.all([
      users.get(),
      channels.where('status', '==', 'pending').get(),
      channels.where('status', '==', 'pending_admin').get(),
      transactions.where('status', '==', 'pending').get(),
      campaigns.where('status', '==', 'pending').get(),
      securityLogs.get(),
    ]);

    const pendingChannels = sortDocsDesc(
      [...pendingChannelsSnap.docs, ...pendingAdminChannelsSnap.docs],
      'createdAt'
    ).map((doc) => serializeDoc(doc));

    const pendingTransactions = sortDocsDesc(pendingTxSnap.docs, 'createdAt').map((doc) =>
      serializeDoc(doc)
    );

    const sortedPendingCampaignDocs = sortDocsDesc(
      pendingCampaignsSnap.docs,
      'createdAt'
    );
    const uniqueChannelIds = [
      ...new Set(
        sortedPendingCampaignDocs
          .map((d) => d.data()?.channelId)
          .filter(Boolean)
          .map((id) => String(id))
      ),
    ];

    const channelMap = new Map();
    if (uniqueChannelIds.length > 0) {
      const refs = uniqueChannelIds.map((id) => channels.doc(id));
      const channelSnaps = await db.getAll(...refs);
      for (const cSnap of channelSnaps) {
        if (cSnap.exists) {
          const cData = cSnap.data() || {};
          channelMap.set(cSnap.id, {
            _id: cSnap.id,
            id: cSnap.id,
            title: cData.title || '',
            channelUsername: cData.channelUsername || cData.username || '',
            ownerId: cData.ownerId || '',
          });
        }
      }
    }

    const pendingCampaigns = sortedPendingCampaignDocs.map((doc) => {
      const rawChannelId = doc.data()?.channelId ? String(doc.data().channelId) : null;
      const populatedChannel =
        rawChannelId && channelMap.has(rawChannelId)
          ? channelMap.get(rawChannelId)
          : rawChannelId;

      return serializeDoc(doc, { channelId: populatedChannel });
    });

    const formattedSecurityLogs = sortDocsDesc(allLogsSnap.docs, 'createdAt')
      .slice(0, 30)
      .map((doc) => serializeDoc(doc));

    return res.json({
      ok: true,
      success: true,
      stats: {
        totalUsers: allUsersSnap.size,
        pendingChannelsCount: pendingChannels.length,
        pendingTransactionsCount: pendingTransactions.length,
        pendingCampaignsCount: pendingCampaigns.length,
      },
      pendingChannels,
      pendingTransactions,
      pendingCampaigns,
      securityLogs: formattedSecurityLogs,
    });
  })
);

app.post(
  '/api/admin/channels/:id/review',
  authMiddleware,
  adminMiddleware,
  asyncHandler(async (req, res) => {
    const { action } = req.body;
    if (!['approved', 'rejected'].includes(action)) {
      return res
        .status(400)
        .json({ ok: false, success: false, message: 'Invalid action' });
    }

    const channelRef = channels.doc(String(req.params.id));
    const channelSnap = await channelRef.get();
    if (!channelSnap.exists) {
      return res
        .status(404)
        .json({ ok: false, success: false, message: 'Channel not found' });
    }

    const currentData = channelSnap.data() || {};
    let promoMessageId = currentData.promoMessageId || null;
    let promoPostPublished = Boolean(currentData.promoPostPublished);

    if (action === 'approved' && !promoPostPublished && currentData.ownerId) {
      try {
        const sentPromo = await publishChannelVerificationPromo(
          channelSnap.id,
          currentData.ownerId
        );
        promoMessageId = sentPromo.message_id;
        promoPostPublished = true;
      } catch (err) {
        console.error('Failed to publish promo on approve:', err.message);
      }
    }

    await channelRef.update({
      status: action,
      promoPostPublished,
      promoMessageId,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const updatedSnap = await channelRef.get();
    const channel = serializeDoc(updatedSnap);

    await recordAuditLog(
      req.user.telegramId,
      `ADMIN_CHANNEL_${action.toUpperCase()}`,
      channel._id,
      `Channel @${channel.channelUsername || channel.username || channel._id} ${action}`,
      req
    );
    return res.json({ ok: true, success: true, channel });
  })
);

app.post(
  '/api/admin/transactions/:id/review',
  authMiddleware,
  adminMiddleware,
  asyncHandler(async (req, res) => {
    const { action } = req.body;
    if (!['completed', 'rejected'].includes(action)) {
      return res
        .status(400)
        .json({ ok: false, success: false, message: 'Invalid action' });
    }

    const txRef = transactions.doc(String(req.params.id));
    const txSnap = await txRef.get();
    if (!txSnap.exists || txSnap.data()?.status !== 'pending') {
      return res
        .status(404)
        .json({ ok: false, success: false, message: 'Pending transaction not found' });
    }

    const txData = txSnap.data() || {};
    const targetUserDoc = await getUserByTelegramId(txData.userId);
    if (!targetUserDoc) {
      return res
        .status(404)
        .json({ ok: false, success: false, message: 'User not found' });
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
          adBalance: Number(freshUserData.adBalance ?? 0) + txAmount,
        });
      } else if (freshTxData.type === 'withdrawal' && action === 'rejected') {
        t.update(targetUserDoc.ref, {
          balance: Number(freshUserData.balance ?? 0) + Math.abs(txAmount),
        });
      }

      t.update(txRef, { status: action });
    });

    const updatedTxSnap = await txRef.get();
    const transaction = serializeDoc(updatedTxSnap);

    await recordAuditLog(
      req.user.telegramId,
      `ADMIN_TX_${action.toUpperCase()}`,
      transaction._id,
      `Transaction ${transaction.type} ($${transaction.amount}) marked ${action}`,
      req
    );
    return res.json({ ok: true, success: true, transaction });
  })
);

app.post(
  '/api/admin/campaigns/:id/complete',
  authMiddleware,
  adminMiddleware,
  asyncHandler(async (req, res) => {
    const campaignRef = campaigns.doc(String(req.params.id));
    const campaignSnap = await campaignRef.get();
    if (!campaignSnap.exists || campaignSnap.data()?.status !== 'pending') {
      return res
        .status(404)
        .json({ ok: false, success: false, message: 'Pending campaign not found' });
    }

    const campaignData = campaignSnap.data() || {};
    const channelIdStr = campaignData.channelId ? String(campaignData.channelId) : '';
    const channelDoc = channelIdStr ? await channels.doc(channelIdStr).get() : null;
    if (!channelDoc || !channelDoc.exists) {
      return res
        .status(404)
        .json({ ok: false, success: false, message: 'Associated channel not found' });
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
          balance: Number(freshOwnerData.balance ?? 0) + budget,
        });

        t.set(earnTxRef, {
          userId: String(freshOwnerData.telegramId || ownerDoc.id),
          type: 'channel_earn',
          amount: budget,
          status: 'completed',
          details: `Ad completed on @${
            channelData.channelUsername || channelData.username || channelDoc.id
          }`,
          createdAt: now,
        });

        if (referrerDoc && bonus > 0) {
          const freshRefSnap = await t.get(referrerDoc.ref);
          const freshRefData = freshRefSnap.data() || {};
          t.update(referrerDoc.ref, {
            balance: Number(freshRefData.balance ?? 0) + bonus,
            referralEarnings: Number(freshRefData.referralEarnings ?? 0) + bonus,
          });

          t.set(refTxRef, {
            userId: String(freshRefData.telegramId || referrerDoc.id),
            type: 'referral_bonus',
            amount: bonus,
            status: 'completed',
            details: `Referral commission from user ${String(
              freshOwnerData.telegramId || ownerDoc.id
            )}`,
            createdAt: now,
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
        channelUsername: channelData.channelUsername || channelData.username || '',
        ownerId: channelData.ownerId || '',
      },
    });

    await recordAuditLog(
      req.user.telegramId,
      'ADMIN_CAMPAIGN_COMPLETED',
      campaign._id,
      `Campaign completed & funds released`,
      req
    );
    return res.json({ ok: true, success: true, campaign });
  })
);

// ================= TELEGRAM WEBHOOK =================
app.post(
  '/api/webhook/telegram',
  asyncHandler(async (req, res) => {
    const update = req.body || {};

    if (update.my_chat_member) {
      const mcm = update.my_chat_member;
      const chat = mcm.chat;
      const newStatus = mcm.new_chat_member ? mcm.new_chat_member.status : '';
      const isAdmin = ['administrator', 'creator'].includes(newStatus);

      if (chat && chat.id) {
        let subscribersCount;
        if (isAdmin) {
          try {
            subscribersCount = Number(
              await callTelegramApi('getChatMemberCount', { chat_id: chat.id })
            );
          } catch (err) {
            subscribersCount = undefined;
          }
        }
        await models.syncChannelSmartMetadata(chat.id, {
          title: chat.title,
          username: chat.username || '',
          subscribersCount,
          botIsAdmin: isAdmin,
        });
      }
    }

    const postObj = update.channel_post || update.edited_channel_post || null;
    if (postObj && postObj.chat && postObj.chat.id) {
      let subscribersCount;
      try {
        subscribersCount = Number(
          await callTelegramApi('getChatMemberCount', { chat_id: postObj.chat.id })
        );
      } catch (err) {
        subscribersCount = undefined;
      }
      await models.syncChannelSmartMetadata(postObj.chat.id, {
        title: postObj.chat.title,
        username: postObj.chat.username || '',
        subscribersCount,
      });
    }

    return res.json({ ok: true, success: true });
  })
);

// ================= SPA FALLBACK & ERROR HANDLER =================
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, req, res, next) => {
  console.error('[SERVER_ERROR]', err);
  if (res.headersSent) {
    return next(err);
  }
  const statusCode = err.statusCode || 500;
  return res.status(statusCode).json({
    ok: false,
    success: false,
    error: err.code || 'INTERNAL_SERVER_ERROR',
    message: err.message || 'حدث خطأ غير متوقع في الخادم',
  });
});

if (!process.env.VERCEL && require.main === module) {
  app.listen(PORT, () => {
    console.log(`Telega.ads server running on port ${PORT}`);
  });
}

module.exports = app;
