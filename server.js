// server.js
const path = require('path');
const express = require('express');
const cors = require('cors');
require('dotenv').config();

// استدعاء وحدة الاتصال بقاعدة البيانات
const connectDB = require('./config/db');

// استدعاء مسارات الـ API (Routes)
const authRoutes = require('./routes/authRoutes');
const linkRoutes = require('./routes/linkRoutes');
const bridgeRoutes = require('./routes/bridgeRoutes');
const walletRoutes = require('./routes/walletRoutes');
const campaignRoutes = require('./routes/campaignRoutes');
const adminRoutes = require('./routes/adminRoutes');
const referralRoutes = require('./routes/referralRoutes');

// التهيئة الأولى للتطبيق
const app = express();

// التوصيل بقاعدة البيانات
connectDB();

// إعدادات CORS والمرونة في استقبال الطلبات
app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-telegram-init-data', 'x-init-data']
  })
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// تقديم الملفات الإستاتيكية من مجلد public
app.use(express.static(path.join(__dirname, 'public')));

// ربط جميع مسارات الـ API
app.use('/api/auth', authRoutes);
app.use('/api/links', linkRoutes);
app.use('/api/bridge', bridgeRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/referrals', referralRoutes);

// معالجة إعادة التوجيه لصفحة الجسر عبر المسار /b/:code
app.get('/b/:code', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'bridge.html'));
});

// المسار الرئيسي لتطبيق الـ SPA (الميني آب)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// معالجة الـ API 404 لكافة مسارات الـ API غير المعرفة
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'المسار المطلوب غير موجود على السيرفر (404 Not Found).'
  });
});

// Fallback لصفحات الواجهة والمستندات (Single Page Application Fallback)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// معالج الأخطاء العام (Global Error Handler)
app.use((err, req, res, next) => {
  console.error('[Global Error Handler]:', err.stack || err);

  const statusCode = err.statusCode || 500;
  const message = err.message || 'حدث خطأ داخلي في السيرفر.';

  res.status(statusCode).json({
    success: false,
    message: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// تشغيل السيرفر في البيئات التقليدية والتحقق من Vercel / Serverless
if (process.env.NODE_ENV !== 'test' && !process.env.VERCEL) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`=================================`);
    console.log(`🚀 Server is running on port: ${PORT}`);
    console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`=================================`);
  });
}

// تصدير الكائن لاستخدامه مع بيئة Vercel Serverless
module.exports = app;
