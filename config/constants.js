// config/constants.js

const SYSTEM_CONSTANTS = {
  // نسبة خصم رسوم السحب (3%)
  WITHDRAWAL_FEE_PERCENT: 0.03,

  // الحد الأدنى لمبلغ السحب بالدولار ($30)
  MIN_WITHDRAWAL_AMOUNT: 30,

  // سعر كل 1000 مشاهدة للحملات الإعلانية بالدولار ($1.50)
  CPM_RATE: 1.50,

  // الحد الأدنى لميزانية الحملة الإعلانية بالدولار ($5)
  MIN_CAMPAIGN_BUDGET: 5,

  // فترة حجز الرصيد المعلق بالميللي ثانية (24 ساعة = 24 * 60 * 60 * 1000)
  PENDING_HOLD_TIME_MS: 24 * 60 * 60 * 1000, // 86,400,000 ms

  // زمن العداد التنازلي لصفحة الجسر بالثواني (5 ثوانٍ)
  BRIDGE_WAIT_SECONDS: 5,

  // نسبة عمولة الإحالة (10%)
  REFERRAL_COMMISSION_PERCENT: 0.10
};

module.exports = SYSTEM_CONSTANTS;

