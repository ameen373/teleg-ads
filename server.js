require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
const {
  // Firebase Admin & Firestore
  admin,
  db,
  users: firestoreUsers,
  channels: firestoreChannels,
  campaigns: firestoreCampaigns,
  transactions: firestoreTransactions,
  securityLogs: firestoreSecurityLogs,

  // Mongoose & Models
  connectMongo,
  Channel,
  Referral,
  Campaign,
  Wallet,
  Transaction,
  PublishLog,
  Notification,
  BackupRecord,
  ALLOWED_LANGUAGES,
  ALLOWED_CATEGORIES
} = require('./models');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI || '';
const BOT_TOKEN = process.env.BOT_TOKEN || '';
const BOT_USERNAME = (process.env.BOT_USERNAME || 'adTelega_bot').replace(/^@/, '');
const SYNC_INTERVAL_MS = Number(process.env.SYNC_INTERVAL_MS) || 300000;
const BACKUP_INTERVAL_MS = Number(process.env.BACKUP_INTERVAL_MS) || 21600000;
const DEFAULT_WALLET_KEY = 'default_workspace';
const SERVER_STARTED_AT = new Date();

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Verify Firestore connectivity on startup without blocking serverless requests
db.listCollections()
  .then(() => console.log('Connected to Firebase Cloud Firestore'))
  .catch((err) => console.error('Firestore connection check error:', err));

let isMongoConnected = false;
async function ensureMongoConnection() {
  if (!MONGODB_URI) return false;
  if (mongoose.connection.readyState === 1) {
    isMongoConnected = true;
    return true;
  }
  try {
    await connectMongo(MONGODB_URI);
    isMongoConnected = true;
    console.log('Connected to MongoDB');
    return true;
  } catch (error) {
    console.error('MongoDB connection error:', error.message);
    return false;
  }
}

app.use(async (req, res, next) => {
  if (req.path.startsWith('/api') && MONGODB_URI) {
    await ensureMongoConnection();
  }
  next();
});

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// ==================== FIRESTORE HELPERS ====================

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
    await firestoreSecurityLogs.add({
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
  if (!telegramInitData || !BOT_TOKEN) return null;
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
      .update(BOT_TOKEN)
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
  const directDoc = await firestoreUsers.doc(idStr).get();
  if (directDoc.exists) return directDoc;

  const snap = await firestoreUsers.where('telegramId', '==', idStr).limit(1).get();
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
  const adminList = (process.env.ADMIN_IDS || '').split(',').map((id) => id.trim()).filter(Boolean);
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
    const userRef = firestoreUsers.doc(telegramId);
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
  const adminList = (process.env.ADMIN_IDS || '').split(',').map((id) => id.trim()).filter(Boolean);
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

// ==================== NOTIFICATIONS, HEALTH & BACKUP HELPERS ====================

async function createNotification(audience, category, title, message) {
  try {
    if (mongoose.connection.readyState !== 1) return null;
    return await Notification.create({
      audience: ['advertiser', 'publisher', 'admin'].includes(audience) ? audience : 'admin',
      category: ['channel', 'campaign', 'wallet', 'system'].includes(category) ? category : 'system',
      title: String(title).trim(),
      message: String(message).trim(),
      isRead: false
    });
  } catch (err) {
    console.error('Failed to create notification:', err.message);
    return null;
  }
}

async function runDatabaseBackup(reason = 'scheduled') {
  try {
    const [channelsList, campaignsList, referralsList, walletList, transactionsList, publishLogsList, notificationsList] =
      await Promise.all([
        Channel.find().lean(),
        Campaign.find().lean(),
        Referral.find().lean(),
        Wallet.find().lean(),
        Transaction.find().lean(),
        PublishLog.find().lean(),
        Notification.find().lean()
      ]);

    const snapshot = {
      createdAt: new Date().toISOString(),
      reason,
      channels: channelsList,
      campaigns: campaignsList,
      referrals: referralsList,
      wallet: walletList,
      transactions: transactionsList,
      publishLogs: publishLogsList,
      notifications: notificationsList
    };

    const totalRecords =
      channelsList.length +
      campaignsList.length +
      referralsList.length +
      walletList.length +
      transactionsList.length +
      publishLogsList.length +
      notificationsList.length;

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `telega_ads_backup_${timestamp}.json`;

    try {
      const backupDir = path.join(__dirname, 'backups');
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }
      fs.writeFileSync(path.join(backupDir, filename), JSON.stringify(snapshot, null, 2), 'utf8');
    } catch (fsErr) {
      console.error('Local backup file skipped:', fsErr.message);
    }

    const record = await BackupRecord.create({
      filename,
      collectionsCount: 7,
      totalRecords,
      status: 'completed',
      note: `Backup (${reason})`,
      snapshotData: snapshot
    });

    await createNotification(
      'admin',
      'system',
      'Database Backup Completed',
      `Snapshot ${filename} saved with ${totalRecords} records.`
    );

    return record;
  } catch (err) {
    console.error('Backup failed:', err.message);
    return await BackupRecord.create({
      filename: `backup_failed_${Date.now()}.json`,
      collectionsCount: 0,
      totalRecords: 0,
      status: 'failed',
      note: err.message
    });
  }
}

// ==================== WALLET & TELEGRAM HELPERS ====================

async function getOrCreateWallet() {
  let wallet = await Wallet.findOne({ ownerKey: DEFAULT_WALLET_KEY });
  if (!wallet) {
    wallet = await Wallet.create({
      ownerKey: DEFAULT_WALLET_KEY,
      advertiserBalance: 0,
      publisherBalance: 0
    });
  }
  return wallet;
}

async function callTelegramApi(method, payload) {
  if (!BOT_TOKEN || BOT_TOKEN === 'your_telegram_bot_token_here') {
    throw new Error('BOT_TOKEN is not configured');
  }
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/${method}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!data.ok) {
    throw new Error(data.description || `Telegram API error on ${method}`);
  }
  return data.result;
}

function generateReferralCode() {
  return 'ref_' + crypto.randomBytes(5).toString('hex');
}

function computeSmartPrice(subscribersCount, currentPrice) {
  let recommended = Number(currentPrice) || 1;
  if (subscribersCount >= 50000) {
    recommended = 3;
  } else if (subscribersCount >= 10000) {
    recommended = 2.5;
  } else if (subscribersCount >= 5000) {
    recommended = 2;
  } else if (subscribersCount >= 1000) {
    recommended = 1.5;
  } else {
    recommended = 1;
  }
  return Math.min(3, Math.max(1, recommended));
}

function evaluateApprovalBySubscribers(subscribersCount) {
  return subscribersCount > 1000 ? 'approved' : 'pending_review';
}

function resolveButtonLabel(campaign) {
  if (campaign.buttonPreset === 'Custom' && campaign.customButtonText && campaign.customButtonText.trim()) {
    return campaign.customButtonText.trim();
  }
  return campaign.buttonPreset || 'Open';
}

function buildBrandedAdText(campaign, channel) {
  const refCode = channel && channel.referralCode ? channel.referralCode : `ch_${channel._id}`;
  const refLink = `https://t.me/${BOT_USERNAME}?start=${encodeURIComponent(refCode)}`;
  const body = (campaign.adText || campaign.title || '').trim();
  const footer = `\n\nPowered by <a href="${refLink}">Telega.ads</a>`;
  return `${body}${footer}`;
}

function computeNextPeakSlot() {
  const now = new Date();
  const peakHoursUTC = [12, 16, 20];
  for (const h of peakHoursUTC) {
    const candidate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), h, 0, 0));
    if (candidate > now) return candidate;
  }
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 12, 0, 0));
}

async function sendFreeIntroPost(channel) {
  if (channel.introPostSent) return false;
  const chatIdentifier = channel.chatId || channel.username;
  if (!chatIdentifier) return false;

  const refParam = channel.referralCode || `ch_${channel._id}`;
  const botLink = `https://t.me/${BOT_USERNAME}?start=${encodeURIComponent(refParam)}`;

  const introText = [
    '✨ إعلانك يصل بدقة، وقناتك تكسب بدون تعقيد.',
    'أطلق حملتك أو حقق الدخل من قناتك مع تتبع لحظي وعوائد إحالة مستمرة ⚡'
  ].join('\n');

  await callTelegramApi('sendMessage', {
    chat_id: chatIdentifier,
    text: introText,
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: 'Open',
            url: botLink
          }
        ]
      ]
    }
  });

  channel.introPostSent = true;
  await channel.save();
  return true;
}

