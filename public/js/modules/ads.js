import { state } from '../state.js';
import { apiCall } from '../api.js';
import { tg, showAlert, hapticFeedback } from '../telegram.js';
import { showToast, showLoading, hideLoading, formatCurrency, formatDate, escapeHtml } from '../ui.js';

/**
 * إنشاء حملة إعلانية جديدة
 * @param {Object} campaignData - بيانات الحملة
 */
export async function createAdCampaign(campaignData) {
    const titleEl = document.getElementById('ad-title-input');
    const urlEl = document.getElementById('ad-url-input');
    const budgetEl = document.getElementById('ad-budget-input');
    const cpmEl = document.getElementById('ad-cpm-input');

    const title = campaignData?.title || (titleEl ? titleEl.value.trim() : '');
    const targetUrl = campaignData?.targetUrl || (urlEl ? urlEl.value.trim() : '');
    const budget = campaignData?.budget || (budgetEl ? parseFloat(budgetEl.value) : 0);
    const cpm = campaignData?.cpm || (cpmEl ? parseFloat(cpmEl.value) : 0);

    if (!title || !targetUrl || !budget || budget <= 0) {
        showToast('يرجى ملء جميع الحقول المطلوبة بشكل صحيح', 'warning');
        return;
    }

    try {
        showLoading(true);
        const response = await apiCall('/api/ads/create', 'POST', {
            title,
            targetUrl,
            budget,
            cpm
        });

        if (response && response.success) {
            hapticFeedback('notification', 'success');
            showToast('تم إنشاء الحملة الإعلانية بنجاح وهي قيد المراجعة', 'success');
            
            if (titleEl) titleEl.value = '';
            if (urlEl) urlEl.value = '';
            if (budgetEl) budgetEl.value = '';
            
            await fetchUserAds();
        } else {
            showAlert(response?.message || 'فشل إنشاء الحملة الإعلانية');
        }
    } catch (error) {
        console.error('Error creating ad campaign:', error);
        showToast('حدث خطأ أثناء حفظ الحملة الإعلانية', 'error');
    } finally {
        hideLoading();
    }
}

/**
 * جلب جميع حملات المستخدم الإعلانية
 */
export async function fetchUserAds() {
    try {
        showLoading(true);
        const response = await apiCall('/api/ads/my-ads');
        if (response && response.success) {
            state.userAds = response.ads || [];
            renderUserAds(state.userAds);
        } else {
            showToast('تعذر جلب الحملات الإعلانية', 'error');
        }
    } catch (error) {
        console.error('Error fetching user ads:', error);
        showToast('حدث خطأ أثناء جلب الحملات الإعلانية', 'error');
    } finally {
        hideLoading();
    }
}

/**
 * عرض قائمة حملات المستخدم الإعلانية
 * @param {Array} ads - قائمة الإعلانات
 */
export function renderUserAds(ads = state.userAds) {
    const container = document.getElementById('user-ads-container');
    const emptyState = document.getElementById('ads-empty-state');

    if (!container) return;

    if (!ads || ads.length === 0) {
        container.innerHTML = '';
        if (emptyState) emptyState.classList.remove('hidden');
        return;
    }

    if (emptyState) emptyState.classList.add('hidden');

    container.innerHTML = ads.map(ad => {
        let statusClass = 'badge-warning';
        let statusText = 'قيد المراجعة';

        if (ad.status === 'active') {
            statusClass = 'badge-success';
            statusText = 'نشط';
        } else if (ad.status === 'paused') {
            statusClass = 'badge-info';
            statusText = 'متوقف مؤقتاً';
        } else if (ad.status === 'completed') {
            statusClass = 'badge-secondary';
            statusText = 'مكتمل';
        } else if (ad.status === 'rejected') {
            statusClass = 'badge-danger';
            statusText = 'مرفوض';
        }

        return `
            <div class="card ad-card">
                <div class="ad-card-header">
                    <h4>${escapeHtml(ad.title)}</h4>
                    <span class="badge ${statusClass}">${statusText}</span>
                </div>
                <p class="text-sm text-muted">${escapeHtml(ad.targetUrl)}</p>
                <div class="ad-stats grid-2">
                    <div>الميزانية: <strong>${formatCurrency(ad.budget)}</strong></div>
                    <div>المصروف: <strong>${formatCurrency(ad.spent || 0)}</strong></div>
                    <div>المشاهدات: <strong>${ad.impressions || 0}</strong></div>
                    <div>CPM: <strong>${formatCurrency(ad.cpm || 0)}</strong></div>
                </div>
                <div class="ad-date text-xs text-muted">
                    تاريخ الإنشاء: ${formatDate(ad.createdAt)}
                </div>
            </div>
        `;
    }).join('');
}

/**
 * تهيئة وتكامل إعلانات المكافآت من AdsGram بالكامل
 */
export function initAdsGramReward() {
    const rewardBtn = document.getElementById('adsgram-reward-btn');
    if (!rewardBtn) return;

    const blockId = state.systemSettings?.adsgramBlockId || 'YOUR_BLOCK_ID';

    rewardBtn.addEventListener('click', async () => {
        if (!window.Adsgram) {
            showToast('شبكة الإعلانات غير متاحة حالياً، يرجى المحاولة لاحقاً', 'warning');
            return;
        }

        try {
            hapticFeedback('impact', 'light');
            showLoading(true);

            const AdController = window.Adsgram.init({ blockId: blockId });

            AdController.show().then(async (result) => {
                // تمت مشاهدة الإعلان بنجاح
                try {
                    const response = await apiCall('/api/adsgram/reward', 'POST', {
                        event: 'completed',
                        rewardAmount: state.systemSettings?.adsgramRewardAmount || 0.01
                    });

                    if (response && response.success) {
                        hapticFeedback('notification', 'success');
                        showAlert(`تهانينا! حصلت على مكافأة مشاهدة الإعلان قدرها ${formatCurrency(response.reward || 0.01)}`);
                        if (state.user && response.newBalance !== undefined) {
                            state.user.balance = response.newBalance;
                        }
                    } else {
                        showToast(response?.message || 'تعذر إضافة المكافأة', 'error');
                    }
                } catch (err) {
                    console.error('Error crediting reward:', err);
                }
            }).catch((error) => {
                // تم إغلاق الإعلان قبل انتهاء الوقت أو خطأ في العرض
                console.warn('AdGram execution result/error:', error);
                showToast('لم تتم مشاهدة الإعلان بالكامل للحصول على المكافأة', 'info');
            }).finally(() => {
                hideLoading();
            });

        } catch (error) {
            console.error('AdsGram Initialization Error:', error);
            hideLoading();
            showToast('حدث خطأ أثناء تشغيل الإعلان', 'error');
        }
    });
}
