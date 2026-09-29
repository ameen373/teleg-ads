/**
 * Ultra-Enterprise Server Architecture
 * Telegram Link Shortener & Mini App Engine (Telega.ads)
 * Main Server File
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
const authRouter = require('./routes/authroutes');
const userRouter = require('./routes/userroutes');
const shortenerRouter = require('./routes/shortenerroutes');
const adsRouter = require('./routes/adsroutes');
const trafficRouter = require('./routes/trafficroutes');
const adminRouter = require('./routes/adminroutes');

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

// --- Robust Body Parsing & Security Sanitization ---
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(mongoSanitize());

// --- Morgan Logger Middleware ---
app.use(morgan('combined', { stream: { write: (message) => logger.info(message.trim()) } }));

// =========================================================================
// --- Static Asset & Favicon Handling (BEFORE DB Middleware for Performance) ---
// =========================================================================

// Fix favicon 404 error
app.get('/favicon.ico', (req, res) => res.status(204).end());

// Safe Static Files Serving (Only from public folder)
app.use(express.static(path.join(process.cwd(), 'public')));

// --- Force UTF-8 JSON Response Headers & No-Cache Privacy Guard ---
app.use((req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/shorten') || req.path.startsWith('/deposit') || req.path.startsWith('/auth')) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
  }
  next();
});

// =========================================================================
// --- Database Connection Middleware ---
// =========================================================================
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    logger.error('Database connection middleware error:', err);
    return res.status(500).json({ success: false, message: 'خطأ في الاتصال بقاعدة البيانات' });
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
// --- Fallback 404 Handler & Centralized Error Handler ---
// =========================================================================
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'المسار المطلوب غير موجود' });
});

app.use(errorHandler);

// Support direct execution (Node/Termux) and Vercel Serverless export
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
  });
}

module.exports = app;
