// public/js/i18n.js

(function () {
  // 1. قاموس النصوص باللغتين العربية والإنجليزية
  const translations = {
    ar: {
      // التنقل والعموميات
      nav_home: "الرئيسية",
      nav_links: "الروابط",
      nav_wallet: "المحفظة",
      nav_campaigns: "الحملات",
      nav_referral: "الإحالة",
      nav_admin: "اللوحة",
      currency: "$",

      // الشاشة الرئيسية
      home_title: "الرئيسية",
      available_balance: "الرصيد المتاح",
      pending_balance: "الرصيد المعلق",
      total_earned: "إجمالي الأرباح",
      quick_actions: "إجراءات سريعة",
      btn_shorten: "اختصار رابط",
      btn_withdraw: "سحب الأرباح",
      btn_deposit: "إيداع رصيد",

      // شاشة الروابط
      links_title: "روابطي المختصرة",
      label_original_url: "الرابط الأصلي",
      placeholder_original_url: "أدخل الرابط هنا...",
      label_link_title: "عنوان الرابط (اختياري)",
      placeholder_link_title: "مثال: رابط القناة",
      btn_create_link: "إنشاء رابط مختصر",
      col_code: "الكود",
      col_clicks: "النقرات",
      col_impressions: "المشاهدات",
      col_earnings: "الأرباح",
      col_status: "الحالة",
      col_actions: "إجراءات",
      status_active: "نشط",
      status_disabled: "معطل",
      btn_copy: "نسخ",
      btn_toggle: "تبديل",

      // شاشة المحفظة
      wallet_title: "المحفظة والمالية",
      withdraw_section: "طلب سحب الأرباح",
      deposit_section: "إيداع رصيد الإعلانات",
      label_amount: "المبلغ ($)",
      label_wallet_address: "عنوان محفظة USDT (TRC20)",
      label_network: "شبكة التحويل",
      label_txhash: "رمز المعاملة (TxHash)",
      btn_submit_withdraw: "تأكيد طلب السحب",
      btn_submit_deposit: "تأكيد طلب الإيداع",
      history_title: "سجل المعاملات",
      type_deposit: "إيداع",
      type_withdraw: "سحب",
      status_pending: "قيد الانتظار",
      status_approved: "مقبول",
      status_rejected: "مرفوض",

      // شاشة الحملات
      campaigns_title: "الحملات الإعلانية",
      btn_new_campaign: "إنشاء حملة جديدة",
      label_campaign_title: "عنوان الحملة",
      label_target_url: "رابط الهدف",
      label_banner_url: "رابط البانر (اختياري)",
      label_budget: "الميزانية ($)",
      col_budget: "الميزانية",
      col_remaining: "المتبقي",
      col_delivered: "الظهور",
      btn_pause: "إيقاف",
      btn_resume: "تفعيل",

      // شاشة الإحالة
      referral_title: "نظام الإحالة",
      referral_desc: "احصل على 10% عمولة من أرباح كل مستخدم يسجل عبر رابطك!",
      label_ref_link: "رابط الإحالة الخاص بك",
      ref_earnings: "أرباح الإحالات",

      // شاشة الجسر
      bridge_wait_msg: "يرجى الانتظار لتجهيز الرابط...",
      bridge_countdown: "سيتم التوجيه خلال {seconds} ثوانٍ",
      btn_continue: "المتابعة للرابط",

      // لوحة التحكم (Admin)
      admin_title: "لوحة التحكم",
      stat_total_users: "إجمالي المستخدمين",
      stat_total_links: "إجمالي الروابط",
      stat_pending_deposits: "إيداعات معلقة",
      stat_pending_withdrawals: "سحوبات معلقة",
      btn_approve: "قبول",
      btn_reject: "رفض",
      btn_ban: "حظر",
      btn_unban: "فك الحظر",

      // الإعدادات والتنبيهات
      settings_title: "الإعدادات",
      label_language: "اللغة المفضلة",
      btn_save: "حفظ التغييرات",
      msg_copied: "تم النسخ إلى الحافظة!"
    },
    en: {
      // Navigation & General
      nav_home: "Home",
      nav_links: "Links",
      nav_wallet: "Wallet",
      nav_campaigns: "Campaigns",
      nav_referral: "Referral",
      nav_admin: "Admin",
      currency: "$",

      // Home Screen
      home_title: "Dashboard",
      available_balance: "Available Balance",
      pending_balance: "Pending Balance",
      total_earned: "Total Earned",
      quick_actions: "Quick Actions",
      btn_shorten: "Shorten Link",
      btn_withdraw: "Withdraw",
      btn_deposit: "Deposit",

      // Links Screen
      links_title: "My Short Links",
      label_original_url: "Original URL",
      placeholder_original_url: "Enter URL here...",
      label_link_title: "Link Title (Optional)",
      placeholder_link_title: "e.g., Channel Link",
      btn_create_link: "Create Short Link",
      col_code: "Code",
      col_clicks: "Clicks",
      col_impressions: "Impressions",
      col_earnings: "Earnings",
      col_status: "Status",
      col_actions: "Actions",
      status_active: "Active",
      status_disabled: "Disabled",
      btn_copy: "Copy",
      btn_toggle: "Toggle",

      // Wallet Screen
      wallet_title: "Wallet & Finance",
      withdraw_section: "Request Withdrawal",
      deposit_section: "Deposit Ad Credit",
      label_amount: "Amount ($)",
      label_wallet_address: "USDT (TRC20) Wallet Address",
      label_network: "Network",
      label_txhash: "Transaction Hash (TxHash)",
      btn_submit_withdraw: "Submit Withdrawal",
      btn_submit_deposit: "Submit Deposit",
      history_title: "Transaction History",
      type_deposit: "Deposit",
      type_withdraw: "Withdrawal",
      status_pending: "Pending",
      status_approved: "Approved",
      status_rejected: "Rejected",

      // Campaigns Screen
      campaigns_title: "Ad Campaigns",
      btn_new_campaign: "Create New Campaign",
      label_campaign_title: "Campaign Title",
      label_target_url: "Target URL",
      label_banner_url: "Banner URL (Optional)",
      label_budget: "Budget ($)",
      col_budget: "Budget",
      col_remaining: "Remaining",
      col_delivered: "Impressions",
      btn_pause: "Pause",
      btn_resume: "Resume",

      // Referral Screen
      referral_title: "Referral Program",
      referral_desc: "Earn 10% commission on all earnings from users who sign up with your link!",
      label_ref_link: "Your Referral Link",
      ref_earnings: "Referral Earnings",

      // Bridge Screen
      bridge_wait_msg: "Please wait while preparing your link...",
      bridge_countdown: "Redirecting in {seconds} seconds",
      btn_continue: "Continue to Link",

      // Admin Dashboard
      admin_title: "Admin Panel",
      stat_total_users: "Total Users",
      stat_total_links: "Total Links",
      stat_pending_deposits: "Pending Deposits",
      stat_pending_withdrawals: "Pending Withdrawals",
      btn_approve: "Approve",
      btn_reject: "Reject",
      btn_ban: "Ban",
      btn_unban: "Unban",

      // Settings & Messages
      settings_title: "Settings",
      label_language: "Preferred Language",
      btn_save: "Save Changes",
      msg_copied: "Copied to clipboard!"
    }
  };

  // اللغة الافتراضية
  let currentLang = localStorage.getItem('app_lang') || 'ar';

  /**
   * جلب ترجمة مفتاح معين
   * @param {string} key - مفتاح النص
   * @param {Object} params - متغبرات للتعويض داخل النص
   */
  function t(key, params = {}) {
    let text = translations[currentLang]?.[key] || translations['ar']?.[key] || key;
    Object.keys(params).forEach(p => {
      text = text.replace(`{${p}}`, params[p]);
    });
    return text;
  }

  /**
   * 2. تغيير لغة الواجهة وتحديث الاتجاه والعناصر
   * @param {string} lang - 'ar' أو 'en'
   */
  function setLanguage(lang) {
    if (!['ar', 'en'].includes(lang)) return;

    currentLang = lang;
    localStorage.setItem('app_lang', lang);

    // تغيير اتجاه DOM واللغة المستهدفة
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';

    // التبديل الفوري لكافة العناصر المسند إليها data-i18n
    const elements = document.querySelectorAll('[data-i18n]');
    elements.forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (key) {
        // إذا كان العنصر Input أو Textarea ويستهدف placeholder
        if (el.hasAttribute('data-i18n-placeholder')) {
          el.placeholder = t(key);
        } else {
          el.innerText = t(key);
        }
      }
    });

    // تحديث أي حقول تعتمد على data-i18n-placeholder بشكل مستقل
    const placeholderElements = document.querySelectorAll('[data-i18n-placeholder]');
    placeholderElements.forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (key) {
        el.placeholder = t(key);
      }
    });
  }

  /**
   * الحصول على اللغة الحالية
   */
  function getLanguage() {
    return currentLang;
  }

  // التهيئة عند تحميل المستند
  document.addEventListener('DOMContentLoaded', () => {
    setLanguage(currentLang);
  });

  // تصدير الكائن ليكون متاحاً على المستوى العام
  window.i18n = {
    setLanguage,
    getLanguage,
    t
  };
})();
