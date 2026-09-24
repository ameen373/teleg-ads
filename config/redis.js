const Redis = require('ioredis');
// ✅ استدعاء ملف env.js الموجود في نفس المجلد بدلاً من ./config
const env = require('./env');

// جلب رابط Redis بأمان من ملف البيئة أو المتغيرات المباشرة
const REDIS_URL = env?.REDIS_URL || env?.CONFIG?.REDIS_URL || process.env.REDIS_URL;

let redisIsConnected = false;
let redis = null;

if (REDIS_URL) {
  try {
    redis = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
      lazyConnect: true,
      retryStrategy: (times) => (times > 3 ? null : Math.min(times * 100, 1000))
    });

    redis.on('error', () => { redisIsConnected = false; });
    redis.on('ready', () => { redisIsConnected = true; });
    redis.on('close', () => { redisIsConnected = false; });
    redis.on('end', () => { redisIsConnected = false; });

    redis.connect().catch(() => { redisIsConnected = false; });
  } catch (e) {
    redisIsConnected = false;
  }
}

async function safeRedisGet(key) {
  if (!redisIsConnected || !redis) return null;
  try { 
    return await redis.get(key); 
  } catch (e) { 
    return null; 
  }
}

async function safeRedisSet(key, value, mode, duration) {
  if (!redisIsConnected || !redis) return;
  try {
    if (mode && duration) {
      await redis.set(key, value, mode, duration);
    } else {
      await redis.set(key, value);
    }
  } catch (e) {}
}

async function safeRedisDel(key) {
  if (!redisIsConnected || !redis) return;
  try { 
    await redis.del(key); 
  } catch (e) {}
}

module.exports = {
  redis,
  redisIsConnected,
  safeRedisGet,
  safeRedisSet,
  safeRedisDel
};
