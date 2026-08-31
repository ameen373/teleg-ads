const express = require('express');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
app.use(express.json());

// تحويل ADMIN_IDS من النص إلى مصفوفة أرقام
const ADMIN_IDS = (process.env.ADMIN_IDS || '')
  .split(',')
  .map(id => id.trim());

/**
 * دالة التحقق من صحة بيانات Telegram WebApp InitData
 */
function verifyTelegramWebAppData(telegramInitData) {
  const initData = new URLSearchParams(telegramInitData);
  const hash = initData.get('hash');
  if (!hash) return false;

  initData.delete('hash');

  const dataCheckArr = [];
  for (const [key, value] of initData.entries()) {
    dataCheckArr.push(`${key}=${value}`);
  }
  dataCheckArr.sort();

  const dataCheckString = dataCheckArr.join('\n');
  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(process.env.BOT_TOKEN)
    .digest();

  const calculatedHash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  return calculatedHash === hash;
}

/**
 * Middleware للتحقق من أن المستخدم أدمن
 */
function isAdmin(req, res, next) {
  const initDataRaw = req.headers['x-telegram-init-data'];

  if (!initDataRaw) {
    return res.status(401).json({ success: false, error: 'غير مصرح: لا توجد بيانات اعتماد.' });
  }

  // 1. التحقق من توقيع البيانات منعاً للتزوير
  const isValid = verifyTelegramWebAppData(initDataRaw);
  if (!isValid) {
    return res.status(403).json({ success: false, error: 'بيانات غير صالحة أو تم التلاعب بها.' });
  }

  // 2. استخراج بيانات المستخدم
  const urlParams = new URLSearchParams(initDataRaw);
  const userJson = urlParams.get('user');
  
  if (!userJson) {
    return res.status(400).json({ success: false, error: 'بيانات المستخدم غير مكتملة.' });
  }

  const user = JSON.parse(userJson);
  const userId = String(user.id);

  // 3. التحقق من وجود ID المستخدم داخل ADMIN_IDS
  if (!ADMIN_IDS.includes(userId)) {
    return res.status(403).json({ success: false, error: 'عذراً، لا تملك صلاحية الوصول لقسم الإدارة.' });
  }

  req.adminUser = user;
  next();
}

// Endpoint للتحقق من صلاحية الأدمن عند فتح الصفحة
app.get('/api/admin/verify', isAdmin, (req, res) => {
  res.json({ success: true, message: 'مرحباً بك في لوحة التحكم', user: req.adminUser });
});

// مثال لـ Endpoint خاص بالإحصائيات محمية بـ isAdmin
app.get('/api/admin/stats', isAdmin, async (req, res) => {
  // كود جلب الإحصائيات الخاصة بالإدارة
  res.json({ success: true, data: { usersCount: 0, adsCount: 0 } });
});
