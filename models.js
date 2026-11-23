const admin = require('firebase-admin');
const mongoose = require('mongoose');

// ============================================================================
// 1. Firebase Admin & Firestore Setup
// ============================================================================

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

const firestoreCollections = {
  users: db.collection('users'),
  channels: db.collection('channels'),
  campaigns: db.collection('campaigns'),
  transactions: db.collection('transactions'),
  securityLogs: db.collection('securityLogs')
};

// ============================================================================
// 2. Mongoose Constants & Schemas
// ============================================================================

const ALLOWED_LANGUAGES = [
  'English',
  'Chinese',
  'Hindi',
  'Spanish',
  'Arabic',
  'French',
  'Bengali',
  'Portuguese',
  'Indonesian',
  'Urdu',
  'Russian',
  'German',
  'Japanese',
  'Nigerian Pidgin',
  'Marathi',
  'Vietnamese',
  'Telugu',
  'Swahili',
  'Turkish'
];

const ALLOWED_CATEGORIES = [
  'entertainment',
  'news_media',
  'movies_series',
  'fashion_beauty',
  'gaming',
  'art_photography',
  'crypto',
  'technology',
  'education',
  'cooking',
  'health',
  'sports',
  'other'
];

const channelSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    username: {
      type: String,
      required: true,
      trim: true
    },
    photoUrl: {
      type: String,
      default: ''
    },
    chatId: {
      type: String,
      default: ''
    },
    isPublic: {
      type: Boolean,
      default: true
    },
    subscribersCount: {
      type: Number,
      default: 0
    },
    pricePer1000Views: {
      type: Number,
      default: 1,
      min: 1,
      max: 3
    },
    isFavorite: {
      type: Boolean,
      default: false
    },
    ownerTelegramId: {
      type: String,
      default: ''
    },
    ownerUsername: {
      type: String,
      default: ''
    },
    ownerName: {
      type: String,
      default: ''
    },
    approvalStatus: {
      type: String,
      enum: ['pending_review', 'approved', 'rejected'],
      default: 'pending_review'
    },
    introPostSent: {
      type: Boolean,
      default: false
    },
    referralCode: {
      type: String,
      default: ''
    },
    referralsCount: {
      type: Number,
      default: 0
    },
    lastSyncedAt: {
      type: Date,
      default: Date.now
    },
    language: {
      type: String,
      required: true,
      enum: ALLOWED_LANGUAGES
    },
    category: {
      type: String,
      required: true,
      enum: ALLOWED_CATEGORIES
    },
    price: {
      type: Number,
      required: true,
      min: 1,
      max: 3
    },
    botAdded: {
      type: Boolean,
      default: false
    },
    botPermissionsOk: {
      type: Boolean,
      default: false
    },
    lastPermissionCheckAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

const referralSchema = new mongoose.Schema(
  {
    publisherTelegramId: {
      type: String,
      required: true,
      trim: true
    },
    channelId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Channel',
      default: null
    },
    referredTelegramId: {
      type: String,
      required: true,
      trim: true
    },
    referredUsername: {
      type: String,
      default: ''
    },
    sourceRole: {
      type: String,
      enum: ['publisher', 'advertiser', 'user'],
      default: 'user'
    },
    commissionEligible: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true
  }
);

const campaignSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true
    },
    adText: {
      type: String,
      default: '',
      trim: true
    },
    mediaType: {
      type: String,
      enum: ['none', 'photo', 'video'],
      default: 'none'
    },
    mediaData: {
      type: String,
      default: ''
    },
    mediaName: {
      type: String,
      default: ''
    },
    targetUrl: {
      type: String,
      default: '',
      trim: true
    },
    buttonPreset: {
      type: String,
      enum: ['Open', 'View Offer', 'Join Channel', 'Custom'],
      default: 'Open'
    },
    customButtonText: {
      type: String,
      default: '',
      trim: true
    },
    budget: {
      type: Number,
      default: 50,
      min: 0
    },
    spentAmount: {
      type: Number,
      default: 0,
      min: 0
    },
    totalViews: {
      type: Number,
      default: 0,
      min: 0
    },
    openTargeting: {
      type: Boolean,
      default: false
    },
    targetLanguage: {
      type: String,
      required: true,
      enum: ALLOWED_LANGUAGES
    },
    targetCategory: {
      type: String,
      required: true,
      enum: ALLOWED_CATEGORIES
    },
    maxPricePerPost: {
      type: Number,
      required: true,
      min: 1,
      max: 3
    },
    scheduleMode: {
      type: String,
      enum: ['immediate', 'peak'],
      default: 'immediate'
    },
    scheduledAt: {
      type: Date,
      default: null
    },
    selectedChannelIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Channel'
      }
    ],
    publishedChannels: [
      {
        channelId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Channel'
        },
        channelName: String,
        messageId: Number,
        views: {
          type: Number,
          default: 0
        },
        earnings: {
          type: Number,
          default: 0
        },
        publisherRefCode: String,
        renderedAdText: String,
        lockedContent: Boolean,
        noForwarding: Boolean,
        publishedAt: Date
      }
    ],
    status: {
      type: String,
      enum: ['draft', 'scheduled', 'active', 'paused', 'completed'],
      default: 'draft'
    }
  },
  {
    timestamps: true
  }
);

