import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import mongoSanitize from 'express-mongo-sanitize';
import rateLimit from 'express-rate-limit';

const app = express();

// ==========================================
// 1. إعدادات الحماية والوسائط (Middleware)
// ==========================================

// تعزيز أمان الرؤوس (HTTP Headers)
app.use(helmet());

// السماح بطلبات CORS وتكشيف الرؤوس المطلوبة
app.use(cors({
  origin: '*', // يُوصى بتحديد النطاق الخاص بك في بيئة الإنتاج
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-telegram-init-data']
}));

// تحليل جسم الطلب (JSON & URL-Encoded)
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// الحماية من هجمات NoSQL Injection
app.use(mongoSanitize());

// تحديد معدل الطلبات لحماية السيرفر من هجمات DDoS
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 دقيقة
  max: 300, // حد أقصى 300 طلب لكل IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'fail', message: 'تم تجاوز حد الطلبات المسموح به، يرجى المحاولة لاحقاً.' }
});
app.use('/api', limiter);

// ==========================================
// 2. الاتصال بقاعدة البيانات (MongoDB)
// ==========================================

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/my_database';

let isConnected = false;

const connectDB = async () => {
  if (isConnected && mongoose.connection.readyState === 1) {
    return;
  }
  try {
    const db = await mongoose.connect(MONGODB_URI, {
      bufferCommands: false,
      serverSelectionTimeoutMS: 5000,
    });
    isConnected = db.connections[0].readyState === 1;
    console.log('✅ تم الاتصال بنجاح بقاعدة البيانات MongoDB');
  } catch (error) {
    console.error('❌ خطأ في الاتصال بقاعدة البيانات:', error.message);
    throw error;
  }
};

// التأكد من الاتصال قبل معالجة أي طلب (مفيد جداً لبيئات Serverless/Vercel)
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    res.status(500).json({ status: 'error', message: 'تعذر الاتصال بقاعدة البيانات' });
  }
});

// ==========================================
// 3. مسارات فحص الصحة والنموذج (Routes)
// ==========================================

// مسار فحص الحالة (Health Check)
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'API يعمل بنجاح وكفاءة عالية',
    timestamp: new Date().toISOString()
  });
});

// 💡 يمكنك استيراد وربط المسارات الخاصة بنماذجك هنا:
// import authRoutes from './routes/auth.js';
// import userRoutes from './routes/user.js';
// app.use('/api/v1/auth', authRoutes);
// app.use('/api/v1/users', userRoutes);

// ==========================================
// 4. معالجة المسارات غير الموجودة والأخطاء
// ==========================================

// Handling 404
app.use('*', (req, res) => {
  res.status(404).json({
    status: 'fail',
    message: `المسار المطلوب ${req.originalUrl} غير موجود على هذا السيرفر.`
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('🔥 Central Error Handler:', err);

  const statusCode = err.statusCode || 500;
  const status = err.status || 'error';

  res.status(statusCode).json({
    status,
    message: err.message || 'حدث خطأ داخلي في السيرفر',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// ==========================================
// 5. تشغيل السيرفر
// ==========================================

const PORT = process.env.PORT || 3000;

if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`🚀 السيرفر يعمل على المنفذ: ${PORT}`);
  });
}

export default app;
