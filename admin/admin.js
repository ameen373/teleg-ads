const tg = window.Telegram?.WebApp || {};
if (tg.ready) tg.ready();

// دالة عامة لإرسال الطلبات الموثقة
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

async function loadUsers() {
    const users = await fetchAdminApi('/api/admin/users');
    const container = document.getElementById('usersList');
    if (!container) return;
    if (!users || !Array.isArray(users) || users.length === 0) {
        container.innerHTML = '<p style="color:#94a3b8;">لا يوجد مستخدمون لعرضهم</p>';
        return;
    }
    container.innerHTML = users.map(u => `
        <div style="border-bottom: 1px solid #334155; padding: 8px 0; display:flex; justify-between; align-items:center;">
            <div>
                <span><strong>ID:</strong> ${u.telegramId} | ${u.firstName} (${u.username ? '@' + u.username : 'بلا معرف'})</span>
                ${u.isBanned ? '<span style="color:#ef4444;margin-right:8px;">[محظور]</span>' : ''}
            </div>
            <button class="btn" style="background: ${u.isBanned ? '#22c55e' : '#ef4444'}; margin-top:0;" onclick="handleBan(${u.telegramId}, ${!u.isBanned})">
                ${u.isBanned ? 'إلغاء الحظر' : 'حظر'}
            </button>
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

document.addEventListener('DOMContentLoaded', fetchAdminStats);
