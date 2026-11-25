export const LANG_AR = {
  dir: 'rtl',
  lang: 'ar',
  toggleLabel: 'EN',
  appName: 'Telega.ads',
  nav_home: 'حسابي',
  nav_channels: 'قنواتي',
  nav_campaigns: 'الترويج',
  nav_wallet: 'المحفظة',
  nav_referral: 'الإحالة',
  nav_admin: 'الإدارة',
  nav: {
    account: 'حسابي',
    channels: 'القنوات',
    campaigns: 'الحملات',
    wallet: 'المحفظة',
    admin: 'الإدارة'
  },
  account: {
    title: 'حسابي',
    subtitle: 'هويتك الذكية على تيليجرام وإعداداتك الفورية',
    autoDetectedBadge: 'تعرف ذكي على اللغة',
    fallbackNotice: 'أي لغة غير مضافة حالياً تتحول تلقائياً إلى الإنجليزية (EN) لضمان تجربة سليسة.',
    identity: {
      title: 'بيانات الهوية الفورية',
      fullName: 'الاسم الكامل',
      username: 'المعرف (@username)',
      noUsername: 'غير محدد في تيليجرام',
      userId: 'معرّف المستخدم (ID)',
      photoAlt: 'الصورة الشخصية للمستخدم',
      verifiedTg: 'موثّق عبر Telegram Mini App',
      onlineStatus: 'متصل',
      copyId: 'نسخ الآيدي',
      copied: 'تم النسخ!'
    },
    language: {
      title: 'اللغة والتعرف التلقائي',
      currentLabel: 'اللغة النشطة حالياً',
      switchManual: 'تبديل يدوي فوري',
      autoDetectBtn: 'إعادة التعرف التلقائي',
      upcomingTitle: 'لغات مخطط إضافتها لاحقاً'
    },
    faq: {
      title: 'الأسئلة الشائعة (FAQ)',
      items: [
        {
          q: 'كيف يتم التعرف على لغتي داخل التطبيق؟',
          a: 'يتعرف التطبيق تلقائياً على لغة حسابك في تيليجرام، وإذا لم تكن اللغة مضافة بعد يتم عرض الإنجليزية مع إمكانية التبديل اليدوي فوراً.'
        },
        {
          q: 'كيف يتم التحقق من هويتي وبياناتي؟',
          a: 'يقرأ التطبيق بياناتك الرسمية من Telegram WebApp (الاسم، الصورة، المعرف، والآيدي) ويُتحقق منها عبر الخادم.'
        },
        {
          q: 'كيف أفتح تذكرة دعم أو أتابع التنبيهات الإدارية؟',
          a: 'من قسم فريق الدعم أدناه يمكنك إرسال تذكرة مباشرة لفريق الدعم ومتابعة البث والتنبيهات الإدارية الفورية.'
        }
      ]
    },
    support: {
      title: 'فريق الدعم والتنبيهات الإدارية',
      ticketsTab: 'تذكرة دعم فني',
      broadcastsTab: 'البث والتنبيهات الفورية',
      subjectPlaceholder: 'عنوان المشكلة أو الاستفسار',
      messagePlaceholder: 'اشرح تفاصيل طلبك أو مشكلتك بوضوح...',
      sendTicket: 'إرسال التذكرة',
      ticketSent: 'تم إرسال تذكرتك بنجاح، سيتواصل معك فريق الدعم قريباً.',
      emptyTickets: 'لا توجد تذاكر سابقة بعد.',
      emptyBroadcasts: 'لا توجد تنبيهات إدارية جديدة حالياً.'
    }
  }
};

if (typeof window !== 'undefined') {
  window.LANG_AR = LANG_AR;
  if (window.i18n && typeof window.i18n.registerDictionary === 'function') {
    try {
      window.i18n.registerDictionary('ar', LANG_AR);
    } catch (err) {
      console.error('ar.js registerDictionary error:', err);
    }
  }
}
