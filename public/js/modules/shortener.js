window.TelegaApp = window.TelegaApp || {};

window.TelegaApp.shortener = {
  // تهيئة الأحداث وجلب الروابط
  init: function() {
    this.bindEvents();
    this.loadUserLinks();
  },

  // ربط الأحداث بنماذج وأزرار الواجهة
  bindEvents: function() {
    // نموذج اختصار الرابط الأساسي
    const shortenForm = document.getElementById('shorten-form');
    if (shortenForm) {
      shortenForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.createLink();
      });
    }

    // نموذج التقصير في الجداول أو النوافذ الأخرى
    const longUrlForm = document.getElementById('long-url-form');
    if (longUrlForm) {
      longUrlForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.createLink('longUrlInput');
      });
    }

    // زر نسخ الرابط المختصر الناتج
    const copyBtn = document.getElementById('copy-link-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        const outputSpan = document.getElementById('short-url-output');
        if (outputSpan && outputSpan.textContent) {
          this.copyText(outputSpan.textContent);
        }
      });
    }
  },

  // نظام إشعارات موحد
  notify: function(message, isError = false) {
    if (window.TelegaApp?.ui?.showAlert) {
      window.TelegaApp.ui.showAlert(message, isError);
    } else if (window.TelegaApp?.ui?.showToast) {
      window.TelegaApp.ui.showToast(message);
    } else if (window.UI?.notify) {
      window.UI.notify(message, isError);
    } else {
      alert(message);
    }
  },

  // دالة موحدة لطلبات الـ API
  apiRequest: async function(endpoint, method = 'GET', data = null) {
    if (window.TelegaApp?.api?.request) {
      try {
        return await window.TelegaApp.api.request(endpoint, {
          method: method,
          headers: { 'Content-Type': 'application/json' },
          ...(data ? { body: JSON.stringify(data) } : {})
        });
      } catch (e) {
        return await window.TelegaApp.api.request(endpoint, method, data);
      }
    } else if (window.API) {
      if (endpoint.includes('create')) return await window.API.shorten(data?.originalUrl);
      if (endpoint.includes('my-links') || endpoint === '/api/links') return await window.API.getShortLinks();
    }
    throw new Error('تعذر الاتصال بخدمة الـ API');
  },

  // إنشاء رابط مختصر جديد
  createLink: async function(inputId = null) {
    const inputEl = document.getElementById(inputId) || 
                    document.getElementById('short-url-input') || 
                    document.getElementById('target-url-input') || 
                    document.getElementById('longUrlInput');

    if (!inputEl) return;

    const originalUrl = inputEl.value.trim();
    if (!originalUrl) {
      this.notify(window.TelegaApp?.i18n?.t('enter_valid_url') || 'من فضلك أدخل رابط صحيح', true);
      return;
    }

    try {
      const telegramId = window.TelegaApp?.user?.telegramId;
      const payload = { originalUrl };
      if (telegramId) payload.telegramId = telegramId;

      const res = await this.apiRequest('/api/links/create', 'POST', payload);

      if (res && res.success) {
        inputEl.value = '';

        const link = res.link || res;
        const shortCode = link.shortCode || link.shortId;
        const domain = window.location.origin;
        const botUsername = window.TelegaApp?.config?.botUsername;
        
        const fullShortUrl = botUsername 
          ? `https://t.me/${botUsername}?start=${shortCode}`
          : `${domain}/s/${shortCode}`;

        const resultBox = document.getElementById('shortened-result');
        const outputSpan = document.getElementById('short-url-output');
        if (outputSpan) outputSpan.textContent = fullShortUrl;
        if (resultBox) resultBox.classList.remove('hidden');

        this.notify(window.TelegaApp?.i18n?.t('link_created') || 'تم إنشاء الرابط بنجاح!');
        await this.loadUserLinks();
      } else {
        this.notify(res?.message || 'حدث خطأ أثناء إنشاء الرابط', true);
      }
    } catch (err) {
      this.notify(err.message || 'خطأ في الاتصال بالخادم', true);
    }
  },

  // اسم مستعار لتقصير الرابط
  shorten: function(e) {
    if (e && e.preventDefault) e.preventDefault();
    return this.createLink();
  },

  // جلب روابط المستخدم من الخادم
  loadUserLinks: async function() {
    try {
      const telegramId = window.TelegaApp?.user?.telegramId;
      const endpoint = telegramId ? `/api/links?telegramId=${telegramId}` : '/api/links';
      
      let res;
      try {
        res = await this.apiRequest(endpoint, 'GET');
      } catch (err) {
        res = await this.apiRequest('/api/shortener/my-links', 'GET');
      }

      if (res && res.success && Array.isArray(res.links)) {
        this.renderLinks(res.links);
      } else if (res && Array.isArray(res.links)) {
        this.renderLinks(res.links);
      } else {
        this.renderEmptyState();
      }
    } catch (err) {
      console.error('Failed to load user links:', err);
    }
  },

  // أسماء مستعارة للتوافق
  loadMyLinks: function() { return this.loadUserLinks(); },
  loadLinks: function() { return this.loadUserLinks(); },

  // عرض الروابط ديناميكياً بناءً على عناصر الصفحة المتوفرة
  renderLinks: function(links) {
    if (!links || links.length === 0) {
      this.renderEmptyState();
      return;
    }

    const domain = window.location.origin;
    const botUsername = window.TelegaApp?.config?.botUsername;

    // 1. العرض في حاوية كروت (links-container أو links-list)
    const container = document.getElementById('links-container') || document.getElementById('links-list');
    if (container) {
      container.innerHTML = '';
      links.forEach(link => {
        const shortCode = link.shortCode || link.shortId;
        const fullUrl = botUsername 
          ? `https://t.me/${botUsername}?start=${shortCode}` 
          : `${domain}/s/${shortCode}`;

        const viewsText = window.TelegaApp?.i18n?.t('views') || 'الزيارات';
        const clicksText = window.TelegaApp?.i18n?.t('clicks') || 'النقرات';
        const earningsText = window.TelegaApp?.i18n?.t('earnings') || 'الربح';
        const copyTextBtn = window.TelegaApp?.i18n?.t('copy') || 'نسخ';
        const statsText = window.TelegaApp?.i18n?.t('stats') || 'إحصائيات';
        const deleteText = window.TelegaApp?.i18n?.t('delete') || 'حذف';

        const views = link.views ?? link.clicks ?? 0;
        const clicks = link.clicks ?? 0;
        const earnings = Number(link.earnings || 0).toFixed(4);
        const truncatedOriginal = link.originalUrl 
          ? (link.originalUrl.length > 40 ? link.originalUrl.substring(0, 40) + '...' : link.originalUrl) 
          : '';

        const div = document.createElement('div');
        div.className = 'link-item list-item';
        div.innerHTML = `
          <div class="list-item-info">
            <span class="list-item-title short-url">${fullUrl}</span>
            <span class="list-item-sub" style="font-size:0.8rem; color:#94a3b8; margin:4px 0;">${truncatedOriginal}</span>
            <div style="font-size:0.85rem; margin-bottom: 6px;">
              ${viewsText}: ${views} | ${clicksText}: ${clicks} | ${earningsText}: $${earnings}
            </div>
          </div>
          <div class="link-actions" style="display:flex; gap:6px; align-items:center;">
            <button class="btn-small icon-btn" onclick="TelegaApp.shortener.copyText('${fullUrl}')">${copyTextBtn}</button>
            <button class="btn-small" onclick="TelegaApp.shortener.viewStats('${shortCode}')">${statsText}</button>
            <button class="btn-small btn-danger" onclick="TelegaApp.shortener.deleteLink('${shortCode}')">${deleteText}</button>
          </div>
        `;
        container.appendChild(div);
      });
    }

    // 2. العرض في جدول (shortenerTableBody)
    const tbody = document.getElementById('shortenerTableBody');
    if (tbody) {
      tbody.innerHTML = '';
      links.forEach(l => {
        const shortCode = l.shortCode || l.shortId;
        const fullShortUrl = `${domain}/s/${shortCode}`;
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td style="max-width:150px; overflow:hidden; text-overflow:ellipsis;" title="${l.originalUrl}">${l.originalUrl}</td>
          <td><a href="${fullShortUrl}" target="_blank" style="color:var(--primary);">${fullShortUrl}</a></td>
          <td>${l.clicks || 0}</td>
          <td>
            <button class="btn btn-secondary" style="padding:4px 8px; width:auto;" onclick="TelegaApp.shortener.copyText('${fullShortUrl}')">
              ${window.TelegaApp?.i18n?.t('copy') || 'نسخ'}
            </button>
          </td>
        `;
        tbody.appendChild(tr);
      });
    }
  },

  // عرض الحالة الفارغة عند عدم وجود روابط
  renderEmptyState: function() {
    const noLinksMsg = window.TelegaApp?.i18n?.t('no_links') || 'لا توجد روابط حالياً';
    const emptyHTML = `<div class="empty-state" style="padding:20px; text-align:center; color:#94a3b8;">${noLinksMsg}</div>`;
    
    const container = document.getElementById('links-container') || document.getElementById('links-list');
    if (container) container.innerHTML = emptyHTML;

    const tbody = document.getElementById('shortenerTableBody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;">${noLinksMsg}</td></tr>`;
  },

  // نسخ النص إلى الحافظة
  copyText: function(text) {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      this.notify(window.TelegaApp?.i18n?.t('copied_to_clipboard') || 'تم النسخ للحافظة!');
    }).catch(() => {
      this.notify('تعذر النسخ للحافظة', true);
    });
  },

  // حذف رابط
  deleteLink: async function(shortId) {
    const confirmMsg = window.TelegaApp?.i18n?.t('confirm_delete') || 'هل أنت تأكد من حذف هذا الرابط؟';
    if (!confirm(confirmMsg)) return;

    try {
      const telegramId = window.TelegaApp?.user?.telegramId;
      const payload = telegramId ? { telegramId } : {};

      await this.apiRequest(`/api/links/${shortId}`, 'DELETE', payload);
      this.notify(window.TelegaApp?.i18n?.t('link_deleted') || 'تم حذف الرابط بنجاح');
      await this.loadUserLinks();
    } catch (err) {
      this.notify(err.message || 'خطأ أثناء حذف الرابط', true);
    }
  },

  // عرض إحصائيات الرابط في نافذة منبثقة
  viewStats: async function(shortId) {
    try {
      const res = await this.apiRequest(`/api/links/stats/${shortId}`, 'GET');
      if (res && res.success && res.link) {
        const body = document.getElementById('stats-body');
        if (body) {
          const link = res.link;
          body.innerHTML = `
            <p><strong>المعرّف:</strong> ${link.shortId || link.shortCode}</p>
            <p><strong>الرابط الأصلي:</strong> <a href="${link.originalUrl}" target="_blank" rel="noopener noreferrer">${link.originalUrl}</a></p>
            <p><strong>إجمالي المشاهدات:</strong> ${link.views || 0}</p>
            <p><strong>إجمالي النقرات:</strong> ${link.clicks || 0}</p>
            <p><strong>إجمالي الأرباح:</strong> $${Number(link.earnings || 0).toFixed(4)}</p>
            <p><strong>الحالة:</strong> ${link.status || 'نشط'}</p>
          `;
        }
        if (window.TelegaApp?.ui?.openModal) {
          window.TelegaApp.ui.openModal('modal-stats');
        }
      }
    } catch (err) {
      this.notify(err.message || 'خطأ في جلب الإحصائيات', true);
    }
  }
};

// إتاحة الكائن تحت الاسم القديم لتفادي كسر أي وحدات أخرى
window.ShortenerModule = window.TelegaApp.shortener;

// التشغيل التلقائي عند اكتمال تحضير عناصر DOM
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => window.TelegaApp.shortener.init());
} else {
  window.TelegaApp.shortener.init();
}
