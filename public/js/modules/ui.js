window.UI = (function () {
  var activeTab = 'home';

  function setActiveTab(tabName) {
    activeTab = tabName;

    var buttons = document.querySelectorAll('.nav-item');
    buttons.forEach(function (btn) {
      var isMatch = btn.getAttribute('data-target') === tabName;
      btn.classList.toggle('active', isMatch);
    });

    var sections = document.querySelectorAll('.tab-section');
    sections.forEach(function (sec) {
      var isMatch = sec.getAttribute('data-tab') === tabName;
      sec.classList.toggle('active', isMatch);
    });

    refreshHeaderTitle();
  }

  function refreshHeaderTitle() {
    var titleEl = document.getElementById('header-title');
    if (!titleEl || !window.I18n) return;
    titleEl.textContent = window.I18n.t('nav_' + activeTab);
  }

  function getActiveTab() {
    return activeTab;
  }

  return {
    setActiveTab: setActiveTab,
    refreshHeaderTitle: refreshHeaderTitle,
    getActiveTab: getActiveTab
  };
})();
