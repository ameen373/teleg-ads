import { state } from '../state.js';
import { apiCall } from '../api.js';
import { tg, showAlert, showConfirm, hapticFeedback } from '../telegram.js';
import { showToast, showLoading, hideLoading, formatCurrency, formatDate, escapeHtml } from '../ui.js';

/**
 * تحميل كافة بيانات لوحة التحكم الخاصة بالمسؤول
 */
export async function loadAdminData() {
    try {
        showLoading(true);
        const response = await apiCall('/api/admin/dashboard');
        
        if (response && response.success) {
            state.adminData = response.data || {};
            
            renderAdminDeposits(state.adminData.deposits || []);
            renderAdminWithdraws(state.adminData.withdrawals || []);
            renderAdminUsers(state.adminData.users || []);
            renderAdminLinks(state.adminData.links || []);
            renderAdminAds(state.adminData.ads || []);
        } else {
            showToast(response?.message || 'فشل تحميل بيانات لوحة التحكم', 'error');
        }
    } catch (error) {
        console.error('Error loading admin data:', error);
        showToast('حدث خطأ أثناء تحميل لوحة أدمن', 'error');
    } finally {
        hideLoading();
    }
}

/**
 * عرض عمليات الإيداع في لوحة الإدارة
 * @param {Array} deposits - قائمة الإيداعات
 */
export function renderAdminDeposits(deposits = []) {
    const container = document.getElementById('admin-deposits-container');
    if (!container) return;

    if (!deposits || deposits.length === 0) {
        container.innerHTML = '<tr><td colspan="5" class="text-center">لا توجد طلبات إيداع</td></tr>';
        return;
    }

    container.innerHTML = deposits.map(dep => `
        <tr>
            <td>${escapeHtml(dep.userName || dep.userId)}</td>
            <td>${formatCurrency(dep.amount)}</td>
            <td>${escapeHtml(dep.method || 'يدوي')}</td>
            <td>${formatDate(dep.createdAt)}</td>
            <td>
                ${dep.status === 'pending' ? `
                    <button class="btn btn-xs btn-success" onclick="window.processAdminAction('deposit', '${dep._id}', 'approve')">قبول</button>
                    <button class="btn btn-xs btn-danger" onclick="window.processAdminAction('deposit', '${dep._id}', 'reject')">رفض</button>
                ` : `<span class="badge ${dep.status === 'approved' ? 'badge-success' : 'badge-danger'}">${dep.status}</span>`}
            </td>
        </tr>
    `).join('');
}

/**
 * عرض عمليات السحب في لوحة الإدارة
 * @param {Array} withdraws - قائمة السحوبات
 */
export function renderAdminWithdraws(withdraws = []) {
    const container = document.getElementById('admin-withdraws-container');
    if (!container) return;

    if (!withdraws || withdraws.length === 0) {
        container.innerHTML = '<tr><td colspan="5" class="text-center">لا توجد طلبات سحب قيد الانتظار</td></tr>';
        return;
    }

    container.innerHTML = withdraws.map(w => `
        <tr>
            <td>${escapeHtml(w.userName || w.userId)}</td>
            <td>${formatCurrency(w.amount)}</td>
            <td>${escapeHtml(w.paymentAddress || 'غير محدد')}</td>
            <td>${formatDate(w.createdAt)}</td>
            <td>
                ${w.status === 'pending' ? `
                    <button class="btn btn-xs btn-success" onclick="window.processAdminAction('withdraw', '${w._id}', 'approve')">موافقة</button>
                    <button class="btn btn-xs btn-danger" onclick="window.processAdminAction('withdraw', '${w._id}', 'reject')">رفض</button>
                ` : `<span class="badge ${w.status === 'approved' ? 'badge-success' : 'badge-danger'}">${w.status}</span>`}
            </td>
        </tr>
    `).join('');
}

/**
 * عرض قائمة المستخدمين للآدمن
 * @param {Array} users - قائمة المستخدمين
 */
