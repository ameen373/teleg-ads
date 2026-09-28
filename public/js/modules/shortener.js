window.rawUserLinksCache = window.rawUserLinksCache || [];
window.bridgeDestinationUrl = null;
window.currentShortCode = null;
window.bridgeToken = null;
window.bridgeStartTime = null;
window.bridgeTimerInterval = null;

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
window.formatShortUrl = formatShortUrl;

async function fetchUserLinks() {
  const linksContainer = document.getElementById('links-list');
  if (linksContainer && (!window.rawUserLinksCache || window.rawUserLinksCache.length === 0)) {
    linksContainer.innerHTML = `<div style="text-align:center; padding: 10px;"><div class="spinner"></div></div>`;
  }
  
  try {
    const res = await window.safeFetch('/api/links');
    if (res) {
      const data = await res.json().catch(() => null);
      if (data) {
        const links = Array.isArray(data) ? data : (data.links || data.data || []);
        window.rawUserLinksCache = links;
        renderUserLinks(window.rawUserLinksCache);
        return window.rawUserLinksCache;
      }
    }
  } catch (err) {
    console.error("Error fetching user links:", err);
  }
  return [];
}
window.fetchUserLinks = fetchUserLinks;

async function handleShortenClick(e) {
  if (e) e.preventDefault();
  const titleInput = document.getElementById('link-title');
  const urlInput = document.getElementById('link-url');

  if (!urlInput) return;

  const title = titleInput ? titleInput.value.trim() : '';
  let url = urlInput.value.trim();
  const lang = window.currentLang || 'ar';
  const i18n = window.i18n || {};

  if (!url) {
    if (typeof window.showToast === 'function') window.showToast(lang === 'ar' ? 'يرجى إدخال الرابط الأصلي' : 'Please enter original URL');
    return;
  }

  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url;
  }

  if (typeof window.setButtonLoading === 'function') window.setButtonLoading('btn-create-link', true);

  try {
    const payload = {
      userId: window.currentUserTelegramId,
      telegramId: window.currentUserTelegramId,
      title: title || 'Untitled Link',
      targetUrl: url,
      url: url,
      originalUrl: url
    };

    const res = await window.safeFetch('/api/shorten', {
      method: 'POST',
      body: payload
    });

    if (!res) {
      if (typeof window.setButtonLoading === 'function') window.setButtonLoading('btn-create-link', false);
      return;
    }

    const data = await res.json().catch(() => ({}));

    if (res.ok && (data.success || data.link || data.shortCode)) {
      if (typeof window.showToast === 'function') {
        window.showToast(i18n[lang]?.link_success_msg || (lang === 'ar' ? 'تم اختصار الرابط بنجاح!' : 'Link shortened successfully!'));
      }
      if (titleInput) titleInput.value = '';
      urlInput.value = '';
      
      const newLink = data.link || {
        _id: data._id || data.id || ('link_' + Date.now()),
        title: title || data.title || 'Untitled Link',
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
      if (typeof window.loadUserData === 'function') await window.loadUserData();
      await fetchUserLinks();
    } else {
      const errorMsg = data.error || data.message || (lang === 'ar' ? 'فشل إنشاء الرابط المختصر' : 'Failed to create short link');
      if (typeof window.showToast === 'function') window.showToast(errorMsg);
    }
  } catch (err) {
    console.error("Shorten Link Error:", err);
    if (typeof window.showToast === 'function') {
      window.showToast(err.message || (lang === 'ar' ? 'حدث خطأ أثناء اختصار الرابط' : 'An error occurred while shortening link'));
    }
  } finally {
    if (typeof window.setButtonLoading === 'function') window.setButtonLoading('btn-create-link', false);
  }
}
window.handleShortenClick = handleShortenClick;

