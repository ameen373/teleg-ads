require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const path = require('path');
const { User, Link, Ad, Transaction } = require('./models');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// ==========================================
// 1. نظام الحماية وعزل البيانات (Security & Isolation)
// ==========================================

// دالة التحقق من صحة بيانات تليجرام (تمنع الاختراق وتزوير الحسابات)
function verifyTelegramData(initData) {
  const urlParams = new URLSearchParams(initData);
  const hash = urlParams.get('hash');
  urlParams.delete('hash');
  urlParams.sort();
  let dataCheckString = '';
  for (const [key, value] of urlParams.entries()) {
    dataCheckString += `${key}=${value}\n`;
  }
  dataCheckString = dataCheckString.slice(0, -1);
  const secret = crypto.createHmac('sha256', 'WebAppData').update(process.env.BOT_TOKEN).digest();
  const calculatedHash = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');
  return calculatedHash === hash;
}

// الميدل وير الخاص بفك التشفير وتحديد هوية المستخدم (فصل البيانات)
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
    if (err) return res.status(401).json({ error: 'Invalid token' });
    const user = await User.findById(decoded.id);
    if (!user || user.isBanned) return res.status(403).json({ error: 'Account access denied' });
    
    req.user = user; // 🔴 هنا يتم ربط الطلب بالمستخدم، وهذا ما يمنع تداخل البيانات!
    next();
  });
};

const isAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
};

// ==========================================
// 2. مسارات المصادقة (Authentication)
// ==========================================

app.post('/api/auth/login', async (req, res) => {
  const initData = req.headers['x-telegram-init-data'];
  const { telegramUserInfo, referrerId } = req.body;

  // في بيئة التطوير يمكن تخطي الفحص، في الإنتاج يجب أن يكون مفعل
  if (initData && !verifyTelegramData(initData) && process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Invalid Telegram Data' });
  }

  try {
    const tgId = telegramUserInfo.id.toString();
    let user = await User.findOne({ telegramId: tgId });

    if (!user) {
      user = new User({
        telegramId: tgId,
        username: telegramUserInfo.username,
        firstName: telegramUserInfo.first_name,
        isPremium: telegramUserInfo.is_premium
      });
      // نظام الإحالة
      if (referrerId && mongoose.Types.ObjectId.isValid(referrerId)) {
        user.referredBy = referrerId;
      }
      await user.save();
    }

    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, isAdmin: user.role === 'admin' });
  } catch (error) {
    res.status(500).json({ error: 'Login failed' });
  }
});

// ==========================================
// 3. مسارات المستخدم (User Specific Routes)
// ==========================================

// جلب بيانات المستخدم (يتم استخدام req.user._id حصراً لضمان عزل البيانات)
app.get('/api/user/data', authenticateToken, async (req, res) => {
  try {
    const links = await Link.find({ userId: req.user._id }).sort({ createdAt: -1 });
    const ads = await Ad.find({ advertiserId: req.user._id }).sort({ createdAt: -1 });
    const withdraws = await Transaction.find({ userId: req.user._id, type: 'withdraw' }).sort({ createdAt: -1 });
    
    // يمكنك إضافة الإعلانات العامة هنا (announcements) إذا كان لديك جدول لها
    res.json({
      user: req.user,
      isAdmin: req.user.role === 'admin',
      links,
      ads,
      withdraws,
      announcements: [] 
    });
  } catch (err) {
    res.status(500).json({ error: 'Error fetching user data' });
  }
});

app.post('/api/user/settings', authenticateToken, async (req, res) => {
  req.user.defaultWallet = req.body.defaultWallet;
  await req.user.save();
  res.json({ success: true });
});

// ==========================================
// 4. إدارة الروابط (Links Management)
// ==========================================

app.post('/api/links', authenticateToken, async (req, res) => {
  try {
    const shortCode = crypto.randomBytes(3).toString('hex'); // توليد كود عشوائي من 6 أحرف
    const newLink = new Link({
      userId: req.user._id,
      title: req.body.title || 'بدون عنوان',
      originalUrl: req.body.targetUrl,
      shortCode: shortCode
    });
    await newLink.save();
    res.json(newLink);
  } catch (err) {
    res.status(500).json({ error: 'Error creating link' });
  }
});

