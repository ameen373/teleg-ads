import { i18n, currentLang } from '../language/i18n.js';
import { safeFetch, API_BASE, authToken, currentUserTelegramId, isUserAdmin, tg } from './api.js';
import { 
  escapeHTML, triggerHaptic, showToast, copyToClipboard, 
  setButtonLoading, switchTab, handleNetworkChange, switchWalletView, 
  toggleInstructionsModal, updateWithdrawCalculations, formatShortUrl 
} from './ui.js';
import { renderTelegramUser, authLogin } from './auth.js';
import { createAdCampaign, fetchUserAds, renderUserAds } from './ads.js';
import { 
  fetchUserLinks, handleShortenClick, renderUserLinks, 
  filterUserLinks, deleteLink, initBridgeView, 
  startBridgeTimer, completeImpression 
} from './shortener.js';
import { 
  shareReferralLink, toggleWalletEdit, loadUserData, 
  requestDeposit, saveSettings, requestWithdrawal, 
  renderWithdrawalsHistory, fetchUserReferrals, renderUserReferrals, 
  loadAdminData, renderAdminDeposits, renderAdminWithdraws, 
  renderAdminUsers, renderAdminLinks, renderAdminAds, processAdminAction 
} from './wallet.js';

// ربط الدوال التي تستدعى مباشرة من الـ HTML بكائن window
window.copyToClipboard = copyToClipboard;
window.switchTab = switchTab;
window.handleNetworkChange = handleNetworkChange;
window.switchWalletView = switchWalletView;
window.toggleInstructionsModal = toggleInstructionsModal;
window.updateWithdrawCalculations = updateWithdrawCalculations;
window.shareReferralLink = shareReferralLink;
window.toggleWalletEdit = toggleWalletEdit;
window.handleShortenClick = handleShortenClick;
window.filterUserLinks = filterUserLinks;
window.deleteLink = deleteLink;
window.requestDeposit = requestDeposit;
window.saveSettings = saveSettings;
window.requestWithdrawal = requestWithdrawal;
window.createAdCampaign = createAdCampaign;
window.processAdminAction = processAdminAction;
window.completeImpression = completeImpression;

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
