const API = {
  getInitData() {
    return window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp.initData : '';
  },

  async authenticate() {
    const response = await fetch('/api/auth', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Init-Data': this.getInitData()
      }
    });
    return response.json();
  },

  async getProfile() {
    const response = await fetch('/api/user/me', {
      method: 'GET',
      headers: {
        'X-Telegram-Init-Data': this.getInitData()
      }
    });
    return response.json();
  }
};
