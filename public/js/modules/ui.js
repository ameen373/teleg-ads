import { t } from '../language/i18n.js';

let activeTab = 'home';

function isValidHexColor(color) {
  return typeof color === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color);
}

function detectThemeScheme() {
  const tg = window.Telegram && window.Telegram.WebApp;
  if (tg && (tg.colorScheme === 'light' || tg.colorScheme === 'dark')) {
    return tg.colorScheme;
  }

  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
    return 'light';
  }

  return 'dark';
}

export function applyTelegramTheme() {
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
}

export function initThemeListener() {
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
}

export function setActiveTab(tabName) {
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
}

export function refreshHeaderTitle() {
  const titleEl = document.getElementById('header-title');
  if (!titleEl) return;
  titleEl.textContent = t('nav_' + activeTab);
}

export function getActiveTab() {
  return activeTab;
}
