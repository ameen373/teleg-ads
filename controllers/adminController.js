/**
 * Admin Dashboard & System Control Controller
 * Handles administrative metrics, user management, financial approvals, and ad operations.
 * 
 * @file controllers/adminController.js
 */

const mongoose = require('mongoose');
const connectDB = require('../config/db');
const { User, Ad, Withdraw, Deposit } = require('../models');

/**
 * 1. جلب إحصائيات لوحة التحكم والعمليات المعلقة
 * GET /api/admin/dashboard
 */
const handleGetDashboardData = async (req, res, next) => {
  try {
    await connectDB();

    const [
      totalUsers,
      bannedUsersCount,
      activeAdsCount,
      pendingAdsCount,
      pendingWithdraws,
      pendingDeposits,
      financialStats
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ isBanned: true }),
      Ad.countDocuments({ status: 'active' }),
      Ad.countDocuments({ status: 'pending' }),
      Withdraw.find({ status: 'pending' })
        .populate('userId', 'telegramId username firstName balance')
        .sort({ createdAt: -1 })
        .lean(),
      Deposit.find({ status: 'pending' })
        .populate('userId', 'telegramId username firstName balance')
        .sort({ createdAt: -1 })
        .lean(),
      // تجميع إجمالي الإيداعات والسحوبات المكتملة
      Promise.all([
        Deposit.aggregate([
          { $match: { status: 'completed' } },
          { $group: { _id: null, total: { $sum: '$amount' } } }
        ]),
        Withdraw.aggregate([
          { $match: { status: 'approved' } },
          { $group: { _id: null, total: { $sum: '$amount' } } }
        ])
      ])
    ]);

    const totalDepositsVolume = financialStats[0][0]?.total || 0;
    const totalWithdrawsVolume = financialStats[1][0]?.total || 0;

    return res.json({
      success: true,
      stats: {
        totalUsers,
        bannedUsersCount,
        activeAdsCount,
        pendingAdsCount,
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
 * 2. جلب قائمة المستخدمين مع الترقيم والبحث والفلترة
 * GET /api/admin/users
 */
const handleGetUsers = async (req, res, next) => {
  try {
    await connectDB();

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const { search, isBanned, role } = req.query;
    const filter = {};

    if (search) {
      const searchRegex = new RegExp(search.trim(), 'i');
      filter.$or = [
        { telegramId: searchRegex },
        { username: searchRegex },
        { firstName: searchRegex }
      ];
    }

    if (isBanned !== undefined && isBanned !== '') {
      filter.isBanned = isBanned === 'true';
    }

    if (role) {
      filter.role = role;
    }

    const [users, total] = await Promise.all([
      User.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(filter)
    ]);

    return res.json({
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
    next(err);
  }
};

/**
 * 3. تعديل رصيد مستخدم يدويًا (إضافة / خصم)
 * POST /api/admin/users/adjust-balance
 */
const handleAdjustUserBalance = async (req, res, next) => {
  try {
    await connectDB();

    const { userId, amount, action, reason } = req.body;

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ success: false, error: 'معرف المستخدم غير صالح' });
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ success: false, error: 'يرجى إدخال مبلغ صحيح أكبر من الصفر' });
    }

    const adjustment = action === 'deduct' ? -parsedAmount : parsedAmount;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });
    }

    if (action === 'deduct' && user.balance < parsedAmount) {
      return res.status(400).json({ success: false, error: 'رصيد المستخدم غير كافٍ لعملية الخصم' });
    }

    user.balance += adjustment;
    await user.save();

    return res.json({
      success: true,
      message: `تم ${action === 'deduct' ? 'خصم' : 'إضافة'} المبلغ بنجاح`,
      newBalance: user.balance,
      user
    });
  } catch (err) {
    next(err);
  }
};

/**
 * 4. حظر أو إلغاء حظر مستخدم
 * POST /api/admin/users/toggle-ban
 */
const handleToggleUserBan = async (req, res, next) => {
  try {
    await connectDB();

    const { userId, banReason } = req.body;

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ success: false, error: 'معرف المستخدم غير صالح' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });
    }

    user.isBanned = !user.isBanned;
    if (user.isBanned && banReason) {
      user.banReason = banReason;
    } else if (!user.isBanned) {
      user.banReason = undefined;
    }

    await user.save();

    return res.json({
      success: true,
      message: user.isBanned ? 'تم حظر المستخدم بنجاح' : 'تم إلغاء حظر المستخدم بنجاح',
      isBanned: user.isBanned
    });
  } catch (err) {
    next(err);
  }
};

/**
 * 5. الموافقة على طلب السحب
 * POST /api/admin/withdraws/approve
 */
const handleApproveWithdrawal = async (req, res, next) => {
  try {
    await connectDB();

    const { withdrawId, transactionHash, notes } = req.body;

    if (!withdrawId || !mongoose.Types.ObjectId.isValid(withdrawId)) {
      return res.status(400).json({ success: false, error: 'معرف طلب السحب غير صالح' });
    }

    const withdrawal = await Withdraw.findById(withdrawId);
    if (!withdrawal) {
      return res.status(404).json({ success: false, error: 'طلب السحب غير موجود' });
    }

    if (withdrawal.status !== 'pending') {
      return res.status(400).json({ success: false, error: `الطلب معالج سابقًا بحالة: ${withdrawal.status}` });
    }

    withdrawal.status = 'approved';
    withdrawal.processedAt = new Date();
    if (transactionHash) withdrawal.txHash = transactionHash;
    if (notes) withdrawal.adminNotes = notes;

    await withdrawal.save();

    return res.json({
      success: true,
      message: 'تمت الموافقة على طلب السحب بنجاح',
      withdrawal
    });
  } catch (err) {
    next(err);
  }
};

