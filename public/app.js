const tg = window.Telegram?.WebApp || {};
if (tg.expand) tg.expand();

let currentUser = null;
let appConfig = {};

// Haptic Feedback
function triggerHaptic() {
    if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');
}

function showToast(msg) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3000);
}

// Navigation Handler
document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        triggerHaptic();
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.view-section').forEach(s => s.classList.remove('active'));
        
        btn.classList.add('active');
        const target = btn.getAttribute('data-target');
        if (target && document.getElementById(target)) {
            document.getElementById(target).classList.add('active');
        }
    });
});

// App Initialization
async function initApp() {
    const initData = tg.initData || '';
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
        const nameEl = document.getElementById('userName');
        if (nameEl) nameEl.textContent = `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim();
        
        const handleEl = document.getElementById('userHandle');
        if (handleEl) handleEl.textContent = currentUser.username ? `@${currentUser.username}` : 'N/A';
        
        const avatarEl = document.getElementById('userAvatar');
        if (avatarEl && currentUser.photoUrl) avatarEl.src = currentUser.photoUrl;

        const premiumEl = document.getElementById('premiumBadge');
        if (premiumEl && currentUser.isPremium) premiumEl.classList.remove('hidden');

        // Unhide Admin Button if authorized
        if (data.isAdmin) {
            const adminBtn = document.getElementById('adminDockBtn');
            if (adminBtn) {
                adminBtn.classList.remove('hidden-admin');
                adminBtn.style.display = 'block';
                adminBtn.onclick = () => {
                    window.location.href = '/admin';
                };
            }
        }

        // Setup Balances
        if (document.getElementById('availBal')) document.getElementById('availBal').textContent = `$${(currentUser.availableBalance || 0).toFixed(2)}`;
        if (document.getElementById('pendBal')) document.getElementById('pendBal').textContent = `$${(currentUser.pendingBalance || 0).toFixed(2)}`;
        if (document.getElementById('adBal')) document.getElementById('adBal').textContent = `$${(currentUser.adBalance || 0).toFixed(2)}`;

        // Referral Link
        const refEl = document.getElementById('refLinkInput');
        if (refEl) refEl.value = `https://t.me/your_bot?start=${currentUser.telegramId}`;

        loadMyLinks();
        loadMyCampaigns();

    } catch (e) {
        showToast('خطأ في تحميل بيانات التطبيق');
    }
}

// Shorten Action
const shortenBtn = document.getElementById('shortenBtn');
if (shortenBtn) {
    shortenBtn.addEventListener('click', async () => {
        triggerHaptic();
        const originalUrlInput = document.getElementById('originalUrlInput');
        const titleInput = document.getElementById('titleInput');

        const originalUrl = originalUrlInput ? originalUrlInput.value : '';
        const title = titleInput ? titleInput.value : '';

        if (!originalUrl) return showToast('يرجى إدخال الرابط الأصلي');

        try {
            const res = await fetch('/api/links/shorten', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json', 
                    'x-telegram-init-data': tg.initData || '' 
                },
                body: JSON.stringify({ originalUrl, title })
            });
            const data = await res.json();
            if (data.success) {
                showToast('تم اختصار الرابط بنجاح!');
                if (originalUrlInput) originalUrlInput.value = '';
                if (titleInput) titleInput.value = '';
                loadMyLinks();
            } else {
                showToast(data.error || 'فشل اختصار الرابط');
            }
        } catch (e) {
            showToast('خطأ بالخادم أثناء الاختصار');
        }
    });
}

async function loadMyLinks() {
    try {
        const res = await fetch('/api/links/my', { 
            headers: { 'x-telegram-init-data': tg.initData || '' } 
        });
        const links = await res.json();
        const list = document.getElementById('linksList');
        if (!list) return;

        if (!Array.isArray(links) || links.length === 0) {
            list.innerHTML = '<p class="text-gray">لا توجد روابط اختصرتها بعد</p>';
            return;
        }

        list.innerHTML = links.map(l => `
            <div class="card">
                <h4>${l.title || 'بدون عنوان'}</h4>
                <p style="word-break: break-all;">${l.shortUrl}</p>
                <small>المشاهدات: ${l.views} | الأرباح: $${(l.earnings || 0).toFixed(2)}</small><br>
                <button class="btn" style="margin-top: 8px;" onclick="copyToClipboard('${l.shortUrl}')">نسخ</button>
            </div>
        `).join('');
    } catch (e) {
        console.error('Error loading links', e);
    }
}

async function loadMyCampaigns() {
    try {
        const res = await fetch('/api/campaigns/my', { 
            headers: { 'x-telegram-init-data': tg.initData || '' } 
        });
        const campaigns = await res.json();
        const list = document.getElementById('campaignsList');
        if (!list) return;

        if (!Array.isArray(campaigns) || campaigns.length === 0) {
            list.innerHTML = '<p class="text-gray">لا توجد حملات إعلانية</p>';
            return;
        }

        list.innerHTML = campaigns.map(c => `
            <div class="card">
                <h4>${c.title}</h4>
                <p>المشاهدات المستلمة: ${c.viewsDelivered} / ${c.totalViewsNeeded}</p>
                <p>الحالة: ${c.status}</p>
            </div>
        `).join('');
    } catch (e) {
        console.error('Error loading campaigns', e);
    }
}

window.copyToClipboard = function(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => showToast('تم النسخ!'));
    } else {
        const input = document.createElement('input');
        input.value = text;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
        showToast('تم النسخ!');
    }
};

// Modal & Wallet logic
const depositNetEl = document.getElementById('depositNetwork');
if (depositNetEl) {
    depositNetEl.addEventListener('change', (e) => {
        const net = e.target.value;
        const addrEl = document.getElementById('depositWalletAddr');
        if (addrEl) addrEl.textContent = net === 'TRC20' ? appConfig.trc20Wallet : appConfig.bep20Wallet;
    });
}

const openGuide = document.getElementById('openGuideBtn');
if (openGuide) openGuide.onclick = () => document.getElementById('guideModal')?.classList.remove('hidden');

const closeGuide = document.getElementById('closeGuideBtn');
if (closeGuide) closeGuide.onclick = () => document.getElementById('guideModal')?.classList.add('hidden');

document.addEventListener('DOMContentLoaded', initApp);