async function dispatchCampaignToChannel(campaign, channel, existingEntry, options = {}) {
  const forceRepublish = Boolean(options.forceRepublish);
  const dedupKey = `${campaign._id}_${channel._id}`;

  const existingPublishedLog = await PublishLog.findOne({
    dedupKey,
    status: 'published'
  });

  if (existingPublishedLog && !forceRepublish && existingEntry && existingEntry.messageId) {
    await PublishLog.create({
      dedupKey: `${dedupKey}_dup_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`,
      campaignId: campaign._id,
      campaignTitle: campaign.title,
      channelId: channel._id,
      channelName: channel.name,
      messageId: existingEntry.messageId,
      status: 'duplicate_prevented',
      details: 'Duplicate ad dispatch prevented automatically'
    });

    return {
      entry: existingEntry,
      duplicatePrevented: true
    };
  }

  const renderedText = buildBrandedAdText(campaign, channel);
  const btnText = resolveButtonLabel(campaign);
  const btnUrl =
    campaign.targetUrl && campaign.targetUrl.trim()
      ? campaign.targetUrl.trim()
      : `https://t.me/${BOT_USERNAME}?start=${encodeURIComponent(channel.referralCode || `ch_${channel._id}`)}`;

  let sentMessageId = existingEntry && existingEntry.messageId ? existingEntry.messageId : null;
  const chatIdentifier = channel.chatId || channel.username;

  try {
    if (chatIdentifier && BOT_TOKEN && BOT_TOKEN !== 'your_telegram_bot_token_here') {
      const replyMarkup = {
        inline_keyboard: [[{ text: btnText, url: btnUrl }]]
      };

      let msgText = renderedText;
      if (campaign.mediaType === 'photo' && campaign.mediaData) {
        msgText = `${renderedText}\n\n[Photo: ${campaign.mediaName || 'attached'}]`;
      } else if (campaign.mediaType === 'video' && campaign.mediaData) {
        msgText = `${renderedText}\n\n[Video: ${campaign.mediaName || 'attached'}]`;
      }

      const sentMsg = await callTelegramApi('sendMessage', {
        chat_id: chatIdentifier,
        text: msgText,
        parse_mode: 'HTML',
        protect_content: true,
        reply_markup: replyMarkup
      });
      if (sentMsg && sentMsg.message_id) {
        sentMessageId = sentMsg.message_id;
      }
    }

    const logKey = forceRepublish
      ? `${dedupKey}_res_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`
      : dedupKey;

    await PublishLog.findOneAndUpdate(
      { dedupKey: logKey },
      {
        dedupKey: logKey,
        campaignId: campaign._id,
        campaignTitle: campaign.title,
        channelId: channel._id,
        channelName: channel.name,
        messageId: sentMessageId,
        status: 'published',
        details: 'Published successfully with locked content',
        publishedAt: new Date()
      },
      { upsert: true, new: true }
    );

    return {
      entry: {
        channelId: channel._id,
        channelName: channel.name,
        messageId: sentMessageId,
        views: existingEntry && existingEntry.views ? existingEntry.views : 0,
        earnings: existingEntry && existingEntry.earnings ? existingEntry.earnings : 0,
        publisherRefCode: channel.referralCode || `ch_${channel._id}`,
        renderedAdText: renderedText,
        lockedContent: true,
        noForwarding: true,
        publishedAt: new Date()
      },
      duplicatePrevented: false
    };
  } catch (sendErr) {
    await PublishLog.create({
      dedupKey: `${dedupKey}_err_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`,
      campaignId: campaign._id,
      campaignTitle: campaign.title,
      channelId: channel._id,
      channelName: channel.name,
      messageId: sentMessageId,
      status: 'failed',
      details: sendErr.message
    });

    await createNotification(
      'advertiser',
      'campaign',
      'Ad Dispatch Issue',
      `Campaign "${campaign.title}" could not be delivered to ${channel.name}: ${sendErr.message}`
    );

    throw sendErr;
  }
}

async function syncSingleChannel(channel) {
  const identifier = channel.chatId || channel.username;
  if (!identifier) {
    return channel;
  }

  try {
    const chatInfo = await callTelegramApi('getChat', { chat_id: identifier });
    const isPublicChannel = chatInfo.type === 'channel' && Boolean(chatInfo.username);

    if (!isPublicChannel) {
      channel.isPublic = false;
      channel.approvalStatus = 'rejected';
      channel.botAdded = false;
      channel.botPermissionsOk = false;
      channel.lastPermissionCheckAt = new Date();
      channel.lastSyncedAt = new Date();
      await channel.save();
      return channel;
    }

    let permsOk = Boolean(channel.botAdded);
    try {
      const botMe = await callTelegramApi('getMe', {});
      const botMember = await callTelegramApi('getChatMember', {
        chat_id: chatInfo.id,
        user_id: botMe.id
      });
      const activeAdmin =
        botMember && (botMember.status === 'administrator' || botMember.status === 'creator');
      const canPost =
        botMember &&
        (botMember.status === 'creator' ||
          (botMember.can_post_messages !== false && botMember.can_edit_messages !== false));

      channel.botAdded = Boolean(activeAdmin);
      permsOk = Boolean(activeAdmin && canPost);

      if (!activeAdmin) {
        await createNotification(
          'publisher',
          'channel',
          'Bot Admin Removed',
          `Bot @${BOT_USERNAME} is no longer an admin in channel ${channel.name} (${channel.username}).`
        );
      }
    } catch (permErr) {
      permsOk = Boolean(channel.botAdded);
    }

    const memberCount = await callTelegramApi('getChatMemberCount', { chat_id: chatInfo.id });

    channel.isPublic = true;
    channel.chatId = String(chatInfo.id);
    channel.username = `@${chatInfo.username}`;
    channel.name = chatInfo.title || channel.name;
    channel.subscribersCount = Number(memberCount) || 0;
    channel.botPermissionsOk = permsOk;
    channel.lastPermissionCheckAt = new Date();
    const smartPrice = computeSmartPrice(channel.subscribersCount, channel.price);
    channel.price = smartPrice;
    channel.pricePer1000Views = smartPrice;
    channel.lastSyncedAt = new Date();

    if (channel.approvalStatus !== 'rejected') {
      const nextStatus = evaluateApprovalBySubscribers(channel.subscribersCount);
      if (nextStatus === 'approved') {
        channel.approvalStatus = 'approved';
      }
    }

    if (!channel.referralCode) {
      channel.referralCode = generateReferralCode();
    }

    await channel.save();

    if (channel.approvalStatus === 'approved' && channel.botAdded && !channel.introPostSent) {
      try {
        await sendFreeIntroPost(channel);
      } catch (postErr) {
        console.error('Failed to send free intro post:', postErr.message);
      }
    }

    return channel;
  } catch (err) {
    console.error(`Sync failed for channel ${channel.username}:`, err.message);
    return channel;
  }
}

async function syncAllChannels() {
  try {
    if (mongoose.connection.readyState !== 1) return;
    const channelsList = await Channel.find();
    for (const ch of channelsList) {
      await syncSingleChannel(ch);
    }
  } catch (err) {
    console.error('Error during channels sync loop:', err.message);
  }
}

async function processDueScheduledCampaigns() {
  try {
    if (mongoose.connection.readyState !== 1) return;
    const now = new Date();
    const dueCampaigns = await Campaign.find({
      status: 'scheduled',
      scheduledAt: { $lte: now }
    });

    for (const camp of dueCampaigns) {
      const targetChannels = await Channel.find({
        _id: { $in: camp.selectedChannelIds || [] },
        isPublic: { $ne: false },
        approvalStatus: 'approved'
      });

      const logs = [];
      for (const ch of targetChannels) {
        try {
          const result = await dispatchCampaignToChannel(camp, ch, null);
          if (result && result.entry) {
            logs.push(result.entry);
          }
        } catch (dispatchErr) {
          console.error('Scheduled dispatch error:', dispatchErr.message);
        }
      }

      camp.publishedChannels = logs;
      camp.status = 'active';
      await camp.save();
    }
  } catch (err) {
    console.error('Error processing scheduled campaigns:', err.message);
  }
}

