const admin = require('firebase-admin');

function formatPrivateKey(rawKey) {
  if (!rawKey) return '';
  let key = String(rawKey).trim();
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1);
  }
  return key.replace(/\\n/g, '\n');
}

function initFirebaseAdmin() {
  if (admin.apps.length > 0) {
    return admin.app();
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = formatPrivateKey(process.env.FIREBASE_PRIVATE_KEY);

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      'Missing Firebase Admin credentials: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY are required.'
    );
  }

  return admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey
    })
  });
}

initFirebaseAdmin();

const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

const collections = {
  users: db.collection('users'),
  channels: db.collection('channels'),
  campaigns: db.collection('campaigns'),
  transactions: db.collection('transactions'),
  securityLogs: db.collection('securityLogs')
};

module.exports = {
  admin,
  db,
  users: collections.users,
  channels: collections.channels,
  campaigns: collections.campaigns,
  transactions: collections.transactions,
  securityLogs: collections.securityLogs,
  collections
};
