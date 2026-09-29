// public/js/modules/shortener.js
// Telega.ads - URL Shortener & Bridge Controller Module (ES Module)

import API from './api.js';
import i18n from './i18n.js';
import UI from './ui.js';

window.rawUserLinksCache = window.rawUserLinksCache || [];
window.bridgeDestinationUrl = null;
window.currentShortCode = null;
window.bridgeToken = null;
window.bridgeStartTime = null;
window.bridgeTimerInterval = null;
window.humanInteractionScore = 0;
window.visitorFingerprint = null;

export const ShortenerModule = {
  /**
   * جمع بصمة المتصفح الأساسية (Canvas Fingerprint + تفاصيل الشاشة)
   */
  generateBrowserFingerprint: function() {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = 200;
      canvas.height = 50;

      if (ctx) {
        ctx.textBaseline = 'top';
        ctx.font = '14px Arial';
        ctx.fillStyle = '#f60';
        ctx.fillRect(125, 1, 62, 20);
        ctx.fillStyle = '#069';
        ctx.fillText('TelegaAds,2026', 2, 15);
        ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
        ctx.fillText('TelegaAds,2026', 4, 17);
      }

      const canvasData = canvas.toDataURL();
      const screenInfo = `${screen.width}x${screen.height}x${screen.colorDepth}`;
      const lang = navigator.language || '';
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';

      let hash = 0;
      const str = `${canvasData}___${screenInfo}___${lang}___${tz}`;
      for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash |= 0;
      }

      window.visitorFingerprint = 'fp_' + Math.abs(hash).toString(16);
      return window.visitorFingerprint;
    } catch (e) {
      window.visitorFingerprint = 'fp_fallback_' + Date.now();
      return window.visitorFingerprint;
    }
  },

  /**
   * كشف التفاعل البشري الحقيقي (Human Interaction Tracker)
   */
  initHumanInteractionTracker: function() {
    window.humanInteractionScore = 0;

    const registerAction = () => {
      window.humanInteractionScore += 1;
      if (window.humanInteractionScore >= 5) {
        window.removeEventListener('mousemove', registerAction);
        window.removeEventListener('touchmove', registerAction);
        window.removeEventListener('scroll', registerAction);
        window.removeEventListener('keydown', registerAction);
      }
    };

    window.addEventListener('mousemove', registerAction, { passive: true });
    window.addEventListener('touchmove', registerAction, { passive: true });
    window.addEventListener('scroll', registerAction, { passive: true });
    window.addEventListener('keydown', registerAction, { passive: true });
  },

  /**
   * تنسيق الرابط المختصر
   */
  formatShortUrl: function(link) {
    if (!link) return '';
    let rawUrl = link.shortUrl || link.shortLink || link.url;
    if (!rawUrl && link.shortCode) {
      rawUrl = `${window.API_BASE || ''}/r/${link.shortCode}`;
    }
    if (!rawUrl) return '';

    rawUrl = rawUrl.replace(/^(https?:\/\/)+/i, 'https://');

    if (/^https?:\/\//i.test(rawUrl)) {
      return rawUrl;
    }
    rawUrl = rawUrl.replace(/^\/+/, '');
    return `https://${rawUrl}`;
  },

  /**
   * جلب قائمة روابط المستخدم
   */
  fetchUserLinks: async function() {
    const linksContainer = document.getElementById('links-list');
    if (linksContainer && (!window.rawUserLinksCache || window.rawUserLinksCache.length === 0)) {
      linksContainer.innerHTML = `<div style="text-align:center; padding: 10px;"><div class="spinner"></div></div>`;
    }

    try {
      const links = await API.getUserLinks();
      window.rawUserLinksCache = links;
      this.renderUserLinks(window.rawUserLinksCache);
      return window.rawUserLinksCache;
    } catch (err) {
      console.error("Error fetching user links:", err);
    }
    return [];
  },

  /**
   * معالجة الضغط على زر اختصار رابط جديد
   */
  handleShortenClick: async function(e) {
    if (e) e.preventDefault();
    const titleInput = document.getElementById('link-title');
    const urlInput = document.getElementById('link-url');

    if (!urlInput) return;

    const title = titleInput ? titleInput.value.trim() : '';
    let url = urlInput.value.trim();
    const lang = UI ? UI.currentLang : (window.currentLang || 'ar');

    if (!url) {
      if (UI && typeof UI.showToast === 'function') {
        UI.showToast(lang === 'ar' ? 'يرجى إدخال الرابط الأصلي' : 'Please enter original URL');
      }
      return;
    }

    if (!/^https?:\/\//i.test(url)) {
      url = 'https://' + url;
    }

    if (UI && typeof UI.setButtonLoading === 'function') {
      UI.setButtonLoading('btn-create-link', true);
    }

    try {
      const data = await API.createShortLink(title || 'رابط مختصر', url);

      if (data && (data.success || data.link || data.shortCode)) {
        if (UI && typeof UI.showToast === 'function') {
          UI.showToast(i18n[lang]?.link_success_msg || (lang === 'ar' ? 'تم اختصار الرابط بنجاح!' : 'Link shortened successfully!'));
        }
        if (titleInput) titleInput.value = '';
        urlInput.value = '';

        const newLink = data.link || {
          _id: data._id || data.id || ('link_' + Date.now()),
          title: title || data.title || 'رابط مختصر',
          originalUrl: url,
          targetUrl: url,
          shortCode: data.shortCode || data.code || '',
          shortUrl: data.shortUrl || data.shortLink || (data.shortCode ? `${window.API_BASE || ''}/r/${data.shortCode}` : ''),
          views: 0,
          validImpressions: 0,
          totalEarnings: 0
        };

        if (!window.rawUserLinksCache) window.rawUserLinksCache = [];

        const existingIndex = window.rawUserLinksCache.findIndex(l => 
          (l._id && newLink._id && String(l._id) === String(newLink._id)) ||
          (l.shortCode && newLink.shortCode && l.shortCode === newLink.shortCode)
        );

        if (existingIndex !== -1) {
          window.rawUserLinksCache[existingIndex] = { ...window.rawUserLinksCache[existingIndex], ...newLink };
        } else {
          window.rawUserLinksCache.unshift(newLink);
        }

        this.renderUserLinks(window.rawUserLinksCache);
        if (window.WalletModule && typeof window.WalletModule.loadUserData === 'function') {
          await window.WalletModule.loadUserData();
        }
        await this.fetchUserLinks();
      } else {
        const errorMsg = data?.error || data?.message || (lang === 'ar' ? 'فشل إنشاء الرابط المختصر' : 'Failed to create short link');
        if (UI && typeof UI.showToast === 'function') {
          UI.showToast(errorMsg);
        }
      }
    } catch (err) {
      console.error("Shorten Link Error:", err);
      if (UI && typeof UI.showToast === 'function') {
        UI.showToast(err.message || (lang === 'ar' ? 'حدث خطأ أثناء اختصار الرابط' : 'An error occurred while shortening link'));
      }
    } finally {
      if (UI && typeof UI.setButtonLoading === 'function') {
        UI.setButtonLoading('btn-create-link', false);
      }
    }
  },

  /**
   * عرض قائمة روابط المستخدم بالواجهة
   */
  renderUserLinks: function(links) {
    const container = document.getElementById('links-list');
    if (!container) return;

    const lang = UI ? UI.currentLang : (window.currentLang || 'ar');
    const escapeFn = UI ? UI.escapeHTML : (s => s);

    if (!links || links.length === 0) {
      container.innerHTML = `<p style="text-align:center; color: var(--text-muted); margin: 12px 0;">${lang === 'ar' ? 'لا توجد روابط مختصرة بعد.' : 'No shortened links found.'}</p>`;
      return;
    }

    container.innerHTML = links.map(link => {
      const formattedUrl = this.formatShortUrl(link);
      const title = escapeFn(link.title || link.shortCode || 'Untitled Link');
      const originalUrl = escapeFn(link.originalUrl || link.targetUrl || link.url || '');
      const clicks = link.views || link.clicks || 0;
      const validImp = link.validImpressions || 0;
      const earnings = (link.totalEarnings || 0).toFixed(4);
      const linkId = link._id || link.id || link.shortCode;

      return `
        <div class="link-item">
          <div class="link-header">
            <strong style="font-size: 14px; color: var(--text);">${title}</strong>
            <span style="font-size: 11px; color: var(--success); font-weight: 700;">$${earnings}</span>
          </div>
          <div style="margin: 6px 0; font-size: 12px;">
            <a href="${formattedUrl}" target="_blank" rel="noopener" style="color: var(--accent); text-decoration: none; word-break: break-all; font-weight: 600;">${formattedUrl}</a>
          </div>
          <div style="font-size: 11px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 8px;">
            ↪ ${originalUrl}
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--card-border); padding-top: 8px; margin-top: 8px;">
            <span style="font-size: 11px; color: var(--text-muted);">👁️ ${clicks} ${lang === 'ar' ? 'زيارة' : 'clicks'} (${validImp} ${lang === 'ar' ? 'مؤكدة' : 'valid'})</span>
            <div class="link-actions">
              <button class="btn-small" onclick="window.UI.copyToClipboard('${formattedUrl}')">${i18n[lang]?.btn_copy || (lang === 'ar' ? 'نسخ' : 'Copy')}</button>
              <button class="btn-small btn-danger" onclick="window.ShortenerModule.deleteLink('${linkId}')">${lang === 'ar' ? 'حذف' : 'Delete'}</button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  },

  /**
   * فلترة وتصفية قائمة الروابط
   */
  filterUserLinks: function(term) {
    if (!window.rawUserLinksCache) return;
    const lower = (term || '').toLowerCase().trim();
    if (!lower) {
      this.renderUserLinks(window.rawUserLinksCache);
      return;
    }
    const filtered = window.rawUserLinksCache.filter(l => 
      (l.title && l.title.toLowerCase().includes(lower)) ||
      (l.originalUrl && l.originalUrl.toLowerCase().includes(lower)) ||
      (l.targetUrl && l.targetUrl.toLowerCase().includes(lower)) ||
      (l.shortCode && l.shortCode.toLowerCase().includes(lower))
    );
    this.renderUserLinks(filtered);
  },

  /**
   * حذف رابط
   */
  deleteLink: async function(linkId) {
    const lang = UI ? UI.currentLang : (window.currentLang || 'ar');
    if (!confirm(lang === 'ar' ? 'هل أنت تأكد من حذف هذا الرابط؟' : 'Are you sure you want to delete this link?')) return;

    try {
      const success = await API.deleteLink(linkId);
      if (success) {
        if (UI && typeof UI.showToast === 'function') {
          UI.showToast(lang === 'ar' ? 'تم حذف الرابط بنجاح' : 'Link deleted successfully');
        }
        if (window.WalletModule && typeof window.WalletModule.loadUserData === 'function') {
          await window.WalletModule.loadUserData();
        }
        await this.fetchUserLinks();
      } else {
        if (UI && typeof UI.showToast === 'function') {
          UI.showToast(lang === 'ar' ? 'فشل حذف الرابط' : 'Failed to delete link');
        }
      }
    } catch (err) {
      if (UI && typeof UI.showToast === 'function') {
        UI.showToast(err.message || (lang === 'ar' ? 'خطأ في الشبكة' : 'Network error'));
      }
    }
  },

  /**
   * عرض الإعلان ديناميكياً بحسب نوعه
   */
  renderBridgeAd: function(ad) {
    const adContainer = document.getElementById('bridge-ad-space') || document.getElementById('ad-container');
    if (!adContainer || !ad) return;

    const escapeFn = UI ? UI.escapeHTML : (s => s);
    const title = escapeFn(ad.title || 'إعلان مميز');
    const desc = escapeFn(ad.description || '');
    const mediaUrl = ad.mediaUrl || '';
    const targetUrl = ad.targetUrl || '#';
    const type = ad.type || 'banner';

    let adHtml = '';

    if (type === 'video' && mediaUrl) {
      adHtml = `
        <div class="ad-card ad-video" style="border: 1px solid var(--card-border, #ddd); border-radius: 8px; padding: 10px; margin: 10px 0; background: var(--card-bg, #fff);">
          <h4 style="margin: 0 0 8px 0; font-size: 14px;">${title}</h4>
          <video src="${mediaUrl}" controls autoplay muted playsinline style="width: 100%; max-height: 220px; border-radius: 6px;"></video>
          <p style="font-size: 12px; color: var(--text-muted); margin: 6px 0;">${desc}</p>
          <a href="${targetUrl}" target="_blank" rel="noopener" class="btn-small" style="display:inline-block; text-align:center; margin-top:4px;">شاهد المزيد</a>
        </div>
      `;
    } else if ((type === 'app' || type === 'game') && mediaUrl) {
      adHtml = `
        <div class="ad-card ad-app" style="border: 1px solid var(--card-border, #ddd); border-radius: 8px; padding: 12px; margin: 10px 0; background: var(--card-bg, #fff); display: flex; align-items: center; gap: 12px;">
          <img src="${mediaUrl}" alt="${title}" style="width: 60px; height: 60px; border-radius: 12px; object-fit: cover;">
          <div style="flex: 1;">
            <h4 style="margin: 0; font-size: 14px;">${title}</h4>
            <p style="font-size: 11px; color: var(--text-muted); margin: 4px 0;">${desc}</p>
            <a href="${targetUrl}" target="_blank" rel="noopener" class="btn-small" style="display:inline-block; padding: 4px 12px; font-weight: bold;">تثبيت الآن 🚀</a>
          </div>
        </div>
      `;
    } else {
      adHtml = `
        <div class="ad-card ad-banner" style="border: 1px solid var(--card-border, #ddd); border-radius: 8px; padding: 10px; margin: 10px 0; background: var(--card-bg, #fff); text-align: center;">
          <a href="${targetUrl}" target="_blank" rel="noopener" style="text-decoration:none; color: inherit;">
            ${mediaUrl ? `<img src="${mediaUrl}" alt="${title}" style="max-width: 100%; height: auto; border-radius: 6px; margin-bottom: 8px;">` : ''}
            <h4 style="margin: 4px 0; font-size: 14px; color: var(--accent, #0088cc);">${title}</h4>
            <p style="font-size: 12px; color: var(--text-muted); margin: 0;">${desc}</p>
          </a>
        </div>
      `;
    }

    adContainer.innerHTML = adHtml;
  },

  /**
   * تهيئة صفحة التوجيه (Bridge View Initialization)
   */
  initBridgeView: async function(code) {
    window.currentShortCode = code;
    window.bridgeStartTime = Date.now();

    this.generateBrowserFingerprint();
    this.initHumanInteractionTracker();

    const appView = document.getElementById('app-view');
    const bridgeView = document.getElementById('bridge-view');

    if (appView) appView.classList.add('hidden');
    if (bridgeView) bridgeView.classList.remove('hidden');

    const btn = document.getElementById('go-btn') || document.getElementById('btn-go');
    const lang = UI ? UI.currentLang : (window.currentLang || 'ar');
    if (btn) {
      btn.disabled = true;
      btn.innerText = lang === 'ar' ? 'جاري تجهيز الرابط...' : 'Preparing link...';
    }

    try {
      const data = await API.getBridgeLinkInfo(code);
      if (data && (data.targetUrl || data.originalUrl)) {
        window.bridgeDestinationUrl = data.targetUrl || data.originalUrl || null;
        window.bridgeToken = data.token || null;

        if (data.ad) {
          this.renderBridgeAd(data.ad);
        }

        const timerDuration = parseInt(data.timer || data.countdown || 5, 10);
        this.startBridgeTimer(isNaN(timerDuration) ? 5 : timerDuration);
      } else {
        if (UI && typeof UI.showToast === 'function') {
          UI.showToast(lang === 'ar' ? 'تعذر تحميل الرابط المطلوب' : 'Failed to load link');
        }
        if (btn) btn.innerText = lang === 'ar' ? 'خطأ في تحميل الرابط' : 'Link Error';
      }
    } catch (err) {
      console.error("Bridge init error:", err);
    }
  },

  /**
   * العداد الزمني التنازلي للإعلان
   */
  startBridgeTimer: function(seconds) {
    if (window.bridgeTimerInterval) {
      clearInterval(window.bridgeTimerInterval);
    }

    let timeLeft = seconds;
    const timerElem = document.getElementById('timer') || document.getElementById('timer-count');
    const btn = document.getElementById('go-btn') || document.getElementById('btn-go');
    const lang = UI ? UI.currentLang : (window.currentLang || 'ar');

    if (timerElem) timerElem.innerText = timeLeft;
    if (btn) {
      btn.disabled = true;
      btn.innerText = lang === 'ar' ? `يرجى الانتظار (${timeLeft})` : `Please wait (${timeLeft})`;
    }

    window.bridgeTimerInterval = setInterval(() => {
      timeLeft--;
      if (timerElem) timerElem.innerText = timeLeft;

      if (btn && timeLeft > 0) {
        btn.innerText = lang === 'ar' ? `يرجى الانتظار (${timeLeft})` : `Please wait (${timeLeft})`;
      }

      if (timeLeft <= 0) {
        clearInterval(window.bridgeTimerInterval);
        window.bridgeTimerInterval = null;

        if (btn) {
          btn.disabled = false;
          btn.innerText = lang === 'ar' ? 'الانتقال إلى الرابط' : 'Go to Link';
          btn.onclick = (e) => {
            if (e) e.preventDefault();
            this.completeImpression();
          };
        }
      }
    }, 1000);
  },

  /**
   * إرسال إثبات التفاعل والتحويل النهائي بآمان
   */
  completeImpression: async function() {
    const btn = document.getElementById('go-btn') || document.getElementById('btn-go');
    const lang = UI ? UI.currentLang : (window.currentLang || 'ar');

    if (btn) {
      btn.disabled = true;
      btn.innerText = lang === 'ar' ? 'جاري التوجيه...' : 'Redirecting...';
    }

    if (UI && typeof UI.setButtonLoading === 'function') {
      UI.setButtonLoading(btn.id || 'go-btn', true);
    }

    try {
      const durationSec = Math.round((Date.now() - (window.bridgeStartTime || Date.now())) / 1000);

      const payload = {
        shortCode: window.currentShortCode,
        token: window.bridgeToken,
        duration: durationSec,
        interactionProof: window.humanInteractionScore || 1,
        fingerprint: window.visitorFingerprint || this.generateBrowserFingerprint()
      };

      const data = await API.recordBridgeImpression(payload.shortCode, payload.token);
      const finalTarget = data?.targetUrl || window.bridgeDestinationUrl;

      if (finalTarget) {
        window.location.href = finalTarget;
        return;
      }

      if (window.bridgeDestinationUrl) {
        window.location.href = window.bridgeDestinationUrl;
      } else {
        if (UI && typeof UI.showToast === 'function') {
          UI.showToast(lang === 'ar' ? 'حدث خطأ أثناء التوجيه للرابط' : 'Redirection error');
        }
      }
    } catch (e) {
      console.error("Complete impression error:", e);
      if (window.bridgeDestinationUrl) {
        window.location.href = window.bridgeDestinationUrl;
      }
    }
  }
};

window.ShortenerModule = ShortenerModule;
window.generateBrowserFingerprint = ShortenerModule.generateBrowserFingerprint.bind(ShortenerModule);
window.initHumanInteractionTracker = ShortenerModule.initHumanInteractionTracker.bind(ShortenerModule);
window.formatShortUrl = ShortenerModule.formatShortUrl.bind(ShortenerModule);
window.fetchUserLinks = ShortenerModule.fetchUserLinks.bind(ShortenerModule);
window.handleShortenClick = ShortenerModule.handleShortenClick.bind(ShortenerModule);
window.renderUserLinks = ShortenerModule.renderUserLinks.bind(ShortenerModule);
window.filterUserLinks = ShortenerModule.filterUserLinks.bind(ShortenerModule);
window.deleteLink = ShortenerModule.deleteLink.bind(ShortenerModule);
window.renderBridgeAd = ShortenerModule.renderBridgeAd.bind(ShortenerModule);
window.initBridgeView = ShortenerModule.initBridgeView.bind(ShortenerModule);
window.startBridgeTimer = ShortenerModule.startBridgeTimer.bind(ShortenerModule);
window.completeImpression = ShortenerModule.completeImpression.bind(ShortenerModule);

export default ShortenerModule;
