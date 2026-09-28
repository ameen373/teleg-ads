document.addEventListener('DOMContentLoaded', async () => {
  if (typeof window.renderTelegramUser === 'function') {
    window.renderTelegramUser();
  }

  if (typeof window.authLogin === 'function') {
    await window.authLogin();
  }
  
  const pathParts = window.location.pathname.split('/');
  if (pathParts.length >= 3 && pathParts[1] === 'r') {
    const code = pathParts[2];
    if (code) {
      if (typeof window.initBridgeView === 'function') {
        window.initBridgeView(code);
      }
      return;
    }
  }

  if (typeof window.loadUserData === 'function') {
    await window.loadUserData();
  }

  if (typeof window.fetchUserLinks === 'function') {
    await window.fetchUserLinks();
  }

  // ربط أحداث الإدخال للحقول الديناميكية إن وجدت
  const withdrawInput = document.getElementById('withdraw-amount');
  if (withdrawInput) {
    withdrawInput.addEventListener('input', () => {
      if (typeof window.updateWithdrawCalculations === 'function') {
        window.updateWithdrawCalculations();
      }
    });
  }

  const linkSearchInput = document.getElementById('link-search-input');
  if (linkSearchInput) {
    linkSearchInput.addEventListener('input', (e) => {
      if (typeof window.filterUserLinks === 'function') {
        window.filterUserLinks(e.target.value);
      }
    });
  }
});
