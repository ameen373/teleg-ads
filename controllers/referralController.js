// controllers/referralController.js

const User = require('../models/User'); // يفترض وجود نموذج المستخدم Mongoose

/**
 * دالة مساعدة لتشفير/إخفاء جزء من الاسم أو اسم المستخدم لحماية الخصوصية
 * مثال: "Ahmed" -> "A***d" أو "john_doe" -> "j***e"
 */
function maskName(name) {
  if (!name || name.length <= 2) return '***';
  const start = name.charAt(0);
  const end = name.charAt(name.length - 1);
  return `${start}***${end}`;
}

/**
 * 1. جلب إحصائيات الإحالة الخاصة بالمستخدم الحالي
 */
exports.getReferralStats = async (req, res) => {
  try {
    const userId = req.user._id;

    // جلب بيانات المستخدم لضمان الحصول على أحدث القيم
    const currentUser = await User.findById(userId);

    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: 'المستخدم غير موجود'
      });
    }

    // اسم البوت المأخوذ من متغيرات البيئة أو القيمة الافتراضية
    const botUsername = process.env.TELEGRAM_BOT_USERNAME || 'TelegaAdsBot';
    const telegramId = currentUser.telegramId;

    // 1. توليد رابط الإحالة الفريد الخاص بالتطبيق المصغر (Telegram Mini App)
    const referralLink = `https://t.me/${botUsername}/app?startapp=ref_${telegramId}`;

    // 2. حساب عدد المستخدمين الذين انضموا عبر هذا المستخدم
    const totalReferredUsers = await User.countDocuments({
      referredBy: telegramId
    });

    // 3. جلب قائمة بآخر 10 مستخدمين تم دعوتهم مع تطبيق قناع الخصوصية
    const recentReferredUsers = await User.find({ referredBy: telegramId })
      .sort({ createdAt: -1 })
      .limit(10)
      .select('firstName username createdAt');

    const formattedRecentUsers = recentReferredUsers.map((u) => {
      const displayName = u.username ? `@${u.username}` : u.firstName;
      return {
        maskedName: maskName(displayName),
        joinedAt: u.createdAt
      };
    });

    // 4. إرجاع النتيجة الكاملة
    return res.status(200).json({
      success: true,
      data: {
        referralLink: referralLink,
        totalReferredUsers: totalReferredUsers,
        referralEarnings: currentUser.balances?.referralEarned || currentUser.referralEarnings || 0,
        recentReferredUsers: formattedRecentUsers
      }
    });
  } catch (error) {
    console.error('[Get Referral Stats Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في السيرفر أثناء جلب بيانات الإحالة'
    });
  }
};

/**
 * 2. تحويل أرباح الإحالات إلى الرصيد المتاح للسحب
 */
exports.claimReferralEarnings = async (req, res) => {
  try {
    const userId = req.user._id;
    const currentUser = await User.findById(userId);

    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: 'المستخدم غير موجود'
      });
    }

    // قراءة أرباح الإحالة بناءً على هيكلية نموذج البيانات
    const currentReferralEarned = currentUser.balances?.referralEarned || currentUser.referralEarnings || 0;
    const MIN_CLAIM_AMOUNT = parseFloat(process.env.MIN_REFERRAL_CLAIM_AMOUNT) || 1.0; // حد أدنى $1 تحويل

    if (currentReferralEarned < MIN_CLAIM_AMOUNT) {
      return res.status(400).json({
        success: false,
        message: `الحد الأدنى لتحويل أرباح الإحالة إلى الرصيد المتاح هو $${MIN_CLAIM_AMOUNT.toFixed(2)}`
      });
    }

    const claimAmount = currentReferralEarned;

    // تحديث أرصدة المستخدم (تصفير رصيد الإحالة وإضافته للرصيد المتاح)
    if (currentUser.balances) {
      currentUser.balances.available += claimAmount;
      currentUser.balances.referralEarned = 0;
    } else {
      currentUser.availableBalance = (currentUser.availableBalance || 0) + claimAmount;
      currentUser.referralEarnings = 0;
    }

    await currentUser.save();

    return res.status(200).json({
      success: true,
      message: `تم تحويل مبلغ $${claimAmount.toFixed(2)} بنجاح إلى رصيدك المتاح للسحب.`,
      data: {
        claimedAmount: claimAmount,
        newAvailableBalance: currentUser.balances ? currentUser.balances.available : currentUser.availableBalance
      }
    });
  } catch (error) {
    console.error('[Claim Referral Earnings Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في السيرفر أثناء مطالبات أرباح الإحالة'
    });
  }
};
