/**
 * Centralized Error Handling Middleware
 * Intercepts uncaught application errors and delivers structured HTTP JSON responses
 */

const logger = require('../config/logger');

const errorHandler = (err, req, res, next) => {
  logger.error('Unhandled Application Error:', {
    message: err.message,
    stack: err.stack,
    path: req.originalUrl,
    method: req.method,
    ip: req.ip
  });

  // Handle Mongoose Duplicate Key Error (11000)
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'البيانات';
    return res.status(400).json({
      success: false,
      error: `القيمة المجهزة لـ (${field}) مسجلة مسبقاً في النظام`
    });
  }

  // Handle Mongoose Validation Errors
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map(val => val.message);
    return res.status(400).json({
      success: false,
      error: messages.join(' | ')
    });
  }

  // Handle JWT Authentication Errors
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      error: 'رمز المصادقة انتهت صلاحيته أو غير صالح، يرجى إعادة تسجيل الدخول'
    });
  }

  // Standard Fallback Server Error
  const statusCode = err.statusCode || (res.statusCode === 200 ? 500 : res.statusCode);
  return res.status(statusCode).json({
    success: false,
    error: process.env.NODE_ENV === 'production' 
      ? 'حدث خطأ غير متوقع في الخادم، يرجى المحاولة لاحقاً' 
      : err.message || 'حدث خطأ غير متوقع في الخادم'
  });
};

module.exports = errorHandler;
