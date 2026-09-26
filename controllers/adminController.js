/**
 * Admin Dashboard & System Control Controller
 * Handles administrative metrics, user management, and transactional approvals.
 */

const mongoose = require('mongoose');
const connectDB = require('../config/db');
const { User, Ad, Withdraw, Deposit } = require('../models');

/**
 * Helper function to safely format populated user objects for the frontend
 */
const formatPopulatedUser = (doc) => {
  if (!doc) return null;
  const rawUser = doc.userId || doc.user || {};
  const isPopulated = typeof rawUser === 'object' && rawUser !== null && rawUser._id;

  const userObj = {
    _id: isPopulated ? rawUser._id : (doc.userId || null),
    telegramId: isPopulated ? (rawUser.telegramId || 'N/A') : 'N/A',
    username: isPopulated ? (rawUser.username || 'غير محدد') : 'غير محدد',
    firstName: isPopulated ? (rawUser.firstName || 'مستخدم') : 'مستخدم',
    lastName: isPopulated ? (rawUser.lastName || '') : '',
    photoUrl: isPopulated ? (rawUser.photoUrl || '') : '',
    balance: isPopulated ? Number(rawUser.balance || 0) : 0,
    isBanned: isPopulated ? Boolean(rawUser.isBanned) : false,
    role: isPopulated ? (rawUser.role || 'user') : 'user'
  };

  return {
    ...doc,
    user: userObj,
    userId: userObj
  };
};

/**
 * Fetch Administrative Metrics Dashboard Controller
 */
