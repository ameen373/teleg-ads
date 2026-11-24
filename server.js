require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
const {
  admin,
  db,
  users: firestoreUsers,
  channels: firestoreChannels,
  campaigns: firestoreCampaigns,
  transactions: firestoreTransactions,
  securityLogs: firestoreSecurityLogs,
  ALLOWED_LANGUAGES,
  ALLOWED_CATEGORIES
} = require('./models');

const firestoreReferrals = db.collection('referrals');
const firestoreWallets = db.collection('wallets');
const firestorePublishLogs = db.collection('publishLogs');
const firestoreNotifications = db.collection('notifications');
const firestoreBackups = db.collection('backups');

const app = express();
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN || '';
const BOT_USERNAME = (process.env.BOT_USERNAME || 'adTelega_bot').replace(/^@/, '');
const SYNC_INTERVAL_MS = Number(process.env.SYNC_INTERVAL_MS) || 300000;
const BACKUP_INTERVAL_MS = Number(process.env.BACKUP_INTERVAL_MS) || 21600000;
const DEFAULT_WALLET_KEY = 'default_account';
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

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// ==================== FIRESTORE HELPERS ====================

const toIsoString = (val) => {
  try {
    if (!val) return new Date().toISOString();
    if (typeof val.toDate === 'function') return val.toDate().toISOString();
    if (val instanceof Date) return val.toISOString();
    return new Date(val).toISOString();
  } catch (err) {
    return new Date().toISOString();
  }
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
  if (obj.updatedAt !== undefined) obj.updatedAt = toIsoString(obj.updatedAt);
  if (obj.lastActive !== undefined) obj.lastActive = toIsoString(obj.lastActive);
  if (obj.lastSyncedAt !== undefined && obj.lastSyncedAt) obj.lastSyncedAt = toIsoString(obj.lastSyncedAt);
  if (obj.scheduledAt !== undefined && obj.scheduledAt) obj.scheduledAt = toIsoString(obj.scheduledAt);
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

const isValidDocId = (id) => typeof id === 'string' && id.trim().length > 0 && !id.includes('/');

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
    const docRef = await firestoreNotifications.add({
      audience: ['advertiser', 'publisher', 'admin'].includes(audience) ? audience : 'admin',
      category: ['channel', 'campaign', 'wallet', 'system'].includes(category) ? category : 'system',
      title: String(title).trim(),
      message: String(message).trim(),
      isRead: false,
      createdAt: new Date()
    });
    const snap = await docRef.get();
    return serializeDoc(snap);
  } catch (err) {
    console.error('Failed to create notification:', err.message);
    return null;
  }
}

async function runDatabaseBackup(reason = 'scheduled') {
  try {
    const [
      usersSnap,
      channelsSnap,
      campaignsSnap,
      referralsSnap,
      walletsSnap,
      transactionsSnap,
      publishLogsSnap,
      notificationsSnap
    ] = await Promise.all([
      firestoreUsers.get(),
      firestoreChannels.get(),
      firestoreCampaigns.get(),
      firestoreReferrals.get(),
      firestoreWallets.get(),
      firestoreTransactions.get(),
      firestorePublishLogs.get(),
      firestoreNotifications.get()
    ]);

    const mapSnap = (snap) => snap.docs.map((d) => serializeDoc(d));

    const usersList = mapSnap(usersSnap);
    const channelsList = mapSnap(channelsSnap);
    const campaignsList = mapSnap(campaignsSnap);
    const referralsList = mapSnap(referralsSnap);
    const walletList = mapSnap(walletsSnap);
    const transactionsList = mapSnap(transactionsSnap);
    const publishLogsList = mapSnap(publishLogsSnap);
    const notificationsList = mapSnap(notificationsSnap);

    const snapshot = {
      createdAt: new Date().toISOString(),
      reason,
      users: usersList,
      channels: channelsList,
      campaigns: campaignsList,
      referrals: referralsList,
      wallet: walletList,
      transactions: transactionsList,
      publishLogs: publishLogsList,
      notifications: notificationsList
    };

    const totalRecords =
      usersList.length +
      channelsList.length +
      campaignsList.length +
      referralsList.length +
      walletList.length +
      transactionsList.length +
      publishLogsList.length +
      notificationsList.length;

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `telega_ads_firestore_backup_${timestamp}.json`;

    try {
      const backupDir = path.join(__dirname, 'backups');
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }
      fs.writeFileSync(path.join(backupDir, filename), JSON.stringify(snapshot, null, 2), 'utf8');
    } catch (fsErr) {
      console.error('Local backup file skipped:', fsErr.message);
    }

    const docRef = await firestoreBackups.add({
      filename,
      collectionsCount: 8,
      totalRecords,
      status: 'completed',
      note: `Firestore Backup (${reason})`,
      snapshotData: snapshot,
      createdAt: new Date()
    });

    await createNotification(
      'admin',
      'system',
      'Database Backup Completed',
      `Snapshot ${filename} saved with ${totalRecords} records.`
    );

    const createdSnap = await docRef.get();
    return serializeDoc(createdSnap);
  } catch (err) {
    console.error('Backup failed:', err.message);
    try {
      const failRef = await firestoreBackups.add({
        filename: `backup_failed_${Date.now()}.json`,
        collectionsCount: 0,
        totalRecords: 0,
        status: 'failed',
        note: err.message,
        createdAt: new Date()
      });
      const failSnap = await failRef.get();
      return serializeDoc(failSnap);
    } catch (logErr) {
      console.error('Failed to write backup failure record:', logErr.message);
      return null;
    }
  }
}

// ==================== WALLET & TELEGRAM HELPERS ====================

async function getOrCreateWallet() {
  const docRef = firestoreWallets.doc(DEFAULT_WALLET_KEY);
  const snap = await docRef.get();
  if (!snap.exists) {
    const now = new Date();
    await docRef.set({
      ownerKey: DEFAULT_WALLET_KEY,
      advertiserBalance: 0,
      publisherBalance: 0,
      createdAt: now,
      updatedAt: now
    });
    const freshSnap = await docRef.get();
    return serializeDoc(freshSnap);
  }
  return serializeDoc(snap);
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
  const channelId = channel._id || channel.id;
  const refCode = channel && channel.referralCode ? channel.referralCode : `ch_${channelId}`;
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
  const channelId = channel._id || channel.id;
  if (channel.introPostSent) return false;
  const chatIdentifier = channel.chatId || channel.username;
  if (!chatIdentifier) return false;

  const refParam = channel.referralCode || `ch_${channelId}`;
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

  await firestoreChannels.doc(String(channelId)).update({
    introPostSent: true,
    updatedAt: new Date()
  });
  channel.introPostSent = true;
  return true;
}

