// public/js/i18n.js

(function () {
  'use strict';

  const translations = {
    ar: {
      nav_home: "الرئيسية",
      nav_links: "الروابط",
      nav_wallet: "المحفظة",
      nav_campaigns: "الحملات",
      nav_referral: "الإحالة",
      nav_admin: "اللوحة",
      currency: "$",

      home_title: "الرئيسية",
      available_balance: "الرصيد المتاح للسحب",
      pending_balance: "الأرصدة المعلقة",
      total_earned: "إجمالي الأرباح المحققة",
      quick_actions: "إجراءات سريعة",
      btn_shorten: "اختصار رابط جديد",
      btn_withdraw: "سحب الأرباح",
      btn_deposit: "إيداع رصيد",

      links_title: "روابطي المختصرة",
      label_original_url: "الرابط الأصلي Target URL",
      placeholder_original_url: "https://example.com/file.zip",
      label_link_title: "عنوان الرابط (اختياري)",
      placeholder_link_title: "مثال: رابط الملف",
      btn_create_link: "اختصار الرابط الآن",
      col_code: "الكود",
      col_clicks: "النقرات",
      col_impressions: "الظهور",
      col_earnings: "الأرباح",
      col_status: "الحالة",
      col_actions: "الإجراءات",
      status_active: "نشط",
      status_disabled: "معطل",
      btn_copy: "نسخ",
      btn_toggle: "تبديل",

      wallet_title: "المحفظة والمالية",
      withdraw_section: "طلب سحب الأرباح",
      deposit_section: "إيداع رصيد بالمحفظة (USDT)",
      label_amount: "المبلغ ($)",
      label_wallet_address: "عنوان محفظة USDT (TRC20)",
      label_network: "شبكة التحويل",
      label_txhash: "رمز المعاملة (TxHash)",
      btn_submit_withdraw: "تأكيد طلب السحب",
      btn_submit_deposit: "إرسال إثبات الإيداع",
      history_title: "سجل المعاملات",
      type_deposit: "إيداع",
      type_withdraw: "سحب",
      status_pending: "قيد الانتظار",
      status_approved: "مقبول",
      status_rejected: "مرفوض",

      campaigns_title: "الحملات الإعلانية",
      btn_new_campaign: "إنشاء حملة إعلانية جديدة",
      label_campaign_title: "عنوان الإعلان",
      label_target_url: "رابط التوجيه Target URL",
      label_banner_url: "رابط صورة البانر (اختياري)",
      label_budget: "الميزانية الكلية ($)",
      col_budget: "الميزانية",
      col_remaining: "المتبقي",
      col_delivered: "الظهور",
      btn_pause: "إيقاف",
      btn_resume: "تفعيل",

      referral_title: "نظام الدعوات والإحالات",
      referral_desc: "احصل على نسبة 10% أرباح إضافية دائمة من كل مستخدم يسجل عن طريق رابط الإحالة الخاص بك.",
      label_ref_link: "رابط الإحالة الخاص بك",
      ref_earnings: "أرباح الإحالات",

      bridge_wait_msg: "يرجى الانتظار لتجهيز الرابط...",
      bridge_countdown: "سيتم التوجيه خلال {seconds} ثوانٍ",
      btn_continue: "المتابعة للرابط",

      admin_title: "إحصائيات النظام العامة",
      stat_total_users: "المستخدمين",
      stat_total_links: "الروابط",
      stat_pending_deposits: "إيداعات معلقة",
      stat_pending_withdrawals: "سحوبات معلقة",
      btn_approve: "قبول",
      btn_reject: "رفض",
      btn_ban: "حظر",
      btn_unban: "فك الحظر",

      settings_title: "الإعدادات",
      label_language: "تغيير لغة التطبيق",
      btn_save: "حفظ التغييرات",
      msg_copied: "تم النسخ إلى الحافظة بنجاح!"
    },
    en: {
      nav_home: "Home",
      nav_links: "Links",
      nav_wallet: "Wallet",
      nav_campaigns: "Campaigns",
      nav_referral: "Referrals",
      nav_admin: "Admin",
      currency: "$",

      home_title: "Activity Overview",
      available_balance: "Available Balance",
      pending_balance: "Pending Balance",
      total_earned: "Total Earned",
      quick_actions: "Quick Actions",
      btn_shorten: "Shorten New Link",
      btn_withdraw: "Withdraw Earnings",
      btn_deposit: "Deposit Balance",

      links_title: "My Short Links",
      label_original_url: "Original Target URL",
      placeholder_original_url: "https://example.com/file.zip",
      label_link_title: "Link Title (Optional)",
      placeholder_link_title: "e.g. Download File",
      btn_create_link: "Shorten Link Now",
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

      wallet_title: "Wallet & Finances",
      withdraw_section: "Request Earnings Withdrawal",
      deposit_section: "Deposit Balance (USDT)",
      label_amount: "Amount ($)",
      label_wallet_address: "USDT Wallet Address (TRC20)",
      label_network: "Transfer Network",
      label_txhash: "Transaction Hash (TxHash)",
      btn_submit_withdraw: "Confirm Withdrawal Request",
      btn_submit_deposit: "Submit Deposit Proof",
      history_title: "Transaction History",
      type_deposit: "Deposit",
      type_withdraw: "Withdrawal",
      status_pending: "Pending",
      status_approved: "Approved",
      status_rejected: "Rejected",

      campaigns_title: "My Ad Campaigns",
      btn_new_campaign: "Create New Campaign",
      label_campaign_title: "Campaign Title",
      label_target_url: "Target URL",
      label_banner_url: "Banner URL (Optional)",
      label_budget: "Total Budget ($)",
      col_budget: "Budget",
      col_remaining: "Remaining",
      col_delivered: "Delivered",
      btn_pause: "Pause",
      btn_resume: "Resume",

      referral_title: "Referral Program",
      referral_desc: "Earn 10% lifetime extra commission from every user who joins via your referral link.",
      label_ref_link: "Your Referral Link",
      ref_earnings: "Referral Earnings",

      bridge_wait_msg: "Please wait while preparing your link...",
      bridge_countdown: "Redirecting in {seconds} seconds",
      btn_continue: "Continue to Link",

      admin_title: "System General Statistics",
      stat_total_users: "Total Users",
      stat_total_links: "Total Links",
      stat_pending_deposits: "Pending Deposits",
      stat_pending_withdrawals: "Pending Withdrawals",
      btn_approve: "Approve",
      btn_reject: "Reject",
      btn_ban: "Ban",
      btn_unban: "Unban",

      settings_title: "Settings & Language",
      label_language: "App Preferred Language",
      btn_save: "Save Changes",
      msg_copied: "Copied to clipboard successfully!"
    }
  };

  let currentLang = localStorage.getItem('app_lang') || 'ar';

  function t(key, params = {}) {
    let text = translations[currentLang]?.[key] || translations['ar']?.[key] || key;
    Object.keys(params).forEach(p => {
      text = text.replace(`{${p}}`, params[p]);
    });
    return text;
  }

  function setLanguage(lang) {
    if (!['ar', 'en'].includes(lang)) return;

    currentLang = lang;
    localStorage.setItem('app_lang', lang);

    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';

    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (key) el.innerText = t(key);
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (key) el.placeholder = t(key);
    });
  }

  function getLanguage() {
    return currentLang;
  }

  document.addEventListener('DOMContentLoaded', () => {
    setLanguage(currentLang);
  });

  window.i18n = {
    setLanguage,
    getLanguage,
    t
  };
})();
