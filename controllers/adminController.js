/**
 * Admin Dashboard & System Control Controller
 * متحكم لوحة الإدارة الشاملة وإدارة النظام
 */

const mongoose = require('mongoose');
const connectDB = require('../config/db');
const logger = require('../config/logger');
const models = require('../models');

// استخراج النماذج مع وضع فحص أمان للنموذج الإختياري Setting
const { User, Ad, Withdraw, Deposit } = models;
const Setting = models.Setting || null;

/**
 * 1. جلب إحصائيات النظام العامة ولوحة التحكم
 */
const getDashboardStats = async (req, res, next) => {
  try {
    await connectDB();

    const [
      totalUsers,
      activeAds,
      pendingAds,
      pendingWithdrawsCount,
      pendingDepositsCount,
      withdrawsAgg,
      depositsAgg,
      recentWithdrawals,
      recentDeposits
    ] = await Promise.all([
      User.countDocuments(),
      Ad.countDocuments({ status: 'active' }),
      Ad.countDocuments({ status: 'pending' }),
      Withdraw.countDocuments({ status: 'pending' }),
      Deposit.countDocuments({ status: 'pending' }),
      Withdraw.aggregate([
        { $match: { status: {$in: ['approved', 'completed'] } } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      Deposit.aggregate([
        { $match: { status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      Withdraw.find({ status: 'pending' })
        .populate('userId', 'telegramId username firstName lastName')
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),
      Deposit.find({ status: 'pending' })
        .populate('userId', 'telegramId username firstName lastName')
        .sort({ createdAt: -1 })
        .limit(10)
        .lean()
    ]);

    const totalWithdrawn = withdrawsAgg.length > 0 ? withdrawsAgg[0].total : 0;
    const totalDeposited = depositsAgg.length > 0 ? depositsAgg[0].total : 0;

    return res.status(200).json({
      success: true,
      stats: {
        totalUsers,
        activeAds,
        pendingAds,
        pendingWithdrawsCount,
        pendingDepositsCount,
        totalWithdrawn,
        totalDeposited
      },
      pendingWithdraws: recentWithdrawals,
      pendingDeposits: recentDeposits
    });
  } catch (err) {
    logger.error('Error in getDashboardStats:', err);
    if (next) return next(err);
    return res.status(500).json({ success: false, error: 'خطأ في جلب بيانات لوحة التحكم' });
  }
};

/**
 * 2.1 جلب قائمة المستخدمين مع التصفية والبحث والصفحات (Pagination)
 */
const getUsers = async (req, res, next) => {
  try {
    await connectDB();
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, parseInt(req.query.limit, 10) || 20);
    const skip = (page - 1) * limit;

    const { search, status, role } = req.query;
    const query = {};

    if (search) {
      const cleanSearch = String(search).trim();
      const searchConditions = [
        { username: { $regex: cleanSearch,$options: 'i' } },
        { firstName: { $regex: cleanSearch,$options: 'i' } },
        { telegramId: { $regex: cleanSearch,$options: 'i' } }
      ];
      if (mongoose.Types.ObjectId.isValid(cleanSearch)) {
        searchConditions.push({ _id: cleanSearch });
      }
      query.$or = searchConditions;
    }

    if (status === 'banned') query.isBanned = true;
    if (status === 'active') query.isBanned = false;
    if (role) query.role = role;

    const [users, total] = await Promise.all([
      User.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(query)
    ]);

    return res.status(200).json({
      success: true,
      users,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    logger.error('Error in getUsers:', err);
    if (next) return next(err);
    return res.status(500).json({ success: false, error: 'خطأ في جلب قائمة المستخدمين' });
  }
};

/**
 * 2.2 تحديث حالة المستخدم (حظر/فك حظر، تعديل الدور، أو تعديل الأرصدة يدوياً)
 */
const updateUserStatus = async (req, res, next) => {
  try {
    await connectDB();
    const { userId } = req.params;
    const {
      isBanned,
      banReason,
      role,
      availableBalance,
      pendingBalance,
      balanceAdjustment,
      adjustmentType
    } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });
    }

    const updateData = {};

    // 1. تحديث حالة الحظر
    if (typeof isBanned === 'boolean') {
      updateData.isBanned = isBanned;
      updateData.banReason = isBanned ? (banReason || 'تم الحظر بواسطة الأدمن') : '';
    }

    // 2. تحديث الدور (Role)
    if (role && ['user', 'admin', 'publisher', 'advertiser'].includes(role)) {
      updateData.role = role;
    }

    // 3. التعديل المباشر للأرصدة
    if (typeof availableBalance === 'number') {
      updateData.availableBalance = Math.max(0, availableBalance);
    }
    if (typeof pendingBalance === 'number') {
      updateData.pendingBalance = Math.max(0, pendingBalance);
    }

    // 4. تعديل الرصيد بالنسبة (+ أو -)
    if (typeof balanceAdjustment === 'number' && balanceAdjustment !== 0) {
      const currentAvailable = updateData.availableBalance !== undefined ? updateData.availableBalance : user.availableBalance;
      if (adjustmentType === 'subtract') {
        updateData.availableBalance = Math.max(0, currentAvailable - balanceAdjustment);
      } else {
        updateData.availableBalance = currentAvailable + balanceAdjustment;
      }
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: updateData },
      { new: true, runValidators: true }
    );

    return res.status(200).json({
      success: true,
      message: 'تم تحديث بيانات المستخدم بنجاح',
      user: updatedUser
    });
  } catch (err) {
    logger.error('Error in updateUserStatus:', err);
    if (next) return next(err);
    return res.status(500).json({ success: false, error: 'خطأ في تحديث بيانات المستخدم' });
  }
};

/**
 * 3.1 جلب قائمة الإعلانات مع التصفية والصفحات
 */
const getAds = async (req, res, next) => {
  try {
    await connectDB();
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, parseInt(req.query.limit, 10) || 20);
    const skip = (page - 1) * limit;

    const { status, search } = req.query;
    const query = {};

    if (status) query.status = status;

    if (search) {
      const cleanSearch = String(search).trim();
      query.$or = [
        { title: { $regex: cleanSearch,$options: 'i' } },
        { description: { $regex: cleanSearch,$options: 'i' } }
      ];
    }

    const [ads, total] = await Promise.all([
      Ad.find(query)
        .populate('userId', 'telegramId username firstName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Ad.countDocuments(query)
    ]);

    return res.status(200).json({
      success: true,
      ads,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    logger.error('Error in getAds:', err);
    if (next) return next(err);
    return res.status(500).json({ success: false, error: 'خطأ في جلب الإعلانات' });
  }
};

/**
 * 3.2 مراجعة الإعلان (قبول، رفض مع السبب، تجميد أو إيقاف)
 */
const reviewAd = async (req, res, next) => {
  try {
    await connectDB();
    const { adId } = req.params;
    const { status, rejectionReason, adminNote } = req.body;

    const validStatuses = ['active', 'rejected', 'paused', 'frozen', 'pending'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'حالة الإعلان غير صالحة. الحالات المقبولة: active, rejected, paused, frozen, pending'
      });
    }

    const ad = await Ad.findById(adId);
    if (!ad) {
      return res.status(404).json({ success: false, error: 'الإعلان غير موجود' });
    }

    ad.status = status;
    if (status === 'rejected') {
      ad.rejectionReason = rejectionReason || 'تم رفض الإعلان لمخالفة الشروط والأحكام';
    }
    if (adminNote) {
      ad.adminNote = adminNote;
    }

    await ad.save();

    return res.status(200).json({
      success: true,
      message: `تم تغيير حالة الإعلان بنجاح إلى: ${status}`,
      ad
    });
  } catch (err) {
    logger.error('Error in reviewAd:', err);
    if (next) return next(err);
    return res.status(500).json({ success: false, error: 'خطأ في مراجعة الإعلان' });
  }
};

/**
 * 4.1 جلب طلبات السحب مع التصفية والصفحات
 */
const getWithdrawals = async (req, res, next) => {
  try {
    await connectDB();
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, parseInt(req.query.limit, 10) || 20);
    const skip = (page - 1) * limit;

    const { status } = req.query;
    const query = {};
    if (status) query.status = status;

    const [withdrawals, total] = await Promise.all([
      Withdraw.find(query)
        .populate('userId', 'telegramId username firstName lastName availableBalance')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Withdraw.countDocuments(query)
    ]);

    return res.status(200).json({
      success: true,
      withdrawals,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    logger.error('Error in getWithdrawals:', err);
    if (next) return next(err);
    return res.status(500).json({ success: false, error: 'خطأ في جلب طلبات السحب' });
  }
};

/**
 * 4.2 معالجة طلب السحب (موافقة أو رفض وإعادة المبلغ بحركة Atomic وحماية ضد التكرار)
 */
const processWithdrawal = async (req, res, next) => {
  try {
    await connectDB();
    const { withdrawalId } = req.params;
    const { action, status, rejectionReason, adminNote, txHash } = req.body;

    const targetStatus = status || (action === 'approve' ? 'completed' : action === 'reject' ? 'rejected' : null);

    if (!['approved', 'completed', 'rejected'].includes(targetStatus)) {
      return res.status(400).json({
        success: false,
        error: 'الإجراء غير صالح. يجب اختيار: completed, approved, أو rejected'
      });
    }

    // 1. فحص طلب السحب والتأكد من أنه في حالة معلقة (pending) لمنع تنفيذ العملية أكثر من مرة
    const withdrawal = await Withdraw.findById(withdrawalId);
    if (!withdrawal) {
      return res.status(404).json({ success: false, error: 'طلب السحب غير موجود' });
    }

    if (withdrawal.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: `عذراً، تمت معالجة هذا الطلب سابقاً وحالته الحالية هي: ${withdrawal.status}`
      });
    }

    // 2. حالة الرفض -> عملية ذريّة (Atomic Update) لإرجاع المبلغ فوراً
    if (targetStatus === 'rejected') {
      const updatedWithdrawal = await Withdraw.findOneAndUpdate(
        { _id: withdrawalId, status: 'pending' },
        {
          $set: {
            status: 'rejected',
            rejectionReason: rejectionReason || 'تم رفض طلب السحب من قبل الإدارة',
            adminNote: adminNote || '',
            processedAt: new Date()
          }
        },
        { new: true }
      );

      if (!updatedWithdrawal) {
        return res.status(400).json({
          success: false,
          error: 'تعذر معالجة الطلب، ربما تم التعديل عليه بواسطة أدمن آخر'
        });
      }

      // إرجاع المبلغ فوراً لحساب المستخدم بشكل آمن (Atomic Increment)
      await User.findByIdAndUpdate(withdrawal.userId, {
        $inc: { availableBalance: withdrawal.amount }
      });

      return res.status(200).json({
        success: true,
        message: 'تم رفض طلب السحب وإعادة المبلغ بنجاح إلى رصيد المستخدم المتاح',
        withdrawal: updatedWithdrawal
      });
    }

    // 3. حالة الموافقة/الإكمال -> القبول وتحديث بيانات المعاملة
    const updatedWithdrawal = await Withdraw.findOneAndUpdate(
      { _id: withdrawalId, status: 'pending' },
      {
        $set: {
          status: targetStatus,
          txHash: txHash || withdrawal.txHash,
          adminNote: adminNote || '',
          processedAt: new Date()
        }
      },
      { new: true }
    );

    if (!updatedWithdrawal) {
      return res.status(400).json({
        success: false,
        error: 'تعذر معالجة طلب السحب'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'تمت الموافقة على طلب السحب وتنفيذه بنجاح',
      withdrawal: updatedWithdrawal
    });
  } catch (err) {
    logger.error('Error in processWithdrawal:', err);
    if (next) return next(err);
    return res.status(500).json({ success: false, error: 'خطأ في معالجة طلب السحب' });
  }
};

/**
 * 5.1 جلب إعدادات النظام العامة
 */
const getSystemSettings = async (req, res, next) => {
  try {
    await connectDB();
    let settings = null;

    if (Setting) {
      settings = await Setting.findOne();
      if (!settings) {
        settings = await Setting.create({
          minWithdrawal: 5,
          cpmRate: 1.5,
          cpcRate: 0.05,
          referralReward: 0.1,
          adApprovalRequired: true,
          maintenanceMode: false
        });
      }
    } else {
      settings = {
        minWithdrawal: 5,
        cpmRate: 1.5,
        cpcRate: 0.05,
        referralReward: 0.1,
        adApprovalRequired: true,
        maintenanceMode: false
      };
    }

    return res.status(200).json({
      success: true,
      settings
    });
  } catch (err) {
    logger.error('Error in getSystemSettings:', err);
    if (next) return next(err);
    return res.status(500).json({ success: false, error: 'خطأ في جلب إعدادات النظام' });
  }
};

/**
 * 5.2 تحديث إعدادات النظام العامة
 */
const updateSystemSettings = async (req, res, next) => {
  try {
    await connectDB();
    const updateFields = req.body;

    let settings = null;
    if (Setting) {
      settings = await Setting.findOneAndUpdate(
        {},
        { $set: updateFields },
        { new: true, upsert: true, runValidators: true }
      );
    }

    return res.status(200).json({
      success: true,
      message: 'تم تحديث إعدادات النظام بنجاح',
      settings: settings || updateFields
    });
  } catch (err) {
    logger.error('Error in updateSystemSettings:', err);
    if (next) return next(err);
    return res.status(500).json({ success: false, error: 'خطأ في تحديث إعدادات النظام' });
  }
};

module.exports = {
  getDashboardStats,
  handleGetDashboardData: getDashboardStats, // متوافق مع اسم الدالة السابقة
  getUsers,
  updateUserStatus,
  getAds,
  reviewAd,
  getWithdrawals,
  processWithdrawal,
  getSystemSettings,
  updateSystemSettings
};
