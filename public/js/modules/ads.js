import { state, i18n } from '../state.js';
import { safeFetch } from './api.js';
import { showToast, closeModal, escapeHTML } from './ui.js';

export async function createAdCampaign() {
  const mTitle = document.getElementById('modal-ad-title')?.value;
  const mUrl = document.getElementById('modal-ad-target-url')?.value;
  const mBudget = document.getElementById('modal-ad-budget')?.value;

  const tTitle = document.getElementById('ad-title')?.value;
  const tUrl = document.getElementById('ad-target-url')?.value;
  const tBudget = document.getElementById('ad-budget')?.value;

  const title = mTitle || tTitle;
  const targetUrl = mUrl || tUrl;
  const budget = parseFloat(mBudget || tBudget);

  if (!title || !targetUrl || !budget || budget < 5) {
    showToast(i18n[state.currentLang]?.fill_all_fields || "يرجى ملء كل بيانات الحملة (الحد الأدنى للميزانية 5$)");
    return;
  }

  try {
    const res = await safeFetch('/api/ads/create', {
      method: 'POST',
      body: { title, targetUrl, budget }
    });

    if (res && res.ok) {
      showToast(i18n[state.currentLang]?.ad_success || "تم إطلاق الحملة الإعلانية بنجاح!");
      closeModal('create-ad-modal');

      if (document.getElementById('modal-ad-title')) document.getElementById('modal-ad-title').value = '';
      if (document.getElementById('modal-ad-target-url')) document.getElementById('modal-ad-target-url').value = '';
      if (document.getElementById('modal-ad-budget')) document.getElementById('modal-ad-budget').value = '';
      if (document.getElementById('ad-title')) document.getElementById('ad-title').value = '';
      if (document.getElementById('ad-target-url')) document.getElementById('ad-target-url').value = '';
      if (document.getElementById('ad-budget')) document.getElementById('ad-budget').value = '';

      fetchUserAds();
    } else {
      const data = await res?.json().catch(() => ({}));
      showToast(data?.error || "فشل إنشاء الحملة الإعلانية");
    }
  } catch (err) {
    console.error("Create Ad error:", err);
  }
}

export async function fetchUserAds() {
  const container = document.getElementById('ads-list');
  if (container) container.innerHTML = `<div style="text-align:center;"><div class="spinner"></div></div>`;

  try {
    const res = await safeFetch('/api/ads/my-ads');
    if (res && res.ok) {
      const data = await res.json().catch(() => null);
      const ads = Array.isArray(data) ? data : (data?.ads || []);
      renderUserAds(ads);
    }
  } catch (err) {
    console.error("Fetch ads error:", err);
  }
}

export function renderUserAds(ads) {
  const container = document.getElementById('ads-list');
  if (!container) return;

  if (!ads || ads.length === 0) {
    container.innerHTML = `<p style="text-align:center; color: var(--text-muted);">${i18n[state.currentLang]?.no_data || 'لا توجد حملات إعلانية متاحة.'}</p>`;
    return;
  }

  container.innerHTML = ads.map(ad => `
    <div class="link-item">
      <div class="link-header">
        <strong>${escapeHTML(ad.title)}</strong>
        <span style="color:var(--accent);">$${Number(ad.budget || 0).toFixed(2)}</span>
      </div>
      <div style="font-size:11px; color:var(--text-muted); margin:4px 0;">🔗 ${escapeHTML(ad.targetUrl)}</div>
      <div style="font-size:11px; display:flex; justify-content:space-between; margin-top:6px;">
        <span>👁️ ${ad.views || 0} مشاهدة</span>
        <span style="color:var(--success);">${ad.status || 'نشط'}</span>
      </div>
    </div>
  `).join('');
}
