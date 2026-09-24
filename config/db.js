const mongoose = require('mongoose');
const { CONFIG } = require('./env.js');

let logger;
try {
  logger = require('../utils/logger');
} catch (err) {
  logger = console;
}

let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

async function connectDB() {
  if (cached.conn && mongoose.connection.readyState === 1) {
    return cached.conn;
  }

  const mongoUri = CONFIG.MONGO_URI || process.env.MONGODB_URI || process.env.MONGO_URI;

  if (!mongoUri) {
    throw new Error('MongoDB URI is not defined in environment variables or configuration.');
  }

  if (!cached.promise) {
    const opts = {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      bufferCommands: false
    };

    cached.promise = mongoose.connect(mongoUri, opts).then((m) => {
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