async function processTelegramUpdate(update) {
  if (update.my_chat_member) {
    const mcm = update.my_chat_member;
    const chat = mcm.chat;
    const actor = mcm.from;
    const newStatus = mcm.new_chat_member ? mcm.new_chat_member.status : '';

    if (chat && chat.type === 'channel') {
      const isPublic = Boolean(chat.username);
      const formattedUsername = chat.username ? `@${chat.username}` : '';

      if (!isPublic) {
        if (formattedUsername) {
          await Channel.findOneAndUpdate(
            { $or: [{ chatId: String(chat.id) }, { username: formattedUsername }] },
            {
              chatId: String(chat.id),
              isPublic: false,
              botAdded: false,
              botPermissionsOk: false,
              approvalStatus: 'rejected',
              lastSyncedAt: new Date()
            }
          );
        }
        return;
      }

      const isAdminNow = newStatus === 'administrator' || newStatus === 'creator';
      let subscriberCount = 0;
      try {
        subscriberCount = await callTelegramApi('getChatMemberCount', { chat_id: chat.id });
      } catch (e) {
        subscriberCount = 0;
      }

      const actorId = actor ? String(actor.id) : '';
      const actorUsername = actor && actor.username ? `@${actor.username}` : '';
      const actorName = actor
        ? [actor.first_name, actor.last_name].filter(Boolean).join(' ')
        : '';

      let existing = await Channel.findOne({
        $or: [{ chatId: String(chat.id) }, { username: formattedUsername }]
      });

      const autoApproval = evaluateApprovalBySubscribers(subscriberCount);
      const smartPrice = computeSmartPrice(subscriberCount, 1);

      if (!existing && isAdminNow) {
        existing = await Channel.create({
          name: chat.title || formattedUsername,
          username: formattedUsername,
          chatId: String(chat.id),
          isPublic: true,
          subscribersCount: Number(subscriberCount) || 0,
          ownerTelegramId: actorId,
          ownerUsername: actorUsername,
          ownerName: actorName,
          approvalStatus: autoApproval,
          referralCode: generateReferralCode(),
          language: 'Arabic',
          category: 'other',
          price: smartPrice,
          pricePer1000Views: smartPrice,
          botAdded: true,
          botPermissionsOk: true,
          lastPermissionCheckAt: new Date(),
          lastSyncedAt: new Date()
        });
      } else if (existing) {
        existing.name = chat.title || existing.name;
        existing.username = formattedUsername;
        existing.chatId = String(chat.id);
        existing.isPublic = true;
        existing.subscribersCount = Number(subscriberCount) || existing.subscribersCount;
        existing.botAdded = isAdminNow;
        existing.botPermissionsOk = isAdminNow;
        existing.lastPermissionCheckAt = new Date();
        if (actorId && !existing.ownerTelegramId) {
          existing.ownerTelegramId = actorId;
          existing.ownerUsername = actorUsername;
          existing.ownerName = actorName;
        }
        if (!existing.referralCode) {
          existing.referralCode = generateReferralCode();
        }
        const updatedPrice = computeSmartPrice(existing.subscribersCount, existing.price);
        existing.price = updatedPrice;
        existing.pricePer1000Views = updatedPrice;
        if (existing.approvalStatus !== 'rejected') {
          existing.approvalStatus = evaluateApprovalBySubscribers(existing.subscribersCount);
        }
        existing.lastSyncedAt = new Date();
        await existing.save();
      }

      if (existing && existing.botAdded && existing.approvalStatus === 'approved' && !existing.introPostSent) {
        try {
          await sendFreeIntroPost(existing);
        } catch (err) {
          console.error('Intro post error:', err.message);
        }
      }
    }
  }

  if (update.message && update.message.text) {
    const msg = update.message;
    const text = msg.text.trim();
    if (text.startsWith('/start')) {
      const parts = text.split(/\s+/);
      const startParam = parts[1] || '';
      const referredUser = msg.from;
      const isAdvertiser = text.toLowerCase().includes('adv');
      const sourceRole = isAdvertiser ? 'advertiser' : 'publisher';
      const commissionEligible = sourceRole !== 'advertiser';

      if (startParam && referredUser && commissionEligible) {
        const publisherChannel = await Channel.findOne({ referralCode: startParam });
        const publisherId = publisherChannel
          ? publisherChannel.ownerTelegramId || String(publisherChannel._id)
          : startParam;

        if (publisherId && String(referredUser.id) !== publisherId) {
          const alreadyReferred = await Referral.findOne({
            publisherTelegramId: publisherId,
            referredTelegramId: String(referredUser.id)
          });

          if (!alreadyReferred) {
            await Referral.create({
              publisherTelegramId: publisherId,
              channelId: publisherChannel ? publisherChannel._id : null,
              referredTelegramId: String(referredUser.id),
              referredUsername: referredUser.username ? `@${referredUser.username}` : '',
              sourceRole,
              commissionEligible: true
            });

            if (publisherChannel) {
              publisherChannel.referralsCount = (publisherChannel.referralsCount || 0) + 1;
              await publisherChannel.save();
            }
          }
        }
      }

      try {
        await callTelegramApi('sendMessage', {
          chat_id: msg.chat.id,
          text: 'مرحباً بك في منصة Telega.ads لإدارة القنوات والحملات الإعلانية.'
        });
      } catch (err) {
        console.error('Failed to reply to /start:', err.message);
      }
    }
  }
}

// ==================== FIRESTORE USER & HOME ROUTES ====================

