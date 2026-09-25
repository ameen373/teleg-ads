/**
 * User Account, Referrals, Deposits & Withdrawals Controller
 */

const mongoose = require('mongoose');
const crypto = require('crypto');

const CONFIG = require('../config/config');
const logger = require('../config/logger');
const connectDB = require('../config/db');
const { sendTelegramNotification } = require('../utils/telegram');
const { buildShortUrl } = require('../utils/urlHelpers');
const { User, Ad, Link, Withdraw, Deposit, Announcement } = require('../models');

/**
 * Isolated User Dashboard Data Controller
 */
const handleUserData = async (req, res, next) => {
  try {
    await connectDB();
    const targetUserId = req.userId;
    const targetTgId = req.user ? req.user.telegramId : null;

    const queryConditions = [];
    if (targetUserId) queryConditions.push({ userId: targetUserId });
    if (targetTgId) queryConditions.push({ publisherTelegramId: String(targetTgId) }, { telegramId: String(targetTgId) });

    const [rawLinks, withdraws, announcements, ads, deposits, referralsCount] = await Promise.all([
      Link.find(queryConditions.length > 0 ? { $or: queryConditions } : { userId: targetUserId }).sort({ createdAt: -1 }).lean(),
      Withdraw.find({ userId: targetUserId }).sort({ createdAt: -1 }).lean(),
      Announcement.find({ $or: [{ isGlobal: true }, { targetUserId: targetUserId }] }).sort({ createdAt: -1 }).lean(),
      Ad.find({ userId: targetUserId }).sort({ createdAt: -1 }).lean(),
      Deposit.find({ userId: targetUserId }).sort({ createdAt: -1 }).lean(),
      User.countDocuments({ referredBy: targetUserId })
    ]);

    const links = rawLinks.map(link => {
      const totalViews = link.views || 0;
      const validImp = link.validImpressions || 0;
      const invalidImp = link.invalidImpressions || 0;
      const ctr = totalViews > 0 ? ((validImp / totalViews) * 100).toFixed(1) : "0.0";
      return { 
        ...link, 
        id: link._id,
        ctr, 
        validImpressions: validImp, 
        invalidImpressions: invalidImp,
        shortUrl: link.shortUrl || buildShortUrl(link.shortCode)
      };
    });

    const isAdmin = Boolean(CONFIG.ADMIN_ID && String(req.user.telegramId).trim() === CONFIG.ADMIN_ID);
    return res.json({ 
      success: true,
      userId: targetUserId,
      user: {
        ...req.user.toObject(),
        referralsCount
      }, 
      language: req.user.language || CONFIG.DEFAULT_LANGUAGE,
      links, 
      withdraws, 
      announcements, 
      ads, 
      deposits, 
      referralsCount,
      isAdmin,
      botUsername: CONFIG.BOT_USERNAME,
      supportUsername: CONFIG.SUPPORT_USERNAME,
      botUrl: CONFIG.OFFICIAL_BOT_URL,
      officialChannelUrl: CONFIG.OFFICIAL_CHANNEL_URL,
      supportUrl: CONFIG.TELEGRAM_SUPPORT_URL,
      depositWallets: {
        bep20: CONFIG.DEPOSIT_USDT_BEP20,
        trc20: CONFIG.DEPOSIT_USDT_TRC20
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Referral System Metrics Controller
 */
const handleUserReferrals = async (req, res, next) => {
  try {
    await connectDB();
    const targetUserId = req.userId;
    const referrals = await User.find({ referredBy: targetUserId })
      .select('username telegramId referralEarnings createdAt')
      .sort({ createdAt: -1 })
      .lean();

    const referralLink = `${CONFIG.OFFICIAL_BOT_URL}?start=${req.user.telegramId}`;

    return res.json({
      success: true,
      referralsCount: referrals.length,
      referralEarnings: req.user.referralEarnings || 0,
      referralLink,
      referrals
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Deposit Creation Request Controller
 */
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

/**
 * Withdrawal Processing Request Controller
 */
const handleWithdraw = async (req, res, next) => {
  await connectDB();
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const { amount, walletAddress, network } = req.body;
    const numAmount = Number(amount);

    if (isNaN(numAmount) || numAmount < CONFIG.MIN_WITHDRAWAL_AMOUNT) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        error: `الحد الأدنى للسحب هو $${CONFIG.MIN_WITHDRAWAL_AMOUNT}`
      });
    }

    if (!walletAddress || String(walletAddress).trim().length < 5) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, error: 'عنوان المحفظة غير صالح' });
    }

    const targetUserId = req.userId;
    const updatedUser = await User.findOneAndUpdate(
      { _id: targetUserId, availableBalance: { $gte: numAmount } },
      { $inc: { availableBalance: -numAmount } },
      { new: true, session }
    );

    if (!updatedUser) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, error: 'رصيدك المتاح غير كافي لإتمام عملية السحب' });
    }

    const withdraw = await Withdraw.create([{
      userId: targetUserId,
      telegramId: req.user.telegramId,
      amount: numAmount,
      walletAddress: String(walletAddress).trim(),
      network: network ? String(network).toUpperCase() : 'BEP20',
      status: 'pending'
    }], { session });

    await session.commitTransaction();

    const adminTgId = CONFIG.ADMIN_ID;
    if (adminTgId) {
      sendTelegramNotification(
        adminTgId,
        `💸 <b>طلب سحب جديد!</b>\nالمستخدم: <code>${req.user.username || targetUserId}</code>\nالمبلغ: <code>$${numAmount}</code>\nالمحفظة: <code>${walletAddress}</code>`
      );
    }

    return res.json({ success: true, withdraw: withdraw[0], message: 'تم إرسال طلب السحب بنجاح وسيتم معالجته قريباً' });
  } catch (err) {
    await session.abortTransaction();
    next(err);
  } finally {
    session.endSession();
  }
};

/**
 * User Financial Transactions History Controller
 */
const handleUserTransactions = async (req, res, next) => {
  try {
    await connectDB();
    const targetUserId = req.userId;
    const [deposits, withdraws] = await Promise.all([
      Deposit.find({ userId: targetUserId }).sort({ createdAt: -1 }).lean(),
      Withdraw.find({ userId: targetUserId }).sort({ createdAt: -1 }).lean()
    ]);

    const transactions = [
      ...deposits.map(d => ({ ...d, type: 'deposit' })),
      ...withdraws.map(w => ({ ...w, type: 'withdraw' }))
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return res.json({ success: true, transactions });
  } catch (err) {
    next(err);
  }
};

/**
 * User Settings Update Controller
 */
const handleUpdateSettings = async (req, res, next) => {
  try {
    await connectDB();
    const { language, walletAddress } = req.body;
    const updateData = {};
    if (language) updateData.language = language;
    if (walletAddress) updateData.defaultWallet = walletAddress;

    const user = await User.findByIdAndUpdate(req.userId, updateData, { new: true });
    return res.json({ success: true, user });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  handleUserData,
  handleUserReferrals,
  handleDeposit,
  handleWithdraw,
  handleUserTransactions,
  handleUpdateSettings
};
