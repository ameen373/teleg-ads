/**
 * Admin Dashboard & System Control Router
 */

const express = require('express');
const router = express.Router();

const connectDB = require('../config/db');
const { adminMiddleware } = require('../middleware/auth');
const { User, Ad, Withdraw, Deposit } = require('../models');

/**
 * Fetch Administrative Metrics Dashboard
 */
router.get('/api/admin/dashboard-data', adminMiddleware, async (req, res, next) => {
  try {
    await connectDB();
    const [totalUsers, totalAds, pendingWithdraws, pendingDeposits] = await Promise.all([
      User.countDocuments(),
      Ad.countDocuments({ status: 'active' }),
      Withdraw.find({ status: 'pending' }).sort({ createdAt: -1 }).lean(),
      Deposit.find({ status: 'pending' }).sort({ createdAt: -1 }).lean()
    ]);

    res.json({
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
});

module.exports = router;
