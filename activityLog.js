/**
 * Activity Logger Utility Module
 * Platform: Telega.ads Advertising & Shortener Network
 * Description: Asynchronously registers user activity logs to MongoDB without blocking API request lifecycle or leaking server errors.
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
 * Logs user actions in background safely.
 * 
 * @param {Object} params
 * @param {String|Object} params.userId - User Mongoose ObjectId or string representation
 * @param {String} params.action - Action identifier (e.g., 'CREATE_LINK', 'WITHDRAW_REQUEST')
 * @param {String} [params.category='system'] - Category ('links', 'campaigns', 'wallet', 'auth', 'system')
 * @param {Object} [params.details={}] - Additional details object
 * @param {Object} [params.req=null] - Express request object (optional)
 * @param {String} [params.status='SUCCESS'] - Status ('SUCCESS', 'FAILED', 'PENDING')
 */
const logActivity = async ({ userId, action, category = 'system', details = {}, req = null, status = 'SUCCESS' }) => {
  try {
    if (!userId || !action) {
      return;
    }

    const ipAddress = extractClientIp(req);
    const userAgent = extractUserAgent(req);

    // Create log record directly in MongoDB asynchronously
    await ActivityLog.create({
      userId,
      action: String(action).toUpperCase(),
      category: String(category).toLowerCase(),
      details: typeof details === 'object' && details !== null ? details : { raw: details },
      ipAddress,
      userAgent,
      status: String(status).toUpperCase()
    });
  } catch (error) {
    // Non-blocking fail-safe error handling to protect API response cycles
    console.error('⚠️ [ActivityLog Non-Blocking Error]:', error.message || error);
  }
};

module.exports = logActivity;
