require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');
const path = require('path');
const { User, Link, Campaign, Deposit, Withdraw } = require('./models');

const app = express();
app.use(express.json());

// تقديم الملفات الاستاتيكية
app.use(express.static(path.join(__dirname, 'public')));
app.use('/admin', express.static(path.join(__dirname, 'admin')));

// تحسين الاتصال بـ MongoDB ليعمل بكفاءة على Serverless environments
let cachedDb = null;
async function connectToDatabase() {
    if (cachedDb && mongoose.connection.readyState === 1) {
        return cachedDb;
    }
    if (!process.env.MONGODB_URI) {
        throw new Error('MONGODB_URI is missing from environment variables');
    }
    cachedDb = await mongoose.connect(process.env.MONGODB_URI, {
        bufferCommands: false,
    });
    return cachedDb;
}

// Middleware للاتصال بقاعدة البيانات
app.use(async (req, res, next) => {
    try {
        await connectToDatabase();
        next();
    } catch (err) {
        console.error('Database Connection Failure:', err.message);
        res.status(500).json({ error: 'Database Connection Error' });
    }
});

// توثيق بيانات Telegram WebApp
function verifyTelegramWebAppData(telegramInitData) {
    if (!telegramInitData || !process.env.BOT_TOKEN) return null;
    try {
        const urlParams = new URLSearchParams(telegramInitData);
        const hash = urlParams.get('hash');
        if (!hash) return null;

        urlParams.delete('hash');

        const paramsHelp = Array.from(urlParams.entries())
            .map(([key, value]) => `${key}=${value}`)
            .sort()
            .join('\n');

        const secretKey = crypto.createHmac('sha256', 'WebAppData').update(process.env.BOT_TOKEN).digest();
        const calculatedHash = crypto.createHmac('sha256', secretKey).update(paramsHelp).digest('hex');

        if (calculatedHash === hash) {
            const userJson = urlParams.get('user');
            return userJson ? JSON.parse(userJson) : null;
        }
    } catch (err) {
        console.error('Telegram Verification Error:', err.message);
    }
    return null;
}

// Middleware التحقق للمستخدم العادي
const authMiddleware = async (req, res, next) => {
    try {
        const initData = req.headers['x-telegram-init-data'];
        const user = verifyTelegramWebAppData(initData);
        if (!user || !user.id) {
            return res.status(401).json({ error: 'Unauthorized WebApp access' });
        }
        
        let dbUser = await User.findOne({ telegramId: user.id });
        if (!dbUser) {
            const startParam = req.headers['x-start-param'];
            const parsedReferrer = startParam && !isNaN(startParam) ? Number(startParam) : null;
            const referrerId = (parsedReferrer && parsedReferrer !== user.id) ? parsedReferrer : null;

            dbUser = await User.create({
                telegramId: user.id,
                firstName: user.first_name || '',
                lastName: user.last_name || '',
                username: user.username || '',
                isPremium: !!user.is_premium,
                photoUrl: user.photo_url || '',
                languageCode: user.language_code || 'ar',
                referredBy: referrerId
            });
        }

        if (dbUser.isBanned) {
            return res.status(403).json({ error: 'Account is banned' });
        }

        req.telegramUser = user;
        req.dbUser = dbUser;
        next();
    } catch (err) {
        console.error('Auth Middleware Error:', err);
        res.status(500).json({ error: 'Auth Middleware Server Error' });
    }
};

// Middleware التحقق للأدمن
const adminMiddleware = async (req, res, next) => {
    try {
        const initData = req.headers['x-telegram-init-data'];
        const user = verifyTelegramWebAppData(initData);
        const adminId = process.env.ADMIN_ID ? process.env.ADMIN_ID.trim() : '';

        if (!user || !user.id || user.id.toString() !== adminId) {
            return res.status(403).json({ error: 'Access Denied: Unauthorized Admin' });
        }
        req.adminUser = user;
        next();
    } catch (err) {
        res.status(403).json({ error: 'Access Denied' });
    }
};

// ------------------- المسارات الرئيسية -------------------

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'views.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin', 'admin.html'));
});

// ------------------- APIs المستخدمين -------------------

app.get('/api/user/me', authMiddleware, (req, res) => {
    const adminId = process.env.ADMIN_ID ? process.env.ADMIN_ID.trim() : '';
    res.json({
        user: req.dbUser,
        isAdmin: req.dbUser.telegramId.toString() === adminId,
        trc20Wallet: process.env.TRC20_WALLET || '',
        bep20Wallet: process.env.BEP20_WALLET || ''
    });
});

