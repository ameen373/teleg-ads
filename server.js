require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');

// استيراد النماذج من ملف models.js
const { User, Wallet, Transaction, Link, Campaign } = require('./models');

const app = express();
app.use(express.json());

// ---------------------------------------------------------------
// 1. الاتصال بقاعدة البيانات
// ---------------------------------------------------------------
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/telega_ads';
mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ تم الاتصال بقاعدة البيانات بنجاح'))
    .catch(err => console.error('❌ خطأ في الاتصال بقاعدة البيانات:', err));


// ---------------------------------------------------------------
// 2. حماية ضد الإغراق (Rate Limiting)
// ---------------------------------------------------------------
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 دقيقة
    max: 100, // حد أقصى 100 طلب لكل عنوان IP
    message: { success: false, message: 'تم تجاوز حد الطلبات المسموح به، يرجى المحاولة لاحقاً.' }
});

// تطبيق حماية الإغراق على جميع الـ API
app.use('/api/', limiter);


// ---------------------------------------------------------------
// 3. وسيط التحقق من هوية تليجرام (Telegram WebApp Authentication Middleware)
// ---------------------------------------------------------------
const authenticateTelegram = async (req, res, next) => {
    try {
        const initData = req.headers['x-telegram-init-data'];

        if (!initData) {
            return res.status(401).json({ success: false, message: 'مصادقة غير صالحة: ترويسة تليجرام مفقودة' });
        }

        const urlParams = new URLSearchParams(initData);
        const hash = urlParams.get('hash');
        urlParams.delete('hash');

        // ترتيب البارامترات أبجدياً
        const dataCheckString = Array.from(urlParams.entries())
            .map(([key, value]) => `${key}=${value}`)
            .sort()
            .join('\n');

        // إنشاء المفتاح السري وتوليد التوقيع
        const secretKey = crypto.createHmac('sha256', 'WebAppData').update(process.env.BOT_TOKEN || '').digest();
        const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

        if (calculatedHash !== hash && process.env.NODE_ENV === 'production') {
            return res.status(403).json({ success: false, message: 'فشل التحقق من صحة بيانات تليجرام' });
        }

        // استخراج بيانات المستخدم
        const userDataStr = urlParams.get('user');
        if (!userDataStr) {
            return res.status(400).json({ success: false, message: 'بيانات المستخدم غير موجودة' });
        }

        const telegramUser = JSON.parse(userDataStr);

        // جلب أو إنشاء المستخدم والمحفظة
        let user = await User.findOne({ telegramId: telegramUser.id });
        if (!user) {
            user = await User.create({
                telegramId: telegramUser.id,
                username: telegramUser.username || ''
            });
            await Wallet.create({ userId: user._id, balance: 0 });
        }

        // حفظ بيانات المستخدم في الطلب لتوفيرها للـ Endpoints
        req.user = user;
        next();
    } catch (error) {
        return res.status(500).json({ success: false, message: 'حدث خطأ في المصادقة', error: error.message });
    }
};

// تطبيق المصادقة على جميع مسارات الـ API
app.use('/api', authenticateTelegram);


// ---------------------------------------------------------------
// 4. API المحفظة والحركات المالية (Wallet & Transactions)
// ---------------------------------------------------------------

// جلب تفاصيل المحفظة والرصيد
app.get('/api/wallet', async (req, res) => {
    try {
        const wallet = await Wallet.findOne({ userId: req.user._id });
        if (!wallet) {
            return res.status(404).json({ success: false, message: 'المحفظة غير موجودة' });
        }
        res.json({ success: true, wallet });
    } catch (error) {
        res.status(500).json({ success: false, message: 'فشل في جلب المحفظة', error: error.message });
    }
});

// تنفيذ عملية إيداع آمنة (Deposit Transaction)
app.post('/api/wallet/deposit', async (req, res) => {
    const { amount, description } = req.body;

    if (!amount || amount <= 0 || !Number.isInteger(amount)) {
        return res.status(400).json({ success: false, message: 'المبلغ يجب أن يكون عدداً صحيحاً أكبر من صفر (بالسنتات)' });
    }

    const session = await mongoose.startSession();
    try {
        await session.withTransaction(async () => {
            // 1. زيادة رصيد المحفظة
            const wallet = await Wallet.findOneAndUpdate(
                { userId: req.user._id },
                { $inc: { balance: amount, totalEarned: amount } },
                { new: true, session }
            );

            // 2. تسجيل الحركة المالية
            await Transaction.create([{
                userId: req.user._id,
                type: 'deposit',
                amount: amount,
                status: 'completed',
                description: description || 'إيداع رصيد جديد'
            }], { session });
        });

        res.json({ success: true, message: 'تم الإيداع بنجاح' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'فشلت عملية الإيداع', error: error.message });
    } finally {
        session.endSession();
    }
});

