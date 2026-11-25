import { applyLanguage, toggleLanguage, setOnLanguageChange } from './language/i18n.js';
import { initThemeListener, setActiveTab, refreshHeaderTitle } from './modules/ui.js';
import { init as initChannels } from './modules/channels.js';
import { init as initCampaigns } from './modules/campaigns.js';
import { init as initWallet } from './modules/wallet.js';
import { init as initAdmin } from './modules/admin.js';

const appState = {
  activeTab: 'account',
  user: null,
  isAdmin: false,
  tickets: [],
  broadcasts: [],
  adminTickets: [],
  adminBroadcasts: []
};

function getTelegramUser() {
  try {
    const tg = window.Telegram && window.Telegram.WebApp;
    const unsafeUser = tg && tg.initDataUnsafe && tg.initDataUnsafe.user;
    if (unsafeUser && unsafeUser.id) {
      return unsafeUser;
    }
  } catch (err) {
    console.error('app.js getTelegramUser error:', err);
  }

  return {
    id: 0,
    first_name: 'Guest',
    last_name: 'Preview',
    username: null,
    photo_url: null,
    language_code: 'en'
  };
}

function setupTelegramWebApp() {
  try {
    const tg = window.Telegram && window.Telegram.WebApp;
    if (!tg) return;
    if (typeof tg.ready === 'function') {
      tg.ready();
    }
    if (typeof tg.expand === 'function') {
      tg.expand();
    }
  } catch (err) {
    console.error('app.js setupTelegramWebApp error:', err);
  }
}

function syncNavVisibilityAndLabels() {
  try {
    const t = (key) => (window.i18n && typeof window.i18n.t === 'function' ? window.i18n.t(key) : key);

    const labelsMap = {
      account: t('nav.account'),
      home: t('nav.account'),
      channels: t('nav.channels'),
      campaigns: t('nav.campaigns'),
      wallet: t('nav.wallet'),
      admin: t('nav.admin')
    };

    document.querySelectorAll('[data-nav-tab], .nav-item').forEach((btn) => {
      const tab = btn.getAttribute('data-nav-tab') || btn.getAttribute('data-target');
      if (!tab) return;

      if (tab === 'admin') {
        btn.classList.toggle('is-hidden', !appState.isAdmin);
        btn.style.display = appState.isAdmin ? '' : 'none';
      }

      if (labelsMap[tab]) {
        const textEl = btn.querySelector('.nav-label') || btn;
        textEl.textContent = labelsMap[tab];
      }

      const isCurrent = tab === appState.activeTab || (appState.activeTab === 'account' && tab === 'home');
      btn.classList.toggle('is-active', isCurrent);
      btn.classList.toggle('active', isCurrent);
    });

    if (appState.activeTab === 'admin' && !appState.isAdmin) {
      appState.activeTab = 'account';
    }
  } catch (err) {
    console.error('app.js syncNavVisibilityAndLabels error:', err);
  }
}

function showToast(message) {
  try {
    const tg = window.Telegram && window.Telegram.WebApp;
    if (tg && typeof tg.showPopup === 'function' && String(message).length <= 180) {
      tg.showPopup({ message });
      return;
    }

    const toast = document.getElementById('toast-banner');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.remove('is-hidden');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
      toast.classList.add('is-hidden');
    }, 3000);
  } catch (err) {
    console.error('app.js showToast error:', err);
  }
}

async function renderActiveView() {
  try {
    syncNavVisibilityAndLabels();

    const uiTabName = appState.activeTab === 'account' ? 'home' : appState.activeTab;
    setActiveTab(uiTabName);

    const accountContainer = document.getElementById('view-account');
    const adminContainer = document.getElementById('view-admin');
    const placeholderContainer = document.getElementById('view-placeholder');

    document.querySelectorAll('.app-view').forEach((el) => el.classList.add('is-hidden'));

    if (appState.activeTab === 'account' && accountContainer && window.UIModule) {
      accountContainer.classList.remove('is-hidden');
      window.UIModule.renderAccountSection(accountContainer, {
        user: appState.user,
        tickets: appState.tickets,
        broadcasts: appState.broadcasts,
        onLanguageChange: async (newLang) => {
          try {
            if (window.APIModule && typeof window.APIModule.getInitData === 'function' && window.APIModule.getInitData()) {
              await window.APIModule.updateLanguage(newLang);
            }
          } catch (err) {
            console.error('app.js updateLanguage error:', err);
          }
          await renderActiveView();
        },
        onSubmitTicket: async (payload, formEl) => {
          try {
            if (!window.APIModule || !window.APIModule.getInitData()) {
              showToast(window.i18n ? window.i18n.t('account.support.ticketSent') : 'Sent');
              if (formEl) formEl.reset();
              return;
            }

            const res = await window.APIModule.createTicket(payload);
            if (res && res.ticket) {
              appState.tickets.unshift(res.ticket);
            }
            if (formEl) formEl.reset();
            showToast(window.i18n ? window.i18n.t('account.support.ticketSent') : 'Sent');
            await renderActiveView();
          } catch (err) {
            console.error('app.js onSubmitTicket error:', err);
            showToast(err && err.message ? err.message : 'Error');
          }
        }
      });
      return;
    }

    if (appState.activeTab === 'admin' && appState.isAdmin && adminContainer && window.AdminModule) {
      adminContainer.classList.remove('is-hidden');
      await window.AdminModule.renderAdminSection(adminContainer, {
        isAdmin: appState.isAdmin,
        tickets: appState.adminTickets,
        broadcasts: appState.adminBroadcasts,
        onSendBroadcast: async (payload, formEl) => {
          try {
            const res = await window.APIModule.sendBroadcast(payload);
            if (res && res.broadcast) {
              appState.adminBroadcasts.unshift(res.broadcast);
              appState.broadcasts.unshift(res.broadcast);
            }
            if (formEl) formEl.reset();
            showToast(
              (window.i18n && window.i18n.currentLang) === 'ar'
                ? 'تم إرسال البث بنجاح'
                : 'Broadcast sent'
            );
            await renderActiveView();
          } catch (err) {
            console.error('app.js onSendBroadcast error:', err);
            showToast(err && err.message ? err.message : 'Error');
          }
        },
        onReplyTicket: async (ticketId, replyText, formEl) => {
          try {
            const res = await window.APIModule.replyToTicket(ticketId, replyText);
            if (res && res.ticket) {
              appState.adminTickets = appState.adminTickets.map((item) =>
                String(item.id) === String(ticketId) ? res.ticket : item
              );
            }
            if (formEl) formEl.reset();
            showToast(
              (window.i18n && window.i18n.currentLang) === 'ar'
                ? 'تم إرسال الرد'
                : 'Reply sent'
            );
            await renderActiveView();
          } catch (err) {
            console.error('app.js onReplyTicket error:', err);
            showToast(err && err.message ? err.message : 'Error');
          }
        }
      });
      return;
    }

    if (placeholderContainer) {
      placeholderContainer.classList.remove('is-hidden');
      const title = window.i18n ? window.i18n.t(`nav.${appState.activeTab}`) : appState.activeTab;
      placeholderContainer.innerHTML = `
        <section class="card placeholder-card">
          <h2 class="card-title">${title}</h2>
          <p class="helper-note">
            ${
              (window.i18n && window.i18n.currentLang) === 'ar'
                ? 'هذا القسم جاهز للربط الكامل مع وحدات القنوات والحملات والمحفظة.'
                : 'This module is ready to connect with Channels, Campaigns, and Wallet.'
            }
          </p>
        </section>
      `;
    }
  } catch (err) {
    console.error('app.js renderActiveView error:', err);
  }
}

