// controllers/linkController.js
const crypto = require('crypto');
const Link = require('../models/Link');

/**
 * دالة مساعدة لتوليد كود عشوائي فريد
 */
const generateUniqueCode = async (length = 7) => {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let code = '';
  let isUnique = false;
  let attempts = 0;

  while (!isUnique && attempts < 10) {
    code = '';
    const randomBytes = crypto.randomBytes(length);
    for (let i = 0; i < length; i++) {
      code += characters[randomBytes[i] % characters.length];
    }

    const existingLink = await Link.findOne({ code });
    if (!existingLink) {
      isUnique = true;
    }
    attempts++;
  }

  if (!isUnique) {
    code = `${Date.now().toString(36)}${Math.random().toString(36).substring(2, 5)}`;
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

    try {
      new URL(originalUrl);
    } catch (err) {
      return res.status(400).json({
        success: false,
        message: 'صيغة الرابط الأصلي غير صالحة'
      });
    }

    const randomLength = Math.floor(Math.random() * 3) + 6;
    const code = await generateUniqueCode(randomLength);

    const newLink = await Link.create({
      code,
      userId: req.user._id,
      originalUrl: originalUrl.trim(),
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
 * جلب جميع الروابط الخاصة بالمستخدم الحالي
 */
const getUserLinks = async (req, res) => {
  try {
    const links = await Link.find({ userId: req.user._id }).sort({ createdAt: -1 });

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

    const link = await Link.findOne({ _id: id, userId: req.user._id });

    if (!link) {
      return res.status(404).json({
        success: false,
        message: 'الرابط غير موجود أو ليس لديك صلاحية تعديله'
      });
    }

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
