function getInitData() {
  try {
    if (
      typeof window !== 'undefined' &&
      window.Telegram &&
      window.Telegram.WebApp &&
      typeof window.Telegram.WebApp.initData === 'string'
    ) {
      return window.Telegram.WebApp.initData;
    }
  } catch (err) {
    console.error('api.js getInitData error:', err);
  }
  return '';
}

export async function request(url, options = {}) {
  try {
    if (!url) {
      return Promise.resolve(null);
    }

    const initData = getInitData();
    const headers = Object.assign(
      {
        'Content-Type': 'application/json'
      },
      options.headers || {}
    );

    if (initData) {
      headers['x-telegram-init-data'] = initData;
    }

    const fetchOptions = {
      method: options.method || 'GET',
      headers
    };

    if (options.body !== undefined) {
      fetchOptions.body = JSON.stringify(options.body);
    }

    const response = await fetch(url, fetchOptions);
    let data = null;
    try {
      data = await response.json();
    } catch (_) {
      data = { ok: false, error: 'Invalid server response' };
    }

    if (!response.ok || !data || !data.ok) {
      const err = new Error(
        (data && data.error) || `Request failed (${response.status})`
      );
      err.status = response.status;
      err.data = data;
      throw err;
    }

    return data;
  } catch (err) {
    console.error('api.js request error:', err);
    throw err;
  }
}

const APIModule = {
  getInitData,

  getAccount(lang) {
    const query = lang ? `?lang=${encodeURIComponent(lang)}` : '';
    return request(`/api/account${query}`);
  },

  updateLanguage(language) {
    return request('/api/account/language', {
      method: 'POST',
      body: { language }
    });
  },

  createTicket(payload) {
    return request('/api/tickets', {
      method: 'POST',
      body: payload
    });
  },

  getTickets() {
    return request('/api/tickets');
  },

  getAdminOverview() {
    return request('/api/admin/overview');
  },

  replyToTicket(ticketId, reply) {
    return request(`/api/admin/tickets/${encodeURIComponent(ticketId)}/reply`, {
      method: 'POST',
      body: { reply }
    });
  },

  sendBroadcast(payload) {
    return request('/api/admin/broadcasts', {
      method: 'POST',
      body: payload
    });
  }
};

if (typeof window !== 'undefined') {
  window.APIModule = APIModule;
  window.request = request;
}

export default APIModule;
