// ==========================================
// Module: state.js
// Description: Central application state, constants, and i18n
// ==========================================

export const API_BASE = window.location.protocol.startsWith('file') 
  ? 'http://localhost:3000' 
  : window.location.origin;

// State Variables
export let authToken = localStorage.getItem('authToken') || null;
export let currentSessionId = null;
export let bridgeToken = null;
export let bridgeStartTime = Date.now();
export let isUserAdmin = false;

export let currentUserTelegramId = null;
export let storedTelegramId = localStorage.getItem('telegramId') || null;

export let rawUserLinksCache = [];
export let bridgeDestinationUrl = null;
export let currentShortCode = null;

export let currentLang = localStorage.getItem('appLang') || 'ar';

// Comprehensive i18n Translation Dictionary
export const i18n = {
  ar: {
    copied: "تم النسخ بنجاح!",
    copy_failed: "فشل النسخ تلقائياً",
    network_error: "خطأ في الاتصال بالشبكة",
    access_denied: "غير مصرح لك بالوصول للوحة التحكم",
    btn_edit: "تعديل",
    cancel: "إلغاء",
    btn_copy: "نسخ",
    link_success_msg: "تم اختصار الرابط بنجاح!",
    enter_original_url: "يرجى إدخال الرابط الأصلي",
    shorten_failed: "فشل إنشاء الرابط المختصر",
    shorten_error: "حدث خطأ أثناء اختصار الرابط",
    delete_confirm: "هل أنت تأكد من حذف هذا الرابط؟",
    delete_success: "تم حذف الرابط بنجاح",
    delete_failed: "فشل حذف الرابط",
    select_network: "يرجى اختيار شبكة الدفع",
    min_deposit: "الحد الأدنى للإيداع هو $1",
    enter_txid: "يرجى إدخال رمز المعاملة (TxID)",
    deposit_success: "تم تقديم طلب الشحن بنجاح! سيتم مراجعته قريباً.",
    deposit_failed: "فشل تقديم طلب الشحن",
    enter_wallet: "يرجى إدخال عنوان المحفظة",
    wallet_saved: "تم حفظ العنوان بنجاح",
    wallet_save_failed: "فشل حفظ العنوان",
    min_withdraw: "الحد الأدنى للسحب هو 30$",
    withdraw_success: "تم تقديم طلب السحب بنجاح",
    withdraw_failed: "فشل تقديم طلب السحب",
    enter_ad_title: "يرجى إدخال عنوان الإعلان",
    enter_target_url: "يرجى إدخال رابط التوجيه",
    min_ad_budget: "الحد الأدنى لميزانية الحملة هو $5",
    ad_success: "تم إطلاق الحملة الإعلانية بنجاح!",
    ad_failed: "فشل إنشاء الحملة الإعلانية",
    no_links: "لا توجد روابط مختصرة بعد.",
    no_withdraws: "لا توجد طلبات سحب سابقة.",
    no_ads: "لا توجد حملات إعلانية نشطة.",
    no_referrals: "لم تنضم أي إحالات عبر رابطك بعد.",
    share_text: "انضم إليّ في أفضل منصة لاختصار الروابط واكسب الأرباح بسهولة! 🚀",
    clicks: "زيارة",
    valid: "مؤكدة",
    delete: "حذف",
    status_approved: "مكتمل",
    status_rejected: "مرفوض",
    status_pending: "قيد المراجعة",
    impressions: "مشاهدة حقيقية",
    action_success: "تم تنفيذ الإجراء بنجاح",
    action_error: "خطأ أثناء تنفيذ الإجراء",
    bridge_error: "تعذر تحميل الرابط المطلوب"
  },
  en: {
    copied: "Copied successfully!",
    copy_failed: "Failed to copy",
    network_error: "Network connection error",
    access_denied: "Access denied",
    btn_edit: "Edit",
    cancel: "Cancel",
    btn_copy: "Copy",
    link_success_msg: "Link shortened successfully!",
    enter_original_url: "Please enter original URL",
    shorten_failed: "Failed to create short link",
    shorten_error: "An error occurred while shortening link",
    delete_confirm: "Are you sure you want to delete this link?",
    delete_success: "Link deleted successfully",
    delete_failed: "Failed to delete link",
    select_network: "Please select payment network",
    min_deposit: "Minimum deposit amount is $1",
    enter_txid: "Please enter transaction TxID / Hash",
    deposit_success: "Deposit request submitted successfully!",
    deposit_failed: "Failed to submit deposit request",
    enter_wallet: "Please enter wallet address",
    wallet_saved: "Wallet address saved",
    wallet_save_failed: "Failed to save address",
    min_withdraw: "Minimum withdrawal is $30",
    withdraw_success: "Withdrawal requested successfully",
    withdraw_failed: "Failed to request withdrawal",
    enter_ad_title: "Please enter ad title",
    enter_target_url: "Please enter target URL",
    min_ad_budget: "Minimum campaign budget is $5",
    ad_success: "Ad campaign launched successfully!",
    ad_failed: "Failed to create ad campaign",
    no_links: "No shortened links found.",
    no_withdraws: "No withdrawal history found.",
    no_ads: "No active ad campaigns.",
    no_referrals: "No referrals registered yet.",
    share_text: "Join me on the best url shortener platform & earn money! 🚀",
    clicks: "clicks",
    valid: "valid",
    delete: "Delete",
    status_approved: "Approved",
    status_rejected: "Rejected",
    status_pending: "Pending",
    impressions: "impressions",
    action_success: "Action completed successfully",
    action_error: "Error processing action",
    bridge_error: "Failed to load requested link"
  }
};

// State Setters (For safe state modification from other modules)
export function setAuthToken(token) {
  authToken = token;
  if (token) {
    localStorage.setItem('authToken', token);
  } else {
    localStorage.removeItem('authToken');
  }
}

export function setCurrentUserTelegramId(id) {
  currentUserTelegramId = id ? String(id) : null;
  if (currentUserTelegramId) {
    localStorage.setItem('telegramId', currentUserTelegramId);
  }
}

export function setIsUserAdmin(status) {
  isUserAdmin = Boolean(status);
}

export function setRawUserLinksCache(links) {
  rawUserLinksCache = Array.isArray(links) ? links : [];
}

export function setCurrentLang(lang) {
  if (i18n[lang]) {
    currentLang = lang;
    localStorage.setItem('appLang', lang);
  }
}

export function setBridgeData(code, token, destinationUrl) {
  if (code !== undefined) currentShortCode = code;
  if (token !== undefined) bridgeToken = token;
  if (destinationUrl !== undefined) bridgeDestinationUrl = destinationUrl;
  bridgeStartTime = Date.now();
}
