/**
 * Admin Dashboard & System Control Controller
 */

const connectDB = require('../config/db');
const { User, Ad, Withdraw, Deposit, Link } = require('../models');

/**
 * Fetch Administrative Metrics Dashboard Controller
 */
const handleGetDashboardData = async (req, res, next) => {
  try {
    await connectDB();
    const [totalUsers, totalAds, pendingWithdraws, pendingDeposits, users, links, ads] = await Promise.all([
      User.countDocuments(),
      Ad.countDocuments({ status: 'active' }),
      Withdraw.find({ status: 'pending' })
        .populate('userId', 'telegramId username firstName')
        .sort({ createdAt: -1 })
        .lean(),
      Deposit.find({ status: 'pending' })
        .populate('userId', 'telegramId username firstName')
        .sort({ createdAt: -1 })
        .lean(),
      User.find().sort({ createdAt: -1 }).limit(50).lean(),
      Link.find().sort({ createdAt: -1 }).limit(50).lean(),
      Ad.find().sort({ createdAt: -1 }).limit(50).lean()
    ]);

    const totalPendingBalance = users.reduce((acc, u) => acc + (u.pendingBalance || 0), 0);

    return res.json({
      success: true,
      message: "تم جلب بيانات لوحة التحكم الإدارية",
      totalUsers,
      totalPendingBalance,
      stats: {
        totalUsers,
        activeAds: totalAds,
        pendingWithdrawsCount: pendingWithdraws.length,
        pendingDepositsCount: pendingDeposits.length
      },
      pendingWithdraws,
      pendingDeposits,
      users,
      links,
      ads
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Handle Admin Deposit Action (Approve / Reject)
 */
const handleDepositAction = async (req, res, next) => {
  try {
    await connectDB();
    const depositId = req.body.id || req.body.depositId;
    const action = req.body.action || req.params.action;

    if (!depositId) {
      return res.status(400).json({ success: false, message: "معرف الإيداع مطلوب" });
    }

    const deposit = await Deposit.findById(depositId);
    if (!deposit) {
      return res.status(404).json({ success: false, message: "طلب الإيداع غير موجود" });
    }

    if (action === 'approve') {
      deposit.status = 'approved';
      await deposit.save();

      await User.findByIdAndUpdate(deposit.userId, {
        $inc: { availableBalance: deposit.amount }
      });

      return res.json({ success: true, message: "تم قبول طلب الإيداع وإضافة الرصيد بنجاح" });
    } else {
      deposit.status = 'rejected';
      await deposit.save();
      return res.json({ success: true, message: "تم رفض طلب الإيداع" });
    }
  } catch (err) {
    next(err);
  }
};

/**
 * Handle Admin Withdraw Action (Approve / Reject)
 */
const handleWithdrawAction = async (req, res, next) => {
  try {
    await connectDB();
    const withdrawId = req.body.id || req.body.withdrawId;
    const action = req.body.action || req.params.action;

    if (!withdrawId) {
      return res.status(400).json({ success: false, message: "معرف السحب مطلوب" });
    }

    const withdraw = await Withdraw.findById(withdrawId);
    if (!withdraw) {
      return res.status(404).json({ success: false, message: "طلب السحب غير موجود" });
    }

    if (action === 'approve') {
      withdraw.status = 'completed';
      await withdraw.save();
      return res.json({ success: true, message: "تم تأكيد ودفع طلب السحب بنجاح" });
    } else {
      withdraw.status = 'rejected';
      await withdraw.save();

      await User.findByIdAndUpdate(withdraw.userId, {
        $inc: { availableBalance: withdraw.amount }
      });

      return res.json({ success: true, message: "تم رفض طلب السحب وإعادة الرصيد للمستخدم" });
    }
  } catch (err) {
    next(err);
  }
};

/**
 * Handle Generic Admin Action
 */
const handleGenericAdminAction = async (req, res, next) => {
  try {
    const { type, action } = req.params;
    if (type === 'deposit') {
      return handleDepositAction(req, res, next);
    } else if (type === 'withdraw') {
      return handleWithdrawAction(req, res, next);
    }
    return res.json({ success: true, message: `تم تنفيذ الإجراء ${action} على ${type}` });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  handleGetDashboardData,
  handleDepositAction,
  handleWithdrawAction,
  handleGenericAdminAction
};
