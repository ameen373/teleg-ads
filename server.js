/**
 * Ultra-Enterprise Server Architecture (V6.6 - Absolute Multi-Tenant Security & High-Performance Core)
 * Telegram Link Shortener & Mini App Engine (Telega.ads)
 * Full MVC Architecture - Step 3 Production Ready
 */

require('dotenv').config();
const express = require('express');
const path = require('path');
const morgan = require('morgan');
const cors = require('cors');
const mongoSanitize = require('express-mongo-sanitize');

// Configurations & Database Core
const logger = require('./config/logger');
const connectDB = require('./config/db');

// Import Centralized Error Handler Middleware
const errorHandler = require('./middleware/errorHandler');

// Import Modularized Express Routers
const authRouter = require('./routes/auth');
const userRouter = require('./routes/user');
const shortenerRouter = require('./routes/shortener');
const adsRouter = require('./routes/ads');
const trafficRouter = require('./routes/traffic');
const adminRouter = require('./routes/admin');

const app = express();

// --- Setup Server Trust Proxy ---
app.set('trust proxy', 1);

// --- CORS Configuration ---
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type', 'Authorization', 'x-telegram-init-data', 
    'telegram-init-data', 'X-Requested-With', 'x-user-id', 
    'user-id', 'x-user-ld', 'user-ld', 'telegramid', 
    'telegram_id', 'id', 'x-init-data'
  ],
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
    } catch (e) {}
  }
  if (!req.body || typeof req.body !== 'object') {
    req.body = {};
  }
  next();
});

app.use(mongoSanitize());

// --- Static Files Serving ---
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

app.use(morgan('combined', { stream: { write: (message) => logger.info(message.trim()) } }));

// Middleware to ensure Database Connection per Request
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    logger.error('Database connection middleware error:', err);
    return res.status(500).json({ success: false, error: 'خطأ في الاتصال بقاعدة البيانات' });
  }
});

// =========================================================================
// --- Primary View & Static Files Routing ---
// =========================================================================
app.get('/', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'views.html'));
});

app.post('/', (req, res) => {
  res.json({ success: true, message: 'Telega.ads API Gateway Active' });
});

app.get('/r/:code', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'views.html'));
});

// =========================================================================
// --- Mount Modularized API Routers ---
// =========================================================================
app.use('/', authRouter);
app.use('/', userRouter);
app.use('/', shortenerRouter);
app.use('/', adsRouter);
app.use('/', trafficRouter);
app.use('/', adminRouter);

// =========================================================================
// --- Centralized Error Logger & Exception Handler Middleware ---
// =========================================================================
app.use(errorHandler);

// Compatible Export for Vercel Serverless Function Engine
module.exports = app;
