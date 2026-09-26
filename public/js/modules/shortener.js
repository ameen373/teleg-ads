import { state } from '../state.js';
import { apiCall } from '../api.js';
import { tg, showAlert, showConfirm, hapticFeedback } from '../telegram.js';
import { showToast, showLoading, hideLoading, formatDate, escapeHtml } from '../ui.js';

/**
 * تنسيق رابط الاختصار النهائي للعرض
 * @param {string} code - كود الرابط المختصر
 * @returns {string} - الرابط المختصر الكامل
 */
export function formatShortUrl(code) {
    if (!code) return '';
    const origin = window.location.origin;
    return `${origin}/s/${code}`;
}

/**
 * جلب جميع روابط المستخدم الحالي من الخادم
 */
export async function fetchUserLinks() {
    try {
        showLoading(true);
        const response = await apiCall('/api/links');
        if (response && response.success) {
            state.userLinks = response.links || [];
            renderUserLinks(state.userLinks);
        } else {
            showToast(response?.message || 'فشل جلب الروابط', 'error');
        }
    } catch (error) {
        console.error('Error fetching links:', error);
        showToast('حدث خطأ أثناء تحميل الروابط', 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * معالجة الضغط على زر اختصار رابط جديد
 */
export async function handleShortenClick() {
    const inputEl = document.getElementById('original-url-input');
    const titleEl = document.getElementById('link-title-input');
    
    if (!inputEl) return;
    
    const originalUrl = inputEl.value.trim();
    const title = titleEl ? titleEl.value.trim() : '';

    if (!originalUrl) {
        showToast('يرجى إدخال رابط صالحة لقصها', 'warning');
        return;
    }

    try {
        hapticFeedback('impact', 'medium');
        showLoading(true);
        
        const response = await apiCall('/api/links/shorten', 'POST', {
            originalUrl,
            title
        });

        if (response && response.success) {
            showToast('تم اختصار الرابط بنجاح!', 'success');
            inputEl.value = '';
            if (titleEl) titleEl.value = '';
            
            if (response.link) {
                state.userLinks.unshift(response.link);
                renderUserLinks(state.userLinks);
            } else {
                await fetchUserLinks();
            }
        } else {
            showAlert(response?.message || 'تعذر اختصار الرابط، يرجى المحاولة لاحقاً');
        }
    } catch (error) {
        console.error('Error shortening link:', error);
        showToast('حدث خطأ أثناء إنشاء الرابط', 'error');
    } finally {
        hideLoading();
    }
}

/**
 * عرض قائمة الروابط في الواجهة
 * @param {Array} linksToRender - مصفوفة الروابط المراد عرضها
 */
export function renderUserLinks(linksToRender = state.userLinks) {
    const container = document.getElementById('user-links-container');
    const emptyState = document.getElementById('links-empty-state');
    
    if (!container) return;

    if (!linksToRender || linksToRender.length === 0) {
        container.innerHTML = '';
        if (emptyState) emptyState.classList.remove('hidden');
        return;
    }

    if (emptyState) emptyState.classList.add('hidden');

    container.innerHTML = linksToRender.map(link => {
        const fullShortUrl = formatShortUrl(link.code);
        return `
            <div class="card link-card" id="link-item-${link._id}">
                <div class="link-card-header">
                    <h4 class="link-title">${escapeHtml(link.title || 'رابط بدون عنوان')}</h4>
                    <span class="badge ${link.active !== false ? 'badge-success' : 'badge-danger'}">
                        ${link.active !== false ? 'نشط' : 'معطل'}
                    </span>
                </div>
                <div class="link-details">
                    <p class="original-link" title="${escapeHtml(link.originalUrl)}">
                        <i class="icon-link"></i> ${escapeHtml(link.originalUrl)}
                    </p>
                    <div class="short-link-box">
                        <input type="text" readonly value="${fullShortUrl}" id="input-short-${link._id}">
                        <button class="btn btn-sm btn-primary" onclick="navigator.clipboard.writeText('${fullShortUrl}'); showToast('تم نسخ الرابط!', 'info');">
                            نسخ
                        </button>
                    </div>
                </div>
                <div class="link-stats">
                    <span><i class="icon-eye"></i> الزيارات: <strong>${link.views || 0}</strong></span>
                    <span><i class="icon-cash"></i> الأرباح: <strong>$${(link.earnings || 0).toFixed(4)}</strong></span>
                    <span><i class="icon-calendar"></i> ${formatDate(link.createdAt)}</span>
                </div>
                <div class="link-actions">
                    <button class="btn btn-sm btn-danger-outline" onclick="window.deleteLink('${link._id}')">
                        حذف الرابط
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * تصفية الروابط حسب كلمة البحث
 * @param {string} searchTerm - نص البحث
 */
export function filterUserLinks(searchTerm) {
    if (!searchTerm) {
        renderUserLinks(state.userLinks);
        return;
    }
    const term = searchTerm.toLowerCase().trim();
    const filtered = state.userLinks.filter(link => {
        const titleMatches = (link.title || '').toLowerCase().includes(term);
        const urlMatches = (link.originalUrl || '').toLowerCase().includes(term);
        const codeMatches = (link.code || '').toLowerCase().includes(term);
        return titleMatches || urlMatches || codeMatches;
    });
    renderUserLinks(filtered);
}

/**
 * حذف رابط محدد
 * @param {string} linkId - معرف الرابط
 */
export async function deleteLink(linkId) {
    if (!linkId) return;

    const confirmed = await showConfirm('هل أنت أكتأكد من رغبتك في حذف هذا الرابط؟ لا يمكن التراجع عن هذه الخطوة.');
    if (!confirmed) return;

    try {
        showLoading(true);
        const response = await apiCall(`/api/links/${linkId}`, 'DELETE');
        if (response && response.success) {
            showToast('تم حذف الرابط بنجاح', 'success');
            state.userLinks = state.userLinks.filter(l => l._id !== linkId);
            renderUserLinks(state.userLinks);
        } else {
            showAlert(response?.message || 'فشل حذف الرابط');
        }
    } catch (error) {
        console.error('Error deleting link:', error);
        showToast('حدث خطأ أثناء تنفيذ عملية الحذف', 'error');
    } finally {
        hideLoading();
    }
}

// تصدير وتأكيد إسناد دالة deleteLink إلى النافذة العامة window
window.deleteLink = deleteLink;

/**
 * تهيئة صفحة الجسر (صفحة العداد والمشاهدة)
 * @param {string} linkCode - كود الرابط المختصر
 */
export function initBridgeView(linkCode) {
    const bridgeContainer = document.getElementById('bridge-view-container');
    if (!bridgeContainer) return;

    state.currentBridgeCode = linkCode;
    const timerDisplay = document.getElementById('bridge-timer-display');
    const actionBtn = document.getElementById('bridge-action-btn');

    if (actionBtn) {
        actionBtn.disabled = true;
        actionBtn.innerText = 'يرجى الانتظار...';
    }

    startBridgeTimer(10, async () => {
        if (timerDisplay) timerDisplay.innerText = 'جاهز الآن!';
        if (actionBtn) {
            actionBtn.disabled = false;
            actionBtn.innerText = 'متابعة إلى الرابط الأصلي';
            actionBtn.onclick = () => completeImpression(linkCode);
        }
    });
}

/**
 * بدء التنازلي للعداد
 * @param {number} duration - مدة الانتظار بالثواني
 * @param {Function} callback - دالة تنفذ عند انتهاء العداد
 */
export function startBridgeTimer(duration, callback) {
    let timer = duration;
    const display = document.getElementById('bridge-timer-display');
    
    if (display) display.innerText = `${timer} ثانية`;

    const interval = setInterval(() => {
        timer--;
        if (display) display.innerText = `${timer} ثانية`;

        if (timer <= 0) {
            clearInterval(interval);
            if (typeof callback === 'function') callback();
        }
    }, 1000);
}

/**
 * تسجيل مشاهدة الرابط واحتساب المكافأة ثم التوجيه
 * @param {string} linkCode - كود الرابط
 */
export async function completeImpression(linkCode) {
    try {
        showLoading(true);
        const response = await apiCall('/api/links/impression', 'POST', { code: linkCode });
        if (response && response.success && response.targetUrl) {
            window.location.href = response.targetUrl;
        } else {
            showAlert(response?.message || 'حدث خطأ أثناء معالجة الرابط، حاول مرة أخرى');
        }
    } catch (error) {
        console.error('Error completing impression:', error);
        showToast('تعذر التوجيه للرابط الأصلي', 'error');
    } finally {
        hideLoading();
    }
}
