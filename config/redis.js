const Redis = require('ioredis');
const CONFIG = require('./config');

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

/**
 * Safe Get Helper
 */
async function safeRedisGet(key) {
  if (!redisIsConnected || !redis) return null;
  try { return await redis.get(key); } catch (e) { return null; }
}

/**
 * Safe Set Helper
 */
async function safeRedisSet(key, value, mode, duration) {
  if (!redisIsConnected || !redis) return;
  try {
    if (mode && duration) await redis.set(key, value, mode, duration);
    else await redis.set(key, value);
  } catch (e) {}
}

/**
 * Safe Del Helper
 */
async function safeRedisDel(key) {
  if (!redisIsConnected || !redis) return;
  try { await redis.del(key); } catch (e) {}
}

/**
 * Get Connection Status
 */
function getRedisStatus() {
  return redisIsConnected;
}

/**
 * Rate Limiting Check by IP
 * @param {string} ip - Target IP Address
 * @param {number} limit - Max allowed requests
 * @param {number} windowSec - Time window in seconds
 */
async function checkRateLimit(ip, limit = 20, windowSec = 60) {
  if (!redisIsConnected || !redis) {
    return { allowed: true, current: 1, ttl: windowSec };
  }
  try {
    const key = `ratelimit:${ip}`;
    const current = await redis.incr(key);
    
    if (current === 1) {
      await redis.expire(key, windowSec);
    }
    
    const ttl = await redis.ttl(key);
    const allowed = current <= limit;
    
    return { allowed, current, ttl: ttl > 0 ? ttl : windowSec };
  } catch (e) {
    return { allowed: true, current: 1, ttl: windowSec };
  }
}

/**
 * Verify 24-Hour Uniqueness for IP & Device Fingerprint
 * @param {string} ip - IP Address
 * @param {string} fingerprint - Device Fingerprint Hash
 * @param {number} ttlSec - Expiration time in seconds (default 24h = 86400)
 */
async function checkUniqueness(ip, fingerprint, ttlSec = 86400) {
  if (!redisIsConnected || !redis) {
    return { isUnique: true, ipUnique: true, fpUnique: true };
  }
  try {
    const ipKey = `unique:ip:${ip}`;
    const fpKey = fingerprint ? `unique:fp:${fingerprint}` : null;

    const pipeline = redis.pipeline();
    pipeline.get(ipKey);
    if (fpKey) pipeline.get(fpKey);

    const results = await pipeline.exec();
    const ipExists = results[0][1] !== null;
    const fpExists = fpKey && results[1] ? results[1][1] !== null : false;

    const ipUnique = !ipExists;
    const fpUnique = !fpExists;
    const isUnique = ipUnique && fpUnique;

    if (ipUnique) {
      await redis.set(ipKey, '1', 'EX', ttlSec);
    }
    if (fpKey && fpUnique) {
      await redis.set(fpKey, '1', 'EX', ttlSec);
    }

    return { isUnique, ipUnique, fpUnique };
  } catch (e) {
    return { isUnique: true, ipUnique: true, fpUnique: true };
  }
}

/**
 * Ban Suspicious IP Temporarily or Permanently
 * @param {string} ip - Target IP Address
 * @param {number} durationSec - Duration in seconds (0 = permanent/1 year)
 * @param {string} reason - Ban reason
 */
async function banIp(ip, durationSec = 86400, reason = 'Suspicious traffic detected') {
  if (!redisIsConnected || !redis) return;
  try {
    const banKey = `banned:ip:${ip}`;
    const payload = JSON.stringify({ reason, bannedAt: new Date().toISOString() });
    if (durationSec > 0) {
      await redis.set(banKey, payload, 'EX', durationSec);
    } else {
      await redis.set(banKey, payload, 'EX', 31536000); // 1 Year
    }
  } catch (e) {}
}

/**
 * Check if IP is banned
 * @param {string} ip - Target IP Address
 */
async function isIpBanned(ip) {
  if (!redisIsConnected || !redis) return false;
  try {
    const banData = await redis.get(`banned:ip:${ip}`);
    return banData !== null;
  } catch (e) {
    return false;
  }
}

module.exports = {
  redis,
  getRedisStatus,
  safeRedisGet,
  safeRedisSet,
  safeRedisDel,
  checkRateLimit,
  checkUniqueness,
  banIp,
  isIpBanned
};
