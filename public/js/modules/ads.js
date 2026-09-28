// وحدة إدارة الحملات الإعلانية وعرض الإعلانات وتسجيل الأرباح

async function createAdCampaign() {
  const titleInput = document.getElementById('ad-title');
  const targetUrlInput = document.getElementById('ad-target-url');
  const budgetInput = document.getElementById('ad-budget');

  if (!titleInput || !targetUrlInput || !budgetInput) return;

  const title = titleInput.value.trim();
  let targetUrl = targetUrlInput.value.trim();
  const budget = parseFloat(budgetInput.value) || 0;
  const lang = window.currentLang || 'ar';

  if (!title) {
    if (typeof window.showToast === 'function') window.showToast(lang === 'ar' ? 'يرجى إدخال عنوان الإعلان' : 'Please enter ad title');
    return;
  }

  if (!targetUrl) {
    if (typeof window.showToast === 'function') window.showToast(lang === 'ar' ? 'يرجى إدخال رابط التوجيه' : 'Please enter target URL');
    return;
  }

  if (!/^https?:\/\//i.test(targetUrl)) {
    targetUrl = 'https://' + targetUrl;
  }

  if (budget < 5) {
    if (typeof window.showToast === 'function') window.showToast(lang === 'ar' ? 'الحد الأدنى لميزانية الحملة هو $5' : 'Minimum campaign budget is $5');
    return;
  }

  if (typeof window.setButtonLoading === 'function') window.setButtonLoading('btn-create-ad', true);

  try {
    const res = await window.safeFetch('/api/ads/create', {
      method: 'POST',
      body: {
        userId: window.currentUserTelegramId,
        telegramId: window.currentUserTelegramId,
        title: title,
        targetUrl: targetUrl,
        budget: budget
      }
    });

    if (res) {
      const data = await res.json().catch(() => ({}));
      if (res.ok && (data.success || data.ad)) {
        if (typeof window.showToast === 'function') window.showToast(lang === 'ar' ? 'تم إطلاق الحملة الإعلانية بنجاح!' : 'Ad campaign launched successfully!');
        titleInput.value = '';
        targetUrlInput.value = '';
        budgetInput.value = '';
        await fetchUserAds();
        if (typeof window.loadUserData === 'function') await window.loadUserData();
      } else {
        if (typeof window.showToast === 'function') window.showToast(data.error || (lang === 'ar' ? 'فشل إنشاء الحملة الإعلانية' : 'Failed to create ad campaign'));
      }
    }
  } catch (err) {
    if (typeof window.showToast === 'function') window.showToast(err.message || (lang === 'ar' ? 'خطأ أثناء إنشاء الحملة' : 'Error creating campaign'));
  } finally {
    if (typeof window.setButtonLoading === 'function') window.setButtonLoading('btn-create-ad', false);
  }
}
window.createAdCampaign = createAdCampaign;

