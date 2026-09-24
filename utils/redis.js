const Redis = require('ioredis');
const CONFIG = require('../config/constants');

let redisIsConnected = false;
let redis = null;

try {
  redis = new Redis(CONFIG.REDIS_URL, {
    maxRetriesPerRequest: 1,
    enableReadyCheck: true,
    lazyConnect: true,
    retryStrategy: (times) => (times > 3 ? null : Math.min(times * 100, 1000))
  });

  redis.on('error', () => { redisIsConnected = false; });
  redis.on('ready', () => { redisIsConnected = true; });
  redis.connect().catch(() => { redisIsConnected = false; });
} catch (e) {
  redisIsConnected = false;
}

async function safeRedisGet(key) {
  if (!redisIsConnected || !redis) return null;
  try { return await redis.get(key); } catch (e) { return null; }
}

async function safeRedisSet(key, value, mode, duration) {
  if (!redisIsConnected || !redis) return;
  try {
    if (mode && duration) await redis.set(key, value, mode, duration);
    else await redis.set(key, value);
  } catch (e) {}
}

async function safeRedisDel(key) {
  if (!redisIsConnected || !redis) return;
  try { await redis.del(key); } catch (e) {}
}

function isRedisConnected() {
  return redisIsConnected;
}

function getRedisClient() {
  return redis;
}

module.exports = {
  safeRedisGet,
  safeRedisSet,
  safeRedisDel,
  isRedisConnected,
  getRedisClient
};
