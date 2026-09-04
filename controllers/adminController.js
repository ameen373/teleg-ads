// controllers/adminController.js
const mongoose = require('mongoose');
const User = require('../models/User');
const Link = require('../models/Link');
const Deposit = require('../models/Deposit');
const Withdrawal = require('../models/Withdrawal');

/**
 * 1. جلب إحصائيات لوحة التحكم
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
        {
          $group: {
            _id: null,
            total: {
              $sum: { $ifNull: ['$balances.totalEarned', '$totalEarned', 0] }
            }
          }
        }
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
 * 2. تأكيد صلاحيات الأدمن
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
 * 3 أ. جلب طلبات الإيداع المعلقة
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
      message: 'حدث خطأ أثناء جلب طلبات الإيداع المعلقة',
      error: error.message
    });
  }
};

/**
 * 3 ب. معالجة طلب الإيداع (قبول / رفض)
 */
const processDeposit = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const { status, rejectionReason } = req.body;

    if (!['approved', 'rejected'].includes(status)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'الحالة غير صالحة. يجب أن تكون approved أو rejected'
      });
    }

    const deposit = await Deposit.findById(id).session(session);
    if (!deposit) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: 'طلب الإيداع غير موجود'
      });
    }

    if (deposit.status !== 'pending') {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'تمت معالجة هذا الطلب مسبقاً'
      });
    }

    deposit.status = status;

    if (status === 'approved') {
      const user = await User.findById(deposit.userId).session(session);
      if (user) {
        if (user.balances) {
          user.balances.available = (user.balances.available || 0) + deposit.amount;
        } else {
          user.availableBalance = (user.availableBalance || 0) + deposit.amount;
        }
        await user.save({ session });
      }
    } else {
      deposit.rejectionReason = rejectionReason || 'تم رفض الإيداع من قبل الإدارة';
    }

    await deposit.save({ session });
    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      success: true,
      message: `تم ${status === 'approved' ? 'قبول' : 'رفض'} طلب الإيداع بنجاح`,
      data: deposit
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('[adminController: processDeposit Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء معالجة طلب الإيداع',
      error: error.message
    });
  }
};

/**
 * 4 أ. جلب طلبات السحب المعلقة
 */
const getPendingWithdrawals = async (req, res) => {
  try {
    const withdrawals = await Withdrawal.find({ status: 'pending' })
      .populate('userId', 'telegramId firstName username availableBalance balances')
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
 * 4 ب. معالجة طلب السحب (قبول / رفض مع إعادة الرصيد)
 */
const processWithdrawal = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const { status, rejectionReason } = req.body;

    if (!['approved', 'rejected'].includes(status)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'الحالة غير صالحة. يجب أن تكون approved أو rejected'
      });
    }

    const withdrawal = await Withdrawal.findById(id).session(session);
    if (!withdrawal) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: 'طلب السحب غير موجود'
      });
    }

    if (withdrawal.status !== 'pending') {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'تمت معالجة هذا الطلب مسبقاً'
      });
    }

    withdrawal.status = status;

    if (status === 'rejected') {
      withdrawal.rejectionReason = rejectionReason || 'تم رفض طلب السحب من قبل الإدارة';

      const user = await User.findById(withdrawal.userId).session(session);
      if (user) {
        if (user.balances) {
          user.balances.available = (user.balances.available || 0) + withdrawal.amount;
        } else {
          user.availableBalance = (user.availableBalance || 0) + withdrawal.amount;
        }
        await user.save({ session });
      }
    }

    await withdrawal.save({ session });
    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      success: true,
      message: `تم ${status === 'approved' ? 'قبول' : 'رفض'} طلب السحب بنجاح`,
      data: withdrawal
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
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
