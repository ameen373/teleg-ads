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

  // Wallet Endpoints
  getWalletSummary() {
    return this.request("/wallet/summary");
  }

  saveWithdrawalAddress(address) {
    return this.request("/wallet/address", {
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

  // Referrals Endpoint
  getReferralSummary() {
    return this.request("/referrals/summary");
  }

  // Channels Endpoints
  getChannels() {
    return this.request("/channels");
  }

  addChannel(username) {
    return this.request("/channels", {
      method: "POST",
      body: JSON.stringify({ username })
    });
  }

  // Campaigns Endpoints
  getCampaigns() {
    return this.request("/campaigns");
  }

  createCampaign(payload) {
    return this.request("/campaigns", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  completeCampaign(campaignId) {
    return this.request(`/campaigns/${encodeURIComponent(campaignId)}/complete`, {
      method: "POST"
    });
  }

  // Support Endpoint
  sendSupportTicket(message) {
    return this.request("/support", {
      method: "POST",
      body: JSON.stringify({ message })
    });
  }

  // Admin Endpoints
  getAdminStats() {
    return this.request("/admin/stats");
  }

  getAdminFinanceRequests() {
    return this.request("/admin/finance/requests");
  }

  reviewDepositRequest(depositId, action, note = "") {
    return this.request(`/admin/deposits/${encodeURIComponent(depositId)}/decision`, {
      method: "POST",
      body: JSON.stringify({ action, note })
    });
  }

  reviewWithdrawalRequest(withdrawalId, status, txHash = "", note = "") {
    return this.request(`/admin/withdrawals/${encodeURIComponent(withdrawalId)}/decision`, {
      method: "POST",
      body: JSON.stringify({ status, txHash, note })
    });
  }

  sendAdminBroadcast(message) {
    return this.request("/admin/broadcast", {
      method: "POST",
      body: JSON.stringify({ message })
    });
  }
}