async function hydrateFromServer() {
  if (!window.APIModule || typeof window.APIModule.getInitData !== 'function' || !window.APIModule.getInitData()) {
    return;
  }

  try {
    const accountData = await window.APIModule.getAccount(
      window.i18n ? window.i18n.currentLang : 'ar'
    );

    if (accountData && accountData.user) {
      appState.user = Object.assign({}, appState.user, accountData.user);
    }
    appState.isAdmin = Boolean(accountData && accountData.isAdmin);
    appState.tickets = Array.isArray(accountData && accountData.tickets) ? accountData.tickets : [];
    appState.broadcasts = Array.isArray(accountData && accountData.broadcasts) ? accountData.broadcasts : [];

    let hasManualOverride = false;
    try {
      hasManualOverride = Boolean(localStorage.getItem('telega_ads_lang'));
    } catch (_) {
      hasManualOverride = false;
    }

    if (
      !hasManualOverride &&
      accountData &&
      accountData.user &&
      accountData.user.selectedLanguage &&
      window.i18n &&
      typeof window.i18n.setLanguage === 'function'
    ) {
      window.i18n.setLanguage(accountData.user.selectedLanguage, { persist: false });
    }

    if (appState.isAdmin) {
      const adminData = await window.APIModule.getAdminOverview();
      appState.adminTickets = Array.isArray(adminData && adminData.tickets) ? adminData.tickets : [];
      appState.adminBroadcasts = Array.isArray(adminData && adminData.broadcasts) ? adminData.broadcasts : [];
    } else {
      appState.isAdmin = false;
      appState.adminTickets = [];
      appState.adminBroadcasts = [];
    }
  } catch (err) {
    console.warn('Account sync notice:', err && err.message ? err.message : err);
    appState.isAdmin = false;
  }
}

function bindNavigation() {
  try {
    document.querySelectorAll('[data-nav-tab], .nav-item').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const rawTab = btn.getAttribute('data-nav-tab') || btn.getAttribute('data-target');
        const targetTab = rawTab === 'home' ? 'account' : rawTab;
        if (targetTab === 'admin' && !appState.isAdmin) {
          return;
        }
        appState.activeTab = targetTab || 'account';
        await renderActiveView();
      });
    });
  } catch (err) {
    console.error('app.js bindNavigation error:', err);
  }
}

async function initApp() {
  try {
    setupTelegramWebApp();
    initThemeListener();
    setOnLanguageChange(() => {
      refreshHeaderTitle();
      renderActiveView();
    });

    appState.user = getTelegramUser();

    if (window.i18n && typeof window.i18n.init === 'function') {
      window.i18n.init('ar');
      if (typeof window.i18n.onChange === 'function') {
        window.i18n.onChange(() => {
          refreshHeaderTitle();
          renderActiveView();
        });
      }
    } else {
      applyLanguage('ar');
    }

    const langBtn = document.getElementById('lang-toggle-btn');
    if (langBtn) {
      langBtn.addEventListener('click', () => {
        toggleLanguage();
      });
    }

    bindNavigation();
    syncNavVisibilityAndLabels();
    await renderActiveView();
    await hydrateFromServer();
    await renderActiveView();

    initChannels();
    initCampaigns();
    initWallet();
    initAdmin();
  } catch (err) {
    console.error('app.js initApp error:', err);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

if (typeof window !== 'undefined') {
  window.appState = appState;
}
