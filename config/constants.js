// config/constants.js

const SYSTEM_CONSTANTS = {
  // بيانات البوت
  BOT_USERNAME: process.env.BOT_USERNAME || process.env.TELEGRAM_BOT_USERNAME || 'Ads_telegabot',
  BOT_URL: process.env.BOT_URL || 'https://t.me/Ads_telegabot',

  // نسبة خصم رسوم السحب (3%)
  WITHDRAWAL_FEE_PERCENT: parseFloat(process.env.WITHDRAWAL_FEE_PERCENT) || 0.03,

  // الحد الأدنى لمبلغ السحب بالدولار ($30)
  MIN_WITHDRAWAL_AMOUNT: parseFloat(process.env.MIN_WITHDRAWAL_AMOUNT) || 30.0,

  // سعر كل 1000 مشاهدة للحملات الإعلانية بالدولار ($1.50)
  CPM_RATE: parseFloat(process.env.CPM_RATE) || 1.50,

  // الحد الأدنى لميزانية الحملة الإعلانية بالدولار ($5)
  MIN_CAMPAIGN_BUDGET: parseFloat(process.env.MIN_CAMPAIGN_BUDGET) || 5.0,

  // فترة حجز الرصيد المعلق بالميللي ثانية (24 ساعة = 24 * 60 * 60 * 1000)
  PENDING_HOLD_TIME_MS: parseInt(process.env.PENDING_HOLD_TIME_MS, 10) || 24 * 60 * 60 * 1000,

  // زمن العداد التنازلي لصفحة الجسر بالثواني (5 ثوانٍ)
  BRIDGE_WAIT_SECONDS: parseInt(process.env.BRIDGE_WAIT_SECONDS, 10) || 5,

  // نسبة عمولة الإحالة (10%)
  REFERRAL_COMMISSION_PERCENT: parseFloat(process.env.REFERRAL_COMMISSION_PERCENT) || 0.10,

  // الحد الأدنى لسحب أرباح الإحالة
  MIN_REFERRAL_CLAIM_AMOUNT: parseFloat(process.env.MIN_REFERRAL_CLAIM_AMOUNT) || 1.0
};

module.exports = SYSTEM_CONSTANTS;
