require('dotenv').config();
const crypto = require('crypto');
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const Models = require('./models');

const app = express();
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN || '';
const MAX_AUTH_AGE_SECONDS = Number(process.env.TG_AUTH_MAX_AGE_SECONDS || 86400);

function getAdminIds() {
  const raw = process.env.ADMIN_IDS || '';
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

function isAdminUser(userId) {
  if (!userId) return false;
  return getAdminIds().has(String(userId));
}

function verifyTelegramInitData(initDataRaw, botToken) {
  if (!initDataRaw || typeof initDataRaw !== 'string' || !botToken) {
    return { valid: false, reason: 'Missing initData or BOT_TOKEN' };
  }

  const params = new URLSearchParams(initDataRaw);
  const hash = params.get('hash');
  if (!hash) {
    return { valid: false, reason: 'Missing hash in initData' };
  }

  const authDate = Number(params.get('auth_date') || 0);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (!authDate || nowSeconds - authDate > MAX_AUTH_AGE_SECONDS) {
    return { valid: false, reason: 'initData expired or invalid auth_date' };
  }

  params.delete('hash');
  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();

  const calculatedHash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  const hashBuf = Buffer.from(hash, 'utf8');
  const calcBuf = Buffer.from(calculatedHash, 'utf8');

  if (hashBuf.length !== calcBuf.length || !crypto.timingSafeEqual(hashBuf, calcBuf)) {
    return { valid: false, reason: 'Invalid initData signature' };
  }

  const rawUser = params.get('user');
  if (!rawUser) {
    return { valid: false, reason: 'Missing user payload in initData' };
  }

  let user;
  try {
    user = JSON.parse(rawUser);
  } catch (_) {
    return { valid: false, reason: 'Malformed user JSON in initData' };
  }

  if (!user || !user.id) {
    return { valid: false, reason: 'Invalid user id' };
  }

  return { valid: true, user };
}

function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function requireTelegramAuth(req, res, next) {
  const initData =
    req.header('x-telegram-init-data') ||
    (req.body && req.body.initData) ||
    '';

  const verification = verifyTelegramInitData(initData, BOT_TOKEN);
  if (!verification.valid) {
    return res.status(401).json({
      ok: false,
      error: 'Unauthorized Telegram session',
      details: process.env.NODE_ENV === 'development' ? verification.reason : undefined
    });
  }

  req.tgUser = verification.user;
  req.isAdmin = isAdminUser(verification.user.id);
  return next();
}

async function requireAdminMiddleware(req, res, next) {
  if (!req.tgUser || !req.isAdmin) {
    await Models.writeAuditLog(
      req.tgUser ? req.tgUser.id : 'anonymous',
      'UNAUTHORIZED_ADMIN_ATTEMPT',
      { path: req.originalUrl, method: req.method }
    ).catch(() => {});

    return res.status(403).json({
      ok: false,
      error: 'Forbidden: Admin access required'
    });
  }
  return next();
}

app.use(
  helmet({
    contentSecurityPolicy: false
  })
);
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, status: 'ok', service: 'telega-ads', timestamp: new Date().toISOString() });
});

// بيانات الحساب، اللغة، التذاكر الخاصة بالمستخدم، والبث الإداري
app.get(
  '/api/account',
  requireTelegramAuth,
  asyncHandler(async (req, res) => {
    const profile = await Models.upsertUserProfile(req.tgUser, req.query.lang);
    if (profile.isBanned) {
      return res.status(403).json({ ok: false, error: 'Account suspended' });
    }

    const [tickets, broadcasts] = await Promise.all([
      Models.listUserTickets(req.tgUser.id),
      Models.listRecentBroadcasts(20)
    ]);

    res.json({
      ok: true,
      section: 'account',
      user: {
        id: req.tgUser.id,
        first_name: req.tgUser.first_name,
        last_name: req.tgUser.last_name || '',
        username: req.tgUser.username || null,
        photo_url: req.tgUser.photo_url || null,
        language_code: req.tgUser.language_code || 'en',
        selectedLanguage: profile.language
      },
      isAdmin: req.isAdmin,
      tickets,
      broadcasts
    });
  })
);

// تحديث لغة المستخدم يدوياً أو تلقائياً
app.post(
  '/api/account/language',
  requireTelegramAuth,
  asyncHandler(async (req, res) => {
    const { language } = req.body || {};
    const savedLang = await Models.updateUserLanguage(req.tgUser.id, language);
    res.json({ ok: true, language: savedLang });
  })
);

// إنشاء تذكرة دعم فني جديدة
app.post(
  '/api/tickets',
  requireTelegramAuth,
  asyncHandler(async (req, res) => {
    const { subject, message } = req.body || {};
    const ticket = await Models.createTicket(req.tgUser.id, req.tgUser, { subject, message });
    res.status(201).json({ ok: true, ticket });
  })
);

// جلب تذاكر المستخدم الحالي
app.get(
  '/api/tickets',
  requireTelegramAuth,
  asyncHandler(async (req, res) => {
    const tickets = await Models.listUserTickets(req.tgUser.id);
    res.json({ ok: true, tickets });
  })
);

// --- مسارات الإدارة المحمية (للمشرفين فقط) ---
app.get(
  '/api/admin/overview',
  requireTelegramAuth,
  requireAdminMiddleware,
  asyncHandler(async (req, res) => {
    const [tickets, broadcasts] = await Promise.all([
      Models.listAllTickets(),
      Models.listRecentBroadcasts(30)
    ]);

    res.json({
      ok: true,
      adminId: req.tgUser.id,
      tickets,
      broadcasts
    });
  })
);

app.post(
  '/api/admin/tickets/:ticketId/reply',
  requireTelegramAuth,
  requireAdminMiddleware,
  asyncHandler(async (req, res) => {
    const { reply } = req.body || {};
    const updated = await Models.replyToTicket(req.params.ticketId, req.tgUser.id, reply);
    await Models.writeAuditLog(req.tgUser.id, 'ADMIN_TICKET_REPLY', {
      ticketId: req.params.ticketId
    });
    res.json({ ok: true, ticket: updated });
  })
);

app.post(
  '/api/admin/broadcasts',
  requireTelegramAuth,
  requireAdminMiddleware,
  asyncHandler(async (req, res) => {
    const { title, message, targetLang } = req.body || {};
    const broadcast = await Models.createBroadcast(req.tgUser.id, {
      title,
      message,
      targetLang
    });
    await Models.writeAuditLog(req.tgUser.id, 'ADMIN_BROADCAST_SENT', {
      broadcastId: broadcast.id,
      targetLang: broadcast.targetLang
    });
    res.status(201).json({ ok: true, broadcast });
  })
);

// إعادة توجيه أي مسار غير API لواجهة التطبيق المصغر
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, req, res, next) => {
  console.error('Server error:', err);
  const status = err.statusCode || 500;
  res.status(status).json({
    ok: false,
    error: err.message || 'Internal Server Error'
  });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Telega.ads server running on port ${PORT}`);
  });
}

module.exports = app;