export function renderAdminUsers(users = []) {
    const container = document.getElementById('admin-users-container');
    if (!container) return;

    if (!users || users.length === 0) {
        container.innerHTML = '<tr><td colspan="5" class="text-center">لا يوجد مستخدمين</td></tr>';
        return;
    }

    container.innerHTML = users.map(u => `
        <tr>
            <td>${escapeHtml(u.name || 'مستخدم')}</td>
            <td>${u.telegramId}</td>
            <td>${formatCurrency(u.balance || 0)}</td>
            <td>${u.isBanned ? '<span class="badge badge-danger">محظور</span>' : '<span class="badge badge-success">نشط</span>'}</td>
            <td>
                <button class="btn btn-xs ${u.isBanned ? 'btn-success' : 'btn-warning'}" onclick="window.processAdminAction('user', '${u._id}', '${u.isBanned ? 'unban' : 'ban'}')">
                    ${u.isBanned ? 'إلغاء الحظر' : 'حظر'}
                </button>
            </td>
        </tr>
    `).join('');
}

/**
 * عرض جميع الروابط للآدمن
 * @param {Array} links - قائمة الروابط
 */
export function renderAdminLinks(links = []) {
    const container = document.getElementById('admin-links-container');
    if (!container) return;

    if (!links || links.length === 0) {
        container.innerHTML = '<tr><td colspan="4" class="text-center">لا توجد روابط</td></tr>';
        return;
    }

    container.innerHTML = links.map(l => `
        <tr>
            <td>${escapeHtml(l.title || l.code)}</td>
            <td>${l.views || 0}</td>
            <td>${formatDate(l.createdAt)}</td>
            <td>
                <button class="btn btn-xs btn-danger" onclick="window.processAdminAction('link', '${l._id}', 'delete')">حذف</button>
            </td>
        </tr>
    `).join('');
}

/**
 * عرض جميع الإعلانات للآدمن
 * @param {Array} ads - قائمة الحملات
 */
export function renderAdminAds(ads = []) {
    const container = document.getElementById('admin-ads-container');
    if (!container) return;

    if (!ads || ads.length === 0) {
        container.innerHTML = '<tr><td colspan="5" class="text-center">لا توجد حملات إعلانية</td></tr>';
        return;
    }

    container.innerHTML = ads.map(a => `
        <tr>
            <td>${escapeHtml(a.title)}</td>
            <td>${formatCurrency(a.budget)}</td>
            <td><span class="badge badge-info">${a.status}</span></td>
            <td>${formatDate(a.createdAt)}</td>
            <td>
                ${a.status === 'pending' ? `
                    <button class="btn btn-xs btn-success" onclick="window.processAdminAction('ad', '${a._id}', 'approve')">موافقة</button>
                    <button class="btn btn-xs btn-danger" onclick="window.processAdminAction('ad', '${a._id}', 'reject')">رفض</button>
                ` : `
                    <button class="btn btn-xs btn-warning" onclick="window.processAdminAction('ad', '${a._id}', 'toggle')">تغيير الحالة</button>
                `}
            </td>
        </tr>
    `).join('');
}

/**
 * تنفيذ إجراءات التحكم والإدارة الكلية
 * @param {string} type - نوع الإجراء (deposit, withdraw, user, link, ad)
 * @param {string} id - المعرف الخاص بالعنصر
 * @param {string} action - نوع العمل (approve, reject, ban, unban, delete)
 * @param {Object} extraData - بيانات إضافية
 */
export async function processAdminAction(type, id, action, extraData = {}) {
    const confirmMessage = `هل أنت أكتأكد من تنفيذ الإجراء (${action}) على هذا العنصر؟`;
    const confirmed = await showConfirm(confirmMessage);
    if (!confirmed) return;

    try {
        showLoading(true);
        const response = await apiCall('/api/admin/action', 'POST', {
            type,
            id,
            action,
            ...extraData
        });

        if (response && response.success) {
            hapticFeedback('notification', 'success');
            showToast('تم تنفيذ الإجراء بنجاح', 'success');
            await loadAdminData();
        } else {
            showAlert(response?.message || 'تعذر تنفيذ الإجراء');
        }
    } catch (error) {
        console.error('Error executing admin action:', error);
        showToast('حدث خطأ أثناء معالجة الأمر', 'error');
    } finally {
        hideLoading();
    }
}

// تصدير وتأكيد إسناد دالة processAdminAction إلى النافذة العامة window
window.processAdminAction = processAdminAction;