async function fetchUserAds() {
  const container = document.getElementById('ads-list');
  if (container) {
    container.innerHTML = `<div style="text-align:center; padding: 10px;"><div class="spinner"></div></div>`;
  }

  try {
    const res = await window.safeFetch('/api/ads');
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
window.fetchUserAds = fetchUserAds;

function renderUserAds(ads) {
  const container = document.getElementById('ads-list');
  if (!container) return;

  const lang = window.currentLang || 'ar';

  if (!ads || ads.length === 0) {
    container.innerHTML = `<p style="text-align:center; color: var(--text-muted); margin: 12px 0;">${lang === 'ar' ? 'لا توجد حملات إعلانية نشطة.' : 'No active ad campaigns.'}</p>`;
    return;
  }

  container.innerHTML = ads.map(ad => {
    const title = window.escapeHTML ? window.escapeHTML(ad.title || 'Untitled Ad') : (ad.title || 'Untitled Ad');
    const targetUrl = window.escapeHTML ? window.escapeHTML(ad.targetUrl || ad.url || '') : (ad.targetUrl || ad.url || '');
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
window.renderUserAds = renderUserAds;

/**
 * دالة استدعاء الإعلانات وتسجيل الأرباح فوراً في الخلفية عند التحميل أو النقر
 * @param {'load'|'click'} triggerType
 */
async function triggerBridgeAds(triggerType = 'load') {
  const shortCode = window.currentShortCode;
  const token = window.bridgeToken;

  // 1. استدعاء إعلانات AdsGram في حال كانت المكتبيّة مدمجة
  if (window.Adsgram && typeof window.Adsgram.init === 'function') {
    try {
      const blockId = window.ADSGRAM_BLOCK_ID || '1234';
      const AdController = window.Adsgram.init({ blockId: blockId });
      
      AdController.show().then((result) => {
        recordAdEarnings({ shortCode, token, triggerType, provider: 'adsgram', result });
      }).catch((err) => {
        console.warn("Adsgram skipped or failed:", err);
      });
    } catch (e) {
      console.error("Adsgram init error:", e);
    }
  }

  // 2. طلب عرض إعلان داخلي في كتل الإعلانات المخصصة للـ Bridge
  try {
    const adContainer = document.getElementById('ad-banner-container') || document.getElementById('bridge-ad-box');
    
    const res = await window.safeFetch('/api/ads/serve', {
      method: 'POST',
      body: {
        shortCode: shortCode,
        token: token,
        triggerType: triggerType,
        telegramId: window.currentUserTelegramId
      }
    });

    if (res && res.ok) {
      const adData = await res.json().catch(() => null);
      if (adData && adData.ad && adContainer) {
        const title = window.escapeHTML ? window.escapeHTML(adData.ad.title) : adData.ad.title;
        adContainer.innerHTML = `
          <div class="ad-banner" style="padding: 10px; border: 1px dashed var(--accent); border-radius: 8px; margin: 10px 0; text-align: center; background: rgba(0,0,0,0.05);">
            <strong style="display:block; font-size: 13px; color: var(--text);">${title}</strong>
            <a href="${adData.ad.targetUrl}" target="_blank" rel="noopener" onclick="recordAdClick('${adData.ad._id || adData.ad.id}')" style="display: inline-block; margin-top: 6px; font-size: 12px; color: var(--accent); font-weight: bold;">
              ${window.currentLang === 'ar' ? 'عرض الإعلان' : 'View Ad'}
            </a>
          </div>
        `;
      }
    }
  } catch (err) {
    console.error("Background ad serving error:", err);
  }

  // 3. إرسال طلب تسجيل الأرباح في الخلفية فوراً
  recordAdEarnings({ shortCode, token, triggerType, provider: 'internal' });
}
window.triggerBridgeAds = triggerBridgeAds;

/**
 * إرسال الأرباح والمشاهدات المؤكدة في الخلفية
 */
async function recordAdEarnings(payload) {
  try {
    await window.safeFetch('/api/ads/record-impression', {
      method: 'POST',
      body: {
        shortCode: payload.shortCode || window.currentShortCode,
        token: payload.token || window.bridgeToken,
        triggerType: payload.triggerType || 'load',
        provider: payload.provider || 'internal',
        telegramId: window.currentUserTelegramId,
        timestamp: Date.now()
      }
    });
  } catch (err) {
    console.error("Failed to record ad earnings in background:", err);
  }
}
window.recordAdEarnings = recordAdEarnings;

/**
 * تسجيل نقرة الإعلان
 */
async function recordAdClick(adId) {
  try {
    await window.safeFetch('/api/ads/click', {
      method: 'POST',
      body: {
        adId: adId,
        shortCode: window.currentShortCode,
        telegramId: window.currentUserTelegramId
      }
    });
  } catch (err) {
    console.error("Failed to record ad click:", err);
  }
}
window.recordAdClick = recordAdClick;
