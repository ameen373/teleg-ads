// public/js/bridge.js

document.addEventListener('DOMContentLoaded', async () => {
  'use strict';

  const titleEl = document.getElementById('link-title');
  const timerEl = document.getElementById('timer-count');
  const actionBtn = document.getElementById('continue-btn');
  const adContainer = document.getElementById('ad-container');
  const statusMsg = document.getElementById('status-msg');

  let startTime = Date.now();
  let linkCode = '';
  let originalUrl = '';
  let campaignId = null;
  let countdownSeconds = 5;
  let timerInterval = null;

  function getCodeFromURL() {
    const pathSegments = window.location.pathname.split('/').filter(Boolean);
    return pathSegments[pathSegments.length - 1] || '';
  }

  linkCode = getCodeFromURL();

  if (!linkCode) {
    if (statusMsg) statusMsg.innerText = 'رابط غير صالح أو الكود مفقود.';
    return;
  }

  async function fetchLinkDetails() {
    try {
      const response = await fetch(`/api/bridge/link/${linkCode}`);
      const result = await response.json();

      if (!result.success) {
        if (statusMsg) statusMsg.innerText = result.message || 'تعذر تحميل الرابط.';
        return;
      }

      const { data } = result;
      originalUrl = data.originalUrl;
      countdownSeconds = data.waitTimeSeconds || 5;

      if (titleEl) {
        titleEl.innerText = data.title || 'جاري تجهيز الرابط...';
      }

      renderAd(data.ad);
      startCountdown();

    } catch (error) {
      console.error('[Bridge Fetch Error]:', error);
      if (statusMsg) statusMsg.innerText = 'حدث خطأ أثناء تحميل البيانات.';
    }
  }

  function renderAd(ad) {
    if (!adContainer || !ad) return;

    if (ad.type === 'internal') {
      campaignId = ad.campaignId;
      adContainer.innerHTML = `
        <div class="internal-ad-card" style="border: 1px solid var(--border-color, #ddd); padding: 15px; border-radius: 8px; text-align: center; background: var(--bg-card, #fff);">
          <span style="font-size: 12px; color: #888; display: block; margin-bottom: 8px;">إعلان مروج</span>
          <h4 style="margin: 0 0 10px 0;">${ad.title}</h4>
          ${ad.bannerUrl ? `<img src="${ad.bannerUrl}" alt="${ad.title}" style="max-width: 100%; height: auto; border-radius: 6px; margin-bottom: 10px;">` : ''}
          <div>
            <a href="${ad.targetUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-primary btn-sm" style="display: inline-block; text-decoration: none;">
              زيارة الموقع
            </a>
          </div>
        </div>
      `;
    } else if (ad.type === 'external' && ad.provider === 'adsgram') {
      adContainer.innerHTML = `
        <div id="adsgram-block" style="min-height: 100px; text-align: center;">
          <p style="font-size: 12px; color: #888;">إعلان Adsgram</p>
        </div>
      `;

      if (window.Adsgram && ad.adsgramBlockId) {
        try {
          const AdController = window.Adsgram.init({ blockId: ad.adsgramBlockId });
          AdController.show().catch((err) => console.warn('[Adsgram Show Error]:', err));
        } catch (err) {
          console.error('[Adsgram Init Error]:', err);
        }
      }
    }
  }

  function startCountdown() {
    if (actionBtn) {
      actionBtn.disabled = true;
      actionBtn.innerText = `يرجى الانتظار (${countdownSeconds})`;
    }

    if (timerEl) timerEl.innerText = countdownSeconds;

    startTime = Date.now();

    timerInterval = setInterval(() => {
      countdownSeconds--;

      if (timerEl) timerEl.innerText = countdownSeconds;
      if (actionBtn) actionBtn.innerText = `يرجى الانتظار (${countdownSeconds})`;

      if (countdownSeconds <= 0) {
        clearInterval(timerInterval);
        enableContinueButton();
      }
    }, 1000);
  }

  function enableContinueButton() {
    if (!actionBtn) return;

    actionBtn.disabled = false;
    actionBtn.innerText = 'الانتقال للرابط الآن';
    actionBtn.classList.add('active');

    if (window.TelegramApp && window.TelegramApp.triggerHaptic) {
      window.TelegramApp.triggerHaptic('notification', 'success');
    }

    actionBtn.addEventListener('click', handleContinueClick);
  }

  async function handleContinueClick() {
    actionBtn.disabled = true;
    actionBtn.innerText = 'جاري التوجيه...';

    const initData = window.TelegramApp ? window.TelegramApp.getInitData() : '';

    try {
      await fetch('/api/bridge/confirm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-init-data': initData
        },
        body: JSON.stringify({
          code: linkCode,
          campaignId: campaignId,
          startTime: startTime
        })
      });
    } catch (error) {
      console.error('[Confirm Impression Error]:', error);
    } finally {
      if (originalUrl) {
        window.location.href = originalUrl;
      } else {
        alert('حدث خطأ أثناء التوجيه.');
      }
    }
  }

  fetchLinkDetails();
});