app.get('/api/me', authMiddleware, asyncHandler(async (req, res) => {
  const [approvedSnap, userChannelsSnap, userCampaignsSnap, userTxSnap] = await Promise.all([
    firestoreChannels.where('status', '==', 'approved').get(),
    firestoreChannels.where('ownerId', '==', req.user.telegramId).get(),
    firestoreCampaigns.where('advertiserId', '==', req.user.telegramId).get(),
    firestoreTransactions.where('userId', '==', req.user.telegramId).get()
  ]);

  const sortedTx = sortDocsDesc(userTxSnap.docs, 'createdAt')
    .slice(0, 10)
    .map((doc) => serializeDoc(doc));

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

// ==================== PUBLISH LOGS, NOTIFICATIONS, HEALTH & BACKUPS ====================

app.get('/api/publish-logs', asyncHandler(async (req, res) => {
  const logs = await PublishLog.find().sort({ createdAt: -1 }).limit(100);
  res.json({ success: true, data: logs });
}));

app.get('/api/notifications', asyncHandler(async (req, res) => {
  const notificationsList = await Notification.find().sort({ createdAt: -1 }).limit(60);
  const unreadCount = await Notification.countDocuments({ isRead: false });
  res.json({ success: true, data: notificationsList, unreadCount });
}));

app.post('/api/notifications/read-all', asyncHandler(async (req, res) => {
  await Notification.updateMany({ isRead: false }, { $set: { isRead: true } });
  res.json({ success: true });
}));

app.get('/api/system/health', asyncHandler(async (req, res) => {
  const channelsList = mongoose.connection.readyState === 1 ? await Channel.find() : [];
  const activeChannels = channelsList.filter((c) => c.botAdded && c.botPermissionsOk !== false);
  const botConfigured = Boolean(BOT_TOKEN && BOT_TOKEN !== 'your_telegram_bot_token_here');

  res.json({
    success: true,
    data: {
      serverStatus: 'healthy',
      firestoreConnected: Boolean(db),
      mongoConnected: mongoose.connection.readyState === 1,
      botUsername: `@${BOT_USERNAME}`,
      botConfigured,
      startedAt: SERVER_STARTED_AT,
      uptimeSeconds: Math.floor((Date.now() - SERVER_STARTED_AT.getTime()) / 1000),
      totalChannels: channelsList.length,
      healthyBotChannels: activeChannels.length
    }
  });
}));

app.get('/api/system/backups', asyncHandler(async (req, res) => {
  const backups = await BackupRecord.find()
    .select('filename collectionsCount totalRecords status note createdAt')
    .sort({ createdAt: -1 })
    .limit(20);
  res.json({ success: true, data: backups });
}));

app.post('/api/system/backups', asyncHandler(async (req, res) => {
  const record = await runDatabaseBackup('manual');
  res.status(201).json({
    success: true,
    data: {
      _id: record._id,
      filename: record.filename,
      collectionsCount: record.collectionsCount,
      totalRecords: record.totalRecords,
      status: record.status,
      note: record.note,
      createdAt: record.createdAt
    }
  });
}));

// ==================== TELEGRAM WEBHOOK & REFERRAL ROUTES ====================

app.post('/api/telegram/webhook', asyncHandler(async (req, res) => {
  await processTelegramUpdate(req.body);
  res.json({ ok: true });
}));

app.post('/api/referrals/track', asyncHandler(async (req, res) => {
  const { referralCode, referredTelegramId, referredUsername, sourceRole } = req.body;
  if (!referralCode || !referredTelegramId) {
    return res.status(400).json({ success: false, message: 'referralCode and referredTelegramId are required' });
  }

  const role = sourceRole === 'advertiser' ? 'advertiser' : 'publisher';
  if (role === 'advertiser') {
    return res.status(200).json({
      success: true,
      excluded: true,
      commissionEligible: false,
      message: 'Referral commission is excluded for advertisers'
    });
  }

  const channel = await Channel.findOne({ referralCode });
  const publisherId = channel ? channel.ownerTelegramId || String(channel._id) : referralCode;

  const existing = await Referral.findOne({
    publisherTelegramId: publisherId,
    referredTelegramId: String(referredTelegramId)
  });

  if (existing) {
    return res.json({ success: true, duplicate: true, data: existing });
  }

  const created = await Referral.create({
    publisherTelegramId: publisherId,
    channelId: channel ? channel._id : null,
    referredTelegramId: String(referredTelegramId),
    referredUsername: referredUsername ? String(referredUsername).trim() : '',
    sourceRole: 'publisher',
    commissionEligible: true
  });

  if (channel) {
    channel.referralsCount = (channel.referralsCount || 0) + 1;
    await channel.save();
  }

  res.status(201).json({ success: true, duplicate: false, data: created });
}));

app.get('/api/referrals', asyncHandler(async (req, res) => {
  const referralsList = await Referral.find({ commissionEligible: true, sourceRole: { $ne: 'advertiser' } })
    .sort({ createdAt: -1 })
    .populate('channelId', 'name username referralCode');
  res.json({ success: true, data: referralsList });
}));

// ==================== MARKETPLACE & CHANNELS ROUTES ====================

app.get('/api/marketplace/channels', asyncHandler(async (req, res) => {
  const { search, language, category, maxPrice, openTargeting, favoritesOnly } = req.query;
  const isOpen = openTargeting === 'true';

  const query = {
    isPublic: { $ne: false },
    approvalStatus: 'approved'
  };

  if (!isOpen) {
    if (language && ALLOWED_LANGUAGES.includes(language)) {
      query.language = language;
    }
    if (category && ALLOWED_CATEGORIES.includes(category)) {
      query.category = category;
    }
  }

  if (maxPrice !== undefined && maxPrice !== '') {
    const priceNum = Number(maxPrice);
    if (!isNaN(priceNum)) {
      query.pricePer1000Views = { $lte: priceNum };
    }
  }

  if (favoritesOnly === 'true') {
    query.isFavorite = true;
  }

  if (search && String(search).trim()) {
    const escaped = String(search).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    query.name = { $regex: escaped, $options: 'i' };
  }

  const channelsList = await Channel.find(query)
    .select('name photoUrl subscribersCount pricePer1000Views price language category isFavorite approvalStatus')
    .sort({ isFavorite: -1, subscribersCount: -1 });

  res.json({ success: true, data: channelsList });
}));

app.post('/api/channels/:id/favorite', asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, message: 'Invalid channel ID' });
  }

  const channel = await Channel.findById(id);
  if (!channel) {
    return res.status(404).json({ success: false, message: 'Channel not found' });
  }

  channel.isFavorite = !channel.isFavorite;
  await channel.save();
  res.json({ success: true, data: channel });
}));

app.post('/api/channels/:id/verify', asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, message: 'Invalid channel ID' });
  }

  const channel = await Channel.findById(id);
  if (!channel) {
    return res.status(404).json({ success: false, message: 'Channel not found' });
  }

  const cleanUsername = channel.username.replace(/^@/, '');
  if (!cleanUsername || channel.username.includes('+') || channel.username.includes('joinchat')) {
    channel.isPublic = false;
    channel.approvalStatus = 'rejected';
    channel.botAdded = false;
    channel.botPermissionsOk = false;
    await channel.save();
    return res.status(400).json({
      success: false,
      message: 'Private channels are not accepted. Only public channels are allowed.',
      data: channel
    });
  }

  const chatInfo = await callTelegramApi('getChat', { chat_id: `@${cleanUsername}` });
  if (chatInfo.type !== 'channel' || !chatInfo.username) {
    channel.isPublic = false;
    channel.approvalStatus = 'rejected';
    channel.botAdded = false;
    channel.botPermissionsOk = false;
    await channel.save();
    return res.status(400).json({
      success: false,
      message: 'Only public Telegram channels are accepted.',
      data: channel
    });
  }

  let botMember = null;
  try {
    const botMe = await callTelegramApi('getMe', {});
    botMember = await callTelegramApi('getChatMember', {
      chat_id: chatInfo.id,
      user_id: botMe.id
    });
  } catch (err) {
    botMember = null;
  }

  const isBotAdmin =
    botMember && (botMember.status === 'administrator' || botMember.status === 'creator');

  if (!isBotAdmin) {
    return res.status(400).json({
      success: false,
      message: `Bot @${BOT_USERNAME} is not yet an administrator in this channel.`,
      data: channel
    });
  }

  const subscribersCount = await callTelegramApi('getChatMemberCount', { chat_id: chatInfo.id });

  try {
    const admins = await callTelegramApi('getChatAdministrators', { chat_id: chatInfo.id });
    const promoter = admins.find(
      (adminMember) => adminMember.promoted_by && adminMember.user && adminMember.user.username === BOT_USERNAME
    );
    if (promoter && promoter.promoted_by && !channel.ownerTelegramId) {
      channel.ownerTelegramId = String(promoter.promoted_by.id);
      channel.ownerUsername = promoter.promoted_by.username
        ? `@${promoter.promoted_by.username}`
        : '';
      channel.ownerName = [promoter.promoted_by.first_name, promoter.promoted_by.last_name]
        .filter(Boolean)
        .join(' ');
    }
  } catch (adminErr) {
    // Ignore if unable to read administrators list
  }

  channel.chatId = String(chatInfo.id);
  channel.isPublic = true;
  channel.name = chatInfo.title || channel.name;
  channel.username = `@${chatInfo.username}`;
  channel.subscribersCount = Number(subscribersCount) || 0;
  channel.botAdded = true;
  channel.botPermissionsOk = true;
  channel.lastPermissionCheckAt = new Date();
  const smartPrice = computeSmartPrice(channel.subscribersCount, channel.price);
  channel.price = smartPrice;
  channel.pricePer1000Views = smartPrice;
  channel.approvalStatus = evaluateApprovalBySubscribers(channel.subscribersCount);
  if (!channel.referralCode) {
    channel.referralCode = generateReferralCode();
  }
  channel.lastSyncedAt = new Date();
  await channel.save();

  let introSentNow = false;
  if (channel.approvalStatus === 'approved' && !channel.introPostSent) {
    introSentNow = await sendFreeIntroPost(channel);
  }

  await createNotification(
    'publisher',
    'channel',
    'Channel Verified',
    `Channel ${channel.name} (${channel.username}) verified with ${channel.subscribersCount} subscribers.`
  );

  res.json({
    success: true,
    introSentNow,
    data: channel
  });
}));

app.post('/api/channels/:id/review', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { decision } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, message: 'Invalid channel ID' });
  }

  if (decision !== 'approved' && decision !== 'rejected') {
    return res.status(400).json({ success: false, message: 'Decision must be approved or rejected' });
  }

  const channel = await Channel.findById(id);
  if (!channel) {
    return res.status(404).json({ success: false, message: 'Channel not found' });
  }

  if (!channel.isPublic) {
    return res.status(400).json({ success: false, message: 'Private channels cannot be approved' });
  }

  channel.approvalStatus = decision;
  await channel.save();

  let introSentNow = false;
  if (decision === 'approved' && channel.botAdded && !channel.introPostSent) {
    try {
      introSentNow = await sendFreeIntroPost(channel);
    } catch (err) {
      console.error('Failed to send intro post after admin approval:', err.message);
    }
  }

  await createNotification(
    'publisher',
    'channel',
    'Channel Review Decision',
    `Channel ${channel.name} status set to ${decision}.`
  );

  res.json({ success: true, introSentNow, data: channel });
}));

app.post('/api/channels/:id/sync', asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, message: 'Invalid channel ID' });
  }

  const channel = await Channel.findById(id);
  if (!channel) {
    return res.status(404).json({ success: false, message: 'Channel not found' });
  }

  const updated = await syncSingleChannel(channel);
  res.json({ success: true, data: updated });
}));

