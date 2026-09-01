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

// إدارة اتصال قاعدة البيانات لبيئة Serverless
let cachedDb = null;
async function connectToDatabase() {
    if (cachedDb && mongoose.connection.readyState === 1) {
        return cachedDb;
    }
    if (!process.env.MONGODB_URI) {
        throw new Error('MONGODB_URI is not defined in environment variables');
    }
    cachedDb = await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB Connected Successfully');
    return cachedDb;
}

// Middleware للاتصال بقاعدة البيانات
app.use(async (req, res, next) => {
    try {
        await connectToDatabase();
        next();
    } catch (err) {
        console.error('Database connection failure:', err);
        return res.status(500).json({ error: 'Database Connection Error' });
    }
});

// التثبت التشفيري لبيانات Telegram WebApp
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
        console.error('Telegram verification error:', err);
    }
    return null;
}

// Middleware مصادقة المستخدم
const authMiddleware = async (req, res, next) => {
    try {
        const initData = req.headers['x-telegram-init-data'];
        const user = verifyTelegramWebAppData(initData);
        if (!user) {
            return res.status(401).json({ error: 'Unauthorized WebApp access' });
        }
        
        let dbUser = await User.findOne({ telegramId: user.id });
        if (!dbUser) {
            const startParam = req.headers['x-start-param'];
            const referrerId = startParam && !isNaN(startParam) ? parseInt(startParam, 10) : null;
            dbUser = await User.create({
                telegramId: user.id,
                firstName: user.first_name || '',
                lastName: user.last_name || '',
                username: user.username || '',
                languageCode: user.language_code || 'ar',
                isPremium: !!user.is_premium,
                photoUrl: user.photo_url || '',
                referredBy: (referrerId && referrerId !== user.id) ? referrerId : null
            });
        }

        if (dbUser.isBanned) {
            return res.status(403).json({ error: 'Your account is banned' });
        }

        req.telegramUser = user;
        req.dbUser = dbUser;
        next();
    } catch (err) {
        console.error('Auth Middleware Error:', err);
        return res.status(500).json({ error: 'Auth Middleware Server Error' });
    }
};

// Middleware حماية الأدمن
const adminMiddleware = async (req, res, next) => {
    try {
        const initData = req.headers['x-telegram-init-data'];
        const user = verifyTelegramWebAppData(initData);
        
        const adminId = process.env.ADMIN_ID ? process.env.ADMIN_ID.toString().trim() : '';
        if (!user || user.id.toString().trim() !== adminId) {
            return res.status(403).json({ error: 'Access Denied: You are not authorized.' });
        }
        req.adminUser = user;
        next();
    } catch (err) {
        return res.status(403).json({ error: 'Access Denied' });
    }
};

// ------------------- مسارات الواجهة العامة -------------------

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'views.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin', 'admin.html'));
});

// ------------------- APIs المستخدمين -------------------

app.get('/api/user/me', authMiddleware, (req, res) => {
    const adminId = process.env.ADMIN_ID ? process.env.ADMIN_ID.toString().trim() : '';
    return res.json({
        user: req.dbUser,
        isAdmin: req.dbUser.telegramId.toString().trim() === adminId,
        trc20Wallet: process.env.TRC20_WALLET || '',
        bep20Wallet: process.env.BEP20_WALLET || ''
    });
});

