import { state, i18n } from '../state.js';
import { safeFetch } from './api.js';
import { triggerHaptic, escapeHTML, showToast } from './ui.js';
import { fetchWithdrawalsHistory } from './wallet.js';

export function renderTelegramUser() {
  const tg = state.tg || window.Telegram?.WebApp;
  const u = tg?.initDataUnsafe?.user;
  const avatarContainer = document.getElementById('user-avatar-container');
  const nameElem = document.getElementById('user-display-name');
  const handleElem = document.getElementById('user-display-handle');
  const idElem = document.getElementById('user-tg-id');
  const premiumBadge = document.getElementById('user-premium-badge');

  if (u && u.id) {
    state.currentUserTelegramId = String(u.id);
    localStorage.setItem('telegramId', state.currentUserTelegramId);
    const fullName = `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username || 'Telegram User';
    if (nameElem) nameElem.innerText = fullName;
    if (handleElem) handleElem.innerText = u.username ? `@${u.username}` : '@no_username';
    if (idElem) idElem.innerText = `ID: ${u.id}`;

    if (premiumBadge && u.is_premium) {
      premiumBadge.classList.remove('hidden');
    }

    if (avatarContainer) {
      if (u.photo_url) {
        avatarContainer.innerHTML = `<img src="${escapeHTML(u.photo_url)}" class="user-avatar-img" alt="Avatar">`;
      } else {
        const letter = (u.first_name || 'U').charAt(0).toUpperCase();
        avatarContainer.innerHTML = `<div class="user-avatar-placeholder">${escapeHTML(letter)}</div>`;
      }
    }

    const savedLang = localStorage.getItem('appLang');
    if (savedLang && i18n[savedLang]) {
      state.currentLang = savedLang;
    } else if (u.language_code && i18n[u.language_code]) {
      state.currentLang = u.language_code === 'ar' ? 'ar' : 'en';
    } else {
      state.currentLang = 'ar';
    }
  } else {
    if (!state.currentUserTelegramId) {
      state.currentUserTelegramId = localStorage.getItem('telegramId') || '123456789';
    }
    if (nameElem) nameElem.innerText = 'Telegram User';
    if (handleElem) handleElem.innerText = '@user';
    if (idElem) idElem.innerText = `ID: ${state.currentUserTelegramId}`;
    if (avatarContainer) avatarContainer.innerHTML = `<div class="user-avatar-placeholder">U</div>`;
    if (!localStorage.getItem('appLang')) {
      state.currentLang = 'ar';
    }
  }

  applyLanguage(state.currentLang);
}

export function applyLanguage(lang) {
  state.currentLang = lang || 'ar';
  localStorage.setItem('appLang', state.currentLang);
  document.documentElement.lang = state.currentLang;
  document.documentElement.dir = state.currentLang === 'ar' ? 'rtl' : 'ltr';

  const select = document.getElementById('language-select');
  if (select) select.value = state.currentLang;

  const dict = i18n[state.currentLang] || i18n['ar'] || {};

  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (dict[key]) {
      el.innerText = dict[key];
    }
  });

  document.querySelectorAll('[data-i18n-ph]').forEach(el => {
    const key = el.getAttribute('data-i18n-ph');
    if (dict[key]) {
      el.placeholder = dict[key];
    }
  });
}

export function changeAppLanguage(lang) {
  applyLanguage(lang);
}

export async function loadUserData() {
  try {
    const res = await safeFetch('/api/user/data');
    if (res && res.ok) {
      const data = await res.json().catch(() => ({}));
      const u = data.user || data.data || {};
      state.user = u;

      const pendingElem = document.getElementById('pending-bal');
      const availElem = document.getElementById('avail-bal');
      const dashTotalLinks = document.getElementById('dash-total-links');
      const dashTotalClicks = document.getElementById('dash-total-clicks');
      const dashTotalEarnings = document.getElementById('dash-total-earnings');
      const refLinkInput = document.getElementById('ref-link');
      const refCountElem = document.getElementById('ref-count');
      const refEarningsElem = document.getElementById('ref-earnings');
      const walletInput = document.getElementById('default-wallet');

      const pendingBal = u.pendingBalance !== undefined ? u.pendingBalance : (u.pendingEarnings || 0);
      const availBal = u.availableBalance !== undefined ? u.availableBalance : (u.balance || 0);
      const totalEarnings = u.totalEarnings !== undefined ? u.totalEarnings : (availBal + pendingBal);

      if (pendingElem) pendingElem.innerText = `$${Number(pendingBal).toFixed(2)}`;
      if (availElem) availElem.innerText = `$${Number(availBal).toFixed(2)}`;
      if (dashTotalLinks) dashTotalLinks.innerText = u.totalLinks || (state.rawUserLinksCache ? state.rawUserLinksCache.length : 0);
      if (dashTotalClicks) dashTotalClicks.innerText = u.totalClicks || u.views || 0;
      if (dashTotalEarnings) dashTotalEarnings.innerText = `$${Number(totalEarnings).toFixed(2)}`;

      const botUsername = 'Ads_telegabot';
      if (refLinkInput) {
        refLinkInput.value = `https://t.me/${botUsername}?start=ref_${state.currentUserTelegramId}`;
      }

      if (refCountElem) refCountElem.innerText = u.referralCount || 0;
      if (refEarningsElem) refEarningsElem.innerText = `$${Number(u.referralEarnings || 0).toFixed(2)}`;

      if (walletInput && u.walletAddress) {
        walletInput.value = u.walletAddress;
      }

      if (data.announcement) {
        const ancBox = document.getElementById('announcement-box');
        const ancTitle = document.getElementById('anc-title');
        const ancContent = document.getElementById('anc-content');
        if (ancBox && ancTitle && ancContent) {
          ancTitle.innerText = data.announcement.title || '';
          ancContent.innerText = data.announcement.content || '';
          ancBox.classList.remove('hidden');
        }
      }

      fetchWithdrawalsHistory();
    }
  } catch (err) {
    console.error("Error loading user data:", err);
  }
}