/**
 * 6. رفض طلب السحب وإعادة المبلغ لرصيد المستخدم
 * POST /api/admin/withdraws/reject
 */
const handleRejectWithdrawal = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    await connectDB();

    const { withdrawId, rejectionReason } = req.body;

    if (!withdrawId || !mongoose.Types.ObjectId.isValid(withdrawId)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, error: 'معرف طلب السحب غير صالح' });
    }

    const withdrawal = await Withdraw.findById(withdrawId).session(session);
    if (!withdrawal) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, error: 'طلب السحب غير موجود' });
    }

    if (withdrawal.status !== 'pending') {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, error: `الطلب معالج سابقًا بحالة: ${withdrawal.status}` });
    }

    // تعديل حالة الطلب إلى مرفوض
    withdrawal.status = 'rejected';
    withdrawal.rejectionReason = rejectionReason || 'تم رفض الطلب بواسطة الإدارة';
    withdrawal.processedAt = new Date();
    await withdrawal.save({ session });

    // إعادة الرصيد المخصوم لرد الحساب
    await User.findByIdAndUpdate(
      withdrawal.userId,
      { $inc: { balance: withdrawal.amount } },
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    return res.json({
      success: true,
      message: 'تم رفض طلب السحب وإعادة المبلغ لرصيد المستخدم',
      withdrawal
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    next(err);
  }
};

/**
 * 7. الموافقة على الإيداع وإضافة الرصيد للمستخدم
 * POST /api/admin/deposits/approve
 */
const handleApproveDeposit = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    await connectDB();

    const { depositId, notes } = req.body;

    if (!depositId || !mongoose.Types.ObjectId.isValid(depositId)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, error: 'معرف طلب الإيداع غير صالح' });
    }

    const deposit = await Deposit.findById(depositId).session(session);
    if (!deposit) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, error: 'طلب الإيداع غير موجود' });
    }

    if (deposit.status !== 'pending') {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, error: `الطلب معالج سابقًا بحالة: ${deposit.status}` });
    }

    deposit.status = 'completed';
    deposit.processedAt = new Date();
    if (notes) deposit.adminNotes = notes;
    await deposit.save({ session });

    // إضافة مبلغ الإيداع لرصيد المستخدم
    await User.findByIdAndUpdate(
      deposit.userId,
      { $inc: { balance: deposit.amount } },
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    return res.json({
      success: true,
      message: 'تمت الموافقة على الإيداع وإضافة الرصيد لحساب المستخدم بنجاح',
      deposit
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    next(err);
  }
};

/**
 * 8. رفض طلب الإيداع
 * POST /api/admin/deposits/reject
 */
const handleRejectDeposit = async (req, res, next) => {
  try {
    await connectDB();

    const { depositId, rejectionReason } = req.body;

    if (!depositId || !mongoose.Types.ObjectId.isValid(depositId)) {
      return res.status(400).json({ success: false, error: 'معرف طلب الإيداع غير صالح' });
    }

    const deposit = await Deposit.findById(depositId);
    if (!deposit) {
      return res.status(404).json({ success: false, error: 'طلب الإيداع غير موجود' });
    }

    if (deposit.status !== 'pending') {
      return res.status(400).json({ success: false, error: `الطلب معالج سابقًا بحالة: ${deposit.status}` });
    }

    deposit.status = 'rejected';
    deposit.rejectionReason = rejectionReason || 'تم رفض الإيداع بواسطة الإدارة';
    deposit.processedAt = new Date();

    await deposit.save();

    return res.json({
      success: true,
      message: 'تم رفض طلب الإيداع بنجاح',
      deposit
    });
  } catch (err) {
    next(err);
  }
};

/**
 * 9. إدارة الإعلانات (مراجعة، قبول، رفض، تغيير الحالة)
 * POST /api/admin/ads/update-status
 */
const handleUpdateAdStatus = async (req, res, next) => {
  try {
    await connectDB();

    const { adId, status, rejectionReason } = req.body;

    if (!adId || !mongoose.Types.ObjectId.isValid(adId)) {
      return res.status(400).json({ success: false, error: 'معرف الإعلان غير صالح' });
    }

    const allowedStatuses = ['active', 'paused', 'completed', 'rejected', 'pending'];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: 'حالة الإعلان غير صالحة' });
    }

    const ad = await Ad.findById(adId);
    if (!ad) {
      return res.status(404).json({ success: false, error: 'الإعلان غير موجود' });
    }

    ad.status = status;
    if (status === 'rejected' && rejectionReason) {
      ad.rejectionReason = rejectionReason;
    }

    await ad.save();

    return res.json({
      success: true,
      message: `تم تحديث حالة الإعلان إلى (${status}) بنجاح`,
      ad
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  handleGetDashboardData,
  handleGetUsers,
  handleAdjustUserBalance,
  handleToggleUserBan,
  handleApproveWithdrawal,
  handleRejectWithdrawal,
  handleApproveDeposit,
  handleRejectDeposit,
  handleUpdateAdStatus
};
