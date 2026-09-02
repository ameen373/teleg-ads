// controllers/adminController.js
const User = require('../models/User');
const Link = require('../models/Link');
const Deposit = require('../models/Deposit');
const Withdrawal = require('../models/Withdrawal');

/**
 * 1. جلب إحصائيات عامة للنظام
 */
const getDashboardStats = async (req, res) => {
  try {
    const [
      totalUsers,
      totalLinks,
      pendingDepositsCount,
      pendingWithdrawalsCount,
      totalEarnedAgg
    ] = await Promise.all([
      User.countDocuments(),
      Link.countDocuments(),
      Deposit.countDocuments({ status: 'pending' }),
      Withdrawal.countDocuments({ status: 'pending' }),
      User.aggregate([
        { $group: { _id: null, total: { $sum: '$totalEarned' } } }
      ])
    ]);

    const totalEarnedSystem = totalEarnedAgg.length > 0 ? totalEarnedAgg[0].total : 0;

    return res.status(200).json({
      success: true,
      data: {
        totalUsers,
        totalLinks,
        pendingDepositsCount,
        pendingWithdrawalsCount,
        totalEarnedSystem
      }
    });
  } catch (error) {
    console.error('[adminController: getDashboardStats Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء جلب إحصائيات لوحة التحكم',
      error: error.message
    });
  }
};

/**
 * 2. التأكد من صلاحيات الآدمين للواجهة الأمامية
 */
const verifyAdmin = async (req, res) => {
  return res.status(200).json({
    success: true,
    isAdmin: true,
    user: {
      id: req.user._id,
      telegramId: req.user.telegramId,
      firstName: req.user.firstName,
      role: req.user.role
    }
  });
};

/**
 * 3 أ. جلب قائمة طلبات الإيداع المعلقة
 */
const getPendingDeposits = async (req, res) => {
  try {
    const deposits = await Deposit.find({ status: 'pending' })
      .populate('userId', 'telegramId firstName username')
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: deposits.length,
      data: deposits
    });
  } catch (error) {
    console.error('[adminController: getPendingDeposits Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء جلب طلباالإيداع المعلقة',
      error: error.message
    });
  }
};

/**
 * 3 ب. معالجة طلب الإيداع (قبول إضافة الرصيد / رفض)
 */
const processDeposit = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, rejectionReason } = req.body;

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'الحالة المحددة غير صالحة. يجب أن تكون approved أو rejected'
      });
    }

    const deposit = await Deposit.findById(id);
    if (!deposit) {
      return res.status(404).json({
        success: false,
        message: 'طلب الإيداع غير موجود'
      });
    }

    if (deposit.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'تمت معالجة هذا الطلب مسبقاً'
      });
    }

    deposit.status = status;

    if (status === 'approved') {
      // إضافة المبلغ لرصيد المستخدم المتاح للاستخدام في الإعلانات
      const user = await User.findById(deposit.userId);
      if (user) {
        user.availableBalance += deposit.amount;
        await user.save();
      }
    } else if (status === 'rejected') {
      deposit.rejectionReason = rejectionReason || 'تم رفض الإيداع من قبل الإدارة';
    }

    await deposit.save();

    return res.status(200).json({
      success: true,
      message: `تم ${status === 'approved' ? 'قبول' : 'رفض'} طلب الإيداع بنجاح`,
      data: deposit
    });
  } catch (error) {
    console.error('[adminController: processDeposit Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء معالجة طلب الإيداع',
      error: error.message
    });
  }
};

/**
 * 4 أ. جلب قائمة طلبات السحب المعلقة
 */
const getPendingWithdrawals = async (req, res) => {
  try {
    const withdrawals = await Withdrawal.find({ status: 'pending' })
      .populate('userId', 'telegramId firstName username availableBalance')
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: withdrawals.length,
      data: withdrawals
    });
  } catch (error) {
    console.error('[adminController: getPendingWithdrawals Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء جلب طلبات السحب المعلقة',
      error: error.message
    });
  }
};

/**
 * 4 ب. معالجة طلب السحب (قبول / رفض وإعادة الرصيد للمستخدم)
 */
const processWithdrawal = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, rejectionReason } = req.body;

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'الحالة المحددة غير صالحة. يجب أن تكون approved أو rejected'
      });
    }

    const withdrawal = await Withdrawal.findById(id);
    if (!withdrawal) {
      return res.status(404).json({
        success: false,
        message: 'طلب السحب غير موجود'
      });
    }

    if (withdrawal.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'تمت معالجة هذا الطلب مسبقاً'
      });
    }

    withdrawal.status = status;

    if (status === 'approved') {
      // السحب مقبول، وتم خصم المبلغ سابقاً عند إنشاء الطلب
    } else if (status === 'rejected') {
      withdrawal.rejectionReason = rejectionReason || 'تم رفض طلب السحب من قبل الإدارة';

      // إرجاع المبلغ الإجمالي المخصوم لسجل المستخدم
      const user = await User.findById(withdrawal.userId);
      if (user) {
        user.availableBalance += withdrawal.amount;
        await user.save();
      }
    }

    await withdrawal.save();

    return res.status(200).json({
      success: true,
      message: `تم ${status === 'approved' ? 'قبول' : 'رفض'} طلب السحب بنجاح`,
      data: withdrawal
    });
  } catch (error) {
    console.error('[adminController: processWithdrawal Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء معالجة طلب السحب',
      error: error.message
    });
  }
};

/**
 * 5. حظر أو فك حظر مستخدم
 */
const toggleUserBan = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'المستخدم غير موجود'
      });
    }

    // تبديل حالة الحظر
    user.isBanned = !user.isBanned;
    await user.save();

    return res.status(200).json({
      success: true,
      message: `تم ${user.isBanned ? 'حظر' : 'فك حظر'} المستخدم بنجاح`,
      data: {
        userId: user._id,
        telegramId: user.telegramId,
        isBanned: user.isBanned
      }
    });
  } catch (error) {
    console.error('[adminController: toggleUserBan Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء تغيير حالة حظر المستخدم',
      error: error.message
    });
  }
};

module.exports = {
  getDashboardStats,
  verifyAdmin,
  getPendingDeposits,
  processDeposit,
  getPendingWithdrawals,
  processWithdrawal,
  toggleUserBan
};
