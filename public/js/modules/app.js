import { 
  renderTelegramUser, 
  switchTab, 
  handleNetworkChange, 
  switchWalletView, 
  toggleInstructionsModal, 
  updateWithdrawCalculations, 
  toggleWalletEdit, 
  copyToClipboard, 
  showToast,
  changeAppLanguage 
} from './ui.js';
import { 
  authLogin, 
  loadUserData, 
  requestDeposit, 
  saveSettings, 
  requestWithdrawal, 
  shareReferralLink, 
  fetchUserReferrals 
} from './user.js';
import { 
  fetchUserLinks, 
  handleShortenClick, 
  filterUserLinks, 
  deleteLink, 
  initBridgeView, 
  completeImpression 
} from './shortener.js';
import { createAdCampaign, fetchUserAds } from './ads.js';
import { loadAdminData, processAdminAction } from './admin.js';

// Global Event Handlers for Inline HTML Bindings
window.switchTab = (tabName) => switchTab(tabName, { loadAdminData, fetchUserAds, fetchUserReferrals });
window.handleNetworkChange = handleNetworkChange;
window.switchWalletView = switchWalletView;
window.toggleInstructionsModal = toggleInstructionsModal;
window.updateWithdrawCalculations = updateWithdrawCalculations;
window.toggleWalletEdit = toggleWalletEdit;
window.copyToClipboard = copyToClipboard;
window.showToast = showToast;
window.changeAppLanguage = changeAppLanguage;

window.handleShortenClick = handleShortenClick;
window.filterUserLinks = filterUserLinks;
window.deleteLink = deleteLink;
window.completeImpression = completeImpression;

window.requestDeposit = requestDeposit;
window.saveSettings = saveSettings;
window.requestWithdrawal = requestWithdrawal;
window.shareReferralLink = shareReferralLink;

window.createAdCampaign = createAdCampaign;
window.processAdminAction = processAdminAction;

document.addEventListener('DOMContentLoaded', async () => {
  renderTelegramUser();
  await authLogin();
  
  const pathParts = window.location.pathname.split('/');
  if (pathParts.length >= 3 && pathParts[1] === 'r') {
    const code = pathParts[2];
    if (code) {
      initBridgeView(code);
      return;
    }
  }

  await loadUserData();
  await fetchUserLinks();
});
