const mongoose = require('mongoose');
const CONFIG = require('./constants');
const { logger } = require('../utils/logger');

let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

async function connectDB() {
  if (cached.conn && mongoose.connection.readyState === 1) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      bufferCommands: true
    };

    cached.promise = mongoose.connect(CONFIG.MONGO_URI, opts).then((m) => {
      logger.info('✅ Enterprise MongoDB Pipeline Connected');
      return m;
    }).catch((err) => {
      cached.promise = null;
      throw err;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (err) {
    cached.promise = null;
    logger.error('❌ MongoDB Connection Failure:', err);
    throw err;
  }

  return cached.conn;
}

module.exports = connectDB;
