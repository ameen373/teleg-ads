import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import TelegramBot from 'node-telegram-bot-api';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  db,
  bucket,
  FieldValue,
  Collections,
  CONFIG,
  SUPPORTED_LANGUAGES,
  CHANNEL_CATEGORIES,
  createUserSchema,
  createChannelSchema,
  createCampaignSchema
} from './models.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 } // 25MB حد أقصى للصور والفيديو
});

const BOT_TOKEN = process.env.BOT_TOKEN || '';
const OWNER_ID = String(process.env.OWNER_TELEGRAM_ID || '');
const WEBAPP_URL = process.env.WEBAPP_URL || '';

const bot = BOT_TOKEN ? new TelegramBot(BOT_TOKEN, { polling: false }) : null;

// ==================== دوال مساعدة للإشعارات والتنسيق ====================

async function sendSystemNotification(userId, title, message, type = 'info') {
  if (!userId) return;
  const notifRef = Collections.NOTIFICATIONS.doc();
  await notifRef.set({
    id: notifRef.id,
    userId: String(userId),
    title,
    message,
    type,
    read: false,
    createdAt: Date.now()
  });

  if (bot) {
    try {
      await bot.sendMessage(String(userId), `🔔 *${title}*\n\n${message}`, {
        parse_mode: 'Markdown'
      });
    } catch (_) {
      // تجاهل إذا لم يبدأ المستخدم محادثة خاصة مع البوت بعد
    }
  }
}

function buildPlatformPromoText() {
  return (
    '✨ إعلانك يصل بدقة، وقناتك تكسب بدون تعقيد.\n' +
    'أطلق حملتك أو حقق الدخل من قناتك مع تتبع لحظي وعوائد إحالة مستمرة ⚡'
  );
}

function buildReferralLink(publisherId) {
  const cleanWebApp = WEBAPP_URL ? `${WEBAPP_URL}?start=ref_${publisherId}` : `https://t.me/${CONFIG.BOT_USERNAME}?start=ref_${publisherId}`;
  return cleanWebApp;
}

function formatAdvertiserPost(campaign, publisherId) {
  const refLink = buildReferralLink(publisherId);
  return (
    `${campaign.adText}\n\n` +
    `— — —\n` +
    `Powered by [Telega.ads](${refLink})`
  );
}

// ==================== منطق البوت الذكي عند الإضافة كمسؤول ====================

export async function handleBotMyChatMemberUpdate(update) {
  if (!bot || !update || !update.chat) return;

  const chat = update.chat;
  const actor = update.from; // الشخص الذي قام بإضافة البوت أو تعديل صلاحياته
  const newStatus = update.new_chat_member?.status;

  // قبول القنوات العامة فقط (يجب أن تكون قناة ولها username عام)
  if (chat.type !== 'channel') return;

  const channelDocId = String(chat.id);
  const channelRef = Collections.CHANNELS.doc(channelDocId);
  const existingSnap = await channelRef.get();

  const isAdminNow = newStatus === 'administrator';
  const canPostMessages = Boolean(update.new_chat_member?.can_post_messages);

  if (!chat.username) {
    if (isAdminNow && actor?.id) {
      await bot.sendMessage(
        String(actor.id),
        '❌ يتم قبول القنوات العامة فقط التي تمتلك معرفاً عاماً (@username). يرجى جعل القناة عامة ثم إعادة المحاولة.'
      );
      try {
        await bot.leaveChat(chat.id);
      } catch (_) {}
    }
    return;
  }

  // جلب بيانات القناة المحدثة وعدد المشتركين
  let chatInfo = chat;
  let subscribersCount = existingSnap.exists ? existingSnap.data().subscribers : 0;
  try {
    chatInfo = await bot.getChat(chat.id);
    subscribersCount = await bot.getChatMemberCount(chat.id);
  } catch (_) {}

  let photoUrl = existingSnap.exists ? existingSnap.data().photoUrl : '';
  if (chatInfo.photo?.big_file_id) {
    try {
      photoUrl = await bot.getFileLink(chatInfo.photo.big_file_id);
    } catch (_) {}
  }

  if (!existingSnap.exists) {
    if (!isAdminNow) return;

    // التعرف التلقائي على من أضاف البوت كمسؤول وتسجيل القناة بانتظار استكمال السعر/اللغة/التصنيف أو الاعتماد
    const ownerId = actor?.id ? String(actor.id) : '';
    if (ownerId) {
      const userRef = Collections.USERS.doc(ownerId);
      const userSnap = await userRef.get();
      if (!userSnap.exists) {
        await userRef.set(
          createUserSchema({ id: actor.id, first_name: actor.first_name, language_code: actor.language_code })
        );
      }
    }

    const newChannel = createChannelSchema({
      chatId: chat.id,
      username: chat.username,
      title: chatInfo.title || chat.title,
      photoUrl,
      subscribers: subscribersCount,
      ownerId,
      cpmPrice: CONFIG.MIN_CPM_PRICE,
      language: 'ar',
      category: 'other'
    });

    newChannel.botHasAdmin = isAdminNow && canPostMessages;
    newChannel.status = 'awaiting_setup'; // بانتظار تحديد السعر واللغة والتصنيف من قسم قنواتي
    await channelRef.set(newChannel);

    if (ownerId) {
      await sendSystemNotification(
        ownerId,
        'تم التعرف على إضافتك للبوت',
        `تم رصد إضافتك للبوت @${CONFIG.BOT_USERNAME} كمسؤول في القناة "${newChannel.title}". افتح قسم "قنواتي" لإكمال تحديد السعر (1$ - 3$) واللغة والتصنيف.`,
        'channel_detected'
      );
    }
    return;
  }

  // تحديث مستمر لبيانات القناة وحالة صلاحيات البوت إذا كانت القناة مسجلة مسبقاً
  const prev = existingSnap.data();
  const updates = {
    title: chatInfo.title || prev.title,
    username: chat.username,
    photoUrl: photoUrl || prev.photoUrl,
    subscribers: subscribersCount,
    botHasAdmin: isAdminNow && canPostMessages,
    updatedAt: Date.now()
  };

  if (!isAdminNow || !canPostMessages) {
    updates.status = 'permission_lost';
    await channelRef.update(updates);
    if (prev.ownerId) {
      await sendSystemNotification(
        prev.ownerId,
        'تنبيه صلاحيات البوت',
        `فقد البوت صلاحية النشر أو الإشراف في القناة "${updates.title}". يرجى إعادة منح الصلاحيات لاستمرار استقبال الإعلانات.`,
        'permission_warning'
      );
    }
  } else if (prev.status === 'permission_lost') {
    updates.status = subscribersCount > CONFIG.AUTO_APPROVE_SUBSCRIBERS ? 'approved' : 'pending_admin';
    await channelRef.update(updates);
    if (updates.status === 'approved' && !prev.promoPostSent) {
      await publishPlatformFreePromo(channelRef, { ...prev, ...updates });
    }
  } else {
    await channelRef.update(updates);
  }
}

