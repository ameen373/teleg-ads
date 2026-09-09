/**
 * Activity Logger Utility Module
 * Platform: Telega.ads Advertising & Shortener Network
 * Description: Asynchronously registers user activity logs to MongoDB returning a Promise and logging debug statuses for Vercel.
 */

const { ActivityLog } = require('./models');

/**
 * Extracts client IP address safely considering proxies and load balancers
 * @param {Object} req - Express Request Object
 * @returns {String|null} Client IP Address
 */
const extractClientIp = (req) => {
  if (!req) return null;
  const forwarded = req.headers && req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || (req.connection && req.connection.remoteAddress) || null;
};

/**
 * Extracts Client User-Agent string from request headers
 * @param {Object} req - Express Request Object
 * @returns {String|null} User-Agent String
 */
const extractUserAgent = (req) => {
  if (!req || !req.headers) return null;
  return req.headers['user-agent'] || null;
};

/**
 * Logs user actions in MongoDB and returns a Promise.
 * 
 * @param {Object} params
 * @param {String|Object} [params.userId] - User ID, Telegram ID, or User Object
 * @param {String} params.action - Action identifier (e.g., 'CREATE_LINK', 'WITHDRAW_REQUEST')
 * @param {String} [params.category='system'] - Category ('links', 'campaigns', 'wallet', 'auth', 'system')
 * @param {Object} [params.details={}] - Additional details object
 * @param {Object} [params.req=null] - Express request object
 * @param {String} [params.status='SUCCESS'] - Status ('SUCCESS', 'FAILED', 'PENDING')
 * @returns {Promise<Object|null>} Saved ActivityLog document or null
 */
const logActivity = async ({ userId, action, category = 'system', details = {}, req = null, status = 'SUCCESS' }) => {
  try {
    // Extract user ID safely across all possible structures
    const finalUserId = userId || req?.user?._id || req?.user?.telegramId || req?.user?.id || req?.body?.userId;

    if (!finalUserId) {
      console.warn('⚠️ Skipped ActivityLog: Missing userId');
      return null;
    }

    if (!action) {
      console.warn('⚠️ Skipped ActivityLog: Missing action');
      return null;
    }

    // Extract IP address and User-Agent automatically from req
    const ipAddress = extractClientIp(req);
    const userAgent = extractUserAgent(req);

    // Save log record directly to MongoDB
    const newLog = await ActivityLog.create({
      userId: finalUserId,
      action: String(action).toUpperCase(),
      category: String(category).toLowerCase(),
      details: typeof details === 'object' && details !== null ? details : { raw: details },
      ipAddress,
      userAgent,
      status: String(status).toUpperCase()
    });

    console.log('✅ Activity Saved:', newLog._id);
    return newLog;
  } catch (error) {
    console.error('❌ Error saving ActivityLog:', error.message || error);
    return null;
  }
};

module.exports = logActivity;