app.get('/api/channels', asyncHandler(async (req, res, next) => {
  const hasInitData = Boolean(req.headers['x-telegram-init-data']);
  if (hasInitData) {
    return authMiddleware(req, res, async () => {
      const [myChannelsSnap, approvedChannelsSnap] = await Promise.all([
        firestoreChannels.where('ownerId', '==', req.user.telegramId).get(),
        firestoreChannels.where('status', '==', 'approved').get()
      ]);

      const myChannels = sortDocsDesc(myChannelsSnap.docs, 'createdAt')
        .map((doc) => serializeDoc(doc));

      const marketplaceChannels = [...approvedChannelsSnap.docs]
        .sort((a, b) => Number(b.data()?.subscribers || 0) - Number(a.data()?.subscribers || 0))
        .map((doc) => serializeDoc(doc));

      res.json({ success: true, myChannels, marketplaceChannels });
    });
  }

  const channelsList = await Channel.find().sort({ createdAt: -1 });
  res.json({ success: true, data: channelsList });
}));

app.post('/api/channels', asyncHandler(async (req, res) => {
  const hasInitData = Boolean(req.headers['x-telegram-init-data']);
  if (hasInitData && req.body.channelUsername && !req.body.username) {
    return authMiddleware(req, res, async () => {
      const { channelUsername, title, subscribers, category, pricePerPost } = req.body;
      if (!channelUsername || !title || !pricePerPost) {
        return res.status(400).json({ success: false, message: 'Missing required fields' });
      }

      const cleanUsername = String(channelUsername).replace('@', '').trim();
      const numericPrice = Number(pricePerPost);
      if (Number.isNaN(numericPrice) || numericPrice < 0.1) {
        return res.status(400).json({ success: false, message: 'Invalid pricePerPost (minimum 0.1)' });
      }

      const existingSnap = await firestoreChannels.where('channelUsername', '==', cleanUsername).limit(1).get();
      if (!existingSnap.empty) {
        return res.status(400).json({ success: false, message: 'Channel already registered' });
      }

      const newChannelRef = firestoreChannels.doc();
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
    });
  }

  const {
    name,
    username,
    photoUrl,
    language,
    category,
    price,
    pricePer1000Views,
    botAdded,
    ownerTelegramId,
    ownerUsername,
    ownerName
  } = req.body;

  if (!name || !username || !language || !category || (price === undefined && pricePer1000Views === undefined)) {
    return res.status(400).json({ success: false, message: 'Missing required fields' });
  }

  const rawUsername = String(username).trim();
  if (rawUsername.includes('+') || rawUsername.toLowerCase().includes('joinchat')) {
    return res.status(400).json({
      success: false,
      message: 'Private channels are rejected. Only public channels are allowed.'
    });
  }

  const chosenPrice = pricePer1000Views !== undefined ? Number(pricePer1000Views) : Number(price);
  if (isNaN(chosenPrice) || chosenPrice < 1 || chosenPrice > 3) {
    return res.status(400).json({ success: false, message: 'Price must be between 1$ and 3$' });
  }

  if (!ALLOWED_LANGUAGES.includes(language)) {
    return res.status(400).json({ success: false, message: 'Invalid language' });
  }

  if (!ALLOWED_CATEGORIES.includes(category)) {
    return res.status(400).json({ success: false, message: 'Invalid category' });
  }

  const formattedUsername = rawUsername.startsWith('@') ? rawUsername : `@${rawUsername}`;

  const channel = await Channel.create({
    name: String(name).trim(),
    username: formattedUsername,
    photoUrl: photoUrl ? String(photoUrl).trim() : '',
    isPublic: true,
    subscribersCount: 0,
    pricePer1000Views: chosenPrice,
    ownerTelegramId: ownerTelegramId ? String(ownerTelegramId).trim() : '',
    ownerUsername: ownerUsername ? String(ownerUsername).trim() : '',
    ownerName: ownerName ? String(ownerName).trim() : '',
    approvalStatus: 'pending_review',
    referralCode: generateReferralCode(),
    language,
    category,
    price: chosenPrice,
    botAdded: Boolean(botAdded),
    botPermissionsOk: Boolean(botAdded),
    lastPermissionCheckAt: new Date(),
    lastSyncedAt: new Date()
  });

  const syncedChannel = await syncSingleChannel(channel);
  await createNotification(
    'admin',
    'channel',
    'New Channel Registered',
    `Channel ${syncedChannel.name} (${syncedChannel.username}) added to platform.`
  );

  res.status(201).json({ success: true, data: syncedChannel });
}));

app.put('/api/channels/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const {
    name,
    username,
    photoUrl,
    language,
    category,
    price,
    pricePer1000Views,
    botAdded,
    subscribersCount,
    ownerTelegramId,
    ownerUsername
  } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, message: 'Invalid channel ID' });
  }

  const updateData = {};
  if (name !== undefined) updateData.name = String(name).trim();
  if (photoUrl !== undefined) updateData.photoUrl = String(photoUrl).trim();
  if (username !== undefined) {
    const clean = String(username).trim();
    if (clean.includes('+') || clean.toLowerCase().includes('joinchat')) {
      return res.status(400).json({
        success: false,
        message: 'Private channels are rejected. Only public channels are allowed.'
      });
    }
    updateData.username = clean.startsWith('@') ? clean : `@${clean}`;
  }
  if (language !== undefined) {
    if (!ALLOWED_LANGUAGES.includes(language)) {
      return res.status(400).json({ success: false, message: 'Invalid language' });
    }
    updateData.language = language;
  }
  if (category !== undefined) {
    if (!ALLOWED_CATEGORIES.includes(category)) {
      return res.status(400).json({ success: false, message: 'Invalid category' });
    }
    updateData.category = category;
  }
  if (price !== undefined || pricePer1000Views !== undefined) {
    const numericPrice = pricePer1000Views !== undefined ? Number(pricePer1000Views) : Number(price);
    if (isNaN(numericPrice) || numericPrice < 1 || numericPrice > 3) {
      return res.status(400).json({ success: false, message: 'Price must be between 1$ and 3$' });
    }
    updateData.price = numericPrice;
    updateData.pricePer1000Views = numericPrice;
  }
  if (botAdded !== undefined) {
    updateData.botAdded = Boolean(botAdded);
    updateData.botPermissionsOk = Boolean(botAdded);
    updateData.lastPermissionCheckAt = new Date();
  }
  if (subscribersCount !== undefined) {
    const subNum = Number(subscribersCount);
    if (!isNaN(subNum) && subNum >= 0) {
      updateData.subscribersCount = subNum;
      updateData.approvalStatus = evaluateApprovalBySubscribers(subNum);
    }
  }
  if (ownerTelegramId !== undefined) {
    updateData.ownerTelegramId = String(ownerTelegramId).trim();
  }
  if (ownerUsername !== undefined) {
    updateData.ownerUsername = String(ownerUsername).trim();
  }
  updateData.lastSyncedAt = new Date();

  const updatedChannel = await Channel.findByIdAndUpdate(id, updateData, {
    new: true,
    runValidators: true
  });

  if (!updatedChannel) {
    return res.status(404).json({ success: false, message: 'Channel not found' });
  }

  if (
    updatedChannel.approvalStatus === 'approved' &&
    updatedChannel.botAdded &&
    !updatedChannel.introPostSent
  ) {
    try {
      await sendFreeIntroPost(updatedChannel);
    } catch (err) {
      console.error('Intro post error on update:', err.message);
    }
  }

  res.json({ success: true, data: updatedChannel });
}));

app.delete('/api/channels/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, message: 'Invalid channel ID' });
  }
  const deleted = await Channel.findByIdAndDelete(id);
  if (!deleted) {
    return res.status(404).json({ success: false, message: 'Channel not found' });
  }
  res.json({ success: true, message: 'Channel deleted' });
}));

// ==================== CAMPAIGNS ROUTES ====================

