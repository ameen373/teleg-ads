const tg = window.Telegram.WebApp;

async function fetchAdminStats() {
    const res = await fetch('/api/admin/stats', { headers: { 'x-telegram-init-data': tg.initData } });
    if(res.status === 403) {
        document.body.innerHTML = '<h1 style="color:red;text-align:center;margin-top:50px;">403 Forbidden: Access Denied!</h1>';
        return;
    }
    const data = await res.json();
    document.getElementById('totalUsers').textContent = data.totalUsers;
    document.getElementById('totalPending').textContent = `$${data.totalPendingBalance.toFixed(2)}`;
    document.getElementById('pendingDeposits').textContent = data.pendingDeposits;
    document.getElementById('pendingWithdraws').textContent = data.pendingWithdraws;

    loadDeposits();
    loadWithdraws();
}

document.getElementById('distributeBtn').onclick = async () => {
    const totalRevenue = parseFloat(document.getElementById('totalRevInput').value);
    if (!totalRevenue) return alert('Enter valid total revenue');

    const res = await fetch('/api/admin/distribute-revenue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-telegram-init-data': tg.initData },
        body: JSON.stringify({ totalRevenue })
    });
    const data = await res.json();
    if(data.success) alert('Revenue distributed successfully!');
};

async function loadDeposits() {
    const res = await fetch('/api/admin/deposits', { headers: { 'x-telegram-init-data': tg.initData } });
    const deposits = await res.json();
    document.getElementById('depositsList').innerHTML = deposits.map(d => `
        <div style="border-bottom: 1px solid #334155; padding: 10px 0;">
            <p>User ID: ${d.userId} | Amount: $${d.amount} | Net: ${d.network}</p>
            <p>TxID: <code>${d.txId}</code></p>
            <button onclick="handleDeposit('${d._id}', 'approve')">تأكيد الإيداع</button>
            <button onclick="handleDeposit('${d._id}', 'reject')">رفض</button>
        </div>
    `).join('');
}

async function handleDeposit(depositId, action) {
    await fetch('/api/admin/deposits/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-telegram-init-data': tg.initData },
        body: JSON.stringify({ depositId, action })
    });
    fetchAdminStats();
}

async function loadWithdraws() {
    const res = await fetch('/api/admin/withdraws', { headers: { 'x-telegram-init-data': tg.initData } });
    const withdraws = await res.json();
    document.getElementById('withdrawsList').innerHTML = withdraws.map(w => `
        <div style="border-bottom: 1px solid #334155; padding: 10px 0;">
            <p>User ID: ${w.userId} | Amount: $${w.amount} | Net: $${w.netAmount}</p>
            <p>Wallet: <code>${w.walletAddress}</code></p>
            <button onclick="handleWithdraw('${w._id}', 'approve')">تأكيد السحب</button>
            <button onclick="handleWithdraw('${w._id}', 'reject')">رفض</button>
        </div>
    `).join('');
}

async function handleWithdraw(withdrawId, action) {
    let rejectionReason = '';
    if (action === 'reject') rejectionReason = prompt('سبب الرفض:');
    await fetch('/api/admin/withdraws/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-telegram-init-data': tg.initData },
        body: JSON.stringify({ withdrawId, action, rejectionReason })
    });
    fetchAdminStats();
}

fetchAdminStats();
