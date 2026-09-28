// وحدة اختصار الروابط وعرض الجسر والتحقق من التفاعل البشري

(function () {
  window.rawUserLinksCache = window.rawUserLinksCache || [];
  window.bridgeDestinationUrl = null;
  window.currentShortCode = null;
  window.bridgeToken = null;
  window.bridgeStartTime = null;
  window.bridgeTimerInterval = null;
  window.humanInteractionScore = 0;
  window.visitorFingerprint = null;

  /**
   * جمع بصمة المتصفح الأساسية (Canvas Fingerprint)
   */
  function generateBrowserFingerprint() {
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
  }

  /**
   * كشف التفاعل البشري الحقيقي (Human Interaction Tracker)
   */
  function initHumanInteractionTracker() {
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
  }

  /**
   * تنسيق الرابط المختصر بشكل قياسي
   */
  function formatShortUrl(link) {
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
  }

  /**
   * نسخ الرابط المختصر إلى الحافظة
   */
  async function copyToClipboard(text) {
    if (!text) return;
    const lang = window.currentLang || 'ar';
    const successMsg = lang === 'ar' ? 'تم نسخ الرابط بنجاح!' : 'Link copied to clipboard!';
    
    const showToast = (msg, typeMsg = 'info') => {
      if (window.UI && typeof window.UI.showToast === 'function') window.UI.showToast(msg, typeMsg);
      else if (typeof window.showToast === 'function') window.showToast(msg);
      else alert(msg);
    };

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        textArea.remove();
      }
      showToast(successMsg, 'success');
    } catch (err) {
      console.error('Copy to clipboard failed:', err);
      showToast(lang === 'ar' ? 'فشل نسخ الرابط' : 'Failed to copy link', 'error');
    }
  }

  /**
   * جلب قائمة روابط المستخدم
   */
  async function fetchUserLinks() {
    const linksContainer = document.getElementById('links-list');
    if (linksContainer && (!window.rawUserLinksCache || window.rawUserLinksCache.length === 0)) {
      linksContainer.innerHTML = `<div style="text-align:center; padding: 10px;"><div class="spinner"></div></div>`;
    }

    try {
      let data = null;
      if (window.API && typeof window.API.get === 'function') {
        data = await window.API.get('/api/links');
      } else if (typeof window.safeFetch === 'function') {
        const res = await window.safeFetch('/api/links');
        if (res) data = await res.json().catch(() => null);
      }

      if (data) {
        const links = Array.isArray(data) ? data : (data.links || data.data || []);
        window.rawUserLinksCache = links;
        renderUserLinks(window.rawUserLinksCache);
        return window.rawUserLinksCache;
      }
    } catch (err) {
      console.error("Error fetching user links:", err);
    }
    return [];
  }

  /**
   * اختصار رابط جديد (مع دعم الرابط المخصص Custom Alias)
   */
  async function handleShortenClick(e) {
    if (e) e.preventDefault();
    const titleInput = document.getElementById('link-title');
    const urlInput = document.getElementById('link-url');
    const aliasInput = document.getElementById('link-alias');

    if (!urlInput) return;

    const title = titleInput ? titleInput.value.trim() : '';
    let url = urlInput.value.trim();
    const alias = aliasInput ? aliasInput.value.trim() : '';
    const lang = window.currentLang || 'ar';

    const showToast = (msg, typeMsg = 'info') => {
      if (window.UI && typeof window.UI.showToast === 'function') window.UI.showToast(msg, typeMsg);
      else if (typeof window.showToast === 'function') window.showToast(msg);
      else alert(msg);
    };

    const setButtonLoading = (btnId, isLoading) => {
      if (window.UI && typeof window.UI.setButtonLoading === 'function') window.UI.setButtonLoading(btnId, isLoading);
      else if (typeof window.setButtonLoading === 'function') window.setButtonLoading(btnId, isLoading);
    };

    if (!url) {
      showToast(lang === 'ar' ? 'يرجى إدخال الرابط الأصلي' : 'Please enter original URL', 'error');
      return;
    }

    if (!/^https?:\/\//i.test(url)) {
      url = 'https://' + url;
    }

    setButtonLoading('btn-create-link', true);

    const payload = {
      userId: window.currentUserTelegramId,
      telegramId: window.currentUserTelegramId,
      title: title || 'رابط مختصر',
      targetUrl: url,
      url: url,
      originalUrl: url,
      customAlias: alias || undefined
    };

    try {
      let data = null;
      if (window.API && typeof window.API.post === 'function') {
        data = await window.API.post('/api/shorten', payload);
      } else if (typeof window.safeFetch === 'function') {
        const res = await window.safeFetch('/api/shorten', { method: 'POST', body: payload });
        if (res) data = await res.json().catch(() => ({}));
      }

      if (data && (data.success || data.link || data.shortCode)) {
        showToast(lang === 'ar' ? 'تم اختصار الرابط بنجاح!' : 'Link shortened successfully!', 'success');
        if (titleInput) titleInput.value = '';
        if (aliasInput) aliasInput.value = '';
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

        renderUserLinks(window.rawUserLinksCache);
        if (window.WalletModule && typeof window.WalletModule.loadUserData === 'function') {
          await window.WalletModule.loadUserData();
        } else if (typeof window.loadUserData === 'function') {
          await window.loadUserData();
        }
      } else {
        const errorMsg = (data && (data.error || data.message)) || (lang === 'ar' ? 'فشل إنشاء الرابط المختصر' : 'Failed to create short link');
        showToast(errorMsg, 'error');
      }
    } catch (err) {
      console.error("Shorten Link Error:", err);
      showToast(err.message || (lang === 'ar' ? 'حدث خطأ أثناء اختصار الرابط' : 'An error occurred while shortening link'), 'error');
    } finally {
      setButtonLoading('btn-create-link', false);
    }
  }

  /**
   * عرض قائمة الروابط في الواجهة
   */
  function renderUserLinks(links) {
    const container = document.getElementById('links-list');
    if (!container) return;

    const lang = window.currentLang || 'ar';
    const escapeHTML = (str) => {
      if (window.UI && typeof window.UI.escapeHTML === 'function') return window.UI.escapeHTML(str);
      return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    };

    if (!links || links.length === 0) {
      container.innerHTML = `<p style="text-align:center; color: var(--text-muted); margin: 12px 0;">${lang === 'ar' ? 'لا توجد روابط مختصرة بعد.' : 'No shortened links found.'}</p>`;
      return;
    }

    container.innerHTML = links.map(link => {
      const formattedUrl = formatShortUrl(link);
      const title = escapeHTML(link.title || link.shortCode || 'Untitled Link');
      const originalUrl = escapeHTML(link.originalUrl || link.targetUrl || link.url || '');
      const clicks = link.views || link.clicks || 0;
      const validImp = link.validImpressions || 0;
      const earnings = Number(link.totalEarnings || 0).toFixed(4);
      const linkId = link._id || link.id || link.shortCode;

      return `
        <div class="link-item" style="background: rgba(15, 23, 42, 0.6); border: 1px solid var(--card-border); border-radius: 10px; padding: 12px; margin-bottom: 10px;">
          <div class="link-header" style="display:flex; justify-content:space-between; align-items:center;">
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
            <div class="link-actions" style="display:flex; gap:6px;">
              <button class="btn-small" onclick="copyToClipboard('${formattedUrl}')">${lang === 'ar' ? 'نسخ' : 'Copy'}</button>
              <button class="btn-small btn-danger" onclick="deleteLink('${linkId}')">${lang === 'ar' ? 'حذف' : 'Delete'}</button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  /**
   * تصفية قائمة الروابط
   */
  function filterUserLinks(term) {
    if (!window.rawUserLinksCache) return;
    const lower = (term || '').toLowerCase().trim();
    if (!lower) {
      renderUserLinks(window.rawUserLinksCache);
      return;
    }
    const filtered = window.rawUserLinksCache.filter(l => 
      (l.title && l.title.toLowerCase().includes(lower)) ||
      (l.originalUrl && l.originalUrl.toLowerCase().includes(lower)) ||
      (l.targetUrl && l.targetUrl.toLowerCase().includes(lower)) ||
      (l.shortCode && l.shortCode.toLowerCase().includes(lower))
    );
    renderUserLinks(filtered);
  }

  /**
   * حذف رابط
   */
  async function deleteLink(linkId) {
    const lang = window.currentLang || 'ar';
    const showToast = (msg, typeMsg = 'info') => {
      if (window.UI && typeof window.UI.showToast === 'function') window.UI.showToast(msg, typeMsg);
      else if (typeof window.showToast === 'function') window.showToast(msg);
      else alert(msg);
    };

    if (!confirm(lang === 'ar' ? 'هل أنت تأكد من حذف هذا الرابط؟' : 'Are you sure you want to delete this link?')) return;

    try {
      let resOk = false;
      if (window.API && typeof window.API.delete === 'function') {
        const res = await window.API.delete(`/api/links/${linkId}`);
        resOk = !!(res && (res.success || res.ok));
      } else if (typeof window.safeFetch === 'function') {
        const res = await window.safeFetch(`/api/links/${linkId}`, { method: 'DELETE' });
        resOk = !!(res && res.ok);
      }

      if (resOk) {
        showToast(lang === 'ar' ? 'تم حذف الرابط بنجاح' : 'Link deleted successfully', 'success');
        await fetchUserLinks();
        if (window.WalletModule && typeof window.WalletModule.loadUserData === 'function') {
          await window.WalletModule.loadUserData();
        } else if (typeof window.loadUserData === 'function') {
          await window.loadUserData();
        }
      } else {
        showToast(lang === 'ar' ? 'فشل حذف الرابط' : 'Failed to delete link', 'error');
      }
    } catch (err) {
      showToast(err.message || (lang === 'ar' ? 'خطأ أثناء حذف الرابط' : 'Error deleting link'), 'error');
    }
  }

  /**
   * عرض الإعلان على صفحة التوجيه (Bridge View)
   */
  function renderBridgeAd(ad) {
    const adContainer = document.getElementById('bridge-ad-space') || document.getElementById('ad-container');
    if (!adContainer || !ad) return;

    const escapeHTML = (str) => {
      if (window.UI && typeof window.UI.escapeHTML === 'function') return window.UI.escapeHTML(str);
      return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    };

    const title = escapeHTML(ad.title || 'إعلان مميز');
    const desc = escapeHTML(ad.description || '');
    const mediaUrl = ad.mediaUrl || '';
    const targetUrl = ad.targetUrl || '#';
    const type = ad.type || 'banner';

    let adHtml = '';

    if (type === 'video' && mediaUrl) {
      adHtml = `
        <div class="ad-card ad-video" style="border: 1px solid var(--card-border); border-radius: 8px; padding: 10px; margin: 10px 0; background: rgba(15, 23, 42, 0.8);">
          <h4 style="margin: 0 0 8px 0; font-size: 14px; color: var(--text);">${title}</h4>
          <video src="${mediaUrl}" controls autoplay muted playsinline style="width: 100%; max-height: 220px; border-radius: 6px;"></video>
          <p style="font-size: 12px; color: var(--text-muted); margin: 6px 0;">${desc}</p>
          <a href="${targetUrl}" target="_blank" rel="noopener" onclick="recordAdClick('${ad._id || ad.id}')" class="btn-small" style="display:inline-block; text-align:center; margin-top:4px;">شاهد المزيد</a>
        </div>
      `;
    } else if ((type === 'app' || type === 'game') && mediaUrl) {
      adHtml = `
        <div class="ad-card ad-app" style="border: 1px solid var(--card-border); border-radius: 8px; padding: 12px; margin: 10px 0; background: rgba(15, 23, 42, 0.8); display: flex; align-items: center; gap: 12px;">
          <img src="${mediaUrl}" alt="${title}" style="width: 60px; height: 60px; border-radius: 12px; object-fit: cover;">
          <div style="flex: 1;">
            <h4 style="margin: 0; font-size: 14px; color: var(--text);">${title}</h4>
            <p style="font-size: 11px; color: var(--text-muted); margin: 4px 0;">${desc}</p>
            <a href="${targetUrl}" target="_blank" rel="noopener" onclick="recordAdClick('${ad._id || ad.id}')" class="btn-small" style="display:inline-block; padding: 4px 12px; font-weight: bold;">تثبيت الآن 🚀</a>
          </div>
        </div>
      `;
    } else {
      adHtml = `
        <div class="ad-card ad-banner" style="border: 1px solid var(--card-border); border-radius: 8px; padding: 10px; margin: 10px 0; background: rgba(15, 23, 42, 0.8); text-align: center;">
          <a href="${targetUrl}" target="_blank" rel="noopener" onclick="recordAdClick('${ad._id || ad.id}')" style="text-decoration:none; color: inherit;">
            ${mediaUrl ? `<img src="${mediaUrl}" alt="${title}" style="max-width: 100%; height: auto; border-radius: 6px; margin-bottom: 8px;">` : ''}
            <h4 style="margin: 4px 0; font-size: 14px; color: var(--accent);">${title}</h4>
            <p style="font-size: 12px; color: var(--text-muted); margin: 0;">${desc}</p>
          </a>
        </div>
      `;
    }

    adContainer.innerHTML = adHtml;
  }

  /**
   * تهيئة واجهة الجسر للرابط
   */
  async function initBridgeView(code) {
    window.currentShortCode = code;
    window.bridgeStartTime = Date.now();

    generateBrowserFingerprint();
    initHumanInteractionTracker();

    const appView = document.getElementById('app-view');
    const bridgeView = document.getElementById('bridge-view');

    if (appView) appView.classList.add('hidden');
    if (bridgeView) bridgeView.classList.remove('hidden');

    const btn = document.getElementById('go-btn') || document.getElementById('btn-go');
    const lang = window.currentLang || 'ar';
    if (btn) {
      btn.disabled = true;
      btn.innerText = lang === 'ar' ? 'جاري تجهيز الرابط...' : 'Preparing link...';
    }

    try {
      let data = null;
      if (window.API && typeof window.API.get === 'function') {
        data = await window.API.get(`/api/bridge/${code}`);
      } else if (typeof window.safeFetch === 'function') {
        const res = await window.safeFetch(`/api/bridge/${code}`);
        if (res && res.ok) data = await res.json().catch(() => ({}));
      }

      if (data) {
        window.bridgeDestinationUrl = data.targetUrl || data.originalUrl || null;
        window.bridgeToken = data.token || null;

        if (data.ad) {
          renderBridgeAd(data.ad);
        }

        const timerDuration = parseInt(data.timer || data.countdown || 5, 10);
        startBridgeTimer(isNaN(timerDuration) ? 5 : timerDuration);
      } else {
        const showToast = (msg) => {
          if (window.UI && typeof window.UI.showToast === 'function') window.UI.showToast(msg, 'error');
          else if (typeof window.showToast === 'function') window.showToast(msg);
        };
        showToast(lang === 'ar' ? 'تعذر تحميل الرابط المطلوب' : 'Failed to load link');
        if (btn) btn.innerText = lang === 'ar' ? 'خطأ في تحميل الرابط' : 'Link Error';
      }
    } catch (err) {
      console.error("Bridge init error:", err);
    }
  }

  /**
   * العداد الزمني التنازلي للإعلان
   */
  function startBridgeTimer(seconds) {
    if (window.bridgeTimerInterval) {
      clearInterval(window.bridgeTimerInterval);
    }

    let timeLeft = seconds;
    const timerElem = document.getElementById('timer') || document.getElementById('timer-count');
    const btn = document.getElementById('go-btn') || document.getElementById('btn-go');
    const lang = window.currentLang || 'ar';

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
          btn.onclick = function(e) {
            if (e) e.preventDefault();
            completeImpression();
          };
        }
      }
    }, 1000);
  }

  /**
   * تأكيد المشاهدة والتوجيه النهائي
   */
  async function completeImpression() {
    const btn = document.getElementById('go-btn') || document.getElementById('btn-go');
    const lang = window.currentLang || 'ar';

    const setButtonLoading = (btnId, isLoading) => {
      if (window.UI && typeof window.UI.setButtonLoading === 'function') window.UI.setButtonLoading(btnId, isLoading);
      else if (typeof window.setButtonLoading === 'function') window.setButtonLoading(btnId, isLoading);
    };

    if (btn) {
      btn.disabled = true;
      btn.innerText = lang === 'ar' ? 'جاري التوجيه...' : 'Redirecting...';
    }

    setButtonLoading(btn ? btn.id : 'go-btn', true);

    try {
      const durationSec = Math.round((Date.now() - (window.bridgeStartTime || Date.now())) / 1000);

      const payload = {
        shortCode: window.currentShortCode,
        token: window.bridgeToken,
        duration: durationSec,
        interactionProof: window.humanInteractionScore || 1,
        fingerprint: window.visitorFingerprint || generateBrowserFingerprint()
      };

      let data = null;
      if (window.API && typeof window.API.post === 'function') {
        data = await window.API.post('/api/bridge/complete', payload);
      } else if (typeof window.safeFetch === 'function') {
        const res = await window.safeFetch('/api/bridge/complete', { method: 'POST', body: payload });
        if (res && res.ok) data = await res.json().catch(() => ({}));
      }

      const finalTarget = (data && data.targetUrl) || window.bridgeDestinationUrl;

      if (finalTarget) {
        window.location.href = finalTarget;
        return;
      }

      if (window.bridgeDestinationUrl) {
        window.location.href = window.bridgeDestinationUrl;
      } else {
        const showToast = (msg) => {
          if (window.UI && typeof window.UI.showToast === 'function') window.UI.showToast(msg, 'error');
          else if (typeof window.showToast === 'function') window.showToast(msg);
        };
        showToast(lang === 'ar' ? 'حدث خطأ أثناء التوجيه للرابط' : 'Redirection error');
      }
    } catch (e) {
      console.error("Complete impression error:", e);
      if (window.bridgeDestinationUrl) {
        window.location.href = window.bridgeDestinationUrl;
      }
    }
  }

  // تصدير الكائن العام والمكونات للواجهة
  const ShortenerModule = {
    generateBrowserFingerprint,
    initHumanInteractionTracker,
    formatShortUrl,
    copyToClipboard,
    fetchUserLinks,
    handleShortenClick,
    renderUserLinks,
    filterUserLinks,
    deleteLink,
    renderBridgeAd,
    initBridgeView,
    startBridgeTimer,
    completeImpression
  };

  window.ShortenerModule = ShortenerModule;
  window.generateBrowserFingerprint = generateBrowserFingerprint;
  window.initHumanInteractionTracker = initHumanInteractionTracker;
  window.formatShortUrl = formatShortUrl;
  window.copyToClipboard = copyToClipboard;
  window.fetchUserLinks = fetchUserLinks;
  window.handleShortenClick = handleShortenClick;
  window.renderUserLinks = renderUserLinks;
  window.filterUserLinks = filterUserLinks;
  window.deleteLink = deleteLink;
  window.renderBridgeAd = renderBridgeAd;
  window.initBridgeView = initBridgeView;
  window.startBridgeTimer = startBridgeTimer;
  window.completeImpression = completeImpression;
})();
