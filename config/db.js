// config/db.js
const mongoose = require('mongoose');

/**
 * دالة الاتصال بقاعدة بيانات MongoDB
 */
const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI;

    if (!mongoURI) {
      throw new Error('لم يتم تعيين متغير البيئة MONGODB_URI في ملف .env');
    }

    const conn = await mongoose.connect(mongoURI);

    console.log(`[Database] تم الاتصال بنجاح بـ MongoDB: ${conn.connection.host}`);
  } catch (error) {
    console.error(`[Database Error] فشل الاتصال بقاعدة البيانات: ${error.message}`);
    
    // إنهاء العملية برمز فشل (1) في حال عدم التمكن من الاتصال بقاعدة البيانات
    process.exit(1);
  }
};

module.exports = connectDB;

