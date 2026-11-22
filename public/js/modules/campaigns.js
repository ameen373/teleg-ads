'use strict';

(function (window) {
  const CAMPAIGN_LANGUAGES = [
    { code: 'en', label: '🇬🇧 English' },
    { code: 'zh', label: '🇨🇳 Chinese' },
    { code: 'hi', label: '🇮🇳 Hindi' },
    { code: 'es', label: '🇪🇸 Spanish' },
    { code: 'ar', label: '🇸🇦 Arabic' },
    { code: 'fr', label: '🇫🇷 French' },
    { code: 'bn', label: '🇧🇩 Bengali' },
    { code: 'pt', label: '🇵🇹 Portuguese' },
    { code: 'id', label: '🇮🇩 Indonesian' },
    { code: 'ur', label: '🇵🇰 Urdu' },
    { code: 'ru', label: '🇷🇺 Russian' },
    { code: 'de', label: '🇩🇪 German' },
    { code: 'ja', label: '🇯🇵 Japanese' },
    { code: 'pcm', label: '🇳🇬 Nigerian Pidgin' },
    { code: 'mr', label: '🇮🇳 Marathi' },
    { code: 'vi', label: '🇻🇳 Vietnamese' },
    { code: 'te', label: '🇮🇳 Telugu' },
    { code: 'sw', label: '🇰🇪 Swahili' },
    { code: 'tr', label: '🇹🇷 Turkish' },
  ];

  const CAMPAIGN_CATEGORIES = [
    '🎬 الترفيه',
    '📰 الأخبار ووسائل الإعلام',
    '🍿 الأفلام والمسلسلات',
    '💄 الموضة والجمال',
    '🎮 الألعاب',
    '🎨 الفن والتصوير',
    '🪙 العملات المشفرة',
    '💻 التقنيات',
    '📚 التعليم',
    '🍳 الطبخ',
    '🩺 الصحة',
    '⚽ الرياضة',
    '🌐 أخرى',
  ];

  const PRESET_CTA_BUTTONS = [
    { key: 'open', label: 'Open' },
    { key: 'view_offer', label: 'View Offer' },
    { key: 'join_channel', label: 'Join Channel' },
    { key: 'custom', label: 'زر تفاعلي مخصص' },
  ];

  const MIN_PRICE = 1;
  const MAX_PRICE = 3;

  const state = {
    campaigns: [],
    activeTab: 'list',
    isSubmitting: false,
    resumingIds: {},
    mediaType: 'none',
    mediaDataUrl: '',
    mediaFileName: '',
    isInitialized: false,
  };

  function tr(key) {
    if (window.I18n && typeof window.I18n.t === 'function') {
      return window.I18n.t(key);
    }
    if (window.TelegaI18n && typeof window.TelegaI18n.t === 'function') {
      return window.TelegaI18n.t(key);
    }
    return key;
  }

  function esc(val) {
    if (window.TelegaUI && typeof window.TelegaUI.escapeHtml === 'function') {
      return window.TelegaUI.escapeHtml(val);
    }
    return String(val ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function notify(msg, type = 'info') {
    if (window.TelegaUI && typeof window.TelegaUI.toast === 'function') {
      window.TelegaUI.toast(msg, type, 'campaigns-feedback-banner');
    } else if (window.UI && typeof window.UI.notify === 'function') {
      window.UI.notify(msg);
    }
  }

  function haptic(style = 'light') {
    if (window.UI && typeof window.UI.haptic === 'function') {
      window.UI.haptic(style);
    } else if (window.TelegaUI && typeof window.TelegaUI.haptic === 'function') {
      window.TelegaUI.haptic(style);
    }
  }

  function clearMsg() {
    if (window.TelegaUI && typeof window.TelegaUI.clearFeedback === 'function') {
      window.TelegaUI.clearFeedback('campaigns-feedback-banner');
    }
  }

  function callApi(url, options = {}) {
    if (window.TelegaApi && typeof window.TelegaApi.request === 'function') {
      return window.TelegaApi.request(url, options);
    }
    if (window.Api && typeof window.Api.request === 'function') {
      return window.Api.request(url, options);
    }
    if (url === '/api/campaigns' && (!options.method || options.method === 'GET') && window.Api?.getCampaigns) {
      return window.Api.getCampaigns();
    }
    if (url === '/api/campaigns' && options.method === 'POST' && window.Api?.createCampaign) {
      return window.Api.createCampaign(options.body || {});
    }
    throw new Error('وحدة الاتصال بالخادم غير متاحة');
  }

  function populateSelectOptions() {
    const langSelect = document.getElementById('campaign-language-select');
    if (langSelect && langSelect.options.length <= 1) {
      CAMPAIGN_LANGUAGES.forEach((lang) => {
        const opt = document.createElement('option');
        opt.value = lang.code;
        opt.textContent = lang.label;
        langSelect.appendChild(opt);
      });
    }

    const catSelect = document.getElementById('campaign-category-select');
    if (catSelect && catSelect.options.length <= 1) {
      CAMPAIGN_CATEGORIES.forEach((cat) => {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.textContent = cat;
        catSelect.appendChild(opt);
      });
    }
  }

  function populateChannelSelect(channels) {
    const select = document.getElementById('camp-channel-select');
    if (!select) {
      return;
    }
    const placeholder = `<option value="">${esc(tr('select_channel'))}</option>`;
    if (!channels || channels.length === 0) {
      select.innerHTML = placeholder;
      return;
    }
    const options = channels
      .map((ch) => {
        const id = ch._id || ch.id || ch.chatId || '';
        const uname = ch.channelUsername || ch.username || '';
        const price = ch.pricePerPost ?? ch.price ?? 0;
        return `<option value="${esc(id)}">${esc(ch.title)} ${uname ? `(@${esc(uname)})` : ''} - $${esc(price)}</option>`;
      })
      .join('');
    select.innerHTML = placeholder + options;
  }

  function getStatusBadge(status) {
    if (window.TelegaUI && typeof window.TelegaUI.getCampaignStatusBadge === 'function') {
      return window.TelegaUI.getCampaignStatusBadge(status);
    }
    const i18nStatus = tr('status_' + status);
    const label = i18nStatus !== 'status_' + status ? i18nStatus : status || 'غير معروف';
    return `<span class="status-badge badge ${esc(status || 'neutral')}">${esc(label)}</span>`;
  }

  function getReferralLink() {
    if (window.TelegaApp && typeof window.TelegaApp.getReferralUrl === 'function') {
      return window.TelegaApp.getReferralUrl();
    }
    const refInput = document.getElementById('referral-link-input');
    if (refInput && refInput.value) {
      return refInput.value;
    }
    return 'https://t.me/adTelega_bot?start=ref_publisher';
  }

  function readDraftFromForm() {
    const channelSelectEl = document.getElementById('camp-channel-select');
    const titleEl = document.getElementById('campaign-title-input') || document.getElementById('camp-title');
    const textEl = document.getElementById('campaign-text-input') || document.getElementById('camp-text');
    const openTargetEl = document.getElementById('campaign-open-targeting');
    const minPriceEl = document.getElementById('campaign-min-price');
    const maxPriceEl = document.getElementById('campaign-max-price');
    const langEl = document.getElementById('campaign-language-select');
    const catEl = document.getElementById('campaign-category-select');
    const ctaTypeEl = document.getElementById('campaign-cta-type');
    const ctaCustomLabelEl = document.getElementById('campaign-cta-custom-label');
    const ctaUrlEl = document.getElementById('campaign-cta-url') || document.getElementById('camp-url');
    const scheduleTypeEl = document.getElementById('campaign-schedule-type');
    const scheduleAtEl = document.getElementById('campaign-scheduled-at');
    const budgetEl = document.getElementById('campaign-budget-input');

    const ctaType = ctaTypeEl ? ctaTypeEl.value : 'open';
    let ctaLabel = 'Open';
    if (ctaType === 'custom') {
      ctaLabel = (ctaCustomLabelEl && ctaCustomLabelEl.value.trim()) || 'زر مخصص';
    } else {
      const preset = PRESET_CTA_BUTTONS.find((p) => p.key === ctaType);
      ctaLabel = preset ? preset.label : 'Open';
    }

    return {
      channelId: channelSelectEl && channelSelectEl.value ? channelSelectEl.value : null,
      title: titleEl ? titleEl.value.trim() : '',
      text: textEl ? textEl.value.trim() : '',
      mediaType: state.mediaType,
      mediaUrl: state.mediaDataUrl || null,
      mediaFileName: state.mediaFileName,
      targeting: {
        openTargeting: Boolean(openTargetEl && openTargetEl.checked),
        minPrice: minPriceEl ? Number(minPriceEl.value) : MIN_PRICE,
        maxPrice: maxPriceEl ? Number(maxPriceEl.value) : MAX_PRICE,
        language: langEl && langEl.value ? langEl.value : null,
        category: catEl && catEl.value ? catEl.value : null,
      },
      ctaButton: {
        type: ctaType,
        label: ctaLabel,
        url: ctaUrlEl ? ctaUrlEl.value.trim() : '',
      },
      scheduleType: scheduleTypeEl ? scheduleTypeEl.value : 'immediate',
      scheduledAt: scheduleAtEl && scheduleAtEl.value ? scheduleAtEl.value : null,
      budgetAllocated: budgetEl ? Number(budgetEl.value || 0) : 0,
    };
  }

  function updateCampaignPreview() {
    const previewBox = document.getElementById('campaign-live-preview');
    if (!previewBox) {
      return;
    }

    const draft = readDraftFromForm();
    const refUrl = getReferralLink();
    const bodyText = draft.text || 'نص المنشور الإعلاني سيظهر هنا...';
    const footerText = `📢 عبر منصة Telega.ads (${refUrl})`;

    let mediaHtml = '';
    if (draft.mediaType === 'photo' && draft.mediaUrl) {
      mediaHtml = `<div class="preview-media"><img src="${esc(draft.mediaUrl)}" alt="معاينة الصورة" class="preview-img" /></div>`;
    } else if (draft.mediaType === 'video' && draft.mediaUrl) {
      mediaHtml = `<div class="preview-media"><video src="${esc(draft.mediaUrl)}" controls class="preview-video"></video></div>`;
    }

    const targetSummary = draft.targeting.openTargeting
      ? '🌍 الاستهداف المفتوح (جميع القنوات)'
      : `السعر: $${draft.targeting.minPrice} - $${draft.targeting.maxPrice} | اللغة: ${draft.targeting.language || 'الكل'} | التصنيف: ${draft.targeting.category || 'الكل'}`;

    const scheduleSummary =
      draft.scheduleType === 'peak'
        ? '⏰ مجدولة لأوقات الذروة'
        : draft.scheduleType === 'scheduled' && draft.scheduledAt
        ? `📅 مجدولة بتاريخ: ${esc(draft.scheduledAt)}`
        : '⚡ نشر فوري';

    previewBox.innerHTML = `
      <div class="preview-card-header">
        <strong>معاينة الشكل النهائي للإعلان</strong>
        <span class="preview-mode-chip">${scheduleSummary}</span>
      </div>
      <div class="preview-target-line">${esc(targetSummary)}</div>
      <div class="telegram-post-mock">
        ${mediaHtml}
        <div class="mock-title">${esc(draft.title || 'عنوان الحملة')}</div>
        <div class="mock-body">${esc(bodyText).replace(/\n/g, '<br />')}</div>
        <div class="mock-attribution">
          عبر منصة <a href="${esc(refUrl)}" target="_blank" rel="noopener noreferrer">Telega.ads</a> (رابط إحالة الناشر)
        </div>
        <div class="mock-restrictions">🔒 محمي ضد إعادة التوجيه والتلاعب بالمحتوى</div>
        <div class="mock-cta-row">
          <span class="mock-cta-btn">${esc(draft.ctaButton.label)}</span>
          <span class="mock-cta-btn mock-cta-secondary">⚡ Telega.ads</span>
        </div>
      </div>
      <div class="preview-footer-note">${esc(footerText)}</div>
    `;
  }

  function renderLegacyCampaignsList(listEl, campaigns) {
    if (!listEl) {
      return;
    }
    if (!campaigns || campaigns.length === 0) {
      listEl.innerHTML = `<div class="empty-state">${esc(tr('no_data'))}</div>`;
      return;
    }

    listEl.innerHTML = campaigns
      .map((camp) => {
        const chName =
          camp.channelId && typeof camp.channelId === 'object'
            ? `@${camp.channelId.channelUsername || camp.channelId.username || ''}`
            : camp.channelId || 'Channel';
        const budgetVal = Number(camp.budget ?? camp.budgetAllocated ?? 0);
        const targetUrl = camp.targetUrl || camp.ctaButton?.url || '';
        return `
          <div class="list-item">
            <div class="item-main">
              <span class="item-title">${esc(camp.title)} (${esc(chName)})</span>
              <span class="item-sub">$${budgetVal.toFixed(2)} • ${esc(targetUrl)}</span>
            </div>
            <span class="badge ${esc(camp.status)}">${esc(tr('status_' + camp.status))}</span>
          </div>
        `;
      })
      .join('');
  }

  function renderCampaignsList() {
    const container = document.getElementById('campaigns-list-container');
    const legacyListEl = document.getElementById('my-campaigns-list');

    if (legacyListEl) {
      renderLegacyCampaignsList(legacyListEl, state.campaigns);
    }

    if (!container) {
      return;
    }

    if (!state.campaigns.length) {
      container.innerHTML = `
        <div class="empty-state-card">
          <p>لا توجد حملات إعلانية حتى الآن.</p>
          <span>اضغط على "إنشاء حملة جديدة" لإطلاق إعلانك واستهداف القنوات بدقة.</span>
        </div>
      `;
      return;
    }

    container.innerHTML = state.campaigns
      .map((camp) => {
        const campId = camp.campaignId || camp.id || camp._id || '';
        const stats = camp.stats || {};
        const publishedCount = Number(stats.publishedCount || 0);
        const failedCount = Number(stats.failedCount || 0);
        const clicksCount = Number(stats.clicksCount || 0);
        const budgetAllocated = Number(camp.budgetAllocated ?? camp.budget ?? 0);
        const budgetSpent = Number(camp.budgetSpent || 0);
        const isResuming = Boolean(state.resumingIds[campId]);
        const targetInfo =
          camp.targeting && camp.targeting.openTargeting
            ? '🌍 استهداف مفتوح'
            : `${camp.targeting?.language || 'كل اللغات'} • ${camp.targeting?.category || 'كل التصنيفات'}`;

        return `
          <div class="campaign-item-card" data-campaign-id="${esc(campId)}">
            <div class="campaign-card-top">
              <div>
                <h4 class="campaign-title">${esc(camp.title)}</h4>
                <div class="campaign-meta-sub">${esc(targetInfo)}</div>
              </div>
              ${getStatusBadge(camp.status)}
            </div>

            <p class="campaign-excerpt">${esc(camp.text || camp.adText || 'منشور وسائط')}</p>

            <div class="campaign-stats-grid">
              <div class="stat-box">
                <span class="stat-label">المنشورات الناجحة</span>
                <strong class="stat-value">${publishedCount}</strong>
              </div>
              <div class="stat-box">
                <span class="stat-label">النقرات / التفاعل</span>
                <strong class="stat-value">${clicksCount}</strong>
              </div>
              <div class="stat-box">
                <span class="stat-label">المصروف / الميزانية</span>
                <strong class="stat-value">$${budgetSpent.toFixed(2)} / $${budgetAllocated.toFixed(2)}</strong>
              </div>
              <div class="stat-box">
                <span class="stat-label">إخفاقات الإرسال</span>
                <strong class="stat-value">${failedCount}</strong>
              </div>
            </div>

            <div class="resume-box">
              <label class="resume-label">شحن الميزانية واستئناف الحملة (Resume):</label>
              <div class="resume-controls">
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value="5"
                  class="resume-topup-input"
                  id="topup-input-${esc(campId)}"
                  placeholder="مبلغ الشحن ($)"
                />
                <button
                  type="button"
                  class="btn btn-primary btn-sm resume-campaign-btn"
                  data-resume-id="${esc(campId)}"
                  ${isResuming ? 'disabled' : ''}
                >
                  ${isResuming ? 'جاري الاستئناف...' : '▶️ شحن واستئناف الحملة'}
                </button>
              </div>
            </div>
          </div>
        `;
      })
      .join('');
  }

  function switchTab(tabName) {
    state.activeTab = tabName === 'create' ? 'create' : 'list';
    const listBtn = document.getElementById('tab-view-campaigns-btn');
    const createBtn = document.getElementById('tab-create-campaign-btn');
    const listPanel = document.getElementById('campaigns-list-panel');
    const createPanel = document.getElementById('campaign-create-panel');

    if (listBtn) {
      listBtn.classList.toggle('active', state.activeTab === 'list');
    }
    if (createBtn) {
      createBtn.classList.toggle('active', state.activeTab === 'create');
    }
    if (listPanel) {
      listPanel.classList.toggle('hidden', state.activeTab !== 'list');
    }
    if (createPanel) {
      createPanel.classList.toggle('hidden', state.activeTab !== 'create');
    }

    if (state.activeTab === 'create') {
      updateCampaignPreview();
    }
  }

  async function loadCampaigns() {
    try {
      const data = await callApi('/api/campaigns', { method: 'GET' });
      state.campaigns = Array.isArray(data.campaigns) ? data.campaigns : [];
      renderCampaignsList();
    } catch (err) {
      notify(err.message || 'تعذر تحميل الحملات الإعلانية', 'error');
      renderCampaignsList();
    }
  }

  function handleMediaFileChange(event) {
    const file = event.target && event.target.files ? event.target.files[0] : null;
    const filenameEl = document.getElementById('campaign-media-filename');

    if (!file) {
      return;
    }

    const isVideo = file.type.startsWith('video/');
    const isImage = file.type.startsWith('image/');
    if (!isImage && !isVideo) {
      notify('يرجى اختيار ملف صورة أو فيديو صالح', 'warning');
      return;
    }

    const reader = new FileReader();
    reader.onload = function (loadEvent) {
      state.mediaType = isVideo ? 'video' : 'photo';
      state.mediaDataUrl = String(loadEvent.target.result || '');
      state.mediaFileName = file.name;
      if (filenameEl) {
        filenameEl.textContent = `الملف المحدد: ${file.name} (${state.mediaType === 'video' ? 'فيديو' : 'صورة'})`;
      }
      updateCampaignPreview();
    };
    reader.readAsDataURL(file);
  }

  function clearMediaSelection() {
    state.mediaType = 'none';
    state.mediaDataUrl = '';
    state.mediaFileName = '';
    const fileInput = document.getElementById('campaign-media-input');
    const filenameEl = document.getElementById('campaign-media-filename');
    if (fileInput) {
      fileInput.value = '';
    }
    if (filenameEl) {
      filenameEl.textContent = 'لم يتم اختيار ملف وسائط';
    }
    updateCampaignPreview();
  }

  function syncConditionalInputs() {
    const openTargetEl = document.getElementById('campaign-open-targeting');
    const filteredFieldsEl = document.getElementById('filtered-targeting-fields');
    if (openTargetEl && filteredFieldsEl) {
      filteredFieldsEl.classList.toggle('hidden', openTargetEl.checked);
    }

    const ctaTypeEl = document.getElementById('campaign-cta-type');
    const ctaCustomGroupEl = document.getElementById('campaign-cta-custom-group');
    if (ctaTypeEl && ctaCustomGroupEl) {
      ctaCustomGroupEl.classList.toggle('hidden', ctaTypeEl.value !== 'custom');
    }

    const scheduleTypeEl = document.getElementById('campaign-schedule-type');
    const scheduleTimeGroupEl = document.getElementById('campaign-schedule-time-group');
    const scheduleAtEl = document.getElementById('campaign-scheduled-at');

    if (scheduleTypeEl && scheduleTimeGroupEl) {
      const val = scheduleTypeEl.value;
      scheduleTimeGroupEl.classList.toggle('hidden', val !== 'scheduled');
      if (val === 'peak' && scheduleAtEl && !scheduleAtEl.value) {
        const peakDate = new Date(Date.now() + 3 * 60 * 60 * 1000);
        peakDate.setMinutes(0, 0, 0);
        const pad = (n) => String(n).padStart(2, '0');
        scheduleAtEl.value = `${peakDate.getFullYear()}-${pad(peakDate.getMonth() + 1)}-${pad(
          peakDate.getDate()
        )}T${pad(peakDate.getHours())}:00`;
      }
    }

    updateCampaignPreview();
  }

  async function handleCreateCampaignSubmit(event) {
    event.preventDefault();
    if (state.isSubmitting) {
      return;
    }

    clearMsg();
    const formEl = event.currentTarget || document.getElementById('create-campaign-form');
    const hasExtendedForm = Boolean(
      document.getElementById('campaign-title-input') ||
        document.getElementById('campaign-text-input') ||
        document.getElementById('campaign-cta-url')
    );

    if (!hasExtendedForm) {
      try {
        const legacyPayload = {
          channelId: document.getElementById('camp-channel-select')?.value,
          title: document.getElementById('camp-title')?.value,
          adText: document.getElementById('camp-text')?.value,
          targetUrl: document.getElementById('camp-url')?.value,
        };
        if (window.Api && typeof window.Api.createCampaign === 'function') {
          await window.Api.createCampaign(legacyPayload);
        } else {
          await callApi('/api/campaigns', { method: 'POST', body: legacyPayload });
        }
        if (formEl && typeof formEl.reset === 'function') {
          formEl.reset();
        }
        haptic('medium');
        await loadCampaigns();
        if (window.App && typeof window.App.refreshUserData === 'function') {
          await window.App.refreshUserData();
        }
      } catch (err) {
        notify(err.message || 'تعذر إنشاء الحملة الإعلانية', 'error');
      }
      return;
    }

    const draft = readDraftFromForm();

    if (!draft.title) {
      notify('يرجى إدخال عنوان الحملة', 'warning');
      return;
    }

    if (!draft.text && !draft.mediaUrl) {
      notify('يرجى إدخال نص المنشور الإعلاني أو إرفاق صورة/فيديو', 'warning');
      return;
    }

    if (!draft.ctaButton.url || !/^https?:\/\/.+/i.test(draft.ctaButton.url)) {
      notify('يرجى إدخال رابط صحيح للزر التفاعلي يبدأ بـ https://', 'warning');
      return;
    }

    if (
      Number.isNaN(draft.targeting.minPrice) ||
      Number.isNaN(draft.targeting.maxPrice) ||
      draft.targeting.minPrice < MIN_PRICE ||
      draft.targeting.maxPrice > MAX_PRICE ||
      draft.targeting.minPrice > draft.targeting.maxPrice
    ) {
      notify(`نطاق السعر يجب أن يكون بين $${MIN_PRICE} و $${MAX_PRICE}`, 'warning');
      return;
    }

    const submitBtn = document.getElementById('submit-campaign-btn');
    state.isSubmitting = true;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'جاري إطلاق الحملة...';
    }

    try {
      const apiScheduleType = draft.scheduleType === 'immediate' ? 'immediate' : 'scheduled';
      const apiScheduledAt =
        draft.scheduleType === 'peak'
          ? new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
          : draft.scheduleType === 'scheduled' && draft.scheduledAt
          ? new Date(draft.scheduledAt).toISOString()
          : null;

      await callApi('/api/campaigns', {
        method: 'POST',
        body: {
          channelId: draft.channelId,
          title: draft.title,
          text: draft.text,
          adText: draft.text,
          targetUrl: draft.ctaButton.url,
          mediaType: draft.mediaType,
          mediaUrl: draft.mediaUrl,
          targeting: draft.targeting,
          ctaButton: draft.ctaButton,
          scheduleType: apiScheduleType,
          scheduledAt: apiScheduledAt,
          budgetAllocated: draft.budgetAllocated,
          publishNow: draft.scheduleType === 'immediate',
        },
      });

      notify('تم إنشاء الحملة الإعلانية ومعالجة النشر بنجاح ✅', 'success');
      if (formEl && typeof formEl.reset === 'function') {
        formEl.reset();
      }
      clearMediaSelection();
      syncConditionalInputs();
      switchTab('list');
      haptic('medium');
      await loadCampaigns();
      if (window.App && typeof window.App.refreshUserData === 'function') {
        await window.App.refreshUserData();
      }
    } catch (err) {
      notify(err.message || 'تعذر إنشاء الحملة الإعلانية', 'error');
    } finally {
      state.isSubmitting = false;
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = '🚀 إطلاق الحملة الإعلانية';
      }
    }
  }

  async function handleResumeCampaign(campaignId) {
    if (!campaignId || state.resumingIds[campaignId]) {
      return;
    }

    clearMsg();
    const topupInput = document.getElementById(`topup-input-${campaignId}`);
    const topUpAmount = topupInput ? Number(topupInput.value || 0) : 0;

    if (Number.isNaN(topUpAmount) || topUpAmount < 0) {
      notify('يرجى إدخال مبلغ شحن صحيح', 'warning');
      return;
    }

    state.resumingIds[campaignId] = true;
    renderCampaignsList();

    try {
      await callApi(`/api/campaigns/${encodeURIComponent(campaignId)}/resume`, {
        method: 'POST',
        body: { topUpAmount },
      });

      notify('تم شحن الميزانية واستئناف الحملة وإعادة النشر التلقائي بنجاح', 'success');
      await loadCampaigns();
      if (window.App && typeof window.App.refreshUserData === 'function') {
        await window.App.refreshUserData();
      }
    } catch (err) {
      notify(err.message || 'تعذر استئناف الحملة', 'error');
    } finally {
      state.resumingIds[campaignId] = false;
      renderCampaignsList();
    }
  }

  function bindEvents() {
    const viewBtn = document.getElementById('tab-view-campaigns-btn');
    const createBtn = document.getElementById('tab-create-campaign-btn');
    if (viewBtn) {
      viewBtn.addEventListener('click', () => switchTab('list'));
    }
    if (createBtn) {
      createBtn.addEventListener('click', () => switchTab('create'));
    }

    const refreshBtn = document.getElementById('refresh-campaigns-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', loadCampaigns);
    }

    const formEl = document.getElementById('create-campaign-form');
    if (formEl) {
      formEl.addEventListener('submit', handleCreateCampaignSubmit);
      formEl.addEventListener('input', updateCampaignPreview);
      formEl.addEventListener('change', syncConditionalInputs);
    }

    const mediaInput = document.getElementById('campaign-media-input');
    if (mediaInput) {
      mediaInput.addEventListener('change', handleMediaFileChange);
    }

    const clearMediaBtn = document.getElementById('clear-campaign-media-btn');
    if (clearMediaBtn) {
      clearMediaBtn.addEventListener('click', clearMediaSelection);
    }

    const listEl = document.getElementById('campaigns-list-container');
    if (listEl) {
      listEl.addEventListener('click', (event) => {
        const resumeBtn = event.target.closest('.resume-campaign-btn');
        if (resumeBtn) {
          const cid = resumeBtn.getAttribute('data-resume-id');
          handleResumeCampaign(cid);
        }
      });
    }
  }

  function initCampaignsModule() {
    if (state.isInitialized) {
      return;
    }
    state.isInitialized = true;
    populateSelectOptions();
    bindEvents();
    syncConditionalInputs();
    renderCampaignsList();
    loadCampaigns();
  }

  const CampaignsModule = {
    init() {
      initCampaignsModule();
    },
    populateChannelSelect(channels) {
      populateChannelSelect(channels);
    },
    async load() {
      await loadCampaigns();
    },
  };

  window.CampaignsModule = CampaignsModule;
  window.TelegaCampaignsModule = {
    init: initCampaignsModule,
    reload: loadCampaigns,
    getState: function () {
      return state;
    },
  };
})(window);