app.post('/api/campaigns/:id/track-views', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { viewsDelta, channelId, eventId } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, message: 'Invalid campaign ID' });
  }

  const delta = Number(viewsDelta);
  if (isNaN(delta) || delta <= 0) {
    return res.status(400).json({ success: false, message: 'viewsDelta must be greater than 0' });
  }

  const txKey = eventId ? `view_${String(eventId).trim()}` : null;
  if (txKey) {
    const alreadyCharged = await Transaction.findOne({ idempotencyKey: txKey });
    if (alreadyCharged) {
      const currentCampaign = await Campaign.findById(id);
      const currentWallet = await getOrCreateWallet();
      return res.json({
        success: true,
        duplicatePrevented: true,
        data: {
          billableViews: 0,
          chargeAmount: 0,
          campaign: currentCampaign,
          wallet: currentWallet
        }
      });
    }
  }

  const campaign = await Campaign.findById(id);
  if (!campaign) {
    return res.status(404).json({ success: false, message: 'Campaign not found' });
  }

  if (campaign.status !== 'active') {
    return res.status(400).json({
      success: false,
      message: 'Views can only be tracked for active campaigns'
    });
  }

  const wallet = await getOrCreateWallet();
  const cpm = Number(campaign.maxPricePerPost) || 1;
  const remainingBudget = Math.max(0, Number((campaign.budget - campaign.spentAmount).toFixed(4)));
  const maxAffordableByBudget = Math.floor((remainingBudget / cpm) * 1000);
  const maxAffordableByWallet = Math.floor((wallet.advertiserBalance / cpm) * 1000);
  const billableViews = Math.max(0, Math.min(delta, maxAffordableByBudget, maxAffordableByWallet));

  if (billableViews <= 0) {
    campaign.status = 'paused';
    await campaign.save();
    await createNotification(
      'advertiser',
      'campaign',
      'Campaign Paused',
      `Campaign "${campaign.title}" was paused due to exhausted budget or wallet balance.`
    );
    return res.status(400).json({
      success: false,
      message: 'Insufficient campaign budget or advertiser balance; campaign paused',
      data: campaign
    });
  }

  const chargeAmount = Number(((billableViews / 1000) * cpm).toFixed(4));

  wallet.advertiserBalance = Number(Math.max(0, wallet.advertiserBalance - chargeAmount).toFixed(4));
  wallet.publisherBalance = Number((wallet.publisherBalance + chargeAmount).toFixed(4));
  await wallet.save();

  campaign.totalViews = (campaign.totalViews || 0) + billableViews;
  campaign.spentAmount = Number((campaign.spentAmount + chargeAmount).toFixed(4));

  if (campaign.publishedChannels && campaign.publishedChannels.length > 0) {
    const targetIdx = channelId
      ? campaign.publishedChannels.findIndex((p) => String(p.channelId) === String(channelId))
      : 0;
    const idx = targetIdx >= 0 ? targetIdx : 0;
    campaign.publishedChannels[idx].views = (campaign.publishedChannels[idx].views || 0) + billableViews;
    campaign.publishedChannels[idx].earnings = Number(
      ((campaign.publishedChannels[idx].earnings || 0) + chargeAmount).toFixed(4)
    );
  }

  if (campaign.spentAmount >= campaign.budget || wallet.advertiserBalance <= 0) {
    campaign.status = 'paused';
  }
  await campaign.save();

  await Transaction.create({
    idempotencyKey: txKey ? `${txKey}_adv` : undefined,
    walletRole: 'advertiser',
    type: 'ad_spend',
    amount: chargeAmount,
    campaignId: campaign._id,
    channelId: channelId && mongoose.Types.ObjectId.isValid(channelId) ? channelId : null,
    note: `Live views (${billableViews}) on ${campaign.title}`
  });

  await Transaction.create({
    idempotencyKey: txKey ? `${txKey}_pub` : undefined,
    walletRole: 'publisher',
    type: 'ad_earning',
    amount: chargeAmount,
    campaignId: campaign._id,
    channelId: channelId && mongoose.Types.ObjectId.isValid(channelId) ? channelId : null,
    note: `Publisher earning from ${billableViews} views on ${campaign.title}`
  });

  res.json({
    success: true,
    data: {
      billableViews,
      chargeAmount,
      campaign,
      wallet
    }
  });
}));

app.post('/api/campaigns/:id/topup', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { amount } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, message: 'Invalid campaign ID' });
  }

  const addAmount = Number(amount);
  if (isNaN(addAmount) || addAmount <= 0) {
    return res.status(400).json({ success: false, message: 'Invalid top-up amount' });
  }

  const campaign = await Campaign.findById(id);
  if (!campaign) {
    return res.status(404).json({ success: false, message: 'Campaign not found' });
  }

  const wallet = await getOrCreateWallet();
  if (wallet.advertiserBalance < addAmount) {
    return res.status(400).json({ success: false, message: 'Insufficient advertiser wallet balance' });
  }

  campaign.budget = Number((campaign.budget + addAmount).toFixed(4));
  await campaign.save();

  await Transaction.create({
    walletRole: 'advertiser',
    type: 'budget_topup',
    amount: addAmount,
    campaignId: campaign._id,
    note: `Budget top-up for ${campaign.title}`
  });

  await createNotification(
    'advertiser',
    'campaign',
    'Campaign Budget Topped Up',
    `Added ${addAmount.toFixed(2)}$ to campaign "${campaign.title}".`
  );

  res.json({ success: true, data: { campaign, wallet } });
}));

app.post('/api/campaigns/:id/lifecycle', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { action } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, message: 'Invalid campaign ID' });
  }

  const campaign = await Campaign.findById(id);
  if (!campaign) {
    return res.status(404).json({ success: false, message: 'Campaign not found' });
  }

  if (action === 'pause') {
    campaign.status = 'paused';
    await campaign.save();
    await createNotification('advertiser', 'campaign', 'Campaign Paused', `Campaign "${campaign.title}" is now paused.`);
    return res.json({ success: true, data: campaign });
  }

  if (action === 'complete') {
    campaign.status = 'completed';
    await campaign.save();
    await createNotification('advertiser', 'campaign', 'Campaign Completed', `Campaign "${campaign.title}" is marked completed.`);
    return res.json({ success: true, data: campaign });
  }

  if (action === 'resume') {
    const wallet = await getOrCreateWallet();
    if (campaign.budget <= campaign.spentAmount || wallet.advertiserBalance <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Top up campaign budget and advertiser balance before resuming'
      });
    }

    const channelsList = await Channel.find({
      _id: { $in: campaign.selectedChannelIds || [] },
      isPublic: { $ne: false },
      approvalStatus: 'approved'
    });

    const existingMap = new Map();
    (campaign.publishedChannels || []).forEach((p) => {
      existingMap.set(String(p.channelId), p);
    });

    const logs = [];
    for (const ch of channelsList) {
      try {
        const prev = existingMap.get(String(ch._id)) || null;
        const result = await dispatchCampaignToChannel(campaign, ch, prev, { forceRepublish: true });
        if (result && result.entry) {
          logs.push(result.entry);
        }
      } catch (err) {
        console.error('Resume dispatch failed:', err.message);
      }
    }

    campaign.publishedChannels = logs;
    campaign.status = 'active';
    await campaign.save();
    await createNotification('advertiser', 'campaign', 'Campaign Resumed', `Campaign "${campaign.title}" resumed publishing.`);
    return res.json({ success: true, data: campaign });
  }

  return res.status(400).json({ success: false, message: 'Invalid lifecycle action' });
}));

