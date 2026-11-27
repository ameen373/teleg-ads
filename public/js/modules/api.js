export class ApiService {
  constructor(initData) {
    this.initData = initData || "";
    this.baseUrl = "/api";
  }

  async request(endpoint, options = {}) {
    try {
      const headers = {
        "Content-Type": "application/json",
        "X-Telegram-Init-Data": this.initData,
        ...(options.headers || {})
      };

      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Request failed");
      }
      return data;
    } catch (error) {
      console.error(`[API Error ${endpoint}]:`, error.message);
      throw error;
    }
  }

  syncUser(userPayload) {
    return this.request("/auth/sync", {
      method: "POST",
      body: JSON.stringify(userPayload)
    });
  }

  getChannels() {
    return this.request("/channels");
  }

  addChannel(username) {
    return this.request("/channels", {
      method: "POST",
      body: JSON.stringify({ username })
    });
  }

  getCampaigns() {
    return this.request("/campaigns");
  }

  createCampaign(payload) {
    return this.request("/campaigns", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  sendSupportTicket(message) {
    return this.request("/support", {
      method: "POST",
      body: JSON.stringify({ message })
    });
  }

  getAdminStats() {
    return this.request("/admin/stats");
  }

  sendAdminBroadcast(message) {
    return this.request("/admin/broadcast", {
      method: "POST",
      body: JSON.stringify({ message })
    });
  }
}