// نشر الإعلان المجاني للمنصة عند قبول القناة
async function publishPlatformFreePromo(channelRef, channelData) {
  if (!bot || channelData.promoPostSent || !channelData.botHasAdmin) return;

  try {
    const refLink = buildReferralLink(channelData.ownerId);
    const sentMsg = await bot.sendMessage(channelData.chatId, buildPlatformPromoText(), {
      reply_markup: {
        inline_keyboard: [[{ text: 'Open ←', url: refLink }]]
      }
    });

    await channelRef.update({
      promoPostSent: true,
      promoMessageId: sentMsg.message_id,
      updatedAt: Date.now()
    });
  } catch (err) {
    console.error('Error publishing platform promo:', err.message);
  }
}

// ==================== منطق نشر الحملات وجلب المشاهدات والخصم الذري ====================

async function publishCampaignToChannel(campaignDoc, channelDoc) {
  if (!bot) return { ok: false, reason: 'bot_not_configured' };

  const campaign = campaignDoc.data();
  const channel = channelDoc.data();

  // قيود النشر وصلاحيات القناة
  if (campaign.status !== 'active') return { ok: false, reason: 'campaign_not_active' };
  if (!channel.botHasAdmin || channel.status !== 'approved') {
    return { ok: false, reason: 'channel_not_eligible' };
  }
  if (campaign.remainingBudget < channel.cpmPrice) {
    return { ok: false, reason: 'insufficient_budget' };
  }

  // منع تكرار نشر الإعلان لنفس الحملة في نفس القناة
  const logId = `${campaignDoc.id}_${channelDoc.id}`;
  const logRef = Collections.POST_LOGS.doc(logId);
  const existingLog = await logRef.get();
  if (existingLog.exists) {
    return { ok: false, reason: 'already_published' };
  }

  const formattedText = formatAdvertiserPost(campaign, channel.ownerId);
  const replyMarkup = {
    inline_keyboard: [[{ text: campaign.buttonText || 'Open', url: campaign.buttonUrl }]]
  };

  let sentMessage;
  if (campaign.mediaType === 'photo' && campaign.mediaUrl) {
    sentMessage = await bot.sendPhoto(channel.chatId, campaign.mediaUrl, {
      caption: formattedText,
      parse_mode: 'Markdown',
      reply_markup: replyMarkup
    });
  } else if (campaign.mediaType === 'video' && campaign.mediaUrl) {
    sentMessage = await bot.sendVideo(channel.chatId, campaign.mediaUrl, {
      caption: formattedText,
      parse_mode: 'Markdown',
      reply_markup: replyMarkup
    });
  } else {
    sentMessage = await bot.sendMessage(channel.chatId, formattedText, {
      parse_mode: 'Markdown',
      reply_markup: replyMarkup,
      disable_web_page_preview: false
    });
  }

  await logRef.set({
    id: logId,
    campaignId: campaignDoc.id,
    channelId: channelDoc.id,
    advertiserId: campaign.advertiserId,
    publisherId: channel.ownerId,
    messageId: sentMessage.message_id,
    cpmPrice: channel.cpmPrice,
    countedViews: 0,
    settledAmount: 0,
    publishedAt: Date.now(),
    lastViewSyncAt: Date.now()
  });

  await campaignDoc.ref.update({
    'stats.channelsPublished': FieldValue.increment(1),
    updatedAt: Date.now()
  });

  return { ok: true, messageId: sentMessage.message_id };
}

