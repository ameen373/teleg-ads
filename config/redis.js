const Redis = require('ioredis');
const CONFIG = require('./config');

let redisIsConnected = false;
let redis = null;

try {
  redis = new Redis(CONFIG.REDIS_URL, {
    maxRetriesPerRequest: 1,
    enableReadyCheck: true,
    lazyConnect: true,
    connectTimeout: 5000,
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

function getRedisStatus() {
  return redisIsConnected;
}

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

async function banIp(ip, durationSec = 86400, reason = 'Suspicious traffic detected') {
  if (!redisIsConnected || !redis) return;
  try {
    const banKey = `banned:ip:${ip}`;
    const payload = JSON.stringify({ reason, bannedAt: new Date().toISOString() });
    if (durationSec > 0) {
      await redis.set(banKey, payload, 'EX', durationSec);
    } else {
      await redis.set(banKey, payload, 'EX', 31536000);
    }
  } catch (e) {}
}

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
