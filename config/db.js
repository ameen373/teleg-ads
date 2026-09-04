// config/db.js
const mongoose = require('mongoose');

/**
 * دالة الاتصال بقاعدة بيانات MongoDB وإدارة حالات الاتصال
 */
const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI;

    if (!mongoURI) {
      throw new Error('لم يتم تعيين متغير البيئة MONGODB_URI في ملف .env');
    }

    const options = {
      autoIndex: true,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000
    };

    const conn = await mongoose.connect(mongoURI, options);

    console.log(`[Database] تم الاتصال بنجاح بـ MongoDB: ${conn.connection.host}`);

    mongoose.connection.on('error', (err) => {
      console.error(`[Database Event Error]: ${err.message}`);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('[Database Event Warning]: انقطع الاتصال بقاعدة البيانات');
    });

    mongoose.connection.on('reconnected', () => {
      console.log('[Database Event Info]: تم إعادة الاتصال بقاعدة البيانات بنجاح');
    });

  } catch (error) {
    console.error(`[Database Error] فشل الاتصال بقاعدة البيانات: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
