/**
 * Admin Dashboard & System Control Router
 * راوتر لوحة التحكم الخاصة بالإدارة وحماية كافة مساراتها
 */

const express = require('express');
const router = express.Router();
const { authenticateToken, auth, isAdmin, adminMiddleware } = require('../middleware/auth');
const adminController = require('../controllers/adminController');

// تحديد دالة التوثيق ودالة صلاحيات الأدمن
const verifyAuth = auth || authenticateToken;
const verifyAdmin = isAdmin || adminMiddleware;

// 1. تطبيق الحماية الكاملة لجميع مسارات هذا الراوتر (حظر أي وصول غير مصرح أو غير أدمن)
router.use(verifyAuth);
router.use(verifyAdmin);

/* ==========================================================================
   1. إحصائيات لوحة التحكم (Dashboard Stats)
   ========================================================================== */

// جلب إحصائيات النظام الشاملة
router.get('/stats', adminController.getDashboardStats);
router.get('/dashboard-data', adminController.handleGetDashboardData);

/* ==========================================================================
   2. إدارة المستخدمين (Users Management)
   ========================================================================== */

// جلب قائمة المستخدمين مع التصفية والبحث
router.get('/users', adminController.getUsers);

// تحديث حالة المستخدم (حظر/فك حظر، تغيير الدور)
router.put('/users/:id/status', (req, res, next) => {
  req.params.userId = req.params.id;
  adminController.updateUserStatus(req, res, next);
});

// تعديل رصيد المستخدم يدوياً
router.put('/users/:id/balance', (req, res, next) => {
  req.params.userId = req.params.id;
  adminController.updateUserStatus(req, res, next);
});

/* ==========================================================================
   3. إدارة الإعلانات (Ads Management)
   ========================================================================== */

// جلب كافة الإعلانات مع خيارات التصفية والبحث
router.get('/ads', adminController.getAds);

// مراجعة الإعلان (موافقة، رفض مع سبب، أو تجميد)
router.put('/ads/:id/review', (req, res, next) => {
  req.params.adId = req.params.id;
  adminController.reviewAd(req, res, next);
});

/* ==========================================================================
   4. إدارة طلبات السحب (Withdrawals Management)
   ========================================================================== */

// جلب قائمة طلبات السحب
router.get('/withdrawals', adminController.getWithdrawals);

// معالجة طلب السحب (موافقة أو رفض وإعادة المبلغ بشكل آمن)
router.put('/withdrawals/:id/process', (req, res, next) => {
  req.params.withdrawalId = req.params.id;
  adminController.processWithdrawal(req, res, next);
});

/* ==========================================================================
   5. إعدادات النظام العامة (System Settings)
   ========================================================================== */

// جلب إعدادات النظام العامة
router.get('/settings', adminController.getSystemSettings);

// تحديث إعدادات النظام العامة
router.put('/settings', adminController.updateSystemSettings);

/* ==========================================================================
   مسارات إضافية للتوافق المباشر (Direct Prefix Fallback Routes)
   ========================================================================== */

router.get('/api/admin/stats', adminController.getDashboardStats);
router.get('/api/admin/dashboard-data', adminController.handleGetDashboardData);
router.get('/api/admin/users', adminController.getUsers);

router.put('/api/admin/users/:id/status', (req, res, next) => {
  req.params.userId = req.params.id;
  adminController.updateUserStatus(req, res, next);
});

router.put('/api/admin/users/:id/balance', (req, res, next) => {
  req.params.userId = req.params.id;
  adminController.updateUserStatus(req, res, next);
});

router.get('/api/admin/ads', adminController.getAds);

router.put('/api/admin/ads/:id/review', (req, res, next) => {
  req.params.adId = req.params.id;
  adminController.reviewAd(req, res, next);
});

router.get('/api/admin/withdrawals', adminController.getWithdrawals);

router.put('/api/admin/withdrawals/:id/process', (req, res, next) => {
  req.params.withdrawalId = req.params.id;
  adminController.processWithdrawal(req, res, next);
});

router.get('/api/admin/settings', adminController.getSystemSettings);
router.put('/api/admin/settings', adminController.updateSystemSettings);

module.exports = router;
