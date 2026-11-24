// ==================== UI HELPERS, WIZARDS & PREVIEW ====================
(function () {
  function translateKey(key, fallback = '') {
    if (!key) return fallback;
    try {
      if (window.TelegaI18n && typeof window.TelegaI18n.t === 'function') {
        const val = window.TelegaI18n.t(key);
        if (val !== undefined && val !== null) return val;
      }
      if (window.I18n && typeof window.I18n.t === 'function') {
        const val = window.I18n.t(key);
        if (val !== undefined && val !== null) return val;
      }
      if (window.I18N && typeof window.I18N.t === 'function') {
        const val = window.I18N.t(key);
        if (val !== undefined && val !== null) return val;
      }
    } catch (err) {
      console.error(err);
    }
    return fallback || key;
  }

  function getSupportedLanguages() {
    if (Array.isArray(window.SUPPORTED_LANGUAGES)) return window.SUPPORTED_LANGUAGES;
    if (typeof SUPPORTED_LANGUAGES !== 'undefined' && Array.isArray(SUPPORTED_LANGUAGES)) {
      return SUPPORTED_LANGUAGES;
    }
    return ['English', 'Arabic'];
  }

  function getSupportedCategories() {
    if (Array.isArray(window.SUPPORTED_CATEGORIES)) return window.SUPPORTED_CATEGORIES;
    if (typeof SUPPORTED_CATEGORIES !== 'undefined' && Array.isArray(SUPPORTED_CATEGORIES)) {
      return SUPPORTED_CATEGORIES;
    }
    return [];
  }

  function getAppState() {
    if (window.AppState) return window.AppState;
    if (typeof AppState !== 'undefined') return AppState;
    return null;
  }

  function buildContext(ctx) {
    if (ctx && ctx.state) return ctx;
    if (window.App && typeof window.App.getContext === 'function') {
      return window.App.getContext();
    }
    const state = getAppState();
    return {
      state,
      el: (id) => document.getElementById(id),
      apiRequest: async (url, options = {}) => {
        if (window.Api && typeof window.Api.request === 'function') {
          return window.Api.request(url, options);
        }
        const headers = Object.assign(
          {},
          state?.userId ? { 'x-user-id': state.userId } : {},
          state?.adminKey ? { 'x-admin-key': state.adminKey } : {},
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
          window.handleBudgetTargetingState();
        }
        if (window.CampaignsModule && typeof window.CampaignsModule.syncOpenTargetingRule === 'function') {
          window.CampaignsModule.syncOpenTargetingRule(ctx);
        }
      },
      refreshWallet: async () => {
        if (window.WalletModule && typeof window.WalletModule.refresh === 'function') {
          await window.WalletModule.refresh();
        } else if (typeof window.fetchWallet === 'function') {
          await window.fetchWallet();
        }
      },
      refreshCampaigns: async () => {
        if (window.CampaignsModule && typeof window.CampaignsModule.load === 'function') {
          await window.CampaignsModule.load();
        } else if (typeof window.fetchCampaigns === 'function') {
          await window.fetchCampaigns();
        }
      },
      refreshChannels: async () => {
        if (window.ChannelsModule && typeof window.ChannelsModule.load === 'function') {
          await window.ChannelsModule.load();
        } else if (typeof window.fetchChannels === 'function') {
          await window.fetchChannels();
        }
      },
      refreshAdminPanel: async () => {
        if (window.AdminModule && typeof window.AdminModule.loadDashboard === 'function') {
          await window.AdminModule.loadDashboard();
        } else if (typeof window.fetchAdminOverview === 'function') {
          await window.fetchAdminOverview();
        }
      }
    };
  }

  function el(id) {
    return document.getElementById(id);
  }

  function showNotice(containerId, message, isError) {
    try {
      const box = el(containerId);
      if (!box) return;
      box.textContent = message || '';
      box.classList.remove('hidden', 'notice-error', 'notice-success');
      box.classList.add(isError ? 'notice-error' : 'notice-success');
    } catch (err) {
      console.error(err);
    }
  }

  function clearNotice(containerId) {
    try {
      const box = el(containerId);
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

      const banner = el('maintenanceBanner');
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
      const refInput = el('referralLinkInput');
      if (!refInput || !userId) return;

      const baseUrl = `${window.location.origin}${window.location.pathname}`;
      const refUrl = `${baseUrl}?ref=${encodeURIComponent(userId)}`;
      refInput.value = refUrl;

      const footerLink = el('footerReferralLink');
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
        campaignTitle: el('campaignTitleInput')?.value ?? '',
        campaignBudget: el('campaignBudgetInput')?.value ?? '',
        campaignTargeting: el('campaignTargetingSelect')?.value ?? 'specific',
        ticketSubject: el('ticketSubjectInput')?.value ?? '',
        ticketMessage: el('ticketMessageInput')?.value ?? ''
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

      const titleInput = el('campaignTitleInput');
      const budgetInput = el('campaignBudgetInput');
      const targetingSelect = el('campaignTargetingSelect');
      const subjectInput = el('ticketSubjectInput');
      const messageInput = el('ticketMessageInput');

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

  function renderSmartAlerts(alerts) {
    try {
      const box = el('smartAlertsList');
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

      const banner = el('broadcastBanner');
      if (banner) {
        if (bcasts.length > 0) {
          const latest = bcasts[0];
          banner.innerHTML = `<strong>📢 ${UI.escapeHTML(latest.title || '')}</strong><div>${UI.escapeHTML(latest.body || '')}</div><div class="stat-label">${UI.escapeHTML(latest.createdAt || '')}</div>`;
          banner.classList.remove('hidden');
        } else {
          banner.classList.add('hidden');
        }
      }

      const tktBox = el('ticketsList');
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

      const langArBtn = el('langArBtn');
      if (langArBtn) {
        langArBtn.addEventListener('click', () => {
          if (window.TelegaI18n && typeof window.TelegaI18n.applyLanguage === 'function') {
            window.TelegaI18n.applyLanguage('ar');
          }
        });
      }

      const langEnBtn = el('langEnBtn');
      if (langEnBtn) {
        langEnBtn.addEventListener('click', () => {
          if (window.TelegaI18n && typeof window.TelegaI18n.applyLanguage === 'function') {
            window.TelegaI18n.applyLanguage('en');
          }
        });
      }

      const loadUserBtn = el('loadUserBtn');
      if (loadUserBtn) {
        loadUserBtn.addEventListener('click', async () => {
          try {
            const nextUser = el('userIdInput')?.value.trim() || '';
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
            UI.showToast(err.message);
          }
        });
      }

      const copyAddressBtn = el('copyAddressBtn');
      if (copyAddressBtn) {
        copyAddressBtn.addEventListener('click', async () => {
          try {
            if (state?.walletAddress && navigator.clipboard?.writeText) {
              await navigator.clipboard.writeText(state.walletAddress);
            }
            const copiedLabel = window.TelegaI18n?.t ? window.TelegaI18n.t('copiedText') : 'Copied';
            const originalLabel = window.TelegaI18n?.t ? window.TelegaI18n.t('copyAddressBtn') : copyAddressBtn.textContent;
            copyAddressBtn.textContent = copiedLabel;
            setTimeout(() => {
              copyAddressBtn.textContent = originalLabel;
            }, 1500);
          } catch (err) {
            console.error(err);
          }
        });
      }

      const copyReferralBtn = el('copyReferralBtn');
      if (copyReferralBtn) {
        copyReferralBtn.addEventListener('click', async () => {
          try {
            const refInput = el('referralLinkInput');
            if (refInput && navigator.clipboard?.writeText) {
              await navigator.clipboard.writeText(refInput.value);
            }
            const copiedLabel = window.TelegaI18n?.t ? window.TelegaI18n.t('copiedText') : 'Copied';
            const originalLabel = window.TelegaI18n?.t ? window.TelegaI18n.t('copyAddressBtn') : copyReferralBtn.textContent;
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
          const inputEl = el(id);
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

      const ticketForm = el('ticketForm');
      if (ticketForm) {
        ticketForm.addEventListener('submit', async (e) => {
          e.preventDefault();
          clearNotice('ticketNotice');
          try {
            const subject = el('ticketSubjectInput')?.value.trim() || '';
            const message = el('ticketMessageInput')?.value.trim() || '';
            await activeCtx.apiRequest(
              '/api/tickets',
              {
                method: 'POST',
                body: JSON.stringify({ userId: state?.userId, subject, message })
              },
              activeCtx
            );
            if (el('ticketSubjectInput')) el('ticketSubjectInput').value = '';
            if (el('ticketMessageInput')) el('ticketMessageInput').value = '';
            saveDrafts(activeCtx);
            showNotice('ticketNotice', 'تم إرسال تذكرة الدعم الفني بنجاح.', false);
            await Promise.all([
              refreshTicketsAndBroadcasts(activeCtx),
              state?.adminKey && activeCtx.refreshAdminPanel ? activeCtx.refreshAdminPanel(activeCtx) : Promise.resolve()
            ]);
          } catch (err) {
            showNotice('ticketNotice', err.message, true);
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

    hideLoader() {
      const loader = el('loader');
      if (loader) loader.classList.add('hidden');
    },

    switchView(targetId) {
      try {
        document.querySelectorAll('.view-section').forEach((sec) => {
          sec.classList.remove('active');
          if (sec.id === 'view-admin' && targetId !== 'view-admin') {
            sec.style.display = 'none';
          }
        });

        const targetSection = el(targetId);
        if (targetSection) {
          if (targetId === 'view-admin') {
            targetSection.style.display = 'block';
          }
          targetSection.classList.add('active');
        }

        document.querySelectorAll('.nav-item').forEach((btn) => {
          btn.classList.toggle('active', btn.getAttribute('data-target') === targetId);
        });

        window.scrollTo({ top: 0, behavior: 'smooth' });
        this.haptic('light');
      } catch (err) {
        console.error(err);
      }
    },

    updateNavBadge(badgeId, count) {
      const badge = el(badgeId);
      if (!badge) return;
      const num = Number(count) || 0;
      if (num > 0) {
        badge.textContent = num > 99 ? '99+' : num;
        badge.style.display = 'inline-block';
      } else {
        badge.style.display = 'none';
      }
    },

    renderUserHeader(user) {
      if (!user) return;
      const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || 'User';
      const nameEl = el('user-name');
      const idEl = el('user-id');
      const avatarEl = el('user-avatar');

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

    renderHome(user, stats, transactions) {
      if (user) {
        const earningsEl = el('home-earnings-balance');
        const adBalanceEl = el('home-ad-balance');
        if (earningsEl) earningsEl.textContent = `$${Number(user.balance || 0).toFixed(2)}`;
        if (adBalanceEl) adBalanceEl.textContent = `$${Number(user.adBalance || 0).toFixed(2)}`;
      }

      if (stats) {
        const marketEl = el('stat-market-channels');
        const myChannelsEl = el('stat-my-channels');
        const myCampaignsEl = el('stat-my-campaigns');

        if (marketEl) marketEl.textContent = stats.activeChannels ?? 0;
        if (myChannelsEl) myChannelsEl.textContent = stats.userChannels ?? 0;
        if (myCampaignsEl) myCampaignsEl.textContent = stats.userCampaigns ?? 0;

        this.updateNavBadge('nav-badge-channels', stats.userChannels);
        this.updateNavBadge('nav-badge-campaigns', stats.userCampaigns);
      }

      const listEl = el('home-transactions-list');
      if (!listEl) return;

      if (!transactions || transactions.length === 0) {
        listEl.innerHTML = `<div class="empty-state">${this.escapeHTML(translateKey('no_data', 'No data'))}</div>`;
        return;
      }

      listEl.innerHTML = transactions
        .map((tx) => {
          const amountNum = Number(tx.amount || 0);
          const sign = amountNum >= 0 ? '+' : '';
          const safeDetails = this.escapeHTML(tx.details || tx.type || '');
          const safeStatus = this.escapeHTML(tx.status || '');
          const statusLabel = this.escapeHTML(translateKey(`status_${tx.status}`, tx.status || ''));
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

    showToast(message) {
      const toast = el('toast');
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

    populateDropdowns() {
      const languages = getSupportedLanguages();
      const categories = getSupportedCategories();

      const langSelects = [el('ch-language'), el('camp-language')];
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

      const catSelects = [el('ch-category'), el('camp-category')];
      catSelects.forEach((select) => {
        if (!select) return;
        const prevVal = select.value;
        select.innerHTML = categories
          .map(
            (cat) =>
              `<option value="${this.escapeHTML(cat.value)}">${this.escapeHTML(
                translateKey(cat.key, cat.value)
              )}</option>`
          )
          .join('');
        if (prevVal) {
          select.value = prevVal;
        }
      });
    },

    getCategoryLabel(catValue) {
      const categories = getSupportedCategories();
      const found = categories.find((c) => c.value === catValue);
      return found ? translateKey(found.key, catValue) : catValue;
    },

    getApprovalLabel(status) {
      if (status === 'approved') return translateKey('status_approved', status);
      if (status === 'rejected') return translateKey('status_rejected', status);
      return translateKey('status_pending_review', status || 'pending');
    },

    getCampaignStatusLabel(status) {
      if (status === 'active') return translateKey('status_active', status);
      if (status === 'scheduled') return translateKey('status_scheduled', status);
      if (status === 'paused') return translateKey('status_paused', status);
      if (status === 'completed') return translateKey('status_completed', status);
      return translateKey('status_draft', status || 'draft');
    },

    getTxTypeLabel(type) {
      const map = {
        deposit: 'tx_type_deposit',
        withdraw: 'tx_type_withdraw',
        ad_spend: 'tx_type_ad_spend',
        ad_earning: 'tx_type_ad_earning',
        budget_topup: 'tx_type_budget_topup'
      };
      return translateKey(map[type] || type, type);
    },

    setupPriceSelector(pillsContainerId, inputId, onChangeCallback) {
      const container = el(pillsContainerId);
      const input = el(inputId);
      if (!container || !input) return;

      const pills = container.querySelectorAll('.price-pill');
      pills.forEach((pill) => {
        pill.addEventListener('click', () => {
          pills.forEach((p) => p.classList.remove('selected'));
          pill.classList.add('selected');
          input.value = pill.getAttribute('data-price') || '';
          if (typeof onChangeCallback === 'function') onChangeCallback();
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
        if (typeof onChangeCallback === 'function') onChangeCallback();
      });
    },

    closeAllChannelPanels() {
      [
        'panel-bot-instructions',
        'panel-add-channel',
        'panel-admin-queue',
        'panel-referrals',
        'panel-wallet',
        'panel-reliability'
      ].forEach((id) => {
        el(id)?.classList.add('hidden');
      });
    },

    updateChannelWizardStep(step) {
      const state = getAppState();
      if (state) state.channelStep = step;

      for (let i = 1; i <= 3; i++) {
        const stepEl = el(`ch-step-${i}`);
        const badgeEl = el(`ch-badge-${i}`);
        if (i === step) {
          stepEl?.classList.remove('hidden');
          badgeEl?.classList.add('active');
        } else {
          stepEl?.classList.add('hidden');
          badgeEl?.classList.remove('active');
        }
      }

      el('btn-ch-prev')?.classList.toggle('hidden', step === 1);
      el('btn-ch-next')?.classList.toggle('hidden', step === 3);
      el('btn-ch-save')?.classList.toggle('hidden', step !== 3);
    },

    resetChannelWizard() {
      const nameEl = el('ch-name');
      const usernameEl = el('ch-username');
      const langEl = el('ch-language');
      const catEl = el('ch-category');
      const priceEl = el('ch-price-input');
      const botAddedEl = el('ch-bot-added');

      if (nameEl) nameEl.value = '';
      if (usernameEl) usernameEl.value = '';
      if (langEl) langEl.selectedIndex = 0;
      if (catEl) catEl.selectedIndex = 0;
      if (priceEl) priceEl.value = '1';
      if (botAddedEl) botAddedEl.checked = false;

      document.querySelectorAll('#ch-price-pills .price-pill').forEach((p) => {
        p.classList.toggle('selected', p.getAttribute('data-price') === '1');
      });
      this.updateChannelWizardStep(1);
    },

    handleBudgetTargetingState() {
      const budgetEl = el('camp-budget');
      const budgetVal = budgetEl ? parseFloat(budgetEl.value) || 0 : 0;
      const isOpenTargeting = budgetVal > 1000;
      const banner = el('open-targeting-banner');
      const targetedBox = el('targeted-filters-box');

      banner?.classList.toggle('hidden', !isOpenTargeting);
      targetedBox?.classList.toggle('hidden', isOpenTargeting);
      return isOpenTargeting;
    },

    getCurrentCTAtext() {
      const presetEl = el('camp-btn-preset');
      const preset = presetEl ? presetEl.value : 'Open';
      if (preset === 'Custom') {
        const customEl = el('camp-custom-btn');
        const customText = customEl ? customEl.value.trim() : '';
        return customText || 'Open';
      }
      return preset || 'Open';
    },

    updateLivePreview() {
      const state = getAppState();
      const title = el('camp-title')?.value.trim() || '';
      const adText = el('camp-text')?.value.trim() || '';
      const mediaContainer = el('live-preview-media');
      const textContainer = el('live-preview-text');
      const ctaEl = el('live-preview-cta');

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
        ctaEl.textContent = this.getCurrentCTAtext();
      }
    },

    updateCampaignWizardStep(step) {
      const state = getAppState();
      if (state) state.campaignStep = step;

      for (let i = 1; i <= 3; i++) {
        const stepEl = el(`camp-step-${i}`);
        const badgeEl = el(`camp-badge-${i}`);
        if (i === step) {
          stepEl?.classList.remove('hidden');
          badgeEl?.classList.add('active');
        } else {
          stepEl?.classList.add('hidden');
          badgeEl?.classList.remove('active');
        }
      }

      el('btn-camp-prev')?.classList.toggle('hidden', step === 1);
      el('btn-camp-next')?.classList.toggle('hidden', step === 3);
      el('btn-camp-publish')?.classList.toggle('hidden', step !== 3);

      if (step === 2) {
        this.handleBudgetTargetingState();
      }
      if (step === 3) {
        this.updateLivePreview();
        if (typeof window.fetchMarketplaceChannels === 'function') {
          window.fetchMarketplaceChannels();
        }
      }
    },

    resetCampaignWizard() {
      const state = getAppState();
      if (state) {
        state.editingCampaignId = null;
        state.selectedChannelIds?.clear();
        state.mediaType = 'none';
        state.mediaData = '';
        state.mediaName = '';
        state.favoritesOnlyFilter = false;
      }

      const headingEl = el('campaign-wizard-heading');
      if (headingEl) {
        headingEl.textContent = translateKey('wizard_campaign_title', headingEl.textContent);
      }

      const setVal = (id, val) => {
        const target = el(id);
        if (target) target.value = val;
      };
      const setIdx = (id, idx) => {
        const target = el(id);
        if (target) target.selectedIndex = idx;
      };

      setVal('camp-title', '');
      setVal('camp-text', '');
      setVal('camp-media-file', '');
      el('btn-clear-media')?.classList.add('hidden');
      setVal('camp-btn-preset', 'Open');
      setVal('camp-custom-btn', '');
      el('camp-custom-btn-group')?.classList.add('hidden');
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

      this.handleBudgetTargetingState();
      this.updateLivePreview();
      this.updateCampaignWizardStep(1);
    }
  };

  window.UI = UI;

  // Global helper functions compatible with direct calls across modules
  window.el = el;
  window.showNotice = showNotice;
  window.clearNotice = clearNotice;
  window.renderMaintenanceBanner = renderMaintenanceBanner;
  window.syncReferralLink = syncReferralLink;
  window.saveDrafts = saveDrafts;
  window.restoreDrafts = restoreDrafts;
  window.renderSmartAlerts = renderSmartAlerts;
  window.refreshTicketsAndBroadcasts = refreshTicketsAndBroadcasts;
  window.bindUiEvents = (ctx) => UI.bindEvents(ctx);
  window.showToast = (message) => UI.showToast(message);
  window.escapeHTML = (str) => UI.escapeHTML(str);
  window.populateDropdowns = () => UI.populateDropdowns();
  window.getCategoryLabel = (catValue) => UI.getCategoryLabel(catValue);
  window.getApprovalLabel = (status) => UI.getApprovalLabel(status);
  window.getCampaignStatusLabel = (status) => UI.getCampaignStatusLabel(status);
  window.getTxTypeLabel = (type) => UI.getTxTypeLabel(type);
  window.setupPriceSelector = (pillsContainerId, inputId, onChangeCallback) =>
    UI.setupPriceSelector(pillsContainerId, inputId, onChangeCallback);
  window.closeAllChannelPanels = () => UI.closeAllChannelPanels();
  window.updateChannelWizardStep = (step) => UI.updateChannelWizardStep(step);
  window.resetChannelWizard = () => UI.resetChannelWizard();
  window.handleBudgetTargetingState = () => UI.handleBudgetTargetingState();
  window.getCurrentCTAtext = () => UI.getCurrentCTAtext();
  window.updateLivePreview = () => UI.updateLivePreview();
  window.updateCampaignWizardStep = (step) => UI.updateCampaignWizardStep(step);
  window.resetCampaignWizard = () => UI.resetCampaignWizard();
})();
