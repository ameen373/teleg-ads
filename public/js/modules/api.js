export class ApiService {
  constructor(initData = "", options = {}) {
    this.initData = initData || "";
    this.baseUrl = options.baseUrl || "/api";
    this.defaultUserId = options.userId || "";
    this.defaultAdminKey = options.adminKey || "";
  }

  setUserId(userId) {
    this.defaultUserId = userId || "";
  }

  setAdminKey(adminKey) {
    this.defaultAdminKey = adminKey || "";
  }

  async request(endpoint, options = {}) {
    const normalizedEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;

    try {
      const headers = {
        "Content-Type": "application/json",
        ...(this.initData ? { "X-Telegram-Init-Data": this.initData } : {}),
        ...(options.headers || {})
      };

      // إزالة أي ترويسة بقيمة undefined أو null لتجنب إرسال قيم غير صالحة
      Object.keys(headers).forEach((key) => {
        if (headers[key] === undefined || headers[key] === null) {
          delete headers[key];
        }
      });

      const response = await fetch(`${this.baseUrl}${normalizedEndpoint}`, {
        ...options,
        headers
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }
      return data;
    } catch (error) {
      console.error(`[API Error ${normalizedEndpoint}]:`, error.message);
      throw error;
    }
  }

  // ==================== Auth & Channels & Campaigns ====================

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

  // ==================== Users & Wallet & Referrals ====================

  initUser(userId, extra = {}) {
    const resolvedUserId = userId || this.defaultUserId;
    return this.request("/users/init", {
      method: "POST",
      headers: { "x-user-id": resolvedUserId },
      body: JSON.stringify({ userId: resolvedUserId, ...extra })
    });
  }

  fetchWalletOverview(userId, referredBy = "") {
    const resolvedUserId = userId || this.defaultUserId;
    const query = new URLSearchParams({ userId: resolvedUserId });
    if (referredBy) {
      query.set("ref", referredBy);
    }
    return this.request(`/wallet/overview?${query.toString()}`, {
      headers: { "x-user-id": resolvedUserId }
    });
  }

  updateTrc20Address(userId, trc20WalletAddress) {
    const resolvedUserId = userId || this.defaultUserId;
    return this.request("/wallet/trc20-address", {
      method: "PUT",
      headers: { "x-user-id": resolvedUserId },
      body: JSON.stringify({ userId: resolvedUserId, trc20WalletAddress })
    });
  }

  createDepositRequest(userId, amountUsd, txid) {
    const resolvedUserId = userId || this.defaultUserId;
    return this.request("/wallet/deposits", {
      method: "POST",
      headers: { "x-user-id": resolvedUserId },
      body: JSON.stringify({ userId: resolvedUserId, amountUsd, txid })
    });
  }

  createWithdrawalRequest(userId, amountUsd, trc20WalletAddress) {
    const resolvedUserId = userId || this.defaultUserId;
    return this.request("/wallet/withdrawals", {
      method: "POST",
      headers: { "x-user-id": resolvedUserId },
      body: JSON.stringify({ userId: resolvedUserId, amountUsd, trc20WalletAddress })
    });
  }

  fetchReferrals(userId) {
    const resolvedUserId = userId || this.defaultUserId;
    return this.request(`/referrals?userId=${encodeURIComponent(resolvedUserId)}`, {
      headers: { "x-user-id": resolvedUserId }
    });
  }

  // ==================== Admin ====================

  getAdminStats() {
    return this.request("/admin/stats");
  }

  sendAdminBroadcast(message) {
    return this.request("/admin/broadcast", {
      method: "POST",
      body: JSON.stringify({ message })
    });
  }

  fetchAdminOverview(adminKey) {
    const resolvedAdminKey = adminKey || this.defaultAdminKey;
    return this.request("/admin/overview", {
      headers: { "x-admin-key": resolvedAdminKey }
    });
  }

  reviewDeposit(adminKey, depositId, decision, adminNote = "") {
    const resolvedAdminKey = adminKey || this.defaultAdminKey;
    return this.request(`/admin/deposits/${encodeURIComponent(depositId)}/review`, {
      method: "POST",
      headers: { "x-admin-key": resolvedAdminKey },
      body: JSON.stringify({ decision, adminNote })
    });
  }

  updateWithdrawalStep(adminKey, withdrawalId, payload) {
    const resolvedAdminKey = adminKey || this.defaultAdminKey;
    return this.request(`/admin/withdrawals/${encodeURIComponent(withdrawalId)}/step`, {
      method: "POST",
      headers: { "x-admin-key": resolvedAdminKey },
      body: JSON.stringify(payload)
    });
  }
}
