const mongoose = require('mongoose');
const crypto = require('crypto');
const { CONFIG } = require('../config/config');
const connectDB = require('../config/db');
const logger = require('../utils/logger');
const { sendTelegramNotification } = require('../utils/helpers');
const { User, Deposit, Withdraw } = require('../models');

const handleDeposit = async (req, res, next) => {
  try {
    await connectDB();
    const bodyData = req.body || {};
    const queryData = req.query || {};

    const amount = bodyData.amount !== undefined ? bodyData.amount : queryData.amount;
    const network = bodyData.network !== undefined ? bodyData.network : queryData.network;
    const txid = bodyData.txid !== undefined ? bodyData.txid : (bodyData.txId !== undefined ? bodyData.txId : (bodyData.txHash !== undefined ? bodyData.txHash : (queryData.txid !== undefined ? queryData.txid : (queryData.txId || queryData.txHash))));
    const explicitUserId = bodyData.userId || bodyData.user_id || queryData.userId || queryData.user_id || bodyData.telegram_id || queryData.telegram_id;

    const numAmount = Number(amount);
    const cleanNetwork = String(network || '').toUpperCase();
    let cleanTxid = String(txid || '').trim();

    if (amount === undefined || amount === null || amount === '' || isNaN(numAmount) || numAmount < 1) {
      return res.status(400).json({ success: false, error: 'المبلغ مطلوب والحد الأدنى للإيداع هو $1' });
    }

    if (!['BEP20', 'TRC20', 'TON'].includes(cleanNetwork)) {
      return res.status(400).json({ success: false, error: 'يرجى تحديد شبكة صالحة (BEP20, TRC20, TON)' });
    }

    if (!cleanTxid || cleanTxid === 'null' || cleanTxid === 'undefined' || cleanTxid === '' || cleanTxid === 'NaN') {
      cleanTxid = 'DEP_' + Date.now() + '_' + crypto.randomBytes(6).toString('hex');
    } else if (cleanTxid.length < 3) {
      return res.status(400).json({ success: false, error: 'معرف المعاملة (TxID / TxHash) غير صالح' });
    }

    let targetUserId = req.userId;
    if (explicitUserId) {
      const cleanExplicitId = String(explicitUserId).trim();
      if (cleanExplicitId && cleanExplicitId !== 'null' && cleanExplicitId !== 'undefined' && cleanExplicitId !== 'NaN') {
        if (mongoose.Types.ObjectId.isValid(cleanExplicitId)) {
          const foundById = await User.findById(cleanExplicitId);
          if (foundById) targetUserId = foundById._id;
        } else {
          const foundByTg = await User.findOne({ telegramId: cleanExplicitId });
          if (foundByTg) targetUserId = foundByTg._id;
        }
      }
    }

    if (!targetUserId || !mongoose.Types.ObjectId.isValid(targetUserId)) {
      return res.status(400).json({ success: false, error: 'معرف المستخدم (userId) مطلوب أو غير صالح' });
    }

    const userObj = req.user && String(req.user._id) === String(targetUserId) ? req.user : await User.findById(targetUserId);
    if (!userObj) {
      return res.status(404).json({ success: false, error: 'المستخدم غير موجود في قاعدة البيانات' });
    }

    let deposit = null;
    let attempts = 0;
    while (attempts < 3) {
      try {
        const existingDeposit = await Deposit.findOne({ txid: cleanTxid });
        if (existingDeposit) {
          cleanTxid = 'DEP_' + Date.now() + '_' + crypto.randomBytes(6).toString('hex');
        }

        deposit = await Deposit.create({
          userId: targetUserId,
          advertiserId: targetUserId,
          advertiserTelegramId: userObj.telegramId,
          amount: numAmount,
          network: cleanNetwork,
          txid: cleanTxid,
          status: 'pending'
        });
        break;
      } catch (dbErr) {
        if (dbErr.code === 11000) {
          cleanTxid = 'DEP_' + Date.now() + '_' + crypto.randomBytes(6).toString('hex');
          attempts++;
          if (attempts >= 3) {
            return res.status(400).json({ success: false, error: 'معرف المعاملة (TxID) مسجل مسبقاً، يرجى التأكد من صحة البيانات' });
          }
        } else {
          throw dbErr;
        }
      }
    }

    const adminTgId = CONFIG.ADMIN_ID;
    if (adminTgId) {
      sendTelegramNotification(
        adminTgId,
        `💳 <b>طلب إيداع جديد!</b>\nالمستخدم: <code>${userObj.username || targetUserId}</code>\nالمبلغ: <code>$${numAmount}</code>\nالشبكة: <code>${cleanNetwork}</code>\nTxID: <code>${cleanTxid}</code>`
      );
    }

    return res.json({ success: true, deposit });
  } catch (err) {
    logger.error('Error in handleDeposit:', err);
    return res.status(500).json({ success: false, error: err.message || 'حدث خطأ داخلي أثناء معالجة طلب الإيداع' });
  }
};

