// public/js/modules/ads.js - Ad Campaigns & Delivery Module

const API = typeof require !== 'undefined' ? require('./api.js') : (window.API || {});
const i18n = typeof require !== 'undefined' ? require('./i18n.js') : (window.i18n || {});

const AdsModule = {
  /**
   * التبديل الديناميكي لحقول الإدخال بناءً على نوع الإعلان المحدد
   */
  onAdTypeChange: function() {
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
  },

  /**
   * إنشاء حملة إعلانية جديدة مع ربط الميزانية واستهداف الأجهزة
   */
  createAdCampaign: async function() {
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
    const lang = window.UI ? window.UI.currentLang : (window.currentLang || 'ar');

    const devices = [];
    if (document.getElementById('device-android')?.checked) devices.push('Android');
    if (document.getElementById('device-ios')?.checked) devices.push('iOS');
    if (document.getElementById('device-desktop')?.checked) devices.push('Desktop');

    const countriesRaw = countriesInput ? countriesInput.value.trim() : '';
    const countries = countriesRaw ? countriesRaw.split(',').map(c => c.trim().toUpperCase()).filter(Boolean) : ['ALL'];

    if (!title) {
      if (window.UI && typeof window.UI.showToast === 'function') {
        window.UI.showToast(lang === 'ar' ? 'يرجى إدخال عنوان الإعلان' : 'Please enter ad title');
      }
      return;
    }

    if (!targetUrl) {
      if (window.UI && typeof window.UI.showToast === 'function') {
        window.UI.showToast(lang === 'ar' ? 'يرجى إدخال رابط التوجيه' : 'Please enter target URL');
      }
      return;
    }

    if (!/^https?:\/\//i.test(targetUrl)) {
      targetUrl = 'https://' + targetUrl;
    }

    if (budget < 5) {
      if (window.UI && typeof window.UI.showToast === 'function') {
        window.UI.showToast(lang === 'ar' ? 'الحد الأدنى لميزانية الحملة هو $5' : 'Minimum campaign budget is $5');
      }
      return;
    }

    if (window.UI && typeof window.UI.setButtonLoading === 'function') {
      window.UI.setButtonLoading('btn-create-ad', true);
    }

    try {
      const payload = {
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
      };

      const apiInstance = window.API || API;
      const data = await apiInstance.createAdCampaign(payload);

      if (data && (data.success || data.ad)) {
        if (window.UI && typeof window.UI.showToast === 'function') {
          window.UI.showToast(lang === 'ar' ? 'تم إطلاق الحملة الإعلانية بنجاح!' : 'Ad campaign launched successfully!');
        }
        titleInput.value = '';
        targetUrlInput.value = '';
        budgetInput.value = '';
        if (mediaUrlInput) mediaUrlInput.value = '';
        if (appUrlInput) appUrlInput.value = '';
        if (gameUrlInput) gameUrlInput.value = '';
        if (dailyBudgetInput) dailyBudgetInput.value = '';
        if (countriesInput) countriesInput.value = '';
        await this.fetchUserAds();
        if (window.WalletModule && typeof window.WalletModule.loadUserData === 'function') {
          await window.WalletModule.loadUserData();
        }
      } else {
        const errorMsg = data?.error || (lang === 'ar' ? 'فشل إنشاء الحملة الإعلانية' : 'Failed to create ad campaign');
        if (window.UI && typeof window.UI.showToast === 'function') {
          window.UI.showToast(errorMsg);
        }
      }
    } catch (err) {
      if (window.UI && typeof window.UI.showToast === 'function') {
        window.UI.showToast(err.message || (lang === 'ar' ? 'خطأ أثناء إنشاء الحملة' : 'Error creating campaign'));
      }
    } finally {
      if (window.UI && typeof window.UI.setButtonLoading === 'function') {
        window.UI.setButtonLoading('btn-create-ad', false);
      }
    }
  },

  /**
   * جلب سجل إعلانات المستخدم
   */
  fetchUserAds: async function() {
    const container = document.getElementById('ads-list');
    if (container) {
      container.innerHTML = `<div style="text-align:center; padding: 10px;"><div class="spinner"></div></div>`;
    }

    try {
      const apiInstance = window.API || API;
      const ads = await apiInstance.getUserAds();
      this.renderUserAds(ads);
      return ads;
    } catch (err) {
      console.error("Error fetching user ads:", err);
    }
    return [];
  },

  /**
   * عرض حملات الإعلانات التابعة للمستخدم
   */
  renderUserAds: function(ads) {
    const container = document.getElementById('ads-list');
    if (!container) return;

    const lang = window.UI ? window.UI.currentLang : (window.currentLang || 'ar');
    const escapeFn = window.UI ? window.UI.escapeHTML : (str => str);

    if (!ads || ads.length === 0) {
      container.innerHTML = `<p style="text-align:center; color: var(--text-muted); margin: 12px 0;">${lang === 'ar' ? 'لا توجد حملات إعلانية نشطة.' : 'No active ad campaigns.'}</p>`;
      return;
    }

    container.innerHTML = ads.map(ad => {
      const title = escapeFn(ad.title || 'Untitled Ad');
      const targetUrl = escapeFn(ad.targetUrl || ad.url || '');
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
              ${adStatus !== 'completed' ? `<button onclick="window.AdsModule.toggleAdStatus('${ad._id}')" class="btn-small btn-warning" style="padding: 2px 8px; font-size: 10px;">${adStatus === 'active' ? 'إيقاف' : 'تفعيل'}</button>` : ''}
              <button onclick="window.AdsModule.deleteAdCampaign('${ad._id}')" class="btn-small btn-danger" style="padding: 2px 8px; font-size: 10px;">حذف واسترداد</button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  },

  /**
   * تبديل حالة الحملة بين إيقاف وتفعيل
   */
  toggleAdStatus: async function(adId) {
    try {
      const apiInstance = window.API || API;
      const success = await apiInstance.toggleAdStatus(adId);
      if (success) {
        if (window.UI && typeof window.UI.showToast === 'function') {
          window.UI.showToast('تم تغيير حالة الحملة بنجاح');
        }
        await this.fetchUserAds();
      }
    } catch (err) {
      if (window.UI && typeof window.UI.showToast === 'function') {
        window.UI.showToast('خطأ أثناء تغيير حالة الحملة');
      }
    }
  },

  /**
   * إيقاف وحذف الحملة واسترداد الميزانية
   */
  deleteAdCampaign: async function(adId) {
    if (!confirm('هل أنت تأكد من إيقاف وحذف الحملة؟ سيتم إرجاع الميزانية المتبقية إلى رصيدك المتاح فوراً.')) return;
    try {
      const apiInstance = window.API || API;
      const success = await apiInstance.deleteAd(adId);
      if (success) {
        if (window.UI && typeof window.UI.showToast === 'function') {
          window.UI.showToast('تم حذف الحملة واسترداد الميزانية المتبقية');
        }
        await this.fetchUserAds();
        if (window.WalletModule && typeof window.WalletModule.loadUserData === 'function') {
          await window.WalletModule.loadUserData();
        }
      }
    } catch (err) {
      if (window.UI && typeof window.UI.showToast === 'function') {
        window.UI.showToast('خطأ أثناء حذف الحملة');
      }
    }
  },

  /**
   * حساب المكافأة التقديرية لكل ألف مشاهدة (CPM)
   */
  calculateAdReward: function(cpmRate = 3.0, validImpressions = 1) {
    return (cpmRate / 1000) * validImpressions;
  },

  /**
   * دالة استدعاء الإعلانات وعرضها وحساب الأرباح
   */
  triggerBridgeAds: async function(triggerType = 'load') {
    const shortCode = window.currentShortCode;
    const token = window.bridgeToken;

    if (window.Adsgram && typeof window.Adsgram.init === 'function') {
      try {
        const blockId = window.ADSGRAM_BLOCK_ID || '1234';
        const AdController = window.Adsgram.init({ blockId: blockId });
        
        AdController.show().then((result) => {
          this.recordAdEarnings({ shortCode, token, triggerType, provider: 'adsgram', result });
        }).catch((err) => {
          console.warn("Adsgram skipped or failed:", err);
        });
      } catch (e) {
        console.error("Adsgram init error:", e);
      }
    }

    try {
      const adContainer = document.getElementById('ad-banner-container') || document.getElementById('bridge-ad-box') || document.getElementById('ad-container');
      const apiInstance = window.API || API;

      const res = await apiInstance.safeFetch('/api/ads/serve', {
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
          const escapeFn = window.UI ? window.UI.escapeHTML : (s => s);
          const title = escapeFn(ad.title);
          const adType = ad.type || 'image';

          let mediaHtml = '';
          if (adType === 'image' && ad.mediaUrl) {
            mediaHtml = `<img src="${ad.mediaUrl}" alt="${title}" style="max-width: 100%; border-radius: 8px; margin-bottom: 8px; max-height: 150px; object-fit: cover;">`;
          } else if (adType === 'video' && ad.mediaUrl) {
            mediaHtml = `<video src="${ad.mediaUrl}" controls style="max-width: 100%; border-radius: 8px; margin-bottom: 8px; max-height: 160px;"></video>`;
          } else if (adType === 'game' && ad.gameEmbedUrl) {
            mediaHtml = `<iframe src="${ad.gameEmbedUrl}" style="width: 100%; height: 160px; border: none; border-radius: 8px; margin-bottom: 8px;"></iframe>`;
          }

          let actionText = (window.UI ? window.UI.currentLang : 'ar') === 'ar' ? 'عرض الإعلان' : 'View Ad';
          let actionUrl = ad.targetUrl;

          if (adType === 'app') {
            actionText = (window.UI ? window.UI.currentLang : 'ar') === 'ar' ? '🚀 تحميل التطبيق' : '🚀 Download App';
            actionUrl = ad.appDownloadUrl || ad.targetUrl;
          } else if (adType === 'game') {
            actionText = (window.UI ? window.UI.currentLang : 'ar') === 'ar' ? '🎮 العب الآن' : '🎮 Play Now';
          }

          adContainer.innerHTML = `
            <div class="ad-banner" style="padding: 10px; border: 1px dashed var(--accent); border-radius: 8px; margin: 10px 0; text-align: center; background: rgba(0,0,0,0.05); width: 100%;">
              ${mediaHtml}
              <strong style="display:block; font-size: 13px; color: var(--text); margin-bottom: 6px;">${title}</strong>
              <a href="${actionUrl}" target="_blank" rel="noopener" onclick="window.AdsModule.recordAdClick('${ad._id || ad.id}')" style="display: inline-block; padding: 6px 16px; background: var(--accent); color: #fff; text-decoration: none; border-radius: 20px; font-size: 12px; font-weight: bold;">
                ${actionText} ↗
              </a>
            </div>
          `;
        }
      }
    } catch (err) {
      console.error("Background ad serving error:", err);
    }

    this.recordAdEarnings({ shortCode, token, triggerType, provider: 'internal' });
  },

  /**
   * إرسال الأرباح والمشاهدات المؤكدة في الخلفية
   */
  recordAdEarnings: async function(payload) {
    try {
      const apiInstance = window.API || API;
      await apiInstance.safeFetch('/api/ads/record-impression', {
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
  },

  /**
   * تسجيل نقرة الإعلان
   */
  recordAdClick: async function(adId) {
    try {
      const apiInstance = window.API || API;
      await apiInstance.safeFetch('/api/ads/click', {
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
};

// Global standard helpers mapping for compatibility
if (typeof window !== 'undefined') {
  window.AdsModule = AdsModule;
  window.onAdTypeChange = AdsModule.onAdTypeChange.bind(AdsModule);
  window.createAdCampaign = AdsModule.createAdCampaign.bind(AdsModule);
  window.fetchUserAds = AdsModule.fetchUserAds.bind(AdsModule);
  window.renderUserAds = AdsModule.renderUserAds.bind(AdsModule);
  window.toggleAdStatus = AdsModule.toggleAdStatus.bind(AdsModule);
  window.deleteAdCampaign = AdsModule.deleteAdCampaign.bind(AdsModule);
  window.triggerBridgeAds = AdsModule.triggerBridgeAds.bind(AdsModule);
  window.recordAdEarnings = AdsModule.recordAdEarnings.bind(AdsModule);
  window.recordAdClick = AdsModule.recordAdClick.bind(AdsModule);
  window.calculateAdReward = AdsModule.calculateAdReward.bind(AdsModule);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = AdsModule;
}
