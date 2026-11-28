export class ApiService {
  constructor(initData = "") {
    this.initData = initData || "";
    this.baseUrl = "/api";
  }

  setInitData(initData) {
    this.initData = initData || "";
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

  // حسابي والدعم الفني (Account & Support)
  syncUser(userPayload) {
    return this.request("/auth/sync", {
      method: "POST",
      body: JSON.stringify(userPayload)
    });
  }

  sendSupportTicket(message) {
    return this.request("/support", {
      method: "POST",
      body: JSON.stringify({ message })
    });
  }

  // قنواتي (My Channels)
  getChannels() {
    return this.request("/channels");
  }

  addChannel(username) {
    return this.request("/channels", {
      method: "POST",
      body: JSON.stringify({ username })
    });
  }

  // الترويج (Promotion / Campaigns)
  getCampaigns() {
    return this.request("/campaigns");
  }

  createCampaign(payload) {
    return this.request("/campaigns", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  // المحفظة والإحالة (Wallet & Referral)
  getWalletAndReferral() {
    return this.request("/wallet");
  }

  saveTrc20Address(address) {
    return this.request("/wallet/trc20", {
      method: "POST",
      body: JSON.stringify({ address })
    });
  }

  submitDeposit(payload) {
    return this.request("/wallet/deposit", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  submitWithdrawal(payload) {
    return this.request("/wallet/withdraw", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  // الإدارة (Admin)
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

export function createApiService(initData = "") {
  return new ApiService(initData);
}
