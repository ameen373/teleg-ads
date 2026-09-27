import { state, resetState } from './modules/state.js';
import { authLogin, apiCall } from './modules/api.js';
import { tg, initTelegramApp, showAlert, showConfirm, hapticFeedback } from './modules/telegram.js';
import { 
    showTab, 
    switchTab as moduleSwitchTab, 
    switchWalletView as moduleSwitchWalletView, 
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
// 1. ربط جميع الدالات بالنطاق العام (window) لعمل أزرار HTML
// ==========================================

// دالة العامة للتحكم بالنوافذ المنبثقة
window.toggleModal = function(modalId, show) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    if (show === undefined) {
        modal.classList.toggle('hidden');
    } else if (show) {
        modal.classList.remove('hidden');
    } else {
        modal.classList.add('hidden');
    }
};

// دالة تغيير شبكة الإيداع (TRC20 / BEP20)
window.handleNetworkChange = function(network) {
    const trc20Card = document.getElementById('card-addr-trc20');
    const bep20Card = document.getElementById('card-addr-bep20');
    if (trc20Card) trc20Card.classList.add('hidden');
    if (bep20Card) bep20Card.classList.add('hidden');
    
    if (network === 'TRC20' && trc20Card) {
        trc20Card.classList.remove('hidden');
    } else if (network === 'BEP20' && bep20Card) {
        bep20Card.classList.remove('hidden');
    }
};

// دالة التنقل بين التبويبات الرئيسية
window.switchTab = function(tabName) {
    if (tabName === 'shortener') tabName = 'dashboard';

    if (typeof moduleSwitchTab === 'function') {
        try { moduleSwitchTab(tabName); } catch (e) { console.warn(e); }
    }

    const tabs = ['dashboard', 'wallet', 'ads', 'referral', 'settings', 'admin'];
    tabs.forEach(name => {
        const content = document.getElementById(`tab-content-${name}`);
        const btn = document.getElementById(`tab-btn-${name}`);
        if (content) {
            if (name === tabName) {
                content.classList.remove('hidden');
                content.style.display = 'block';
            } else {
                content.classList.add('hidden');
                content.style.display = 'none';
            }
        }
        if (btn) {
            if (name === tabName) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        }
    });

    if (tabName === 'admin' && state?.user?.isAdmin) {
        if (typeof loadAdminData === 'function') loadAdminData();
    }
};

// دالة التنقل بين أجزاء المحفظة (شحن / سحب)
window.switchWalletView = function(viewName) {
    if (typeof moduleSwitchWalletView === 'function') {
        try { moduleSwitchWalletView(viewName); } catch (e) { console.warn(e); }
    }

    const depView = document.getElementById('wallet-view-deposit');
    const withView = document.getElementById('wallet-view-withdraw');
    const depBtn = document.getElementById('wallet-nav-deposit');
    const withBtn = document.getElementById('wallet-nav-withdraw');

    if (viewName === 'deposit') {
        if (depView) depView.classList.remove('hidden');
        if (withView) withView.classList.add('hidden');
        if (depBtn) depBtn.classList.add('active');
        if (withBtn) withBtn.classList.remove('active');
    } else if (viewName === 'withdraw') {
        if (depView) depView.classList.add('hidden');
        if (withView) withView.classList.remove('hidden');
        if (depBtn) depBtn.classList.remove('active');
        if (withBtn) withBtn.classList.add('active');
    }
};

