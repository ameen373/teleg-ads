export const ar = {
  // إعدادات اللغة والواجهة العامة
  dir: "rtl",
  flag: "🇸🇦",
  name: "العربية",
  appName: "Telega Ads",
  account_verified: "شريك موثّق",
  switchUser: "تبديل",
  refreshNow: "تحديث فوري",
  noData: "لا توجد بيانات متاحة حالياً.",

  // الأزرار العامة والروابط
  btn_language: "تغيير اللغة",
  btn_faq: "الأسئلة الشائعة (FAQ)",
  btn_official_channel: "القناة الرسمية",
  btn_support: "فريق الدعم",
  btn_add_channel: "+ إضافة قناة",
  btn_verify_channel: "تحقق وربط القناة",
  btn_new_ad: "+ إعلان جديد",
  btn_launch_ad: "إطلاق الحملة",
  btn_get_ref_link: "إظهار رابط الإحالة",
  btn_copy: "نسخ الرابط",
  copyAddress: "نسخ العنوان",
  copyReferralBtn: "نسخ رابط الإحالة",
  saveAddressBtn: "حفظ / تعديل العنوان",
  copied: "تم النسخ",
  copied_success: "تم نسخ الرابط بنجاح!",
  lang_not_ready: "سيتم تفعيل هذه اللغة قريباً. تم ضبط الإنجليزية افتراضياً.",

  // التنقل والقوائم (القديمة والجديدة)
  nav_account: "حسابي",
  nav_channels: "قنواتي",
  nav_promotion: "الترويج",
  nav_referral: "الإحالة",
  nav_wallet: "المحفظة",
  nav_admin: "الإدارة",
  navWallet: "المحفظة",
  navHistory: "سجل الإيداعات والسحوبات",
  navReferral: "الإحالة",
  navAdmin: "الإدارة",

  // الحقول والنصوص الإرشادية للقنوات والحملات والدعم
  placeholder_channel: "@معرف_القناة",
  placeholder_ad_title: "عنوان الحملة الإعلانية",
  placeholder_ad_text: "نص الرسالة الإعلانية...",
  placeholder_budget: "الميزانية (USDT)",
  placeholder_support_msg: "اكتب رسالتك لفريق الدعم هنا...",
  btn_send_support: "إرسال للدعم الفني",
  btn_open_bot_support: "المراسلة عبر البوت",
  support_sent: "تم إرسال رسالتك إلى فريق الدعم بنجاح!",
  empty_channels: "لم تقم بإضافة أي قنوات بعد.",
  empty_campaigns: "لا توجد حملات ترويجية نشطة حالياً.",

  // النوافذ المنبثقة (Modals)
  modal_select_lang: "اختر اللغة",
  modal_faq_title: "الأسئلة الشائعة",
  modal_faq_empty: "لا توجد أسئلة مضافة حالياً.",
  modal_support_title: "فريق الدعم المباشر",
  modal_support_desc: "تواصل مباشرة مع الدعم الفني عبر التطبيق أو عبر البوت الرسمي.",
  instructionsModalTitle: "تعليمات وخطوات شحن الرصيد (USDT - BEP20)",
  step1: "انسخ عنوان المحفظة المخصص أعلاه وتأكد من اختيار شبكة BEP20 (BNB Smart Chain).",
  step2: "أرسل مبلغاً لا يقل عن $10.00 من عملة USDT عبر الشبكة نفسها.",
  step3: "انسخ رقم المعاملة (TXID / Hash) بعد تأكيد التحويل على الشبكة.",
  step4: "أدخل المبلغ ورقم TXID في نموذج الإيداع ثم انتظر مراجعة الإدارة لإضافة الرصيد.",

  // المحفظة والأرصدة
  walletTitle: "المحفظة",
  currentBalance: "الرصيد الحالي (للإعلانات)",
  availableEarnings: "الأرباح المتاحة للسحب (بعد 24 ساعة)",
  pendingEarnings: "أرباح قيد التحرير (خلال 24 ساعة)",
  totalEarned: "إجمالي الأرباح",
  totalSpent: "إجمالي المصروفات",
  referralEarnings: "أرباح الإحالة (10%)",

  // الإيداع (USDT - BEP20)
  depositTitle: "إيداع عبر شبكة USDT - BEP20",
  depositInstructionsBtn: "تعليمات وخطوات الشحن",
  minDepositNote: "الحد الأدنى للإيداع: $10.00 عبر شبكة USDT - BEP20 فقط.",
  depositAmountLabel: "المبلغ (USD) - الحد الأدنى $10.00",
  txidLabel: "رقم المعاملة (TXID)",
  submitDeposit: "إرسال طلب الإيداع للمراجعة",

  // السحب (USDT - TRC20)
  withdrawTitle: "سحب الأرباح عبر شبكة USDT - TRC20",
  withdrawRulesNote: "الحد الأدنى للسحب $30.00 • رسوم السحب $3.00 • يُشترط مرور 24 ساعة على اكتساب الأرباح.",
  trc20AddressLabel: "عنوان محفظة USDT - TRC20",
  withdrawAmountLabel: "مبلغ السحب (USD) - الحد الأدنى $30.00",
  withdrawalFeeLabel: "رسوم السحب:",
  netReceiveLabel: "الصافي المستلم:",
  submitWithdraw: "تأكيد طلب السحب",
  withdrawalTrackerTitle: "تتبع دورة طلب السحب خطوة بخطوة",

  // السجلات وأعمدة الجداول
  recentTxTitle: "سجل المعاملات (آخر 10 معاملات)",
  historyTitle: "سجل الإيداعات والسحوبات",
  depositsHistoryTitle: "سجل الإيداعات (USDT - BEP20)",
  withdrawalsHistoryTitle: "سجل السحوبات (USDT - TRC20)",
  colAmount: "المبلغ",
  colTxid: "TXID",
  colStatus: "الحالة",
  colDate: "التاريخ",
  colNet: "الصافي",
  colAddress: "العنوان",

  // الإحالة
  referralTitle: "قسم الإحالة",
  referral_desc: "ادعُ أصدقاءك واربح عمولة تلقائية من كل حملة إعلانية أو عملية سحب.",
  referralDesc: "احصل تلقائياً على نسبة 10% من إجمالي أرباح الأصدقاء المحالين عبر رابط الإحالة الخاص بك.",
  referredFriendsCount: "عدد الأصدقاء المحالين",
  totalReferralCommission: "إجمالي عمولات الإحالة (10%)",
  referredUsersTitle: "الأصدقاء المحالون",
  colFriendUid: "معرف الصديق",
  colFriendEarned: "إجمالي أرباح الصديق",

  // لوحة الإدارة
  adminTitle: "لوحة الإدارة",
  loadAdminBtn: "تحميل طلبات المراجعة",
  adminDepositsTitle: "طلبات الإيداع بانتظار المراجعة",
  adminWithdrawalsTitle: "طلبات السحب ومتابعة مراحلها",
  admin_live_stats: "إحصائيات المنصة المباشرة",
  admin_broadcast: "إرسال إشعار جماعي",
  admin_shield: "درع الحماية وسجلات الأمان"
};