function renderUserLinks(links) {
  const container = document.getElementById('links-list');
  if (!container) return;

  const lang = window.currentLang || 'ar';
  const i18n = window.i18n || {};

  if (!links || links.length === 0) {
    container.innerHTML = `<p style="text-align:center; color: var(--text-muted); margin: 12px 0;">${lang === 'ar' ? 'لا توجد روابط مختصرة بعد.' : 'No shortened links found.'}</p>`;
    return;
  }

  container.innerHTML = links.map(link => {
    const formattedUrl = formatShortUrl(link);
    const title = window.escapeHTML ? window.escapeHTML(link.title || link.shortCode || 'Untitled Link') : (link.title || link.shortCode || 'Untitled Link');
    const originalUrl = window.escapeHTML ? window.escapeHTML(link.originalUrl || link.targetUrl || link.url || '') : (link.originalUrl || link.targetUrl || link.url || '');
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
            <button class="btn-small" onclick="copyToClipboard('${formattedUrl}')">${i18n[lang]?.btn_copy || (lang === 'ar' ? 'نسخ' : 'Copy')}</button>
            <button class="btn-small btn-danger" onclick="deleteLink('${linkId}')">${lang === 'ar' ? 'حذف' : 'Delete'}</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}
window.renderUserLinks = renderUserLinks;

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
window.filterUserLinks = filterUserLinks;

async function deleteLink(linkId) {
  const lang = window.currentLang || 'ar';
  if (!confirm(lang === 'ar' ? 'هل أنت تأكد من حذف هذا الرابط؟' : 'Are you sure you want to delete this link?')) return;
  
  try {
    const res = await window.safeFetch(`/api/links/${linkId}`, { method: 'DELETE' });
    if (res) {
      const data = await res.json().catch(() => ({}));
      if (res.ok && (data.success || data.message)) {
        if (typeof window.showToast === 'function') window.showToast(lang === 'ar' ? 'تم حذف الرابط بنجاح' : 'Link deleted successfully');
        if (typeof window.loadUserData === 'function') await window.loadUserData();
        await fetchUserLinks();
      } else {
        if (typeof window.showToast === 'function') window.showToast(data.error || data.message || (lang === 'ar' ? 'فشل حذف الرابط' : 'Failed to delete link'));
      }
    }
  } catch (err) {
    if (typeof window.showToast === 'function') window.showToast(err.message || (lang === 'ar' ? 'خطأ في الشبكة' : 'Network error'));
  }
}
window.deleteLink = deleteLink;

async function initBridgeView(code) {
  window.currentShortCode = code;
  window.bridgeStartTime = Date.now();
  
  const appView = document.getElementById('app-view');
  const bridgeView = document.getElementById('bridge-view');

  if (appView) appView.classList.add('hidden');
  if (bridgeView) bridgeView.classList.remove('hidden');

  // إعداد زر التوجيه أولاً بحالة تعطيل أثناء الانتظار
  const btn = document.getElementById('go-btn') || document.getElementById('btn-go');
  const lang = window.currentLang || 'ar';
  if (btn) {
    btn.disabled = true;
    btn.innerText = lang === 'ar' ? 'يرجى الانتظار...' : 'Please wait...';
  }

  // استدعاء الإعلانات وتسجيل الأرباح فوراً في الخلفية عند التحميل
  if (typeof window.triggerBridgeAds === 'function') {
    window.triggerBridgeAds('load').catch(err => console.error("Ad trigger on load error:", err));
  }

  try {
    const res = await window.safeFetch(`/api/bridge/${code}`);
    if (res && res.ok) {
      const data = await res.json().catch(() => ({}));
      window.bridgeDestinationUrl = data.targetUrl || data.originalUrl || '/';
      window.bridgeToken = data.token || null;
      
      const timerDuration = parseInt(data.timer || data.countdown || 5, 10);
      startBridgeTimer(isNaN(timerDuration) ? 5 : timerDuration);
    } else {
      if (typeof window.showToast === 'function') window.showToast(lang === 'ar' ? 'تعذر تحميل الرابط المطلوب' : 'Failed to load link');
      if (btn) btn.innerText = lang === 'ar' ? 'خطأ في تحميل الرابط' : 'Link Error';
    }
  } catch (err) {
    console.error("Bridge init error:", err);
  }
}
window.initBridgeView = initBridgeView;

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
window.startBridgeTimer = startBridgeTimer;

async function completeImpression() {
  if (!window.bridgeDestinationUrl) return;

  const btn = document.getElementById('go-btn') || document.getElementById('btn-go');
  const lang = window.currentLang || 'ar';

  if (btn) {
    btn.disabled = true;
    btn.innerText = lang === 'ar' ? 'جاري التوجيه...' : 'Redirecting...';
  }

  if (typeof window.setButtonLoading === 'function') {
    window.setButtonLoading(btn.id || 'go-btn', true);
  }

  // تسجيل النقر والأرباح فوراً في الخلفية عند الضغط على الزر
  if (typeof window.triggerBridgeAds === 'function') {
    window.triggerBridgeAds('click').catch(err => console.error("Ad trigger on click error:", err));
  }

  try {
    const durationSec = Math.round((Date.now() - (window.bridgeStartTime || Date.now())) / 1000);
    
    // استدعاء تسجيل اكتمال المشاهدة بدون تعليق انتقال المستخدم
    window.safeFetch('/api/bridge/complete', {
      method: 'POST',
      body: {
        shortCode: window.currentShortCode,
        token: window.bridgeToken,
        duration: durationSec
      }
    }).catch(e => console.error("Bridge complete fetch error:", e));

  } catch (e) {
    console.error("Complete impression error:", e);
  } finally {
    // توجيه المستخدم مباشرة بعد إرسال الطلب
    setTimeout(() => {
      window.location.href = window.bridgeDestinationUrl;
    }, 150);
  }
}
window.completeImpression = completeImpression;
