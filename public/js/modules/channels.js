'use strict';

(function (window) {
  const BOT_USERNAME = 'adTelega_bot';
  const BOT_ADMIN_LINK = `https://t.me/${BOT_USERNAME}?startchannel=true&admin=post_messages+edit_messages+delete_messages`;
  const MIN_CHANNEL_PRICE = 1;
  const MAX_CHANNEL_PRICE = 3;
  const SUBSCRIBER_THRESHOLD = 1000;

  const state = {
    channels: [],
    myChannels: [],
    marketplaceChannels: [],
    verifiedChannel: null,
    isVerifying: false,
    isSubmitting: false,
    syncingIds: {},
    eventsBound: false,
  };

  function tr(key, params = {}) {
    if (window.TelegaI18n && typeof window.TelegaI18n.t === 'function') {
      return window.TelegaI18n.t(key, params);
    }
    if (window.I18n && typeof window.I18n.t === 'function') {
      return window.I18n.t(key, params);
    }
    return key;
  }

  function escape(str) {
    if (window.TelegaUI && typeof window.TelegaUI.escapeHtml === 'function') {
      return window.TelegaUI.escapeHtml(str);
    }
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function notify(message, type = 'info') {
    if (window.TelegaUI && typeof window.TelegaUI.toast === 'function') {
      window.TelegaUI.toast(message, type, 'channels-feedback-banner');
    } else if (window.UI && typeof window.UI.notify === 'function') {
      window.UI.notify(message);
    }
  }

  function haptic(style = 'light') {
    if (window.UI && typeof window.UI.haptic === 'function') {
      window.UI.haptic(style);
    } else if (window.TelegaUI && typeof window.TelegaUI.haptic === 'function') {
      window.TelegaUI.haptic(style);
    }
  }

  function resetFeedback() {
    if (window.TelegaUI && typeof window.TelegaUI.clearFeedback === 'function') {
      window.TelegaUI.clearFeedback('channels-feedback-banner');
    }
  }

  async function channelApiRequest(url, options = {}) {
    if (window.TelegaApi && typeof window.TelegaApi.request === 'function') {
      return window.TelegaApi.request(url, options);
    }
    if (window.Api && typeof window.Api.request === 'function') {
      return window.Api.request(url, options);
    }
    if (url === '/api/channels' && (!options.method || options.method === 'GET') && window.Api?.getChannels) {
      return window.Api.getChannels();
    }
    if (url === '/api/channels' && options.method === 'POST' && window.Api?.addChannel) {
      return window.Api.addChannel(options.body || {});
    }
    throw new Error('TelegaApi / Api is not initialized');
  }

  function getChannelIdentifier(ch) {
    return ch?.chatId || ch?.id || ch?._id || ch?.channelUsername || ch?.username || '';
  }

  function getChannelHandle(ch) {
    const uname = ch?.username || ch?.channelUsername || '';
    if (uname) {
      return `@${String(uname).replace(/^@/, '')}`;
    }
    return String(ch?.chatId || ch?.id || ch?._id || '');
  }

  function getChannelSubscribers(ch) {
    return Number(ch?.subscribersCount ?? ch?.subscribers ?? 0);
  }

  function getChannelPrice(ch) {
    return Number(ch?.price ?? ch?.pricePerPost ?? 0);
  }

  function getStatusBadge(status, subscribersCount) {
    if (status === 'approved') {
      return `<span class="status-badge badge ${escape(status)}">${escape(tr('channels.badgeApproved') !== 'channels.badgeApproved' ? tr('channels.badgeApproved') : tr('status_approved'))}</span>`;
    }
    if (status === 'pending_admin' || status === 'pending') {
      const label =
        status === 'pending_admin' && tr('channels.badgePending') !== 'channels.badgePending'
          ? tr('channels.badgePending', { threshold: SUBSCRIBER_THRESHOLD })
          : tr('status_pending') !== 'status_pending'
          ? tr('status_pending')
          : status;
      return `<span class="status-badge badge ${escape(status)}">${escape(label)}</span>`;
    }
    if (status === 'rejected') {
      const label =
        tr('channels.badgeRejected') !== 'channels.badgeRejected'
          ? tr('channels.badgeRejected')
          : tr('status_rejected');
      return `<span class="status-badge badge ${escape(status)}">${escape(label)}</span>`;
    }
    if (status === 'bot_removed') {
      const label =
        tr('channels.badgeBotRemoved') !== 'channels.badgeBotRemoved'
          ? tr('channels.badgeBotRemoved')
          : status;
      return `<span class="status-badge badge ${escape(status)}">${escape(label)}</span>`;
    }

    const modeLabel =
      Number(subscribersCount || 0) > SUBSCRIBER_THRESHOLD
        ? tr('channels.autoTag')
        : tr('channels.manualTag');

    return `<span class="status-badge badge ${escape(status || 'neutral')}">${escape(status || tr('channels.badgeUnknown'))} (${escape(modeLabel)})</span>`;
  }

  function populateSelectOptions() {
    const langSelect = document.getElementById('channel-language-select');
    const catSelect = document.getElementById('channel-category-select');

    const languages = tr('channels.languages');
    if (langSelect && Array.isArray(languages)) {
      const currentVal = langSelect.value;
      langSelect.innerHTML = `<option value="">${escape(tr('channels.selectLanguage'))}</option>`;
      languages.forEach((lang) => {
        const opt = document.createElement('option');
        opt.value = lang.code;
        opt.textContent = lang.label;
        langSelect.appendChild(opt);
      });
      langSelect.value = currentVal;
    }

    const categories = tr('channels.categories');
    if (catSelect && Array.isArray(categories)) {
      const currentVal = catSelect.value;
      catSelect.innerHTML = `<option value="">${escape(tr('channels.selectCategory'))}</option>`;
      categories.forEach((cat) => {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.textContent = cat;
        catSelect.appendChild(opt);
      });
      catSelect.value = currentVal;
    }
  }

  function syncStaticChannelMeta() {
    const botBtn = document.getElementById('add-bot-admin-btn');
    if (botBtn) {
      botBtn.href = BOT_ADMIN_LINK;
      const label = tr('channels.addBotBtn', { bot: BOT_USERNAME });
      if (label !== 'channels.addBotBtn') {
        botBtn.textContent = label;
      }
    }

    const subtitleEl = document.querySelector('#channels-section .section-subtitle');
    if (subtitleEl) {
      const sub = tr('channels.subtitle', { bot: BOT_USERNAME });
      if (sub !== 'channels.subtitle') {
        subtitleEl.textContent = sub;
      }
    }

    const priceLabelEl = document.querySelector('label[for="channel-price-input"]');
    if (priceLabelEl) {
      const lbl = tr('channels.priceLabel', {
        min: MIN_CHANNEL_PRICE,
        max: MAX_CHANNEL_PRICE,
      });
      if (lbl !== 'channels.priceLabel') {
        priceLabelEl.textContent = lbl;
      }
    }

    populateSelectOptions();
  }

  function renderVerificationPreview() {
    const container = document.getElementById('channel-verification-preview');
    if (!container) {
      return;
    }

    if (!state.verifiedChannel) {
      container.innerHTML = '';
      container.classList.add('hidden');
      return;
    }

    const v = state.verifiedChannel;
    const isAuto = Number(v.subscribersCount || 0) > SUBSCRIBER_THRESHOLD;
    const approvalText = isAuto
      ? tr('channels.autoApprovalPolicy', { threshold: SUBSCRIBER_THRESHOLD })
      : tr('channels.manualApprovalPolicy', { threshold: SUBSCRIBER_THRESHOLD });

    container.classList.remove('hidden');
    container.innerHTML = `
      <div class="verified-card">
        <div class="verified-header">
          <strong>${escape(v.title)}</strong>
          <span class="verified-chip">${escape(tr('channels.verifiedChip'))}</span>
        </div>
        <div class="verified-meta">
          <span>${escape(tr('channels.identifierLabel'))} ${v.username ? '@' + escape(v.username) : escape(v.chatId)}</span>
          <span>${escape(tr('channels.subscribersInlineLabel'))} <strong>${Number(v.subscribersCount || 0).toLocaleString()}</strong></span>
        </div>
        <p class="verified-policy">${escape(approvalText)}</p>
      </div>
    `;
  }

  function renderMyChannels(channelsList) {
    const listEl = document.getElementById('my-channels-list');
    const countEl = document.getElementById('my-channels-count');
    const items = Array.isArray(channelsList) ? channelsList : state.channels;

    if (countEl) {
      countEl.textContent = String(items.length);
    }

    if (!listEl) {
      return;
    }

    if (!items || items.length === 0) {
      const noDataMsg =
        tr('channels.emptyTitle') !== 'channels.emptyTitle'
          ? tr('channels.emptyTitle')
          : tr('no_data');
      const hintMsg =
        tr('channels.emptyHint', { bot: BOT_USERNAME }) !== 'channels.emptyHint'
          ? `<span>${escape(tr('channels.emptyHint', { bot: BOT_USERNAME }))}</span>`
          : '';
      listEl.innerHTML = `
        <div class="empty-state-card empty-state">
          <p>${escape(noDataMsg)}</p>
          ${hintMsg}
        </div>
      `;
      return;
    }

    const hasRichFields = items.some(
      (ch) =>
        Object.prototype.hasOwnProperty.call(ch, 'chatId') ||
        Object.prototype.hasOwnProperty.call(ch, 'subscribersCount') ||
        Object.prototype.hasOwnProperty.call(ch, 'language') ||
        Object.prototype.hasOwnProperty.call(ch, 'promoPostPublished')
    );

    if (!hasRichFields) {
      listEl.innerHTML = items
        .map((ch) => {
          const uname = ch.channelUsername || ch.username || '';
          const subs = getChannelSubscribers(ch);
          const price = getChannelPrice(ch);
          return `
            <div class="list-item">
              <div class="item-main">
                <span class="item-title">${escape(ch.title)} ${uname ? `(@${escape(uname)})` : ''}</span>
                <span class="item-sub">${subs.toLocaleString()} subs • $${price}/post</span>
              </div>
              <span class="badge ${escape(ch.status)}">${escape(tr('status_' + ch.status))}</span>
            </div>
          `;
        })
        .join('');
      return;
    }

    listEl.innerHTML = items
      .map((ch) => {
        const channelId = getChannelIdentifier(ch);
        const isSyncing = Boolean(state.syncingIds[channelId]);
        const handleText = escape(getChannelHandle(ch));
        const subs = getChannelSubscribers(ch);
        const price = getChannelPrice(ch);
        const promoStatusText = ch.promoPostPublished
          ? tr('channels.promoPublished')
          : tr('channels.promoNotPublished');

        return `
          <div class="channel-item-card list-item" data-chat-id="${escape(channelId)}">
            <div class="channel-card-top">
              <div>
                <h4 class="channel-title item-title">${escape(ch.title)}</h4>
                <div class="channel-handle item-sub">${handleText}</div>
              </div>
              ${getStatusBadge(ch.status, subs)}
            </div>

            <div class="channel-stats-grid">
              <div class="stat-box">
                <span class="stat-label">${escape(tr('channels.subscribersLabel'))}</span>
                <strong class="stat-value">${subs.toLocaleString()}</strong>
              </div>
              <div class="stat-box">
                <span class="stat-label">${escape(tr('channels.postPriceLabel'))}</span>
                <strong class="stat-value">$${price.toFixed(2)}</strong>
              </div>
              <div class="stat-box">
                <span class="stat-label">${escape(tr('channels.languageShortLabel'))}</span>
                <strong class="stat-value">${escape(ch.language || '-')}</strong>
              </div>
              <div class="stat-box">
                <span class="stat-label">${escape(tr('channels.categoryShortLabel'))}</span>
                <strong class="stat-value">${escape(ch.category || '-')}</strong>
              </div>
            </div>

            <div class="channel-card-footer">
              <span class="promo-indicator">${escape(promoStatusText)}</span>
              <button
                type="button"
                class="btn btn-secondary btn-sm sync-channel-btn"
                data-sync-id="${escape(channelId)}"
                ${isSyncing ? 'disabled' : ''}
              >
                ${escape(isSyncing ? tr('channels.syncingBtn') : tr('channels.syncBtn'))}
              </button>
            </div>
          </div>
        `;
      })
      .join('');
  }

  function renderChannelsList() {
    renderMyChannels(state.channels);
  }

  async function loadChannels() {
    try {
      const data = await channelApiRequest('/api/channels', { method: 'GET' });
      const list = Array.isArray(data.channels)
        ? data.channels
        : Array.isArray(data.myChannels)
        ? data.myChannels
        : [];

      state.channels = list;
      state.myChannels = list;
      state.marketplaceChannels = Array.isArray(data.marketplaceChannels)
        ? data.marketplaceChannels
        : list.filter((c) => c.status === 'approved');

      renderMyChannels(list);

      if (
        window.CampaignsModule &&
        typeof window.CampaignsModule.populateChannelSelect === 'function'
      ) {
        window.CampaignsModule.populateChannelSelect(state.marketplaceChannels);
      }
    } catch (err) {
      notify(err.message || tr('channels.loadError'), 'error');
      renderMyChannels(state.channels);
    }
  }

  async function handleVerifyChannel() {
    if (state.isVerifying) {
      return;
    }

    resetFeedback();
    const inputEl =
      document.getElementById('channel-input') || document.getElementById('ch-username');
    const btnEl = document.getElementById('verify-channel-btn');
    const channelInput = inputEl ? inputEl.value.trim() : '';

    if (!channelInput) {
      notify(tr('channels.missingInputVerify'), 'warning');
      return;
    }

    state.isVerifying = true;
    state.verifiedChannel = null;
    renderVerificationPreview();
    if (btnEl) {
      btnEl.disabled = true;
      btnEl.textContent = tr('channels.verifyingBtn');
    }

    try {
      const res = await channelApiRequest('/api/channels/verify', {
        method: 'POST',
        body: { channelInput },
      });

      state.verifiedChannel = res.channel || null;
      renderVerificationPreview();
      notify(tr('channels.verifySuccess'), 'success');
    } catch (err) {
      state.verifiedChannel = null;
      renderVerificationPreview();
      notify(err.message || tr('channels.verifyError'), 'error');
    } finally {
      state.isVerifying = false;
      if (btnEl) {
        btnEl.disabled = false;
        btnEl.textContent = tr('channels.verifyBtn');
      }
    }
  }

  async function handleAddChannelSubmit(event) {
    event.preventDefault();
    if (state.isSubmitting) {
      return;
    }

    resetFeedback();
    const formEl = event.currentTarget || document.getElementById('add-channel-form');

    const newInputEl = document.getElementById('channel-input');
    const legacyUsernameEl = document.getElementById('ch-username');
    const legacyTitleEl = document.getElementById('ch-title');
    const legacySubsEl = document.getElementById('ch-subs');
    const newPriceEl = document.getElementById('channel-price-input');
    const legacyPriceEl = document.getElementById('ch-price');
    const langEl = document.getElementById('channel-language-select');
    const catEl = document.getElementById('channel-category-select');
    const submitBtn =
      document.getElementById('submit-channel-btn') ||
      (formEl ? formEl.querySelector('button[type="submit"]') : null);

    const channelInput = newInputEl
      ? newInputEl.value.trim()
      : legacyUsernameEl
      ? legacyUsernameEl.value.trim()
      : '';

    const rawPrice = newPriceEl
      ? newPriceEl.value
      : legacyPriceEl
      ? legacyPriceEl.value
      : '';
    const price = Number(rawPrice);

    const language = langEl ? langEl.value : '';
    const category = catEl ? catEl.value : '';

    if (newInputEl || langEl || catEl) {
      if (!channelInput) {
        notify(tr('channels.missingInputSubmit'), 'warning');
        return;
      }
      if (Number.isNaN(price) || price < MIN_CHANNEL_PRICE || price > MAX_CHANNEL_PRICE) {
        notify(
          tr('channels.invalidPrice', { min: MIN_CHANNEL_PRICE, max: MAX_CHANNEL_PRICE }),
          'warning'
        );
        return;
      }
      if (!language) {
        notify(tr('channels.missingLanguage'), 'warning');
        return;
      }
      if (!category) {
        notify(tr('channels.missingCategory'), 'warning');
        return;
      }
    }

    state.isSubmitting = true;
    if (submitBtn) {
      submitBtn.disabled = true;
      if (tr('channels.submittingBtn') !== 'channels.submittingBtn') {
        submitBtn.textContent = tr('channels.submittingBtn');
      }
    }

    try {
      let res;
      if (newInputEl || langEl || catEl) {
        res = await channelApiRequest('/api/channels', {
          method: 'POST',
          body: {
            channelInput,
            price,
            language,
            category,
          },
        });

        if (res.autoApproved) {
          notify(tr('channels.autoApprovedSuccess'), 'success');
        } else {
          notify(
            tr('channels.pendingAdminSuccess', { threshold: SUBSCRIBER_THRESHOLD }),
            'info'
          );
        }
      } else {
        const legacyPayload = {
          channelUsername: legacyUsernameEl ? legacyUsernameEl.value : '',
          title: legacyTitleEl ? legacyTitleEl.value : '',
          subscribers: legacySubsEl ? legacySubsEl.value : 0,
          pricePerPost: legacyPriceEl ? legacyPriceEl.value : 0,
        };
        if (window.Api && typeof window.Api.addChannel === 'function') {
          res = await window.Api.addChannel(legacyPayload);
        } else {
          res = await channelApiRequest('/api/channels', {
            method: 'POST',
            body: legacyPayload,
          });
        }
      }

      state.verifiedChannel = null;
      renderVerificationPreview();
      if (newInputEl) {
        newInputEl.value = '';
      }
      if (formEl && typeof formEl.reset === 'function') {
        formEl.reset();
      }
      haptic('medium');
      await loadChannels();
      if (window.App && typeof window.App.refreshUserData === 'function') {
        await window.App.refreshUserData();
      }
    } catch (err) {
      notify(err.message || tr('channels.submitError'), 'error');
    } finally {
      state.isSubmitting = false;
      if (submitBtn) {
        submitBtn.disabled = false;
        if (tr('channels.submitBtn') !== 'channels.submitBtn') {
          submitBtn.textContent = tr('channels.submitBtn');
        }
      }
    }
  }

  async function handleSyncChannel(chatId) {
    if (!chatId || state.syncingIds[chatId]) {
      return;
    }

    resetFeedback();
    state.syncingIds[chatId] = true;
    renderMyChannels(state.channels);

    try {
      const res = await channelApiRequest(
        `/api/channels/${encodeURIComponent(chatId)}/sync`,
        {
          method: 'POST',
        }
      );

      if (res.channel) {
        state.channels = state.channels.map((item) =>
          String(getChannelIdentifier(item)) === String(chatId) ? res.channel : item
        );
        state.myChannels = state.channels;
      }
      renderMyChannels(state.channels);
      notify(tr('channels.syncSuccess'), 'success');
    } catch (err) {
      notify(err.message || tr('channels.syncError'), 'error');
    } finally {
      state.syncingIds[chatId] = false;
      renderMyChannels(state.channels);
    }
  }

  function bindEvents() {
    if (state.eventsBound) {
      return;
    }
    state.eventsBound = true;

    const verifyBtn = document.getElementById('verify-channel-btn');
    if (verifyBtn) {
      verifyBtn.addEventListener('click', handleVerifyChannel);
    }

    const formEl = document.getElementById('add-channel-form');
    if (formEl) {
      formEl.addEventListener('submit', handleAddChannelSubmit);
    }

    const refreshBtn = document.getElementById('refresh-all-channels-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', loadChannels);
    }

    const listEl = document.getElementById('my-channels-list');
    if (listEl) {
      listEl.addEventListener('click', (event) => {
        const btn = event.target.closest('.sync-channel-btn');
        if (btn) {
          const targetId = btn.getAttribute('data-sync-id');
          handleSyncChannel(targetId);
        }
      });
    }
  }

  function initChannelsModule() {
    syncStaticChannelMeta();
    bindEvents();
    renderMyChannels(state.channels);
    loadChannels();
  }

  const ChannelsModule = {
    init() {
      initChannelsModule();
    },
    async load() {
      await loadChannels();
    },
    renderMyChannels(channelsList) {
      renderMyChannels(channelsList);
    },
  };

  window.ChannelsModule = ChannelsModule;
  window.TelegaChannelsModule = {
    init: initChannelsModule,
    reload: loadChannels,
    refreshLocale: function () {
      syncStaticChannelMeta();
      renderVerificationPreview();
      renderMyChannels(state.channels);
    },
    getState: function () {
      return state;
    },
  };
})(window);
