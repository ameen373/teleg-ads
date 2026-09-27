export const state = {
  API_BASE: window.location.protocol.startsWith('file') 
    ? 'http://localhost:3000' 
    : window.location.origin,
  authToken: localStorage.getItem('authToken'),
  currentSessionId: null,
  bridgeToken: null,
  bridgeStartTime: Date.now(),
  isUserAdmin: false,
  tg: window.Telegram?.WebApp || null,
  currentUserTelegramId: null,
  storedTelegramId: localStorage.getItem('telegramId'),
  rawUserLinksCache: [],
  bridgeDestinationUrl: null,
  currentShortCode: null,
  currentLang: localStorage.getItem('appLang') || 'ar',
  user: null,
  activeTab: 'dashboard',
  ads: [],
  wallet: {}
};

// تهيئة معرّف التليجرام
if (state.tg?.initDataUnsafe?.user?.id) {
  state.currentUserTelegramId = String(state.tg.initDataUnsafe.user.id);
  localStorage.setItem('telegramId', state.currentUserTelegramId);
} else {
  state.currentUserTelegramId = state.storedTelegramId || null;
}

// قاموس النصوص للتعدد اللغوي
export const i18n = {
  ar: {
    copied: "تم النسخ بنجاح!",
    network_error: "خطأ في الاتصال بالشبكة",
    cancel: "إلغاء",
    btn_edit: "تعديل",
    btn_copy: "نسخ",
    btn_delete: "حذف",
    link_success_msg: "تم اختصار الرابط بنجاح!",
    enter_url: "يرجى إدخال الرابط الأصلي",
    shorten_failed: "فشل إنشاء الرابط المختصر",
    delete_confirm: "هل أنت تأكد من حذف هذا الرابط؟",
    delete_success: "تم حذف الرابط بنجاح",
    delete_failed: "فشل حذف الرابط",
    select_network: "يرجى اختيار شبكة الدفع",
    min_deposit: "الحد الأدنى للإيداع هو $1",
    enter_txid: "يرجى إدخال رمز المعاملة (TxID)",
    deposit_success: "تم تقديم طلب الشحن بنجاح! سيتم مراجعته قريباً.",
    enter_wallet: "يرجى إدخال عنوان المحفظة",
    wallet_saved: "تم حفظ العنوان بنجاح",
    min_withdraw: "الحد الأدنى للسحب هو 30$",
    withdraw_success: "تم تقديم طلب السحب بنجاح",
    enter_ad_title: "يرجى إدخال عنوان الإعلان",
    enter_target_url: "يرجى إدخال رابط التوجيه",
    min_ad_budget: "الحد الأدنى لميزانية الحملة هو $5",
    ad_success: "تم إطلاق الحملة الإعلانية بنجاح!",
    access_denied: "غير مصرح لك بالوصول للوحة التحكم",
    share_text: "انضم إليّ في أفضل منصة لاختصار الروابط واكسب الأرباح بسهولة! 🚀",
    no_links: "لا توجد روابط مختصرة بعد.",
    no_referrals: "لم تنضم أي إحالات عبر رابطك بعد.",
    no_withdraws: "لا توجد طلبات سحب سابقة.",
    no_ads: "لا توجد حملات إعلانية نشطة.",
    approved: "مكتمل",
    rejected: "مرفوض",
    pending: "قيد المراجعة"
  },
  en: {
    copied: "Copied successfully!",
    network_error: "Network connection error",
    cancel: "Cancel",
    btn_edit: "Edit",
    btn_copy: "Copy",
    btn_delete: "Delete",
    link_success_msg: "Link shortened successfully!",
    enter_url: "Please enter original URL",
    shorten_failed: "Failed to create short link",
    delete_confirm: "Are you sure you want to delete this link?",
    delete_success: "Link deleted successfully",
    delete_failed: "Failed to delete link",
    select_network: "Please select payment network",
    min_deposit: "Minimum deposit amount is $1",
    enter_txid: "Please enter transaction TxID / Hash",
    deposit_success: "Deposit request submitted successfully!",
    enter_wallet: "Please enter wallet address",
    wallet_saved: "Wallet address saved",
    min_withdraw: "Minimum withdrawal is $30",
    withdraw_success: "Withdrawal requested successfully",
    enter_ad_title: "Please enter ad title",
    enter_target_url: "Please enter target URL",
    min_ad_budget: "Minimum campaign budget is $5",
    ad_success: "Ad campaign launched successfully!",
    access_denied: "Access denied",
    share_text: "Join me on the best url shortener platform & earn money! 🚀",
    no_links: "No shortened links found.",
    no_referrals: "No referrals registered yet.",
    no_withdraws: "No withdrawal history found.",
    no_ads: "No active ad campaigns.",
    approved: "Approved",
    rejected: "Rejected",
    pending: "Pending"
  }
};
