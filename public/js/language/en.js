export const LANG_EN = {
  dir: 'ltr',
  lang: 'en',
  toggleLabel: 'عربي',
  appName: 'Telega.ads',
  nav_home: 'My Account',
  nav_channels: 'Channels',
  nav_campaigns: 'Promote',
  nav_wallet: 'Wallet',
  nav_referral: 'Referral',
  nav_admin: 'Admin',
  nav: {
    account: 'My Account',
    channels: 'Channels',
    campaigns: 'Campaigns',
    wallet: 'Wallet',
    admin: 'Admin'
  },
  account: {
    title: 'My Account',
    subtitle: 'Your smart Telegram identity and instant preferences',
    autoDetectedBadge: 'Smart Language Detection',
    fallbackNotice: 'Any language not yet added automatically falls back to English (EN) for seamless continuity.',
    identity: {
      title: 'Live Identity Profile',
      fullName: 'Full Name',
      username: 'Username (@username)',
      noUsername: 'Not set on Telegram',
      userId: 'User ID',
      photoAlt: 'User profile avatar',
      verifiedTg: 'Verified via Telegram Mini App',
      onlineStatus: 'online',
      copyId: 'Copy ID',
      copied: 'Copied!'
    },
    language: {
      title: 'Language & Auto-Detection',
      currentLabel: 'Active Language',
      switchManual: 'Instant Manual Switch',
      autoDetectBtn: 'Re-run Auto-Detect',
      upcomingTitle: 'Planned Languages (Coming Soon)'
    },
    faq: {
      title: 'Frequently Asked Questions (FAQ)',
      items: [
        {
          q: 'How does the app detect my language?',
          a: 'It automatically detects your Telegram language_code, falls back to English when a language is not added yet, and lets you switch manually anytime.'
        },
        {
          q: 'How are my profile details and ID handled?',
          a: 'Your name, photo, username, and ID are read from Telegram WebApp and verified securely on the server.'
        },
        {
          q: 'How do I contact support or view admin alerts?',
          a: 'Use the Support Team section below to submit a ticket and check live admin broadcasts and alerts.'
        }
      ]
    },
    support: {
      title: 'Support Team & Admin Alerts',
      ticketsTab: 'Support Ticket',
      broadcastsTab: 'Broadcasts & Alerts',
      subjectPlaceholder: 'Subject or issue summary',
      messagePlaceholder: 'Describe your request or issue clearly...',
      sendTicket: 'Submit Ticket',
      ticketSent: 'Your support ticket has been submitted. Our team will respond shortly.',
      emptyTickets: 'No support tickets yet.',
      emptyBroadcasts: 'No admin broadcasts or alerts right now.'
    }
  }
};

if (typeof window !== 'undefined') {
  window.LANG_EN = LANG_EN;
  if (window.i18n && typeof window.i18n.registerDictionary === 'function') {
    try {
      window.i18n.registerDictionary('en', LANG_EN);
    } catch (err) {
      console.error('en.js registerDictionary error:', err);
    }
  }
}
