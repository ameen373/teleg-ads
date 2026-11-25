const admin = require('firebase-admin');

function initFirebaseAdmin() {
  if (admin.apps.length > 0) {
    return admin.firestore();
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (projectId && clientEmail && rawPrivateKey) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey: rawPrivateKey.replace(/\\n/g, '\n')
      })
    });
  } else {
    admin.initializeApp();
  }

  return admin.firestore();
}

const db = initFirebaseAdmin();

const COLLECTIONS = {
  USERS: 'users',
  TICKETS: 'tickets',
  BROADCASTS: 'broadcasts',
  AUDIT_LOGS: 'audit_logs'
};

function sanitizeText(value, maxLen = 1000) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLen);
}

function normalizeLanguage(langCode) {
  if (!langCode || typeof langCode !== 'string') return 'en';
  const clean = langCode.trim().toLowerCase().split(/[-_]/)[0];
  return ['ar', 'en'].includes(clean) ? clean : 'en';
}

const Models = {
  User: {},
  Channel: {},
  Campaign: {},
  Wallet: {},
  Referral: {},

  db,
  COLLECTIONS,

  async upsertUserProfile(tgUser, detectedLang) {
    try {
      const userId = String(tgUser.id);
      const userRef = db.collection(COLLECTIONS.USERS).doc(userId);
      const snap = await userRef.get();

      const fullName = [tgUser.first_name, tgUser.last_name]
        .filter(Boolean)
        .join(' ')
        .trim();

      const baseData = {
        telegramId: Number(tgUser.id),
        firstName: sanitizeText(tgUser.first_name || '', 120),
        lastName: sanitizeText(tgUser.last_name || '', 120),
        fullName: sanitizeText(fullName, 200),
        username: tgUser.username ? sanitizeText(tgUser.username, 100) : null,
        photoUrl: tgUser.photo_url ? sanitizeText(tgUser.photo_url, 500) : null,
        telegramLang: sanitizeText(tgUser.language_code || '', 20),
        lastSeenAt: admin.firestore.FieldValue.serverTimestamp()
      };

      if (!snap.exists) {
        const newDoc = {
          ...baseData,
          language: normalizeLanguage(detectedLang || tgUser.language_code),
          isBanned: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        };
        await userRef.set(newDoc);
        return { id: userId, ...newDoc };
      }

      const existing = snap.data() || {};
      const updatePayload = {
        ...baseData,
        language: existing.language || normalizeLanguage(detectedLang || tgUser.language_code)
      };

      await userRef.set(updatePayload, { merge: true });
      return { id: userId, ...existing, ...updatePayload };
    } catch (err) {
      console.error('Models.upsertUserProfile error:', err);
      throw err;
    }
  },

  async updateUserLanguage(userId, langCode) {
    try {
      const cleanId = String(userId);
      const normalized = normalizeLanguage(langCode);
      const userRef = db.collection(COLLECTIONS.USERS).doc(cleanId);

      await userRef.set(
        {
          language: normalized,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
      );

      return normalized;
    } catch (err) {
      console.error('Models.updateUserLanguage error:', err);
      throw err;
    }
  },

  async createTicket(userId, tgUser, payload) {
    try {
      const subject = sanitizeText(payload.subject, 160);
      const message = sanitizeText(payload.message, 2500);

      if (!subject || !message) {
        const err = new Error('Subject and message are required');
        err.statusCode = 400;
        throw err;
      }

      const docData = {
        userId: String(userId),
        username: tgUser && tgUser.username ? sanitizeText(tgUser.username, 100) : null,
        fullName: tgUser
          ? sanitizeText([tgUser.first_name, tgUser.last_name].filter(Boolean).join(' '), 200)
          : String(userId),
        subject,
        message,
        status: 'open',
        reply: null,
        repliedBy: null,
        repliedAt: null,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      };

      const ref = await db.collection(COLLECTIONS.TICKETS).add(docData);
      return { id: ref.id, ...docData };
    } catch (err) {
      console.error('Models.createTicket error:', err);
      throw err;
    }
  },

  async listUserTickets(userId) {
    try {
      const snap = await db
        .collection(COLLECTIONS.TICKETS)
        .where('userId', '==', String(userId))
        .orderBy('createdAt', 'desc')
        .limit(50)
        .get();

      return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    } catch (err) {
      console.error('Models.listUserTickets error:', err);
      throw err;
    }
  },

  async listAllTickets() {
    try {
      const snap = await db
        .collection(COLLECTIONS.TICKETS)
        .orderBy('createdAt', 'desc')
        .limit(200)
        .get();

      return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    } catch (err) {
      console.error('Models.listAllTickets error:', err);
      throw err;
    }
  },

  async replyToTicket(ticketId, adminId, replyText) {
    try {
      const cleanReply = sanitizeText(replyText, 2500);
      if (!cleanReply) {
        const err = new Error('Reply text is required');
        err.statusCode = 400;
        throw err;
      }

      const ticketRef = db.collection(COLLECTIONS.TICKETS).doc(String(ticketId));
      const snap = await ticketRef.get();
      if (!snap.exists) {
        const err = new Error('Ticket not found');
        err.statusCode = 404;
        throw err;
      }

      const updateData = {
        reply: cleanReply,
        status: 'answered',
        repliedBy: String(adminId),
        repliedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      await ticketRef.set(updateData, { merge: true });
      return { id: snap.id, ...snap.data(), ...updateData };
    } catch (err) {
      console.error('Models.replyToTicket error:', err);
      throw err;
    }
  },

  async createBroadcast(adminId, payload) {
    try {
      const title = sanitizeText(payload.title, 160);
      const message = sanitizeText(payload.message, 2500);
      const targetLang = payload.targetLang ? normalizeLanguage(payload.targetLang) : 'all';

      if (!title || !message) {
        const err = new Error('Title and message are required');
        err.statusCode = 400;
        throw err;
      }

      const docData = {
        title,
        message,
        targetLang,
        createdBy: String(adminId),
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      };

      const ref = await db.collection(COLLECTIONS.BROADCASTS).add(docData);
      return { id: ref.id, ...docData };
    } catch (err) {
      console.error('Models.createBroadcast error:', err);
      throw err;
    }
  },

  async listRecentBroadcasts(limit = 30) {
    try {
      const snap = await db
        .collection(COLLECTIONS.BROADCASTS)
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .get();

      return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    } catch (err) {
      console.error('Models.listRecentBroadcasts error:', err);
      throw err;
    }
  },

  async writeAuditLog(actorId, action, details = {}) {
    try {
      await db.collection(COLLECTIONS.AUDIT_LOGS).add({
        actorId: String(actorId),
        action: sanitizeText(action, 120),
        details,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
    } catch (err) {
      console.error('Models.writeAuditLog error:', err);
      throw err;
    }
  }
};

module.exports = Models;
