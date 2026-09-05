/**
 * ============================================================================
 * Ultra-Enterprise High-Performance Server Engine
 * File: server.js
 * ============================================================================
 */

import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { createClient } from 'redis';

// تحميل متغيرات البيئة
dotenv.config();

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;
const REDIS_URI = process.env.REDIS_URI || 'redis://localhost:6379';

const app = express();
const server = http.createServer(app);

// ============================================================================
// 1. GLOBAL REDIS & DATABASE CONNECTIONS
// ============================================================================

export const redisClient = createClient({ url: REDIS_URI });

redisClient.on('error', (err) => console.error('❌ Redis Storage Error:', err));
redisClient.on('connect', () => console.log('⚡ Redis Cache Engine Connected.'));

async function connectDatabases() {
  try {
    // اتصال Mongoose
    await mongoose.connect(MONGO_URI, {
      maxPoolSize: 50, // دعم آلاف الطلبات المتزامنة
      wtimeoutMS: 2500,
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ MongoDB Enterprise Cluster Connected.');

    // اتصال Redis
    await redisClient.connect();
  } catch (error) {
    console.error('💥 Critical Database Connection Failure:', error);
    process.exit(1);
  }
}

// ============================================================================
// 2. SECURITY & OPTIMIZATION MIDDLEWARES
// ============================================================================

// حماية الهيدرز ومنع الهجمات الشائعة
app.use(helmet({
  contentSecurityPolicy: false, // مخصص لسرعة التككامل مع Telegram Mini Apps
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// السماح بالوصول من كافة المصادر (CORS) لدعم Telegram Mini Apps
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Telegram-Init-Data']
}));

// ضغط استجابات الـ HTTP لتسريع نقل البيانات
app.use(compression());

// معالجة نصوص JSON و URL Encoded بأحجام كبيرة
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// تسجيل الطلبات (Logging) في بيئة التطوير
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

// ============================================================================
// 3. HEALTH CHECK & SYSTEM MONITORING
// ============================================================================

app.get('/health', async (req, res) => {
  const mongoStatus = mongoose.connection.readyState === 1 ? 'UP' : 'DOWN';
  const redisStatus = redisClient.isOpen ? 'UP' : 'DOWN';

  const healthData = {
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    status: (mongoStatus === 'UP' && redisStatus === 'UP') ? 'HEALTHY' : 'DEGRADED',
    services: {
      database: mongoStatus,
      cache: redisStatus
    },
    memoryUsage: process.memoryUsage()
  };

  res.status(healthData.status === 'HEALTHY' ? 200 : 503).json(healthData);
});

// ============================================================================
// 4. API ROUTES & BOT WEBHOOK INTEGRATION
// ============================================================================

// مسار الترحيب والتأكيد
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: '🚀 Enterprise Telegram Core Engine is Running Sublimely.',
    version: '1.0.0'
  });
});

// هنا يتم ربط الـ Routes الخاصة بنظامك (مثال: الإعلانات، اختصار الروابط، المستخدمين)
// app.use('/api/v1/users', userRoutes);
// app.use('/api/v1/ads', adRoutes);
// app.use('/api/v1/shortener', shortenerRoutes);

// ============================================================================
// 5. GLOBAL ERROR HANDLING MIDDLEWARE
// ============================================================================

app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    error: 'Route Not Found',
    path: req.originalUrl
  });
});

app.use((err, req, res, next) => {
  console.error('🔥 Unhandled Express Error:', err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
});

// ============================================================================
// 6. SERVER STARTUP & GRACEFUL SHUTDOWN
// ============================================================================

async function startServer() {
  await connectDatabases();

  server.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(`🚀 SERVER RUNNING IN [${process.env.NODE_ENV || 'development'}] MODE`);
    console.log(`🌐 PORT: ${PORT}`);
    console.log(`⚡ READY FOR HIGH-SCALE TRAFFIC & TELEGRAM MINI APPS`);
    console.log(`=======================================================`);
  });
}

// المعالجة الاحترافية لإغلاق السيرفر دون فقدان البيانات (Graceful Shutdown)
async function gracefulShutdown(signal) {
  console.log(`\n⚠️ Received ${signal}. Initiating graceful shutdown...`);
  
  server.close(async () => {
    console.log('🛑 HTTP Server Closed.');
    try {
      await mongoose.connection.close(false);
      console.log('🛑 MongoDB Connection Closed.');
      await redisClient.quit();
      console.log('🛑 Redis Connection Closed.');
      process.exit(0);
    } catch (err) {
      console.error('💥 Error during graceful shutdown:', err);
      process.exit(1);
    }
  });

  // إجبار الإغلاق في حال استغرق الأمر أكثر من 10 ثوانٍ
  setTimeout(() => {
    console.error('🔥 Forced shutdown due to timeout.');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception thrown:', error);
  gracefulShutdown('uncaughtException');
});

startServer();
