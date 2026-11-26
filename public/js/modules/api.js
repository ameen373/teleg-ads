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

  // Wallet APIs
  getWalletOverview() {
    return this.request("/wallet/overview");
  }

  saveWithdrawAddress(address) {
    return this.request("/wallet/address", {
      method: "POST",
      body: JSON.stringify({ address })
    });
  }

  submitDeposit(amount, txid) {
    return this.request("/wallet/deposit", {
      method: "POST",
      body: JSON.stringify({ amount, txid })
    });
  }

  submitWithdraw(amount, address) {
    return this.request("/wallet/withdraw", {
      method: "POST",
      body: JSON.stringify({ amount, address })
    });
  }

  // Channels APIs
  getChannels() {
    return this.request("/channels");
  }

  addChannel(username) {
    return this.request("/channels", {
      method: "POST",
      body: JSON.stringify({ username })
    });
  }

  // Campaigns APIs
  getCampaigns() {
    return this.request("/campaigns");
  }

  createCampaign(payload) {
    return this.request("/campaigns", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  settleCampaign(campaignId) {
    return this.request(`/campaigns/${campaignId}/settle`, {
      method: "POST"
    });
  }

  // Support
  sendSupportTicket(message) {
    return this.request("/support", {
      method: "POST",
      body: JSON.stringify({ message })
    });
  }

  // Admin APIs
  getAdminStats() {
    return this.request("/admin/stats");
  }

  getAdminFinanceQueue() {
    return this.request("/admin/finance-queue");
  }

  reviewDeposit(depositId, action) {
    return this.request(`/admin/deposits/${depositId}/review`, {
      method: "POST",
      body: JSON.stringify({ action })
    });
  }

  reviewWithdrawal(withdrawalId, action, txHash = "") {
    return this.request(`/admin/withdrawals/${withdrawalId}/review`, {
      method: "POST",
      body: JSON.stringify({ action, txHash })
    });
  }

  creditPublisherEarning(publisherId, amount, campaignTitle) {
    return this.request("/admin/credit-publisher", {
      method: "POST",
      body: JSON.stringify({ publisherId, amount, campaignTitle })
    });
  }

  sendAdminBroadcast(message) {
    return this.request("/admin/broadcast", {
      method: "POST",
      body: JSON.stringify({ message })
    });
  }
}