// جلب حي لعدد المشاهدات وتحديث الأرباح وخصم الميزانية مع منع الخصم المكرر ومعاملة ذرية
async function syncViewsAndSettle() {
  if (!bot) return { syncedLogs: 0 };

  const logsSnap = await Collections.POST_LOGS.get();
  let syncedLogs = 0;

  for (const logDoc of logsSnap.docs) {
    const log = logDoc.data();
    const campaignRef = Collections.CAMPAIGNS.doc(log.campaignId);
    const channelRef = Collections.CHANNELS.doc(log.channelId);

    const [campaignSnap, channelSnap] = await Promise.all([campaignRef.get(), channelRef.get()]);
    if (!campaignSnap.exists || !channelSnap.exists) continue;

    const campaign = campaignSnap.data();
    const channel = channelSnap.data();

    if (campaign.status !== 'active' || campaign.remainingBudget <= 0) continue;

    // جلب عدد المشاهدات الحالي من تيليجرام
    let currentViews = log.countedViews || 0;
    try {
      const forwarded = await bot.forwardMessage(
        channel.ownerId || campaign.advertiserId,
        channel.chatId,
        log.messageId
      );
      if (typeof forwarded.views === 'number' && forwarded.views > currentViews) {
        currentViews = forwarded.views;
      }
      await bot.deleteMessage(channel.ownerId || campaign.advertiserId, forwarded.message_id);
    } catch (_) {
      // إذا تعذر جلب المشاهدات المباشرة، نبقي القيمة الحالية دون اختراع أرقام وهمية
    }

    const newViews = Math.max(0, currentViews - (log.countedViews || 0));
    if (newViews <= 0) continue;

    // حساب التكلفة لكل 1000 مشاهدة (CPM)
    const rawCost = (newViews / 1000) * Number(channel.cpmPrice);

    await db.runTransaction(async (tx) => {
      const freshLog = await tx.get(logDoc.ref);
      const freshCampaign = await tx.get(campaignRef);
      const freshChannel = await tx.get(channelRef);

      if (!freshLog.exists || !freshCampaign.exists || !freshChannel.exists) return;

      const latestCountedViews = freshLog.data().countedViews || 0;
      const deltaViews = currentViews - latestCountedViews;
      if (deltaViews <= 0) return;

      const latestRemaining = Number(freshCampaign.data().remainingBudget || 0);
      if (latestRemaining <= 0) {
        tx.update(campaignRef, { status: 'paused', updatedAt: Date.now() });
        return;
      }

      const chargeableCost = Math.min(latestRemaining, Number(((deltaViews / 1000) * Number(freshChannel.data().cpmPrice)).toFixed(6)));
      if (chargeableCost <= 0) return;

      // نظام الاستثناء المالي: لا توجد أي عمولة إحالة قادمة من المُعلنين؛ العمولة 10% تُحسب من أرباح الناشر فقط
      const publisherRef = Collections.USERS.doc(String(freshChannel.data().ownerId));
      const publisherSnap = await tx.get(publisherRef);
      let referralCommission = 0;
      let referrerRef = null;

      if (publisherSnap.exists && publisherSnap.data().referredBy) {
        referralCommission = Number((chargeableCost * CONFIG.REFERRAL_COMMISSION_RATE).toFixed(6));
        referrerRef = Collections.USERS.doc(String(publisherSnap.data().referredBy));
      }

      const netPublisherEarnings = Number((chargeableCost - referralCommission).toFixed(6));
      const newRemainingBudget = Number((latestRemaining - chargeableCost).toFixed(6));

      tx.update(logDoc.ref, {
        countedViews: currentViews,
        settledAmount: FieldValue.increment(chargeableCost),
        lastViewSyncAt: Date.now()
      });

      tx.update(campaignRef, {
        remainingBudget: newRemainingBudget,
        spentBudget: FieldValue.increment(chargeableCost),
        'stats.totalViews': FieldValue.increment(deltaViews),
        status: newRemainingBudget <= 0 ? 'paused' : freshCampaign.data().status,
        updatedAt: Date.now()
      });

      tx.update(channelRef, {
        totalViewsDelivered: FieldValue.increment(deltaViews),
        totalEarned: FieldValue.increment(netPublisherEarnings),
        updatedAt: Date.now()
      });

      if (publisherSnap.exists) {
        tx.update(publisherRef, {
          pendingEarnings: FieldValue.increment(netPublisherEarnings),
          updatedAt: Date.now()
        });
      }

      if (referrerRef && referralCommission > 0) {
        tx.update(referrerRef, {
          pendingEarnings: FieldValue.increment(referralCommission),
          totalReferralEarnings: FieldValue.increment(referralCommission),
          updatedAt: Date.now()
        });
      }

      const txRef = Collections.TRANSACTIONS.doc();
      tx.set(txRef, {
        id: txRef.id,
        campaignId: log.campaignId,
        channelId: log.channelId,
        advertiserId: freshCampaign.data().advertiserId,
        publisherId: freshChannel.data().ownerId,
        viewsCounted: deltaViews,
        chargedAmount: chargeableCost,
        publisherNetEarnings: netPublisherEarnings,
        referralCommission,
        createdAt: Date.now()
      });

      syncedLogs += 1;
    });
  }

  return { syncedLogs };
}

