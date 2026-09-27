import { state } from './state.js';
import * as Auth from './modules/auth.js';
import * as UI from './modules/ui.js';
import * as Ads from './modules/ads.js';
import * as Wallet from './modules/wallet.js';
import * as Shortener from './modules/shortener.js';
import * as User from './modules/user.js';
import * as Admin from './modules/admin.js';

[Auth, UI, Ads, Wallet, Shortener, User, Admin].forEach(mod => Object.assign(window, mod));
window.state = state;

document.addEventListener('DOMContentLoaded', async () => {
  await Auth.initApp();

  const pathParts = window.location.pathname.split('/');
  if (pathParts.length >= 3 && pathParts[1] === 'r') {
    const code = pathParts[2];
    if (code) {
      Shortener.initBridgeView(code);
      return;
    }
  }

  await User.loadUserData();
  await Shortener.fetchUserLinks();
  UI.switchTab('home');
});