app.get('/api/campaigns', asyncHandler(async (req, res) => {
  const hasInitData = Boolean(req.headers['x-telegram-init-data']);
  if (hasInitData) {
    return authMiddleware(req, res, async () => {
      const userCampaignsSnap = await firestoreCampaigns.where('advertiserId', '==', req.user.telegramId).get();
      const sortedDocs = sortDocsDesc(userCampaignsSnap.docs, 'createdAt');

      const uniqueChannelIds = [...new Set(
        sortedDocs
          .map((d) => d.data()?.channelId)
          .filter(Boolean)
          .map((cid) => String(cid))
      )];

      const channelMap = new Map();
      if (uniqueChannelIds.length > 0) {
        const refs = uniqueChannelIds.map((cid) => firestoreChannels.doc(cid));
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

      const formattedCampaigns = sortedDocs.map((doc) => {
        const rawChannelId = doc.data()?.channelId ? String(doc.data().channelId) : null;
        const populatedChannel = rawChannelId && channelMap.has(rawChannelId)
          ? channelMap.get(rawChannelId)
          : rawChannelId;

        return serializeDoc(doc, { channelId: populatedChannel });
      });

      res.json({ success: true, campaigns: formattedCampaigns });
    });
  }

  const campaignsList = await Campaign.find().sort({ updatedAt: -1 });
  res.json({ success: true, data: campaignsList });
}));

app.post('/api/campaigns', asyncHandler(async (req, res) => {
  const hasInitData = Boolean(req.headers['x-telegram-init-data']);
  if (hasInitData && req.body.channelId && !req.body.targetLanguage) {
    return authMiddleware(req, res, async () => {
      const { channelId, title, adText, targetUrl } = req.body;
      if (!channelId || !title || !adText || !targetUrl) {
        return res.status(400).json({ success: false, message: 'Missing campaign fields' });
      }

      const channelDoc = await firestoreChannels.doc(String(channelId)).get();
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

      const newCampaignRef = firestoreCampaigns.doc();
      const newTxRef = firestoreTransactions.doc();
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
    });
  }

  const {
    title,
    adText,
    mediaType,
    mediaData,
    mediaName,
    targetUrl,
    buttonPreset,
    customButtonText,
    budget,
    targetLanguage,
    targetCategory,
    maxPricePerPost,
    scheduleMode,
    selectedChannelIds,
    status
  } = req.body;

  if (!title || !targetLanguage || !targetCategory || maxPricePerPost === undefined) {
    return res.status(400).json({ success: false, message: 'Missing required campaign fields' });
  }

  const numericPrice = Number(maxPricePerPost);
  if (isNaN(numericPrice) || numericPrice < 1 || numericPrice > 3) {
    return res.status(400).json({ success: false, message: 'Price must be between 1$ and 3$' });
  }

  if (!ALLOWED_LANGUAGES.includes(targetLanguage)) {
    return res.status(400).json({ success: false, message: 'Invalid language' });
  }

  if (!ALLOWED_CATEGORIES.includes(targetCategory)) {
    return res.status(400).json({ success: false, message: 'Invalid category' });
  }

  const numericBudget = budget !== undefined ? Number(budget) : 50;
  const isOpenTargeting = !isNaN(numericBudget) && numericBudget > 1000;
  const validScheduleMode = scheduleMode === 'peak' ? 'peak' : 'immediate';

  let finalStatus = 'draft';
  if (status === 'active') {
    finalStatus = validScheduleMode === 'peak' ? 'scheduled' : 'active';
  } else if (status === 'scheduled') {
    finalStatus = 'scheduled';
  } else if (['paused', 'completed'].includes(status)) {
    finalStatus = status;
  }

  const validIds = Array.isArray(selectedChannelIds)
    ? selectedChannelIds.filter((cid) => mongoose.Types.ObjectId.isValid(cid))
    : [];

  const campaign = await Campaign.create({
    title: String(title).trim(),
    adText: adText ? String(adText).trim() : '',
    mediaType: ['photo', 'video'].includes(mediaType) ? mediaType : 'none',
    mediaData: mediaData ? String(mediaData) : '',
    mediaName: mediaName ? String(mediaName).trim() : '',
    targetUrl: targetUrl ? String(targetUrl).trim() : '',
    buttonPreset: ['Open', 'View Offer', 'Join Channel', 'Custom'].includes(buttonPreset)
      ? buttonPreset
      : 'Open',
    customButtonText: customButtonText ? String(customButtonText).trim() : '',
    budget: isNaN(numericBudget) || numericBudget < 1 ? 50 : numericBudget,
    spentAmount: 0,
    totalViews: 0,
    openTargeting: isOpenTargeting,
    targetLanguage,
    targetCategory,
    maxPricePerPost: numericPrice,
    scheduleMode: validScheduleMode,
    scheduledAt: finalStatus === 'scheduled' ? computeNextPeakSlot() : null,
    selectedChannelIds: validIds,
    publishedChannels: [],
    status: finalStatus
  });

  if (finalStatus === 'active') {
    const channelsList = await Channel.find({
      _id: { $in: validIds },
      isPublic: { $ne: false },
      approvalStatus: 'approved'
    });

    const logs = [];
    for (const ch of channelsList) {
      try {
        const result = await dispatchCampaignToChannel(campaign, ch, null);
        if (result && result.entry) {
          logs.push(result.entry);
        }
      } catch (err) {
        console.error('Immediate dispatch failed:', err.message);
      }
    }
    campaign.publishedChannels = logs;
    await campaign.save();
  }

  await createNotification(
    'advertiser',
    'campaign',
    'Campaign Created',
    `Campaign "${campaign.title}" saved with status: ${campaign.status}.`
  );

  res.status(201).json({ success: true, data: campaign });
}));

app.put('/api/campaigns/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const {
    title,
    adText,
    mediaType,
    mediaData,
    mediaName,
    targetUrl,
    buttonPreset,
    customButtonText,
    budget,
    targetLanguage,
    targetCategory,
    maxPricePerPost,
    scheduleMode,
    selectedChannelIds,
    status
  } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, message: 'Invalid campaign ID' });
  }

  const campaign = await Campaign.findById(id);
  if (!campaign) {
    return res.status(404).json({ success: false, message: 'Campaign not found' });
  }

  if (title !== undefined) campaign.title = String(title).trim();
  if (adText !== undefined) campaign.adText = String(adText).trim();
  if (mediaType !== undefined) {
    campaign.mediaType = ['photo', 'video'].includes(mediaType) ? mediaType : 'none';
  }
  if (mediaData !== undefined) campaign.mediaData = String(mediaData);
  if (mediaName !== undefined) campaign.mediaName = String(mediaName).trim();
  if (targetUrl !== undefined) campaign.targetUrl = String(targetUrl).trim();
  if (buttonPreset !== undefined) {
    campaign.buttonPreset = ['Open', 'View Offer', 'Join Channel', 'Custom'].includes(buttonPreset)
      ? buttonPreset
      : 'Open';
  }
  if (customButtonText !== undefined) campaign.customButtonText = String(customButtonText).trim();

  if (budget !== undefined) {
    const bNum = Number(budget);
    if (!isNaN(bNum) && bNum >= 1) {
      campaign.budget = bNum;
      campaign.openTargeting = bNum > 1000;
    }
  }

  if (targetLanguage !== undefined) {
    if (!ALLOWED_LANGUAGES.includes(targetLanguage)) {
      return res.status(400).json({ success: false, message: 'Invalid language' });
    }
    campaign.targetLanguage = targetLanguage;
  }

  if (targetCategory !== undefined) {
    if (!ALLOWED_CATEGORIES.includes(targetCategory)) {
      return res.status(400).json({ success: false, message: 'Invalid category' });
    }
    campaign.targetCategory = targetCategory;
  }

  if (maxPricePerPost !== undefined) {
    const numericPrice = Number(maxPricePerPost);
    if (isNaN(numericPrice) || numericPrice < 1 || numericPrice > 3) {
      return res.status(400).json({ success: false, message: 'Price must be between 1$ and 3$' });
    }
    campaign.maxPricePerPost = numericPrice;
  }

  if (scheduleMode !== undefined) {
    campaign.scheduleMode = scheduleMode === 'peak' ? 'peak' : 'immediate';
  }

  if (Array.isArray(selectedChannelIds)) {
    campaign.selectedChannelIds = selectedChannelIds.filter((cid) =>
      mongoose.Types.ObjectId.isValid(cid)
    );
  }

  if (status !== undefined) {
    if (status === 'active') {
      if (campaign.scheduleMode === 'peak') {
        campaign.status = 'scheduled';
        campaign.scheduledAt = computeNextPeakSlot();
      } else {
        campaign.status = 'active';
        const channelsList = await Channel.find({
          _id: { $in: campaign.selectedChannelIds || [] },
          isPublic: { $ne: false },
          approvalStatus: 'approved'
        });
        const existingMap = new Map();
        (campaign.publishedChannels || []).forEach((p) => {
          existingMap.set(String(p.channelId), p);
        });
        const logs = [];
        for (const ch of channelsList) {
          try {
            const prev = existingMap.get(String(ch._id)) || null;
            const result = await dispatchCampaignToChannel(campaign, ch, prev);
            if (result && result.entry) {
              logs.push(result.entry);
            }
          } catch (err) {
            console.error('Publish update dispatch error:', err.message);
          }
        }
        campaign.publishedChannels = logs;
      }
    } else if (status === 'scheduled') {
      campaign.status = 'scheduled';
      campaign.scheduledAt = computeNextPeakSlot();
    } else if (['paused', 'completed', 'draft'].includes(status)) {
      campaign.status = status;
    }
  }

  await campaign.save();
  res.json({ success: true, data: campaign });
}));

