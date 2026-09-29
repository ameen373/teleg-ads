const mongoose = require('mongoose');
const CONFIG = require('./config');
const logger = require('./logger');

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
      minPoolSize: 1,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      bufferCommands: false,
      autoIndex: process.env.NODE_ENV !== 'production'
    };

    cached.promise = mongoose.connect(CONFIG.MONGO_URI, opts).then((m) => {
      logger.info('✅ Enterprise MongoDB Pipeline Connected (Vercel Pool Ready)');
      return m;
    }).catch((err) => {
      cached.promise = null;
      logger.error('❌ MongoDB Connection Initial Failure:', err);
      throw err;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (err) {
    cached.promise = null;
    logger.error('❌ MongoDB Async Resolution Error:', err);
    throw err;
  }

  return cached.conn;
}

module.exports = connectDB;