async function dispatchCampaignToChannel(campaign, channel, existingEntry, options = {}) {
  const forceRepublish = Boolean(options.forceRepublish);
  const campaignId = campaign._id || campaign.id;
  const channelId = channel._id || channel.id;
  const dedupKey = `${campaignId}_${channelId}`;

  const existingSnap = await firestorePublishLogs
    .where('dedupKey', '==', dedupKey)
    .where('status', '==', 'published')
    .limit(1)
    .get();

  if (!existingSnap.empty && !forceRepublish && existingEntry && existingEntry.messageId) {
    await firestorePublishLogs.add({
      dedupKey: `${dedupKey}_dup_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`,
      campaignId,
      campaignTitle: campaign.title,
      channelId,
      channelName: channel.name || channel.title || '',
      messageId: existingEntry.messageId,
      status: 'duplicate_prevented',
      details: 'Duplicate ad dispatch prevented automatically',
      createdAt: new Date()
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
      : `https://t.me/${BOT_USERNAME}?start=${encodeURIComponent(channel.referralCode || `ch_${channelId}`)}`;

  let sentMessageId = existingEntry && existingEntry.messageId ? existingEntry.messageId : null;
  const chatIdentifier = channel.chatId || channel.username;
  const channelTitle = channel.name || channel.title || '';

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

    await firestorePublishLogs.doc(logKey).set({
      dedupKey: logKey,
      campaignId,
      campaignTitle: campaign.title,
      channelId,
      channelName: channelTitle,
      messageId: sentMessageId,
      status: 'published',
      details: 'Published successfully with locked content',
      publishedAt: new Date(),
      createdAt: new Date()
    }, { merge: true });

    return {
      entry: {
        channelId,
        channelName: channelTitle,
        messageId: sentMessageId,
        views: existingEntry && existingEntry.views ? existingEntry.views : 0,
        earnings: existingEntry && existingEntry.earnings ? existingEntry.earnings : 0,
        publisherRefCode: channel.referralCode || `ch_${channelId}`,
        renderedAdText: renderedText,
        lockedContent: true,
        noForwarding: true,
        publishedAt: new Date().toISOString()
      },
      duplicatePrevented: false
    };
  } catch (sendErr) {
    await firestorePublishLogs.add({
      dedupKey: `${dedupKey}_err_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`,
      campaignId,
      campaignTitle: campaign.title,
      channelId,
      channelName: channelTitle,
      messageId: sentMessageId,
      status: 'failed',
      details: sendErr.message,
      createdAt: new Date()
    });

    await createNotification(
      'advertiser',
      'campaign',
      'Ad Dispatch Issue',
      `Campaign "${campaign.title}" could not be delivered to ${channelTitle}: ${sendErr.message}`
    );

    throw sendErr;
  }
}

async function syncSingleChannel(channel) {
  const channelId = channel._id || channel.id;
  const identifier = channel.chatId || channel.username;
  if (!identifier || !channelId) {
    return channel;
  }

  try {
    const chatInfo = await callTelegramApi('getChat', { chat_id: identifier });
    const isPublicChannel = chatInfo.type === 'channel' && Boolean(chatInfo.username);

    if (!isPublicChannel) {
      const updates = {
        isPublic: false,
        approvalStatus: 'rejected',
        botAdded: false,
        botPermissionsOk: false,
        lastPermissionCheckAt: new Date(),
        lastSyncedAt: new Date(),
        updatedAt: new Date()
      };
      await firestoreChannels.doc(String(channelId)).update(updates);
      return { ...channel, ...updates };
    }

    let botAdded = Boolean(channel.botAdded);
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

      botAdded = Boolean(activeAdmin);
      permsOk = Boolean(activeAdmin && canPost);

      if (!activeAdmin) {
        await createNotification(
          'publisher',
          'channel',
          'Bot Admin Removed',
          `Bot @${BOT_USERNAME} is no longer an admin in channel ${chatInfo.title || channel.name} (@${chatInfo.username}).`
        );
      }
    } catch (permErr) {
      permsOk = Boolean(botAdded);
    }

    const memberCount = await callTelegramApi('getChatMemberCount', { chat_id: chatInfo.id });
    const subscribersCount = Number(memberCount) || 0;
    const smartPrice = computeSmartPrice(subscribersCount, channel.price);

    let approvalStatus = channel.approvalStatus || 'pending_review';
    if (approvalStatus !== 'rejected') {
      const nextStatus = evaluateApprovalBySubscribers(subscribersCount);
      if (nextStatus === 'approved') {
        approvalStatus = 'approved';
      }
    }

    const referralCode = channel.referralCode || generateReferralCode();

    const updates = {
      isPublic: true,
      chatId: String(chatInfo.id),
      username: `@${chatInfo.username}`,
      name: chatInfo.title || channel.name,
      subscribersCount,
      botAdded,
      botPermissionsOk: permsOk,
      lastPermissionCheckAt: new Date(),
      price: smartPrice,
      pricePer1000Views: smartPrice,
      approvalStatus,
      referralCode,
      lastSyncedAt: new Date(),
      updatedAt: new Date()
    };

    await firestoreChannels.doc(String(channelId)).update(updates);
    const mergedChannel = { ...channel, ...updates };

    if (mergedChannel.approvalStatus === 'approved' && mergedChannel.botAdded && !mergedChannel.introPostSent) {
      try {
        await sendFreeIntroPost(mergedChannel);
      } catch (postErr) {
        console.error('Failed to send free intro post:', postErr.message);
      }
    }

    return mergedChannel;
  } catch (err) {
    console.error(`Sync failed for channel ${channel.username || channelId}:`, err.message);
    return channel;
  }
}

async function syncAllChannels() {
  try {
    const snap = await firestoreChannels.get();
    for (const doc of snap.docs) {
      await syncSingleChannel(serializeDoc(doc));
    }
  } catch (err) {
    console.error('Error during channels sync loop:', err.message);
  }
}

async function processDueScheduledCampaigns() {
  try {
    const now = new Date();
    const snap = await firestoreCampaigns.where('status', '==', 'scheduled').get();

    for (const doc of snap.docs) {
      const camp = serializeDoc(doc);
      const schedTime = camp.scheduledAt ? new Date(camp.scheduledAt) : null;
      if (!schedTime || schedTime > now) continue;

      const allChannelsSnap = await firestoreChannels.get();
      const selectedSet = new Set((camp.selectedChannelIds || []).map(String));
      const targetChannels = allChannelsSnap.docs
        .map((d) => serializeDoc(d))
        .filter((ch) => selectedSet.has(ch.id) && ch.isPublic !== false && ch.approvalStatus === 'approved');

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

      await firestoreCampaigns.doc(camp.id).update({
        publishedChannels: logs,
        status: 'active',
        updatedAt: new Date()
      });
    }
  } catch (err) {
    console.error('Error processing scheduled campaigns:', err.message);
  }
}

async function processTelegramUpdate(update) {
  try {
    if (!update || typeof update !== 'object') return;

    if (update.my_chat_member) {
      const mcm = update.my_chat_member;
      const chat = mcm.chat;
      const actor = mcm.from;
      const newStatus = mcm.new_chat_member ? mcm.new_chat_member.status : '';

      if (chat && chat.type === 'channel') {
        const isPublic = Boolean(chat.username);
        const formattedUsername = chat.username ? `@${chat.username}` : '';

        const byChatSnap = await firestoreChannels.where('chatId', '==', String(chat.id)).limit(1).get();
        let existingDoc = !byChatSnap.empty ? byChatSnap.docs[0] : null;
        if (!existingDoc && formattedUsername) {
          const byUserSnap = await firestoreChannels.where('username', '==', formattedUsername).limit(1).get();
          if (!byUserSnap.empty) existingDoc = byUserSnap.docs[0];
        }

        if (!isPublic) {
          if (existingDoc) {
            await existingDoc.ref.update({
              chatId: String(chat.id),
              isPublic: false,
              botAdded: false,
              botPermissionsOk: false,
              approvalStatus: 'rejected',
              lastSyncedAt: new Date(),
              updatedAt: new Date()
            });
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

        const autoApproval = evaluateApprovalBySubscribers(subscriberCount);
        const smartPrice = computeSmartPrice(subscriberCount, 1);

        let channelObj = null;
        if (!existingDoc && isAdminNow) {
          const now = new Date();
          const newRef = await firestoreChannels.add({
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
            introPostSent: false,
            lastPermissionCheckAt: now,
            lastSyncedAt: now,
            createdAt: now,
            updatedAt: now
          });
          channelObj = serializeDoc(await newRef.get());
        } else if (existingDoc) {
          const prev = existingDoc.data() || {};
          const nextSubCount = Number(subscriberCount) || Number(prev.subscribersCount || 0);
          const nextPrice = computeSmartPrice(nextSubCount, prev.price);
          const nextApproval =
            prev.approvalStatus === 'rejected'
              ? 'rejected'
              : evaluateApprovalBySubscribers(nextSubCount);

          const updates = {
            name: chat.title || prev.name,
            username: formattedUsername,
            chatId: String(chat.id),
            isPublic: true,
            subscribersCount: nextSubCount,
            botAdded: isAdminNow,
            botPermissionsOk: isAdminNow,
            lastPermissionCheckAt: new Date(),
            ownerTelegramId: prev.ownerTelegramId || actorId,
            ownerUsername: prev.ownerUsername || actorUsername,
            ownerName: prev.ownerName || actorName,
            referralCode: prev.referralCode || generateReferralCode(),
            price: nextPrice,
            pricePer1000Views: nextPrice,
            approvalStatus: nextApproval,
            lastSyncedAt: new Date(),
            updatedAt: new Date()
          };

          await existingDoc.ref.update(updates);
          channelObj = serializeDoc(await existingDoc.ref.get());
        }

        if (channelObj && channelObj.botAdded && channelObj.approvalStatus === 'approved' && !channelObj.introPostSent) {
          try {
            await sendFreeIntroPost(channelObj);
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
          const chSnap = await firestoreChannels.where('referralCode', '==', startParam).limit(1).get();
          const publisherChannel = !chSnap.empty ? serializeDoc(chSnap.docs[0]) : null;
          const publisherId = publisherChannel
            ? publisherChannel.ownerTelegramId || publisherChannel.id
            : startParam;

          if (publisherId && String(referredUser.id) !== String(publisherId)) {
            const existingRefSnap = await firestoreReferrals
              .where('publisherTelegramId', '==', String(publisherId))
              .where('referredTelegramId', '==', String(referredUser.id))
              .limit(1)
              .get();

            if (existingRefSnap.empty) {
              await firestoreReferrals.add({
                publisherTelegramId: String(publisherId),
                channelId: publisherChannel ? publisherChannel.id : null,
                referredTelegramId: String(referredUser.id),
                referredUsername: referredUser.username ? `@${referredUser.username}` : '',
                sourceRole,
                commissionEligible: true,
                createdAt: new Date()
              });

              if (publisherChannel) {
                await firestoreChannels.doc(publisherChannel.id).update({
                  referralsCount: admin.firestore.FieldValue.increment(1)
                });
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
  } catch (err) {
    console.error('Error processing Telegram update:', err.message);
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
  const snap = await firestorePublishLogs.get();
  const logs = sortDocsDesc(snap.docs, 'createdAt')
    .slice(0, 100)
    .map((d) => serializeDoc(d));
  res.json({ success: true, data: logs });
}));

app.get('/api/notifications', asyncHandler(async (req, res) => {
  const snap = await firestoreNotifications.get();
  const sorted = sortDocsDesc(snap.docs, 'createdAt');
  const notificationsList = sorted.slice(0, 60).map((d) => serializeDoc(d));
  const unreadCount = sorted.filter((d) => !d.data()?.isRead).length;
  res.json({ success: true, data: notificationsList, unreadCount });
}));

app.post('/api/notifications/read-all', asyncHandler(async (req, res) => {
  const snap = await firestoreNotifications.where('isRead', '==', false).get();
  if (!snap.empty) {
    const batch = db.batch();
    snap.docs.forEach((doc) => {
      batch.update(doc.ref, { isRead: true });
    });
    await batch.commit();
  }
  res.json({ success: true });
}));

app.get('/api/system/health', asyncHandler(async (req, res) => {
  const snap = await firestoreChannels.get();
  const channelsList = snap.docs.map((d) => d.data() || {});
  const activeChannels = channelsList.filter((c) => c.botAdded && c.botPermissionsOk !== false);
  const botConfigured = Boolean(BOT_TOKEN && BOT_TOKEN !== 'your_telegram_bot_token_here');

  res.json({
    success: true,
    data: {
      serverStatus: 'healthy',
      database: 'Firebase Cloud Firestore',
      firestoreConnected: Boolean(db),
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
  const snap = await firestoreBackups.get();
  const backups = sortDocsDesc(snap.docs, 'createdAt')
    .slice(0, 20)
    .map((d) => {
      const item = serializeDoc(d);
      const { snapshotData, ...meta } = item;
      return meta;
    });
  res.json({ success: true, data: backups });
}));

app.post('/api/system/backups', asyncHandler(async (req, res) => {
  const record = await runDatabaseBackup('manual');
  if (!record) {
    return res.status(500).json({ success: false, message: 'Failed to create backup record' });
  }
  const { snapshotData, ...meta } = record;
  res.status(201).json({
    success: true,
    data: meta
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

  const chSnap = await firestoreChannels.where('referralCode', '==', String(referralCode)).limit(1).get();
  const channel = !chSnap.empty ? serializeDoc(chSnap.docs[0]) : null;
  const publisherId = channel ? channel.ownerTelegramId || channel.id : String(referralCode);

  const existingSnap = await firestoreReferrals
    .where('publisherTelegramId', '==', String(publisherId))
    .where('referredTelegramId', '==', String(referredTelegramId))
    .limit(1)
    .get();

  if (!existingSnap.empty) {
    return res.json({ success: true, duplicate: true, data: serializeDoc(existingSnap.docs[0]) });
  }

  const refDoc = await firestoreReferrals.add({
    publisherTelegramId: String(publisherId),
    channelId: channel ? channel.id : null,
    referredTelegramId: String(referredTelegramId),
    referredUsername: referredUsername ? String(referredUsername).trim() : '',
    sourceRole: 'publisher',
    commissionEligible: true,
    createdAt: new Date()
  });

  if (channel) {
    await firestoreChannels.doc(channel.id).update({
      referralsCount: admin.firestore.FieldValue.increment(1)
    });
  }

  const created = serializeDoc(await refDoc.get());
  res.status(201).json({ success: true, duplicate: false, data: created });
}));

app.get('/api/referrals', asyncHandler(async (req, res) => {
  const snap = await firestoreReferrals.where('commissionEligible', '==', true).get();
  const filteredDocs = snap.docs.filter((d) => d.data()?.sourceRole !== 'advertiser');
  const sorted = sortDocsDesc(filteredDocs, 'createdAt');

  const uniqueChannelIds = [...new Set(
    sorted.map((d) => d.data()?.channelId).filter(Boolean).map(String)
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
          name: cData.name || cData.title || '',
          username: cData.username || cData.channelUsername || '',
          referralCode: cData.referralCode || ''
        });
      }
    }
  }

  const data = sorted.map((doc) => {
    const cid = doc.data()?.channelId ? String(doc.data().channelId) : null;
    return serializeDoc(doc, {
      channelId: cid && channelMap.has(cid) ? channelMap.get(cid) : cid
    });
  });

  res.json({ success: true, data });
}));

// ==================== MARKETPLACE & CHANNELS ROUTES ====================

app.get('/api/marketplace/channels', asyncHandler(async (req, res) => {
  const { search, language, category, maxPrice, openTargeting, favoritesOnly } = req.query;
  const isOpen = openTargeting === 'true';

  const snap = await firestoreChannels.where('approvalStatus', '==', 'approved').get();

  let items = snap.docs
    .map((d) => serializeDoc(d))
    .filter((ch) => ch.isPublic !== false);

  if (!isOpen) {
    if (language && ALLOWED_LANGUAGES.includes(language)) {
      items = items.filter((ch) => ch.language === language);
    }
    if (category && ALLOWED_CATEGORIES.includes(category)) {
      items = items.filter((ch) => ch.category === category);
    }
  }

  if (maxPrice !== undefined && maxPrice !== '') {
    const priceNum = Number(maxPrice);
    if (!isNaN(priceNum)) {
      items = items.filter((ch) => Number(ch.pricePer1000Views ?? ch.price ?? 0) <= priceNum);
    }
  }

  if (favoritesOnly === 'true') {
    items = items.filter((ch) => Boolean(ch.isFavorite));
  }

  if (search && String(search).trim()) {
    const term = String(search).trim().toLowerCase();
    items = items.filter((ch) => String(ch.name || ch.title || '').toLowerCase().includes(term));
  }

  items.sort((a, b) => {
    const favDiff = Number(Boolean(b.isFavorite)) - Number(Boolean(a.isFavorite));
    if (favDiff !== 0) return favDiff;
    return Number(b.subscribersCount || 0) - Number(a.subscribersCount || 0);
  });

  const projected = items.map((ch) => ({
    _id: ch._id,
    id: ch.id,
    name: ch.name || ch.title || '',
    photoUrl: ch.photoUrl || '',
    subscribersCount: Number(ch.subscribersCount || 0),
    pricePer1000Views: Number(ch.pricePer1000Views ?? ch.price ?? 0),
    price: Number(ch.price ?? ch.pricePer1000Views ?? 0),
    language: ch.language || '',
    category: ch.category || '',
    isFavorite: Boolean(ch.isFavorite),
    approvalStatus: ch.approvalStatus
  }));

  res.json({ success: true, data: projected });
}));

app.post('/api/channels/:id/favorite', asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!isValidDocId(id)) {
    return res.status(400).json({ success: false, message: 'Invalid channel ID' });
  }

  const docRef = firestoreChannels.doc(String(id));
  const snap = await docRef.get();
  if (!snap.exists) {
    return res.status(404).json({ success: false, message: 'Channel not found' });
  }

  const nextFav = !Boolean(snap.data()?.isFavorite);
  await docRef.update({ isFavorite: nextFav, updatedAt: new Date() });
  const updated = serializeDoc(await docRef.get());
  res.json({ success: true, data: updated });
}));

app.post('/api/channels/:id/verify', asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!isValidDocId(id)) {
    return res.status(400).json({ success: false, message: 'Invalid channel ID' });
  }

  const docRef = firestoreChannels.doc(String(id));
  const snap = await docRef.get();
  if (!snap.exists) {
    return res.status(404).json({ success: false, message: 'Channel not found' });
  }

  let channel = serializeDoc(snap);
  const rawUsername = String(channel.username || channel.channelUsername || '');
  const cleanUsername = rawUsername.replace(/^@/, '');

  if (!cleanUsername || rawUsername.includes('+') || rawUsername.includes('joinchat')) {
    const rejUpdates = {
      isPublic: false,
      approvalStatus: 'rejected',
      botAdded: false,
      botPermissionsOk: false,
      updatedAt: new Date()
    };
    await docRef.update(rejUpdates);
    return res.status(400).json({
      success: false,
      message: 'Private channels are not accepted. Only public channels are allowed.',
      data: { ...channel, ...rejUpdates }
    });
  }

  const chatInfo = await callTelegramApi('getChat', { chat_id: `@${cleanUsername}` });
  if (chatInfo.type !== 'channel' || !chatInfo.username) {
    const rejUpdates = {
      isPublic: false,
      approvalStatus: 'rejected',
      botAdded: false,
      botPermissionsOk: false,
      updatedAt: new Date()
    };
    await docRef.update(rejUpdates);
    return res.status(400).json({
      success: false,
      message: 'Only public Telegram channels are accepted.',
      data: { ...channel, ...rejUpdates }
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

  let ownerTelegramId = channel.ownerTelegramId || '';
  let ownerUsername = channel.ownerUsername || '';
  let ownerName = channel.ownerName || '';

  try {
    const admins = await callTelegramApi('getChatAdministrators', { chat_id: chatInfo.id });
    const promoter = admins.find(
      (adminMember) => adminMember.promoted_by && adminMember.user && adminMember.user.username === BOT_USERNAME
    );
    if (promoter && promoter.promoted_by && !ownerTelegramId) {
      ownerTelegramId = String(promoter.promoted_by.id);
      ownerUsername = promoter.promoted_by.username
        ? `@${promoter.promoted_by.username}`
        : '';
      ownerName = [promoter.promoted_by.first_name, promoter.promoted_by.last_name]
        .filter(Boolean)
        .join(' ');
    }
  } catch (adminErr) {
    // Ignore if unable to read administrators list
  }

  const subNum = Number(subscribersCount) || 0;
  const smartPrice = computeSmartPrice(subNum, channel.price);
  const updates = {
    chatId: String(chatInfo.id),
    isPublic: true,
    name: chatInfo.title || channel.name,
    username: `@${chatInfo.username}`,
    subscribersCount: subNum,
    botAdded: true,
    botPermissionsOk: true,
    lastPermissionCheckAt: new Date(),
    ownerTelegramId,
    ownerUsername,
    ownerName,
    price: smartPrice,
    pricePer1000Views: smartPrice,
    approvalStatus: evaluateApprovalBySubscribers(subNum),
    referralCode: channel.referralCode || generateReferralCode(),
    lastSyncedAt: new Date(),
    updatedAt: new Date()
  };

  await docRef.update(updates);
  channel = serializeDoc(await docRef.get());

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

  if (!isValidDocId(id)) {
    return res.status(400).json({ success: false, message: 'Invalid channel ID' });
  }

  if (decision !== 'approved' && decision !== 'rejected') {
    return res.status(400).json({ success: false, message: 'Decision must be approved or rejected' });
  }

  const docRef = firestoreChannels.doc(String(id));
  const snap = await docRef.get();
  if (!snap.exists) {
    return res.status(404).json({ success: false, message: 'Channel not found' });
  }

  let channel = serializeDoc(snap);
  if (channel.isPublic === false) {
    return res.status(400).json({ success: false, message: 'Private channels cannot be approved' });
  }

  await docRef.update({ approvalStatus: decision, updatedAt: new Date() });
  channel = serializeDoc(await docRef.get());

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
  if (!isValidDocId(id)) {
    return res.status(400).json({ success: false, message: 'Invalid channel ID' });
  }

  const docRef = firestoreChannels.doc(String(id));
  const snap = await docRef.get();
  if (!snap.exists) {
    return res.status(404).json({ success: false, message: 'Channel not found' });
  }

  const updated = await syncSingleChannel(serializeDoc(snap));
  res.json({ success: true, data: updated });
}));

app.get('/api/channels', asyncHandler(async (req, res) => {
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

  const snap = await firestoreChannels.get();
  const channelsList = sortDocsDesc(snap.docs, 'createdAt').map((doc) => serializeDoc(doc));
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
      const now = new Date();
      await newChannelRef.set({
        ownerId: req.user.telegramId,
        channelUsername: cleanUsername,
        title: String(title).trim(),
        subscribers: Number(subscribers) || 0,
        category: category || 'general',
        pricePerPost: numericPrice,
        status: 'pending',
        totalEarnings: 0,
        createdAt: now,
        updatedAt: now
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
  const now = new Date();

  const docRef = await firestoreChannels.add({
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
    referralsCount: 0,
    introPostSent: false,
    language,
    category,
    price: chosenPrice,
    botAdded: Boolean(botAdded),
    botPermissionsOk: Boolean(botAdded),
    lastPermissionCheckAt: now,
    lastSyncedAt: now,
    createdAt: now,
    updatedAt: now
  });

  const createdChannel = serializeDoc(await docRef.get());
  const syncedChannel = await syncSingleChannel(createdChannel);

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

  if (!isValidDocId(id)) {
    return res.status(400).json({ success: false, message: 'Invalid channel ID' });
  }

  const docRef = firestoreChannels.doc(String(id));
  const snap = await docRef.get();
  if (!snap.exists) {
    return res.status(404).json({ success: false, message: 'Channel not found' });
  }

  const updateData = { updatedAt: new Date(), lastSyncedAt: new Date() };
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

  await docRef.update(updateData);
  const updatedChannel = serializeDoc(await docRef.get());

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
  if (!isValidDocId(id)) {
    return res.status(400).json({ success: false, message: 'Invalid channel ID' });
  }
  const docRef = firestoreChannels.doc(String(id));
  const snap = await docRef.get();
  if (!snap.exists) {
    return res.status(404).json({ success: false, message: 'Channel not found' });
  }
  await docRef.delete();
  res.json({ success: true, message: 'Channel deleted' });
}));

// ==================== CAMPAIGNS ROUTES ====================

app.post('/api/campaigns/:id/track-views', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { viewsDelta, channelId, eventId } = req.body;

  if (!isValidDocId(id)) {
    return res.status(400).json({ success: false, message: 'Invalid campaign ID' });
  }

  const delta = Number(viewsDelta);
  if (isNaN(delta) || delta <= 0) {
    return res.status(400).json({ success: false, message: 'viewsDelta must be greater than 0' });
  }

  const txKey = eventId ? `view_${String(eventId).trim()}` : null;
  if (txKey) {
    const dupSnap = await firestoreTransactions.where('idempotencyKey', '==', `${txKey}_adv`).limit(1).get();
    if (!dupSnap.empty) {
      const currentCampaign = serializeDoc(await firestoreCampaigns.doc(String(id)).get());
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

  const campRef = firestoreCampaigns.doc(String(id));
  const campSnap = await campRef.get();
  if (!campSnap.exists) {
    return res.status(404).json({ success: false, message: 'Campaign not found' });
  }

  const campaign = serializeDoc(campSnap);
  if (campaign.status !== 'active') {
    return res.status(400).json({
      success: false,
      message: 'Views can only be tracked for active campaigns'
    });
  }

  const wallet = await getOrCreateWallet();
  const cpm = Number(campaign.maxPricePerPost) || 1;
  const budgetVal = Number(campaign.budget || 0);
  const spentVal = Number(campaign.spentAmount || 0);
  const remainingBudget = Math.max(0, Number((budgetVal - spentVal).toFixed(4)));
  const maxAffordableByBudget = Math.floor((remainingBudget / cpm) * 1000);
  const maxAffordableByWallet = Math.floor((Number(wallet.advertiserBalance || 0) / cpm) * 1000);
  const billableViews = Math.max(0, Math.min(delta, maxAffordableByBudget, maxAffordableByWallet));

  if (billableViews <= 0) {
    await campRef.update({ status: 'paused', updatedAt: new Date() });
    await createNotification(
      'advertiser',
      'campaign',
      'Campaign Paused',
      `Campaign "${campaign.title}" was paused due to exhausted budget or wallet balance.`
    );
    const pausedCamp = serializeDoc(await campRef.get());
    return res.status(400).json({
      success: false,
      message: 'Insufficient campaign budget or advertiser balance; campaign paused',
      data: pausedCamp
    });
  }

  const chargeAmount = Number(((billableViews / 1000) * cpm).toFixed(4));
  const nextAdvBal = Number(Math.max(0, Number(wallet.advertiserBalance || 0) - chargeAmount).toFixed(4));
  const nextPubBal = Number((Number(wallet.publisherBalance || 0) + chargeAmount).toFixed(4));

  await firestoreWallets.doc(DEFAULT_WALLET_KEY).update({
    advertiserBalance: nextAdvBal,
    publisherBalance: nextPubBal,
    updatedAt: new Date()
  });

  const nextTotalViews = Number(campaign.totalViews || 0) + billableViews;
  const nextSpentAmount = Number((spentVal + chargeAmount).toFixed(4));
  const pubChannels = Array.isArray(campaign.publishedChannels) ? [...campaign.publishedChannels] : [];

  if (pubChannels.length > 0) {
    const targetIdx = channelId
      ? pubChannels.findIndex((p) => String(p.channelId) === String(channelId))
      : 0;
    const idx = targetIdx >= 0 ? targetIdx : 0;
    pubChannels[idx] = {
      ...pubChannels[idx],
      views: Number(pubChannels[idx].views || 0) + billableViews,
      earnings: Number((Number(pubChannels[idx].earnings || 0) + chargeAmount).toFixed(4))
    };
  }

  const nextStatus = nextSpentAmount >= budgetVal || nextAdvBal <= 0 ? 'paused' : campaign.status;

  await campRef.update({
    totalViews: nextTotalViews,
    spentAmount: nextSpentAmount,
    publishedChannels: pubChannels,
    status: nextStatus,
    updatedAt: new Date()
  });

  const now = new Date();
  await firestoreTransactions.add({
    idempotencyKey: txKey ? `${txKey}_adv` : null,
    walletRole: 'advertiser',
    type: 'ad_spend',
    amount: chargeAmount,
    campaignId: campaign.id,
    channelId: channelId && isValidDocId(String(channelId)) ? String(channelId) : null,
    note: `Live views (${billableViews}) on ${campaign.title}`,
    createdAt: now
  });

  await firestoreTransactions.add({
    idempotencyKey: txKey ? `${txKey}_pub` : null,
    walletRole: 'publisher',
    type: 'ad_earning',
    amount: chargeAmount,
    campaignId: campaign.id,
    channelId: channelId && isValidDocId(String(channelId)) ? String(channelId) : null,
    note: `Publisher earning from ${billableViews} views on ${campaign.title}`,
    createdAt: now
  });

  const updatedCampaign = serializeDoc(await campRef.get());
  const updatedWallet = await getOrCreateWallet();

  res.json({
    success: true,
    data: {
      billableViews,
      chargeAmount,
      campaign: updatedCampaign,
      wallet: updatedWallet
    }
  });
}));

app.post('/api/campaigns/:id/topup', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { amount } = req.body;

  if (!isValidDocId(id)) {
    return res.status(400).json({ success: false, message: 'Invalid campaign ID' });
  }

  const addAmount = Number(amount);
  if (isNaN(addAmount) || addAmount <= 0) {
    return res.status(400).json({ success: false, message: 'Invalid top-up amount' });
  }

  const campRef = firestoreCampaigns.doc(String(id));
  const campSnap = await campRef.get();
  if (!campSnap.exists) {
    return res.status(404).json({ success: false, message: 'Campaign not found' });
  }

  const campaign = serializeDoc(campSnap);
  const wallet = await getOrCreateWallet();
  if (Number(wallet.advertiserBalance || 0) < addAmount) {
    return res.status(400).json({ success: false, message: 'Insufficient advertiser wallet balance' });
  }

  const nextBudget = Number((Number(campaign.budget || 0) + addAmount).toFixed(4));
  await campRef.update({ budget: nextBudget, updatedAt: new Date() });

  await firestoreTransactions.add({
    walletRole: 'advertiser',
    type: 'budget_topup',
    amount: addAmount,
    campaignId: campaign.id,
    note: `Budget top-up for ${campaign.title}`,
    createdAt: new Date()
  });

  await createNotification(
    'advertiser',
    'campaign',
    'Campaign Budget Topped Up',
    `Added ${addAmount.toFixed(2)}$ to campaign "${campaign.title}".`
  );

  const updatedCampaign = serializeDoc(await campRef.get());
  res.json({ success: true, data: { campaign: updatedCampaign, wallet } });
}));

app.post('/api/campaigns/:id/lifecycle', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { action } = req.body;

  if (!isValidDocId(id)) {
    return res.status(400).json({ success: false, message: 'Invalid campaign ID' });
  }

  const campRef = firestoreCampaigns.doc(String(id));
  const campSnap = await campRef.get();
  if (!campSnap.exists) {
    return res.status(404).json({ success: false, message: 'Campaign not found' });
  }

  const campaign = serializeDoc(campSnap);

  if (action === 'pause') {
    await campRef.update({ status: 'paused', updatedAt: new Date() });
    await createNotification('advertiser', 'campaign', 'Campaign Paused', `Campaign "${campaign.title}" is now paused.`);
    return res.json({ success: true, data: serializeDoc(await campRef.get()) });
  }

  if (action === 'complete') {
    await campRef.update({ status: 'completed', updatedAt: new Date() });
    await createNotification('advertiser', 'campaign', 'Campaign Completed', `Campaign "${campaign.title}" is marked completed.`);
    return res.json({ success: true, data: serializeDoc(await campRef.get()) });
  }

  if (action === 'resume') {
    const wallet = await getOrCreateWallet();
    if (Number(campaign.budget || 0) <= Number(campaign.spentAmount || 0) || Number(wallet.advertiserBalance || 0) <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Top up campaign budget and advertiser balance before resuming'
      });
    }

    const allChannelsSnap = await firestoreChannels.get();
    const selectedSet = new Set((campaign.selectedChannelIds || []).map(String));
    const channelsList = allChannelsSnap.docs
      .map((d) => serializeDoc(d))
      .filter((ch) => selectedSet.has(ch.id) && ch.isPublic !== false && ch.approvalStatus === 'approved');

    const existingMap = new Map();
    (campaign.publishedChannels || []).forEach((p) => {
      existingMap.set(String(p.channelId), p);
    });

    const logs = [];
    for (const ch of channelsList) {
      try {
        const prev = existingMap.get(String(ch.id)) || null;
        const result = await dispatchCampaignToChannel(campaign, ch, prev, { forceRepublish: true });
        if (result && result.entry) {
          logs.push(result.entry);
        }
      } catch (err) {
        console.error('Resume dispatch failed:', err.message);
      }
    }

    await campRef.update({
      publishedChannels: logs,
      status: 'active',
      updatedAt: new Date()
    });
    await createNotification('advertiser', 'campaign', 'Campaign Resumed', `Campaign "${campaign.title}" resumed publishing.`);
    return res.json({ success: true, data: serializeDoc(await campRef.get()) });
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
              title: cData.title || cData.name || '',
              channelUsername: cData.channelUsername || cData.username || '',
              pricePerPost: Number(cData.pricePerPost ?? cData.price ?? 0)
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

  const snap = await firestoreCampaigns.get();
  const campaignsList = sortDocsDesc(snap.docs, 'updatedAt').map((doc) => serializeDoc(doc));
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
          createdAt: now,
          updatedAt: now
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
    ? selectedChannelIds.filter((cid) => isValidDocId(String(cid))).map(String)
    : [];

  const now = new Date();
  const campRef = await firestoreCampaigns.add({
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
    status: finalStatus,
    createdAt: now,
    updatedAt: now
  });

  let campaign = serializeDoc(await campRef.get());

  if (finalStatus === 'active') {
    const allChannelsSnap = await firestoreChannels.get();
    const idSet = new Set(validIds);
    const channelsList = allChannelsSnap.docs
      .map((d) => serializeDoc(d))
      .filter((ch) => idSet.has(ch.id) && ch.isPublic !== false && ch.approvalStatus === 'approved');

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
    await campRef.update({ publishedChannels: logs, updatedAt: new Date() });
    campaign = serializeDoc(await campRef.get());
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

  if (!isValidDocId(id)) {
    return res.status(400).json({ success: false, message: 'Invalid campaign ID' });
  }

  const campRef = firestoreCampaigns.doc(String(id));
  const campSnap = await campRef.get();
  if (!campSnap.exists) {
    return res.status(404).json({ success: false, message: 'Campaign not found' });
  }

  let campaign = serializeDoc(campSnap);
  const updates = { updatedAt: new Date() };

  if (title !== undefined) updates.title = String(title).trim();
  if (adText !== undefined) updates.adText = String(adText).trim();
  if (mediaType !== undefined) {
    updates.mediaType = ['photo', 'video'].includes(mediaType) ? mediaType : 'none';
  }
  if (mediaData !== undefined) updates.mediaData = String(mediaData);
  if (mediaName !== undefined) updates.mediaName = String(mediaName).trim();
  if (targetUrl !== undefined) updates.targetUrl = String(targetUrl).trim();
  if (buttonPreset !== undefined) {
    updates.buttonPreset = ['Open', 'View Offer', 'Join Channel', 'Custom'].includes(buttonPreset)
      ? buttonPreset
      : 'Open';
  }
  if (customButtonText !== undefined) updates.customButtonText = String(customButtonText).trim();

  if (budget !== undefined) {
    const bNum = Number(budget);
    if (!isNaN(bNum) && bNum >= 1) {
      updates.budget = bNum;
      updates.openTargeting = bNum > 1000;
    }
  }

  if (targetLanguage !== undefined) {
    if (!ALLOWED_LANGUAGES.includes(targetLanguage)) {
      return res.status(400).json({ success: false, message: 'Invalid language' });
    }
    updates.targetLanguage = targetLanguage;
  }

  if (targetCategory !== undefined) {
    if (!ALLOWED_CATEGORIES.includes(targetCategory)) {
      return res.status(400).json({ success: false, message: 'Invalid category' });
    }
    updates.targetCategory = targetCategory;
  }

  if (maxPricePerPost !== undefined) {
    const numericPrice = Number(maxPricePerPost);
    if (isNaN(numericPrice) || numericPrice < 1 || numericPrice > 3) {
      return res.status(400).json({ success: false, message: 'Price must be between 1$ and 3$' });
    }
    updates.maxPricePerPost = numericPrice;
  }

  if (scheduleMode !== undefined) {
    updates.scheduleMode = scheduleMode === 'peak' ? 'peak' : 'immediate';
  }

  if (Array.isArray(selectedChannelIds)) {
    updates.selectedChannelIds = selectedChannelIds.filter((cid) => isValidDocId(String(cid))).map(String);
  }

  const nextScheduleMode = updates.scheduleMode || campaign.scheduleMode;
  const nextSelectedIds = updates.selectedChannelIds || campaign.selectedChannelIds || [];

  if (status !== undefined) {
    if (status === 'active') {
      if (nextScheduleMode === 'peak') {
        updates.status = 'scheduled';
        updates.scheduledAt = computeNextPeakSlot();
      } else {
        updates.status = 'active';
        const mergedCamp = { ...campaign, ...updates };
        const allChannelsSnap = await firestoreChannels.get();
        const idSet = new Set(nextSelectedIds.map(String));
        const channelsList = allChannelsSnap.docs
          .map((d) => serializeDoc(d))
          .filter((ch) => idSet.has(ch.id) && ch.isPublic !== false && ch.approvalStatus === 'approved');

        const existingMap = new Map();
        (campaign.publishedChannels || []).forEach((p) => {
          existingMap.set(String(p.channelId), p);
        });
        const logs = [];
        for (const ch of channelsList) {
          try {
            const prev = existingMap.get(String(ch.id)) || null;
            const result = await dispatchCampaignToChannel(mergedCamp, ch, prev);
            if (result && result.entry) {
              logs.push(result.entry);
            }
          } catch (err) {
            console.error('Publish update dispatch error:', err.message);
          }
        }
        updates.publishedChannels = logs;
      }
    } else if (status === 'scheduled') {
      updates.status = 'scheduled';
      updates.scheduledAt = computeNextPeakSlot();
    } else if (['paused', 'completed', 'draft'].includes(status)) {
      updates.status = status;
    }
  }

  await campRef.update(updates);
  campaign = serializeDoc(await campRef.get());
  res.json({ success: true, data: campaign });
}));

app.delete('/api/campaigns/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!isValidDocId(id)) {
    return res.status(400).json({ success: false, message: 'Invalid campaign ID' });
  }
  const campRef = firestoreCampaigns.doc(String(id));
  const snap = await campRef.get();
  if (!snap.exists) {
    return res.status(404).json({ success: false, message: 'Campaign not found' });
  }
  await campRef.delete();
  res.json({ success: true, message: 'Campaign deleted' });
}));

// ==================== WALLET ROUTES ====================

app.get('/api/wallet', asyncHandler(async (req, res) => {
  const wallet = await getOrCreateWallet();
  const txSnap = await firestoreTransactions.get();
  const transactionsList = sortDocsDesc(txSnap.docs, 'createdAt')
    .slice(0, 50)
    .map((d) => serializeDoc(d));

  res.json({
    success: true,
    data: {
      advertiserBalance: Number(Number(wallet.advertiserBalance || 0).toFixed(4)),
      publisherBalance: Number(Number(wallet.publisherBalance || 0).toFixed(4)),
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
    const existingSnap = await firestoreTransactions
      .where('idempotencyKey', '==', String(idempotencyKey).trim())
      .limit(1)
      .get();
    if (!existingSnap.empty) {
      const walletNow = await getOrCreateWallet();
      return res.json({
        success: true,
        duplicatePrevented: true,
        data: { wallet: walletNow, transaction: serializeDoc(existingSnap.docs[0]) }
      });
    }
  }

  const wallet = await getOrCreateWallet();
  const nextAdv =
    role === 'advertiser'
      ? Number((Number(wallet.advertiserBalance || 0) + numericAmount).toFixed(4))
      : Number(wallet.advertiserBalance || 0);
  const nextPub =
    role === 'publisher'
      ? Number((Number(wallet.publisherBalance || 0) + numericAmount).toFixed(4))
      : Number(wallet.publisherBalance || 0);

  await firestoreWallets.doc(DEFAULT_WALLET_KEY).update({
    advertiserBalance: nextAdv,
    publisherBalance: nextPub,
    updatedAt: new Date()
  });

  const txRef = await firestoreTransactions.add({
    idempotencyKey: idempotencyKey ? String(idempotencyKey).trim() : null,
    walletRole: role,
    type: 'deposit',
    amount: numericAmount,
    note: note ? String(note).trim() : 'Deposit',
    createdAt: new Date()
  });

  await createNotification(
    role,
    'wallet',
    'Wallet Deposit',
    `Deposited ${numericAmount.toFixed(2)}$ into ${role} wallet.`
  );

  const updatedWallet = await getOrCreateWallet();
  const tx = serializeDoc(await txRef.get());
  res.status(201).json({ success: true, data: { wallet: updatedWallet, transaction: tx } });
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
    const existingSnap = await firestoreTransactions
      .where('idempotencyKey', '==', String(idempotencyKey).trim())
      .limit(1)
      .get();
    if (!existingSnap.empty) {
      const walletNow = await getOrCreateWallet();
      return res.json({
        success: true,
        duplicatePrevented: true,
        data: { wallet: walletNow, transaction: serializeDoc(existingSnap.docs[0]) }
      });
    }
  }

  const wallet = await getOrCreateWallet();
  let nextAdv = Number(wallet.advertiserBalance || 0);
  let nextPub = Number(wallet.publisherBalance || 0);

  if (role === 'advertiser') {
    if (nextAdv < numericAmount) {
      return res.status(400).json({ success: false, message: 'Insufficient advertiser balance' });
    }
    nextAdv = Number((nextAdv - numericAmount).toFixed(4));
  } else {
    if (nextPub < numericAmount) {
      return res.status(400).json({ success: false, message: 'Insufficient publisher balance' });
    }
    nextPub = Number((nextPub - numericAmount).toFixed(4));
  }

  await firestoreWallets.doc(DEFAULT_WALLET_KEY).update({
    advertiserBalance: nextAdv,
    publisherBalance: nextPub,
    updatedAt: new Date()
  });

  const txRef = await firestoreTransactions.add({
    idempotencyKey: idempotencyKey ? String(idempotencyKey).trim() : null,
    walletRole: role,
    type: 'withdraw',
    amount: numericAmount,
    note: note ? String(note).trim() : 'Withdraw',
    createdAt: new Date()
  });

  await createNotification(
    role,
    'wallet',
    'Wallet Withdrawal',
    `Withdrew ${numericAmount.toFixed(2)}$ from ${role} wallet.`
  );

  const updatedWallet = await getOrCreateWallet();
  const tx = serializeDoc(await txRef.get());
  res.status(201).json({ success: true, data: { wallet: updatedWallet, transaction: tx } });
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

  await channelRef.update({ status: action, updatedAt: new Date() });
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
    t.update(campaignRef, { status: 'completed', updatedAt: now });

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

  setInterval(syncAllChannels, SYNC_INTERVAL_MS);
  setInterval(processDueScheduledCampaigns, 60000);
  setInterval(() => {
    runDatabaseBackup('interval').catch((e) => console.error(e));
  }, BACKUP_INTERVAL_MS);
}

module.exports = app;
