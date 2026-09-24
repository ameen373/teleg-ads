const sanitizeDomain = (domain) => {
  if (!domain) return 'teleg-ads.vercel.app';
  return domain.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
};

const OFFICIAL_BOT_URL = process.env.OFFICIAL_BOT_URL || 'https://t.me/Ads_telegabot';
const TELEGRAM_SUPPORT_URL = process.env.TELEGRAM_SUPPORT_URL || 'https://t.me/Te_AdsNs_bot';

const CONFIG = Object.freeze({
  BOT_TOKEN: process.env.BOT_TOKEN || '',
  MONGO_URI: process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/shortener',
  ADMIN_ID: String(process.env.ADMIN_ID || '').trim(),
  JWT_SECRET: process.env.JWT_SECRET || 'fallback_jwt_secret_key_32bytes_long!',
  ADSGRAM_BLOCK_ID: process.env.ADSGRAM_BLOCK_ID || '1234',
  APP_DOMAIN: sanitizeDomain(process.env.APP_DOMAIN),
  REDIS_URL: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
  DEFAULT_LANGUAGE: 'ar',
  
  OFFICIAL_BOT_URL,
  OFFICIAL_CHANNEL_URL: process.env.OFFICIAL_CHANNEL_URL || 'https://t.me/ttelega_ads',
  TELEGRAM_SUPPORT_URL,
  
  DEPOSIT_USDT_BEP20: process.env.DEPOSIT_USDT_BEP20 || '',
  DEPOSIT_USDT_TRC20: process.env.DEPOSIT_USDT_TRC20 || '',

  BOT_USERNAME: '@' + OFFICIAL_BOT_URL.split('/').pop(),
  SUPPORT_USERNAME: '@' + TELEGRAM_SUPPORT_URL.split('/').pop()
});

module.exports = {
  sanitizeDomain,
  CONFIG
};