app.post('/api/user/wallet', authMiddleware, async (req, res) => {
    try {
        const { defaultWallet } = req.body;
        if (typeof defaultWallet !== 'string') {
            return res.status(400).json({ error: 'Invalid wallet address' });
        }
        req.dbUser.defaultWallet = defaultWallet.trim();
        await req.dbUser.save();
        res.json({ success: true, message: 'Wallet updated successfully' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// اختصار الروابط
app.post('/api/links/shorten', authMiddleware, async (req, res) => {
    try {
        const { originalUrl, title } = req.body;
        if (!originalUrl || typeof originalUrl !== 'string') {
            return res.status(400).json({ error: 'Valid URL is required' });
        }

        const code = crypto.randomBytes(4).toString('hex');
        const link = await Link.create({
            code,
            originalUrl,
            title: title ? title.trim() : '',
            userId: req.dbUser.telegramId
        });

        const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
        res.json({ success: true, link: { ...link.toObject(), shortUrl: `${baseUrl}/s/${code}` } });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/links/my', authMiddleware, async (req, res) => {
    try {
        const links = await Link.find({ userId: req.dbUser.telegramId }).sort({ createdAt: -1 });
        const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
        const formatted = links.map(l => ({
            ...l.toObject(),
            shortUrl: `${baseUrl}/s/${l.code}`
        }));
        res.json(formatted);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/links/toggle', authMiddleware, async (req, res) => {
    try {
        const { linkId } = req.body;
        if (!mongoose.Types.ObjectId.isValid(linkId)) {
            return res.status(400).json({ error: 'Invalid link ID' });
        }
        const link = await Link.findOne({ _id: linkId, userId: req.dbUser.telegramId });
        if (!link) return res.status(404).json({ error: 'Link not found' });
        
        link.isActive = !link.isActive;
        await link.save();
        res.json({ success: true, isActive: link.isActive });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// صفحة التوجيه والجسر
app.get('/s/:code', async (req, res) => {
    try {
        const link = await Link.findOne({ code: req.params.code, isActive: true });
        if (!link) return res.status(404).send('Link not active or found.');

        const campaign = await Campaign.findOne({ status: 'active' });

        res.send(`
            <!DOCTYPE html>
            <html lang="ar" dir="rtl">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Redirecting...</title>
                <style>
                    body { font-family: system-ui, -apple-system, sans-serif; background: #0f172a; color: #fff; text-align: center; padding: 20px; }
                    .card { background: #1e293b; border-radius: 12px; padding: 20px; max-width: 400px; margin: 40px auto; border: 1px solid #334155; }
                    .btn { background: #0088cc; color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; font-weight: bold; width: 100%; margin-top: 15px; text-decoration: none; display: inline-block; }
                    .btn:disabled { background: #475569; cursor: not-allowed; }
                    .ad-box { background: #0f172a; border: 1px dashed #38bdf8; padding: 15px; border-radius: 8px; margin: 15px 0; }
                </style>
            </head>
            <body>
                <div class="card">
                    <h2>Telega.ads Bridge</h2>
                    <p>سيتم تفعيل الرابط خلال <span id="timer">5</span> ثوانٍ...</p>
                    
                    <div class="ad-box">
                        ${campaign ? `<h4>${campaign.title}</h4><a href="${campaign.targetUrl}" target="_blank" style="color:#38bdf8;">إعلان رعائي: انقر هنا للتفاصيل</a>` : '<p>مساحة إعلانية متوفرة</p>'}
                    </div>

                    <button id="goBtn" class="btn" disabled>يرجى الانتظار...</button>
                </div>

                <script>
                    let sec = 5;
                    const timerEl = document.getElementById('timer');
                    const btn = document.getElementById('goBtn');
                    const interval = setInterval(() => {
                        sec--;
                        timerEl.textContent = sec;
                        if(sec <= 0) {
                            clearInterval(interval);
                            btn.disabled = false;
                            btn.textContent = 'الانتقال إلى الرابط الأصلي';
                            btn.onclick = () => {
                                fetch('/api/bridge/verify', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ code: '${link.code}', campaignId: '${campaign ? campaign._id : ''}' })
                                }).finally(() => {
                                    window.location.href = '${link.originalUrl}';
                                });
                            };
                        }
                    }, 1000);
                </script>
            </body>
            </html>
        `);
    } catch (e) {
        res.status(500).send('Server Error');
    }
});

// احتساب المشاهدات
app.post('/api/bridge/verify', async (req, res) => {
    try {
        const { code, campaignId } = req.body;
        if (code) {
            await Link.updateOne({ code }, { $inc: { views: 1 } });
        }

        if (campaignId && mongoose.Types.ObjectId.isValid(campaignId)) {
            const campaign = await Campaign.findById(campaignId);
            if (campaign && campaign.status === 'active') {
                campaign.viewsDelivered += 1;
                if (campaign.viewsDelivered >= campaign.totalViewsNeeded) {
                    campaign.status = 'completed';
                }
                await campaign.save();
            }
        }
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// الإيداع
app.post('/api/user/deposit', authMiddleware, async (req, res) => {
    const { network, amount, txId } = req.body;
    const numericAmount = Number(amount);

    if (!txId || isNaN(numericAmount) || numericAmount <= 0 || !['TRC20', 'BEP20'].includes(network)) {
        return res.status(400).json({ error: 'Invalid deposit payload' });
    }

    try {
        const deposit = await Deposit.create({
            userId: req.dbUser.telegramId,
            network,
            amount: numericAmount,
            txId: txId.trim()
        });
        res.json({ success: true, deposit });
    } catch (e) {
        res.status(400).json({ error: 'Transaction ID already submitted or invalid' });
    }
});

// السحب الآمن
app.post('/api/user/withdraw', authMiddleware, async (req, res) => {
    try {
        const { amount, walletAddress } = req.body;
        const numericAmount = Number(amount);

        if (isNaN(numericAmount) || numericAmount < 30) {
            return res.status(400).json({ error: 'Minimum withdrawal amount is $30' });
        }
        if (!walletAddress || typeof walletAddress !== 'string') {
            return res.status(400).json({ error: 'Invalid wallet address' });
        }

        // تخصيص عملية سحب ذرية لمنع السحب المزدوج (Race Condition Fix)
        const updatedUser = await User.findOneAndUpdate(
            { telegramId: req.dbUser.telegramId, availableBalance: { $gte: numericAmount } },
            { $inc: { availableBalance: -numericAmount } },
            { new: true }
        );

        if (!updatedUser) {
            return res.status(400).json({ error: 'Insufficient balance or concurrent transaction' });
        }

        const fee = numericAmount * 0.10;
        const netAmount = numericAmount - fee;

        const withdraw = await Withdraw.create({
            userId: req.dbUser.telegramId,
            amount: numericAmount,
            fee,
            netAmount,
            walletAddress: walletAddress.trim()
        });

        res.json({ success: true, withdraw });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/user/history', authMiddleware, async (req, res) => {
    try {
        const deposits = await Deposit.find({ userId: req.dbUser.telegramId }).sort({ createdAt: -1 });
        const withdraws = await Withdraw.find({ userId: req.dbUser.telegramId }).sort({ createdAt: -1 });
        res.json({ deposits, withdraws });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// إنشـاء الحملات
app.post('/api/campaigns/create', authMiddleware, async (req, res) => {
    try {
        const { title, targetUrl, budget } = req.body;
        const numericBudget = Number(budget);

        if (!title || !targetUrl || isNaN(numericBudget) || numericBudget < 5) {
            return res.status(400).json({ error: 'Minimum campaign budget is $5' });
        }

        const updatedUser = await User.findOneAndUpdate(
            { telegramId: req.dbUser.telegramId, adBalance: { $gte: numericBudget } },
            { $inc: { adBalance: -numericBudget } },
            { new: true }
        );

        if (!updatedUser) {
            return res.status(400).json({ error: 'Insufficient Ad balance' });
        }

        const totalViewsNeeded = Math.floor((numericBudget / 1.50) * 1000);

        const campaign = await Campaign.create({
            userId: req.dbUser.telegramId,
            title: title.trim(),
            targetUrl: targetUrl.trim(),
            budget: numericBudget,
            totalViewsNeeded
        });

        res.json({ success: true, campaign });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/campaigns/my', authMiddleware, async (req, res) => {
    try {
        const campaigns = await Campaign.find({ userId: req.dbUser.telegramId }).sort({ createdAt: -1 });
        res.json(campaigns);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ------------------- APIs الأدمن -------------------

app.get('/api/admin/stats', adminMiddleware, async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const pendingDeposits = await Deposit.countDocuments({ status: 'pending' });
        const pendingWithdraws = await Withdraw.countDocuments({ status: 'pending' });
        const aggregate = await User.aggregate([{ $group: { _id: null, totalPending: { $sum: "$pendingBalance" } } }]);
        
        res.json({
            totalUsers,
            pendingDeposits,
            pendingWithdraws,
            totalPendingBalance: aggregate[0] ? aggregate[0].totalPending : 0
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/admin/distribute-revenue', adminMiddleware, async (req, res) => {
    try {
        const numericRevenue = Number(req.body.totalRevenue);
        if (isNaN(numericRevenue) || numericRevenue <= 0) {
            return res.status(400).json({ error: 'Invalid total revenue amount' });
        }

        const activeLinks = await Link.find({ isActive: true, views: { $gt: 0 } });
        const totalViews = activeLinks.reduce((acc, l) => acc + l.views, 0);

        if (totalViews === 0) {
            return res.status(400).json({ error: 'No active views to distribute' });
        }

        for (let link of activeLinks) {
            const linkEarnings = (link.views / totalViews) * numericRevenue;
            link.earnings += linkEarnings;
            await link.save();

            const owner = await User.findOne({ telegramId: link.userId });
            if (owner) {
                owner.pendingBalance += linkEarnings;
                
                if (owner.referredBy) {
                    await User.updateOne(
                        { telegramId: owner.referredBy },
                        { $inc: { availableBalance: linkEarnings * 0.10 } }
                    );
                }
                await owner.save();
            }
        }

        res.json({ success: true, message: 'Revenue distributed successfully' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/admin/deposits', adminMiddleware, async (req, res) => {
    try {
        const deposits = await Deposit.find({ status: 'pending' }).sort({ createdAt: -1 });
        res.json(deposits);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/admin/deposits/action', adminMiddleware, async (req, res) => {
    try {
        const { depositId, action } = req.body;
        if (!mongoose.Types.ObjectId.isValid(depositId)) {
            return res.status(400).json({ error: 'Invalid Deposit ID' });
        }

        const deposit = await Deposit.findById(depositId);
        if (!deposit || deposit.status !== 'pending') {
            return res.status(400).json({ error: 'Deposit request not found or processed' });
        }

        if (action === 'approve') {
            deposit.status = 'approved';
            await User.updateOne(
                { telegramId: deposit.userId },
                { $inc: { adBalance: deposit.amount } }
            );
        } else {
            deposit.status = 'rejected';
        }

        await deposit.save();
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/admin/withdraws', adminMiddleware, async (req, res) => {
    try {
        const withdraws = await Withdraw.find({ status: 'pending' }).sort({ createdAt: -1 });
        res.json(withdraws);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/admin/withdraws/action', adminMiddleware, async (req, res) => {
    try {
        const { withdrawId, action, rejectionReason } = req.body;
        if (!mongoose.Types.ObjectId.isValid(withdrawId)) {
            return res.status(400).json({ error: 'Invalid Withdraw ID' });
        }

        const withdraw = await Withdraw.findById(withdrawId);
        if (!withdraw || withdraw.status !== 'pending') {
            return res.status(400).json({ error: 'Withdraw request not found or processed' });
        }

        if (action === 'approve') {
            withdraw.status = 'approved';
        } else {
            withdraw.status = 'rejected';
            withdraw.rejectionReason = rejectionReason || 'Rejected by Admin';
            // إعادة المبلغ المحجوز للمستخدم في حال الرفض
            await User.updateOne(
                { telegramId: withdraw.userId },
                { $inc: { availableBalance: withdraw.amount } }
            );
        }

        await withdraw.save();
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/admin/users', adminMiddleware, async (req, res) => {
    try {
        const users = await User.find().sort({ createdAt: -1 }).limit(100);
        res.json(users);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/admin/users/ban', adminMiddleware, async (req, res) => {
    try {
        const { telegramId, ban } = req.body;
        if (!telegramId) return res.status(400).json({ error: 'Telegram ID is required' });

        await User.updateOne({ telegramId: Number(telegramId) }, { $set: { isBanned: !!ban } });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// تشغيل الخادم في البيئات المحلية والمستقلة
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`Server running smoothly on port ${PORT}`));
}

module.exports = app;