// مراقبة صلاحيات البوت باستمرار في جميع القنوات المسجلة
async function monitorAllChannelsPermissions() {
  if (!bot) return;
  const snap = await Collections.CHANNELS.get();
  const botInfo = await bot.getMe();

  for (const doc of snap.docs) {
    const ch = doc.data();
    try {
      const member = await bot.getChatMember(ch.chatId, botInfo.id);
      const chatInfo = await bot.getChat(ch.chatId);
      const subsCount = await bot.getChatMemberCount(ch.chatId);

      const hasAdmin = member.status === 'administrator' && Boolean(member.can_post_messages);
      const nextStatus = !hasAdmin
        ? 'permission_lost'
        : ch.status === 'permission_lost'
          ? subsCount > CONFIG.AUTO_APPROVE_SUBSCRIBERS
            ? 'approved'
            : 'pending_admin'
          : ch.status;

      await doc.ref.update({
        title: chatInfo.title || ch.title,
        subscribers: subsCount,
        botHasAdmin: hasAdmin,
        status: nextStatus,
        updatedAt: Date.now()
      });

      if (!hasAdmin && ch.status !== 'permission_lost' && ch.ownerId) {
        await sendSystemNotification(
          ch.ownerId,
          'انقطاع صلاحيات البوت',
          `تم رصد فقدان صلاحية النشر للبوت في القناة "${ch.title}".`,
          'permission_lost'
        );
      }
    } catch (_) {
      await doc.ref.update({
        botHasAdmin: false,
        status: 'permission_lost',
        updatedAt: Date.now()
      });
    }
  }
}

// ==================== مسارات Webhook وبوت تيليجرام ====================

app.post('/api/bot/webhook', async (req, res) => {
  try {
    const update = req.body;

    if (update.my_chat_member) {
      await handleBotMyChatMemberUpdate(update.my_chat_member);
    }

    if (update.message?.text && bot) {
      const msg = update.message;
      const chatId = msg.chat.id;
      const text = msg.text.trim();

      if (text.startsWith('/start')) {
        const parts = text.split(' ');
        let referrerId = null;
        if (parts[1] && parts[1].startsWith('ref_')) {
          referrerId = parts[1].replace('ref_', '');
        }

        const userRef = Collections.USERS.doc(String(msg.from.id));
        const userSnap = await userRef.get();
        if (!userSnap.exists) {
          await userRef.set(createUserSchema(msg.from, referrerId));
          if (referrerId && referrerId !== String(msg.from.id)) {
            await sendSystemNotification(
              referrerId,
              'إحالة جديدة عبر رابطك',
              'انضم مستخدم جديد إلى المنصة عبر رابط الإحالة الخاص بك وستصلك عمولة 10% من أرباحه كناشر عند تحقيق المشاهدات.',
              'referral'
            );
          }
        }

        await bot.sendMessage(
          chatId,
          '✨ إعلانك يصل بدقة، وقناتك تكسب بدون تعقيد.\nأطلق حملتك أو حقق الدخل من قناتك مع تتبع لحظي وعوائد إحالة مستمرة ⚡',
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: 'Open ←', url: WEBAPP_URL || `https://t.me/${CONFIG.BOT_USERNAME}` }]
              ]
            }
          }
        );
      }
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==================== مسارات API للواجهة الأمامية ====================

