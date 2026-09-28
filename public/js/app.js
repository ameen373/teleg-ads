// public/js/app.js

// تهيئة تليجرام WebApp وتوسيع الشاشة عند بداية التشغيل
if (window.Telegram && window.Telegram.WebApp) {
  window.Telegram.WebApp.ready();
  window.Telegram.WebApp.expand();
}

// حفظ بيانات المستخدم الأولية في المتغير العام
window.currentUser = window.Telegram?.WebApp?.initDataUnsafe?.user || null;

async function authLogin() {
  const tgApp = window.Telegram?.WebApp;
  const startParam = tgApp?.initDataUnsafe?.start_param || null;
  const u = tgApp?.initDataUnsafe?.user || {};
  const initDataStr = tgApp?.initData || '';

  if (u && u.id) {
    window.currentUser = Object.assign({}, window.currentUser || {}, u);
    currentUserTelegramId = String(u.id);
    localStorage.setItem('telegramId', currentUserTelegramId);
  }

  try {
    const res = await safeFetch('/api/auth/login', {
      method: 'POST',
      body: { 
        userId: currentUserTelegramId,
        telegramId: currentUserTelegramId,
        referrerId: startParam,
        firstName: u.first_name || '',
        lastName: u.last_name || '',
        username: u.username || '',
        photoUrl: u.photo_url || '',
        isPremium: !!u.is_premium,
        initData: initDataStr
      }
    });
    if (!res) return false;
    const data = await res.json().catch(() => ({}));
    if (data && (data.success || data.token)) {
      if (data.token) {
        authToken = data.token;
        localStorage.setItem('authToken', authToken);
      }

      if (data.user) {
        window.currentUser = Object.assign({}, window.currentUser || {}, data.user);
        if (data.user.telegramId) {
          currentUserTelegramId = String(data.user.telegramId);
          localStorage.setItem('telegramId', currentUserTelegramId);
        }
      }

      if (data.isAdmin === true) {
        isUserAdmin = true;
        const adminBtn = document.getElementById('tab-btn-admin');
        if (adminBtn) adminBtn.style.display = 'flex';
      }

      if (data.depositWallets) {
        if (data.depositWallets.trc20) {
          const el = document.getElementById('addr-trc20');
          if (el) el.innerText = data.depositWallets.trc20;
        }
        if (data.depositWallets.bep20) {
          const el = document.getElementById('addr-bep20');
          if (el) el.innerText = data.depositWallets.bep20;
        }
      }

      if (data.botUrl) {
        const bLink = document.getElementById('official-bot-link');
        if (bLink) bLink.href = data.botUrl;
        const sBot = document.getElementById('support-bot-btn');
        if (sBot) sBot.href = data.botUrl;
      }
      if (data.officialChannelUrl) {
        const cLink = document.getElementById('official-channel-link');
        if (cLink) cLink.href = data.officialChannelUrl;
        const sChan = document.getElementById('support-channel-btn');
        if (sChan) sChan.href = data.officialChannelUrl;
      }
      if (data.supportUrl) {
        const sContact = document.getElementById('support-contact-btn');
        if (sContact) sContact.href = data.supportUrl;
      }

      return true;
    }
  } catch (e) {
    console.error("Auth error:", e);
  }
  return false;
}

async function loadUserData() {
  try {
    const res = await safeFetch('/api/user/data');
    if (res && res.ok) {
      const data = await res.json().catch(() => ({}));
      const u = data.user || {};

      if (Object.keys(u).length > 0) {
        window.currentUser = Object.assign({}, window.currentUser || {}, u);
      }

      const pendingElem = document.getElementById('pending-bal');
      const availElem = document.getElementById('avail-bal');
      const refEarnElem = document.getElementById('ref-earnings');

      if (pendingElem) pendingElem.innerText = `$${(u.pendingBalance || 0).toFixed(2)}`;
      if (availElem) availElem.innerText = `$${(u.availableBalance || 0).toFixed(2)}`;
      if (refEarnElem) refEarnElem.innerText = `$${(u.referralEarnings || 0).toFixed(2)}`;
      
      const refCountElem = document.getElementById('ref-count');
      if (refCountElem) {
        refCountElem.innerText = data.referralsCount || u.referralsCount || 0;
      }

      const refInput = document.getElementById('ref-link');
      const botUsername = (data.botUsername || 'Ads_telegabot').replace(/^@/, '');
      if (refInput) {
        refInput.value = `https://t.me/${botUsername}?start=${currentUserTelegramId || u.telegramId || ''}`;
      }

      const walletInput = document.getElementById('default-wallet');
      if (walletInput && u.defaultWallet) {
        walletInput.value = u.defaultWallet;
      }

      if (data.links && Array.isArray(data.links)) {
        rawUserLinksCache = data.links;
        if (typeof renderUserLinks === 'function') renderUserLinks(rawUserLinksCache);
      }

      if (data.withdraws && Array.isArray(data.withdraws)) {
        if (typeof renderWithdrawalsHistory === 'function') renderWithdrawalsHistory(data.withdraws);
      }

      if (data.ads && Array.isArray(data.ads)) {
        if (typeof renderUserAds === 'function') renderUserAds(data.ads);
      }

      if (data.announcements && Array.isArray(data.announcements) && data.announcements.length > 0) {
        const anc = data.announcements[0];
        const ancBox = document.getElementById('announcement-box');
        if (ancBox && anc.title) {
          const ancTitle = document.getElementById('anc-title');
          const ancContent = document.getElementById('anc-content');
          if (ancTitle) ancTitle.innerText = anc.title;
          if (ancContent) ancContent.innerText = anc.content || anc.message || '';
          ancBox.classList.remove('hidden');
        }
      }

      if (data.isAdmin === true) {
        isUserAdmin = true;
        const adminBtn = document.getElementById('tab-btn-admin');
        if (adminBtn) adminBtn.style.display = 'flex';
      }
    }
  } catch (err) {
    console.error("Error loading user data:", err);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  if (window.Telegram && window.Telegram.WebApp) {
    window.Telegram.WebApp.ready();
    window.Telegram.WebApp.expand();
  }

  if (typeof renderTelegramUser === 'function') {
    renderTelegramUser();
  }

  await authLogin();
  
  if (typeof renderTelegramUser === 'function') {
    renderTelegramUser();
  }

  const pathParts = window.location.pathname.split('/');
  if (pathParts.length >= 3 && pathParts[1] === 'r') {
    const code = pathParts[2];
    if (code) {
      if (typeof initBridgeView === 'function') initBridgeView(code);
      return;
    }
  }

  await loadUserData();
  if (typeof fetchUserLinks === 'function') await fetchUserLinks();
});
