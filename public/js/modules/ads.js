/**
 * TelegaApp - Ads Module (public/js/modules/ads.js)
 * ملف موحد ومصلح بالكامل من كافة التداخلات والأخطاء.
 */
window.TelegaApp = window.TelegaApp || {};

window.TelegaApp.ads = {
  // ----------------------------------------------------
  // State Variables
  // ----------------------------------------------------
  currentShortId: null,
  timerSeconds: 10,
  intervalId: null,

  // ----------------------------------------------------
  // Helpers (API & UI Wrappers)
  // ----------------------------------------------------
  async _request(url, method = 'GET', body = null) {
    if (window.TelegaApp?.api?.request) {
      return await window.TelegaApp.api.request(url, method, body);
    } else if (window.API) {
      // Fallback in case of using global API object
      if (method === 'GET' && typeof window.API.getAds === 'function' && url.includes('admin/all')) {
        return await window.API.getAds();
      }
    }
    throw new Error('محرّك الطلبات (API) غير متوفر');
  },

  _notify(msg, isError = false) {
    if (window.TelegaApp?.ui?.showToast && !isError) {
      window.TelegaApp.ui.showToast(msg);
    } else if (window.TelegaApp?.ui?.showAlert) {
      window.TelegaApp.ui.showAlert(msg, isError);
    } else if (window.UI?.notify) {
      window.UI.notify(msg, isError);
    } else {
      alert(msg);
    }
  },

  // ----------------------------------------------------
  // Initialization
  // ----------------------------------------------------
  init: function () {
    const form = document.getElementById('create-ad-form');
    if (form) {
      form.addEventListener('submit', (e) => this.handleCreateFormSubmit(e));
    }
    this.loadMyCampaigns();
    this.loadCampaigns();
  },

  // ----------------------------------------------------
  // 1. Campaign Management (User / Advertiser)
  // ----------------------------------------------------
  handleCreateFormSubmit: async function (e) {
    e.preventDefault();
    const title = document.getElementById('ad-title')?.value.trim();
    const url = document.getElementById('ad-url')?.value.trim();
    const budget = parseFloat(document.getElementById('ad-budget')?.value || 0);
    const costPerClick = parseFloat(document.getElementById('ad-cpc')?.value || 0);

    try {
      const res = await this._request('/api/ads/create', 'POST', {
        title, url, budget, costPerClick
      });

      if (res && res.success) {
        this._notify('تم إطلاق الحملة بنجاح!');
        e.target.reset();
        
        const homeBal = document.getElementById('home-balance');
        const walletBal = document.getElementById('wallet-balance');
        if (homeBal && res.newBalance !== undefined) homeBal.textContent = res.newBalance.toFixed(2);
        if (walletBal && res.newBalance !== undefined) walletBal.textContent = res.newBalance.toFixed(2);

        this.loadMyCampaigns();
      }
    } catch (err) {
      console.error('Error creating ad:', err);
      this._notify(err.message || 'حدث خطأ أثناء إنشاء الحملة', true);
    }
  },

  loadMyCampaigns: async function () {
    const listContainer = document.getElementById('my-ads-list');
    if (!listContainer) return;

    try {
      const res = await this._request('/api/ads/my-ads');
      if (res && res.success && res.campaigns && res.campaigns.length > 0) {
        listContainer.innerHTML = res.campaigns.map(ad => `
          <div class="list-item">
            <div class="list-item-info">
              <span class="list-item-title">${ad.title}</span>
              <span class="list-item-sub">المنفق: $${(ad.spent || 0).toFixed(2)} / $${(ad.budget || 0).toFixed(2)} | النقرات: ${ad.totalClicks || 0}</span>
            </div>
            <span class="badge ${ad.status === 'active' ? '' : 'danger-badge'}">${ad.status}</span>
          </div>
        `).join('');
      } else {
        const noMsg = window.TelegaApp?.i18n?.t ? window.TelegaApp.i18n.t('no_campaigns') : 'لا توجد حملات إعلانية';
        listContainer.innerHTML = `<div class="empty-state">${noMsg}</div>`;
      }
    } catch (err) {
      console.error('Error loading my campaigns:', err);
    }
  },

  loadCampaigns: async function () {
    const container = document.getElementById('campaignsList');
    if (!container) return;

    try {
      let campaigns = [];
      if (window.API?.getCampaigns) {
        const res = await window.API.getCampaigns();
        campaigns = res.campaigns || [];
      } else {
        const res = await this._request('/api/ads/my-ads');
        campaigns = res.campaigns || [];
      }

      container.innerHTML = '';
      campaigns.forEach(c => {
        const card = document.createElement('div');
        card.className = 'card';
        card.style.marginBottom = '12px';

        const status = c.status || 'Draft';
        const badgeClass = `badge-${status.replace(' Review', '')}`;

        card.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <h3>${c.title}</h3>
            <span class="badge ${badgeClass}">${status}</span>
          </div>
          <p style="font-size:0.85rem; color: var(--text-muted); margin: 6px 0;">${c.adText || ''}</p>
          <div style="font-size:0.8rem; display:grid; grid-template-columns: 1fr 1fr; gap:6px;">
            <div>الميزانية: ${window.UI?.formatCurrency ? window.UI.formatCurrency(c.totalBudget || c.budget || 0) : '$' + (c.totalBudget || c.budget || 0)}</div>
            <div>المحجوز: ${window.UI?.formatCurrency ? window.UI.formatCurrency(c.reservedBudget || 0) : '$' + (c.reservedBudget || 0)}</div>
            <div>المصروف: ${window.UI?.formatCurrency ? window.UI.formatCurrency(c.spentBudget || c.spent || 0) : '$' + (c.spentBudget || c.spent || 0)}</div>
            <div>النقرات: ${c.clicks || c.totalClicks || 0} | الظهور: ${c.impressions || 0}</div>
          </div>
          <div style="margin-top:10px; display:flex; gap:6px;">
            ${status === 'Draft' ? `<button class="btn btn-success" onclick="window.TelegaApp.ads.submitCampaign('${c._id || c.id}')">إرسال للمراجعة</button>` : ''}
            ${status === 'Active' ? `<button class="btn btn-secondary" onclick="window.TelegaApp.ads.pauseCampaign('${c._id || c.id}')">إيقاف مؤقت</button>` : ''}
            ${status === 'Paused' ? `<button class="btn" onclick="window.TelegaApp.ads.resumeCampaign('${c._id || c.id}')">استئناف</button>` : ''}
            ${status !== 'Completed' ? `<button class="btn btn-danger" onclick="window.TelegaApp.ads.cancelCampaign('${c._id || c.id}')">إلغاء واسترجاع المحجوز</button>` : ''}
          </div>
        `;
        container.appendChild(card);
      });
    } catch (err) {
      console.error('Error loading campaigns:', err);
    }
  },

  loadActiveAds: async function () {
    const listContainer = document.getElementById('active-ads-list');
    if (!listContainer) return;

    try {
      const res = await this._request('/api/ads/active');
      if (res && res.success && res.ads && res.ads.length > 0) {
        listContainer.innerHTML = res.ads.map(ad => `
          <div class="list-item">
            <div class="list-item-info">
              <span class="list-item-title">${ad.title}</span>
              <span class="list-item-sub">المكافأة: $${((ad.costPerClick || ad.cpc || 0) * 0.8).toFixed(3)}</span>
            </div>
            <button class="btn primary-btn" style="width: auto; padding: 6px 12px;" onclick="window.TelegaApp.ads.clickAd('${ad._id || ad.id}')">شاهد وافتح</button>
          </div>
        `).join('');
      } else {
        const noAdsMsg = window.TelegaApp?.i18n?.t ? window.TelegaApp.i18n.t('no_ads') : 'لا توجد إعلانات متاحة حالياً';
        listContainer.innerHTML = `<div class="empty-state">${noAdsMsg}</div>`;
      }
    } catch (err) {
      console.error('Error loading active ads:', err);
    }
  },

  clickAd: async function (campaignId) {
    try {
      let res;
      if (window.API?.clickAd) {
        res = await window.API.clickAd(campaignId, null);
      } else {
        res = await this._request('/api/ads/click', 'POST', { campaignId });
      }

      if (res && res.success) {
        const rewardMsg = res.reward ? `تمت إضافة $${res.reward.toFixed(3)} إلى رصيدك!` : 'تم تسجيل النقرة وتوجيه الزائر';
        this._notify(rewardMsg);
        
        const redirect = res.redirectUrl || res.targetUrl;
        if (redirect) {
          window.open(redirect, '_blank');
        }

        this.loadActiveAds();
        this.loadCampaigns();
        if (window.WalletModule?.init) window.WalletModule.init();
      }
    } catch (err) {
      console.error('Error clicking ad:', err);
      this._notify(err.message || 'حدث خطأ عند فتح الإعلان', true);
    }
  },

  // ----------------------------------------------------
  // 2. ShortLink / Redirect Flow & Timer
  // ----------------------------------------------------
  async startAdFlow(shortId) {
    this.currentShortId = shortId;
    if (window.TelegaApp?.ui?.showView) {
      window.TelegaApp.ui.showView('view-ad');
    }

    try {
      const userId = window.TelegaApp?.user?.telegramId || '';
      const data = await this._request(`/api/ads/redirect-data/${shortId}?tgUserId=${userId}`);
      
      if (data && data.success) {
        const banner = document.getElementById('ad-banner');
        if (banner) {
          banner.src = data.campaign?.bannerUrl || 'https://via.placeholder.com/600x300?text=Ad';
        }
        this.runTimer();
      }
    } catch (err) {
      console.error('Error in startAdFlow:', err);
      this._notify(err.message || 'خطأ في جلب بيانات الإعلان', true);
    }
  },

  runTimer() {
    if (this.intervalId) clearInterval(this.intervalId);
    
    this.timerSeconds = 10;
    const timerElem = document.getElementById('timer-display');
    if (timerElem) timerElem.textContent = this.timerSeconds;

    this.intervalId = setInterval(() => {
      this.timerSeconds--;
      if (timerElem) timerElem.textContent = this.timerSeconds;

      if (this.timerSeconds <= 0) {
        clearInterval(this.intervalId);
        const timerStatus = document.getElementById('timer-status');
        const btnProceed = document.getElementById('btn-proceed');
        if (timerStatus) timerStatus.classList.add('hidden');
        if (btnProceed) btnProceed.classList.remove('hidden');
      }
    }, 1000);
  },

  async proceedToTarget() {
    try {
      const userId = window.TelegaApp?.user?.telegramId || '';
      const data = await this._request('/api/ads/complete-click', 'POST', {
        shortId: this.currentShortId,
        tgUserId: userId
      });

      if (data && data.success && data.originalUrl) {
        window.location.href = data.originalUrl;
      }
    } catch (err) {
      console.error('Error in proceedToTarget:', err);
      this._notify(err.message || 'حدث خطأ أثناء التوجيه', true);
    }
  },

  // ----------------------------------------------------
  // 3. Extended Controls & Operations
  // ----------------------------------------------------
  handleMediaTypeChange: function () {
    const typeElem = document.getElementById('mediaType');
    const durationGroup = document.getElementById('videoDurationGroup');
    if (!typeElem || !durationGroup) return;

    if (typeElem.value === 'video') {
      durationGroup.classList.remove('hidden');
    } else {
      durationGroup.classList.add('hidden');
    }
  },

  createCampaign: async function (e) {
    if (e && e.preventDefault) e.preventDefault();
    const mediaType = document.getElementById('mediaType')?.value;
    const videoDuration = parseFloat(document.getElementById('videoDuration')?.value || 0);

    if (mediaType === 'video' && (videoDuration <= 0 || videoDuration > 60)) {
      return this._notify('مدة الفيديو يجب أن تكون أصلية وأقل من 60 ثانية', true);
    }

    const payload = {
      title: document.getElementById('campTitle')?.value,
      mediaUrl: document.getElementById('mediaUrl')?.value,
      mediaType,
      videoDuration,
      targetUrl: document.getElementById('targetUrl')?.value,
      adText: document.getElementById('adText')?.value,
      pricingType: document.getElementById('pricingType')?.value,
      totalBudget: parseFloat(document.getElementById('totalBudget')?.value || 0),
      cpc: parseFloat(document.getElementById('cpcRate')?.value || 0.1),
      cpm: parseFloat(document.getElementById('cpmRate')?.value || 1.0),
      startDate: document.getElementById('startDate')?.value,
      endDate: document.getElementById('endDate')?.value
    };

    try {
      let res;
      if (window.API?.createCampaign) {
        res = await window.API.createCampaign(payload);
      } else {
        res = await this._request('/api/ads/create-campaign', 'POST', payload);
      }

      if (res && res.success) {
        this._notify('تم إنشاء الحملة كمسودة بنجاح');
        if (window.UI?.closeModal) window.UI.closeModal('campaignModal');
        this.loadCampaigns();
      }
    } catch (err) {
      console.error('Error creating campaign:', err);
      this._notify(err.message, true);
    }
  },

  submitCampaign: async function (id) {
    try {
      let res;
      if (window.API?.submitCampaign) {
        res = await window.API.submitCampaign(id);
      } else {
        res = await this._request(`/api/ads/submit/${id}`, 'POST');
      }

      if (res && res.success) {
        this._notify('تم إرسال الحملة وحجز الميزانية بنجاح');
        this.loadCampaigns();
        if (window.WalletModule?.init) window.WalletModule.init();
      }
    } catch (err) {
      console.error('Error submitting campaign:', err);
      this._notify(err.message, true);
    }
  },

  pauseCampaign: async function (id) {
    try {
      if (window.API?.pauseCampaign) {
        await window.API.pauseCampaign(id);
      } else {
        await this._request(`/api/ads/pause/${id}`, 'POST');
      }
      this.loadCampaigns();
    } catch (err) {
      this._notify(err.message, true);
    }
  },

  resumeCampaign: async function (id) {
    try {
      if (window.API?.resumeCampaign) {
        await window.API.resumeCampaign(id);
      } else {
        await this._request(`/api/ads/resume/${id}`, 'POST');
      }
      this.loadCampaigns();
    } catch (err) {
      this._notify(err.message, true);
    }
  },

  cancelCampaign: async function (id) {
    try {
      if (window.API?.cancelCampaign) {
        await window.API.cancelCampaign(id);
      } else {
        await this._request(`/api/ads/cancel/${id}`, 'POST');
      }
      this.loadCampaigns();
      if (window.WalletModule?.init) window.WalletModule.init();
    } catch (err) {
      this._notify(err.message, true);
    }
  },

  testServeAd: async function () {
    try {
      let res;
      if (window.API?.serveAd) {
        res = await window.API.serveAd();
      } else {
        res = await this._request('/api/ads/serve');
      }

      if (res && res.success) {
        const ad = res.ad;
        const box = document.getElementById('servedAdBox');
        if (box) {
          box.classList.remove('hidden');
          box.innerHTML = `
            <h4>${ad.title}</h4>
            <p>${ad.adText || ''}</p>
            ${ad.mediaUrl ? `<p><a href="${ad.mediaUrl}" target="_blank">معاينة الوسائط (${ad.mediaType})</a></p>` : ''}
            <button class="btn btn-success" onclick="window.TelegaApp.ads.clickAd('${ad.id || ad._id}')">زيارة الإعلان (اختبار CPC)</button>
            ${ad.branding ? `
              <div class="ad-branding">
                <span>📢 ${ad.branding.platformName}</span>
                <a href="${ad.branding.botUrl}" target="_blank">${ad.branding.botUrl}</a>
              </div>
            ` : ''}
          `;
        }
      }
    } catch (err) {
      this._notify(err.message, true);
    }
  },

  // ----------------------------------------------------
  // 4. Admin Management Interface
  // ----------------------------------------------------
  async renderAdsManagement(container) {
    if (!container) return;

    try {
      let ads = [];
      if (window.API?.getAds) {
        ads = await window.API.getAds();
      } else {
        const res = await this._request('/api/ads/admin/all');
        ads = res.ads || res || [];
      }

      let rows = ads.map(a => `
        <tr>
          <td>${a.title || 'بدون عنوان'}</td>
          <td>${a.pricingModel || a.pricingType || 'CPC'}</td>
          <td>$${a.bidAmount || a.cpc || 0}</td>
          <td>$${a.totalBudget || a.budget || 0}</td>
          <td>$${a.remainingBudget || 0}</td>
          <td>${a.priority || 1}</td>
          <td>${a.status || 'Draft'}</td>
          <td>
            <button class="btn-action btn-approve" onclick="window.TelegaApp.ads.updateStatus('${a._id || a.id}', 'approve')">قبول</button>
            <button class="btn-action btn-reject" onclick="window.TelegaApp.ads.updateStatus('${a._id || a.id}', 'reject')">رفض</button>
            <button class="btn-action btn-reject" style="background:orange;" onclick="window.TelegaApp.ads.updateStatus('${a._id || a.id}', 'pause')">إيقاف</button>
          </td>
        </tr>
      `).join('');

      container.innerHTML = `
        <h2>إدارة الإعلانات</h2>
        <button class="btn-action btn-approve" style="margin-bottom:1rem;" onclick="window.TelegaApp.ads.showCreateModal()">+ إنشاء إعلان جديد</button>
        <div class="table-container">
          <table>
            <thead>
              <tr><th>العنوان</th><th>النوع</th><th>CPC/CPM</th><th>الميزانية</th><th>المتبقي</th><th>الأولوية</th><th>الحالة</th><th>إجراءات</th></tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      `;
    } catch (err) {
      console.error('Error rendering ads management:', err);
      this._notify('حدث خطأ أثناء تحميل جدول إدارة الإعلانات', true);
    }
  },

  async updateStatus(adId, action) {
    try {
      if (window.API?.manageAd) {
        await window.API.manageAd({ adId, action });
      } else {
        await this._request('/api/ads/admin/manage', 'POST', { adId, action });
      }
      this._notify('تم تحديث حالة الإعلان');
      const mainContent = document.getElementById('main-content');
      if (mainContent) this.renderAdsManagement(mainContent);
    } catch (err) {
      this._notify(err.message, true);
    }
  },

  showCreateModal() {
    const html = `
      <h3>إنشاء إعلان جديد</h3>
      <input type="text" id="ad-title" placeholder="عنوان الإعلان" style="width:100%;margin-bottom:0.5rem;padding:0.5rem;">
      <input type="text" id="ad-url" placeholder="رابط الهدف (Target URL)" style="width:100%;margin-bottom:0.5rem;padding:0.5rem;">
      <select id="ad-model" style="width:100%;margin-bottom:0.5rem;padding:0.5rem;">
        <option value="CPC">CPC (تكلفة النقلة)</option>
        <option value="CPM">CPM (تكلفة الألف ظهور)</option>
      </select>
      <input type="number" id="ad-bid" placeholder="سعر المزايدة (Bid)" style="width:100%;margin-bottom:0.5rem;padding:0.5rem;">
      <input type="number" id="ad-budget" placeholder="الميزانية الكلية" style="width:100%;margin-bottom:0.5rem;padding:0.5rem;">
      <button class="btn-action btn-approve" onclick="window.TelegaApp.ads.submitCreate()">حفظ الإعلان</button>
    `;

    if (window.UI?.showModal) {
      window.UI.showModal(html);
    } else if (window.TelegaApp?.ui?.showModal) {
      window.TelegaApp.ui.showModal(html);
    }
  },

  async submitCreate() {
    try {
      const payload = {
        action: 'create',
        advertiserId: window.TelegaApp?.user?.id || '660000000000000000000001',
        title: document.getElementById('ad-title')?.value,
        targetUrl: document.getElementById('ad-url')?.value,
        pricingModel: document.getElementById('ad-model')?.value,
        bidAmount: parseFloat(document.getElementById('ad-bid')?.value || 0),
        totalBudget: parseFloat(document.getElementById('ad-budget')?.value || 0)
      };

      if (window.API?.manageAd) {
        await window.API.manageAd(payload);
      } else {
        await this._request('/api/ads/admin/manage', 'POST', payload);
      }

      this._notify('تم إنشاء الإعلان بنجاح');
      document.getElementById('ui-modal')?.remove();
      const mainContent = document.getElementById('main-content');
      if (mainContent) this.renderAdsManagement(mainContent);
    } catch (err) {
      this._notify(err.message, true);
    }
  }
};

// ----------------------------------------------------
// Global Alias Export for Legacy Compatibility
// ----------------------------------------------------
window.AdsModule = window.TelegaApp.ads;
