/**
 * Admin Dashboard & System Control Controller
 */

const connectDB = require('../config/db');
const { User, Ad, Withdraw, Deposit } = require('../models');

/**
 * Fetch Administrative Metrics Dashboard Controller
 */
const handleGetDashboardData = async (req, res, next) => {
  try {
    await connectDB();
    const [totalUsers, totalAds, pendingWithdraws, pendingDeposits] = await Promise.all([
      User.countDocuments(),
      Ad.countDocuments({ status: 'active' }),
      Withdraw.find({ status: 'pending' })
        .populate('userId', 'telegramId username firstName')
        .sort({ createdAt: -1 })
        .lean(),
      Deposit.find({ status: 'pending' })
        .populate('userId', 'telegramId username firstName')
        .sort({ createdAt: -1 })
        .lean()
    ]);

    return res.json({
      success: true,
      stats: {
        totalUsers,
        activeAds: totalAds,
        pendingWithdrawsCount: pendingWithdraws.length,
        pendingDepositsCount: pendingDeposits.length
      },
      pendingWithdraws,
      pendingDeposits
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  handleGetDashboardData
};
