// controllers/walletController.js
const Deposit = require('../models/Deposit');
const Withdrawal = require('../models/Withdrawal');
const User = require('../models/User');
const SYSTEM_CONSTANTS = require('../config/constants');

/**
 * تقديم طلب إيداع جديد لشحن رصيد الإعلانات
 */
const submitDeposit = async (req, res) => {
  try {
    const { amount, network, txHash } = req.body;

    if (!amount || !network || !txHash) {
      return res.status(400).json({
        success: false,
        message: 'جميع الحقول مطلوبة: amount, network, txHash'
      });
    }

    if (amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'يجب أن يكون مبلغ الإيداع أكبر من 0'
      });
    }

    const formattedNetwork = network.trim().toUpperCase();
    if (!['TRC20', 'BEP20'].includes(formattedNetwork)) {
      return res.status(400).json({
        success: false,
        message: 'الشبكة المحددة غير مدعومة. الشبكات المتاحة: TRC20, BEP20'
      });
    }

    // التحقق من عدم تكرار رمز المعاملة TxHash
    const existingDeposit = await Deposit.findOne({ txHash: txHash.trim() });
    if (existingDeposit) {
      return res.status(400).json({
        success: false,
        message: 'رمز المعاملة (txHash) تم استخدامه من قبل'
      });
    }

    // إنشاء طلب الإيداع بحالة معلقة pending
    const deposit = await Deposit.create({
      userId: req.user._id,
      amount: Number(amount),
      network: formattedNetwork,
      txHash: txHash.trim(),
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
 * تقديم طلب سحب الأرباح
 */
const requestWithdrawal = async (req, res) => {
  try {
    const { amount, walletAddress } = req.body;

    if (!amount || !walletAddress) {
      return res.status(400).json({
        success: false,
        message: 'يرجى تحديد المبلغ وعنوان المحفظة'
      });
    }

    const requestedAmount = Number(amount);

    // 1. الفحص: أن المبلغ لا يقل عن الحد الأدنى للسحب ($30)
    if (requestedAmount < SYSTEM_CONSTANTS.MIN_WITHDRAWAL_AMOUNT) {
      return res.status(400).json({
        success: false,
        message: `الحد الأدنى للسحب هو $${SYSTEM_CONSTANTS.MIN_WITHDRAWAL_AMOUNT}`
      });
    }

    // إعادة جلب بيانات المستخدم لضمان مطابقة الرصيد
    const user = await User.findById(req.user._id);

    // 2. الفحص: أن الرصيد المتاح يغطي المبلغ المطلوب
    if (user.availableBalance < requestedAmount) {
      return res.status(400).json({
        success: false,
        message: 'رصيدك المتاح غير كافٍ لإتمام عملية السحب'
      });
    }

    // 3. احتساب العمولة والصافي (نسبة خصم السحب 3%)
    const feeDeducted = requestedAmount * SYSTEM_CONSTANTS.WITHDRAWAL_FEE_PERCENT;
    const netAmount = requestedAmount - feeDeducted;

    // 4. خصم المبلغ فوراً من الرصيد المتاح للمستخدم
    user.availableBalance -= requestedAmount;
    await user.save();

    // 5. إنشاء سجل في جدول السحوبات بحالة pending
    const withdrawal = await Withdrawal.create({
      userId: user._id,
      amount: requestedAmount,
      feeDeducted: feeDeducted,
      netAmount: netAmount,
      walletAddress: walletAddress.trim(),
      status: 'pending'
    });

    return res.status(201).json({
      success: true,
      message: 'تم تقديم طلب السحب بنجاح وخصم المبلغ من رصيدك المتاح وهو قيد المعالجة',
      data: withdrawal
    });
  } catch (error) {
    console.error('[walletController: requestWithdrawal Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء تقديم طلب السحب',
      error: error.message
    });
  }
};

/**
 * جلب سجل جميع عمليات الإيداع والسحب الخاصة بالمستخدم
 */
const getTransactionHistory = async (req, res) => {
  try {
    const userId = req.user._id;

    // جلب عمليات الإيداع والسحب بالتوازي
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

