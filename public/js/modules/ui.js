import { t } from '../language/i18n.js';

let activeTab = 'home';

function isValidHexColor(color) {
  return typeof color === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color);
}

function detectThemeScheme() {
  try {
    const tg = window.Telegram && window.Telegram.WebApp;
    if (tg && (tg.colorScheme === 'light' || tg.colorScheme === 'dark')) {
      return tg.colorScheme;
    }

    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
      return 'light';
    }
  } catch (err) {
    console.error('ui.js detectThemeScheme error:', err);
  }

  return 'dark';
}

export function applyTelegramTheme() {
  try {
    const tg = window.Telegram && window.Telegram.WebApp;
    const scheme = detectThemeScheme();
    const root = document.documentElement;

    root.setAttribute('data-theme', scheme);

    if (tg) {
      const params = tg.themeParams || {};
      if (isValidHexColor(params.bg_color)) {
        root.style.setProperty('--bg-main', params.bg_color);
      }
      if (isValidHexColor(params.secondary_bg_color)) {
        root.style.setProperty('--pill-bg', params.secondary_bg_color);
        root.style.setProperty('--header-bg', params.secondary_bg_color);
      }
      if (isValidHexColor(params.text_color)) {
        root.style.setProperty('--text-light', params.text_color);
      }
      if (isValidHexColor(params.hint_color)) {
        root.style.setProperty('--text-muted', params.hint_color);
      }
      if (isValidHexColor(params.button_color)) {
        root.style.setProperty('--text-active', params.button_color);
        root.style.setProperty('--badge-bg', params.button_color);
      }
      if (isValidHexColor(params.button_text_color)) {
        root.style.setProperty('--badge-text', params.button_text_color);
      }

      if (typeof tg.setBackgroundColor === 'function' && isValidHexColor(params.bg_color)) {
        tg.setBackgroundColor(params.bg_color);
      }
      if (typeof tg.setHeaderColor === 'function' && isValidHexColor(params.secondary_bg_color)) {
        tg.setHeaderColor(params.secondary_bg_color);
      }
    }
  } catch (err) {
    console.error('ui.js applyTelegramTheme error:', err);
  }
}

export function initThemeListener() {
  try {
    applyTelegramTheme();

    const tg = window.Telegram && window.Telegram.WebApp;
    if (tg && typeof tg.onEvent === 'function') {
      tg.onEvent('themeChanged', applyTelegramTheme);
    }

    if (window.matchMedia) {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: light)');
      if (typeof mediaQuery.addEventListener === 'function') {
        mediaQuery.addEventListener('change', applyTelegramTheme);
      }
    }
  } catch (err) {
    console.error('ui.js initThemeListener error:', err);
  }
}

export function setActiveTab(tabName) {
  try {
    activeTab = tabName;

    const buttons = document.querySelectorAll('.nav-item');
    buttons.forEach((btn) => {
      const isMatch = btn.getAttribute('data-target') === tabName;
      btn.classList.toggle('active', isMatch);
    });

    const sections = document.querySelectorAll('.tab-section');
    sections.forEach((sec) => {
      const isMatch = sec.getAttribute('data-tab') === tabName;
      sec.classList.toggle('active', isMatch);
    });

    refreshHeaderTitle();
  } catch (err) {
    console.error('ui.js setActiveTab error:', err);
  }
}

export function refreshHeaderTitle() {
  try {
    const titleEl = document.getElementById('header-title');
    if (!titleEl) return;

    if (activeTab === 'home' || activeTab === 'account') {
      const accountTitle = t('account.title');
      if (accountTitle && accountTitle !== 'account.title') {
        titleEl.textContent = accountTitle;
        return;
      }
      const navHome = t('nav_home');
      titleEl.textContent = navHome && navHome !== 'الرئيسية' ? navHome : 'حسابي';
      return;
    }

    titleEl.textContent = t('nav_' + activeTab);
  } catch (err) {
    console.error('ui.js refreshHeaderTitle error:', err);
  }
}

