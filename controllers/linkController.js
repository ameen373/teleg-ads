// controllers/linkController.js
const crypto = require('crypto');
const Link = require('../models/Link');

/**
 * دالة مساعدة لتوليد كود عشوائي فريد مكون من 6-8 رموز
 */
const generateUniqueCode = async (length = 7) => {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let code = '';
  let isUnique = false;

  while (!isUnique) {
    code = '';
    const randomBytes = crypto.randomBytes(length);
    for (let i = 0; i < length; i++) {
      code += characters[randomBytes[i] % characters.length];
    }

    // التأكد من عدم تكرار الكود في قاعدة البيانات
    const existingLink = await Link.findOne({ code });
    if (!existingLink) {
      isUnique = true;
    }
  }

  return code;
};

/**
 * إنشاء رابط مختصر جديد
 */
const createLink = async (req, res) => {
  try {
    const { originalUrl, title } = req.body;

    if (!originalUrl) {
      return res.status(400).json({
        success: false,
        message: 'الرابط الأصلي (originalUrl) مطلوب'
      });
    }

    // التحقق من صحة صياغة الرابط
    try {
      new URL(originalUrl);
    } catch (err) {
      return res.status(400).json({
        success: false,
        message: 'صيغة الرابط الأصلي غير صالحة'
      });
    }

    // توليد كود عشوائي فريد (بين 6 إلى 8 رموز)
    const randomLength = Math.floor(Math.random() * 3) + 6; // 6 أو 7 أو 8
    const code = await generateUniqueCode(randomLength);

    // إنشاء وحفظ الرابط الجديد في قاعدة البيانات
    const newLink = await Link.create({
      code,
      userId: req.user._id,
      originalUrl,
      title: title ? title.trim() : ''
    });

    return res.status(201).json({
      success: true,
      message: 'تم إنشاء الرابط المختصر بنجاح',
      data: newLink
    });
  } catch (error) {
    console.error('[linkController: createLink Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء إنشاء الرابط المختصر',
      error: error.message
    });
  }
};

/**
 * جلب جميع الروابط الخاصة بالمستخدم الحالي مع إحصائياتها
 */
const getUserLinks = async (req, res) => {
  try {
    const links = await Link.find({ userId: req.user._id })
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: links.length,
      data: links
    });
  } catch (error) {
    console.error('[linkController: getUserLinks Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء جلب قائمة الروابط',
      error: error.message
    });
  }
};

/**
 * تغيير حالة الرابط (تفعيل / تعطيل)
 */
const toggleLinkStatus = async (req, res) => {
  try {
    const { id } = req.params;

    // البحث عن الرابط وتأكيد ملكيته للمستخدم الحالي
    const link = await Link.findOne({ _id: id, userId: req.user._id });

    if (!link) {
      return res.status(404).json({
        success: false,
        message: 'الرابط غير موجود أو ليس لديك صلاحية تعديله'
      });
    }

    // تبديل الحالة
    link.isActive = !link.isActive;
    await link.save();

    return res.status(200).json({
      success: true,
      message: `تم ${link.isActive ? 'تفعيل' : 'تعطيل'} الرابط بنجاح`,
      data: {
        id: link._id,
        code: link.code,
        isActive: link.isActive
      }
    });
  } catch (error) {
    console.error('[linkController: toggleLinkStatus Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء تعديل حالة الرابط',
      error: error.message
    });
  }
};

module.exports = {
  createLink,
  getUserLinks,
  toggleLinkStatus
};

