document.addEventListener('DOMContentLoaded', async () => {
  if (window.Telegram && window.Telegram.WebApp) {
    window.Telegram.WebApp.ready();
    window.Telegram.WebApp.expand();
  }

  initI18n();
  UI.init();

  try {
    const authResult = await API.authenticate();
    if (authResult.success && authResult.user) {
      UI.updateUserData(authResult.user);
    }
  } catch (err) {
    console.error('Initialization error:', err);
  }
});
