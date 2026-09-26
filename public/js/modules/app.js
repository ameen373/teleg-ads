import { state, tg, setAuthToken, setCurrentUserTelegramId, setIsUserAdmin, setCurrentLang } from './state.js';
import { safeFetch } from './api.js';
import { 
  escapeHTML, triggerHaptic, showToast, copyToClipboard, setButtonLoading, 
  switchTab, handleNetworkChange, switchWalletView, toggleInstructionsModal, 
  updateWithdrawCalculations, renderTelegramUser, toggleWalletEdit, changeAppLanguage 
} from './ui.js';
import { createAdCampaign, fetchUserAds, renderUserAds } from './ads.js';
import { 
  formatShortUrl, fetchUserLinks, handleShortenClick, renderUserLinks, 
  filterUserLinks, deleteLink, initBridgeView, startBridgeTimer, completeImpression 
} from './shortener.js';
import { 
  authLogin, loadUserData, shareReferralLink, requestDeposit, 
  saveSettings, requestWithdrawal, renderWithdrawalsHistory, 
  fetchUserReferrals, renderUserReferrals 
} from './user.js';
import { 
  loadAdminData, renderAdminDeposits, renderAdminWithdraws, 
  renderAdminUsers, renderAdminLinks, renderAdminAds, processAdminAction 
} from './admin.js';

// Global binding for inline HTML event attributes (onclick, oninput, onchange)
Object.assign(window, {
  escapeHTML,
  triggerHaptic,
  showToast,
  copyToClipboard,
  setButtonLoading,
  switchTab,
  handleNetworkChange,
  switchWalletView,
  toggleInstructionsModal,
  updateWithdrawCalculations,
  renderTelegramUser,
  toggleWalletEdit,
  changeAppLanguage,
  createAdCampaign,
  fetchUserAds,
  renderUserAds,
  formatShortUrl,
  fetchUserLinks,
  handleShortenClick,
  renderUserLinks,
  filterUserLinks,
  deleteLink,
  initBridgeView,
  startBridgeTimer,
  completeImpression,
  authLogin,
  loadUserData,
  shareReferralLink,
  requestDeposit,
  saveSettings,
  requestWithdrawal,
  renderWithdrawalsHistory,
  fetchUserReferrals,
  renderUserReferrals,
  loadAdminData,
  renderAdminDeposits,
  renderAdminWithdraws,
  renderAdminUsers,
  renderAdminLinks,
  renderAdminAds,
  processAdminAction
});

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
