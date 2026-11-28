import admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

if (!admin.apps.length) {
  const privateKey = process.env.FIREBASE_PRIVATE_KEY
    ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    : undefined;

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey
    }),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET
  });
}

export const db = admin.firestore();
export const bucket = admin.storage().bucket();
export const FieldValue = admin.firestore.FieldValue;

// مراجع مجموعات قاعدة البيانات
export const Collections = {
  USERS: db.collection('users'),
  CHANNELS: db.collection('channels'),
  CAMPAIGNS: db.collection('campaigns'),
  DRAFTS: db.collection('campaign_drafts'),
  POST_LOGS: db.collection('post_logs'),
  TRANSACTIONS: db.collection('transactions'),
  NOTIFICATIONS: db.collection('notifications'),
  SYSTEM_HEALTH: db.collection('system_health'),
  BACKUPS: db.collection('database_backups')
};

// الثوابت والقواعد المعتمدة في النظام
export const CONFIG = {
  BOT_USERNAME: 'adTelega_bot',
  BOT_LINK: 'https://t.me/adTelega_bot',
  MIN_CPM_PRICE: 1.0,
  MAX_CPM_PRICE: 3.0,
  AUTO_APPROVE_SUBSCRIBERS: 1000,
  OPEN_TARGETING_MIN_BUDGET: 1000.0,
  REFERRAL_COMMISSION_RATE: 0.10, // 10% من أرباح الناشر فقط (0% من المعلنين)
  MIN_DEPOSIT: 10.0,
  MIN_WITHDRAWAL: 30.0,
  WITHDRAWAL_FEE: 3.0
};

// اللغات الـ 19 المعتمدة
export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: '🇬🇧 English' },
  { code: 'zh', label: '🇨🇳 Chinese' },
  { code: 'hi', label: '🇮🇳 Hindi' },
  { code: 'es', label: '🇪🇸 Spanish' },
  { code: 'ar', label: '🇸🇦 Arabic' },
  { code: 'fr', label: '🇫🇷 French' },
  { code: 'bn', label: '🇧🇩 Bengali' },
  { code: 'pt', label: '🇵🇹 Portuguese' },
  { code: 'id', label: '🇮🇩 Indonesian' },
  { code: 'ur', label: '🇵🇰 Urdu' },
  { code: 'ru', label: '🇷🇺 Russian' },
  { code: 'de', label: '🇩🇪 German' },
  { code: 'ja', label: '🇯🇵 Japanese' },
  { code: 'pcm', label: '🇳🇬 Nigerian Pidgin' },
  { code: 'mr', label: '🇮🇳 Marathi' },
  { code: 'vi', label: '🇻🇳 Vietnamese' },
  { code: 'te', label: '🇮🇳 Telugu' },
  { code: 'sw', label: '🇰🇪 Swahili' },
  { code: 'tr', label: '🇹🇷 Turkish' }
];

// التصنيفات الـ 13 المعتمدة
export const CHANNEL_CATEGORIES = [
  { id: 'entertainment', ar: '🎬 الترفيه', en: '🎬 Entertainment' },
  { id: 'news', ar: '📰 الأخبار ووسائل الإعلام', en: '📰 News & Media' },
  { id: 'movies', ar: '🍿 الأفلام والمسلسلات', en: '🍿 Movies & Series' },
  { id: 'fashion', ar: '💄 الموضة والجمال', en: '💄 Fashion & Beauty' },
  { id: 'gaming', ar: '🎮 الألعاب', en: '🎮 Gaming' },
  { id: 'art', ar: '🎨 الفن والتصوير', en: '🎨 Art & Photography' },
  { id: 'crypto', ar: '🪙 العملات المشفرة', en: '🪙 Cryptocurrency' },
  { id: 'tech', ar: '💻 التقنيات', en: '💻 Technology' },
  { id: 'education', ar: '📚 التعليم', en: '📚 Education' },
  { id: 'cooking', ar: '🍳 الطبخ', en: '🍳 Cooking' },
  { id: 'health', ar: '🩺 الصحة', en: '🩺 Health' },
  { id: 'sports', ar: '⚽ الرياضة', en: '⚽ Sports' },
  { id: 'other', ar: '🌐 أخرى', en: '🌐 Other' }
];

