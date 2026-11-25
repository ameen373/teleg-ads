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
  FieldValue,
  RULES,
  COLLECTIONS,
  collections,
  roundMoney,
  nowIso,
  createDefaultUser,
  buildTransactionRecord,
  buildSecurityLogRecord,
  buildAuditLogRecord,
  buildSmartAlertRecord,
  users: firestoreUsers,
  channels: firestoreChannels,
  campaigns: firestoreCampaigns,
  transactions: firestoreTransactions,
  securityLogs: firestoreSecurityLogs,
  ALLOWED_LANGUAGES,
  ALLOWED_CATEGORIES
} = require('./models');

const firestoreReferrals = collections.referrals || db.collection(COLLECTIONS.REFERRALS);
const firestoreWallets = collections.wallets || db.collection(COLLECTIONS.WALLETS);
const firestorePublishLogs = collections.publishLogs || db.collection(COLLECTIONS.PUBLISH_LOGS);
const firestoreNotifications = collections.notifications || db.collection(COLLECTIONS.NOTIFICATIONS);
const firestoreBackups = collections.backupRecords || db.collection(COLLECTIONS.BACKUP_RECORDS);
const firestoreDeposits = collections.deposits || db.collection(COLLECTIONS.DEPOSITS);
const firestoreWithdrawals = collections.withdrawals || db.collection(COLLECTIONS.WITHDRAWALS);
const firestoreEarningsLocks = collections.earningsLocks || db.collection(COLLECTIONS.EARNINGS_LOCKS);
const firestoreTickets = collections.tickets || db.collection(COLLECTIONS.TICKETS);
const firestoreBroadcasts = collections.broadcasts || db.collection(COLLECTIONS.BROADCASTS);
const firestoreSystemConfig = collections.systemConfig || db.collection(COLLECTIONS.SYSTEM_CONFIG);
const firestoreAuditLogs = collections.auditLogs || db.collection(COLLECTIONS.AUDIT_LOGS);
const firestoreSmartAlerts = collections.smartAlerts || db.collection(COLLECTIONS.SMART_ALERTS);

const app = express();
const PORT = Number(process.env.PORT) || 3000;
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

function generateId(prefix) {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

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
    role: d.role || (d.isAdmin ? 'admin' : 'user'),
    balance: Number(d.balance ?? d.availableEarnings ?? 0),
    adBalance: Number(d.adBalance ?? d.walletBalance ?? 0),
    walletBalance: Number(d.walletBalance ?? d.adBalance ?? 0),
    pendingEarnings: Number(d.pendingEarnings ?? 0),
    availableEarnings: Number(d.availableEarnings ?? d.balance ?? 0),
    trc20Address: d.trc20Address || '',
    referralEarnings: Number(d.referralEarnings ?? d.referralEarningsTotal ?? 0),
    referralEarningsTotal: Number(d.referralEarningsTotal ?? d.referralEarnings ?? 0),
    referredBy: d.referredBy ?? null,
    referralsCount: Number(d.referralsCount ?? 0),
    isAdmin: Boolean(d.isAdmin || d.role === 'admin'),
    isBanned: Boolean(d.isBanned || d.banned),
    banned: Boolean(d.banned || d.isBanned),
    banReason: d.banReason || '',
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
    const ip = (req && (req.headers?.['x-forwarded-for'] || req.ip || req.socket?.remoteAddress)) || '';
    const logId = generateId('sec');
    const record = buildSecurityLogRecord({
      id: logId,
      actorId: String(actorId),
      actorRole: isAdminRequest(req) ? 'admin' : 'user',
      action: String(action),
      targetId: String(targetId || ''),
      details: typeof details === 'object' && details !== null ? details : { message: String(details || '') },
      ip: String(ip)
    });
    await firestoreSecurityLogs.doc(logId).set(record);
    return record;
  } catch (error) {
    console.error('Security log error:', error);
    return null;
  }
};

async function writeSecurityLog(txOrDb, payload) {
  const logId = generateId('sec');
  const record = buildSecurityLogRecord({
    id: logId,
    ...payload
  });
  if (txOrDb && typeof txOrDb.set === 'function') {
    txOrDb.set(firestoreSecurityLogs.doc(logId), record);
  } else {
    await firestoreSecurityLogs.doc(logId).set(record);
  }
  return record;
}

async function writeAuditLog(txOrDb, payload) {
  const auditId = generateId('aud');
  const record = buildAuditLogRecord({
    id: auditId,
    ...payload
  });
  if (txOrDb && typeof txOrDb.set === 'function') {
    txOrDb.set(firestoreAuditLogs.doc(auditId), record);
  } else {
    await firestoreAuditLogs.doc(auditId).set(record);
  }
  return record;
}

async function createSmartAlert(txOrDb, payload) {
  const alertId = generateId('alr');
  const record = buildSmartAlertRecord({
    id: alertId,
    ...payload
  });
  if (txOrDb && typeof txOrDb.set === 'function') {
    txOrDb.set(firestoreSmartAlerts.doc(alertId), record);
  } else {
    await firestoreSmartAlerts.doc(alertId).set(record);
  }
  return record;
}

async function getSystemConfig() {
  const docRef = firestoreSystemConfig.doc('global');
  const snap = await docRef.get();
  if (!snap.exists) {
    const initial = {
      maintenanceMode: false,
      maintenanceMessage: 'النظام في وضع الصيانة حالياً لإجراء تحديثات أمان.',
      blacklistWords: ['spam', 'scam', 'fake', 'احتيال', 'وهمي', 'سبام'],
      bannedUsers: {},
      bannedChannels: {},
      bannedAdvertisers: {},
      updatedAt: nowIso(),
      updatedBy: 'system'
    };
    await docRef.set(initial);
    return initial;
  }
  const data = snap.data();
  return Object.assign(
    {
      maintenanceMode: false,
      maintenanceMessage: 'النظام في وضع الصيانة حالياً لإجراء تحديثات أمان.',
      blacklistWords: ['spam', 'scam', 'fake', 'احتيال', 'وهمي', 'سبام'],
      bannedUsers: {},
      bannedChannels: {},
      bannedAdvertisers: {}
    },
    data
  );
}

function findMatchedBlacklistWord(text, blacklistWords) {
  const lower = (text || '').toLowerCase();
  const list = Array.isArray(blacklistWords) ? blacklistWords : [];
  for (const word of list) {
    const clean = String(word || '').trim().toLowerCase();
    if (clean && lower.includes(clean)) {
      return clean;
    }
  }
  return null;
}

async function ensureUserDoc(tx, userId, requestedRole, referredBy) {
  const userRef = firestoreUsers.doc(userId);
  const snap = await tx.get(userRef);
  if (!snap.exists) {
    const fresh = createDefaultUser(userId, requestedRole, referredBy);
    tx.set(userRef, fresh);
    return fresh;
  }
  const existing = snap.data();
  if (!existing.referredBy && referredBy && referredBy !== userId) {
    const cleanRef = String(referredBy).trim();
    tx.update(userRef, {
      referredBy: cleanRef,
      updatedAt: nowIso()
    });
    return Object.assign({}, existing, { referredBy: cleanRef });
  }
  return existing;
}

function extractUserId(req) {
  if (!req) return '';
  if (req.user && req.user.telegramId) return String(req.user.telegramId).trim();
  const raw = (req.headers?.['x-user-id'] || req.body?.userId || req.query?.userId || '').toString().trim();
  return raw;
}

function isAdminRequest(req) {
  if (!req) return false;
  if (req.user && req.user.isAdmin) return true;
  const adminKeyHeader = (req.headers?.['x-admin-key'] || '').toString().trim();
  const roleHeader = (req.headers?.['x-user-role'] || '').toString().trim().toLowerCase();
  const bodyRole = (req.body?.role || '').toString().trim().toLowerCase();
  const validKey = Boolean(process.env.ADMIN_API_KEY) && adminKeyHeader === process.env.ADMIN_API_KEY;
  return validKey || roleHeader === 'admin' || bodyRole === 'admin';
}

function requireAdmin(req, res, next) {
  const adminKeyHeader = (req.headers['x-admin-key'] || '').toString().trim();
  if (!process.env.ADMIN_API_KEY || adminKeyHeader !== process.env.ADMIN_API_KEY) {
    writeSecurityLog(db, {
      actorId: extractUserId(req) || 'anonymous',
      actorRole: 'unauthorized',
      action: 'ADMIN_ACCESS_DENIED',
      targetId: req.originalUrl,
      details: { method: req.method },
      ip: req.ip
    }).catch(() => {});

    return res.status(403).json({
      ok: false,
      success: false,
      error: 'غير مصرح لك بالوصول إلى مسارات الإدارة.',
      message: 'Access Denied: Admin Privileges Required'
    });
  }
  next();
}

const checkMaintenanceAndBanGate = asyncHandler(async (req, res, next) => {
  const config = await getSystemConfig();
  if (config.maintenanceMode && !isAdminRequest(req)) {
    await writeSecurityLog(db, {
      actorId: extractUserId(req) || 'anonymous',
      actorRole: 'user',
      action: 'MAINTENANCE_BLOCKED_REQUEST',
      targetId: req.originalUrl,
      details: { method: req.method },
      ip: req.ip
    });
    return res.status(503).json({
      ok: false,
      success: false,
      maintenanceMode: true,
      error: config.maintenanceMessage || 'النظام في وضع الصيانة حالياً.',
      message: config.maintenanceMessage || 'System is currently under maintenance.'
    });
  }

  const userId = extractUserId(req);
  if (userId && !isAdminRequest(req)) {
    const bannedUser = config.bannedUsers && config.bannedUsers[userId];
    const bannedAdv = config.bannedAdvertisers && config.bannedAdvertisers[userId];
    if (bannedUser || bannedAdv) {
      const reason = (bannedUser && bannedUser.reason) || (bannedAdv && bannedAdv.reason) || 'حساب محظور إدارياً';
      await writeSecurityLog(db, {
        actorId: userId,
        actorRole: 'banned_user',
        action: 'BANNED_ENTITY_BLOCKED',
        targetId: userId,
        details: { reason, path: req.originalUrl },
        ip: req.ip
      });
      return res.status(403).json({
        ok: false,
        success: false,
        banned: true,
        error: `تم حظر هذا الحساب: ${reason}`,
        message: `Account banned: ${reason}`
      });
    }
  }

  next();
});

