const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:4001";

export const marketStatuses = ["active", "resolved", "archived"] as const;

export type MarketStatus = (typeof marketStatuses)[number];

// Types
export interface Market {
  id: number;
  title: string;
  description?: string;
  status: MarketStatus;
  creator?: string;
  outcomes: Array<MarketOutcome>;
  totalMarketBets: number;
}

export interface MarketOutcome {
  id: number;
  title: string;
  odds: number;
  totalBets: number;
}

export interface User {
  id: number;
  username: string;
  email: string;
  token: string;
  role?: "user" | "admin";
  balance?: number;
  apiKey?: string | null;
}

export interface Bet {
  id: number;
  userId: number;
  marketId: number;
  outcomeId: number;
  amount: number;
  createdAt: string;
}

export interface ResolvedBetSummary {
  id: number;
  marketId: number;
  marketTitle: string;
  outcomeTitle: string;
  result: "won" | "lost";
  payout: number | null;
}

export interface ActiveBetSummary {
  id: number;
  marketId: number;
  marketTitle: string;
  outcomeId: number;
  outcomeTitle: string;
  amount: number;
  currentOdds: number;
}

export interface ArchivedBetSummary {
  id: number;
  marketId: number;
  marketTitle: string;
  outcomeTitle: string;
  amount: number;
}

export interface LeaderboardEntry {
  userId: number;
  username: string;
  totalWinnings: number;
}

// API Client
class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private getAuthHeader(): Record<string, string> {
    const token = localStorage.getItem("auth_token");
    if (!token) return {};
    return { Authorization: `Bearer ${token}` };
  }

  private async request(endpoint: string, options: RequestInit = {}): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      "Content-Type": "application/json",
      ...this.getAuthHeader(),
      ...options.headers,
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    const contentType = response.headers.get("content-type") || "";
    const rawBody = await response.text();
    const data =
      rawBody.length > 0 && contentType.includes("application/json")
        ? JSON.parse(rawBody)
        : rawBody.length > 0
          ? { error: rawBody }
          : {};

    if (response.status === 401) {
      localStorage.removeItem("auth_token");
      localStorage.removeItem("auth_user");
      window.dispatchEvent(new CustomEvent("auth:logout"));
    }

    if (!response.ok) {
      if (data.errors && Array.isArray(data.errors)) {
        const errorMessage = data.errors.map((e: any) => `${e.field}: ${e.message}`).join(", ");
        throw new Error(errorMessage);
      }
      throw new Error(data.error || `API Error: ${response.status}`);
    }

    return data ?? {};
  }

  // Auth endpoints
  async register(username: string, email: string, password: string): Promise<User> {
    return this.request("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, email, password }),
    });
  }

  async login(email: string, password: string): Promise<User> {
    return this.request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  }

  async getMe(): Promise<User> {
    return this.request("/api/auth/me");
  }

  async getResolvedBets(limit = 20, offset = 0): Promise<Array<ResolvedBetSummary>> {
    return this.request(`/api/auth/me/resolved-bets?limit=${limit}&offset=${offset}`);
  }

  async getActiveBets(limit = 20, offset = 0): Promise<Array<ActiveBetSummary>> {
    return this.request(`/api/auth/me/active-bets?limit=${limit}&offset=${offset}`);
  }

  async getArchivedBets(limit = 20, offset = 0): Promise<Array<ArchivedBetSummary>> {
    return this.request(`/api/auth/me/archived-bets?limit=${limit}&offset=${offset}`);
  }

  async getLeaderboard(): Promise<Array<LeaderboardEntry>> {
    return this.request("/api/markets/leaderboard");
  }

  // Markets endpoints
  async listMarkets(status: MarketStatus = "active", limit = 20, offset = 0): Promise<Array<Market>> {
    return this.request(`/api/markets?status=${status}&limit=${limit}&offset=${offset}`);
  }

  async getMarket(id: number): Promise<Market> {
    return this.request(`/api/markets/${id}`);
  }

  async resolveMarket(
    marketId: number,
    outcomeId: number,
  ): Promise<{ success: boolean; market: Market }> {
    return this.request(`/api/markets/${marketId}/resolve`, {
      method: "POST",
      body: JSON.stringify({ outcomeId }),
    });
  }

  async archiveMarket(marketId: number): Promise<{ success: boolean; market: Market }> {
    return this.request(`/api/markets/${marketId}/archive`, {
      method: "POST",
    });
  }

  subscribeToMarketUpdates(
    marketId: number,
    onMarketUpdate: (market: Market) => void,
  ): () => void {
    const eventSource = new EventSource(`${this.baseUrl}/api/markets/${marketId}/stream`);

    eventSource.onmessage = (event) => {
      try {
        onMarketUpdate(JSON.parse(event.data) as Market);
      } catch (error) {
        console.error("Failed to parse market update", error);
      }
    };

    return () => {
      eventSource.close();
    };
  }

  async createMarket(title: string, description: string, outcomes: Array<string>): Promise<Market> {
    return this.request("/api/markets", {
      method: "POST",
      body: JSON.stringify({ title, description, outcomes }),
    });
  }

  // Bets endpoints
  async placeBet(marketId: number, outcomeId: number, amount: number): Promise<Bet> {
    return this.request(`/api/markets/${marketId}/bets`, {
      method: "POST",
      body: JSON.stringify({ outcomeId, amount }),
    });
  }

  // API key endpoints
  async getApiKey(): Promise<{ apiKey: string | null }> {
    return this.request("/api/auth/me/api-key");
  }

  async generateApiKey(): Promise<{ apiKey: string }> {
    return this.request("/api/auth/me/api-key", { method: "POST" });
  }

  async revokeApiKey(): Promise<void> {
    await this.request("/api/auth/me/api-key", { method: "DELETE" });
  }
}

export const api = new ApiClient(API_BASE_URL);