export async function fetchUserReferrals() {
  const container = document.getElementById('ref-list');
  if (container) container.innerHTML = `<div style="text-align:center;"><div class="spinner"></div></div>`;

  try {
    const res = await safeFetch('/api/user/referrals');
    if (res && res.ok) {
      const data = await res.json().catch(() => null);
      const refs = Array.isArray(data) ? data : (data?.referrals || []);
      if (!container) return;

      if (refs.length === 0) {
        container.innerHTML = `<p style="text-align:center; color: var(--text-muted);">${i18n[state.currentLang]?.no_data || 'لا يوجد انضمام عبر رابطك بعد.'}</p>`;
        return;
      }

      container.innerHTML = refs.map(r => `
        <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--card-border);">
          <span>👤 ${escapeHTML(r.name || r.username || ('ID: ' + r.telegramId))}</span>
          <span style="color:var(--success); font-weight:bold;">+$${Number(r.earned || 0).toFixed(2)}</span>
        </div>
      `).join('');
    }
  } catch (err) {
    console.error("Error fetching referrals:", err);
  }
}

export function shareReferralLink() {
  triggerHaptic('medium');
  const refInput = document.getElementById('ref-link');
  const url = refInput ? refInput.value : `https://t.me/Ads_telegabot?start=ref_${state.currentUserTelegramId}`;
  const text = state.currentLang === 'ar' 
    ? 'انضم إلى منصة Telega.ads وابدأ في اختصار الروابط وتحقيق الأرباح اليوم!' 
    : 'Join Telega.ads platform and start earning money today!';
  
  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
  
  const tg = state.tg || window.Telegram?.WebApp;
  if (tg && typeof tg.openTelegramLink === 'function') {
    tg.openTelegramLink(shareUrl);
  } else {
    window.open(shareUrl, '_blank');
  }
}

export async function saveSettings() {
  const walletInput = document.getElementById('default-wallet');
  if (!walletInput) return;
  const address = walletInput.value.trim();

  if (!address) {
    showToast(i18n[state.currentLang]?.fill_all_fields || "يرجى إدخال عنوان المحفظة");
    return;
  }

  try {
    const res = await safeFetch('/api/user/wallet', {
      method: 'POST',
      body: { walletAddress: address }
    });
    if (res && res.ok) {
      showToast(i18n[state.currentLang]?.saved_successfully || "تم حفظ العنوان بنجاح!");
      walletInput.setAttribute('readonly', 'readonly');
      const editBtn = document.getElementById('edit-wallet-btn');
      const saveBtn = document.getElementById('save-wallet-btn');
      if (editBtn) editBtn.className = "btn-small btn-warning";
      if (saveBtn) saveBtn.classList.add('hidden');
    } else {
      showToast(state.currentLang === 'ar' ? "فشل حفظ المحفظة" : "Failed to save wallet address");
    }
  } catch (err) {
    console.error("Save wallet error:", err);
  }
}
