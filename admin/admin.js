const tg = window.Telegram?.WebApp || {};
if (tg.ready) tg.ready();

async function fetchAdminApi(endpoint, options = {}) {
    const initData = tg.initData || '';
    const headers = {
        'Content-Type': 'application/json',
        'x-telegram-init-data': initData,
        ...(options.headers || {})
    };

    try {
        const res = await fetch(endpoint, { ...options, headers });
        if (res.status === 403 || res.status === 401) {
            document.body.innerHTML = '<h1 style="color:#ef4444;text-align:center;margin-top:50px;font-family:sans-serif;">403 Forbidden: Access Denied!</h1>';
            return null;
        }
        return await res.json();
    } catch (e) {
        console.error('API Error:', e);
        return null;
    }
}

async function fetchAdminStats() {
    const data = await fetchAdminApi('/api/admin/stats');
    if (!data) return;

    document.getElementById('totalUsers').textContent = data.totalUsers || 0;
    document.getElementById('totalPending').textContent = `$${(data.totalPendingBalance || 0).toFixed(2)}`;
    document.getElementById('pendingDeposits').textContent = data.pendingDeposits || 0;
    document.getElementById('pendingWithdraws').textContent = data.pendingWithdraws || 0;

    loadDeposits();
    loadWithdraws();
    loadUsers();
}

document.getElementById('distributeBtn').onclick = async () => {
    const input = document.getElementById('totalRevInput');
    const totalRevenue = parseFloat(input.value);
    if (!totalRevenue || totalRevenue <= 0) return alert('يرجى إدخال مبلغ إيرادات صحيح');

    const data = await fetchAdminApi('/api/admin/distribute-revenue', {
        method: 'POST',
        body: JSON.stringify({ totalRevenue })
    });
    
    if (data && data.success) {
        alert('تم توزيع الأرباح بنجاح!');
        input.value = '';
        fetchAdminStats();
    } else if (data && data.error) {
        alert(data.error);
    }
};

async function loadDeposits() {
    const deposits = await fetchAdminApi('/api/admin/deposits');
    const container = document.getElementById('depositsList');
    if (!deposits || !Array.isArray(deposits) || deposits.length === 0) {
        container.innerHTML = '<p style="color:#94a3b8;">لا توجد طلبات إيداع معلقة</p>';
        return;
    }
    container.innerHTML = deposits.map(d => `
        <div style="border-bottom: 1px solid #334155; padding: 10px 0;">
            <p><strong>المستخدم:</strong> ${d.userId} | <strong>المبلغ:</strong> $${d.amount} | <strong>الشبكة:</strong> ${d.network}</p>
            <p><strong>TxID:</strong> <code style="background:#0f172a;padding:2px 6px;border-radius:4px;">${d.txId}</code></p>
            <button class="btn" onclick="handleDeposit('${d._id}', 'approve')">تأكيد الإيداع</button>
            <button class="btn" style="background:#ef4444;" onclick="handleDeposit('${d._id}', 'reject')">رفض</button>
        </div>
    `).join('');
}

window.handleDeposit = async function(depositId, action) {
    const data = await fetchAdminApi('/api/admin/deposits/action', {
        method: 'POST',
        body: JSON.stringify({ depositId, action })
    });
    if (data && data.success) fetchAdminStats();
};

async function loadWithdraws() {
    const withdraws = await fetchAdminApi('/api/admin/withdraws');
    const container = document.getElementById('withdrawsList');
    if (!withdraws || !Array.isArray(withdraws) || withdraws.length === 0) {
        container.innerHTML = '<p style="color:#94a3b8;">لا توجد طلبات سحب معلقة</p>';
        return;
    }
    container.innerHTML = withdraws.map(w => `
        <div style="border-bottom: 1px solid #334155; padding: 10px 0;">
            <p><strong>المستخدم:</strong> ${w.userId} | <strong>المبلغ:</strong> $${w.amount} | <strong>الصافي:</strong> $${w.netAmount}</p>
            <p><strong>المحفظة:</strong> <code style="background:#0f172a;padding:2px 6px;border-radius:4px;">${w.walletAddress}</code></p>
            <button class="btn" onclick="handleWithdraw('${w._id}', 'approve')">تأكيد السحب</button>
            <button class="btn" style="background:#ef4444;" onclick="handleWithdraw('${w._id}', 'reject')">رفض</button>
        </div>
    `).join('');
};

window.handleWithdraw = async function(withdrawId, action) {
    let rejectionReason = '';
    if (action === 'reject') {
        rejectionReason = prompt('سبب الرفض:');
        if (rejectionReason === null) return;
    }
    const data = await fetchAdminApi('/api/admin/withdraws/action', {
        method: 'POST',
        body: JSON.stringify({ withdrawId, action, rejectionReason })
    });
    if (data && data.success) fetchAdminStats();
};

let searchTimeout;
function searchUsers() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        const query = document.getElementById('userSearchInput').value.trim();
        loadUsers(query);
    }, 300);
}

