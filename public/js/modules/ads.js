// وحدة إدارة الحملات الإعلانية وعرض الإعلانات وتسجيل الأرباح

/**
 * التبديل الديناميكي لحقول الإدخال بناءً على نوع الإعلان المحدد
 */
function onAdTypeChange() {
  const typeSelect = document.getElementById('ad-type');
  if (!typeSelect) return;

  const selectedType = typeSelect.value;
  const mediaContainer = document.getElementById('container-media-url');
  const appContainer = document.getElementById('container-app-url');
  const gameContainer = document.getElementById('container-game-url');

  if (mediaContainer) mediaContainer.classList.add('hidden');
  if (appContainer) appContainer.classList.add('hidden');
  if (gameContainer) gameContainer.classList.add('hidden');

  if (selectedType === 'image' || selectedType === 'video') {
    if (mediaContainer) mediaContainer.classList.remove('hidden');
  } else if (selectedType === 'app') {
    if (appContainer) appContainer.classList.remove('hidden');
  } else if (selectedType === 'game') {
    if (gameContainer) gameContainer.classList.remove('hidden');
  }
}
window.onAdTypeChange = onAdTypeChange;

async function createAdCampaign() {
  const titleInput = document.getElementById('ad-title');
  const targetUrlInput = document.getElementById('ad-target-url');
  const typeSelect = document.getElementById('ad-type');
  const mediaUrlInput = document.getElementById('ad-media-url');
  const appUrlInput = document.getElementById('ad-app-download-url');
  const gameUrlInput = document.getElementById('ad-game-embed-url');
  const categorySelect = document.getElementById('ad-category');
  const budgetInput = document.getElementById('ad-budget');
  const dailyBudgetInput = document.getElementById('ad-daily-budget');
  const countriesInput = document.getElementById('ad-countries');

  if (!titleInput || !targetUrlInput || !budgetInput) return;

  const title = titleInput.value.trim();
  let targetUrl = targetUrlInput.value.trim();
  const type = typeSelect ? typeSelect.value : 'image';
  const mediaUrl = mediaUrlInput ? mediaUrlInput.value.trim() : '';
  const appDownloadUrl = appUrlInput ? appUrlInput.value.trim() : '';
  const gameEmbedUrl = gameUrlInput ? gameUrlInput.value.trim() : '';
  const targetCategory = categorySelect ? categorySelect.value : 'all';
  const budget = parseFloat(budgetInput.value) || 0;
  const dailyBudget = dailyBudgetInput ? (parseFloat(dailyBudgetInput.value) || 0) : 0;
  const lang = window.currentLang || 'ar';

  // جمع الأجهزة المحددة
  const devices = [];
  if (document.getElementById('device-android')?.checked) devices.push('Android');
  if (document.getElementById('device-ios')?.checked) devices.push('iOS');
  if (document.getElementById('device-desktop')?.checked) devices.push('Desktop');

  // جمع الدول المحددة
  const countriesRaw = countriesInput ? countriesInput.value.trim() : '';
  const countries = countriesRaw ? countriesRaw.split(',').map(c => c.trim().toUpperCase()).filter(Boolean) : ['ALL'];

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
        type: type,
        mediaUrl: mediaUrl,
        appDownloadUrl: appDownloadUrl,
        gameEmbedUrl: gameEmbedUrl,
        targetCategory: targetCategory,
        countries: countries,
        devices: devices.length > 0 ? devices : ['Android', 'iOS', 'Desktop'],
        totalBudget: budget,
        dailyBudget: dailyBudget
      }
    });

    if (res) {
      const data = await res.json().catch(() => ({}));
      if (res.ok && (data.success || data.ad)) {
        if (typeof window.showToast === 'function') window.showToast(lang === 'ar' ? 'تم إطلاق الحملة الإعلانية بنجاح!' : 'Ad campaign launched successfully!');
        titleInput.value = '';
        targetUrlInput.value = '';
        budgetInput.value = '';
        if (mediaUrlInput) mediaUrlInput.value = '';
        if (appUrlInput) appUrlInput.value = '';
        if (gameUrlInput) gameUrlInput.value = '';
        if (dailyBudgetInput) dailyBudgetInput.value = '';
        if (countriesInput) countriesInput.value = '';
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
    const budget = (ad.totalBudget || ad.budget || 0).toFixed(2);
    const remaining = (ad.remainingBudget !== undefined ? ad.remainingBudget : budget).toFixed(2);
    const spent = ((ad.totalBudget || ad.budget || 0) - (ad.remainingBudget || 0)).toFixed(2);
    const impressions = ad.impressionsCount || ad.impressions || ad.views || 0;
    const clicks = ad.clicksCount || ad.clicks || 0;
    const adType = (ad.type || 'image').toUpperCase();
    const adStatus = ad.status || 'active';

    const statusBadge = adStatus === 'active' 
      ? `<span style="background: rgba(34, 197, 94, 0.15); color: var(--success); padding: 2px 6px; border-radius: 4px; font-size: 10px;">نشط</span>`
      : adStatus === 'paused'
      ? `<span style="background: rgba(234, 179, 8, 0.15); color: var(--warning); padding: 2px 6px; border-radius: 4px; font-size: 10px;">متوقف</span>`
      : `<span style="background: rgba(239, 68, 68, 0.15); color: var(--danger); padding: 2px 6px; border-radius: 4px; font-size: 10px;">مكتمل</span>`;

    return `
      <div class="ad-item" style="background: rgba(15, 23, 42, 0.6); border: 1px solid var(--card-border); border-radius: 10px; padding: 12px; margin-bottom: 10px;">
        <div class="ad-header" style="display: flex; justify-content: space-between; align-items: center;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="background: var(--accent); color: #fff; font-size: 9px; padding: 2px 5px; border-radius: 4px; font-weight: bold;">${adType}</span>
            <strong style="font-size: 14px; color: var(--text);">${title}</strong>
          </div>
          ${statusBadge}
        </div>
        
        <div style="margin: 6px 0; font-size: 11px; color: var(--text-muted); word-break: break-all;">
          🔗 ${targetUrl}
        </div>

        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin: 8px 0; text-align: center; font-size: 10px; background: rgba(0,0,0,0.2); padding: 6px; border-radius: 6px;">
          <div>
            <span style="color: var(--text-muted); display: block;">الميزانية</span>
            <strong style="color: var(--text);">$${budget}</strong>
          </div>
          <div>
            <span style="color: var(--text-muted); display: block;">المصروف</span>
            <strong style="color: var(--warning);">$${spent}</strong>
          </div>
          <div>
            <span style="color: var(--text-muted); display: block;">المتبقي</span>
            <strong style="color: var(--success);">$${remaining}</strong>
          </div>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: var(--text-muted); border-top: 1px solid var(--card-border); padding-top: 8px; margin-top: 8px;">
          <span>👁️ ${impressions} مشاهدة | 🖱️ ${clicks} نقرة</span>
          <div style="display: flex; gap: 6px;">
            ${adStatus !== 'completed' ? `<button onclick="toggleAdStatus('${ad._id}')" class="btn-small btn-warning" style="padding: 2px 8px; font-size: 10px;">${adStatus === 'active' ? 'إيقاف' : 'تفعيل'}</button>` : ''}
            <button onclick="deleteAdCampaign('${ad._id}')" class="btn-small btn-danger" style="padding: 2px 8px; font-size: 10px;">حذف واسترداد</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}
window.renderUserAds = renderUserAds;

async function toggleAdStatus(adId) {
  try {
    const res = await window.safeFetch('/api/ads/toggle', {
      method: 'POST',
      body: { adId }
    });
    if (res && res.ok) {
      if (typeof window.showToast === 'function') window.showToast('تم تغيير حالة الحملة بنجاح');
      await fetchUserAds();
    }
  } catch (err) {
    if (typeof window.showToast === 'function') window.showToast('خطأ أثناء تغيير حالة الحملة');
  }
}
window.toggleAdStatus = toggleAdStatus;

async function deleteAdCampaign(adId) {
  if (!confirm('هل أنت تأكد من إيقاف وحذف الحملة؟ سيتم إرجاع الميزانية المتبقية إلى رصيدك المتاح فوراً.')) return;
  try {
    const res = await window.safeFetch(`/api/ads/delete/${adId}`, { method: 'DELETE' });
    if (res && res.ok) {
      if (typeof window.showToast === 'function') window.showToast('تم حذف الحملة واسترداد الميزانية المتبقية');
      await fetchUserAds();
      if (typeof window.loadUserData === 'function') await window.loadUserData();
    }
  } catch (err) {
    if (typeof window.showToast === 'function') window.showToast('خطأ أثناء حذف الحملة');
  }
}
window.deleteAdCampaign = deleteAdCampaign;

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
    const adContainer = document.getElementById('ad-banner-container') || document.getElementById('bridge-ad-box') || document.getElementById('ad-container');
    
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
        const ad = adData.ad;
        const title = window.escapeHTML ? window.escapeHTML(ad.title) : ad.title;
        const adType = ad.type || 'image';

        let mediaHtml = '';
        if (adType === 'image' && ad.mediaUrl) {
          mediaHtml = `<img src="${ad.mediaUrl}" alt="${title}" style="max-width: 100%; border-radius: 8px; margin-bottom: 8px; max-height: 150px; object-fit: cover;">`;
        } else if (adType === 'video' && ad.mediaUrl) {
          mediaHtml = `<video src="${ad.mediaUrl}" controls style="max-width: 100%; border-radius: 8px; margin-bottom: 8px; max-height: 160px;"></video>`;
        } else if (adType === 'game' && ad.gameEmbedUrl) {
          mediaHtml = `<iframe src="${ad.gameEmbedUrl}" style="width: 100%; height: 160px; border: none; border-radius: 8px; margin-bottom: 8px;"></iframe>`;
        }

        let actionText = window.currentLang === 'ar' ? 'عرض الإعلان' : 'View Ad';
        let actionUrl = ad.targetUrl;

        if (adType === 'app') {
          actionText = window.currentLang === 'ar' ? '🚀 تحميل التطبيق' : '🚀 Download App';
          actionUrl = ad.appDownloadUrl || ad.targetUrl;
        } else if (adType === 'game') {
          actionText = window.currentLang === 'ar' ? '🎮 العب الآن' : '🎮 Play Now';
        }

        adContainer.innerHTML = `
          <div class="ad-banner" style="padding: 10px; border: 1px dashed var(--accent); border-radius: 8px; margin: 10px 0; text-align: center; background: rgba(0,0,0,0.05); width: 100%;">
            ${mediaHtml}
            <strong style="display:block; font-size: 13px; color: var(--text); margin-bottom: 6px;">${title}</strong>
            <a href="${actionUrl}" target="_blank" rel="noopener" onclick="recordAdClick('${ad._id || ad.id}')" style="display: inline-block; padding: 6px 16px; background: var(--accent); color: #fff; text-decoration: none; border-radius: 20px; font-size: 12px; font-weight: bold;">
              ${actionText} ↗
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
