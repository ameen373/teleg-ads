import { state } from '../state.js';
import { apiCall } from '../api.js';
import { tg, showAlert, showConfirm, hapticFeedback } from '../telegram.js';
import { showToast, showLoading, hideLoading, formatCurrency, formatDate, escapeHtml } from '../ui.js';

/**
 * تبديل وضع التعديل لحقول بيانات السحب
 * @param {boolean} isEditing - حالة التعديل
 */
export function toggleWalletEdit(isEditing) {
    const formInputs = document.querySelectorAll('.wallet-settings-input');
    const saveBtn = document.getElementById('save-wallet-settings-btn');
    const editBtn = document.getElementById('edit-wallet-settings-btn');

    formInputs.forEach(input => {
        input.disabled = !isEditing;
    });

    if (saveBtn) saveBtn.classList.toggle('hidden', !isEditing);
    if (editBtn) editBtn.classList.toggle('hidden', isEditing);
}

/**
 * حساب تحديث عمولة وناتج عمليات السحب
 */
export function updateWithdrawCalculations() {
    const amountInput = document.getElementById('withdraw-amount-input');
    const feeDisplay = document.getElementById('withdraw-fee-display');
    const netDisplay = document.getElementById('withdraw-net-display');

    if (!amountInput || !feeDisplay || !netDisplay) return;

    const amount = parseFloat(amountInput.value) || 0;
    const feePercentage = state.systemSettings?.withdrawFeePercent || 5;
    const fee = (amount * feePercentage) / 100;
    const net = Math.max(0, amount - fee);

    feeDisplay.innerText = formatCurrency(fee);
    netDisplay.innerText = formatCurrency(net);
}

/**
 * تقديم طلب إيداع رصيد
 */
export function requestDeposit() {
    const amountInput = document.getElementById('deposit-amount-input');
    const methodSelect = document.getElementById('deposit-method-select');

    if (!amountInput) return;

    const amount = parseFloat(amountInput.value);
    const method = methodSelect ? methodSelect.value : 'manual';

    if (!amount || amount <= 0) {
        showToast('يرجى إدخال مبلغ إيداع صحيح', 'warning');
        return;
    }

    showLoading(true);
    apiCall('/api/wallet/deposit', 'POST', { amount, method })
        .then(response => {
            if (response && response.success) {
                hapticFeedback('notification', 'success');
                showAlert(`تم إنشاء طلب الإيداع بنجاح! \nيرجى تحويل المبلغ ($${amount}) وإرسال الإشعار للإدارة.`);
                amountInput.value = '';
            } else {
                showAlert(response?.message || 'فشل إرسال طلب الإيداع');
            }
        })
        .catch(error => {
            console.error('Error requesting deposit:', error);
            showToast(' حدث خطأ أثناء تنفيذ طلب الإيداع', 'error');
        })
        .finally(() => {
            hideLoading();
        });
}

/**
 * حفظ وسائل وسلسلة دفع المستحقات
 */
export async function saveSettings() {
    const methodSelect = document.getElementById('wallet-method-select');
    const addressInput = document.getElementById('wallet-address-input');

    if (!methodSelect || !addressInput) return;

    const paymentMethod = methodSelect.value;
    const paymentAddress = addressInput.value.trim();

    if (!paymentAddress) {
        showToast('يرجى إدخال عنوان أو رقم الحساب لاستلام الأموال', 'warning');
        return;
    }

    try {
        showLoading(true);
        const response = await apiCall('/api/wallet/settings', 'POST', {
            paymentMethod,
            paymentAddress
        });

        if (response && response.success) {
            hapticFeedback('notification', 'success');
            showToast('تم حفظ بيانات الدفع بنجاح', 'success');
            if (state.user) {
                state.user.paymentMethod = paymentMethod;
                state.user.paymentAddress = paymentAddress;
            }
            toggleWalletEdit(false);
        } else {
            showAlert(response?.message || 'تعذر حفظ بيانات الدفع');
        }
    } catch (error) {
        console.error('Error saving wallet settings:', error);
        showToast('حدث خطأ أثناء الحفظ', 'error');
    } finally {
        hideLoading();
    }
}

/**
 * تقديم طلب سحب أرباح
 */
