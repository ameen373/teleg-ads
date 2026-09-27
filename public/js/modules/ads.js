import { i18n, currentLang } from '../language/i18n.js';
import { safeFetch, currentUserTelegramId } from './api.js';
import { showToast, setButtonLoading, escapeHTML } from './ui.js';
import { loadUserData } from './wallet.js';

export async function createAdCampaign() {
  const lang = currentLang || window.currentLang || 'ar';
  const title = document.getElementById('ad-title').value.trim();
  let targetUrl = document.getElementById('ad-target-url').value.trim();
  const budget = parseFloat(document.getElementById('ad-budget').value) || 0;

  if (!title) {
    showToast(lang === 'ar' ? 'يرجى إدخال عنوان الإعلان' : 'Please enter ad title');
    return;
  }

  if (!targetUrl) {
    showToast(lang === 'ar' ? 'يرجى إدخال رابط التوجيه' : 'Please enter target URL');
    return;
  }

  if (!/^https?:\/\//i.test(targetUrl)) {
    targetUrl = 'https://' + targetUrl;
  }

  if (budget < 5) {
    showToast(lang === 'ar' ? 'الحد الأدنى لميزانية الحملة هو $5' : 'Minimum campaign budget is $5');
    return;
  }

  setButtonLoading('btn-create-ad', true);

  try {
    const res = await safeFetch('/api/ads/create', {
      method: 'POST',
      body: {
        userId: currentUserTelegramId,
        telegramId: currentUserTelegramId,
        title: title,
        targetUrl: targetUrl,
        budget: budget
      }
    });

    if (res) {
      const data = await res.json().catch(() => ({}));
      if (res.ok && (data.success || data.ad)) {
        showToast(lang === 'ar' ? 'تم إطلاق الحملة الإعلانية بنجاح!' : 'Ad campaign launched successfully!');
        document.getElementById('ad-title').value = '';
        document.getElementById('ad-target-url').value = '';
        document.getElementById('ad-budget').value = '';
        await fetchUserAds();
        await loadUserData();
      } else {
        showToast(data.error || (lang === 'ar' ? 'فشل إنشاء الحملة الإعلانية' : 'Failed to create ad campaign'));
      }
    }
  } catch (err) {
    showToast(err.message || (lang === 'ar' ? 'خطأ أثناء إنشاء الحملة' : 'Error creating campaign'));
  } finally {
    setButtonLoading('btn-create-ad', false);
  }
}

export async function fetchUserAds() {
  const container = document.getElementById('ads-list');
  if (container) {
    container.innerHTML = `<div style="text-align:center; padding: 10px;"><div class="spinner"></div></div>`;
  }

  try {
    const res = await safeFetch('/api/ads');
    if (res) {
      const data = await res.json().catch(() => null);
      if (data) {
        const ads = Array.isArray(data) ? data : (data.ads || data.data || []);
        renderUserAds(ads);
        return ads;
      }
    }
  } catch (err) {
    console.error("Error fetching user ads:", err);
  }
  return [];
}

export function renderUserAds(ads) {
  const container = document.getElementById('ads-list');
  if (!container) return;

  const lang = currentLang || window.currentLang || 'ar';

  if (!ads || ads.length === 0) {
    container.innerHTML = `<p style="text-align:center; color: var(--text-muted); margin: 12px 0;">${lang === 'ar' ? 'لا توجد حملات إعلانية نشطة.' : 'No active ad campaigns.'}</p>`;
    return;
  }

  container.innerHTML = ads.map(ad => {
    const title = escapeHTML(ad.title || 'Untitled Ad');
    const targetUrl = escapeHTML(ad.targetUrl || ad.url || '');
    const budget = (ad.budget || 0).toFixed(2);
    const spent = (ad.spent || ad.totalSpent || 0).toFixed(2);
    const impressions = ad.impressions || ad.views || 0;

    return `
      <div class="ad-item">
        <div class="ad-header">
          <strong style="font-size: 14px; color: var(--text);">${title}</strong>
          <span style="font-size: 11px; color: var(--accent); font-weight: 700;">$${spent} / $${budget}</span>
        </div>
        <div style="margin: 6px 0; font-size: 11px; color: var(--text-muted); word-break: break-all;">
          🔗 ${targetUrl}
        </div>
        <div style="font-size: 11px; color: var(--text-muted); margin-top: 8px; border-top: 1px solid var(--card-border); padding-top: 8px;">
          👁️ ${impressions} ${lang === 'ar' ? 'مشاهدة حقيقية' : 'impressions'}
        </div>
      </div>
    `;
  }).join('');
}
