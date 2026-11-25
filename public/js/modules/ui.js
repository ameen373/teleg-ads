(function () {
  function translateKey(key, fallback = '', ctx) {
    if (!key) return fallback;
    try {
      if (ctx && typeof ctx.t === 'function') {
        const val = ctx.t(key, ctx);
        if (val !== undefined && val !== null) return val;
      }
      if (window.TelegaI18n && typeof window.TelegaI18n.t === 'function') {
        const val = window.TelegaI18n.t(key, ctx);
        if (val !== undefined && val !== null) return val;
      }
      if (window.I18N && typeof window.I18N.t === 'function') {
        const val = window.I18N.t(key, ctx);
        if (val !== undefined && val !== null) return val;
      }
    } catch (err) {
      console.error(err);
    }
    return fallback || key;
  }

  function getSupportedLanguages(ctx) {
    if (ctx && Array.isArray(ctx.supportedLanguages)) return ctx.supportedLanguages;
    if (Array.isArray(window.SUPPORTED_LANGUAGES)) return window.SUPPORTED_LANGUAGES;
    if (typeof SUPPORTED_LANGUAGES !== 'undefined' && Array.isArray(SUPPORTED_LANGUAGES)) {
      return SUPPORTED_LANGUAGES;
    }
    return ['English', 'Arabic'];
  }

  function getSupportedCategories(ctx) {
    if (ctx && Array.isArray(ctx.supportedCategories)) return ctx.supportedCategories;
    if (Array.isArray(window.SUPPORTED_CATEGORIES)) return window.SUPPORTED_CATEGORIES;
    if (typeof SUPPORTED_CATEGORIES !== 'undefined' && Array.isArray(SUPPORTED_CATEGORIES)) {
      return SUPPORTED_CATEGORIES;
    }
    return [];
  }

  function getAppState(ctx) {
    if (ctx && ctx.state && typeof ctx.state === 'object') return ctx.state;
    if (window.AppState && typeof window.AppState === 'object') return window.AppState;
    if (typeof AppState !== 'undefined' && AppState && typeof AppState === 'object') return AppState;
    return null;
  }

  function el(id, ctx) {
    if (!id) return null;
    if (ctx && typeof ctx.el === 'function') {
      const found = ctx.el(id);
      if (found) return found;
    }
    if (ctx && ctx.root && typeof ctx.root.querySelector === 'function') {
      const byId = ctx.root.querySelector(`#${CSS && CSS.escape ? CSS.escape(id) : id}`);
      if (byId) return byId;
    }
    return document.getElementById(id);
  }

  function buildContext(ctx) {
    if (ctx && ctx.state) return ctx;
    if (window.App && typeof window.App.getContext === 'function') {
      const appCtx = window.App.getContext();
      if (appCtx) return appCtx;
    }
    const state = getAppState(ctx);
    const baseCtx = {
      state,
      el: (id) => document.getElementById(id),
      apiRequest: async (url, options = {}) => {
        if (window.Api && typeof window.Api.request === 'function') {
          return window.Api.request(url, options, baseCtx);
        }
        const headers = Object.assign(
          {},
          state?.userId ? { 'x-user-id': String(state.userId) } : {},
          state?.adminKey ? { 'x-admin-key': String(state.adminKey) } : {},
          options.headers || {}
        );
        if (options.body !== undefined && !headers['Content-Type']) {
          headers['Content-Type'] = 'application/json';
        }
        const res = await fetch(url, Object.assign({}, options, { headers }));
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.ok === false || data.success === false) {
          throw new Error(data.error || data.message || 'Request failed');
        }
        return data;
      },
      syncOpenTargetingRule: () => {
        if (typeof window.handleBudgetTargetingState === 'function') {
          window.handleBudgetTargetingState(baseCtx);
        }
      },
      refreshWallet: async () => {
        if (typeof window.refreshWallet === 'function') {
          await window.refreshWallet(baseCtx);
        }
      },
      refreshCampaigns: async () => {
        if (typeof window.refreshCampaigns === 'function') {
          await window.refreshCampaigns(baseCtx);
        }
      },
      refreshChannels: async () => {
        if (typeof window.refreshChannels === 'function') {
          await window.refreshChannels(baseCtx);
        }
      },
      refreshAdminPanel: async () => {
        if (typeof window.refreshReliabilityData === 'function') {
          await window.refreshReliabilityData(baseCtx);
        }
      }
    };
    return baseCtx;
  }

  function showNotice(containerId, message, isError, ctx) {
    try {
      const box = el(containerId, ctx);
      if (!box) return;
      box.textContent = message || '';
      box.classList.remove('hidden', 'notice-error', 'notice-success');
      box.classList.add(isError ? 'notice-error' : 'notice-success');
    } catch (err) {
      console.error(err);
    }
  }

  function clearNotice(containerId, ctx) {
    try {
      const box = el(containerId, ctx);
      if (!box) return;
      box.textContent = '';
      box.classList.add('hidden');
    } catch (err) {
      console.error(err);
    }
  }

  function renderMaintenanceBanner(enabledOrData, message, ctx) {
    try {
      const activeCtx = buildContext(ctx);
      const isObj = enabledOrData && typeof enabledOrData === 'object';
      const enabled = isObj ? Boolean(enabledOrData.maintenanceMode) : Boolean(enabledOrData);
      const msgText = isObj ? enabledOrData.maintenanceMessage : message;

      if (activeCtx.state) {
        activeCtx.state.maintenanceMode = enabled;
      }

      const banner = el('maintenanceBanner', activeCtx);
      if (!banner) return;
      if (enabled) {
        banner.textContent = msgText || 'النظام في وضع الصيانة حالياً.';
        banner.classList.remove('hidden');
      } else {
        banner.classList.add('hidden');
      }
    } catch (err) {
      console.error(err);
    }
  }

  function syncReferralLink(ctx) {
    try {
      const activeCtx = buildContext(ctx);
      const userId = activeCtx.state?.userId || '';
      const refInput = el('referralLinkInput', activeCtx);
      if (!refInput || !userId) return;

      const baseUrl = `${window.location.origin}${window.location.pathname}`;
      const refUrl = `${baseUrl}?ref=${encodeURIComponent(userId)}`;
      refInput.value = refUrl;

      const footerLink = el('footerReferralLink', activeCtx);
      if (footerLink) {
        footerLink.href = refUrl;
      }
    } catch (err) {
      console.error(err);
    }
  }

  function saveDrafts(ctx) {
    try {
      const activeCtx = buildContext(ctx);
      const userId = activeCtx.state?.userId;
      if (!userId) return;

      const draft = {
        campaignTitle: el('campaignTitleInput', activeCtx)?.value ?? '',
        campaignBudget: el('campaignBudgetInput', activeCtx)?.value ?? '',
        campaignTargeting: el('campaignTargetingSelect', activeCtx)?.value ?? 'specific',
        ticketSubject: el('ticketSubjectInput', activeCtx)?.value ?? '',
        ticketMessage: el('ticketMessageInput', activeCtx)?.value ?? ''
      };
      localStorage.setItem(`telega_draft_${userId}`, JSON.stringify(draft));
    } catch (err) {
      console.error(err);
    }
  }

  function restoreDrafts(ctx) {
    try {
      const activeCtx = buildContext(ctx);
      const userId = activeCtx.state?.userId;
      if (!userId) return;

      const raw = localStorage.getItem(`telega_draft_${userId}`);
      if (!raw) return;
      const draft = JSON.parse(raw);
      if (!draft || typeof draft !== 'object') return;

      const titleInput = el('campaignTitleInput', activeCtx);
      const budgetInput = el('campaignBudgetInput', activeCtx);
      const targetingSelect = el('campaignTargetingSelect', activeCtx);
      const subjectInput = el('ticketSubjectInput', activeCtx);
      const messageInput = el('ticketMessageInput', activeCtx);

      if (typeof draft.campaignTitle === 'string' && titleInput) titleInput.value = draft.campaignTitle;
      if (typeof draft.campaignBudget === 'string' && draft.campaignBudget && budgetInput) {
        budgetInput.value = draft.campaignBudget;
      }
      if (typeof draft.campaignTargeting === 'string' && targetingSelect) {
        targetingSelect.value = draft.campaignTargeting;
      }
      if (typeof draft.ticketSubject === 'string' && subjectInput) subjectInput.value = draft.ticketSubject;
      if (typeof draft.ticketMessage === 'string' && messageInput) messageInput.value = draft.ticketMessage;

      if (typeof activeCtx.syncOpenTargetingRule === 'function') {
        activeCtx.syncOpenTargetingRule(activeCtx);
      }
    } catch (err) {
      console.error(err);
    }
  }

  function renderSmartAlerts(alerts, ctx) {
    try {
      const box = el('smartAlertsList', ctx);
      if (!box) return;

      const list = Array.isArray(alerts) ? alerts : [];
      if (list.length === 0) {
        box.innerHTML = '<div class="list-row"><span class="stat-label">لا توجد تنبيهات ذكية حالياً.</span></div>';
        return;
      }

      box.innerHTML = list
        .slice(0, 10)
        .map((a) => {
          return `
            <div class="list-row">
              <div>
                <strong>🔔 ${UI.escapeHTML(a.title || '')}</strong>
                <div class="stat-label">${UI.escapeHTML(a.message || '')}</div>
                <div class="stat-label">${UI.escapeHTML(a.createdAt || '')}</div>
              </div>
              <span class="badge badge-answered">${UI.escapeHTML(a.category || '')}</span>
            </div>
          `;
        })
        .join('');
    } catch (err) {
      console.error(err);
    }
  }

  async function refreshTicketsAndBroadcasts(ctx) {
    try {
      const activeCtx = buildContext(ctx);
      const state = activeCtx.state;
      const tktUrl = state?.userId
        ? `/api/tickets?userId=${encodeURIComponent(state.userId)}`
        : '/api/tickets';

      const [tktRes, bcastRes] = await Promise.all([
        activeCtx.apiRequest(tktUrl, undefined, activeCtx).catch(() => ({ tickets: [] })),
        activeCtx.apiRequest('/api/broadcasts', undefined, activeCtx).catch(() => ({ broadcasts: [] }))
      ]);

      const bcasts = Array.isArray(bcastRes?.broadcasts) ? bcastRes.broadcasts : [];
      const tickets = Array.isArray(tktRes?.tickets) ? tktRes.tickets : [];

      if (state) {
        state.tickets = tickets;
        state.broadcasts = bcasts;
      }

      const banner = el('broadcastBanner', activeCtx);
      if (banner) {
        if (bcasts.length > 0) {
          const latest = bcasts[0];
          banner.innerHTML = `<strong>📢 ${UI.escapeHTML(latest.title || '')}</strong><div>${UI.escapeHTML(latest.body || '')}</div><div class="stat-label">${UI.escapeHTML(latest.createdAt || '')}</div>`;
          banner.classList.remove('hidden');
        } else {
          banner.classList.add('hidden');
        }
      }

      const tktBox = el('ticketsList', activeCtx);
      if (!tktBox) return;

      if (tickets.length === 0) {
        tktBox.innerHTML = '<div class="list-row"><span class="stat-label">لا توجد تذاكر دعم حالياً.</span></div>';
        return;
      }

      tktBox.innerHTML = tickets
        .map((tk) => {
          const msgsHtml = (tk.messages || [])
            .map(
              (m) => `
                <div class="msg-bubble">
                  <strong>${m.sender === 'admin' ? 'الدعم الفني' : UI.escapeHTML(m.senderId || '')}:</strong> ${UI.escapeHTML(m.text || '')}
                  <div class="stat-label">${UI.escapeHTML(m.createdAt || '')}</div>
                </div>
              `
            )
            .join('');
          return `
            <div class="list-row">
              <div style="width:100%;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                  <strong>${UI.escapeHTML(tk.subject || '')}</strong>
                  <span class="badge badge-${UI.escapeHTML(tk.status || '')}">${UI.escapeHTML(tk.status || '')}</span>
                </div>
                ${msgsHtml}
              </div>
            </div>
          `;
        })
        .join('');
    } catch (err) {
      console.error(err);
      throw err;
    }
  }

  const UI = {
    el,
    showNotice,
    clearNotice,
    renderMaintenanceBanner,
    syncReferralLink,
    saveDrafts,
    restoreDrafts,
    renderSmartAlerts,
    refreshTicketsAndBroadcasts,

    bindEvents(ctx) {
      const activeCtx = buildContext(ctx);
      const state = activeCtx.state;

      const langArBtn = el('langArBtn', activeCtx);
      if (langArBtn) {
        langArBtn.addEventListener('click', () => {
          if (window.TelegaI18n && typeof window.TelegaI18n.applyLanguage === 'function') {
            window.TelegaI18n.applyLanguage('ar', activeCtx);
          }
        });
      }

      const langEnBtn = el('langEnBtn', activeCtx);
      if (langEnBtn) {
        langEnBtn.addEventListener('click', () => {
          if (window.TelegaI18n && typeof window.TelegaI18n.applyLanguage === 'function') {
            window.TelegaI18n.applyLanguage('en', activeCtx);
          }
        });
      }

      const loadUserBtn = el('loadUserBtn', activeCtx);
      if (loadUserBtn) {
        loadUserBtn.addEventListener('click', async () => {
          try {
            const nextUser = el('userIdInput', activeCtx)?.value.trim() || '';
            if (!nextUser || !state) return;
            state.userId = nextUser;
            try {
              localStorage.setItem('telega_user_id', nextUser);
            } catch (err) {
              console.error(err);
            }
            syncReferralLink(activeCtx);
            restoreDrafts(activeCtx);
            await activeCtx.apiRequest(
              '/api/users/init',
              {
                method: 'POST',
                body: JSON.stringify({ userId: nextUser, referredBy: state.referredBy || '' })
              },
              activeCtx
            );
            await Promise.all([
              activeCtx.refreshWallet ? activeCtx.refreshWallet(activeCtx) : Promise.resolve(),
              activeCtx.refreshCampaigns ? activeCtx.refreshCampaigns(activeCtx) : Promise.resolve(),
              activeCtx.refreshChannels ? activeCtx.refreshChannels(activeCtx) : Promise.resolve(),
              refreshTicketsAndBroadcasts(activeCtx)
            ]);
          } catch (err) {
            console.error(err);
            UI.showToast(err.message, activeCtx);
          }
        });
      }

      const copyAddressBtn = el('copyAddressBtn', activeCtx);
      if (copyAddressBtn) {
        copyAddressBtn.addEventListener('click', async () => {
          try {
            if (state?.walletAddress && navigator.clipboard?.writeText) {
              await navigator.clipboard.writeText(state.walletAddress);
            }
            const copiedLabel = translateKey('copiedText', 'Copied', activeCtx);
            const originalLabel = translateKey('copyAddressBtn', copyAddressBtn.textContent, activeCtx);
            copyAddressBtn.textContent = copiedLabel;
            setTimeout(() => {
              copyAddressBtn.textContent = originalLabel;
            }, 1500);
          } catch (err) {
            console.error(err);
          }
        });
      }

      const copyReferralBtn = el('copyReferralBtn', activeCtx);
      if (copyReferralBtn) {
        copyReferralBtn.addEventListener('click', async () => {
          try {
            const refInput = el('referralLinkInput', activeCtx);
            if (refInput && navigator.clipboard?.writeText) {
              await navigator.clipboard.writeText(refInput.value);
            }
            const copiedLabel = translateKey('copiedText', 'Copied', activeCtx);
            const originalLabel = translateKey('copyAddressBtn', copyReferralBtn.textContent, activeCtx);
            copyReferralBtn.textContent = copiedLabel;
            setTimeout(() => {
              copyReferralBtn.textContent = originalLabel;
            }, 1500);
          } catch (err) {
            console.error(err);
          }
        });
      }

      ['campaignTitleInput', 'campaignBudgetInput', 'campaignTargetingSelect', 'ticketSubjectInput', 'ticketMessageInput'].forEach(
        (id) => {
          const inputEl = el(id, activeCtx);
          if (!inputEl) return;
          inputEl.addEventListener('input', () => {
            if (id === 'campaignBudgetInput' && typeof activeCtx.syncOpenTargetingRule === 'function') {
              activeCtx.syncOpenTargetingRule(activeCtx);
            }
            saveDrafts(activeCtx);
          });
          inputEl.addEventListener('change', () => saveDrafts(activeCtx));
        }
      );

      const ticketForm = el('ticketForm', activeCtx);
      if (ticketForm) {
        ticketForm.addEventListener('submit', async (e) => {
          e.preventDefault();
          clearNotice('ticketNotice', activeCtx);
          try {
            const subject = el('ticketSubjectInput', activeCtx)?.value.trim() || '';
            const message = el('ticketMessageInput', activeCtx)?.value.trim() || '';
            await activeCtx.apiRequest(
              '/api/tickets',
              {
                method: 'POST',
                body: JSON.stringify({ userId: state?.userId, subject, message })
              },
              activeCtx
            );
            if (el('ticketSubjectInput', activeCtx)) el('ticketSubjectInput', activeCtx).value = '';
            if (el('ticketMessageInput', activeCtx)) el('ticketMessageInput', activeCtx).value = '';
            saveDrafts(activeCtx);
            showNotice('ticketNotice', 'تم إرسال تذكرة الدعم الفني بنجاح.', false, activeCtx);
            await Promise.all([
              refreshTicketsAndBroadcasts(activeCtx),
              state?.adminKey && activeCtx.refreshAdminPanel ? activeCtx.refreshAdminPanel(activeCtx) : Promise.resolve()
            ]);
          } catch (err) {
            showNotice('ticketNotice', err.message, true, activeCtx);
          }
        });
      }
    },

    notify(message) {
      try {
        if (window.Telegram?.WebApp?.showAlert) {
          window.Telegram.WebApp.showAlert(message);
        } else {
          alert(message);
        }
      } catch (err) {
        console.error(err);
      }
    },

    haptic(type = 'light') {
      try {
        if (window.Telegram?.WebApp?.HapticFeedback) {
          window.Telegram.WebApp.HapticFeedback.impactOccurred(type);
        }
      } catch (err) {
        console.error(err);
      }
    },

    hideLoader(ctx) {
      const loader = el('loader', ctx);
      if (loader) loader.classList.add('hidden');
    },

    switchView(targetId, ctx) {
      try {
        const root = ctx && ctx.root && typeof ctx.root.querySelectorAll === 'function' ? ctx.root : document;
        root.querySelectorAll('.view-section').forEach((sec) => {
          sec.classList.remove('active');
          if (sec.id === 'view-admin' && targetId !== 'view-admin') {
            sec.style.display = 'none';
          }
        });

        const targetSection = el(targetId, ctx);
        if (targetSection) {
          if (targetId === 'view-admin') {
            targetSection.style.display = 'block';
          }
          targetSection.classList.add('active');
        }

        root.querySelectorAll('.nav-item').forEach((btn) => {
          btn.classList.toggle('active', btn.getAttribute('data-target') === targetId);
        });

        window.scrollTo({ top: 0, behavior: 'smooth' });
        this.haptic('light');
      } catch (err) {
        console.error(err);
      }
    },

    updateNavBadge(badgeId, count, ctx) {
      const badge = el(badgeId, ctx);
      if (!badge) return;
      const num = Number(count) || 0;
      if (num > 0) {
        badge.textContent = num > 99 ? '99+' : num;
        badge.style.display = 'inline-block';
      } else {
        badge.style.display = 'none';
      }
    },

    renderUserHeader(user, ctx) {
      if (!user) return;
      const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || 'User';
      const nameEl = el('user-name', ctx);
      const idEl = el('user-id', ctx);
      const avatarEl = el('user-avatar', ctx);

      if (nameEl) nameEl.textContent = fullName;
      if (idEl) idEl.textContent = `ID: ${user.telegramId}`;

      if (avatarEl) {
        const tgPhoto = window.Telegram?.WebApp?.initDataUnsafe?.user?.photo_url || user.photoUrl;
        if (tgPhoto) {
          avatarEl.innerHTML = `<img src="${this.escapeHTML(tgPhoto)}" alt="${this.escapeHTML(fullName)}" />`;
        } else {
          avatarEl.textContent = fullName.charAt(0).toUpperCase();
        }
      }
    },

    renderHome(user, stats, transactions, ctx) {
      if (user) {
        const earningsEl = el('home-earnings-balance', ctx);
        const adBalanceEl = el('home-ad-balance', ctx);
        if (earningsEl) earningsEl.textContent = `$${Number(user.balance || 0).toFixed(2)}`;
        if (adBalanceEl) adBalanceEl.textContent = `$${Number(user.adBalance || 0).toFixed(2)}`;
      }

      if (stats) {
        const marketEl = el('stat-market-channels', ctx);
        const myChannelsEl = el('stat-my-channels', ctx);
        const myCampaignsEl = el('stat-my-campaigns', ctx);

        if (marketEl) marketEl.textContent = stats.activeChannels ?? 0;
        if (myChannelsEl) myChannelsEl.textContent = stats.userChannels ?? 0;
        if (myCampaignsEl) myCampaignsEl.textContent = stats.userCampaigns ?? 0;

        this.updateNavBadge('nav-badge-channels', stats.userChannels, ctx);
        this.updateNavBadge('nav-badge-campaigns', stats.userCampaigns, ctx);
      }

      const listEl = el('home-transactions-list', ctx);
      if (!listEl) return;

      if (!transactions || transactions.length === 0) {
        listEl.innerHTML = `<div class="empty-state">${this.escapeHTML(translateKey('no_data', 'No data', ctx))}</div>`;
        return;
      }

      listEl.innerHTML = transactions
        .map((tx) => {
          const amountNum = Number(tx.amount || 0);
          const sign = amountNum >= 0 ? '+' : '';
          const safeDetails = this.escapeHTML(tx.details || tx.type || '');
          const safeStatus = this.escapeHTML(tx.status || '');
          const statusLabel = this.escapeHTML(translateKey(`status_${tx.status}`, tx.status || '', ctx));
          const dateText = tx.createdAt ? this.escapeHTML(new Date(tx.createdAt).toLocaleDateString()) : '';

          return `
            <div class="list-item">
              <div class="item-main">
                <span class="item-title">${safeDetails}</span>
                <span class="item-sub">${dateText}</span>
              </div>
              <div style="text-align: end;">
                <div class="item-title">${sign}$${amountNum.toFixed(2)}</div>
                <span class="badge ${safeStatus}">${statusLabel}</span>
              </div>
            </div>
          `;
        })
        .join('');
    },

    showToast(message, ctx) {
      const toast = el('toast', ctx);
      if (!toast) return;
      toast.textContent = message;
      toast.classList.remove('hidden');
      clearTimeout(toast._timer);
      toast._timer = setTimeout(() => {
        toast.classList.add('hidden');
      }, 3200);
    },

    escapeHTML(str) {
      if (str === null || str === undefined) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    },

    populateDropdowns(ctx) {
      const languages = getSupportedLanguages(ctx);
      const categories = getSupportedCategories(ctx);

      const langSelects = [el('ch-language', ctx), el('camp-language', ctx)];
      langSelects.forEach((select) => {
        if (!select) return;
        const prevVal = select.value;
        select.innerHTML = languages
          .map((lang) => `<option value="${this.escapeHTML(lang)}">${this.escapeHTML(lang)}</option>`)
          .join('');
        if (prevVal && languages.includes(prevVal)) {
          select.value = prevVal;
        }
      });

      const catSelects = [el('ch-category', ctx), el('camp-category', ctx)];
      catSelects.forEach((select) => {
        if (!select) return;
        const prevVal = select.value;
        select.innerHTML = categories
          .map(
            (cat) =>
              `<option value="${this.escapeHTML(cat.value)}">${this.escapeHTML(
                translateKey(cat.key, cat.value, ctx)
              )}</option>`
          )
          .join('');
        if (prevVal) {
          select.value = prevVal;
        }
      });
    },

    getCategoryLabel(catValue, ctx) {
      const categories = getSupportedCategories(ctx);
      const found = categories.find((c) => c.value === catValue);
      return found ? translateKey(found.key, catValue, ctx) : catValue;
    },

    getApprovalLabel(status, ctx) {
      if (status === 'approved') return translateKey('status_approved', status, ctx);
      if (status === 'rejected') return translateKey('status_rejected', status, ctx);
      return translateKey('status_pending_review', status || 'pending', ctx);
    },

    getCampaignStatusLabel(status, ctx) {
      if (status === 'active') return translateKey('status_active', status, ctx);
      if (status === 'scheduled') return translateKey('status_scheduled', status, ctx);
      if (status === 'paused') return translateKey('status_paused', status, ctx);
      if (status === 'completed') return translateKey('status_completed', status, ctx);
      return translateKey('status_draft', status || 'draft', ctx);
    },

    getTxTypeLabel(type, ctx) {
      const map = {
        deposit: 'tx_type_deposit',
        withdraw: 'tx_type_withdraw',
        ad_spend: 'tx_type_ad_spend',
        ad_earning: 'tx_type_ad_earning',
        budget_topup: 'tx_type_budget_topup'
      };
      return translateKey(map[type] || type, type, ctx);
    },

    setupPriceSelector(pillsContainerId, inputId, onChangeCallback, ctx) {
      const container = el(pillsContainerId, ctx);
      const input = el(inputId, ctx);
      if (!container || !input) return;

      const pills = container.querySelectorAll('.price-pill');
      pills.forEach((pill) => {
        pill.addEventListener('click', () => {
          pills.forEach((p) => p.classList.remove('selected'));
          pill.classList.add('selected');
          input.value = pill.getAttribute('data-price') || '';
          if (typeof onChangeCallback === 'function') onChangeCallback(ctx);
        });
      });

      input.addEventListener('input', () => {
        const val = parseFloat(input.value);
        pills.forEach((p) => {
          if (parseFloat(p.getAttribute('data-price')) === val) {
            p.classList.add('selected');
          } else {
            p.classList.remove('selected');
          }
        });
        if (typeof onChangeCallback === 'function') onChangeCallback(ctx);
      });
    },

    closeAllChannelPanels(ctx) {
      [
        'panel-bot-instructions',
        'panel-add-channel',
        'panel-admin-queue',
        'panel-referrals',
        'panel-wallet',
        'panel-reliability'
      ].forEach((id) => {
        el(id, ctx)?.classList.add('hidden');
      });
    },

    updateChannelWizardStep(step, ctx) {
      const state = getAppState(ctx);
      if (state) state.channelStep = step;

      for (let i = 1; i <= 3; i++) {
        const stepEl = el(`ch-step-${i}`, ctx);
        const badgeEl = el(`ch-badge-${i}`, ctx);
        if (i === step) {
          stepEl?.classList.remove('hidden');
          badgeEl?.classList.add('active');
        } else {
          stepEl?.classList.add('hidden');
          badgeEl?.classList.remove('active');
        }
      }

      el('btn-ch-prev', ctx)?.classList.toggle('hidden', step === 1);
      el('btn-ch-next', ctx)?.classList.toggle('hidden', step === 3);
      el('btn-ch-save', ctx)?.classList.toggle('hidden', step !== 3);
    },

    resetChannelWizard(ctx) {
      const nameEl = el('ch-name', ctx);
      const usernameEl = el('ch-username', ctx);
      const langEl = el('ch-language', ctx);
      const catEl = el('ch-category', ctx);
      const priceEl = el('ch-price-input', ctx);
      const botAddedEl = el('ch-bot-added', ctx);

      if (nameEl) nameEl.value = '';
      if (usernameEl) usernameEl.value = '';
      if (langEl) langEl.selectedIndex = 0;
      if (catEl) catEl.selectedIndex = 0;
      if (priceEl) priceEl.value = '1';
      if (botAddedEl) botAddedEl.checked = false;

      document.querySelectorAll('#ch-price-pills .price-pill').forEach((p) => {
        p.classList.toggle('selected', p.getAttribute('data-price') === '1');
      });
      this.updateChannelWizardStep(1, ctx);
    },

    handleBudgetTargetingState(ctx) {
      const budgetEl = el('camp-budget', ctx);
      const budgetVal = budgetEl ? parseFloat(budgetEl.value) || 0 : 0;
      const isOpenTargeting = budgetVal > 1000;
      const banner = el('open-targeting-banner', ctx);
      const targetedBox = el('targeted-filters-box', ctx);

      banner?.classList.toggle('hidden', !isOpenTargeting);
      targetedBox?.classList.toggle('hidden', isOpenTargeting);
      return isOpenTargeting;
    },

    getCurrentCTAtext(ctx) {
      const presetEl = el('camp-btn-preset', ctx);
      const preset = presetEl ? presetEl.value : 'Open';
      if (preset === 'Custom') {
        const customEl = el('camp-custom-btn', ctx);
        const customText = customEl ? customEl.value.trim() : '';
        return customText || 'Open';
      }
      return preset || 'Open';
    },

    updateLivePreview(ctx) {
      const state = getAppState(ctx);
      const title = el('camp-title', ctx)?.value.trim() || '';
      const adText = el('camp-text', ctx)?.value.trim() || '';
      const mediaContainer = el('live-preview-media', ctx);
      const textContainer = el('live-preview-text', ctx);
      const ctaEl = el('live-preview-cta', ctx);

      if (textContainer) {
        textContainer.textContent = [title, adText].filter(Boolean).join('\n\n');
      }

      if (mediaContainer) {
        if (state && state.mediaType === 'photo' && state.mediaData) {
          mediaContainer.innerHTML = `<img src="${this.escapeHTML(state.mediaData)}" alt="Ad Media" class="preview-media-img" />`;
        } else if (state && state.mediaType === 'video' && state.mediaData) {
          mediaContainer.innerHTML = `<video src="${this.escapeHTML(state.mediaData)}" controls class="preview-media-video"></video>`;
        } else {
          mediaContainer.innerHTML = '';
        }
      }

      if (ctaEl) {
        ctaEl.textContent = this.getCurrentCTAtext(ctx);
      }
    },

    updateCampaignWizardStep(step, ctx) {
      const state = getAppState(ctx);
      if (state) state.campaignStep = step;

      for (let i = 1; i <= 3; i++) {
        const stepEl = el(`camp-step-${i}`, ctx);
        const badgeEl = el(`camp-badge-${i}`, ctx);
        if (i === step) {
          stepEl?.classList.remove('hidden');
          badgeEl?.classList.add('active');
        } else {
          stepEl?.classList.add('hidden');
          badgeEl?.classList.remove('active');
        }
      }

      el('btn-camp-prev', ctx)?.classList.toggle('hidden', step === 1);
      el('btn-camp-next', ctx)?.classList.toggle('hidden', step === 3);
      el('btn-camp-publish', ctx)?.classList.toggle('hidden', step !== 3);

      if (step === 2) {
        this.handleBudgetTargetingState(ctx);
      }
      if (step === 3) {
        this.updateLivePreview(ctx);
        if (typeof window.refreshMarketplaceChannels === 'function') {
          window.refreshMarketplaceChannels(ctx);
        }
      }
    },

    resetCampaignWizard(ctx) {
      const state = getAppState(ctx);
      if (state) {
        state.editingCampaignId = null;
        state.selectedChannelIds?.clear();
        state.mediaType = 'none';
        state.mediaData = '';
        state.mediaName = '';
        state.favoritesOnlyFilter = false;
      }

      const headingEl = el('campaign-wizard-heading', ctx);
      if (headingEl) {
        headingEl.textContent = translateKey('wizard_campaign_title', headingEl.textContent, ctx);
      }

      const setVal = (id, val) => {
        const target = el(id, ctx);
        if (target) target.value = val;
      };
      const setIdx = (id, idx) => {
        const target = el(id, ctx);
        if (target) target.selectedIndex = idx;
      };

      setVal('camp-title', '');
      setVal('camp-text', '');
      setVal('camp-media-file', '');
      el('btn-clear-media', ctx)?.classList.add('hidden');
      setVal('camp-btn-preset', 'Open');
      setVal('camp-custom-btn', '');
      el('camp-custom-btn-group', ctx)?.classList.add('hidden');
      setVal('camp-url', '');
      setVal('camp-budget', '50');
      setIdx('camp-language', 0);
      setIdx('camp-category', 0);
      setVal('camp-price-input', '1');
      setVal('camp-schedule-mode', 'immediate');
      setVal('mkt-search-input', '');

      document.querySelectorAll('#camp-price-pills .price-pill').forEach((p) => {
        p.classList.toggle('selected', p.getAttribute('data-price') === '1');
      });

      this.handleBudgetTargetingState(ctx);
      this.updateLivePreview(ctx);
      this.updateCampaignWizardStep(1, ctx);
    }
  };

  window.UI = UI;
})();