app.delete('/api/campaigns/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, message: 'Invalid campaign ID' });
  }
  const deleted = await Campaign.findByIdAndDelete(id);
  if (!deleted) {
    return res.status(404).json({ success: false, message: 'Campaign not found' });
  }
  res.json({ success: true, message: 'Campaign deleted' });
}));

// ==================== WALLET ROUTES ====================

app.get('/api/wallet', asyncHandler(async (req, res) => {
  const wallet = await getOrCreateWallet();
  const transactionsList = await Transaction.find().sort({ createdAt: -1 }).limit(50);
  res.json({
    success: true,
    data: {
      advertiserBalance: Number(wallet.advertiserBalance.toFixed(4)),
      publisherBalance: Number(wallet.publisherBalance.toFixed(4)),
      transactions: transactionsList
    }
  });
}));

app.post('/api/wallet/deposit', asyncHandler(async (req, res) => {
  const hasInitData = Boolean(req.headers['x-telegram-init-data']);
  if (hasInitData && !req.body.role) {
    return authMiddleware(req, res, async () => {
      const amount = Number(req.body.amount);
      if (!amount || amount < 1) {
        return res.status(400).json({ success: false, message: 'Minimum deposit is 1 USD' });
      }

      const txRef = firestoreTransactions.doc();
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
    });
  }

  const { role, amount, note, idempotencyKey } = req.body;
  const numericAmount = Number(amount);
  if (!['advertiser', 'publisher'].includes(role) || isNaN(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({ success: false, message: 'Invalid deposit role or amount' });
  }

  if (idempotencyKey) {
    const existingTx = await Transaction.findOne({ idempotencyKey: String(idempotencyKey).trim() });
    if (existingTx) {
      const walletNow = await getOrCreateWallet();
      return res.json({
        success: true,
        duplicatePrevented: true,
        data: { wallet: walletNow, transaction: existingTx }
      });
    }
  }

  const wallet = await getOrCreateWallet();
  if (role === 'advertiser') {
    wallet.advertiserBalance = Number((wallet.advertiserBalance + numericAmount).toFixed(4));
  } else {
    wallet.publisherBalance = Number((wallet.publisherBalance + numericAmount).toFixed(4));
  }
  await wallet.save();

  const tx = await Transaction.create({
    idempotencyKey: idempotencyKey ? String(idempotencyKey).trim() : undefined,
    walletRole: role,
    type: 'deposit',
    amount: numericAmount,
    note: note ? String(note).trim() : 'Deposit'
  });

  await createNotification(
    role,
    'wallet',
    'Wallet Deposit',
    `Deposited ${numericAmount.toFixed(2)}$ into ${role} wallet.`
  );

  res.status(201).json({ success: true, data: { wallet, transaction: tx } });
}));

app.post('/api/wallet/withdraw', asyncHandler(async (req, res) => {
  const hasInitData = Boolean(req.headers['x-telegram-init-data']);
  if (hasInitData && !req.body.role) {
    return authMiddleware(req, res, async () => {
      const amount = Number(req.body.amount);
      const walletAddress = (req.body.walletAddress || '').trim();

      if (!amount || amount < 5 || !walletAddress) {
        return res.status(400).json({ success: false, message: 'Minimum withdrawal is $5 and wallet address is required' });
      }

      if (req.user.balance < amount) {
        return res.status(400).json({ success: false, message: 'Insufficient earnings balance' });
      }

      const txRef = firestoreTransactions.doc();
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
    });
  }

  const { role, amount, note, idempotencyKey } = req.body;
  const numericAmount = Number(amount);
  if (!['advertiser', 'publisher'].includes(role) || isNaN(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({ success: false, message: 'Invalid withdrawal role or amount' });
  }

  if (idempotencyKey) {
    const existingTx = await Transaction.findOne({ idempotencyKey: String(idempotencyKey).trim() });
    if (existingTx) {
      const walletNow = await getOrCreateWallet();
      return res.json({
        success: true,
        duplicatePrevented: true,
        data: { wallet: walletNow, transaction: existingTx }
      });
    }
  }

  const wallet = await getOrCreateWallet();
  if (role === 'advertiser') {
    if (wallet.advertiserBalance < numericAmount) {
      return res.status(400).json({ success: false, message: 'Insufficient advertiser balance' });
    }
    wallet.advertiserBalance = Number((wallet.advertiserBalance - numericAmount).toFixed(4));
  } else {
    if (wallet.publisherBalance < numericAmount) {
      return res.status(400).json({ success: false, message: 'Insufficient publisher balance' });
    }
    wallet.publisherBalance = Number((wallet.publisherBalance - numericAmount).toFixed(4));
  }
  await wallet.save();

  const tx = await Transaction.create({
    idempotencyKey: idempotencyKey ? String(idempotencyKey).trim() : undefined,
    walletRole: role,
    type: 'withdraw',
    amount: numericAmount,
    note: note ? String(note).trim() : 'Withdraw'
  });

  await createNotification(
    role,
    'wallet',
    'Wallet Withdrawal',
    `Withdrew ${numericAmount.toFixed(2)}$ from ${role} wallet.`
  );

  res.status(201).json({ success: true, data: { wallet, transaction: tx } });
}));

// ==================== ADMIN PROTECTED ROUTES ====================

app.get('/api/admin/dashboard', authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const [
    allUsersSnap,
    pendingChannelsSnap,
    pendingTxSnap,
    pendingCampaignsSnap,
    allLogsSnap
  ] = await Promise.all([
    firestoreUsers.get(),
    firestoreChannels.where('status', '==', 'pending').get(),
    firestoreTransactions.where('status', '==', 'pending').get(),
    firestoreCampaigns.where('status', '==', 'pending').get(),
    firestoreSecurityLogs.get()
  ]);

  const pendingChannels = sortDocsDesc(pendingChannelsSnap.docs, 'createdAt')
    .map((doc) => serializeDoc(doc));

  const pendingTransactions = sortDocsDesc(pendingTxSnap.docs, 'createdAt')
    .map((doc) => serializeDoc(doc));

  const sortedPendingCampaignDocs = sortDocsDesc(pendingCampaignsSnap.docs, 'createdAt');
  const uniqueChannelIds = [...new Set(
    sortedPendingCampaignDocs
      .map((d) => d.data()?.channelId)
      .filter(Boolean)
      .map((cid) => String(cid))
  )];

  const channelMap = new Map();
  if (uniqueChannelIds.length > 0) {
    const refs = uniqueChannelIds.map((cid) => firestoreChannels.doc(cid));
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

  const pendingCampaigns = sortedPendingCampaignDocs.map((doc) => {
    const rawChannelId = doc.data()?.channelId ? String(doc.data().channelId) : null;
    const populatedChannel = rawChannelId && channelMap.has(rawChannelId)
      ? channelMap.get(rawChannelId)
      : rawChannelId;

    return serializeDoc(doc, { channelId: populatedChannel });
  });

  const formattedSecurityLogs = sortDocsDesc(allLogsSnap.docs, 'createdAt')
    .slice(0, 30)
    .map((doc) => serializeDoc(doc));

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

  const channelRef = firestoreChannels.doc(String(req.params.id));
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

  const txRef = firestoreTransactions.doc(String(req.params.id));
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
  const campaignRef = firestoreCampaigns.doc(String(req.params.id));
  const campaignSnap = await campaignRef.get();
  if (!campaignSnap.exists || campaignSnap.data()?.status !== 'pending') {
    return res.status(404).json({ success: false, message: 'Pending campaign not found' });
  }

  const campaignData = campaignSnap.data() || {};
  const channelIdStr = campaignData.channelId ? String(campaignData.channelId) : '';
  const channelDoc = channelIdStr ? await firestoreChannels.doc(channelIdStr).get() : null;
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
  const earnTxRef = firestoreTransactions.doc();
  const refTxRef = firestoreTransactions.doc();

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

// ==================== ERROR HANDLING & SERVER START ====================

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

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Telega-Ads running on port ${PORT}`);
  });

  if (MONGODB_URI) {
    ensureMongoConnection().then((connected) => {
      if (connected) {
        setInterval(syncAllChannels, SYNC_INTERVAL_MS);
        setInterval(processDueScheduledCampaigns, 60000);
        setInterval(() => {
          runDatabaseBackup('interval').catch((e) => console.error(e));
        }, BACKUP_INTERVAL_MS);
      }
    });
  }
}

module.exports = app;
