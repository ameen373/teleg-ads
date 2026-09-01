const { User, Channel, Link, Campaign, Deposit, Withdraw } = require('../models');

/**
 * جلب واستخراج الملف الشامل والمفصل لأي مستخدم بالكامل
 * @param {Number} telegramId - معرف تليجرام للمستخدم
 */
async function getUserFullProfile(telegramId) {
    const numericId = Number(telegramId);
    if (isNaN(numericId)) throw new Error('معرف تليجرام غير صاليح');

    // 1. جلب البيانات الأساسية
    const user = await User.findOne({ telegramId: numericId }).lean();
    if (!user) return null;

    // 2. جلب النشاطات والتفاصيل من جميع الجداول بالتوازي (Parallel Queries)
    const [
        channels,
        links,
        campaigns,
        deposits,
        withdraws,
        referrals
    ] = await Promise.all([
        Channel.find({ userId: numericId }).lean(),
        Link.find({ userId: numericId }).sort({ createdAt: -1 }).lean(),
        Campaign.find({ userId: numericId }).sort({ createdAt: -1 }).lean(),
        Deposit.find({ userId: numericId }).sort({ createdAt: -1 }).lean(),
        Withdraw.find({ userId: numericId }).sort({ createdAt: -1 }).lean(),
        User.find({ referredBy: numericId }, 'telegramId firstName lastName username createdAt').lean()
    ]);

    // 3. الحسابات والتحليلات المالية للناشر
    const totalLinkViews = links.reduce((sum, l) => sum + (l.views || 0), 0);
    const totalLinkEarnings = links.reduce((sum, l) => sum + (l.earnings || 0), 0);
    const activeLinksCount = links.filter(l => l.isActive).length;

    // 4. الحسابات والتحليلات الإعلانية للمعلن
    const totalDeposited = deposits
        .filter(d => d.status === 'approved')
        .reduce((sum, d) => sum + (d.amount || 0), 0);

    const totalCampaignBudget = campaigns.reduce((sum, c) => sum + (c.budget || 0), 0);
    const totalAdViewsDelivered = campaigns.reduce((sum, c) => sum + (c.viewsDelivered || 0), 0);

    // 5. التحليلات المالية لعمليات السحب
    const totalWithdrawn = withdraws
        .filter(w => w.status === 'approved')
        .reduce((sum, w) => sum + (w.amount || 0), 0);

    const totalWithdrawFees = withdraws
        .filter(w => w.status === 'approved')
        .reduce((sum, w) => sum + (w.fee || 0), 0);

    // 6. من قام بدعوة هذا المستخدم (Referrer Info)
    let inviter = null;
    if (user.referredBy) {
        inviter = await User.findOne(
            { telegramId: user.referredBy },
            'telegramId firstName lastName username'
        ).lean();
    }

    // 7. تجميع وتنسيق التقرير النهائي
    return {
        profile: {
            telegramId: user.telegramId,
            firstName: user.firstName,
            lastName: user.lastName,
            username: user.username,
            languageCode: user.languageCode,
            isPremium: user.isPremium,
            photoUrl: user.photoUrl,
            isBanned: user.isBanned,
            lastActive: user.lastActive,
            createdAt: user.createdAt,
            defaultWallet: user.defaultWallet
        },
        financials: {
            availableBalance: user.availableBalance || 0,
            pendingBalance: user.pendingBalance || 0,
            adBalance: user.adBalance || 0,
            totalDeposited,
            totalWithdrawn,
            totalWithdrawFees,
            netWithdrawn: totalWithdrawn - totalWithdrawFees
        },
        publisherStats: {
            channelsCount: channels.length,
            linksCount: links.length,
            activeLinksCount,
            totalViews: totalLinkViews,
            totalEarnings: totalLinkEarnings
        },
        advertiserStats: {
            campaignsCount: campaigns.length,
            totalSpent: totalCampaignBudget,
            totalViewsDelivered: totalAdViewsDelivered
        },
        referralStats: {
            totalReferred: referrals.length,
            invitedBy: inviter
        },
        details: {
            channels,
            links,
            campaigns,
            deposits,
            withdraws,
            referrals
        }
    };
}

module.exports = { getUserFullProfile };