const walletSchema = new mongoose.Schema(
  {
    ownerKey: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    advertiserBalance: {
      type: Number,
      default: 0,
      min: 0
    },
    publisherBalance: {
      type: Number,
      default: 0,
      min: 0
    }
  },
  {
    timestamps: true
  }
);

const transactionSchema = new mongoose.Schema(
  {
    idempotencyKey: {
      type: String,
      unique: true,
      sparse: true,
      trim: true
    },
    walletRole: {
      type: String,
      enum: ['advertiser', 'publisher'],
      required: true
    },
    type: {
      type: String,
      enum: ['deposit', 'withdraw', 'ad_spend', 'ad_earning', 'budget_topup'],
      required: true
    },
    amount: {
      type: Number,
      required: true
    },
    campaignId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Campaign',
      default: null
    },
    channelId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Channel',
      default: null
    },
    note: {
      type: String,
      default: ''
    }
  },
  {
    timestamps: true
  }
);

const publishLogSchema = new mongoose.Schema(
  {
    dedupKey: {
      type: String,
      unique: true,
      required: true,
      trim: true
    },
    campaignId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Campaign',
      required: true
    },
    campaignTitle: {
      type: String,
      default: ''
    },
    channelId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Channel',
      required: true
    },
    channelName: {
      type: String,
      default: ''
    },
    messageId: {
      type: Number,
      default: null
    },
    status: {
      type: String,
      enum: ['published', 'duplicate_prevented', 'failed'],
      default: 'published'
    },
    details: {
      type: String,
      default: ''
    },
    publishedAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

const notificationSchema = new mongoose.Schema(
  {
    audience: {
      type: String,
      enum: ['advertiser', 'publisher', 'admin'],
      default: 'admin'
    },
    category: {
      type: String,
      enum: ['channel', 'campaign', 'wallet', 'system'],
      default: 'system'
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    message: {
      type: String,
      required: true,
      trim: true
    },
    isRead: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true
  }
);

const backupRecordSchema = new mongoose.Schema(
  {
    filename: {
      type: String,
      required: true,
      trim: true
    },
    collectionsCount: {
      type: Number,
      default: 0
    },
    totalRecords: {
      type: Number,
      default: 0
    },
    status: {
      type: String,
      enum: ['completed', 'failed'],
      default: 'completed'
    },
    note: {
      type: String,
      default: ''
    },
    snapshotData: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: true
  }
);

// ============================================================================
// 3. Mongoose Models & Optional Connection Helper
// ============================================================================

const Channel = mongoose.models.Channel || mongoose.model('Channel', channelSchema);
const Referral = mongoose.models.Referral || mongoose.model('Referral', referralSchema);
const Campaign = mongoose.models.Campaign || mongoose.model('Campaign', campaignSchema);
const Wallet = mongoose.models.Wallet || mongoose.model('Wallet', walletSchema);
const Transaction = mongoose.models.Transaction || mongoose.model('Transaction', transactionSchema);
const PublishLog = mongoose.models.PublishLog || mongoose.model('PublishLog', publishLogSchema);
const Notification = mongoose.models.Notification || mongoose.model('Notification', notificationSchema);
const BackupRecord = mongoose.models.BackupRecord || mongoose.model('BackupRecord', backupRecordSchema);

async function connectMongo(uri = process.env.MONGODB_URI || process.env.MONGO_URI) {
  if (!uri) {
    throw new Error('Missing MongoDB connection string: MONGODB_URI or MONGO_URI is required.');
  }
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }
  await mongoose.connect(uri);
  return mongoose.connection;
}

if (process.env.MONGODB_URI || process.env.MONGO_URI) {
  connectMongo().catch((err) => {
    console.error('MongoDB connection error:', err.message);
  });
}

// ============================================================================
// 4. Unified Exports
// ============================================================================

module.exports = {
  // Firebase Admin & Firestore
  admin,
  db,
  formatPrivateKey,
  initFirebaseAdmin,
  users: firestoreCollections.users,
  channels: firestoreCollections.channels,
  campaigns: firestoreCollections.campaigns,
  transactions: firestoreCollections.transactions,
  securityLogs: firestoreCollections.securityLogs,
  collections: firestoreCollections,

  // Mongoose & Models
  mongoose,
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
};