app.post('/api/user/wallet', authMiddleware, async (req, res) => {
    try {
        const { defaultWallet } = req.body;
        if (!defaultWallet) return res.status(400).json({ error: 'Wallet address is required' });
        
        req.dbUser.defaultWallet = defaultWallet;
        await req.dbUser.save();
        return res.json({ success: true, message: 'Wallet updated' });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

// اختصار الروابط
app.post('/api/links/shorten', authMiddleware, async (req, res) => {
    try {
        const { originalUrl, title } = req.body;
        if (!originalUrl) return res.status(400).json({ error: 'URL is required' });

        const code = crypto.randomBytes(3).toString('hex');
        const link = await Link.create({
            code,
            originalUrl,
            title: title || '',
            userId: req.dbUser.telegramId
        });

        const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
        return res.json({ success: true, link: { ...link.toObject(), shortUrl: `${baseUrl}/s/${code}` } });
    } catch (e) {
        return res.status(500).json({ error: e.message });
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
        return res.json(formatted);
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

app.post('/api/links/toggle', authMiddleware, async (req, res) => {
    try {
        const { linkId } = req.body;
        const link = await Link.findOne({ _id: linkId, userId: req.dbUser.telegramId });
        if (!link) return res.status(404).json({ error: 'Link not found' });
        
        link.isActive = !link.isActive;
        await link.save();
        return res.json({ success: true, isActive: link.isActive });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

// صفحة الجسر والتحويل
app.get('/s/:code', async (req, res) => {
    try {
        const link = await Link.findOne({ code: req.params.code, isActive: true });
        if (!link) return res.status(404).send('Link not active or found.');

        const campaign = await Campaign.findOne({ status: 'active' });

        return res.send(`
            <!DOCTYPE html>
            <html lang="ar" dir="rtl">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Telega.ads - Redirecting</title>
                <style>
                    body { font-family: sans-serif; background: #0f172a; color: #fff; text-align: center; padding: 20px; }
                    .card { background: #1e293b; border-radius: 12px; padding: 20px; max-width: 400px; margin: 40px auto; border: 1px solid #334155; }
                    .btn { background: #0088cc; color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; font-weight: bold; width: 100%; margin-top: 15px; text-decoration: none; display: inline-block; }
                    .btn:disabled { background: #475569; cursor: not-allowed; }
                    .ad-box { background: #0f172a; border: 1px dashed #38bdf8; padding: 15px; border-radius: 8px; margin: 15px 0; }
                </style>
            </head>
            <body>
                <div class="card">
                    <h2>Telega.ads Bridge Page</h2>
                    <p>سيتم تفعيل الرابط خلال <span id="timer">5</span> ثوانٍ...</p>
                    
                    <div class="ad-box">
                        ${campaign ? `<h4>${campaign.title}</h4><a href="${campaign.targetUrl}" target="_blank" style="color:#38bdf8;">إعلان رعائي: انقر هنا للتفاصيل</a>` : '<p>إعلان Adsgram / Fallback Ad Place</p>'}
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
                                }).then(() => {
                                    window.location.href = '${link.originalUrl}';
                                }).catch(() => {
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
        return res.status(500).send('Server Error');
    }
});

// الاحتساب الآمن للمشاهدات
app.post('/api/bridge/verify', async (req, res) => {
    try {
        const { code, campaignId } = req.body;
        const link = await Link.findOne({ code });
        if (link) {
            link.views += 1;
            await link.save();
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
        return res.json({ success: true });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

// السحب والإيداع والحملات
app.post('/api/user/deposit', authMiddleware, async (req, res) => {
    const { network, amount, txId } = req.body;
    if (!txId || !amount || amount <= 0) return res.status(400).json({ error: 'Invalid payload' });

    try {
        const deposit = await Deposit.create({
            userId: req.dbUser.telegramId,
            network,
            amount,
            txId
        });
        return res.json({ success: true, deposit });
    } catch (e) {
        return res.status(400).json({ error: 'TxID already submitted or invalid' });
    }
});

app.post('/api/user/withdraw', authMiddleware, async (req, res) => {
    try {
        const { amount, walletAddress } = req.body;
        if (!amount || amount < 30) return res.status(400).json({ error: 'Minimum withdrawal is $30' });
        if (!walletAddress) return res.status(400).json({ error: 'Wallet address is required' });
        if (req.dbUser.availableBalance < amount) return res.status(400).json({ error: 'Insufficient balance' });

        const fee = amount * 0.10;
        const netAmount = amount - fee;

        req.dbUser.availableBalance -= amount;
        await req.dbUser.save();

        const withdraw = await Withdraw.create({
            userId: req.dbUser.telegramId,
            amount,
            fee,
            netAmount,
            walletAddress
        });

        return res.json({ success: true, withdraw });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

app.get('/api/user/history', authMiddleware, async (req, res) => {
    try {
        const deposits = await Deposit.find({ userId: req.dbUser.telegramId }).sort({ createdAt: -1 });
        const withdraws = await Withdraw.find({ userId: req.dbUser.telegramId }).sort({ createdAt: -1 });
        return res.json({ deposits, withdraws });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

app.post('/api/campaigns/create', authMiddleware, async (req, res) => {
    try {
        const { title, targetUrl, budget } = req.body;
        if (!title || !targetUrl) return res.status(400).json({ error: 'Missing parameters' });
        if (!budget || budget < 5) return res.status(400).json({ error: 'Minimum budget is $5' });
        if (req.dbUser.adBalance < budget) return res.status(400).json({ error: 'Insufficient Ad balance' });

        const totalViewsNeeded = Math.floor((budget / 1.50) * 1000);

        req.dbUser.adBalance -= budget;
        await req.dbUser.save();

        const campaign = await Campaign.create({
            userId: req.dbUser.telegramId,
            title,
            targetUrl,
            budget,
            totalViewsNeeded
        });

        return res.json({ success: true, campaign });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

app.get('/api/campaigns/my', authMiddleware, async (req, res) => {
    try {
        const campaigns = await Campaign.find({ userId: req.dbUser.telegramId }).sort({ createdAt: -1 });
        return res.json(campaigns);
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

// ------------------- APIs لوحة التحكم (الأدمن فقط) -------------------

app.get('/api/admin/stats', adminMiddleware, async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const pendingDeposits = await Deposit.countDocuments({ status: 'pending' });
        const pendingWithdraws = await Withdraw.countDocuments({ status: 'pending' });
        const aggregate = await User.aggregate([{ $group: { _id: null, totalPending: { $sum: "$pendingBalance" } } }]);
        
        return res.json({
            totalUsers,
            pendingDeposits,
            pendingWithdraws,
            totalPendingBalance: aggregate[0] ? aggregate[0].totalPending : 0
        });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

app.post('/api/admin/distribute-revenue', adminMiddleware, async (req, res) => {
    try {
        const { totalRevenue } = req.body;
        if (!totalRevenue || totalRevenue <= 0) return res.status(400).json({ error: 'Invalid Revenue' });

        const activeLinks = await Link.find({ isActive: true });
        const totalViews = activeLinks.reduce((acc, l) => acc + l.views, 0);

        if (totalViews === 0) return res.status(400).json({ error: 'No views to distribute' });

        for (let link of activeLinks) {
            if (link.views > 0) {
                const linkEarnings = (link.views / totalViews) * totalRevenue;
                link.earnings += linkEarnings;
                await link.save();

                const owner = await User.findOne({ telegramId: link.userId });
                if (owner) {
                    owner.pendingBalance += linkEarnings;
                    
                    if (owner.referredBy) {
                        const referrer = await User.findOne({ telegramId: owner.referredBy });
                        if (referrer) {
                            referrer.availableBalance += linkEarnings * 0.10;
                            await referrer.save();
                        }
                    }
                    await owner.save();
                }
            }
        }

        return res.json({ success: true, message: 'Revenue Distributed' });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

app.get('/api/admin/deposits', adminMiddleware, async (req, res) => {
    try {
        const deposits = await Deposit.find({ status: 'pending' }).sort({ createdAt: -1 });
        return res.json(deposits);
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

app.post('/api/admin/deposits/action', adminMiddleware, async (req, res) => {
    try {
        const { depositId, action } = req.body;
        const deposit = await Deposit.findById(depositId);
        if (!deposit || deposit.status !== 'pending') return res.status(400).json({ error: 'Invalid Deposit' });

        if (action === 'approve') {
            deposit.status = 'approved';
            const user = await User.findOne({ telegramId: deposit.userId });
            if (user) {
                user.adBalance += deposit.amount;
                await user.save();
            }
        } else {
            deposit.status = 'rejected';
        }
        await deposit.save();
        return res.json({ success: true });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

app.get('/api/admin/withdraws', adminMiddleware, async (req, res) => {
    try {
        const withdraws = await Withdraw.find({ status: 'pending' }).sort({ createdAt: -1 });
        return res.json(withdraws);
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

app.post('/api/admin/withdraws/action', adminMiddleware, async (req, res) => {
    try {
        const { withdrawId, action, rejectionReason } = req.body;
        const withdraw = await Withdraw.findById(withdrawId);
        if (!withdraw || withdraw.status !== 'pending') return res.status(400).json({ error: 'Invalid Request' });

        if (action === 'approve') {
            withdraw.status = 'approved';
        } else {
            withdraw.status = 'rejected';
            withdraw.rejectionReason = rejectionReason || 'Rejected by Admin';
            const user = await User.findOne({ telegramId: withdraw.userId });
            if (user) {
                user.availableBalance += withdraw.amount;
                await user.save();
            }
        }
        await withdraw.save();
        return res.json({ success: true });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

app.get('/api/admin/users', adminMiddleware, async (req, res) => {
    try {
        const users = await User.find().sort({ createdAt: -1 }).limit(100);
        return res.json(users);
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

app.post('/api/admin/users/ban', adminMiddleware, async (req, res) => {
    try {
        const { telegramId, ban } = req.body;
        const user = await User.findOne({ telegramId });
        if (user) {
            user.isBanned = ban;
            await user.save();
        }
        return res.json({ success: true });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

// إيقاف تشغيل الاستماع المحلي في Vercel Serverless
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

module.exports = app;