app.get('/api/meta', (_req, res) => {
  res.json({
    botUsername: CONFIG.BOT_USERNAME,
    botLink: CONFIG.BOT_LINK,
    minPrice: CONFIG.MIN_CPM_PRICE,
    maxPrice: CONFIG.MAX_CPM_PRICE,
    autoApproveSubscribers: CONFIG.AUTO_APPROVE_SUBSCRIBERS,
    openTargetingMinBudget: CONFIG.OPEN_TARGETING_MIN_BUDGET,
    languages: SUPPORTED_LANGUAGES,
    categories: CHANNEL_CATEGORIES
  });
});

// تسجيل أو جلب بيانات المستخدم
app.post('/api/user/init', async (req, res) => {
  try {
    const { telegramUser, startParam } = req.body;
    if (!telegramUser?.id) return res.status(400).json({ error: 'Invalid Telegram user' });

    const userId = String(telegramUser.id);
    const userRef = Collections.USERS.doc(userId);
    const snap = await userRef.get();

    let referrerId = null;
    if (typeof startParam === 'string' && startParam.startsWith('ref_')) {
      const candidateRef = startParam.replace('ref_', '');
      if (candidateRef !== userId) referrerId = candidateRef;
    }

    if (!snap.exists) {
      const newUser = createUserSchema(telegramUser, referrerId);
      await userRef.set(newUser);
      if (referrerId) {
        await sendSystemNotification(
          referrerId,
          'إحالة ناشر جديدة',
          'تم تسجيل مستخدم جديد عبر رابط الإحالة الخاص بك.',
          'referral'
        );
      }
      return res.json({ user: newUser });
    }

    const existing = snap.data();
    if (!existing.referredBy && referrerId) {
      await userRef.update({ referredBy: referrerId, updatedAt: Date.now() });
      existing.referredBy = referrerId;
    }

    res.json({ user: existing });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// جلب قنوات المالك فقط (قسم قنواتي)
app.get('/api/channels/mine', async (req, res) => {
  try {
    const ownerId = String(req.query.ownerId || '');
    if (!ownerId) return res.status(400).json({ error: 'ownerId required' });

    const snap = await Collections.CHANNELS.where('ownerId', '==', ownerId).get();
    const channels = snap.docs.map((d) => {
      const data = d.data();
      // إخفاء بيانات حساسة غير لازمة للعرض العام
      return {
        id: d.id,
        title: data.title,
        photoUrl: data.photoUrl,
        subscribers: data.subscribers,
        cpmPrice: data.cpmPrice,
        language: data.language,
        category: data.category,
        status: data.status,
        botHasAdmin: data.botHasAdmin,
        promoPostSent: data.promoPostSent,
        totalViewsDelivered: data.totalViewsDelivered,
        totalEarned: data.totalEarned,
        updatedAt: data.updatedAt
      };
    });

    res.json({ channels });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// حفظ أو تحديث إعدادات القناة (السعر 1$ - 3$، اللغة، التصنيف) والتحقق من البوت والقبول التلقائي > 1000
app.post('/api/channels/configure', async (req, res) => {
  try {
    const { channelId, ownerId, cpmPrice, language, category } = req.body;
    const priceNum = Number(cpmPrice);

    if (!channelId || !ownerId) {
      return res.status(400).json({ error: 'channelId and ownerId are required' });
    }
    if (Number.isNaN(priceNum) || priceNum < CONFIG.MIN_CPM_PRICE || priceNum > CONFIG.MAX_CPM_PRICE) {
      return res.status(400).json({ error: 'السعر يجب أن يكون بين 1$ و 3$' });
    }

    const channelRef = Collections.CHANNELS.doc(String(channelId));
    const snap = await channelRef.get();
    if (!snap.exists) {
      return res.status(404).json({ error: 'القناة غير موجودة؛ تأكد أولاً من إضافة البوت كمسؤول في قناة عامة' });
    }

    const data = snap.data();
    if (String(data.ownerId) !== String(ownerId)) {
      return res.status(403).json({ error: 'غير مصرح لك بتعديل هذه القناة' });
    }

    let subscribers = data.subscribers || 0;
    let botHasAdmin = Boolean(data.botHasAdmin);
    let title = data.title;
    let photoUrl = data.photoUrl;

    if (bot) {
      try {
        const botInfo = await bot.getMe();
        const member = await bot.getChatMember(data.chatId, botInfo.id);
        const chatInfo = await bot.getChat(data.chatId);
        subscribers = await bot.getChatMemberCount(data.chatId);
        title = chatInfo.title || title;
        botHasAdmin = member.status === 'administrator' && Boolean(member.can_post_messages);
        if (chatInfo.photo?.big_file_id) {
          photoUrl = await bot.getFileLink(chatInfo.photo.big_file_id);
        }
      } catch (_) {}
    }

    if (!botHasAdmin) {
      await channelRef.update({
        cpmPrice: priceNum,
        language,
        category,
        subscribers,
        botHasAdmin: false,
        status: 'permission_lost',
        updatedAt: Date.now()
      });
      return res.status(400).json({ error: 'يجب إضافة البوت @adTelega_bot كمسؤول بصلاحية النشر في القناة العامة أولاً' });
    }

    const nextStatus = subscribers > CONFIG.AUTO_APPROVE_SUBSCRIBERS ? 'approved' : 'pending_admin';

    await channelRef.update({
      title,
      photoUrl,
      subscribers,
      cpmPrice: priceNum,
      language,
      category,
      botHasAdmin: true,
      status: nextStatus,
      updatedAt: Date.now()
    });

    const updatedData = { ...data, title, photoUrl, subscribers, cpmPrice: priceNum, language, category, status: nextStatus };

    if (nextStatus === 'approved') {
      await publishPlatformFreePromo(channelRef, updatedData);
      await sendSystemNotification(
        ownerId,
        'تم قبول القناة تلقائياً',
        `تمت الموافقة التلقائية على قناة "${title}" لأن عدد المشتركين (${subscribers}) أكبر من 1000، وتم نشر إعلان المنصة المجاني.`,
        'channel_approved'
      );
    } else {
      await sendSystemNotification(
        ownerId,
        'القناة بانتظار مراجعة الإدارة',
        `تم استلام طلب قناة "${title}" (${subscribers} مشترك) وهي بانتظار موافقة أو رفض الإدارة.`,
        'channel_pending'
      );
    }

    res.json({ channel: updatedData });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// استعراض القنوات المعتمدة للمعلنين (مع البحث والفلترة، وإخفاء معرفات/روابط الدخول المباشر للقناة)
app.get('/api/channels/verified', async (req, res) => {
  try {
    const search = String(req.query.search || '').trim().toLowerCase();
    const language = String(req.query.language || '');
    const category = String(req.query.category || '');
    const minPrice = Number(req.query.minPrice || CONFIG.MIN_CPM_PRICE);
    const maxPrice = Number(req.query.maxPrice || CONFIG.MAX_CPM_PRICE);

    const snap = await Collections.CHANNELS.where('status', '==', 'approved')
      .where('botHasAdmin', '==', true)
      .get();

    const list = snap.docs
      .map((d) => {
        const c = d.data();
        return {
          id: d.id,
          title: c.title,
          photoUrl: c.photoUrl,
          subscribers: c.subscribers,
          cpmPrice: c.cpmPrice,
          language: c.language,
          category: c.category
        };
      })
      .filter((c) => {
        if (search && !c.title.toLowerCase().includes(search)) return false;
        if (language && language !== 'all' && c.language !== language) return false;
        if (category && category !== 'all' && c.category !== category) return false;
        if (c.cpmPrice < minPrice || c.cpmPrice > maxPrice) return false;
        return true;
      });

    res.json({ channels: list });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// إضافة أو إزالة قناة من المفضلة للمعلن
app.post('/api/user/favorites', async (req, res) => {
  try {
    const { userId, channelId } = req.body;
    if (!userId || !channelId) return res.status(400).json({ error: 'userId and channelId required' });

    const userRef = Collections.USERS.doc(String(userId));
    const snap = await userRef.get();
    if (!snap.exists) return res.status(404).json({ error: 'User not found' });

    const currentFavs = Array.isArray(snap.data().favoriteChannels) ? snap.data().favoriteChannels : [];
    const exists = currentFavs.includes(String(channelId));
    const nextFavs = exists
      ? currentFavs.filter((id) => id !== String(channelId))
      : [...currentFavs, String(channelId)];

    await userRef.update({ favoriteChannels: nextFavs, updatedAt: Date.now() });
    res.json({ favoriteChannels: nextFavs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// رفع صور أو فيديو من المعرض إلى Firebase Storage
app.post('/api/media/upload', upload.single('media'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'لم يتم اختيار ملف صورة أو فيديو' });

    const isVideo = req.file.mimetype.startsWith('video/');
    const isImage = req.file.mimetype.startsWith('image/');
    if (!isVideo && !isImage) {
      return res.status(400).json({ error: 'يُسمح فقط برفع الصور أو مقاطع الفيديو' });
    }

    const fileName = `campaigns/${Date.now()}_${req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const file = bucket.file(fileName);

    await file.save(req.file.buffer, {
      metadata: { contentType: req.file.mimetype }
    });
    await file.makePublic();

    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
    res.json({
      mediaUrl: publicUrl,
      mediaType: isVideo ? 'video' : 'photo'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// إنشاء حملة إعلانية جديدة أو حفظها كمسودة
app.post('/api/campaigns', async (req, res) => {
  try {
    const payload = req.body;
    const isDraft = payload.saveAsDraft === true;
    const budget = Number(payload.budget || 0);

    if (!isDraft) {
      if (!payload.advertiserId || !payload.title || !payload.adText || budget <= 0) {
        return res.status(400).json({ error: 'يرجى استكمال بيانات الحملة والميزانية' });
      }
      const userSnap = await Collections.USERS.doc(String(payload.advertiserId)).get();
      const balance = userSnap.exists ? Number(userSnap.data().advertiserBalance || 0) : 0;
      if (balance < budget) {
        return res.status(400).json({ error: 'رصيد المعلن غير كافٍ لتغطية ميزانية الحملة' });
      }
    }

    const status = isDraft
      ? 'draft'
      : payload.scheduleType === 'peak_hours'
        ? 'scheduled'
        : 'active';

    const campaignData = createCampaignSchema({
      ...payload,
      status
    });

    const ref = Collections.CAMPAIGNS.doc();
    await ref.set(campaignData);

    // نشر فوري في القنوات المستهدفة إذا كانت الحملة نشطة
    if (status === 'active') {
      const approvedSnap = await Collections.CHANNELS.where('status', '==', 'approved').get();
      for (const chDoc of approvedSnap.docs) {
        const ch = chDoc.data();
        const t = campaignData.targeting;

        const matchesSpecific = Array.isArray(t.specificChannelIds) && t.specificChannelIds.includes(chDoc.id);
        const matchesOpen = t.openTargeting && budget > CONFIG.OPEN_TARGETING_MIN_BUDGET;
        const matchesCriteria =
          ch.cpmPrice >= t.minPrice &&
          ch.cpmPrice <= t.maxPrice &&
          (!t.languages.length || t.languages.includes(ch.language)) &&
          (!t.categories.length || t.categories.includes(ch.category));

        if (matchesSpecific || matchesOpen || matchesCriteria) {
          await publishCampaignToChannel(ref, chDoc);
        }
      }
    }

    res.json({ id: ref.id, campaign: campaignData });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// عرض حملات المعلن مع إحصائيات كل حملة
app.get('/api/campaigns/mine', async (req, res) => {
  try {
    const advertiserId = String(req.query.advertiserId || '');
    if (!advertiserId) return res.status(400).json({ error: 'advertiserId required' });

    const snap = await Collections.CAMPAIGNS.where('advertiserId', '==', advertiserId).get();
    const campaigns = [];

    for (const doc of snap.docs) {
      const logsSnap = await Collections.POST_LOGS.where('campaignId', '==', doc.id).get();
      const postLogs = logsSnap.docs.map((l) => ({
        channelId: l.data().channelId,
        countedViews: l.data().countedViews,
        settledAmount: l.data().settledAmount,
        publishedAt: l.data().publishedAt
      }));

      campaigns.push({
        id: doc.id,
        ...doc.data(),
        postLogs
      });
    }

    res.json({ campaigns });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// استئناف الحملة (Resume) مع إمكانية شحن الميزانية وإعادة النشر تلقائياً
app.post('/api/campaigns/:id/resume', async (req, res) => {
  try {
    const campaignId = req.params.id;
    const addBudget = Number(req.body.addBudget || 0);
    const advertiserId = String(req.body.advertiserId || '');

    const campaignRef = Collections.CAMPAIGNS.doc(campaignId);
    const campaignSnap = await campaignRef.get();
    if (!campaignSnap.exists) return res.status(404).json({ error: 'الحملة غير موجودة' });

    const campaign = campaignSnap.data();
    if (String(campaign.advertiserId) !== advertiserId) {
      return res.status(403).json({ error: 'غير مصرح لك باستئناف هذه الحملة' });
    }

    if (addBudget > 0) {
      await db.runTransaction(async (tx) => {
        const userRef = Collections.USERS.doc(advertiserId);
        const userSnap = await tx.get(userRef);
        const currentBal = userSnap.exists ? Number(userSnap.data().advertiserBalance || 0) : 0;
        if (currentBal < addBudget) {
          throw new Error('رصيد المحفظة غير كافٍ لشحن ميزانية الحملة');
        }
        tx.update(userRef, {
          advertiserBalance: Number((currentBal - addBudget).toFixed(6)),
          updatedAt: Date.now()
        });
        tx.update(campaignRef, {
          totalBudget: FieldValue.increment(addBudget),
          remainingBudget: FieldValue.increment(addBudget),
          status: 'active',
          updatedAt: Date.now()
        });
      });
    } else {
      await campaignRef.update({ status: 'active', updatedAt: Date.now() });
    }

    const refreshedRef = Collections.CAMPAIGNS.doc(campaignId);
    const approvedSnap = await Collections.CHANNELS.where('status', '==', 'approved').get();
    for (const chDoc of approvedSnap.docs) {
      await publishCampaignToChannel(refreshedRef, chDoc);
    }

    const updatedSnap = await refreshedRef.get();
    res.json({ id: campaignId, campaign: updatedSnap.data() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// سجل عمليات النشر والإشعارات
app.get('/api/logs/publications', async (req, res) => {
  try {
    const userId = String(req.query.userId || '');
    const snap = await Collections.POST_LOGS.orderBy('publishedAt', 'desc').limit(50).get();
    const logs = snap.docs
      .map((d) => d.data())
      .filter((l) => !userId || l.advertiserId === userId || l.publisherId === userId);
    res.json({ logs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/notifications', async (req, res) => {
  try {
    const userId = String(req.query.userId || '');
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const snap = await Collections.NOTIFICATIONS.where('userId', '==', userId).get();
    const notifications = snap.docs
      .map((d) => d.data())
      .sort((a, b) => b.createdAt - a.createdAt);
    res.json({ notifications });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== لوحة الإدارة للمالك فقط ====================

app.get('/api/admin/channels/pending', async (req, res) => {
  try {
    const adminId = String(req.query.adminId || '');
    if (!OWNER_ID || adminId !== OWNER_ID) {
      return res.status(403).json({ error: 'مخصص لمالك النظام فقط' });
    }

    const snap = await Collections.CHANNELS.where('status', '==', 'pending_admin').get();
    const channels = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    res.json({ channels });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/channels/:id/decision', async (req, res) => {
  try {
    const adminId = String(req.body.adminId || '');
    if (!OWNER_ID || adminId !== OWNER_ID) {
      return res.status(403).json({ error: 'مخصص لمالك النظام فقط' });
    }

    const decision = req.body.decision === 'approve' ? 'approved' : 'rejected';
    const channelRef = Collections.CHANNELS.doc(req.params.id);
    const snap = await channelRef.get();
    if (!snap.exists) return res.status(404).json({ error: 'القناة غير موجودة' });

    await channelRef.update({ status: decision, updatedAt: Date.now() });
    const data = snap.data();

    if (decision === 'approved') {
      await publishPlatformFreePromo(channelRef, { ...data, status: 'approved' });
      await sendSystemNotification(
        data.ownerId,
        'تمت الموافقة على قناتك',
        `وافقت الإدارة على قناة "${data.title}" وتم نشر منشور المنصة المجاني.`,
        'channel_approved'
      );
    } else {
      await sendSystemNotification(
        data.ownerId,
        'تم رفض القناة',
        `نعتذر، تم رفض طلب قناة "${data.title}" من قِبل الإدارة.`,
        'channel_rejected'
      );
    }

    res.json({ ok: true, status: decision });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// مراقبة الخادم والبوت والنسخ الاحتياطي لقاعدة البيانات
app.get('/api/admin/health', async (req, res) => {
  try {
    const adminId = String(req.query.adminId || '');
    if (!OWNER_ID || adminId !== OWNER_ID) {
      return res.status(403).json({ error: 'مخصص لمالك النظام فقط' });
    }

    let botOnline = false;
    let botUsername = CONFIG.BOT_USERNAME;
    if (bot) {
      try {
        const me = await bot.getMe();
        botOnline = Boolean(me?.id);
        botUsername = me?.username || botUsername;
      } catch (_) {
        botOnline = false;
      }
    }

    res.json({
      serverOnline: true,
      botOnline,
      botUsername,
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: Date.now()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/backup', async (req, res) => {
  try {
    const adminId = String(req.body.adminId || '');
    if (!OWNER_ID || adminId !== OWNER_ID) {
      return res.status(403).json({ error: 'مخصص لمالك النظام فقط' });
    }

    const [channelsSnap, campaignsSnap, usersSnap] = await Promise.all([
      Collections.CHANNELS.get(),
      Collections.CAMPAIGNS.get(),
      Collections.USERS.get()
    ]);

    const backupRef = Collections.BACKUPS.doc();
    const record = {
      id: backupRef.id,
      createdBy: adminId,
      counts: {
        channels: channelsSnap.size,
        campaigns: campaignsSnap.size,
        users: usersSnap.size
      },
      createdAt: Date.now()
    };

    await backupRef.set(record);
    res.json({ backup: record });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== المزامنة الدورية (Cron) ====================

app.get('/api/cron/sync', async (req, res) => {
  try {
    if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized cron' });
    }

    await monitorAllChannelsPermissions();
    const viewSync = await syncViewsAndSettle();

    res.json({
      ok: true,
      syncedLogs: viewSync.syncedLogs,
      timestamp: Date.now()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Telega.ads server running on port ${PORT}`);
});

export default app;