const handleGetDashboardData = async (req, res, next) => {
  try {
    await connectDB();

    const [
      totalUsers,
      activeAds,
      pendingWithdrawsDocs,
      pendingDepositsDocs,
      totalDepositsAgg,
      totalWithdrawsAgg
    ] = await Promise.all([
      User.countDocuments(),
      Ad.countDocuments({ status: 'active' }),
      Withdraw.find({ status: 'pending' })
        .populate({
          path: 'userId',
          select: 'telegramId username firstName lastName photoUrl balance isBanned role'
        })
        .sort({ createdAt: -1 })
        .lean(),
      Deposit.find({ status: 'pending' })
        .populate({
          path: 'userId',
          select: 'telegramId username firstName lastName photoUrl balance isBanned role'
        })
        .sort({ createdAt: -1 })
        .lean(),
      Deposit.aggregate([
        { $match: { status: 'approved' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      Withdraw.aggregate([
        { $match: { status: 'approved' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ])
    ]);

    // Format records safely to guarantee user object visibility
    const pendingWithdraws = (pendingWithdrawsDocs || []).map(formatPopulatedUser);
    const pendingDeposits = (pendingDepositsDocs || []).map(formatPopulatedUser);

    const totalDepositsVolume = totalDepositsAgg[0]?.total || 0;
    const totalWithdrawsVolume = totalWithdrawsAgg[0]?.total || 0;

    return res.status(200).json({
      success: true,
      stats: {
        totalUsers,
        activeAds,
        pendingWithdrawsCount: pendingWithdraws.length,
        pendingDepositsCount: pendingDeposits.length,
        totalDepositsVolume,
        totalWithdrawsVolume
      },
      pendingWithdraws,
      pendingDeposits
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Fetch Paginated Users List Controller with Search and Filtering
 */
const handleGetUsers = async (req, res, next) => {
  try {
    await connectDB();

    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '20', 10)));
    const skip = (page - 1) * limit;

    const search = (req.query.search || '').trim();
    const filter = (req.query.filter || 'all').trim();

    const query = {};

    if (search) {
      const searchRegex = new RegExp(search, 'i');
      query.$or = [
        { username: searchRegex },
        { firstName: searchRegex },
        { lastName: searchRegex },
        { telegramId: searchRegex }
      ];
    }

    if (filter === 'banned') {
      query.isBanned = true;
    } else if (filter === 'active') {
      query.isBanned = false;
    } else if (filter === 'admin') {
      query.role = 'admin';
    }

    const [usersDoc, totalUsers] = await Promise.all([
      User.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(query)
    ]);

    const users = (usersDoc || []).map((u) => ({
      ...u,
      id: u._id,
      fullName: `${u.firstName || ''} ${u.lastName || ''}`.trim() || 'مستخدم بدون اسم',
      balance: Number(u.balance || 0),
      isBanned: Boolean(u.isBanned)
    }));

    return res.status(200).json({
      success: true,
      users,
      pagination: {
        totalUsers,
        currentPage: page,
        totalPages: Math.ceil(totalUsers / limit) || 1,
        limit
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Fetch Single User Details Controller
 */
const handleGetUserById = async (req, res, next) => {
  try {
    await connectDB();

    const { userId } = req.params;

    let query = {};
    if (mongoose.Types.ObjectId.isValid(userId)) {
      query = { _id: userId };
    } else {
      query = { telegramId: String(userId).trim() };
    }

    const user = await User.findOne(query).lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'المستخدم غير موجود'
      });
    }

    const [userDeposits, userWithdraws, userAdsCount] = await Promise.all([
      Deposit.find({ userId: user._id }).sort({ createdAt: -1 }).limit(10).lean(),
      Withdraw.find({ userId: user._id }).sort({ createdAt: -1 }).limit(10).lean(),
      Ad.countDocuments({ ownerId: user._id })
    ]);

    return res.status(200).json({
      success: true,
      user: {
        ...user,
        fullName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'مستخدم بدون اسم'
      },
      stats: {
        depositsCount: userDeposits.length,
        withdrawsCount: userWithdraws.length,
        adsCount: userAdsCount
      },
      recentDeposits: userDeposits,
      recentWithdraws: userWithdraws
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Update User Status & Balance Controller
 */
const handleUpdateUser = async (req, res, next) => {
  try {
    await connectDB();

    const { userId } = req.params;
    const { balance, isBanned, role } = req.body;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        error: 'معرف المستخدم غير صالحة'
      });
    }

    const updateData = {};

    if (typeof balance !== 'undefined' && !isNaN(Number(balance))) {
      updateData.balance = Number(balance);
    }

    if (typeof isBanned !== 'undefined') {
      updateData.isBanned = Boolean(isBanned);
    }

    if (role && ['user', 'admin'].includes(role)) {
      updateData.role = role;
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: updateData },
      { new: true, runValidators: true }
    ).lean();

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        error: 'لم يتم العثور على المستخدم'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'تم تحديث بيانات المستخدم بنجاح',
      user: updatedUser
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Approve or Reject Deposit Controller
 */
const handleActionDeposit = async (req, res, next) => {
  try {
    await connectDB();

    const { depositId } = req.params;
    const { action } = req.body; // 'approve' or 'reject'

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({
        success: false,
        error: 'الإجراء غير صالحة، يجب اختيار approve أو reject'
      });
    }

    const deposit = await Deposit.findById(depositId);
    if (!deposit) {
      return res.status(404).json({
        success: false,
        error: 'طلب الإيداع غير موجود'
      });
    }

    if (deposit.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: `تم معالجة هذا الطلب سابقاً وحالته الآن: ${deposit.status}`
      });
    }

    if (action === 'approve') {
      deposit.status = 'approved';
      await deposit.save();

      await User.findByIdAndUpdate(deposit.userId, {
        $inc: { balance: deposit.amount }
      });
    } else {
      deposit.status = 'rejected';
      await deposit.save();
    }

    return res.status(200).json({
      success: true,
      message: action === 'approve' ? 'تم قبول الإيداع وإضافة الرصيد بنجاح' : 'تم رفض طلب الإيداع',
      deposit
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Approve or Reject Withdrawal Controller
 */
const handleActionWithdraw = async (req, res, next) => {
  try {
    await connectDB();

    const { withdrawId } = req.params;
    const { action, note } = req.body; // 'approve' or 'reject'

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({
        success: false,
        error: 'الإجراء غير صالحة، يجب اختيار approve أو reject'
      });
    }

    const withdraw = await Withdraw.findById(withdrawId);
    if (!withdraw) {
      return res.status(404).json({
        success: false,
        error: 'طلب السحب غير موجود'
      });
    }

    if (withdraw.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: `تم معالجة هذا الطلب سابقاً وحالته الآن: ${withdraw.status}`
      });
    }

    if (action === 'approve') {
      withdraw.status = 'approved';
      if (note) withdraw.adminNote = note;
      await withdraw.save();
    } else {
      withdraw.status = 'rejected';
      if (note) withdraw.adminNote = note;
      await withdraw.save();

      // Return balance back to user upon rejection
      await User.findByIdAndUpdate(withdraw.userId, {
        $inc: { balance: withdraw.amount }
      });
    }

    return res.status(200).json({
      success: true,
      message: action === 'approve' ? 'تم الموافقة على طلب السحب' : 'تم رفض طلب السحب وإعادة الرصيد للمستخدم',
      withdraw
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  handleGetDashboardData,
  handleGetUsers,
  handleGetUserById,
  handleUpdateUser,
  handleActionDeposit,
  handleActionWithdraw
};
