// js/main.js
import { 
  showToast, 
  copyToClipboard, 
  switchTab, 
  handleNetworkChange, 
  switchWalletView, 
  toggleInstructionsModal, 
  updateWithdrawCalculations, 
  toggleWalletEdit, 
  filterUserLinks 
} from './modules/ui.js';
import { renderTelegramUser, authLogin } from './modules/auth.js';
import { createAdCampaign, fetchUserAds } from './modules/ads.js';
import { handleShortenClick, fetchUserLinks, deleteLink, initBridgeView, completeImpression } from './modules/shortener.js';
import { requestDeposit, saveSettings, requestWithdrawal } from './modules/wallet.js';
import { loadUserData, shareReferralLink, fetchUserReferrals } from './modules/user.js';
import { loadAdminData, processAdminAction } from './modules/admin.js';

// ربط جميع الدوال المطلوبة مباشرة بنطاق window للتأكد من تشغيل الأحداث من داخل HTML
window.copyToClipboard = copyToClipboard;
window.deleteLink = deleteLink;
window.switchTab = switchTab;
window.handleNetworkChange = handleNetworkChange;
window.switchWalletView = switchWalletView;
window.toggleInstructionsModal = toggleInstructionsModal;
window.updateWithdrawCalculations = updateWithdrawCalculations;
window.shareReferralLink = shareReferralLink;
window.toggleWalletEdit = toggleWalletEdit;
window.handleShortenClick = handleShortenClick;
window.filterUserLinks = filterUserLinks;
window.requestDeposit = requestDeposit;
window.saveSettings = saveSettings;
window.requestWithdrawal = requestWithdrawal;
window.createAdCampaign = createAdCampaign;
window.processAdminAction = processAdminAction;
window.completeImpression = completeImpression;

// نقطة الانطلاق الرئيسية عند تحميل الواجهة
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