// نموذج بيانات المستخدم (محفظة الناشر + محفظة المعلن + المفضلة + الإحالات)
export function createUserSchema(telegramUser, referrerId = null) {
  return {
    telegramId: String(telegramUser.id),
    firstName: telegramUser.first_name || 'User',
    languageCode: telegramUser.language_code || 'en',
    advertiserBalance: 0.0, // رصيد المعلن للإعلانات
    publisherBalance: 0.0,  // أرباح الناشر المتاحة للسحب
    pendingEarnings: 0.0,   // أرباح معلقة لدورة 24 ساعة
    totalReferralEarnings: 0.0,
    referredBy: referrerId ? String(referrerId) : null,
    favoriteChannels: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

// نموذج بيانات القناة
export function createChannelSchema({
  chatId,
  username,
  title,
  photoUrl,
  subscribers,
  ownerId,
  cpmPrice,
  language,
  category
}) {
  const isAutoApproved = Number(subscribers) > CONFIG.AUTO_APPROVE_SUBSCRIBERS;
  return {
    chatId: String(chatId),
    username: String(username), // يُستخدم داخلياً فقط للنشر ولا يُرسل للواجهة العامة لحماية الخصوصية
    title: String(title),
    photoUrl: photoUrl || '',
    subscribers: Number(subscribers) || 0,
    ownerId: String(ownerId),
    cpmPrice: Number(cpmPrice),
    language: String(language),
    category: String(category),
    status: isAutoApproved ? 'approved' : 'pending_admin', // approved | pending_admin | rejected | bot_removed | permission_lost
    botHasAdmin: true,
    promoPostSent: false,
    promoMessageId: null,
    totalViewsDelivered: 0,
    totalEarned: 0.0,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

// نموذج بيانات الحملة الإعلانية
export function createCampaignSchema({
  advertiserId,
  title,
  adText,
  mediaUrl,
  mediaType, // 'none' | 'photo' | 'video'
  buttonText,
  buttonUrl,
  budget,
  targeting, // { minPrice, maxPrice, languages: [], categories: [], openTargeting: boolean, specificChannelIds: [] }
  scheduleType, // 'immediate' | 'peak_hours'
  scheduledAt,
  status // 'active' | 'paused' | 'scheduled' | 'completed' | 'draft'
}) {
  return {
    advertiserId: String(advertiserId),
    title: String(title),
    adText: String(adText),
    mediaUrl: mediaUrl || '',
    mediaType: mediaType || 'none',
    buttonText: String(buttonText || 'Open'),
    buttonUrl: String(buttonUrl),
    totalBudget: Number(budget),
    remainingBudget: Number(budget),
    spentBudget: 0.0,
    targeting: {
      minPrice: Number(targeting?.minPrice || CONFIG.MIN_CPM_PRICE),
      maxPrice: Number(targeting?.maxPrice || CONFIG.MAX_CPM_PRICE),
      languages: Array.isArray(targeting?.languages) ? targeting.languages : [],
      categories: Array.isArray(targeting?.categories) ? targeting.categories : [],
      openTargeting: Boolean(targeting?.openTargeting && Number(budget) > CONFIG.OPEN_TARGETING_MIN_BUDGET),
      specificChannelIds: Array.isArray(targeting?.specificChannelIds) ? targeting.specificChannelIds : []
    },
    scheduleType: scheduleType || 'immediate',
    scheduledAt: scheduledAt || null,
    status: status || 'active',
    stats: {
      totalViews: 0,
      channelsPublished: 0,
      lastSyncAt: Date.now()
    },
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}