app.post('/api/links/toggle', authenticateToken, async (req, res) => {
  // الأمان: التأكد من أن المستخدم يملك هذا الرابط!
  const link = await Link.findOne({ _id: req.body.linkId, userId: req.user._id });
  if (!link) return res.status(404).json({ error: 'Link not found' });
  
  link.isActive = !link.isActive;
  await link.save();
  res.json({ success: true, isActive: link.isActive });
});

// ==========================================
// 5. إدارة الإعلانات والمحفظة (Ads & Wallet)
// ==========================================

app.post('/api/ads', authenticateToken, async (req, res) => {
  try {
    const { title, targetUrl, totalBudget } = req.body;
    if (req.user.availableBalance < totalBudget) {
      return res.status(400).json({ error: 'رصيدك غير كافٍ لإطلاق الحملة' });
    }

    req.user.availableBalance -= totalBudget; // خصم الميزانية
    await req.user.save();

    const newAd = new Ad({
      advertiserId: req.user._id,
      title, targetUrl, totalBudget, remainingBudget: totalBudget
    });
    await newAd.save();
    res.json(newAd);
  } catch (err) {
    res.status(500).json({ error: 'Error creating ad' });
  }
});

app.post('/api/deposit', authenticateToken, async (req, res) => {
  const tx = new Transaction({
    userId: req.user._id,
    type: 'deposit',
    amount: req.body.amount,
    paymentMethod: req.body.paymentMethod,
    txHash: req.body.txHash,
    status: 'pending'
  });
  await tx.save();
  res.json({ success: true });
});

app.post('/api/withdraw', authenticateToken, async (req, res) => {
  const { amount, walletAddress } = req.body;
  if (req.user.availableBalance < amount || amount < 30) {
    return res.status(400).json({ error: 'الرصيد غير كافٍ أو أقل من الحد الأدنى' });
  }

  req.user.availableBalance -= amount;
  await req.user.save();

  const tx = new Transaction({
    userId: req.user._id,
    type: 'withdraw',
    amount: amount,
    walletAddress: walletAddress,
    status: 'pending'
  });
  await tx.save();
  res.json({ success: true });
});

// ==========================================
// 6. نظام صفحة التوجيه والجسر (Bridge / Redirect)
// ==========================================
// (تم دمج منطق ظهور الإعلانات الداخلي كأولوية)

app.post('/api/init-click', async (req, res) => {
  const { linkCode } = req.body;
  const link = await Link.findOne({ shortCode: linkCode, isActive: true });
  if (!link) return res.status(404).json({ error: 'الرابط غير موجود أو معطل' });

  link.views += 1;
  await link.save();

  // جلب إعلان داخلي عشوائي إن وُجد وله ميزانية
  const ad = await Ad.findOne({ status: 'active', remainingBudget: { $gt: 0.001 } });
  
  res.json({
    sessionId: crypto.randomBytes(8).toString('hex'),
    adSource: ad ? 'internal' : 'adsgram',
    adData: ad ? { id: ad._id, title: ad.title, targetUrl: ad.targetUrl } : null,
    blockId: process.env.ADSGRAM_BLOCK_ID // يتم تمريره للفرونت إند إذا لم يوجد إعلان داخلي
  });
});

app.post('/api/impression', async (req, res) => {
  const { linkCode, duration } = req.body;
  // التحقق من أن الزائر مكث 5 ثوانٍ على الأقل
  if (duration < 5) return res.status(400).json({ error: 'زيارة غير صالحة' });

  const link = await Link.findOne({ shortCode: linkCode }).populate('userId');
  if (!link) return res.status(404).json({ error: 'Link not found' });

  link.validImpressions += 1;
  await link.save();

  // إضافة الأرباح لصاحب الرابط (مثلاً 0.0015 للمشاهدة)
  const user = link.userId;
  user.pendingBalance += 0.0015;
  await user.save();

  res.json({ targetUrl: link.originalUrl });
});

// ==========================================
// 7. توجيه الواجهة الأمامية و تشغيل السيرفر
// ==========================================

app.get('/r/:code', (req, res) => {
  res.sendFile(path.join(__dirname, 'views.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'views.html'));
});

mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    app.listen(process.env.PORT || 3000, () => console.log('Server is running and Data is Isolated! 🚀'));
  })
  .catch(err => console.error('DB Connection Error:', err));
