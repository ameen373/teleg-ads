export class ApiService {
  constructor(initData) {
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
      if (!response.ok || data.success === false) {
        throw new Error(data.error || data.message || "Request failed");
      }
      return data;
    } catch (error) {
      console.error(`[API Error ${endpoint}]:`, error.message);
      throw error;
    }
  }

  syncUser(userPayload = {}) {
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

  getCampaigns(userId = "") {
    const query = userId ? `?userId=${encodeURIComponent(userId)}` : "";
    return this.request(`/campaigns${query}`);
  }

  createCampaign(payloadOrAdvertiserId, title, totalBudget) {
    let bodyPayload;
    if (payloadOrAdvertiserId && typeof payloadOrAdvertiserId === "object") {
      bodyPayload = payloadOrAdvertiserId;
    } else {
      bodyPayload = {
        advertiserId: payloadOrAdvertiserId,
        title,
        totalBudget
      };
    }

    return this.request("/campaigns", {
      method: "POST",
      body: JSON.stringify(bodyPayload)
    });
  }

  spendCampaign(campaignId, amount, publisherId) {
    return this.request(`/campaigns/${encodeURIComponent(campaignId)}/spend`, {
      method: "POST",
      body: JSON.stringify({ amount, publisherId })
    });
  }

  settleCampaign(campaignId) {
    return this.request(`/campaigns/${encodeURIComponent(campaignId)}/settle`, {
      method: "POST"
    });
  }

  // ================= قسم المحفظة والعمليات المالية =================

  getWalletData(userId = "", refCode = "") {
    const encodedId = userId ? `/${encodeURIComponent(userId)}` : "";
    const query = refCode ? `?ref=${encodeURIComponent(refCode)}` : "";
    return this.request(`/wallet${encodedId}${query}`);
  }

  getWalletTransactions(limit = 20) {
    const safeLimit = Number(limit) || 20;
    return this.request(`/wallet/transactions?limit=${encodeURIComponent(safeLimit)}`);
  }

  saveTrc20Address(userIdOrAddress, trc20Address) {
    const payload =
      trc20Address !== undefined
        ? { userId: userIdOrAddress, trc20Address }
        : { trc20Address: userIdOrAddress };

    return this.request("/wallet/address", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  requestWithdrawal(userIdOrAmount, amountOrAddress, maybeAddress) {
    let payload;
    if (typeof userIdOrAmount === "number" || (!Number.isNaN(Number(userIdOrAmount)) && amountOrAddress === undefined)) {
      payload = { amount: Number(userIdOrAmount) };
    } else if (typeof userIdOrAmount === "number" && typeof amountOrAddress === "string") {
      payload = { amount: Number(userIdOrAmount), trc20Address: amountOrAddress };
    } else {
      payload = {
        userId: userIdOrAmount,
        amount: Number(amountOrAddress),
        ...(maybeAddress ? { trc20Address: maybeAddress } : {})
      };
    }

    return this.request("/wallet/withdraw", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  submitDeposit(userIdOrAmount, amountOrTxid, txidArg) {
    let payload;
    if (typeof userIdOrAmount === "number" || (!Number.isNaN(Number(userIdOrAmount)) && typeof amountOrTxid === "string")) {
      payload = {
        amount: Number(userIdOrAmount),
        txid: amountOrTxid
      };
    } else {
      payload = {
        userId: userIdOrAmount,
        amount: Number(amountOrTxid),
        txid: txidArg
      };
    }

    return this.request("/wallet/deposit", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  recordPublisherEarning(publisherId, amount, campaignId = "") {
    return this.request("/earnings/publisher", {
      method: "POST",
      body: JSON.stringify({ publisherId, amount, campaignId })
    });
  }

  sendSupportTicket(message) {
    return this.request("/support", {
      method: "POST",
      body: JSON.stringify({ message })
    });
  }

  // ================= مسارات الإدارة =================

  getAdminStats() {
    return this.request("/admin/stats");
  }

  getAdminOverview() {
    return this.request("/admin/overview");
  }

  reviewDeposit(depositId, action, adminNote = "") {
    return this.request(`/admin/deposits/${encodeURIComponent(depositId)}/review`, {
      method: "POST",
      body: JSON.stringify({ action, adminNote })
    });
  }

  updateWithdrawalStatus(withdrawalId, status, txHash = "", adminNote = "") {
    return this.request(`/admin/withdrawals/${encodeURIComponent(withdrawalId)}/status`, {
      method: "POST",
      body: JSON.stringify({ status, txHash, adminNote })
    });
  }

  forceRelease24h(userId) {
    return this.request(`/admin/force-release/${encodeURIComponent(userId)}`, {
      method: "POST"
    });
  }

  sendAdminBroadcast(message) {
    return this.request("/admin/broadcast", {
      method: "POST",
      body: JSON.stringify({ message })
    });
  }
}

const defaultApiService = new ApiService();

export const api = {
  getWalletData: (userId, refCode = "") => defaultApiService.getWalletData(userId, refCode),
  getWalletTransactions: (limit = 20) => defaultApiService.getWalletTransactions(limit),
  saveTrc20Address: (userId, trc20Address) =>
    defaultApiService.saveTrc20Address(userId, trc20Address),
  requestWithdrawal: (userId, amount, trc20Address) =>
    defaultApiService.requestWithdrawal(userId, amount, trc20Address),
  submitDeposit: (userId, amount, txid) =>
    defaultApiService.submitDeposit(userId, amount, txid),
  recordPublisherEarning: (publisherId, amount, campaignId = "") =>
    defaultApiService.recordPublisherEarning(publisherId, amount, campaignId),
  getCampaigns: (userId = "") => defaultApiService.getCampaigns(userId),
  createCampaign: (advertiserId, title, totalBudget) =>
    defaultApiService.createCampaign(advertiserId, title, totalBudget),
  spendCampaign: (campaignId, amount, publisherId) =>
    defaultApiService.spendCampaign(campaignId, amount, publisherId),
  settleCampaign: (campaignId) => defaultApiService.settleCampaign(campaignId),
  getAdminOverview: () => defaultApiService.getAdminOverview(),
  reviewDeposit: (depositId, action, adminNote = "") =>
    defaultApiService.reviewDeposit(depositId, action, adminNote),
  updateWithdrawalStatus: (withdrawalId, status, txHash = "", adminNote = "") =>
    defaultApiService.updateWithdrawalStatus(withdrawalId, status, txHash, adminNote),
  forceRelease24h: (userId) => defaultApiService.forceRelease24h(userId)
};
