const tg = window.Telegram.WebApp;
tg.expand();

let currentUser = null;
let appConfig = {};

// Haptic Feedback
function triggerHaptic() {
    if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');
}

function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3000);
}

// Navigation Handler
document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        triggerHaptic();
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.view-section').forEach(s => s.classList.remove('active'));
        
        btn.classList.add('active');
        const target = btn.getAttribute('data-target');
        if(target) document.getElementById(target).classList.add('active');
    });
});

// App Initialization
async function initApp() {
    const initData = tg.initData;
    const startParam = tg.initDataUnsafe?.start_param || '';

    try {
        const res = await fetch('/api/user/me', {
            headers: { 
                'x-telegram-init-data': initData,
                'x-start-param': startParam 
            }
        });
        const data = await res.json();
        if (data.error) return showToast(data.error);

        currentUser = data.user;
        appConfig = data;

        // Render User Profile
        document.getElementById('userName').childNodes[0].nodeValue = `${currentUser.firstName} ${currentUser.lastName} `;
        document.getElementById('userHandle').textContent = `@${currentUser.username || 'N/A'}`;
        if (currentUser.photoUrl) document.getElementById('userAvatar').src = currentUser.photoUrl;
        if (currentUser.isPremium) document.getElementById('premiumBadge').classList.remove('hidden');

        // Unhide Admin Button if authorized
        if (data.isAdmin) {
            document.getElementById('adminDockBtn').classList.remove('hidden-admin');
        }

        // Setup Balances
        document.getElementById('availBal').textContent = `$${currentUser.availableBalance.toFixed(2)}`;
        document.getElementById('pendBal').textContent = `$${currentUser.pendingBalance.toFixed(2)}`;
        document.getElementById('adBal').textContent = `$${currentUser.adBalance.toFixed(2)}`;

        // Referral Link
        document.getElementById('refLinkInput').value = `https://t.me/your_bot?start=${currentUser.telegramId}`;

        loadMyLinks();
        loadMyCampaigns();

    } catch (e) {
        showToast('Error loading application data.');
    }
}

// Shorten Action
document.getElementById('shortenBtn').addEventListener('click', async () => {
    triggerHaptic();
    const originalUrl = document.getElementById('originalUrlInput').value;
    const title = document.getElementById('titleInput').value;

    const res = await fetch('/api/links/shorten', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-telegram-init-data': tg.initData },
        body: JSON.stringify({ originalUrl, title })
    });
    const data = await res.json();
    if(data.success) {
        showToast('تم اختصار الرابط بنجاح!');
        loadMyLinks();
    }
});

async function loadMyLinks() {
    const res = await fetch('/api/links/my', { headers: { 'x-telegram-init-data': tg.initData } });
    const links = await res.json();
    const list = document.getElementById('linksList');
    list.innerHTML = links.map(l => `
        <div class="card">
            <h4>${l.title || 'بدون عنوان'}</h4>
            <p>${l.shortUrl}</p>
            <small>المشاهدات: ${l.views} | الأرباح: $${l.earnings.toFixed(2)}</small><br>
            <button onclick="navigator.clipboard.writeText('${l.shortUrl}'); showToast('تم النسخ!');">نسخ</button>
        </div>
    `).join('');
}

async function loadMyCampaigns() {
    const res = await fetch('/api/campaigns/my', { headers: { 'x-telegram-init-data': tg.initData } });
    const campaigns = await res.json();
    const list = document.getElementById('campaignsList');
    list.innerHTML = campaigns.map(c => `
        <div class="card">
            <h4>${c.title}</h4>
            <p>المشاهدات المستلمة: ${c.viewsDelivered} / ${c.totalViewsNeeded}</p>
            <p>الحالة: ${c.status}</p>
        </div>
    `).join('');
}

// Modal & Wallet logic
document.getElementById('depositNetwork').addEventListener('change', (e) => {
    const net = e.target.value;
    document.getElementById('depositWalletAddr').textContent = net === 'TRC20' ? appConfig.trc20Wallet : appConfig.bep20Wallet;
});

document.getElementById('openGuideBtn').onclick = () => document.getElementById('guideModal').classList.remove('hidden');
document.getElementById('closeGuideBtn').onclick = () => document.getElementById('guideModal').classList.add('hidden');

initApp();