const handleWithdraw = async (req, res, next) => {
  await connectDB();
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const { amount, network, walletAddress } = req.body;
    const numAmt = Number(amount);
    const cleanNetwork = String(network || '').toUpperCase();
    const cleanWallet = String(walletAddress || '').trim();
    const targetUserId = req.userId;
    const FEE = 3;

    if (isNaN(numAmt) || numAmt < 30) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, error: 'الحد الأدنى بالسحب هو $30' });
    }

    if (!['BEP20', 'TRC20', 'TON'].includes(cleanNetwork)) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, error: 'يرجى تحديد الشبكة (BEP20, TRC20, TON)' });
    }

    if (!cleanWallet || cleanWallet.length < 10) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, error: 'عنوان المحفظة غير صالح' });
    }

    const activePending = await Withdraw.findOne({ userId: targetUserId, status: 'pending' }).session(session);
    if (activePending) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, error: 'لديك طلب سحب قيد الانتظار حالياً، يرجى الانتظار حتى معالجته' });
    }

    const netAmount = numAmt - FEE;

    const updatedUser = await User.findOneAndUpdate(
      { _id: targetUserId, availableBalance: { $gte: numAmt } },
      { $inc: { availableBalance: -numAmt }, defaultWallet: cleanWallet },
      { new: true, session }
    );

    if (!updatedUser) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, error: 'رصيدك المتاح لا يكفي لإتمام عملية السحب' });
    }

    const withdrawRequest = await Withdraw.create([{
      userId: targetUserId,
      telegramId: req.user.telegramId,
      amount: numAmt,
      fee: FEE,
      netAmount: netAmount,
      network: cleanNetwork,
      walletAddress: cleanWallet,
      status: 'pending'
    }], { session });

    await session.commitTransaction();

    sendTelegramNotification(
      req.user.telegramId,
      `🔔 <b>تم تقديم طلب السحب بنجاح!</b>\nالمبلغ: <code>$${numAmt}</code>\nالرسوم: <code>$${FEE}</code>\nالصافي: <code>$${netAmount}</code>\nالشبكة: <code>${cleanNetwork}</code>\nالمحفظة: <code>${cleanWallet}</code>\nالحالة: ⏳ قيد المراجعة\n\nالدعم: ${CONFIG.SUPPORT_USERNAME}`
    );

    res.json({ success: true, withdraw: withdrawRequest[0] });
  } catch (err) {
    await session.abortTransaction();
    next(err);
  } finally {
    session.endSession();
  }
};

const getTransactions = async (req, res, next) => {
  try {
    await connectDB();
    const targetUserId = req.userId;
    const [deposits, withdraws] = await Promise.all([
      Deposit.find({ userId: targetUserId }).sort({ createdAt: -1 }).lean(),
      Withdraw.find({ userId: targetUserId }).sort({ createdAt: -1 }).lean()
    ]);

    res.json({ success: true, deposits, withdraws });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  handleDeposit,
  handleWithdraw,
  getTransactions
};
