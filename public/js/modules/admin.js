function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const AdminModule = {
  async renderAdminSection(container, state = {}) {
    if (!container) return;

    try {
      if (!state.isAdmin) {
        container.innerHTML = '';
        return;
      }

      const isAr = (typeof window !== 'undefined' && window.i18n && window.i18n.currentLang) === 'ar';
      const tickets = Array.isArray(state.tickets) ? state.tickets : [];
      const broadcasts = Array.isArray(state.broadcasts) ? state.broadcasts : [];

      const labels = isAr
        ? {
            title: 'لوحة الإدارة المحمية',
            subtitle: 'إدارة تذاكر الدعم الفني وإرسال التنبيهات والبث الجماعي الفوري',
            badge: 'صلاحية مشرف موثّقة',
            broadcastTitle: 'إرسال بث جماعي / تنبيه فوري',
            bcSubject: 'عنوان التنبيه',
            bcMessage: 'نص الرسالة الإدارية',
            bcLang: 'الفئة المستهدفة',
            bcAll: 'جميع اللغات (ALL)',
            bcSend: 'إرسال البث الآن',
            ticketsTitle: 'تذاكر المستخدمين',
            noTickets: 'لا توجد تذاكر للمستخدمين حالياً.',
            replyPlaceholder: 'اكتب رد الدعم الفني هنا...',
            replyBtn: 'إرسال الرد',
            repliedLabel: 'تم الرد:',
            broadcastsTitle: 'سجل التنبيهات المرسلة',
            noBroadcasts: 'لم يتم إرسال تنبيهات بعد.'
          }
        : {
            title: 'Protected Admin Console',
            subtitle: 'Manage support tickets and dispatch instant broadcasts & alerts',
            badge: 'Verified Admin Access',
            broadcastTitle: 'Send Broadcast / Instant Alert',
            bcSubject: 'Alert Title',
            bcMessage: 'Broadcast message',
            bcLang: 'Target Audience',
            bcAll: 'All Languages (ALL)',
            bcSend: 'Send Broadcast',
            ticketsTitle: 'User Support Tickets',
            noTickets: 'No user tickets yet.',
            replyPlaceholder: 'Write support reply here...',
            replyBtn: 'Send Reply',
            repliedLabel: 'Replied:',
            broadcastsTitle: 'Sent Broadcasts History',
            noBroadcasts: 'No broadcasts sent yet.'
          };

      const ticketsHtml = tickets.length
        ? tickets
            .map(
              (tk) => `
          <div class="card admin-ticket-card" data-ticket-id="${escapeHtml(tk.id)}">
            <div class="ticket-head">
              <div>
                <strong>${escapeHtml(tk.subject || 'Ticket')}</strong>
                <div class="muted-small">
                  ${escapeHtml(tk.fullName || tk.userId)}
                  ${tk.username ? `(@${escapeHtml(tk.username)})` : ''}
                  · ID: <code>${escapeHtml(tk.userId)}</code>
                </div>
              </div>
              <span class="badge">${escapeHtml(tk.status || 'open')}</span>
            </div>
            <p class="ticket-body">${escapeHtml(tk.message || '')}</p>
            ${
              tk.reply
                ? `<div class="ticket-reply"><strong>${escapeHtml(labels.repliedLabel)}</strong> ${escapeHtml(tk.reply)}</div>`
                : `
              <form class="admin-reply-form" data-reply-ticket-id="${escapeHtml(tk.id)}">
                <input
                  type="text"
                  name="reply"
                  class="input-field"
                  placeholder="${escapeHtml(labels.replyPlaceholder)}"
                  required
                />
                <button type="submit" class="btn-secondary">${escapeHtml(labels.replyBtn)}</button>
              </form>
            `
            }
          </div>
        `
            )
            .join('')
        : `<p class="empty-state">${escapeHtml(labels.noTickets)}</p>`;

      const broadcastsHtml = broadcasts.length
        ? broadcasts
            .map(
              (bc) => `
          <div class="broadcast-card">
            <div class="broadcast-head">
              <strong>${escapeHtml(bc.title || 'Broadcast')}</strong>
              <span class="badge">${escapeHtml(String(bc.targetLang || 'all').toUpperCase())}</span>
            </div>
            <p class="broadcast-body">${escapeHtml(bc.message || '')}</p>
          </div>
        `
            )
            .join('')
        : `<p class="empty-state">${escapeHtml(labels.noBroadcasts)}</p>`;

      container.innerHTML = `
        <section class="admin-view" aria-label="${escapeHtml(labels.title)}">
          <header class="view-header">
            <div>
              <h1 class="view-title">${escapeHtml(labels.title)}</h1>
              <p class="view-subtitle">${escapeHtml(labels.subtitle)}</p>
            </div>
            <span class="pill-badge pill-admin">${escapeHtml(labels.badge)}</span>
          </header>

          <div class="card admin-broadcast-card">
            <h2 class="card-title">${escapeHtml(labels.broadcastTitle)}</h2>
            <form id="admin-broadcast-form" class="ticket-form">
              <input
                type="text"
                name="title"
                class="input-field"
                placeholder="${escapeHtml(labels.bcSubject)}"
                required
              />
              <textarea
                name="message"
                rows="3"
                class="textarea-field"
                placeholder="${escapeHtml(labels.bcMessage)}"
                required
              ></textarea>
              <div class="form-row-inline">
                <select name="targetLang" class="select-field" aria-label="${escapeHtml(labels.bcLang)}">
                  <option value="all">${escapeHtml(labels.bcAll)}</option>
                  <option value="ar">🇸🇦 العربية (AR)</option>
                  <option value="en">🇬🇧 English (EN)</option>
                </select>
                <button type="submit" class="btn-primary">${escapeHtml(labels.bcSend)}</button>
              </div>
            </form>
          </div>

          <div class="card">
            <h2 class="card-title">${escapeHtml(labels.ticketsTitle)} (${tickets.length})</h2>
            <div class="tickets-list">${ticketsHtml}</div>
          </div>

          <div class="card">
            <h2 class="card-title">${escapeHtml(labels.broadcastsTitle)} (${broadcasts.length})</h2>
            <div class="broadcasts-list">${broadcastsHtml}</div>
          </div>
        </section>
      `;

      this.bindAdminEvents(container, state);
    } catch (err) {
      console.error('admin.js renderAdminSection error:', err);
    }
  },

  bindAdminEvents(container, state = {}) {
    try {
      const bcForm = container.querySelector('#admin-broadcast-form');
      if (bcForm) {
        bcForm.addEventListener('submit', async (e) => {
          e.preventDefault();
          try {
            const fd = new FormData(bcForm);
            const payload = {
              title: String(fd.get('title') || '').trim(),
              message: String(fd.get('message') || '').trim(),
              targetLang: String(fd.get('targetLang') || 'all')
            };
            if (!payload.title || !payload.message) return;

            if (typeof state.onSendBroadcast === 'function') {
              await state.onSendBroadcast(payload, bcForm);
            }
          } catch (err) {
            console.error('admin.js broadcast form error:', err);
          }
        });
      }

      container.querySelectorAll('.admin-reply-form').forEach((form) => {
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          try {
            const ticketId = form.getAttribute('data-reply-ticket-id');
            const fd = new FormData(form);
            const reply = String(fd.get('reply') || '').trim();
            if (!ticketId || !reply) return;

            if (typeof state.onReplyTicket === 'function') {
              await state.onReplyTicket(ticketId, reply, form);
            }
          } catch (err) {
            console.error('admin.js reply form error:', err);
          }
        });
      });
    } catch (err) {
      console.error('admin.js bindAdminEvents error:', err);
    }
  }
};

export async function init(container, state = {}) {
  try {
    if (container) {
      await AdminModule.renderAdminSection(container, state);
    }
  } catch (err) {
    console.error('admin.js init error:', err);
  }
}

if (typeof window !== 'undefined') {
  window.AdminModule = AdminModule;
}

export default AdminModule;