async function loadUsers(query = '') {
    const users = await fetchAdminApi(`/api/admin/users?query=${encodeURIComponent(query)}`);
    const container = document.getElementById('usersList');
    if (!container) return;
    if (!users || !Array.isArray(users) || users.length === 0) {
        container.innerHTML = '<p style="color:#94a3b8;">لا يوجد مستخدمون لعرضهم</p>';
        return;
    }
    container.innerHTML = users.map(u => `
        <div style="border-bottom: 1px solid #334155; padding: 10px 0; display:flex; justify-content:space-between; align-items:center;">
            <div>
                <span><strong>ID:</strong> ${u.telegramId} | ${u.firstName} (${u.username ? '@' + u.username : 'بلا معرف'})</span>
                ${u.isBanned ? '<span style="color:#ef4444;margin-right:8px;">[محظور]</span>' : ''}
            </div>
            <div>
                <button class="btn" style="background:#38bdf8; margin-left:5px;" onclick="viewFullUser(${u.telegramId})">عرض الملف الكامل 🔍</button>
                <button class="btn" style="background: ${u.isBanned ? '#22c55e' : '#ef4444'}; margin-top:0;" onclick="handleBan(${u.telegramId}, ${!u.isBanned})">
                    ${u.isBanned ? 'إلغاء الحظر' : 'حظر'}
                </button>
            </div>
        </div>
    `).join('');
}

window.handleBan = async function(telegramId, ban) {
    const data = await fetchAdminApi('/api/admin/users/ban', {
        method: 'POST',
        body: JSON.stringify({ telegramId, ban })
    });
    if (data && data.success) loadUsers();
};

// 🔥 دالة فتح النافذة وعرض البيانات التفصيلية للمستخدم 🔥
window.viewFullUser = async function(telegramId) {
    const modal = document.getElementById('userModal');
    const modalBody = document.getElementById('modalBody');
    modal.style.display = 'block';
    modalBody.innerHTML = '<p style="text-align:center; color:#38bdf8;">جاري جلب وتحليل سجل الحساب بالكامل...</p>';

    const data = await fetchAdminApi(`/api/admin/users/full-profile/${telegramId}`);
    if (!data) {
        modalBody.innerHTML = '<p style="color:#ef4444;text-align:center;">تعذر جلب تفاصيل المستخدم.</p>';
        return;
    }

    const { profile, financials, publisherStats, advertiserStats, referralStats, details } = data;

    modalBody.innerHTML = `
        <h2 style="color:#38bdf8;border-bottom:1px solid #334155;padding-bottom:10px;">
            👤 الملف الشامل: ${profile.firstName} ${profile.lastName} (${profile.username ? '@' + profile.username : 'بلا يوزر'})
        </h2>
        
        <div class="stats-grid" style="margin: 15px 0;">
            <div class="card"><h4>ID التليجرام</h4><p>${profile.telegramId}</p></div>
            <div class="card"><h4>تاريخ التسجيل</h4><p>${new Date(profile.createdAt).toLocaleDateString('ar-EG')}</p></div>
            <div class="card"><h4>آخر حضور</h4><p>${new Date(profile.lastActive).toLocaleString('ar-EG')}</p></div>
            <div class="card"><h4>المحفظة الافتراضية</h4><p><code style="font-size:11px;">${profile.defaultWallet || 'غير مسجلة'}</code></p></div>
        </div>

        <h3 style="color:#22c55e;">💰 الموقف المالي والمحافظ</h3>
        <div class="stats-grid">
            <div class="card"><h4>المتاح للسحب</h4><h3 style="color:#22c55e;">$${financials.availableBalance.toFixed(2)}</h3></div>
            <div class="card"><h4>الرصيد المعلق</h4><h3 style="color:#eab308;">$${financials.pendingBalance.toFixed(2)}</h3></div>
            <div class="card"><h4>رصيد الإعلانات</h4><h3 style="color:#38bdf8;">$${financials.adBalance.toFixed(2)}</h3></div>
            <div class="card"><h4>إجمالي الإيداعات</h4><h3>$${financials.totalDeposited.toFixed(2)}</h3></div>
            <div class="card"><h4>إجمالي المسحوبات</h4><h3>$${financials.totalWithdrawn.toFixed(2)}</h3></div>
        </div>

        <h3 style="color:#38bdf8;">📊 إحصائيات الناشر (الروابط والقنوات)</h3>
        <p><strong>القنوات المسجلة:</strong> ${publisherStats.channelsCount} | <strong>الروابط النشطة:</strong> ${publisherStats.activeLinksCount} / ${publisherStats.linksCount}</p>
        <p><strong>إجمالي المشاهدات المحققة:</strong> ${publisherStats.totalViews} | <strong>إجمالي أرباح الروابط:</strong> $${publisherStats.totalEarnings.toFixed(2)}</p>

        <h3 style="color:#a855f7;">📢 إحصائيات المعلن (الحملات)</h3>
        <p><strong>عدد الحملات:</strong> ${advertiserStats.campaignsCount} | <strong>إجمالي الميزانية المستثمرة:</strong> $${advertiserStats.totalSpent.toFixed(2)} | <strong>المشاهدات المستلمة:</strong> ${advertiserStats.totalViewsDelivered}</p>

        <h3 style="color:#f97316;">🔗 شبكة الإحالات</h3>
        <p><strong>تمت دعوته بواسطة:</strong> ${referralStats.invitedBy ? `${referralStats.invitedBy.firstName} (${referralStats.invitedBy.telegramId})` : 'تسجيل مباشر (بدون إحالة)'}</p>
        <p><strong>عدد الأشخاص الذين دعاهم:</strong> ${referralStats.totalReferred} مستخدم</p>
    `;
};

window.closeUserModal = function() {
    document.getElementById('userModal').style.display = 'none';
};

window.onclick = function(event) {
    const modal = document.getElementById('userModal');
    if (event.target === modal) modal.style.display = 'none';
};

document.addEventListener('DOMContentLoaded', fetchAdminStats);
