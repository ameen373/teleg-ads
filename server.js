/**
 * Ultra-Enterprise Server Architecture (V6.6 - Absolute Multi-Tenant Security & High-Performance Core)
 * Telegram Link Shortener & Mini App Engine (Telega.ads)
 * Modular Multi-Tenant Architecture & Vercel Serverless Ready
 */

require('dotenv').config();
const express = require('express');
const path = require('path');
const morgan = require('morgan');
const cors = require('cors');
const mongoSanitize = require('express-mongo-sanitize');

const connectDB = require('./config/db');
const logger = require('./utils/logger');

const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const linkRoutes = require('./routes/linkRoutes');
const adRoutes = require('./routes/adRoutes');
const financeRoutes = require('./routes/financeRoutes');
const trafficRoutes = require('./routes/trafficRoutes');
const adminRoutes = require('./routes/adminRoutes');

const app = express();

// --- Setup Server Trust Proxy ---
app.set('trust proxy', 1);

// --- Handle Favicon Early (Prevents 404 errors & Log Pollution) ---
app.get('/favicon.ico', (req, res) => res.status(204).end());

// --- CORS Configuration (Telegram Mini App Ready) ---
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-telegram-init-data', 'telegram-init-data', 'X-Requested-With', 'x-user-id', 'user-id', 'x-user-ld', 'user-ld', 'telegramid', 'telegram_id', 'id', 'x-init-data'],
  credentials: true
}));
app.options('*', cors());

// --- Robust Body Parsing & Vercel Payload Normalization ---
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(express.text({ type: ['text/*', 'application/json'], limit: '10kb' }));

app.use((req, res, next) => {
  if (typeof req.body === 'string' && req.body.trim().length > 0) {
    try {
      req.body = JSON.parse(req.body);
    } catch (e) {
      // If not JSON, keep as text or empty object
    }
  }
  if (!req.body || typeof req.body !== 'object') {
    req.body = {};
  }
  next();
});

app.use(mongoSanitize());

// --- Static Files Serving (Public & Root Support) ---
app.use(express.static(path.join(process.cwd(), 'public')));
app.use(express.static(__dirname));

// --- Force UTF-8 JSON Response Headers & No-Cache Privacy Guard ---
app.use((req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/shorten') || req.path.startsWith('/deposit') || req.path.startsWith('/auth')) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
  }
  next();
});

// --- Centralized Logging Engine ---
app.use(morgan('combined', { stream: { write: (message) => logger.info(message.trim()) } }));

// --- Serverless Database Connection Middleware ---
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    logger.error('Database connection middleware error:', err);
    return res.status(500).json({ success: false, error: 'خطأ في الاتصال بقاعدة البيانات' });
  }
});

// --- Primary View & Static Files Routing ---
app.get('/', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'views.html'));
});

app.post('/', (req, res) => {
  res.json({ success: true, message: 'Telega.ads API Gateway Active' });
});

app.get('/r/:code', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'views.html'));
});

// --- API Modular Routes Registration ---
app.use('/', authRoutes);
app.use('/', userRoutes);
app.use('/', linkRoutes);
app.use('/', adRoutes);
app.use('/', financeRoutes);
app.use('/', trafficRoutes);
app.use('/', adminRoutes);

// --- 404 Fallback Handler for Unmatched Routes ---
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    error: `المسار المطلوب غير موجود: ${req.method} ${req.originalUrl}`
  });
});

// --- Centralized Global Error Handler Middleware ---
app.use((err, req, res, next) => {
  // طباعة التفاصيل الكاملة للخطأ في الـ Logs لتسهيل التتبع والـ Debugging
  logger.error(`[UNCAUGHT ERROR] ${req.method} ${req.originalUrl} - ${err.message}`, {
    error: err.message,
    stack: err.stack,
    body: req.body,
    query: req.query,
    params: req.params,
    headers: req.headers
  });

  // تحديث حالة الاستجابة وتنسيق الرد
  const statusCode = err.statusCode || err.status || 500;
  
  res.status(statusCode).json({
    success: false,
    error: err.message || 'حدث خطأ داخلي في السيرفر (500 Internal Server Error)',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

module.exports = app;
