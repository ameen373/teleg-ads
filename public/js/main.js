import { state, resetState } from './modules/state.js';
import { authLogin, apiCall } from './modules/api.js';
import { tg, initTelegramApp, showAlert, showConfirm, hapticFeedback } from './modules/telegram.js';
import { 
    showTab, 
    switchTab, 
    switchWalletView, 
    showToast, 
    showLoading, 
    hideLoading, 
    copyToClipboard, 
    toggleInstructionsModal, 
    formatCurrency, 
    formatDate, 
    escapeHtml 
} from './modules/ui.js';
import { 
    formatShortUrl, 
    fetchUserLinks, 
    handleShortenClick, 
    renderUserLinks, 
    filterUserLinks, 
    deleteLink, 
    initBridgeView, 
    startBridgeTimer, 
    completeImpression 
} from './modules/shortener.js';
import { 
    toggleWalletEdit, 
    updateWithdrawCalculations, 
    requestDeposit, 
    saveSettings, 
    requestWithdrawal, 
    renderWithdrawalsHistory, 
    fetchUserReferrals, 
    renderUserReferrals 
} from './modules/wallet.js';
import { 
    createAdCampaign, 
    fetchUserAds, 
    renderUserAds, 
    initAdsGramReward 
} from './modules/ads.js';
import { 
    loadAdminData, 
    renderAdminDeposits, 
    renderAdminWithdraws, 
    renderAdminUsers, 
    renderAdminLinks, 
    renderAdminAds, 
    processAdminAction 
} from './modules/admin.js';

// ==========================================
// 1. ربط الدالات بالنطاق العام (window) لعمل أزرار HTML
// ==========================================
window.switchTab = switchTab;
window.switchWalletView = switchWalletView;
window.handleShortenClick = handleShortenClick;
window.deleteLink = deleteLink;
window.copyToClipboard = copyToClipboard;
window.processAdminAction = processAdminAction;
window.requestDeposit = requestDeposit;
window.requestWithdrawal = requestWithdrawal;
window.saveSettings = saveSettings;
window.createAdCampaign = createAdCampaign;
window.toggleInstructionsModal = toggleInstructionsModal;
window.toggleWalletEdit = toggleWalletEdit;
window.updateWithdrawCalculations = updateWithdrawCalculations;
window.filterUserLinks = filterUserLinks;

// ==========================================
// 2. إعداد مستمعات الأحداث العامة (Event Listeners)
// ==========================================
function setupEventListeners() {
    // مستمع حقل البحث في الروابط
    const searchInput = document.getElementById('search-links-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            filterUserLinks(e.target.value);
        });
    }

    // مستمع حساب عمولة السحب التلقائي عند الكتابة
    const withdrawInput = document.getElementById('withdraw-amount-input');
    if (withdrawInput) {
        withdrawInput.addEventListener('input', () => {
            updateWithdrawCalculations();
        });
    }

    // مستمع زر اختصار الرابط الرئيسي
    const shortenBtn = document.getElementById('shorten-btn');
    if (shortenBtn) {
        shortenBtn.addEventListener('click', (e) => {
            e.preventDefault();
            handleShortenClick();
        });
    }

    // مستمع زر إنشاء حملة إعلانية
    const createAdBtn = document.getElementById('create-ad-btn');
    if (createAdBtn) {
        createAdBtn.addEventListener('click', (e) => {
            e.preventDefault();
            createAdCampaign();
        });
    }

    // مستمع أزرار التنقل السفلي (Navigation Tabs)
    const navButtons = document.querySelectorAll('.nav-item[data-tab]');
    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabName = btn.getAttribute('data-tab');
            if (tabName) {
                switchTab(tabName);
                if (tabName === 'admin' && state.user?.isAdmin) {
                    loadAdminData();
                }
            }
        });
    });
}

// ==========================================
// 3. تحديث بيانات الواجهة الرأسية للمستخدم
// ==========================================
function updateHeaderUI() {
    if (!state.user) return;

    const userNameEl = document.getElementById('user-display-name');
    const userBalanceEl = document.getElementById('user-display-balance');
    const userAvatarEl = document.getElementById('user-avatar-img');
    const adminTabBtn = document.getElementById('admin-tab-btn');

    if (userNameEl) userNameEl.innerText = state.user.first_name || state.user.username || 'مستخدم';
    if (userBalanceEl) userBalanceEl.innerText = formatCurrency(state.user.balance || 0);
    
    if (userAvatarEl && state.user.photo_url) {
        userAvatarEl.src = state.user.photo_url;
    }

    // إظهار تبويب الآدمن إذا كان المستخدم يملك صلاحية المسؤول
    if (adminTabBtn) {
        if (state.user.isAdmin) {
            adminTabBtn.classList.remove('hidden');
        } else {
            adminTabBtn.classList.add('hidden');
        }
    }
}

// ==========================================
// 4. تهيئة بدء التشغيل التطبيق (Application Initialization)
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // أ) تهيئة تطبيق تلجرام المصغر
        initTelegramApp();

        // ب) فحص ما إذا كانت الصفحة الحالية هي صفحة الجسر (صفحة التوجيه والعداد)
        const urlParams = new URLSearchParams(window.location.search);
        const bridgeCode = urlParams.get('code') || window.location.pathname.split('/s/')[1];

        if (bridgeCode && document.getElementById('bridge-view-container')) {
            initBridgeView(bridgeCode);
            return;
        }

        // ج) تسجيل الدخول والتوثيق من خلال بيئة تلجرام
        showLoading(true);
        const authSuccess = await authLogin();

        if (!authSuccess) {
            showToast('تعذر التوثيق مع حساب تلجرام', 'error');
            hideLoading();
            return;
        }

        // د) تحديث بيانات المستخدم العامة في رأس الصفحة
        updateHeaderUI();

        // هـ) إعداد مستمعات الأحداث في الواجهة
        setupEventListeners();

        // و) تهيئة زر ومكافآت AdsGram
        initAdsGramReward();

        // ز) جلب كافة البيانات الأولية للمستخدم بالتوازي
        await Promise.all([
            fetchUserLinks(),
            fetchUserAds(),
            fetchUserReferrals()
        ]);

        // ح) العرض المبدئي لصفحة الاختصار
        switchTab('shortener');

    } catch (error) {
        console.error('Fatal Initialization Error:', error);
        showToast('حدث خطأ أثناء تحميل التطبيق', 'error');
    } finally {
        hideLoading();
    }
});