// تنفيذ عملية سحب آمنة (Withdrawal Transaction)
app.post('/api/wallet/withdraw', async (req, res) => {
    const { amount, description } = req.body;

    if (!amount || amount <= 0 || !Number.isInteger(amount)) {
        return res.status(400).json({ success: false, message: 'المبلغ يجب أن يكون عدداً صحيحاً أكبر من صفر (بالسنتات)' });
    }

    const session = await mongoose.startSession();
    try {
        await session.withTransaction(async () => {
            // 1. التحقق من وجود رصيد كافٍ وخصمه مباشرة
            const wallet = await Wallet.findOneAndUpdate(
                { userId: req.user._id, balance: { $gte: amount } },
                { $inc: { balance: -amount, totalSpent: amount } },
                { new: true, session }
            );

            if (!wallet) {
                throw new Error('رصيد المحفظة غير كافٍ لتنفيذ هذه العملية');
            }

            // 2. تسجيل الحركة المالية
            await Transaction.create([{
                userId: req.user._id,
                type: 'withdrawal',
                amount: amount,
                status: 'completed',
                description: description || 'طلب سحب رصيد'
            }], { session });
        });

        res.json({ success: true, message: 'تم خصم وتوثيق عملية السحب بنجاح' });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    } finally {
        session.endSession();
    }
});


// ---------------------------------------------------------------
// 5. API الروابط المختصرة (Links)
// ---------------------------------------------------------------

// إنشاء رابط مختصر جديد
app.post('/api/links', async (req, res) => {
    try {
        const { originalUrl, shortCode } = req.body;

        if (!originalUrl) {
            return res.status(400).json({ success: false, message: 'الرابط الأصلي مطلوب' });
        }

        const generatedCode = shortCode || Math.random().toString(36).substring(2, 8);

        const newLink = await Link.create({
            userId: req.user._id,
            originalUrl,
            shortUrl: generatedCode
        });

        res.json({ success: true, message: 'تم إنشاء الرابط بنجاح', link: newLink });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ success: false, message: 'الرمز المختصر مستخدم بالفعل، يرجى اختيارات رمز آخر' });
        }
        res.status(500).json({ success: false, message: 'فشل إنشاء الرابط', error: error.message });
    }
});

// جلب الروابط الخاصة بالمستخدم الحالي
app.get('/api/links', async (req, res) => {
    try {
        const links = await Link.find({ userId: req.user._id }).sort({ createdAt: -1 });
        res.json({ success: true, links });
    } catch (error) {
        res.status(500).json({ success: false, message: 'فشل جلب الروابط', error: error.message });
    }
});


// ---------------------------------------------------------------
// 6. API الحملات الإعلانية (Campaigns)
// ---------------------------------------------------------------

// إنشاء حملة جديدة
app.post('/api/campaigns', async (req, res) => {
    const { title, budget, costPerClick, targetUrl } = req.body;

    if (!title || !budget || !costPerClick || !targetUrl) {
        return res.status(400).json({ success: false, message: 'جميع الحقول مطلوبة لإطلاق الحملة' });
    }

    const session = await mongoose.startSession();
    try {
        await session.withTransaction(async () => {
            // 1. خصم ميزانية الحملة من رصيد المحفظة
            const wallet = await Wallet.findOneAndUpdate(
                { userId: req.user._id, balance: { $gte: budget } },
                { $inc: { balance: -budget } },
                { new: true, session }
            );

            if (!wallet) {
                throw new Error('رصيد المحفظة غير كافٍ لإنشاء هذه الحملة الإعلانية');
            }

            // 2. إنشاء الحملة
            const campaign = await Campaign.create([{
                userId: req.user._id,
                title,
                budget,
                costPerClick,
                remainingBudget: budget,
                targetUrl
            }], { session });

            // 3. توثيق عملية الإنفاق في الحركات المالية
            await Transaction.create([{
                userId: req.user._id,
                type: 'spend',
                amount: budget,
                status: 'completed',
                description: `إنشاء حملة إعلانية: ${title}`,
                referenceId: campaign[0]._id
            }], { session });
        });

        res.json({ success: true, message: 'تم إنشاء الحملة وخصم الميزانية بنجاح' });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    } finally {
        session.endSession();
    }
});

// جلب حملات المستخدم
app.get('/api/campaigns', async (req, res) => {
    try {
        const campaigns = await Campaign.find({ userId: req.user._id }).sort({ createdAt: -1 });
        res.json({ success: true, campaigns });
    } catch (error) {
        res.status(500).json({ success: false, message: 'فشل جلب الحملات الإعلانية', error: error.message });
    }
});


// ---------------------------------------------------------------
// 7. API الإحصائيات والأرقام الشاملة (Dashboard Stats)
// ---------------------------------------------------------------
app.get('/api/stats', async (req, res) => {
    try {
        const userId = req.user._id;

        const [wallet, totalLinks, totalCampaigns] = await Promise.all([
            Wallet.findOne({ userId }),
            Link.countDocuments({ userId }),
            Campaign.countDocuments({ userId })
        ]);

        const stats = {
            balance: wallet ? wallet.balance : 0,
            totalEarned: wallet ? wallet.totalEarned : 0,
            totalSpent: wallet ? wallet.totalSpent : 0,
            totalLinks,
            totalCampaigns
        };

        res.json({ success: true, stats });
    } catch (error) {
        res.status(500).json({ success: false, message: 'فشل جلب الإحصائيات العامة', error: error.message });
    }
});


// ---------------------------------------------------------------
// 8. تشغيل الخادم
// ---------------------------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 الخادم يعمل بنجاح على المنفذ: ${PORT}`);
});