export function getActiveTab() {
  return activeTab;
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getInitials(user) {
  const first = user && user.first_name ? user.first_name.trim()[0] : '';
  const last = user && user.last_name ? user.last_name.trim()[0] : '';
  return (first + last).toUpperCase() || 'TG';
}

function formatFullName(user) {
  if (!user) return 'Telegram User';
  return [user.first_name, user.last_name].filter(Boolean).join(' ').trim() || 'Telegram User';
}

function resolveTranslate(key, params) {
  try {
    if (window.i18n && typeof window.i18n.t === 'function') {
      return window.i18n.t(key, params);
    }
    return t(key);
  } catch (err) {
    console.error('ui.js resolveTranslate error:', err);
    return key;
  }
}

const UIModule = {
  renderAccountSection(container, state = {}) {
    if (!container) return;

    try {
      const translate = (key, params) => resolveTranslate(key, params);
      const currentLang = window.i18n ? window.i18n.currentLang : 'ar';
      const availableLangs =
        window.i18n && typeof window.i18n.getAvailableLanguages === 'function'
          ? window.i18n.getAvailableLanguages()
          : [];
      const upcomingLangs =
        window.i18n && typeof window.i18n.getUpcomingLanguages === 'function'
          ? window.i18n.getUpcomingLanguages()
          : [];

      const user = state.user || {};
      const fullName = formatFullName(user);
      const username = user.username ? `@${user.username}` : translate('account.identity.noUsername');
      const userId = user.id ? String(user.id) : '—';
      const photoUrl = user.photo_url || '';
      const tickets = Array.isArray(state.tickets) ? state.tickets : [];
      const broadcasts = Array.isArray(state.broadcasts) ? state.broadcasts : [];

      const rawAccountTitle = translate('account.title');
      const accountTitle =
        rawAccountTitle && rawAccountTitle !== 'account.title'
          ? rawAccountTitle
          : currentLang === 'ar'
            ? 'حسابي'
            : 'My Account';

      const faqItems = translate('account.faq.items');
      const faqHtml = Array.isArray(faqItems)
        ? faqItems
            .map(
              (item, idx) => `
          <details class="faq-item" ${idx === 0 ? 'open' : ''}>
            <summary class="faq-question">${escapeHtml(item.q)}</summary>
            <div class="faq-answer">${escapeHtml(item.a)}</div>
          </details>
        `
            )
            .join('')
        : '';

      const langButtonsHtml = availableLangs
        .map((lang) => {
          const activeClass = lang.code === currentLang ? 'is-active' : '';
          return `
          <button type="button" class="lang-btn ${activeClass}" data-lang-code="${escapeHtml(lang.code)}">
            <span class="lang-flag">${escapeHtml(lang.flag)}</span>
            <span class="lang-label">${escapeHtml(lang.label)}</span>
          </button>
        `;
        })
        .join('');

      const upcomingChipsHtml = upcomingLangs
        .map(
          (item) => `
        <span class="upcoming-chip" title="${escapeHtml(item.label)}">
          ${escapeHtml(item.flag)} ${escapeHtml(item.label)}
        </span>
      `
        )
        .join('');

      const ticketsHtml = tickets.length
        ? tickets
            .map(
              (tk) => `
          <div class="ticket-card">
            <div class="ticket-head">
              <strong>${escapeHtml(tk.subject || 'Ticket')}</strong>
              <span class="badge">${escapeHtml(tk.status || 'open')}</span>
            </div>
            <p class="ticket-body">${escapeHtml(tk.message || '')}</p>
            ${tk.reply ? `<div class="ticket-reply">${escapeHtml(tk.reply)}</div>` : ''}
          </div>
        `
            )
            .join('')
        : `<p class="empty-state">${escapeHtml(translate('account.support.emptyTickets'))}</p>`;

      const broadcastsHtml = broadcasts.length
        ? broadcasts
            .map(
              (bc) => `
          <div class="broadcast-card">
            <div class="broadcast-head">
              <strong>${escapeHtml(bc.title || 'Admin Alert')}</strong>
              <span class="broadcast-time">${escapeHtml(bc.createdAt || '')}</span>
            </div>
            <p class="broadcast-body">${escapeHtml(bc.message || '')}</p>
          </div>
        `
            )
            .join('')
        : `<p class="empty-state">${escapeHtml(translate('account.support.emptyBroadcasts'))}</p>`;

      container.innerHTML = `
        <section class="account-view" aria-label="${escapeHtml(accountTitle)}">
          <header class="view-header">
            <div>
              <h1 class="view-title">${escapeHtml(accountTitle)}</h1>
              <p class="view-subtitle">${escapeHtml(translate('account.subtitle'))}</p>
            </div>
            <span class="pill-badge">${escapeHtml(translate('account.autoDetectedBadge'))}</span>
          </header>

          <!-- Telegram-Style Profile Hero -->
          <div class="tg-profile-hero">
            <div class="avatar-wrap">
              ${
                photoUrl
                  ? `<img src="${escapeHtml(photoUrl)}" alt="${escapeHtml(translate('account.identity.photoAlt'))}" class="avatar-img" />`
                  : `<div class="avatar-fallback">${escapeHtml(getInitials(user))}</div>`
              }
            </div>
            <div class="identity-meta">
              <h2 class="identity-name">${escapeHtml(fullName)}</h2>
              <div class="identity-status-line">${escapeHtml(translate('account.identity.onlineStatus'))}</div>
              <span class="verified-tag">${escapeHtml(translate('account.identity.verifiedTg'))}</span>
            </div>
          </div>

          <!-- Quick Action Buttons (Telegram Profile Style) -->
          <div class="tg-quick-actions" role="group" aria-label="${escapeHtml(accountTitle)}">
            <button type="button" class="tg-quick-btn" id="quick-copy-id-btn" data-copy-id="${escapeHtml(userId)}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
              <span>${escapeHtml(translate('account.identity.copyId'))}</span>
            </button>

            <button type="button" class="tg-quick-btn" id="quick-support-btn">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M12 20h9"></path>
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
              </svg>
              <span>${escapeHtml(translate('account.support.ticketsTab'))}</span>
            </button>

            <button type="button" class="tg-quick-btn" id="quick-lang-settings-btn">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
              </svg>
              <span>${escapeHtml(translate('account.language.title'))}</span>
            </button>
          </div>

          <!-- Telegram-Style Details Card -->
          <div class="card identity-card">
            <div class="tg-detail-list">
              <div class="tg-detail-row">
                <div class="tg-detail-content">
                  <div class="tg-detail-main">
                    <code class="info-code" id="account-user-id">${escapeHtml(userId)}</code>
                  </div>
                  <div class="tg-detail-sub">${escapeHtml(translate('account.identity.userId'))}</div>
                </div>
                <button type="button" class="btn-mini" id="copy-user-id-btn" data-copy-id="${escapeHtml(userId)}">
                  ${escapeHtml(translate('account.identity.copyId'))}
                </button>
              </div>

              <div class="tg-detail-row">
                <div class="tg-detail-content">
                  <div class="tg-detail-main">${escapeHtml(username)}</div>
                  <div class="tg-detail-sub">${escapeHtml(translate('account.identity.username'))}</div>
                </div>
              </div>

              <div class="tg-detail-row">
                <div class="tg-detail-content">
                  <div class="tg-detail-main">${escapeHtml(currentLang.toUpperCase())}</div>
                  <div class="tg-detail-sub">${escapeHtml(translate('account.language.currentLabel'))}</div>
                </div>
              </div>
            </div>
          </div>

          <!-- Language Switcher Card -->
          <div class="card language-card" id="account-language-card">
            <div class="card-head-row">
              <h2 class="card-title">${escapeHtml(translate('account.language.title'))}</h2>
              <button type="button" class="btn-ghost" id="reset-auto-lang-btn">
                ${escapeHtml(translate('account.language.autoDetectBtn'))}
              </button>
            </div>
            <p class="helper-note">${escapeHtml(translate('account.fallbackNotice'))}</p>

            <div class="lang-switcher" role="group" aria-label="${escapeHtml(translate('account.language.switchManual'))}">
              ${langButtonsHtml}
            </div>

            <div class="upcoming-langs">
              <div class="upcoming-title">${escapeHtml(translate('account.language.upcomingTitle'))}</div>
              <div class="upcoming-list">${upcomingChipsHtml}</div>
            </div>
          </div>

          <!-- FAQ Card -->
          <div class="card faq-card">
            <h2 class="card-title">${escapeHtml(translate('account.faq.title'))}</h2>
            <div class="faq-list">${faqHtml}</div>
          </div>

          <!-- Support & Broadcasts Card -->
          <div class="card support-card" id="account-support-card">
            <h2 class="card-title">${escapeHtml(translate('account.support.title'))}</h2>

            <div class="subtabs">
              <button type="button" class="subtab-btn is-active" data-support-tab="tickets">
                ${escapeHtml(translate('account.support.ticketsTab'))}
              </button>
              <button type="button" class="subtab-btn" data-support-tab="broadcasts">
                ${escapeHtml(translate('account.support.broadcastsTab'))} (${broadcasts.length})
              </button>
            </div>

            <div class="support-panel" data-panel="tickets">
              <form id="support-ticket-form" class="ticket-form">
                <input
                  type="text"
                  name="subject"
                  class="input-field"
                  placeholder="${escapeHtml(translate('account.support.subjectPlaceholder'))}"
                  required
                />
                <textarea
                  name="message"
                  rows="3"
                  class="textarea-field"
                  placeholder="${escapeHtml(translate('account.support.messagePlaceholder'))}"
                  required
                ></textarea>
                <button type="submit" class="btn-primary">
                  ${escapeHtml(translate('account.support.sendTicket'))}
                </button>
              </form>
              <div class="tickets-list" id="tickets-list">${ticketsHtml}</div>
            </div>

            <div class="support-panel is-hidden" data-panel="broadcasts">
              <div class="broadcasts-list" id="broadcasts-list">${broadcastsHtml}</div>
            </div>
          </div>
        </section>
      `;

      this.bindAccountEvents(container, state);
    } catch (err) {
      console.error('ui.js renderAccountSection error:', err);
    }
  },

  bindAccountEvents(container, state = {}) {
    try {
      const translate = (key, params) => resolveTranslate(key, params);

      container.querySelectorAll('[data-lang-code]').forEach((btn) => {
        btn.addEventListener('click', () => {
          try {
            const code = btn.getAttribute('data-lang-code');
            if (window.i18n && typeof window.i18n.setLanguage === 'function') {
              window.i18n.setLanguage(code, { persist: true });
            }
            refreshHeaderTitle();
            if (typeof state.onLanguageChange === 'function') {
              state.onLanguageChange(code);
            }
          } catch (err) {
            console.error('ui.js lang button click error:', err);
          }
        });
      });

      const resetBtn = container.querySelector('#reset-auto-lang-btn');
      if (resetBtn) {
        resetBtn.addEventListener('click', () => {
          try {
            const detected =
              window.i18n && typeof window.i18n.resetToAutoDetect === 'function'
                ? window.i18n.resetToAutoDetect()
                : 'en';
            refreshHeaderTitle();
            if (typeof state.onLanguageChange === 'function') {
              state.onLanguageChange(detected);
            }
          } catch (err) {
            console.error('ui.js reset auto lang error:', err);
          }
        });
      }

      const handleCopyId = async (triggerBtn) => {
        if (!triggerBtn) return;
        const idVal = triggerBtn.getAttribute('data-copy-id') || '';
        if (!idVal || idVal === '—') return;
        try {
          await navigator.clipboard.writeText(idVal);
          const copyBtn = container.querySelector('#copy-user-id-btn');
          if (copyBtn) {
            copyBtn.textContent = translate('account.identity.copied');
            setTimeout(() => {
              copyBtn.textContent = translate('account.identity.copyId');
            }, 1500);
          }
        } catch (err) {
          console.error('ui.js clipboard write error:', err);
        }
      };

      const copyBtn = container.querySelector('#copy-user-id-btn');
      if (copyBtn) {
        copyBtn.addEventListener('click', () => handleCopyId(copyBtn));
      }

      const quickCopyBtn = container.querySelector('#quick-copy-id-btn');
      if (quickCopyBtn) {
        quickCopyBtn.addEventListener('click', () => handleCopyId(quickCopyBtn));
      }

      const quickSupportBtn = container.querySelector('#quick-support-btn');
      if (quickSupportBtn) {
        quickSupportBtn.addEventListener('click', () => {
          const supportCard = container.querySelector('#account-support-card');
          if (supportCard) {
            supportCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        });
      }

      const quickLangBtn = container.querySelector('#quick-lang-settings-btn');
      if (quickLangBtn) {
        quickLangBtn.addEventListener('click', () => {
          const langCard = container.querySelector('#account-language-card');
          if (langCard) {
            langCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        });
      }

      container.querySelectorAll('[data-support-tab]').forEach((tabBtn) => {
        tabBtn.addEventListener('click', () => {
          try {
            const target = tabBtn.getAttribute('data-support-tab');
            container
              .querySelectorAll('[data-support-tab]')
              .forEach((b) => b.classList.remove('is-active'));
            tabBtn.classList.add('is-active');

            container.querySelectorAll('[data-panel]').forEach((panel) => {
              panel.classList.toggle('is-hidden', panel.getAttribute('data-panel') !== target);
            });
          } catch (err) {
            console.error('ui.js support tab click error:', err);
          }
        });
      });

      const form = container.querySelector('#support-ticket-form');
      if (form) {
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          try {
            const formData = new FormData(form);
            const payload = {
              subject: String(formData.get('subject') || '').trim(),
              message: String(formData.get('message') || '').trim()
            };
            if (!payload.subject || !payload.message) return;

            if (typeof state.onSubmitTicket === 'function') {
              await state.onSubmitTicket(payload, form);
            }
          } catch (err) {
            console.error('ui.js support ticket submit error:', err);
          }
        });
      }
    } catch (err) {
      console.error('ui.js bindAccountEvents error:', err);
    }
  }
};

if (typeof window !== 'undefined') {
  window.UIModule = UIModule;
}