export async function requestWithdrawal() {
    const amountInput = document.getElementById('withdraw-amount-input');
    if (!amountInput) return;

    const amount = parseFloat(amountInput.value);
    const minWithdraw = state.systemSettings?.minWithdraw || 5;

    if (!amount || amount < minWithdraw) {
        showToast(`الحد الأدنى للسحب هو ${formatCurrency(minWithdraw)}`, 'warning');
        return;
    }

    if (state.user && amount > state.user.balance) {
        showToast('رصيدك الحالي غير كافٍ لإتمام السحب', 'error');
        return;
    }

    const confirmed = await showConfirm(`هل تؤكد طلب سحب مبلغ ${formatCurrency(amount)}؟`);
    if (!confirmed) return;

    try {
        showLoading(true);
        const response = await apiCall('/api/wallet/withdraw', 'POST', { amount });

        if (response && response.success) {
            hapticFeedback('notification', 'success');
            showAlert('تم تقديم طلب السحب بنجاح وسيتلقى المعالجة قريباً');
            amountInput.value = '';
            updateWithdrawCalculations();
            
            if (state.user) {
                state.user.balance -= amount;
            }
            if (response.history) {
                renderWithdrawalsHistory(response.history);
            }
        } else {
            showAlert(response?.message || 'فشل إرسال طلب السحب');
        }
    } catch (error) {
        console.error('Error requesting withdrawal:', error);
        showToast('حدث خطأ أثناء إنشاء طلب السحب', 'error');
    } finally {
        hideLoading();
    }
}

/**
 * عرض سجل السحوبات في واجهة المستخدم
 * @param {Array} history - سجل العمليات
 */
export function renderWithdrawalsHistory(history = []) {
    const container = document.getElementById('withdrawals-history-container');
    if (!container) return;

    if (!history || history.length === 0) {
        container.innerHTML = '<tr><td colspan="4" class="text-center">لا توجد عمليات سحب سابقة</td></tr>';
        return;
    }

    container.innerHTML = history.map(item => {
        let statusBadge = '<span class="badge badge-warning">قيد الانتظار</span>';
        if (item.status === 'approved' || item.status === 'completed') {
            statusBadge = '<span class="badge badge-success">مكتمل</span>';
        } else if (item.status === 'rejected') {
            statusBadge = '<span class="badge badge-danger">مرفوض</span>';
        }

        return `
            <tr>
                <td>${formatDate(item.createdAt)}</td>
                <td>${formatCurrency(item.amount)}</td>
                <td>${escapeHtml(item.method || 'تلقائي')}</td>
                <td>${statusBadge}</td>
            </tr>
        `;
    }).join('');
}

/**
 * جلب بيانات وإحصائيات الإحالة الخاصة بالمستخدم
 */
export async function fetchUserReferrals() {
    try {
        showLoading(true);
        const response = await apiCall('/api/user/referrals');
        if (response && response.success) {
            state.referralsData = response.data || {};
            renderUserReferrals(state.referralsData);
        } else {
            showToast('تعذر جلب بيانات الإحالة', 'error');
        }
    } catch (error) {
        console.error('Error fetching referrals:', error);
        showToast('حدث خطأ أثناء تحميل الإحالات', 'error');
    } finally {
        hideLoading();
    }
}

/**
 * عرض بيانات وقائمة الأحالات
 * @param {Object} data - بيانات الإحالات
 */
export function renderUserReferrals(data = {}) {
    const countEl = document.getElementById('referral-count');
    const earningsEl = document.getElementById('referral-earnings');
    const linkInput = document.getElementById('referral-link-input');
    const listContainer = document.getElementById('referrals-list-container');

    const botUsername = state.botInfo?.username || 'YourBot';
    const refLink = `https://t.me/${botUsername}?start=ref_${state.user?.telegramId || ''}`;

    if (countEl) countEl.innerText = data.totalReferrals || 0;
    if (earningsEl) earningsEl.innerText = formatCurrency(data.totalEarnings || 0);
    if (linkInput) linkInput.value = refLink;

    if (!listContainer) return;

    const list = data.referralsList || [];
    if (list.length === 0) {
        listContainer.innerHTML = '<p class="text-muted text-center">لم تقم بإحالة أي مستخدم بعد</p>';
        return;
    }

    listContainer.innerHTML = list.map(ref => `
        <div class="referral-item card-sm">
            <div class="user-info">
                <strong>${escapeHtml(ref.name || 'مستخدم')}</strong>
                <small>${formatDate(ref.joinedAt)}</small>
            </div>
            <div class="user-earnings">
                +${formatCurrency(ref.earnedForReferrer || 0)}
            </div>
        </div>
    `).join('');
}