// مشاركة رابط الإحالة عبر تلجرام
window.shareReferralLink = function() {
    const refInput = document.getElementById('ref-link');
    const refUrl = refInput ? refInput.value : '';
    if (refUrl && window.Telegram?.WebApp) {
        const shareText = encodeURIComponent('انضم إلى منصة Telega.ads وابدأ الربح من اختصار الروابط والإعلانات!');
        const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(refUrl)}&text=${shareText}`;
        window.Telegram.WebApp.openTelegramLink(shareUrl);
    } else if (refUrl) {
        copyToClipboard(refUrl);
    }
};

// تغيير اللغة
window.changeAppLanguage = function(lang) {
    showToast(lang === 'ar' ? 'تم تغيير اللغة إلى العربية' : 'Language set to English', 'success');
};

// ربط بقية الدوال بالنافذة
window.handleShortenClick = (e) => { if (e && e.preventDefault) e.preventDefault(); handleShortenClick(); };
window.deleteLink = deleteLink;
window.copyToClipboard = copyToClipboard;
window.processAdminAction = processAdminAction;
window.requestDeposit = requestDeposit;
window.requestWithdrawal = requestWithdrawal;
window.saveSettings = saveSettings;
window.createAdCampaign = createAdCampaign;
window.toggleInstructionsModal = (show) => window.toggleModal('instructions-modal', show);
window.toggleWalletEdit = toggleWalletEdit;
window.updateWithdrawCalculations = updateWithdrawCalculations;
window.filterUserLinks = filterUserLinks;
window.completeImpression = completeImpression;

// ==========================================
// 2. إعداد مستمعات الأحداث العامة (Event Listeners)
// ==========================================
function setupEventListeners() {
    const searchInput = document.getElementById('search-links-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            filterUserLinks(e.target.value);
        });
    }

    const withdrawInput = document.getElementById('withdraw-amount');
    if (withdrawInput) {
        withdrawInput.addEventListener('input', () => {
            updateWithdrawCalculations();
        });
    }

    const shortenBtn = document.getElementById('btn-create-link');
    if (shortenBtn) {
        shortenBtn.addEventListener('click', (e) => {
            e.preventDefault();
            handleShortenClick();
        });
    }

    const createAdBtn = document.getElementById('btn-create-ad');
    if (createAdBtn) {
        createAdBtn.addEventListener('click', (e) => {
            e.preventDefault();
            createAdCampaign();
        });
    }
}

// ==========================================
// 3. تحديث بيانات الواجهة الرأسية للمستخدم
// ==========================================
function updateHeaderUI() {
    if (!state.user) return;

    const userNameEl = document.getElementById('user-display-name');
    const userHandleEl = document.getElementById('user-display-handle');
    const userIdEl = document.getElementById('user-tg-id');
    const userBalanceEl = document.getElementById('user-display-balance');
    const premiumBadge = document.getElementById('user-premium-badge');
    const adminTabBtn = document.getElementById('tab-btn-admin');
    const refLinkInput = document.getElementById('ref-link');

    const displayName = state.user.first_name 
        ? `${state.user.first_name} ${state.user.last_name || ''}`.trim() 
        : (state.user.username || 'مستخدم');

    if (userNameEl) userNameEl.innerText = displayName;
    
    if (userHandleEl) {
        userHandleEl.innerText = state.user.username ? `@${state.user.username}` : '@user';
    }
    
    if (userIdEl) {
        const telegramId = state.user.telegram_id || state.user.id || '-';
        userIdEl.innerText = `ID: ${telegramId}`;
    }

    if (userBalanceEl && typeof formatCurrency === 'function') {
        userBalanceEl.innerText = formatCurrency(state.user.balance || 0);
    }

    if (premiumBadge) {
        if (state.user.is_premium) {
            premiumBadge.classList.remove('hidden');
        } else {
            premiumBadge.classList.add('hidden');
        }
    }

    const avatarContainer = document.getElementById('user-avatar-container');
    if (avatarContainer) {
        if (state.user.photo_url) {
            avatarContainer.innerHTML = `<img src="${escapeHtml(state.user.photo_url)}" alt="Avatar" style="width: 42px; height: 42px; border-radius: 50%; object-fit: cover;">`;
        } else {
            const firstLetter = (displayName || 'U').charAt(0).toUpperCase();
            avatarContainer.innerHTML = `<div style="width: 42px; height: 42px; border-radius: 50%; background: var(--accent); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 18px;">${escapeHtml(firstLetter)}</div>`;
        }
    }

    if (refLinkInput) {
        const botUsername = window.Telegram?.WebApp?.initDataUnsafe?.bot?.username || 'Ads_telegabot';
        const tgId = state.user.telegram_id || state.user.id;
        refLinkInput.value = tgId ? `https://t.me/${botUsername}?start=ref_${tgId}` : '';
    }

    if (adminTabBtn) {
        if (state.user.isAdmin || state.user.role === 'admin') {
            adminTabBtn.style.display = 'inline-flex';
            adminTabBtn.classList.remove('hidden');
        } else {
            adminTabBtn.style.display = 'none';
            adminTabBtn.classList.add('hidden');
        }
    }
}

// ==========================================
// 4. تهيئة بدء تشغيل التطبيق (Application Initialization)
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    try {
        initTelegramApp();

        if (window.Telegram?.WebApp?.initDataUnsafe?.user) {
            state.user = { ...window.Telegram.WebApp.initDataUnsafe.user, ...state.user };
        }

        const urlParams = new URLSearchParams(window.location.search);
        const bridgeCode = urlParams.get('code') || window.location.pathname.split('/s/')[1];

        if (bridgeCode && document.getElementById('bridge-view')) {
            const bridgeView = document.getElementById('bridge-view');
            const appView = document.getElementById('app-view');
            if (bridgeView) bridgeView.classList.remove('hidden');
            if (appView) appView.classList.add('hidden');
            initBridgeView(bridgeCode);
            return;
        }

        showLoading(true);
        try {
            await authLogin();
        } catch (e) {
            console.warn('Auth login warning:', e);
        }

        if (!state.user && window.Telegram?.WebApp?.initDataUnsafe?.user) {
            state.user = window.Telegram.WebApp.initDataUnsafe.user;
        }

        updateHeaderUI();
        setupEventListeners();

        if (typeof initAdsGramReward === 'function') {
            try { initAdsGramReward(); } catch (e) { console.warn(e); }
        }

        try {
            await Promise.allSettled([
                fetchUserLinks(),
                fetchUserAds(),
                fetchUserReferrals()
            ]);
        } catch (e) {
            console.warn('Data fetching warning:', e);
        }

        window.switchTab('dashboard');

    } catch (error) {
        console.error('Fatal Initialization Error:', error);
        showToast('حدث خطأ أثناء تحميل التطبيق', 'error');
    } finally {
        hideLoading();
    }
});
