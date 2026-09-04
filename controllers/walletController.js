// controllers/walletController.js
const mongoose = require('mongoose');
const Deposit = require('../models/Deposit');
const Withdrawal = require('../models/Withdrawal');
const User = require('../models/User');
const SYSTEM_CONSTANTS = require('../config/constants');

/**
 * تقديم طلب إيداع جديد
 */
const submitDeposit = async (req, res) => {
  try {
    const { amount, network, txHash } = req.body;

    if (!amount || !txHash) {
      return res.status(400).json({
        success: false,
        message: 'المبلغ ورمز المعاملة (txHash) مطلوبان'
      });
    }

    const depositAmount = Number(amount);
    if (isNaN(depositAmount) || depositAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'يجب أن يكون مبلغ الإيداع رقماً موجباً'
      });
    }

    const formattedNetwork = network ? network.trim().toUpperCase() : 'TRC20';
    const cleanTxHash = txHash.trim();

    const existingDeposit = await Deposit.findOne({ txHash: cleanTxHash });
    if (existingDeposit) {
      return res.status(400).json({
        success: false,
        message: 'رمز المعاملة (txHash) تم استخدامه من قبل'
      });
    }

    const deposit = await Deposit.create({
      userId: req.user._id,
      amount: depositAmount,
      network: formattedNetwork,
      txHash: cleanTxHash,
      status: 'pending'
    });

    return res.status(201).json({
      success: true,
      message: 'تم تقديم طلب الإيداع بنجاح وهو قيد المراجعة',
      data: deposit
    });
  } catch (error) {
    console.error('[walletController: submitDeposit Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء تقديم طلب الإيداع',
      error: error.message
    });
  }
};

/**
 * تقديم طلب سحب الأرباح باستخدام Transaction لمنع السحب المزدوج
 */
const requestWithdrawal = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { amount, walletAddress } = req.body;

    if (!amount || !walletAddress) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'يرجى تحديد المبلغ وعنوان المحفظة'
      });
    }

    const requestedAmount = Number(amount);
    const minWithdrawal = SYSTEM_CONSTANTS.MIN_WITHDRAWAL_AMOUNT || 30;

    if (requestedAmount < minWithdrawal) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: `الحد الأدنى للسحب هو $${minWithdrawal}`
      });
    }

    const user = await User.findById(req.user._id).session(session);
    const available = user.balances?.available ?? user.availableBalance ?? 0;

    if (available < requestedAmount) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'رصيدك المتاح غير كافٍ لإتمام عملية السحب'
      });
    }

    const feePercent = SYSTEM_CONSTANTS.WITHDRAWAL_FEE_PERCENT || 0.03;
    const feeDeducted = requestedAmount * feePercent;
    const netAmount = requestedAmount - feeDeducted;

    if (user.balances) {
      user.balances.available -= requestedAmount;
    } else {
      user.availableBalance -= requestedAmount;
    }
    await user.save({ session });

    const withdrawal = await Withdrawal.create(
      [
        {
          userId: user._id,
          amount: requestedAmount,
          feeDeducted,
          netAmount,
          walletAddress: walletAddress.trim(),
          status: 'pending'
        }
      ],
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    return res.status(201).json({
      success: true,
      message: 'تم تقديم طلب السحب بنجاح وخصم المبلغ من رصيدك المتاح وهو قيد المعالجة',
      data: withdrawal[0]
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('[walletController: requestWithdrawal Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء تقديم طلب السحب',
      error: error.message
    });
  }
};

/**
 * جلب سجل عمليات الإيداع والسحب
 */
const getTransactionHistory = async (req, res) => {
  try {
    const userId = req.user._id;

    const [deposits, withdrawals] = await Promise.all([
      Deposit.find({ userId }).sort({ createdAt: -1 }),
      Withdrawal.find({ userId }).sort({ createdAt: -1 })
    ]);

    return res.status(200).json({
      success: true,
      data: {
        deposits,
        withdrawals
      }
    });
  } catch (error) {
    console.error('[walletController: getTransactionHistory Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء جلب سجل المعاملات',
      error: error.message
    });
  }
};

module.exports = {
  submitDeposit,
  requestWithdrawal,
  getTransactionHistory
};
