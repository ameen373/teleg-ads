import { applyLanguage, toggleLanguage, setOnLanguageChange } from './language/i18n.js';
import { initThemeListener, setActiveTab, refreshHeaderTitle } from './modules/ui.js';
import { init as initChannels } from './modules/channels.js';
import { init as initCampaigns } from './modules/campaigns.js';
import { init as initWallet } from './modules/wallet.js';
import { init as initAdmin } from './modules/admin.js';

document.addEventListener('DOMContentLoaded', () => {
  const tg = window.Telegram && window.Telegram.WebApp;
  if (tg) {
    tg.ready();
    tg.expand();
  }

  initThemeListener();
  setOnLanguageChange(refreshHeaderTitle);
  applyLanguage('ar');

  const langBtn = document.getElementById('lang-toggle-btn');
  if (langBtn) {
    langBtn.addEventListener('click', toggleLanguage);
  }

  const navButtons = document.querySelectorAll('.nav-item');
  navButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-target');
      if (target) {
        setActiveTab(target);
      }
    });
  });

  initChannels();
  initCampaigns();
  initWallet();
  initAdmin();
});