async function releaseMaturedEarningsForUser(userId) {
  const cutoffIso = new Date(Date.now() - RULES.EARNINGS_RELEASE_HOURS * 60 * 60 * 1000).toISOString();

  await db.runTransaction(async (tx) => {
    const userRef = firestoreUsers.doc(userId);
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists) return;

    const locksQuery = firestoreEarningsLocks
      .where('userId', '==', userId)
      .where('status', '==', 'pending');

    const locksSnap = await tx.get(locksQuery);
    let releasableTotal = 0;
    const maturedDocs = [];

    locksSnap.forEach((doc) => {
      const data = doc.data();
      if (data.releaseAt && data.releaseAt <= nowIso()) {
        releasableTotal = roundMoney(releasableTotal + Number(data.amount || 0));
        maturedDocs.push({ ref: doc.ref, data });
      } else if (!data.releaseAt && data.createdAt && data.createdAt <= cutoffIso) {
        releasableTotal = roundMoney(releasableTotal + Number(data.amount || 0));
        maturedDocs.push({ ref: doc.ref, data });
      }
    });

    if (releasableTotal <= 0 || maturedDocs.length === 0) return;

    const userData = userSnap.data();
    const nextPending = roundMoney(Math.max(0, Number(userData.pendingEarnings || 0) - releasableTotal));
    const nextAvailable = roundMoney(Number(userData.availableEarnings || 0) + releasableTotal);

    tx.update(userRef, {
      pendingEarnings: nextPending,
      availableEarnings: nextAvailable,
      balance: nextAvailable,
      updatedAt: nowIso()
    });

    for (const item of maturedDocs) {
      tx.update(item.ref, {
        status: 'released',
        releasedAt: nowIso()
      });
    }

    const txId = generateId('tx');
    tx.set(
      firestoreTransactions.doc(txId),
      buildTransactionRecord({
        id: txId,
        userId,
        type: 'earnings',
        amount: releasableTotal,
        status: 'released',
        note: `تحرير أرباح تلقائي بعد مرور ${RULES.EARNINGS_RELEASE_HOURS} ساعة`
      })
    );

    await createSmartAlert(tx, {
      userId,
      category: 'earnings_ready',
      title: 'جاهزية الأرباح للسحب (24 ساعة)',
      message: `تم تحرير $${releasableTotal.toFixed(2)} من الأرباح المعلقة وأصبحت متاحة للسحب.`
    });

    await writeSecurityLog(tx, {
      actorId: 'system',
      actorRole: 'system',
      action: 'EARNINGS_AUTO_RELEASED_24H',
      targetId: userId,
      details: { releasedAmount: releasableTotal, locksCount: maturedDocs.length }
    });
  });
}

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
            referralsCount: FieldValue.increment(1)
          });
        }
      }
    }

    const now = new Date();
    const userRef = firestoreUsers.doc(telegramId);
    await userRef.set({
      id: telegramId,
      telegramId,
      username: tgUser.username || '',
      firstName: tgUser.first_name || '',
      lastName: tgUser.last_name || '',
      languageCode: tgUser.language_code === 'ar' ? 'ar' : 'en',
      role: isAdmin ? 'admin' : 'user',
      balance: 0,
      adBalance: 0,
      walletBalance: 0,
      pendingEarnings: 0,
      availableEarnings: 0,
      trc20Address: '',
      referralEarnings: 0,
      referralEarningsTotal: 0,
      referredBy,
      referralsCount: 0,
      isAdmin,
      isBanned: false,
      banned: false,
      banReason: '',
      createdAt: now,
      updatedAt: nowIso(),
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
      role: isAdmin ? 'admin' : (existingData.role || 'user'),
      lastActive: new Date()
    });
    userDoc = await userDoc.ref.get();
  }

  const serialized = serializeUser(userDoc);

  if (serialized.isBanned || serialized.banned) {
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
  return subscribersCount >= RULES.MIN_CHANNEL_SUBSCRIBERS ? 'approved' : 'pending_review';
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
                  referralsCount: FieldValue.increment(1)
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

// ==================== FIRESTORE USER, CONFIG & HOME ROUTES ====================

app.get('/api/health', asyncHandler(async (req, res) => {
  const config = await getSystemConfig();
  res.json({
    ok: true,
    success: true,
    status: 'healthy',
    maintenanceMode: Boolean(config.maintenanceMode),
    rules: RULES,
    timestamp: nowIso()
  });
}));

app.get('/api/config/rules', asyncHandler(async (req, res) => {
  const config = await getSystemConfig();
  res.json({
    ok: true,
    success: true,
    rules: RULES,
    maintenanceMode: Boolean(config.maintenanceMode),
    maintenanceMessage: config.maintenanceMessage || '',
    blacklistWords: config.blacklistWords || []
  });
}));

app.post('/api/users/init', checkMaintenanceAndBanGate, asyncHandler(async (req, res) => {
  const userId = extractUserId(req);
  const referredBy = (req.body?.referredBy || req.query?.ref || '').toString().trim();

  if (!userId || userId.length < 3) {
    return res.status(400).json({ ok: false, success: false, error: 'معرف المستخدم مطلوب (3 أحرف على الأقل).' });
  }

  const user = await db.runTransaction(async (tx) => {
    const u = await ensureUserDoc(tx, userId, req.body?.role, referredBy);
    if (referredBy && referredBy !== userId) {
      await ensureUserDoc(tx, referredBy, 'user', null);
      await writeSecurityLog(tx, {
        actorId: userId,
        actorRole: 'user',
        action: 'REFERRAL_LINKED',
        targetId: referredBy,
        details: { referredUserId: userId, referrerId: referredBy },
        ip: req.ip
      });
    }
    return u;
  });

  await releaseMaturedEarningsForUser(userId);
  if (user.referredBy) {
    await releaseMaturedEarningsForUser(user.referredBy);
  }

  const freshSnap = await firestoreUsers.doc(userId).get();

  res.json({
    ok: true,
    success: true,
    user: freshSnap.exists ? freshSnap.data() : user
  });
}));

app.post('/api/users/trc20-wallet', checkMaintenanceAndBanGate, asyncHandler(async (req, res) => {
  const userId = extractUserId(req);
  const trc20Address = (req.body?.trc20Address || '').toString().trim();

  if (!userId) {
    return res.status(400).json({ ok: false, success: false, error: 'معرف المستخدم مطلوب.' });
  }
  if (!trc20Address || trc20Address.length < 20) {
    return res.status(400).json({ ok: false, success: false, error: 'يرجى إدخال عنوان محفظة USDT - TRC20 صالح.' });
  }

  await db.runTransaction(async (tx) => {
    const userRef = firestoreUsers.doc(userId);
    await ensureUserDoc(tx, userId, 'user', null);
    tx.update(userRef, {
      trc20Address,
      updatedAt: nowIso()
    });
    await writeSecurityLog(tx, {
      actorId: userId,
      actorRole: 'user',
      action: 'TRC20_WALLET_UPDATED',
      targetId: userId,
      details: { trc20Address },
      ip: req.ip
    });
  });

  res.json({ ok: true, success: true, trc20Address });
}));

app.get('/api/me', authMiddleware, asyncHandler(async (req, res) => {
  await releaseMaturedEarningsForUser(req.user.telegramId);

  const [approvedSnap, userChannelsSnap, userCampaignsSnap, userTxSnap, freshUserSnap] = await Promise.all([
    firestoreChannels.where('status', '==', 'approved').get(),
    firestoreChannels.where('ownerId', '==', req.user.telegramId).get(),
    firestoreCampaigns.where('advertiserId', '==', req.user.telegramId).get(),
    firestoreTransactions.where('userId', '==', req.user.telegramId).get(),
    firestoreUsers.doc(req.user.telegramId).get()
  ]);

  const currentUser = freshUserSnap.exists ? serializeUser(freshUserSnap) : req.user;

  const sortedTx = sortDocsDesc(userTxSnap.docs, 'createdAt')
    .slice(0, 10)
    .map((doc) => serializeDoc(doc));

  res.json({
    success: true,
    user: {
      telegramId: currentUser.telegramId,
      username: currentUser.username,
      firstName: currentUser.firstName,
      lastName: currentUser.lastName,
      languageCode: currentUser.languageCode,
      balance: currentUser.balance,
      adBalance: currentUser.adBalance,
      walletBalance: currentUser.walletBalance,
      pendingEarnings: currentUser.pendingEarnings,
      availableEarnings: currentUser.availableEarnings,
      trc20Address: currentUser.trc20Address,
      referralEarnings: currentUser.referralEarnings,
      referralsCount: currentUser.referralsCount,
      isAdmin: currentUser.isAdmin
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

// ==================== SUPPORT TICKETS, BROADCASTS, PUBLISH LOGS, NOTIFICATIONS, HEALTH & BACKUPS ====================

app.post('/api/tickets', checkMaintenanceAndBanGate, asyncHandler(async (req, res) => {
  const userId = extractUserId(req);
  const subject = (req.body?.subject || '').toString().trim();
  const message = (req.body?.message || '').toString().trim();

  if (!userId) {
    return res.status(400).json({ ok: false, success: false, error: 'معرف المستخدم مطلوب.' });
  }
  if (!subject || !message) {
    return res.status(400).json({ ok: false, success: false, error: 'موضوع التذكرة ونص الرسالة مطلوبان.' });
  }

  const ticketRecord = await db.runTransaction(async (tx) => {
    await ensureUserDoc(tx, userId, 'user', null);
    const ticketId = generateId('tkt');
    const record = {
      id: ticketId,
      userId,
      subject,
      status: 'open',
      messages: [
        {
          sender: 'user',
          senderId: userId,
          text: message,
          createdAt: nowIso()
        }
      ],
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    tx.set(firestoreTickets.doc(ticketId), record);

    await writeSecurityLog(tx, {
      actorId: userId,
      actorRole: 'user',
      action: 'SUPPORT_TICKET_CREATED',
      targetId: ticketId,
      details: { subject },
      ip: req.ip
    });

    return record;
  });

  res.status(201).json({ ok: true, success: true, ticket: ticketRecord });
}));

app.get('/api/tickets', checkMaintenanceAndBanGate, asyncHandler(async (req, res) => {
  const userId = extractUserId(req);
  if (!userId) {
    return res.status(400).json({ ok: false, success: false, error: 'معرف المستخدم مطلوب.' });
  }

  const snap = await firestoreTickets.where('userId', '==', userId).get();
  const tickets = [];
  snap.forEach((doc) => tickets.push(doc.data()));
  tickets.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));

  res.json({ ok: true, success: true, tickets });
}));

app.post('/api/tickets/:ticketId/reply', checkMaintenanceAndBanGate, asyncHandler(async (req, res) => {
  const ticketId = (req.params.ticketId || '').toString().trim();
  const text = (req.body?.message || '').toString().trim();
  const senderId = extractUserId(req) || 'user';

  if (!ticketId || !text) {
    return res.status(400).json({ ok: false, success: false, error: 'معرف التذكرة ونص الرد مطلوبان.' });
  }

  const updatedTicket = await db.runTransaction(async (tx) => {
    const tktRef = firestoreTickets.doc(ticketId);
    const snap = await tx.get(tktRef);
    if (!snap.exists) return null;

    const data = snap.data();
    const msgs = Array.isArray(data.messages) ? data.messages.slice() : [];
    msgs.push({
      sender: 'user',
      senderId,
      text,
      createdAt: nowIso()
    });

    const next = Object.assign({}, data, {
      status: 'open',
      messages: msgs,
      updatedAt: nowIso()
    });
    tx.update(tktRef, {
      status: 'open',
      messages: msgs,
      updatedAt: nowIso()
    });
    return next;
  });

  if (!updatedTicket) {
    return res.status(404).json({ ok: false, success: false, error: 'التذكرة غير موجودة.' });
  }

  res.json({ ok: true, success: true, ticket: updatedTicket });
}));

app.get('/api/broadcasts', checkMaintenanceAndBanGate, asyncHandler(async (req, res) => {
  const snap = await firestoreBroadcasts.get();
  const broadcasts = [];
  snap.forEach((doc) => broadcasts.push(doc.data()));
  broadcasts.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

  res.json({ ok: true, success: true, broadcasts: broadcasts.slice(0, 15) });
}));

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
      referralsCount: FieldValue.increment(1)
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
    .filter((ch) => ch.isPublic !== false && ch.status !== 'banned');

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

app.post('/api/channels/:channelId/record-stats', checkMaintenanceAndBanGate, asyncHandler(async (req, res) => {
  const channelId = (req.params.channelId || '').toString().trim();
  const rawViews = Math.floor(Number(req.body?.views || 0));
  const rawEarnings = roundMoney(req.body?.earnings || 0);

  if (!channelId) {
    return res.status(400).json({ ok: false, success: false, error: 'معرف القناة مطلوب.' });
  }
  if (rawViews < 0 || rawEarnings < 0 || (rawViews === 0 && rawEarnings === 0)) {
    return res.status(400).json({ ok: false, success: false, error: 'يجب إدخال مشاهدات أو أرباح صالحة أكبر من صفر.' });
  }

  const config = await getSystemConfig();

  const statResult = await db.runTransaction(async (tx) => {
    const chnRef = firestoreChannels.doc(channelId);
    const chnSnap = await tx.get(chnRef);
    if (!chnSnap.exists) {
      return { notFound: true };
    }

    const chnData = chnSnap.data();
    if (chnData.status === 'banned' || (config.bannedChannels && config.bannedChannels[channelId])) {
      await writeAuditLog(tx, {
        entityType: 'channel',
        entityId: channelId,
        severity: 'high',
        reason: 'محاولة تسجيل مشاهدات/أرباح لقناة محظورة',
        meta: { rawViews, rawEarnings }
      });
      return { channelBanned: true };
    }

    let validViews = rawViews;
    let botFilteredViews = 0;

    if (rawViews > RULES.ANTI_BOT_MAX_VIEWS_PER_BATCH) {
      validViews = RULES.ANTI_BOT_MAX_VIEWS_PER_BATCH;
      botFilteredViews = rawViews - RULES.ANTI_BOT_MAX_VIEWS_PER_BATCH;
    }

    if (chnData.lastStatsAt) {
      const elapsedSec = (Date.now() - Date.parse(chnData.lastStatsAt)) / 1000;
      if (elapsedSec >= 0 && elapsedSec < RULES.ANTI_BOT_MIN_INTERVAL_SEC && rawViews > 0) {
        botFilteredViews += validViews;
        validViews = 0;
      }
    }

    const ratioFactor = rawViews > 0 ? validViews / rawViews : 1;
    const validEarnings = roundMoney(rawEarnings * ratioFactor);
    const channelOwnerId = chnData.ownerId || chnData.ownerTelegramId;

    if (botFilteredViews > 0) {
      await writeAuditLog(tx, {
        entityType: 'views',
        entityId: channelId,
        severity: 'medium',
        reason: 'محرك Anti-Bot قام بفلترة مشاهدات مشبوهة/متكررة',
        meta: { rawViews, validViews, botFilteredViews, rawEarnings, validEarnings }
      });
      if (channelOwnerId) {
        await createSmartAlert(tx, {
          userId: channelOwnerId,
          category: 'anti_bot',
          title: 'فلترة مشاهدات بواسطة محرك Anti-Bot',
          message: `تم استبعاد ${botFilteredViews} مشاهدة غير مطابقة لمعايير التحقق على قناة (${chnData.name}).`
        });
      }
    }

    let ownerData = null;
    let ownerRef = null;
    if (channelOwnerId) {
      ownerRef = firestoreUsers.doc(channelOwnerId);
      ownerData = await ensureUserDoc(tx, channelOwnerId, 'user', null);
    }

    let referrerData = null;
    let referrerRef = null;
    if (ownerData && ownerData.referredBy && ownerData.referredBy !== channelOwnerId) {
      referrerRef = firestoreUsers.doc(ownerData.referredBy);
      referrerData = await ensureUserDoc(tx, ownerData.referredBy, 'user', null);
    }

    const nextViews = Number(chnData.viewsCount || 0) + validViews;
    const nextFilteredTotal = Number(chnData.filteredBotViews || 0) + botFilteredViews;
    const nextEarnedTotal = roundMoney(Number(chnData.earnedTotal || chnData.totalEarnings || 0) + validEarnings);

    tx.update(chnRef, {
      viewsCount: nextViews,
      filteredBotViews: nextFilteredTotal,
      earnedTotal: nextEarnedTotal,
      totalEarnings: nextEarnedTotal,
      lastStatsAt: nowIso(),
      updatedAt: nowIso()
    });

    let releaseAtIso = null;
    let referralCommission = 0;

    if (validEarnings > 0 && ownerRef && ownerData) {
      releaseAtIso = new Date(Date.now() + RULES.EARNINGS_RELEASE_HOURS * 60 * 60 * 1000).toISOString();
      const nextPending = roundMoney(Number(ownerData.pendingEarnings || 0) + validEarnings);

      tx.update(ownerRef, {
        pendingEarnings: nextPending,
        updatedAt: nowIso()
      });

      const lockId = generateId('lock');
      tx.set(firestoreEarningsLocks.doc(lockId), {
        id: lockId,
        userId: channelOwnerId,
        channelId,
        amount: validEarnings,
        status: 'pending',
        createdAt: nowIso(),
        releaseAt: releaseAtIso
      });

      const txRecordId = generateId('tx');
      tx.set(
        firestoreTransactions.doc(txRecordId),
        buildTransactionRecord({
          id: txRecordId,
          userId: channelOwnerId,
          type: 'earnings',
          amount: validEarnings,
          status: 'pending',
          note: `أرباح معلقة من قناة (${chnData.name}) - تتحرر بعد ${RULES.EARNINGS_RELEASE_HOURS} ساعة`
        })
      );

      if (referrerRef && referrerData) {
        referralCommission = roundMoney(validEarnings * RULES.REFERRAL_COMMISSION_RATE);
        if (referralCommission > 0) {
          const nextRefPending = roundMoney(Number(referrerData.pendingEarnings || 0) + referralCommission);
          const nextRefTotal = roundMoney(Number(referrerData.referralEarningsTotal || 0) + referralCommission);

          tx.update(referrerRef, {
            pendingEarnings: nextRefPending,
            referralEarningsTotal: nextRefTotal,
            referralEarnings: nextRefTotal,
            updatedAt: nowIso()
          });

          const refLockId = generateId('lock_ref');
          tx.set(firestoreEarningsLocks.doc(refLockId), {
            id: refLockId,
            userId: ownerData.referredBy,
            channelId,
            fromUserId: channelOwnerId,
            amount: referralCommission,
            status: 'pending',
            createdAt: nowIso(),
            releaseAt: releaseAtIso
          });

          const refTxId = generateId('tx_ref');
          tx.set(
            firestoreTransactions.doc(refTxId),
            buildTransactionRecord({
              id: refTxId,
              userId: ownerData.referredBy,
              type: 'referral',
              amount: referralCommission,
              status: 'pending',
              note: `عمولة إحالة 10% من أرباح (${channelOwnerId}) - تتحرر بعد ${RULES.EARNINGS_RELEASE_HOURS} ساعة`
            })
          );
        }
      }
    }

    return {
      channel: {
        ...chnData,
        viewsCount: nextViews,
        filteredBotViews: nextFilteredTotal,
        earnedTotal: nextEarnedTotal
      },
      validViews,
      botFilteredViews,
      validEarnings,
      referralCommission,
      releaseAt: releaseAtIso
    };
  });

  if (statResult.notFound) {
    return res.status(404).json({ ok: false, success: false, error: 'القناة غير موجودة.' });
  }
  if (statResult.channelBanned) {
    return res.status(403).json({ ok: false, success: false, error: 'هذه القناة محظورة ولا يمكن تسجيل إحصائيات أو أرباح لها.' });
  }

  res.json({ ok: true, success: true, ...statResult });
}));

app.get('/api/channels', checkMaintenanceAndBanGate, asyncHandler(async (req, res) => {
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

  const ownerId = extractUserId(req);
  if (ownerId) {
    const snap = await firestoreChannels.where('ownerId', '==', ownerId).get();
    const channels = [];
    snap.forEach((doc) => channels.push(serializeDoc(doc)));
    channels.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    return res.json({ ok: true, success: true, channels, data: channels });
  }

  const snap = await firestoreChannels.get();
  const channelsList = sortDocsDesc(snap.docs, 'createdAt').map((doc) => serializeDoc(doc));
  res.json({ ok: true, success: true, channels: channelsList, data: channelsList });
}));

app.post('/api/channels', checkMaintenanceAndBanGate, asyncHandler(async (req, res) => {
  const hasInitData = Boolean(req.headers['x-telegram-init-data']);
  if (hasInitData && req.body.channelUsername && !req.body.username) {
    return authMiddleware(req, res, async () => {
      const { channelUsername, title, subscribers, category, pricePerPost } = req.body;
      if (!channelUsername || !title || !pricePerPost) {
        return res.status(400).json({ success: false, message: 'Missing required fields' });
      }

      const config = await getSystemConfig();
      const matchedWord = findMatchedBlacklistWord(title, config.blacklistWords);
      if (matchedWord) {
        await writeAuditLog(db, {
          entityType: 'channel',
          entityId: req.user.telegramId,
          severity: 'high',
          reason: `محاولة تسجيل قناة تحتوي على كلمة من القائمة السوداء: ${matchedWord}`,
          meta: { title, matchedWord }
        });
        return res.status(400).json({
          ok: false,
          success: false,
          error: `تم رفض القناة لاحتوائها على كلمة محظورة في القائمة السوداء (${matchedWord}).`,
          message: `Blacklisted word detected: ${matchedWord}`
        });
      }

      const cleanUsername = String(channelUsername).replace('@', '').trim();
      const numericPrice = Number(pricePerPost);
      if (Number.isNaN(numericPrice) || numericPrice < 0.1) {
        return res.status(400).json({ success: false, message: 'Invalid pricePerPost (minimum 0.1)' });
      }

      const subCount = Number(subscribers) || 0;
      if (subCount > 0 && subCount < RULES.MIN_CHANNEL_SUBSCRIBERS) {
        return res.status(400).json({
          ok: false,
          success: false,
          autoRejected: true,
          error: `تم الرفض التلقائي الفوري: الحد الأدنى لقبول القنوات هو ${RULES.MIN_CHANNEL_SUBSCRIBERS} مشترك.`,
          message: `Minimum ${RULES.MIN_CHANNEL_SUBSCRIBERS} subscribers required`
        });
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
        subscribers: subCount,
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

  // Direct User Channel Registration Flow (when subscribers & userId/ownerId provided without legacy targetLanguage/category)
  const ownerId = extractUserId(req);
  if (ownerId && req.body?.subscribers !== undefined && !req.body?.language && !req.body?.category) {
    const name = (req.body?.name || '').toString().trim();
    const subscribers = Number(req.body?.subscribers);
    const price = roundMoney(req.body?.price);
    const referredBy = (req.body?.referredBy || '').toString().trim();

    if (!name || name.length < 2) {
      return res.status(400).json({ ok: false, success: false, error: 'اسم القناة مطلوب.' });
    }
    if (!Number.isFinite(subscribers) || subscribers < 0) {
      return res.status(400).json({ ok: false, success: false, error: 'عدد المشتركين يجب أن يكون رقماً صحيحاً.' });
    }
    if (price <= 0) {
      return res.status(400).json({ ok: false, success: false, error: 'سعر الإعلان يجب أن يكون أكبر من صفر.' });
    }

    const config = await getSystemConfig();
    const matchedWord = findMatchedBlacklistWord(name, config.blacklistWords);
    if (matchedWord) {
      await writeAuditLog(db, {
        entityType: 'channel',
        entityId: ownerId,
        severity: 'high',
        reason: `محاولة تسجيل قناة تحتوي على كلمة من القائمة السوداء: ${matchedWord}`,
        meta: { name, matchedWord }
      });
      return res.status(400).json({
        ok: false,
        success: false,
        error: `تم رفض القناة لاحتوائها على كلمة محظورة في القائمة السوداء (${matchedWord}).`
      });
    }

    if (subscribers < RULES.MIN_CHANNEL_SUBSCRIBERS) {
      const rejectedId = generateId('chn_rej');
      await writeSecurityLog(db, {
        actorId: ownerId,
        actorRole: 'user',
        action: 'CHANNEL_AUTO_REJECTED_SUBSCRIBERS',
        targetId: rejectedId,
        details: { name, subscribers, minRequired: RULES.MIN_CHANNEL_SUBSCRIBERS },
        ip: req.ip
      });

      return res.status(400).json({
        ok: false,
        success: false,
        autoRejected: true,
        error: `تم الرفض التلقائي الفوري: الحد الأدنى لقبول القنوات هو ${RULES.MIN_CHANNEL_SUBSCRIBERS} مشترك (القناة الحالية: ${subscribers}).`
      });
    }

    const channelRecord = await db.runTransaction(async (tx) => {
      await ensureUserDoc(tx, ownerId, 'user', referredBy);
      if (referredBy && referredBy !== ownerId) {
        await ensureUserDoc(tx, referredBy, 'user', null);
      }

      const channelId = generateId('chn');
      const record = {
        id: channelId,
        ownerId,
        name,
        subscribers: Math.floor(subscribers),
        subscribersCount: Math.floor(subscribers),
        price,
        pricePer1000Views: price,
        viewsCount: 0,
        filteredBotViews: 0,
        earnedTotal: 0,
        status: 'active',
        approvalStatus: 'approved',
        isPublic: true,
        lastStatsAt: null,
        editHistory: [
          {
            action: 'registered',
            details: { name, subscribers: Math.floor(subscribers), price },
            at: nowIso()
          }
        ],
        createdAt: nowIso(),
        updatedAt: nowIso()
      };
      tx.set(firestoreChannels.doc(channelId), record);

      await writeSecurityLog(tx, {
        actorId: ownerId,
        actorRole: 'user',
        action: 'CHANNEL_REGISTERED',
        targetId: channelId,
        details: { name, subscribers: record.subscribers, price },
        ip: req.ip
      });

      return record;
    });

    return res.status(201).json({
      ok: true,
      success: true,
      channel: channelRecord,
      data: channelRecord
    });
  }

  // Marketplace Channel Registration Flow
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
    ownerName,
    subscribersCount
  } = req.body;

  if (!name || !username || !language || !category || (price === undefined && pricePer1000Views === undefined)) {
    return res.status(400).json({ success: false, message: 'Missing required fields' });
  }

  const config = await getSystemConfig();
  const matchedWord = findMatchedBlacklistWord(name, config.blacklistWords);
  if (matchedWord) {
    await writeAuditLog(db, {
      entityType: 'channel',
      entityId: ownerTelegramId || ownerId || 'anonymous',
      severity: 'high',
      reason: `محاولة تسجيل قناة تحتوي على كلمة من القائمة السوداء: ${matchedWord}`,
      meta: { name, matchedWord }
    });
    return res.status(400).json({
      ok: false,
      success: false,
      error: `تم رفض القناة لاحتوائها على كلمة محظورة في القائمة السوداء (${matchedWord}).`,
      message: `Blacklisted word detected: ${matchedWord}`
    });
  }

  if (subscribersCount !== undefined && Number(subscribersCount) < RULES.MIN_CHANNEL_SUBSCRIBERS) {
    return res.status(400).json({
      ok: false,
      success: false,
      autoRejected: true,
      error: `تم الرفض التلقائي الفوري: الحد الأدنى لقبول القنوات هو ${RULES.MIN_CHANNEL_SUBSCRIBERS} مشترك.`,
      message: `Minimum ${RULES.MIN_CHANNEL_SUBSCRIBERS} subscribers required`
    });
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
    subscribersCount: Number(subscribersCount) || 0,
    pricePer1000Views: chosenPrice,
    ownerId: ownerTelegramId ? String(ownerTelegramId).trim() : (ownerId || ''),
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
    viewsCount: 0,
    filteredBotViews: 0,
    earnedTotal: 0,
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

app.patch('/api/channels/:channelId', checkMaintenanceAndBanGate, asyncHandler(async (req, res) => {
  const channelId = (req.params.channelId || '').toString().trim();
  const nextPrice = req.body?.price !== undefined ? roundMoney(req.body.price) : null;
  const nextName = typeof req.body?.name === 'string' ? req.body.name.trim() : null;

  if (!channelId) {
    return res.status(400).json({ ok: false, success: false, error: 'معرف القناة مطلوب.' });
  }

  const config = await getSystemConfig();
  if (nextName) {
    const matched = findMatchedBlacklistWord(nextName, config.blacklistWords);
    if (matched) {
      return res.status(400).json({
        ok: false,
        success: false,
        error: `اسم القناة يحتوي على كلمة محظورة (${matched}).`
      });
    }
  }

  const updated = await db.runTransaction(async (tx) => {
    const chnRef = firestoreChannels.doc(channelId);
    const snap = await tx.get(chnRef);
    if (!snap.exists) return { notFound: true };

    const data = snap.data();
    const priceVal = nextPrice && nextPrice > 0 ? nextPrice : data.price;
    const nameVal = nextName || data.name;
    const history = Array.isArray(data.editHistory) ? data.editHistory.slice() : [];
    history.push({
      action: 'updated',
      details: { name: nameVal, price: priceVal },
      at: nowIso()
    });

    tx.update(chnRef, {
      name: nameVal,
      price: priceVal,
      pricePer1000Views: priceVal,
      editHistory: history,
      updatedAt: nowIso()
    });

    return Object.assign({}, data, {
      name: nameVal,
      price: priceVal,
      pricePer1000Views: priceVal,
      editHistory: history,
      updatedAt: nowIso()
    });
  });

  if (updated && updated.notFound) {
    return res.status(404).json({ ok: false, success: false, error: 'القناة غير موجودة.' });
  }

  res.json({ ok: true, success: true, channel: updated });
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
  if (name !== undefined) {
    const config = await getSystemConfig();
    const matched = findMatchedBlacklistWord(name, config.blacklistWords);
    if (matched) {
      return res.status(400).json({ success: false, message: `Blacklisted word detected: ${matched}` });
    }
    updateData.name = String(name).trim();
  }
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

app.post('/api/campaigns/estimate', checkMaintenanceAndBanGate, asyncHandler(async (req, res) => {
  const budget = roundMoney(req.body?.budget);
  const cpm = roundMoney(req.body?.cpm || 2.5);
  const expectedCtrPercent = Number(req.body?.expectedCtrPercent || 3.5);
  const avgConversionValue = roundMoney(req.body?.avgConversionValue || 12);

  if (budget <= 0 || cpm <= 0) {
    return res.status(400).json({ ok: false, success: false, error: 'يرجى إدخال ميزانية و CPM صالحين.' });
  }

  const estimatedImpressions = Math.floor((budget / cpm) * 1000);
  const estimatedClicks = Math.floor(estimatedImpressions * (expectedCtrPercent / 100));
  const estimatedGrossReturn = roundMoney(estimatedClicks * 0.25 * avgConversionValue);
  const estimatedNetProfit = roundMoney(estimatedGrossReturn - budget);
  const estimatedRoiPercent = roundMoney(((estimatedGrossReturn - budget) / budget) * 100);

  res.json({
    ok: true,
    success: true,
    estimate: {
      budget,
      cpm,
      estimatedImpressions,
      estimatedClicks,
      estimatedGrossReturn,
      estimatedNetProfit,
      estimatedRoiPercent,
      openTargetingEligible: budget > RULES.OPEN_TARGETING_MIN_BUDGET
    }
  });
}));

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

app.post('/api/campaigns/:campaignId/spend', checkMaintenanceAndBanGate, asyncHandler(async (req, res) => {
  const campaignId = (req.params.campaignId || '').toString().trim();
  const spendAmount = roundMoney(req.body?.amount);

  if (!campaignId || spendAmount <= 0) {
    return res.status(400).json({ ok: false, success: false, error: 'معرف الحملة ومبلغ الصرف مطلوبان.' });
  }

  const outcome = await db.runTransaction(async (tx) => {
    const cmpRef = firestoreCampaigns.doc(campaignId);
    const cmpSnap = await tx.get(cmpRef);
    if (!cmpSnap.exists) {
      return { notFound: true };
    }
    const cmpData = cmpSnap.data();
    if (cmpData.status !== 'active' || cmpData.settled) {
      return { invalidState: true, status: cmpData.status };
    }
    const currentRemaining = roundMoney(cmpData.remainingBudget || 0);
    if (currentRemaining < spendAmount) {
      return { overRemaining: true, currentRemaining };
    }
    const nextRemaining = roundMoney(currentRemaining - spendAmount);
    const nextStatus = nextRemaining === 0 ? 'completed' : 'active';
    const totalBudget = Number(cmpData.budget || 0);
    const ratio = totalBudget > 0 ? nextRemaining / totalBudget : 0;

    let lowAlertSent = Boolean(cmpData.lowBudgetAlertSent);
    if (!lowAlertSent && totalBudget > 0 && ratio <= RULES.BUDGET_LOW_ALERT_RATIO && cmpData.advertiserId) {
      lowAlertSent = true;
      await createSmartAlert(tx, {
        userId: cmpData.advertiserId,
        category: 'budget_low',
        title: 'تنبيه اقتراب نفاد ميزانية الحملة (15%)',
        message: `تبقى $${nextRemaining.toFixed(2)} فقط من ميزانية الحملة (${cmpData.title}).`
      });
    }

    const history = Array.isArray(cmpData.editHistory) ? cmpData.editHistory.slice() : [];
    history.push({
      action: 'spend_recorded',
      details: { spendAmount, remainingBudget: nextRemaining, status: nextStatus },
      at: nowIso()
    });

    tx.update(cmpRef, {
      remainingBudget: nextRemaining,
      spentAmount: roundMoney(Number(cmpData.spentAmount || 0) + spendAmount),
      status: nextStatus,
      lowBudgetAlertSent: lowAlertSent,
      editHistory: history,
      updatedAt: nowIso()
    });

    return { remainingBudget: nextRemaining, status: nextStatus, lowBudgetAlertSent };
  });

  if (outcome.notFound) {
    return res.status(404).json({ ok: false, success: false, error: 'الحملة غير موجودة.' });
  }
  if (outcome.invalidState) {
    return res.status(400).json({ ok: false, success: false, error: 'الحملة ليست نشطة للصرف.' });
  }
  if (outcome.overRemaining) {
    return res.status(400).json({
      ok: false,
      success: false,
      error: `مبلغ الصرف يتجاوز الميزانية المتبقية (${outcome.currentRemaining.toFixed(2)}$).`
    });
  }

  res.json({ ok: true, success: true, ...outcome });
}));

app.post('/api/campaigns/:campaignId/settle', checkMaintenanceAndBanGate, asyncHandler(async (req, res) => {
  const campaignId = (req.params.campaignId || '').toString().trim();
  const actionType = req.body?.action === 'stop' ? 'stopped' : 'completed';

  if (!campaignId) {
    return res.status(400).json({ ok: false, success: false, error: 'معرف الحملة مطلوب.' });
  }

  const settlementResult = await db.runTransaction(async (tx) => {
    const cmpRef = firestoreCampaigns.doc(campaignId);
    const cmpSnap = await tx.get(cmpRef);
    if (!cmpSnap.exists) {
      return { notFound: true };
    }

    const cmpData = cmpSnap.data();
    if (cmpData.settled === true || cmpData.status === 'completed' || cmpData.status === 'stopped') {
      return { alreadySettled: true, campaign: cmpData };
    }

    const refundAmount = roundMoney(cmpData.remainingBudget || 0);
    const advertiserRef = firestoreUsers.doc(cmpData.advertiserId);
    const advertiserData = await ensureUserDoc(tx, cmpData.advertiserId, 'user', null);

    const nextWalletBalance = roundMoney(Number(advertiserData.walletBalance || 0) + refundAmount);
    const history = Array.isArray(cmpData.editHistory) ? cmpData.editHistory.slice() : [];
    history.push({
      action: `settled_${actionType}`,
      details: { refundAmount },
      at: nowIso()
    });

    tx.update(cmpRef, {
      remainingBudget: 0,
      status: actionType,
      settled: true,
      settledAt: nowIso(),
      editHistory: history,
      updatedAt: nowIso()
    });

    tx.update(advertiserRef, {
      walletBalance: nextWalletBalance,
      adBalance: nextWalletBalance,
      updatedAt: nowIso()
    });

    const txRecordId = generateId('tx');
    tx.set(
      firestoreTransactions.doc(txRecordId),
      buildTransactionRecord({
        id: txRecordId,
        userId: cmpData.advertiserId,
        type: 'settlement',
        amount: refundAmount,
        status: 'completed',
        note: `تسوية ميزانية الحملة (${cmpData.title}) وإعادة المتبقي`
      })
    );

    await writeSecurityLog(tx, {
      actorId: extractUserId(req) || cmpData.advertiserId,
      actorRole: isAdminRequest(req) ? 'admin' : 'user',
      action: 'CAMPAIGN_ATOMIC_SETTLEMENT',
      targetId: campaignId,
      details: { refundAmount, finalStatus: actionType },
      ip: req.ip
    });

    return {
      settled: true,
      refundAmount,
      finalStatus: actionType,
      walletBalance: nextWalletBalance
    };
  });

  if (settlementResult.notFound) {
    return res.status(404).json({ ok: false, success: false, error: 'الحملة غير موجودة.' });
  }
  if (settlementResult.alreadySettled) {
    return res.status(409).json({
      ok: false,
      success: false,
      error: 'تمت تسوية هذه الحملة مسبقاً ولا يمكن تسويتها أو إعادة رصيدها مرة أخرى.'
    });
  }

  res.json({
    ok: true,
    success: true,
    ...settlementResult
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
  const nextRemaining = Number((Number(campaign.remainingBudget ?? campaign.budget ?? 0) + addAmount).toFixed(4));
  await campRef.update({ budget: nextBudget, remainingBudget: nextRemaining, updatedAt: new Date() });

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

app.get('/api/campaigns', checkMaintenanceAndBanGate, asyncHandler(async (req, res) => {
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

  const userId = extractUserId(req);
  if (userId) {
    const snap = await firestoreCampaigns.where('advertiserId', '==', userId).get();
    const campaigns = [];
    snap.forEach((doc) => campaigns.push(serializeDoc(doc)));
    campaigns.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    return res.json({ ok: true, success: true, campaigns, data: campaigns });
  }

  const snap = await firestoreCampaigns.get();
  const campaignsList = sortDocsDesc(snap.docs, 'updatedAt').map((doc) => serializeDoc(doc));
  res.json({ ok: true, success: true, campaigns: campaignsList, data: campaignsList });
}));

app.post('/api/campaigns', checkMaintenanceAndBanGate, asyncHandler(async (req, res) => {
  const hasInitData = Boolean(req.headers['x-telegram-init-data']);
  if (hasInitData && req.body.channelId && !req.body.targetLanguage) {
    return authMiddleware(req, res, async () => {
      const { channelId, title, adText, targetUrl } = req.body;
      if (!channelId || !title || !adText || !targetUrl) {
        return res.status(400).json({ success: false, message: 'Missing campaign fields' });
      }

      const config = await getSystemConfig();
      const matchedWord = findMatchedBlacklistWord(`${title} ${adText}`, config.blacklistWords);
      if (matchedWord) {
        await writeAuditLog(db, {
          entityType: 'campaign',
          entityId: req.user.telegramId,
          severity: 'high',
          reason: `محاولة إنشاء حملة تحتوي على كلمة من القائمة السوداء: ${matchedWord}`,
          meta: { title, matchedWord }
        });
        await createSmartAlert(db, {
          userId: req.user.telegramId,
          category: 'content_block',
          title: 'تم حظر محتوى الحملة',
          message: `تم رفض إنشاء الحملة لاحتوائها على كلمة محظورة في القائمة السوداء (${matchedWord}).`
        });
        return res.status(400).json({
          ok: false,
          success: false,
          error: `تم منع إنشاء الحملة لاحتوائها على كلمة محظورة في القائمة السوداء (${matchedWord}).`,
          message: `Blacklisted word detected: ${matchedWord}`
        });
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
          adBalance: currentAdBalance - cost,
          walletBalance: currentAdBalance - cost
        });

        t.set(newCampaignRef, {
          advertiserId: req.user.telegramId,
          channelId: channelDoc.id,
          title: String(title).trim(),
          adText: String(adText).trim(),
          targetUrl: String(targetUrl).trim(),
          budget: cost,
          remainingBudget: cost,
          status: 'pending',
          settled: false,
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

  // Direct User Campaign Creation with Budget Reservation & Open Targeting Rule
  const userId = extractUserId(req);
  if (userId && !req.body?.targetLanguage && !req.body?.targetCategory) {
    const title = (req.body?.title || '').toString().trim();
    const budget = roundMoney(req.body?.budget);
    const targetingMode = (req.body?.targetingMode || 'specific').toString().trim();

    if (!title || title.length < 3) {
      return res.status(400).json({ ok: false, success: false, error: 'عنوان الحملة مطلوب.' });
    }
    if (budget <= 0) {
      return res.status(400).json({ ok: false, success: false, error: 'ميزانية الحملة يجب أن تكون أكبر من صفر.' });
    }
    if (targetingMode !== 'open' && targetingMode !== 'specific') {
      return res.status(400).json({ ok: false, success: false, error: 'نوع الاستهداف غير صالح.' });
    }

    const config = await getSystemConfig();
    const matchedWord = findMatchedBlacklistWord(title, config.blacklistWords);
    if (matchedWord) {
      await writeAuditLog(db, {
        entityType: 'campaign',
        entityId: userId,
        severity: 'high',
        reason: `محاولة إنشاء حملة تحتوي على كلمة من القائمة السوداء: ${matchedWord}`,
        meta: { title, matchedWord }
      });
      await createSmartAlert(db, {
        userId,
        category: 'content_block',
        title: 'تم حظر محتوى الحملة',
        message: `تم رفض إنشاء الحملة لاحتوائها على كلمة محظورة في القائمة السوداء (${matchedWord}).`
      });
      return res.status(400).json({
        ok: false,
        success: false,
        error: `تم منع إنشاء الحملة لاحتوائها على كلمة محظورة في القائمة السوداء (${matchedWord}).`
      });
    }

    if (targetingMode === 'open' && budget <= RULES.OPEN_TARGETING_MIN_BUDGET) {
      await writeSecurityLog(db, {
        actorId: userId,
        actorRole: 'user',
        action: 'OPEN_TARGETING_REJECTED_SERVER',
        targetId: null,
        details: { budget, requiredGreaterThan: RULES.OPEN_TARGETING_MIN_BUDGET },
        ip: req.ip
      });

      return res.status(400).json({
        ok: false,
        success: false,
        error: `الاستهداف المفتوح متاح فقط عندما تكون الميزانية أكبر من ${RULES.OPEN_TARGETING_MIN_BUDGET}$ (الميزانية المدخلة: ${budget}$).`
      });
    }

    const created = await db.runTransaction(async (tx) => {
      const userRef = firestoreUsers.doc(userId);
      const userData = await ensureUserDoc(tx, userId, 'user', null);
      const walletBalance = roundMoney(userData.walletBalance || 0);

      if (walletBalance < budget) {
        return { insufficientFunds: true, walletBalance };
      }

      const nextWalletBalance = roundMoney(walletBalance - budget);
      tx.update(userRef, {
        walletBalance: nextWalletBalance,
        adBalance: nextWalletBalance,
        updatedAt: nowIso()
      });

      const campaignId = generateId('cmp');
      const txRecordId = generateId('tx');

      const campaignRecord = {
        id: campaignId,
        advertiserId: userId,
        title,
        budget,
        remainingBudget: budget,
        spentAmount: 0,
        targetingMode,
        openTargeting: targetingMode === 'open',
        status: 'active',
        settled: false,
        lowBudgetAlertSent: false,
        editHistory: [
          {
            action: 'created',
            details: { title, budget, targetingMode },
            at: nowIso()
          }
        ],
        createdAt: nowIso(),
        updatedAt: nowIso()
      };

      tx.set(firestoreCampaigns.doc(campaignId), campaignRecord);
      tx.set(
        firestoreTransactions.doc(txRecordId),
        buildTransactionRecord({
          id: txRecordId,
          userId,
          type: 'settlement',
          amount: budget,
          status: 'completed',
          note: `حجز ميزانية الحملة: ${title}`
        })
      );

      await writeSecurityLog(tx, {
        actorId: userId,
        actorRole: 'user',
        action: 'CAMPAIGN_CREATED_BUDGET_RESERVED',
        targetId: campaignId,
        details: { title, budget, targetingMode },
        ip: req.ip
      });

      return { campaign: campaignRecord, walletBalance: nextWalletBalance };
    });

    if (created.insufficientFunds) {
      return res.status(400).json({
        ok: false,
        success: false,
        error: `رصيد المحفظة غير كافٍ لتغطية الميزانية. الرصيد الحالي: ${created.walletBalance.toFixed(2)}$.`
      });
    }

    return res.status(201).json({
      ok: true,
      success: true,
      campaign: created.campaign,
      data: created.campaign,
      walletBalance: created.walletBalance
    });
  }

  // Marketplace Campaign Creation Flow
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

  const config = await getSystemConfig();
  const matchedWord = findMatchedBlacklistWord(`${title} ${adText || ''}`, config.blacklistWords);
  if (matchedWord) {
    await writeAuditLog(db, {
      entityType: 'campaign',
      entityId: userId || 'anonymous',
      severity: 'high',
      reason: `محاولة إنشاء حملة تحتوي على كلمة من القائمة السوداء: ${matchedWord}`,
      meta: { title, matchedWord }
    });
    return res.status(400).json({
      ok: false,
      success: false,
      error: `تم منع إنشاء الحملة لاحتوائها على كلمة محظورة في القائمة السوداء (${matchedWord}).`,
      message: `Blacklisted word detected: ${matchedWord}`
    });
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
  const isOpenTargeting = !isNaN(numericBudget) && numericBudget > RULES.OPEN_TARGETING_MIN_BUDGET;
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

  const finalBudget = isNaN(numericBudget) || numericBudget < 1 ? 50 : numericBudget;
  const now = new Date();
  const campRef = await firestoreCampaigns.add({
    advertiserId: userId || '',
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
    budget: finalBudget,
    remainingBudget: finalBudget,
    spentAmount: 0,
    totalViews: 0,
    openTargeting: isOpenTargeting,
    targetingMode: isOpenTargeting ? 'open' : 'specific',
    targetLanguage,
    targetCategory,
    maxPricePerPost: numericPrice,
    scheduleMode: validScheduleMode,
    scheduledAt: finalStatus === 'scheduled' ? computeNextPeakSlot() : null,
    selectedChannelIds: validIds,
    publishedChannels: [],
    status: finalStatus,
    settled: false,
    lowBudgetAlertSent: false,
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

app.patch('/api/campaigns/:campaignId', checkMaintenanceAndBanGate, asyncHandler(async (req, res) => {
  const campaignId = (req.params.campaignId || '').toString().trim();
  const nextTitle = typeof req.body?.title === 'string' ? req.body.title.trim() : null;
  const nextTargeting = typeof req.body?.targetingMode === 'string' ? req.body.targetingMode.trim() : null;

  if (!campaignId) {
    return res.status(400).json({ ok: false, success: false, error: 'معرف الحملة مطلوب.' });
  }

  const config = await getSystemConfig();
  if (nextTitle) {
    const matched = findMatchedBlacklistWord(nextTitle, config.blacklistWords);
    if (matched) {
      return res.status(400).json({
        ok: false,
        success: false,
        error: `العنوان الجديد يحتوي على كلمة محظورة في القائمة السوداء (${matched}).`
      });
    }
  }

  const updated = await db.runTransaction(async (tx) => {
    const cmpRef = firestoreCampaigns.doc(campaignId);
    const cmpSnap = await tx.get(cmpRef);
    if (!cmpSnap.exists) return { notFound: true };

    const cmpData = cmpSnap.data();
    const budgetVal = Number(cmpData.budget || 0);
    const targetMode = nextTargeting || cmpData.targetingMode;

    if (targetMode === 'open' && budgetVal <= RULES.OPEN_TARGETING_MIN_BUDGET) {
      return { openNotAllowed: true };
    }

    const titleVal = nextTitle || cmpData.title;
    const history = Array.isArray(cmpData.editHistory) ? cmpData.editHistory.slice() : [];
    history.push({
      action: 'updated',
      details: { title: titleVal, targetingMode: targetMode },
      at: nowIso()
    });

    tx.update(cmpRef, {
      title: titleVal,
      targetingMode: targetMode,
      openTargeting: targetMode === 'open',
      editHistory: history,
      updatedAt: nowIso()
    });

    return Object.assign({}, cmpData, {
      title: titleVal,
      targetingMode: targetMode,
      openTargeting: targetMode === 'open',
      editHistory: history,
      updatedAt: nowIso()
    });
  });

  if (updated && updated.notFound) {
    return res.status(404).json({ ok: false, success: false, error: 'الحملة غير موجودة.' });
  }
  if (updated && updated.openNotAllowed) {
    return res.status(400).json({
      ok: false,
      success: false,
      error: `الاستهداف المفتوح يتطلب ميزانية أكبر من ${RULES.OPEN_TARGETING_MIN_BUDGET}$.`
    });
  }

  res.json({ ok: true, success: true, campaign: updated });
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

  const config = await getSystemConfig();
  if (title !== undefined || adText !== undefined) {
    const matched = findMatchedBlacklistWord(`${title || ''} ${adText || ''}`, config.blacklistWords);
    if (matched) {
      return res.status(400).json({ success: false, message: `Blacklisted word detected: ${matched}` });
    }
  }

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
      updates.openTargeting = bNum > RULES.OPEN_TARGETING_MIN_BUDGET;
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

app.get('/api/wallet/:userId', checkMaintenanceAndBanGate, asyncHandler(async (req, res) => {
  const userId = (req.params.userId || '').toString().trim();
  if (!userId) {
    return res.status(400).json({ ok: false, success: false, error: 'معرف المستخدم مطلوب.' });
  }

  await db.runTransaction(async (tx) => {
    await ensureUserDoc(tx, userId, 'user', null);
  });

  await releaseMaturedEarningsForUser(userId);

  const userSnap = await firestoreUsers.doc(userId).get();
  const userData = userSnap.data() || {};
  if (userData.referredBy) {
    await releaseMaturedEarningsForUser(userData.referredBy);
  }

  const [txSnap, wdrSnap, alertsSnap] = await Promise.all([
    firestoreTransactions.where('userId', '==', userId).get(),
    firestoreWithdrawals.where('userId', '==', userId).get(),
    firestoreSmartAlerts.where('userId', '==', userId).get()
  ]);

  const allUserTx = [];
  txSnap.forEach((doc) => {
    allUserTx.push(doc.data());
  });
  allUserTx.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

  const withdrawals = [];
  wdrSnap.forEach((doc) => {
    withdrawals.push(doc.data());
  });
  withdrawals.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

  const smartAlerts = [];
  alertsSnap.forEach((doc) => {
    smartAlerts.push(doc.data());
  });
  smartAlerts.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

  res.json({
    ok: true,
    success: true,
    user: userData,
    depositInfo: {
      network: RULES.NETWORK,
      walletAddress: RULES.WALLET_ADDRESS,
      minDepositUsd: RULES.MIN_DEPOSIT_USD
    },
    withdrawalInfo: {
      network: RULES.WITHDRAWAL_NETWORK,
      minWithdrawalUsd: RULES.MIN_WITHDRAWAL_USD,
      feeUsd: RULES.WITHDRAWAL_FEE_USD
    },
    recentTransactions: allUserTx.slice(0, 10),
    withdrawals,
    smartAlerts: smartAlerts.slice(0, 15)
  });
}));

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

app.post('/api/wallet/deposit', checkMaintenanceAndBanGate, asyncHandler(async (req, res) => {
  const hasInitData = Boolean(req.headers['x-telegram-init-data']);
  if (hasInitData && !req.body.role && !req.body.txid) {
    return authMiddleware(req, res, async () => {
      const amount = Number(req.body.amount);
      if (!amount || amount < RULES.MIN_DEPOSIT_USD) {
        return res.status(400).json({
          success: false,
          message: `Minimum deposit is ${RULES.MIN_DEPOSIT_USD} USD`
        });
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

  // TXID-Protected Crypto Deposit Flow (USDT - BEP20)
  const userId = extractUserId(req);
  if (userId && (req.body?.txid !== undefined || !req.body?.role)) {
    const amount = roundMoney(req.body?.amount);
    const txid = (req.body?.txid || '').toString().trim();

    if (amount < RULES.MIN_DEPOSIT_USD) {
      return res.status(400).json({
        ok: false,
        success: false,
        error: `الحد الأدنى للإيداع هو ${RULES.MIN_DEPOSIT_USD.toFixed(2)}$ عبر شبكة ${RULES.NETWORK}.`
      });
    }
    if (!txid || txid.length < 10) {
      return res.status(400).json({ ok: false, success: false, error: 'يرجى إدخال رقم المعاملة TXID صحيح.' });
    }

    const normalizedTxid = txid.toLowerCase();

    const depositResult = await db.runTransaction(async (tx) => {
      await ensureUserDoc(tx, userId, 'user', null);

      const duplicateQuery = firestoreDeposits.where('txidNormalized', '==', normalizedTxid);
      const duplicateSnap = await tx.get(duplicateQuery);
      if (!duplicateSnap.empty) {
        const err = new Error('DUPLICATE_TXID');
        err.statusCode = 409;
        throw err;
      }

      const depositId = generateId('dep');
      const txRecordId = generateId('tx');

      const depositRecord = {
        id: depositId,
        userId,
        amount,
        network: RULES.NETWORK,
        walletAddress: RULES.WALLET_ADDRESS,
        txid,
        txidNormalized: normalizedTxid,
        status: 'pending',
        adminNote: '',
        createdAt: nowIso(),
        updatedAt: nowIso()
      };

      tx.set(firestoreDeposits.doc(depositId), depositRecord);
      tx.set(
        firestoreTransactions.doc(txRecordId),
        buildTransactionRecord({
          id: txRecordId,
          userId,
          type: 'deposit',
          amount,
          status: 'pending',
          txid,
          note: `طلب إيداع (${RULES.NETWORK}) قيد المراجعة`
        })
      );

      await writeSecurityLog(tx, {
        actorId: userId,
        actorRole: 'user',
        action: 'DEPOSIT_SUBMITTED',
        targetId: depositId,
        details: { amount, txid },
        ip: req.ip
      });

      return depositRecord;
    }).catch((err) => {
      if (err && err.message === 'DUPLICATE_TXID') {
        return { duplicate: true };
      }
      throw err;
    });

    if (depositResult && depositResult.duplicate) {
      await writeSecurityLog(db, {
        actorId: userId,
        actorRole: 'user',
        action: 'DUPLICATE_TXID_BLOCKED',
        targetId: txid,
        details: { amount, txid },
        ip: req.ip
      });
      await writeAuditLog(db, {
        entityType: 'user',
        entityId: userId,
        severity: 'high',
        reason: 'محاولة تكرار رقم المعاملة TXID في طلب إيداع',
        meta: { txid, amount }
      });
      return res.status(409).json({
        ok: false,
        success: false,
        error: 'رقم المعاملة TXID مستخدم مسبقاً في طلب أو حساب آخر ولا يُسمح بتكراره.'
      });
    }

    return res.status(201).json({
      ok: true,
      success: true,
      deposit: depositResult
    });
  }

  // Legacy Account Role Deposit Flow
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

app.post('/api/wallet/withdraw', checkMaintenanceAndBanGate, asyncHandler(async (req, res) => {
  const hasInitData = Boolean(req.headers['x-telegram-init-data']);
  if (hasInitData && !req.body.role && !req.body.destinationAddress) {
    return authMiddleware(req, res, async () => {
      const amount = Number(req.body.amount);
      const walletAddress = (req.body.walletAddress || '').trim();

      if (!amount || amount < RULES.MIN_WITHDRAWAL_USD || !walletAddress) {
        return res.status(400).json({
          success: false,
          message: `Minimum withdrawal is $${RULES.MIN_WITHDRAWAL_USD} and wallet address is required`
        });
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
          balance: currentBalance - amount,
          availableEarnings: currentBalance - amount
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

  // TRC20 Withdrawal Flow with Fee Deduction & Step Tracking
  const userId = extractUserId(req);
  if (userId && (req.body?.destinationAddress !== undefined || !req.body?.role)) {
    const amount = roundMoney(req.body?.amount);
    const destinationAddress = (req.body?.destinationAddress || '').toString().trim();

    if (amount < RULES.MIN_WITHDRAWAL_USD) {
      return res.status(400).json({
        ok: false,
        success: false,
        error: `الحد الأدنى للسحب هو ${RULES.MIN_WITHDRAWAL_USD.toFixed(2)}$ عبر شبكة ${RULES.WITHDRAWAL_NETWORK}.`
      });
    }
    if (amount <= RULES.WITHDRAWAL_FEE_USD) {
      return res.status(400).json({
        ok: false,
        success: false,
        error: `مبلغ السحب يجب أن يكون أكبر من رسوم السحب (${RULES.WITHDRAWAL_FEE_USD.toFixed(2)}$).`
      });
    }
    if (!destinationAddress || destinationAddress.length < 20) {
      return res.status(400).json({
        ok: false,
        success: false,
        error: `يرجى إدخال عنوان محفظة ${RULES.WITHDRAWAL_NETWORK} صحيح للسحب.`
      });
    }

    await releaseMaturedEarningsForUser(userId);

    const netAmount = roundMoney(amount - RULES.WITHDRAWAL_FEE_USD);

    const result = await db.runTransaction(async (tx) => {
      const userRef = firestoreUsers.doc(userId);
      const userData = await ensureUserDoc(tx, userId, 'user', null);
      const available = roundMoney(userData.availableEarnings || 0);

      if (available < amount) {
        return { insufficient: true, available };
      }

      const nextAvailable = roundMoney(available - amount);
      tx.update(userRef, {
        availableEarnings: nextAvailable,
        balance: nextAvailable,
        trc20Address: destinationAddress,
        updatedAt: nowIso()
      });

      const withdrawalId = generateId('wdr');
      const txRecordId = generateId('tx');

      const withdrawalRecord = {
        id: withdrawalId,
        userId,
        amount,
        feeAmount: RULES.WITHDRAWAL_FEE_USD,
        netAmount,
        network: RULES.WITHDRAWAL_NETWORK,
        destinationAddress,
        status: 'pending',
        adminNote: '',
        steps: [
          { step: 'pending', label: 'قيد المراجعة', at: nowIso() }
        ],
        createdAt: nowIso(),
        updatedAt: nowIso()
      };

      tx.set(firestoreWithdrawals.doc(withdrawalId), withdrawalRecord);
      tx.set(
        firestoreTransactions.doc(txRecordId),
        buildTransactionRecord({
          id: txRecordId,
          userId,
          type: 'withdrawal',
          amount: netAmount,
          status: 'pending',
          note: `طلب سحب ${amount.toFixed(2)}$ (رسوم ${RULES.WITHDRAWAL_FEE_USD.toFixed(2)}$، صافي ${netAmount.toFixed(2)}$) عبر ${RULES.WITHDRAWAL_NETWORK} إلى ${destinationAddress}`
        })
      );

      await writeSecurityLog(tx, {
        actorId: userId,
        actorRole: 'user',
        action: 'WITHDRAWAL_REQUESTED',
        targetId: withdrawalId,
        details: {
          amount,
          feeAmount: RULES.WITHDRAWAL_FEE_USD,
          netAmount,
          network: RULES.WITHDRAWAL_NETWORK,
          destinationAddress
        },
        ip: req.ip
      });

      return { withdrawal: withdrawalRecord, availableEarnings: nextAvailable };
    });

    if (result.insufficient) {
      return res.status(400).json({
        ok: false,
        success: false,
        error: `الرصيد القابل للسحب غير كافٍ. المتاح حالياً: ${result.available.toFixed(2)}$.`
      });
    }

    return res.status(201).json({
      ok: true,
      success: true,
      withdrawal: result.withdrawal,
      availableEarnings: result.availableEarnings
    });
  }

  // Legacy Account Role Withdrawal Flow
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

app.get('/api/admin/overview', requireAdmin, asyncHandler(async (req, res) => {
  const config = await getSystemConfig();

  const [depositsSnap, withdrawalsSnap, ticketsSnap, broadcastsSnap, logsSnap, auditSnap, usersSnap, campaignsSnap, channelsSnap] =
    await Promise.all([
      firestoreDeposits.get(),
      firestoreWithdrawals.get(),
      firestoreTickets.get(),
      firestoreBroadcasts.get(),
      firestoreSecurityLogs.get(),
      firestoreAuditLogs.get(),
      firestoreUsers.get(),
      firestoreCampaigns.get(),
      firestoreChannels.get()
    ]);

  const deposits = [];
  depositsSnap.forEach((doc) => deposits.push(doc.data()));
  deposits.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

  const withdrawals = [];
  withdrawalsSnap.forEach((doc) => withdrawals.push(doc.data()));
  withdrawals.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

  const tickets = [];
  ticketsSnap.forEach((doc) => tickets.push(doc.data()));
  tickets.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));

  const broadcasts = [];
  broadcastsSnap.forEach((doc) => broadcasts.push(doc.data()));
  broadcasts.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

  const securityLogs = [];
  logsSnap.forEach((doc) => securityLogs.push(doc.data()));
  securityLogs.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

  const auditLogs = [];
  auditSnap.forEach((doc) => auditLogs.push(doc.data()));
  auditLogs.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

  let totalLiquidity = 0;
  let totalPendingEarnings = 0;
  let totalAvailableEarnings = 0;
  usersSnap.forEach((doc) => {
    const u = doc.data();
    totalLiquidity = roundMoney(totalLiquidity + Number(u.walletBalance || 0));
    totalPendingEarnings = roundMoney(totalPendingEarnings + Number(u.pendingEarnings || 0));
    totalAvailableEarnings = roundMoney(totalAvailableEarnings + Number(u.availableEarnings || 0));
  });

  const todayPrefix = nowIso().slice(0, 10);
  let approvedDepositsToday = 0;
  deposits.forEach((d) => {
    if (d.status === 'approved' && (d.updatedAt || d.createdAt || '').startsWith(todayPrefix)) {
      approvedDepositsToday = roundMoney(approvedDepositsToday + Number(d.amount || 0));
    }
  });

  let completedWithdrawalsToday = 0;
  let withdrawalFeesToday = 0;
  withdrawals.forEach((w) => {
    if (w.status === 'completed' && (w.updatedAt || w.createdAt || '').startsWith(todayPrefix)) {
      completedWithdrawalsToday = roundMoney(completedWithdrawalsToday + Number(w.netAmount || w.amount || 0));
      withdrawalFeesToday = roundMoney(withdrawalFeesToday + Number(w.feeAmount || 0));
    }
  });

  let activeCampaignsCount = 0;
  let lockedCampaignBudget = 0;
  campaignsSnap.forEach((doc) => {
    const c = doc.data();
    if (c.status === 'active' && !c.settled) {
      activeCampaignsCount += 1;
      lockedCampaignBudget = roundMoney(lockedCampaignBudget + Number(c.remainingBudget || 0));
    }
  });

  let activeChannelsCount = 0;
  let totalValidViews = 0;
  let totalFilteredBotViews = 0;
  channelsSnap.forEach((doc) => {
    const ch = doc.data();
    if (ch.status === 'active' || ch.approvalStatus === 'approved') activeChannelsCount += 1;
    totalValidViews += Number(ch.viewsCount || 0);
    totalFilteredBotViews += Number(ch.filteredBotViews || 0);
  });

  const netPlatformProfitToday = roundMoney(withdrawalFeesToday);

  res.json({
    ok: true,
    success: true,
    maintenanceMode: Boolean(config.maintenanceMode),
    maintenanceMessage: config.maintenanceMessage || '',
    blacklistWords: config.blacklistWords || [],
    bannedUsers: config.bannedUsers || {},
    bannedChannels: config.bannedChannels || {},
    bannedAdvertisers: config.bannedAdvertisers || {},
    liveMetrics: {
      totalLiquidity,
      totalPendingEarnings,
      totalAvailableEarnings,
      lockedCampaignBudget,
      activeCampaignsCount,
      activeChannelsCount,
      totalValidViews,
      totalFilteredBotViews
    },
    dailyReport: {
      date: todayPrefix,
      approvedDepositsToday,
      completedWithdrawalsToday,
      withdrawalFeesToday,
      netPlatformProfitToday
    },
    deposits: deposits.slice(0, 25),
    withdrawals: withdrawals.slice(0, 25),
    tickets: tickets.slice(0, 25),
    broadcasts: broadcasts.slice(0, 15),
    auditLogs: auditLogs.slice(0, 25),
    securityLogs: securityLogs.slice(0, 25)
  });
}));

app.post('/api/admin/maintenance', requireAdmin, asyncHandler(async (req, res) => {
  const enabled = Boolean(req.body?.enabled);
  const message = (req.body?.message || 'النظام في وضع الصيانة حالياً لإجراء التحديثات.').toString().trim();

  await firestoreSystemConfig.doc('global').set(
    {
      maintenanceMode: enabled,
      maintenanceMessage: message,
      updatedAt: nowIso(),
      updatedBy: 'admin'
    },
    { merge: true }
  );

  await writeSecurityLog(db, {
    actorId: 'admin',
    actorRole: 'admin',
    action: enabled ? 'MAINTENANCE_MODE_ENABLED' : 'MAINTENANCE_MODE_DISABLED',
    targetId: 'global',
    details: { enabled, message },
    ip: req.ip
  });

  res.json({
    ok: true,
    success: true,
    maintenanceMode: enabled,
    maintenanceMessage: message
  });
}));

app.post('/api/admin/ban', requireAdmin, asyncHandler(async (req, res) => {
  const entityType = (req.body?.entityType || '').toString().trim();
  const entityId = (req.body?.entityId || '').toString().trim();
  const reason = (req.body?.reason || '').toString().trim();
  const unban = Boolean(req.body?.unban);

  if (!['user', 'channel', 'advertiser'].includes(entityType) || !entityId) {
    return res.status(400).json({ ok: false, success: false, error: 'نوع الكيان ومعرفه مطلوبان.' });
  }
  if (!unban && !reason) {
    return res.status(400).json({ ok: false, success: false, error: 'سبب الحظر مطلوب.' });
  }

  const fieldMap = {
    user: 'bannedUsers',
    channel: 'bannedChannels',
    advertiser: 'bannedAdvertisers'
  };
  const targetField = fieldMap[entityType];

  await db.runTransaction(async (tx) => {
    const cfgRef = firestoreSystemConfig.doc('global');
    const cfgSnap = await tx.get(cfgRef);
    const currentCfg = cfgSnap.exists ? cfgSnap.data() : {};
    const mapObj = Object.assign({}, currentCfg[targetField] || {});

    if (unban) {
      delete mapObj[entityId];
    } else {
      mapObj[entityId] = {
        reason,
        bannedAt: nowIso(),
        bannedBy: 'admin'
      };
    }

    tx.set(cfgRef, { [targetField]: mapObj, updatedAt: nowIso() }, { merge: true });

    if (entityType === 'user' || entityType === 'advertiser') {
      const userRef = firestoreUsers.doc(entityId);
      const userSnap = await tx.get(userRef);
      if (userSnap.exists) {
        tx.update(userRef, {
          banned: !unban,
          isBanned: !unban,
          banReason: unban ? '' : reason,
          updatedAt: nowIso()
        });
      }
    }

    if (entityType === 'channel') {
      const chnRef = firestoreChannels.doc(entityId);
      const chnSnap = await tx.get(chnRef);
      if (chnSnap.exists) {
        tx.update(chnRef, {
          status: unban ? 'active' : 'banned',
          banReason: unban ? '' : reason,
          updatedAt: nowIso()
        });
      }
    }

    await writeAuditLog(tx, {
      entityType,
      entityId,
      severity: 'high',
      reason: unban ? `إلغاء الحظر عن ${entityType}` : `حظر فوري: ${reason}`,
      meta: { unban, reason }
    });

    await writeSecurityLog(tx, {
      actorId: 'admin',
      actorRole: 'admin',
      action: unban ? 'ENTITY_UNBANNED' : 'ENTITY_BANNED',
      targetId: entityId,
      details: { entityType, reason, unban },
      ip: req.ip
    });
  });

  res.json({ ok: true, success: true, entityType, entityId, banned: !unban });
}));

app.post('/api/admin/blacklist', requireAdmin, asyncHandler(async (req, res) => {
  const word = (req.body?.word || '').toString().trim().toLowerCase();
  const remove = Boolean(req.body?.remove);

  if (!word) {
    return res.status(400).json({ ok: false, success: false, error: 'الكلمة مطلوبة.' });
  }

  const nextList = await db.runTransaction(async (tx) => {
    const cfgRef = firestoreSystemConfig.doc('global');
    const cfgSnap = await tx.get(cfgRef);
    const currentCfg = cfgSnap.exists ? cfgSnap.data() : {};
    const existing = Array.isArray(currentCfg.blacklistWords) ? currentCfg.blacklistWords.slice() : [];
    const filtered = existing.filter((w) => String(w).toLowerCase() !== word);
    if (!remove) {
      filtered.push(word);
    }

    tx.set(cfgRef, { blacklistWords: filtered, updatedAt: nowIso() }, { merge: true });

    await writeSecurityLog(tx, {
      actorId: 'admin',
      actorRole: 'admin',
      action: remove ? 'BLACKLIST_WORD_REMOVED' : 'BLACKLIST_WORD_ADDED',
      targetId: word,
      details: { word, remove },
      ip: req.ip
    });

    return filtered;
  });

  res.json({ ok: true, success: true, blacklistWords: nextList });
}));

app.post('/api/admin/campaigns/:campaignId/emergency-stop', requireAdmin, asyncHandler(async (req, res) => {
  const campaignId = (req.params.campaignId || '').toString().trim();
  const reason = (req.body?.reason || 'إيقاف طارئ فوري من الإدارة').toString().trim();

  if (!campaignId) {
    return res.status(400).json({ ok: false, success: false, error: 'معرف الحملة مطلوب.' });
  }

  const result = await db.runTransaction(async (tx) => {
    const cmpRef = firestoreCampaigns.doc(campaignId);
    const cmpSnap = await tx.get(cmpRef);
    if (!cmpSnap.exists) return { notFound: true };

    const cmpData = cmpSnap.data();
    const refundAmount = cmpData.settled ? 0 : roundMoney(cmpData.remainingBudget || 0);

    const userRef = firestoreUsers.doc(cmpData.advertiserId);
    const userData = await ensureUserDoc(tx, cmpData.advertiserId, 'user', null);
    const nextWallet = roundMoney(Number(userData.walletBalance || 0) + refundAmount);

    const history = Array.isArray(cmpData.editHistory) ? cmpData.editHistory.slice() : [];
    history.push({
      action: 'emergency_stopped_all_channels',
      details: { reason, refundAmount },
      at: nowIso()
    });

    tx.update(cmpRef, {
      status: 'stopped',
      emergencyStopped: true,
      emergencyReason: reason,
      remainingBudget: 0,
      settled: true,
      settledAt: nowIso(),
      editHistory: history,
      updatedAt: nowIso()
    });

    if (refundAmount > 0) {
      tx.update(userRef, {
        walletBalance: nextWallet,
        adBalance: nextWallet,
        updatedAt: nowIso()
      });
    }

    await createSmartAlert(tx, {
      userId: cmpData.advertiserId,
      category: 'content_block',
      title: 'إيقاف طارئ للإعلان من جميع القنوات',
      message: `تم إيقاف الحملة (${cmpData.title}) فوراً من جميع القنوات. السبب: ${reason}`
    });

    await writeSecurityLog(tx, {
      actorId: 'admin',
      actorRole: 'admin',
      action: 'CAMPAIGN_EMERGENCY_STOPPED',
      targetId: campaignId,
      details: { reason, refundAmount },
      ip: req.ip
    });

    return { campaignId, refundAmount, walletBalance: nextWallet };
  });

  if (result.notFound) {
    return res.status(404).json({ ok: false, success: false, error: 'الحملة غير موجودة.' });
  }

  res.json({ ok: true, success: true, ...result });
}));

app.post('/api/admin/deposits/:depositId/review', requireAdmin, asyncHandler(async (req, res) => {
  const depositId = (req.params.depositId || '').toString().trim();
  const decision = (req.body?.decision || '').toString().trim();
  const reason = (req.body?.reason || '').toString().trim();

  if (!depositId || (decision !== 'approve' && decision !== 'reject')) {
    return res.status(400).json({ ok: false, success: false, error: 'القرار يجب أن يكون approve أو reject.' });
  }
  if (!reason) {
    return res.status(400).json({ ok: false, success: false, error: 'سبب القبول أو الرفض مطلوب.' });
  }

  const reviewResult = await db.runTransaction(async (tx) => {
    const depRef = firestoreDeposits.doc(depositId);
    const depSnap = await tx.get(depRef);
    if (!depSnap.exists) {
      return { notFound: true };
    }

    const depData = depSnap.data();
    if (depData.status !== 'pending') {
      return { alreadyProcessed: true, status: depData.status };
    }

    const userRef = firestoreUsers.doc(depData.userId);
    const userData = await ensureUserDoc(tx, depData.userId, 'user', null);
    const amount = roundMoney(depData.amount);

    if (decision === 'approve') {
      const nextWalletBalance = roundMoney(Number(userData.walletBalance || 0) + amount);
      tx.update(userRef, {
        walletBalance: nextWalletBalance,
        adBalance: nextWalletBalance,
        updatedAt: nowIso()
      });
      tx.update(depRef, {
        status: 'approved',
        adminNote: reason,
        updatedAt: nowIso()
      });

      const txRecordId = generateId('tx');
      tx.set(
        firestoreTransactions.doc(txRecordId),
        buildTransactionRecord({
          id: txRecordId,
          userId: depData.userId,
          type: 'deposit',
          amount,
          status: 'completed',
          txid: depData.txid,
          note: `تم قبول الإيداع: ${reason}`
        })
      );

      await writeSecurityLog(tx, {
        actorId: 'admin',
        actorRole: 'admin',
        action: 'DEPOSIT_APPROVED',
        targetId: depositId,
        details: { userId: depData.userId, amount, reason },
        ip: req.ip
      });

      return { status: 'approved', reason, walletBalance: nextWalletBalance };
    } else {
      tx.update(depRef, {
        status: 'rejected',
        adminNote: reason,
        updatedAt: nowIso()
      });

      const txRecordId = generateId('tx');
      tx.set(
        firestoreTransactions.doc(txRecordId),
        buildTransactionRecord({
          id: txRecordId,
          userId: depData.userId,
          type: 'deposit',
          amount,
          status: 'rejected',
          txid: depData.txid,
          note: `تم رفض الإيداع: ${reason}`
        })
      );

      await writeSecurityLog(tx, {
        actorId: 'admin',
        actorRole: 'admin',
        action: 'DEPOSIT_REJECTED',
        targetId: depositId,
        details: { userId: depData.userId, amount, reason },
        ip: req.ip
      });

      return { status: 'rejected', reason };
    }
  });

  if (reviewResult.notFound) {
    return res.status(404).json({ ok: false, success: false, error: 'طلب الإيداع غير موجود.' });
  }
  if (reviewResult.alreadyProcessed) {
    return res.status(409).json({ ok: false, success: false, error: 'تمت معالجة طلب الإيداع مسبقاً.' });
  }

  res.json({ ok: true, success: true, ...reviewResult });
}));

app.post('/api/admin/withdrawals/:withdrawalId/review', requireAdmin, asyncHandler(async (req, res) => {
  const withdrawalId = (req.params.withdrawalId || '').toString().trim();
  const decision = (req.body?.decision || '').toString().trim();
  const reason = (req.body?.reason || '').toString().trim();

  if (!withdrawalId || !['processing', 'approve', 'reject'].includes(decision)) {
    return res.status(400).json({ ok: false, success: false, error: 'القرار يجب أن يكون processing أو approve أو reject.' });
  }
  if (!reason) {
    return res.status(400).json({ ok: false, success: false, error: 'سبب تحديث الحالة أو الرفض مطلوب.' });
  }

  const reviewResult = await db.runTransaction(async (tx) => {
    const wdrRef = firestoreWithdrawals.doc(withdrawalId);
    const wdrSnap = await tx.get(wdrRef);
    if (!wdrSnap.exists) {
      return { notFound: true };
    }

    const wdrData = wdrSnap.data();
    if (wdrData.status === 'completed' || wdrData.status === 'rejected') {
      return { alreadyProcessed: true, status: wdrData.status };
    }

    const amount = roundMoney(wdrData.amount);
    const netAmount = roundMoney(wdrData.netAmount || Math.max(0, amount - RULES.WITHDRAWAL_FEE_USD));
    const userRef = firestoreUsers.doc(wdrData.userId);
    const userData = await ensureUserDoc(tx, wdrData.userId, 'user', null);
    const prevSteps = Array.isArray(wdrData.steps) ? wdrData.steps.slice() : [];

    if (decision === 'processing') {
      prevSteps.push({ step: 'processing', label: 'قيد المعالجة / الإرسال', note: reason, at: nowIso() });
      tx.update(wdrRef, {
        status: 'processing',
        adminNote: reason,
        steps: prevSteps,
        updatedAt: nowIso()
      });

      await writeSecurityLog(tx, {
        actorId: 'admin',
        actorRole: 'admin',
        action: 'WITHDRAWAL_PROCESSING',
        targetId: withdrawalId,
        details: { userId: wdrData.userId, amount, netAmount, reason },
        ip: req.ip
      });

      return { status: 'processing', reason };
    }

    if (decision === 'approve') {
      if (wdrData.status !== 'processing') {
        prevSteps.push({ step: 'processing', label: 'قيد المعالجة / الإرسال', at: nowIso() });
      }
      prevSteps.push({ step: 'completed', label: 'مكتمل', note: reason, at: nowIso() });

      tx.update(wdrRef, {
        status: 'completed',
        adminNote: reason,
        steps: prevSteps,
        updatedAt: nowIso()
      });

      const txRecordId = generateId('tx');
      tx.set(
        firestoreTransactions.doc(txRecordId),
        buildTransactionRecord({
          id: txRecordId,
          userId: wdrData.userId,
          type: 'withdrawal',
          amount: netAmount,
          status: 'completed',
          note: `تم إرسال السحب (صافي ${netAmount.toFixed(2)}$): ${reason}`
        })
      );

      await writeSecurityLog(tx, {
        actorId: 'admin',
        actorRole: 'admin',
        action: 'WITHDRAWAL_COMPLETED',
        targetId: withdrawalId,
        details: { userId: wdrData.userId, amount, netAmount, reason },
        ip: req.ip
      });

      return { status: 'completed', reason };
    }

    prevSteps.push({ step: 'rejected', label: 'مرفوض', note: reason, at: nowIso() });
    const refundedAvailable = roundMoney(Number(userData.availableEarnings || 0) + amount);

    tx.update(userRef, {
      availableEarnings: refundedAvailable,
      balance: refundedAvailable,
      updatedAt: nowIso()
    });
    tx.update(wdrRef, {
      status: 'rejected',
      adminNote: reason,
      steps: prevSteps,
      updatedAt: nowIso()
    });

    const txRecordId = generateId('tx');
    tx.set(
      firestoreTransactions.doc(txRecordId),
      buildTransactionRecord({
        id: txRecordId,
        userId: wdrData.userId,
        type: 'withdrawal',
        amount,
        status: 'rejected',
        note: `تم رفض السحب وإعادة ${amount.toFixed(2)}$ للرصيد المتاح: ${reason}`
      })
    );

    await writeSecurityLog(tx, {
      actorId: 'admin',
      actorRole: 'admin',
      action: 'WITHDRAWAL_REJECTED_REFUNDED',
      targetId: withdrawalId,
      details: { userId: wdrData.userId, amount, reason },
      ip: req.ip
    });

    return { status: 'rejected', reason, availableEarnings: refundedAvailable };
  });

  if (reviewResult.notFound) {
    return res.status(404).json({ ok: false, success: false, error: 'طلب السحب غير موجود.' });
  }
  if (reviewResult.alreadyProcessed) {
    return res.status(409).json({ ok: false, success: false, error: 'تمت معالجة طلب السحب نهائياً مسبقاً.' });
  }

  res.json({ ok: true, success: true, ...reviewResult });
}));

app.post('/api/admin/wallet/adjust', requireAdmin, asyncHandler(async (req, res) => {
  const targetUserId = (req.body?.targetUserId || '').toString().trim();
  const mode = (req.body?.mode || '').toString().trim();
  const balanceBucket = (req.body?.balanceBucket || 'walletBalance').toString().trim();
  const amount = roundMoney(req.body?.amount);
  const reason = (req.body?.reason || '').toString().trim();

  if (!targetUserId) {
    return res.status(400).json({ ok: false, success: false, error: 'معرف المستخدم المستهدف مطلوب.' });
  }
  if (mode !== 'add' && mode !== 'deduct') {
    return res.status(400).json({ ok: false, success: false, error: 'نوع التعديل يجب أن يكون add أو deduct.' });
  }
  if (balanceBucket !== 'walletBalance' && balanceBucket !== 'availableEarnings') {
    return res.status(400).json({ ok: false, success: false, error: 'نوع الرصيد غير صالح.' });
  }
  if (amount <= 0) {
    return res.status(400).json({ ok: false, success: false, error: 'المبلغ يجب أن يكون أكبر من صفر.' });
  }
  if (!reason) {
    return res.status(400).json({ ok: false, success: false, error: 'سبب التعديل اليدوي مطلوب.' });
  }

  const adjResult = await db.runTransaction(async (tx) => {
    const userRef = firestoreUsers.doc(targetUserId);
    const userData = await ensureUserDoc(tx, targetUserId, 'user', null);
    const currentVal = roundMoney(userData[balanceBucket] || 0);

    if (mode === 'deduct' && currentVal < amount) {
      return { insufficient: true, currentVal };
    }

    const nextVal = mode === 'add' ? roundMoney(currentVal + amount) : roundMoney(currentVal - amount);
    const legacySyncField = balanceBucket === 'walletBalance' ? 'adBalance' : 'balance';
    tx.update(userRef, {
      [balanceBucket]: nextVal,
      [legacySyncField]: nextVal,
      updatedAt: nowIso()
    });

    const txRecordId = generateId('tx');
    tx.set(
      firestoreTransactions.doc(txRecordId),
      buildTransactionRecord({
        id: txRecordId,
        userId: targetUserId,
        type: 'manual_adjustment',
        amount,
        status: 'completed',
        note: `${mode === 'add' ? 'إضافة يدوية' : 'خصم يدوي'} (${balanceBucket}): ${reason}`
      })
    );

    await writeSecurityLog(tx, {
      actorId: 'admin',
      actorRole: 'admin',
      action: mode === 'add' ? 'ADMIN_MANUAL_CREDIT' : 'ADMIN_MANUAL_DEBIT',
      targetId: targetUserId,
      details: { balanceBucket, amount, reason, before: currentVal, after: nextVal },
      ip: req.ip
    });

    return {
      userId: targetUserId,
      balanceBucket,
      newBalance: nextVal
    };
  });

  if (adjResult.insufficient) {
    return res.status(400).json({
      ok: false,
      success: false,
      error: `الرصيد غير كافٍ للخصم. الرصيد الحالي: ${adjResult.currentVal.toFixed(2)}$.`
    });
  }

  res.json({ ok: true, success: true, ...adjResult });
}));

app.post('/api/admin/tickets/:ticketId/reply', requireAdmin, asyncHandler(async (req, res) => {
  const ticketId = (req.params.ticketId || '').toString().trim();
  const replyText = (req.body?.reply || '').toString().trim();
  const closeTicket = Boolean(req.body?.close);

  if (!ticketId || !replyText) {
    return res.status(400).json({ ok: false, success: false, error: 'معرف التذكرة ونص الرد مطلوبان.' });
  }

  const updated = await db.runTransaction(async (tx) => {
    const tktRef = firestoreTickets.doc(ticketId);
    const snap = await tx.get(tktRef);
    if (!snap.exists) return null;

    const data = snap.data();
    const msgs = Array.isArray(data.messages) ? data.messages.slice() : [];
    msgs.push({
      sender: 'admin',
      senderId: 'admin',
      text: replyText,
      createdAt: nowIso()
    });

    const nextStatus = closeTicket ? 'closed' : 'answered';
    tx.update(tktRef, {
      status: nextStatus,
      messages: msgs,
      updatedAt: nowIso()
    });

    await writeSecurityLog(tx, {
      actorId: 'admin',
      actorRole: 'admin',
      action: 'SUPPORT_TICKET_REPLIED',
      targetId: ticketId,
      details: { status: nextStatus },
      ip: req.ip
    });

    return Object.assign({}, data, { status: nextStatus, messages: msgs, updatedAt: nowIso() });
  });

  if (!updated) {
    return res.status(404).json({ ok: false, success: false, error: 'التذكرة غير موجودة.' });
  }

  res.json({ ok: true, success: true, ticket: updated });
}));

app.post('/api/admin/broadcasts', requireAdmin, asyncHandler(async (req, res) => {
  const title = (req.body?.title || '').toString().trim();
  const body = (req.body?.body || '').toString().trim();

  if (!title || !body) {
    return res.status(400).json({ ok: false, success: false, error: 'عنوان الرسالة الجماعية ونصها مطلوبان.' });
  }

  const broadcastId = generateId('bcast');
  const record = {
    id: broadcastId,
    title,
    body,
    createdBy: 'admin',
    createdAt: nowIso()
  };

  await db.runTransaction(async (tx) => {
    tx.set(firestoreBroadcasts.doc(broadcastId), record);
    await writeSecurityLog(tx, {
      actorId: 'admin',
      actorRole: 'admin',
      action: 'BROADCAST_SENT',
      targetId: broadcastId,
      details: { title },
      ip: req.ip
    });
  });

  res.status(201).json({ ok: true, success: true, broadcast: record });
}));

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

  await channelRef.update({ status: action, approvalStatus: action, updatedAt: new Date() });
  const updatedSnap = await channelRef.get();
  const channel = serializeDoc(updatedSnap);

  await logSecurityEvent(req.user.telegramId, `ADMIN_CHANNEL_${action.toUpperCase()}`, channel._id, `Channel @${channel.channelUsername || channel.username} ${action}`, req);
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
      const nextAdv = roundMoney(Number(freshUserData.adBalance ?? freshUserData.walletBalance ?? 0) + txAmount);
      t.update(targetUserDoc.ref, {
        adBalance: nextAdv,
        walletBalance: nextAdv
      });
    } else if (freshTxData.type === 'withdrawal' && action === 'rejected') {
      const nextBal = roundMoney(Number(freshUserData.balance ?? freshUserData.availableEarnings ?? 0) + Math.abs(txAmount));
      t.update(targetUserDoc.ref, {
        balance: nextBal,
        availableEarnings: nextBal
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
      const rate = RULES.REFERRAL_COMMISSION_RATE;
      bonus = roundMoney(Number(campaignData.budget || 0) * rate);
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
    t.update(campaignRef, { status: 'completed', settled: true, updatedAt: now });

    if (ownerDoc) {
      const freshOwnerSnap = await t.get(ownerDoc.ref);
      const freshOwnerData = freshOwnerSnap.data() || {};
      const nextOwnerBal = roundMoney(Number(freshOwnerData.balance ?? freshOwnerData.availableEarnings ?? 0) + budget);
      t.update(ownerDoc.ref, {
        balance: nextOwnerBal,
        availableEarnings: nextOwnerBal
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
        const nextRefBal = roundMoney(Number(freshRefData.balance ?? freshRefData.availableEarnings ?? 0) + bonus);
        const nextRefEarn = roundMoney(Number(freshRefData.referralEarnings ?? freshRefData.referralEarningsTotal ?? 0) + bonus);
        t.update(referrerDoc.ref, {
          balance: nextRefBal,
          availableEarnings: nextRefBal,
          referralEarnings: nextRefEarn,
          referralEarningsTotal: nextRefEarn
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
  writeSecurityLog(db, {
    actorId: extractUserId(req) || 'unknown',
    actorRole: isAdminRequest(req) ? 'admin' : 'user',
    action: 'UNHANDLED_SERVER_ERROR',
    targetId: req.originalUrl,
    details: { message: err.message || 'Unknown error' },
    ip: req.ip
  }).catch(() => {});

  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    ok: false,
    success: false,
    error: err.message || 'حدث خطأ داخلي في الخادم.',
    message: err.message || 'Internal Server Error'
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

if (!process.env.VERCEL && require.main === module) {
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
