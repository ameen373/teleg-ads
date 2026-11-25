(function () {
  document.addEventListener('DOMContentLoaded', function () {
    if (window.Telegram && window.Telegram.WebApp) {
      window.Telegram.WebApp.ready();
      window.Telegram.WebApp.expand();
    }

    if (window.I18n) {
      window.I18n.applyLanguage('ar');
    }

    var langBtn = document.getElementById('lang-toggle-btn');
    if (langBtn && window.I18n) {
      langBtn.addEventListener('click', function () {
        window.I18n.toggleLanguage();
      });
    }

    var navButtons = document.querySelectorAll('.nav-item');
    navButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var target = btn.getAttribute('data-target');
        if (target && window.UI) {
          window.UI.setActiveTab(target);
        }
      });
    });

    if (window.ChannelsModule) window.ChannelsModule.init();
    if (window.CampaignsModule) window.CampaignsModule.init();
    if (window.WalletModule) window.WalletModule.init();
    if (window.AdminModule) window.AdminModule.init();
  });
})();
