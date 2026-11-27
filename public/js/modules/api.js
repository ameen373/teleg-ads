function getDefaultInitData() {
  try {
    return window?.Telegram?.WebApp?.initData || "";
  } catch {
    return "";
  }
}

function getSavedUserId() {
  try {
    return localStorage.getItem("telega_ads_uid")?.trim() || "";
  } catch {
    return "";
  }
}

export class ApiService {
  constructor(initData = "", options = {}) {
    this.initData = initData || "";
    this.baseUrl = String(options.baseUrl || "/api").replace(/\/+$/, "");
    this.defaultUserId = options.userId ? String(options.userId) : "";
    this.defaultAdminKey = options.adminKey ? String(options.adminKey) : "";
  }

  get userId() {
    return this.defaultUserId;
  }

  set userId(value) {
    this.defaultUserId = value ? String(value) : "";
  }

  get adminKey() {
    return this.defaultAdminKey;
  }

  set adminKey(value) {
    this.defaultAdminKey = value ? String(value) : "";
  }

  setUserId(userId) {
    this.defaultUserId = userId ? String(userId) : "";
  }

  setAdminKey(adminKey) {
    this.defaultAdminKey = adminKey ? String(adminKey) : "";
  }

  async request(endpoint, options = {}) {
    const rawEndpoint = String(endpoint || "");
    const normalizedEndpoint = rawEndpoint.startsWith("/") ? rawEndpoint : `/${rawEndpoint}`;
    const fullUrl = `${this.baseUrl}${normalizedEndpoint}`;

    try {
      const headers = {
        "Content-Type": "application/json",
        ...(this.initData ? { "X-Telegram-Init-Data": this.initData } : {}),
        ...(options.headers || {})
      };

      Object.keys(headers).forEach((key) => {
        if (headers[key] === undefined || headers[key] === null) {
          delete headers[key];
        }
      });

      const response = await fetch(fullUrl, {
        ...options,
        headers
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || data?.message || `HTTP ${response.status}`);
      }
      return data;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || "Request failed");
      console.error(`[API Error ${normalizedEndpoint}]:`, message);
      throw error instanceof Error ? error : new Error(message);
    }
  }

  // ==================== Auth & Channels & Campaigns ====================

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

  getCampaigns() {
    return this.request("/campaigns");
  }

  createCampaign(payload = {}) {
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
    const resolvedUserId = String(userId || this.defaultUserId || "").trim();
    const payload = {
      ...extra,
      ...(resolvedUserId ? { userId: resolvedUserId } : {})
    };

    return this.request("/users/init", {
      method: "POST",
      headers: resolvedUserId ? { "x-user-id": resolvedUserId } : {},
      body: JSON.stringify(payload)
    });
  }

  fetchWalletOverview(userId, referredBy = "") {
    const resolvedUserId = String(userId || this.defaultUserId || "").trim();
    const query = new URLSearchParams();
    if (resolvedUserId) {
      query.set("userId", resolvedUserId);
    }
    if (referredBy) {
      query.set("ref", String(referredBy));
    }

    const qs = query.toString();
    const endpoint = qs ? `/wallet/overview?${qs}` : "/wallet/overview";

    return this.request(endpoint, {
      headers: resolvedUserId ? { "x-user-id": resolvedUserId } : {}
    });
  }

  updateTrc20Address(userId, trc20WalletAddress) {
    const resolvedUserId = String(userId || this.defaultUserId || "").trim();
    return this.request("/wallet/trc20-address", {
      method: "PUT",
      headers: resolvedUserId ? { "x-user-id": resolvedUserId } : {},
      body: JSON.stringify({
        ...(resolvedUserId ? { userId: resolvedUserId } : {}),
        trc20WalletAddress
      })
    });
  }

  createDepositRequest(userId, amountUsd, txid) {
    const resolvedUserId = String(userId || this.defaultUserId || "").trim();
    return this.request("/wallet/deposits", {
      method: "POST",
      headers: resolvedUserId ? { "x-user-id": resolvedUserId } : {},
      body: JSON.stringify({
        ...(resolvedUserId ? { userId: resolvedUserId } : {}),
        amountUsd,
        txid
      })
    });
  }

  createWithdrawalRequest(userId, amountUsd, trc20WalletAddress) {
    const resolvedUserId = String(userId || this.defaultUserId || "").trim();
    return this.request("/wallet/withdrawals", {
      method: "POST",
      headers: resolvedUserId ? { "x-user-id": resolvedUserId } : {},
      body: JSON.stringify({
        ...(resolvedUserId ? { userId: resolvedUserId } : {}),
        amountUsd,
        trc20WalletAddress
      })
    });
  }

  fetchReferrals(userId) {
    const resolvedUserId = String(userId || this.defaultUserId || "").trim();
    const query = resolvedUserId ? `?userId=${encodeURIComponent(resolvedUserId)}` : "";

    return this.request(`/referrals${query}`, {
      headers: resolvedUserId ? { "x-user-id": resolvedUserId } : {}
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
    const resolvedAdminKey = String(adminKey || this.defaultAdminKey || "").trim();
    return this.request("/admin/overview", {
      headers: resolvedAdminKey ? { "x-admin-key": resolvedAdminKey } : {}
    });
  }

  reviewDeposit(adminKey, depositId, decision, adminNote = "") {
    const resolvedAdminKey = String(adminKey || this.defaultAdminKey || "").trim();
    const safeId = encodeURIComponent(String(depositId ?? ""));
    return this.request(`/admin/deposits/${safeId}/review`, {
      method: "POST",
      headers: resolvedAdminKey ? { "x-admin-key": resolvedAdminKey } : {},
      body: JSON.stringify({ decision, adminNote })
    });
  }

  updateWithdrawalStep(adminKey, withdrawalId, payload = {}) {
    const resolvedAdminKey = String(adminKey || this.defaultAdminKey || "").trim();
    const safeId = encodeURIComponent(String(withdrawalId ?? ""));
    return this.request(`/admin/withdrawals/${safeId}/step`, {
      method: "POST",
      headers: resolvedAdminKey ? { "x-admin-key": resolvedAdminKey } : {},
      body: JSON.stringify(payload)
    });
  }
}

function getSharedApiClient(userId = "") {
  const client = new ApiService(getDefaultInitData(), {
    userId: userId || getSavedUserId()
  });
  return client;
}

export function initUser(userId, extra = {}) {
  return getSharedApiClient(userId).initUser(userId, extra);
}

export function fetchWalletOverview(userId, referredBy = "") {
  return getSharedApiClient(userId).fetchWalletOverview(userId, referredBy);
}

export function updateTrc20Address(userId, trc20WalletAddress) {
  return getSharedApiClient(userId).updateTrc20Address(userId, trc20WalletAddress);
}

export function createDepositRequest(userId, amountUsd, txid) {
  return getSharedApiClient(userId).createDepositRequest(userId, amountUsd, txid);
}

export function createWithdrawalRequest(userId, amountUsd, trc20WalletAddress) {
  return getSharedApiClient(userId).createWithdrawalRequest(userId, amountUsd, trc20WalletAddress);
}

export function fetchReferrals(userId) {
  return getSharedApiClient(userId).fetchReferrals(userId);
}

export function fetchAdminOverview(adminKey) {
  return getSharedApiClient().fetchAdminOverview(adminKey);
}

export function reviewDeposit(adminKey, depositId, decision, adminNote = "") {
  return getSharedApiClient().reviewDeposit(adminKey, depositId, decision, adminNote);
}

export function updateWithdrawalStep(adminKey, withdrawalId, payload = {}) {
  return getSharedApiClient().updateWithdrawalStep(adminKey, withdrawalId, payload);
}
