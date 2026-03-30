import { describe, it, expect, beforeAll } from "bun:test";
import { eq } from "drizzle-orm";
import { applyMigrations } from "../src/db/apply-migrations";
import { betsTable, marketOutcomesTable, marketsTable } from "../src/db/schema";
import type { ActiveBetSummary } from "../../client/src/lib/api";

const BASE = "http://localhost";

type AuthPayload = {
  id: number;
  username: string;
  email: string;
  token: string;
  role?: string;
};

type ValidationErrorPayload = {
  errors: unknown[];
};

type UnauthorizedPayload = {
  error: string;
};

type MarketPayload = {
  id: number;
  title: string;
  description: string | null;
  outcomes: Array<{ id: number; title: string }>;
};

type MarketListItem = {
  id: number;
  status: string;
};

type ResolvedBetPayload = {
  marketTitle: string;
  outcomeTitle: string;
  result: string;
};

type RegisterPayload = {
  id: number;
};

type LeaderboardPayload = {
  userId: number;
  totalWinnings: number;
};

type BetPayload = {
  id: number;
  userId: number;
  marketId: number;
  outcomeId: number;
  amount: number;
};

// Keep tests runnable even when bun test is executed outside server/ where preload may not apply.
process.env.DB_FILE_NAME ||= ":memory:";
process.env.JWT_SECRET ||= "test-jwt-secret";

let app!: (typeof import("../index"))["app"];
let db!: (typeof import("../src/db"))["default"];

// Shared state across tests (populated by earlier tests, consumed by later ones)
let authToken: string;
let userId: number;
let marketId: number;
let outcomeId: number;
let resolvedMarketId: number;

beforeAll(async () => {
  const appModule = await import("../index");
  const dbModule = await import("../src/db");

  app = appModule.app;
  db = dbModule.default;

  // Run migrations to create tables on the in-memory DB
  await applyMigrations(db);
});

describe("Auth", () => {
  const username = "testuser";
  const email = "test@example.com";
  const password = "testpass123";

  it("POST /api/auth/register — creates a new user", async () => {
    const res = await app.handle(
      new Request(`${BASE}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password }),
      }),
    );

    expect(res.status).toBe(201);
    const data = (await res.json()) as AuthPayload;
    expect(data.id).toBeDefined();
    expect(data.username).toBe(username);
    expect(data.email).toBe(email);
    expect(data.token).toBeDefined();

    authToken = data.token;
    userId = data.id;
  });

  it("POST /api/auth/register — rejects duplicate user", async () => {
    const res = await app.handle(
      new Request(`${BASE}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password }),
      }),
    );

    expect(res.status).toBe(409);
  });

  it("POST /api/auth/register — validates input", async () => {
    const res = await app.handle(
      new Request(`${BASE}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "ab", email: "bad", password: "12" }),
      }),
    );

    expect(res.status).toBe(400);
    const data = (await res.json()) as ValidationErrorPayload;
    expect(data.errors.length).toBeGreaterThan(0);
  });

  it("POST /api/auth/login — logs in with valid credentials", async () => {
    const res = await app.handle(
      new Request(`${BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      }),
    );

    expect(res.status).toBe(200);
    const data = (await res.json()) as AuthPayload;
    expect(data.id).toBe(userId);
    expect(data.token).toBeDefined();
  });

  it("POST /api/auth/login — rejects invalid credentials", async () => {
    const res = await app.handle(
      new Request(`${BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "nobody@example.com", password: "wrong" }),
      }),
    );

    expect(res.status).toBe(401);
  });

  it("GET /api/auth/me — returns 401 with no token", async () => {
    const res = await app.handle(new Request(`${BASE}/api/auth/me`));

    expect(res.status).toBe(401);
    const data = (await res.json()) as UnauthorizedPayload;
    expect(data.error).toBe("Unauthorized");
  });

  it("GET /api/auth/me — returns 401 with invalid token", async () => {
    const res = await app.handle(
      new Request(`${BASE}/api/auth/me`, {
        headers: { Authorization: "Bearer not.a.valid.jwt.token" },
      }),
    );

    expect(res.status).toBe(401);
  });

  it("GET /api/auth/me — returns current user info with valid token", async () => {
    const res = await app.handle(
      new Request(`${BASE}/api/auth/me`, {
        headers: { Authorization: `Bearer ${authToken}` },
      }),
    );

    expect(res.status).toBe(200);
    const data = (await res.json()) as AuthPayload;
    expect(data.id).toBe(userId);
    expect(data.username).toBe("testuser");
    expect(data.email).toBe("test@example.com");
    expect(data.role).toBeDefined();
  });
});

describe("Markets", () => {
  it("POST /api/markets — requires auth", async () => {
    const res = await app.handle(
      new Request(`${BASE}/api/markets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Test market",
          outcomes: ["Yes", "No"],
        }),
      }),
    );

    expect(res.status).toBe(401);
  });

  it("POST /api/markets — creates a market", async () => {
    const res = await app.handle(
      new Request(`${BASE}/api/markets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          title: "Will it rain tomorrow?",
          description: "Weather prediction",
          outcomes: ["Yes", "No"],
        }),
      }),
    );

    expect(res.status).toBe(201);
    const data = (await res.json()) as MarketPayload;
    expect(data.id).toBeDefined();
    expect(data.title).toBe("Will it rain tomorrow?");
    expect(data.outcomes).toHaveLength(2);
    expect(data.outcomes[0]).toBeDefined();

    marketId = data.id;
    outcomeId = data.outcomes[0]!.id;
  });

  it("POST /api/markets — validates input", async () => {
    const res = await app.handle(
      new Request(`${BASE}/api/markets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ title: "Hi", outcomes: ["Only one"] }),
      }),
    );

    expect(res.status).toBe(400);
    const data = (await res.json()) as ValidationErrorPayload;
    expect(data.errors.length).toBeGreaterThan(0);
  });

  it("GET /api/markets — lists markets", async () => {
    const resolvedMarket = await db
      .insert(marketsTable)
      .values({
        title: "Did the launch succeed?",
        description: "Mission outcome",
        status: "resolved",
        createdBy: userId,
      })
      .returning();

    const resolvedOutcomes = await db
      .insert(marketOutcomesTable)
      .values([
      { marketId: resolvedMarket[0]!.id, title: "Yes", position: 0 },
      { marketId: resolvedMarket[0]!.id, title: "No", position: 1 },
      ])
      .returning();

    expect(resolvedMarket[0]).toBeDefined();
    expect(resolvedOutcomes[0]).toBeDefined();
    expect(resolvedOutcomes[1]).toBeDefined();

    const resolvedMarketRow = resolvedMarket[0]!;
    const resolvedOutcomeWinner = resolvedOutcomes[0]!;
    const resolvedOutcomeLoser = resolvedOutcomes[1]!;

    await db
      .update(marketsTable)
      .set({ resolvedOutcomeId: resolvedOutcomeWinner.id })
      .where(eq(marketsTable.id, resolvedMarketRow.id));

    await db.insert(betsTable).values({
      userId,
      marketId: resolvedMarketRow.id,
      outcomeId: resolvedOutcomeLoser.id,
      amount: 25,
    });

    resolvedMarketId = resolvedMarketRow.id;

    const res = await app.handle(new Request(`${BASE}/api/markets`));

    expect(res.status).toBe(200);
    const data = (await res.json()) as Array<MarketListItem>;
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    expect(data.every((market: { status: string }) => market.status === "active")).toBe(true);
    expect(data.some((market: { id: number }) => market.id === marketId)).toBe(true);
    expect(data.some((market: { id: number }) => market.id === resolvedMarketId)).toBe(false);
  });

  it("GET /api/markets?status=resolved — lists resolved markets", async () => {
    const res = await app.handle(new Request(`${BASE}/api/markets?status=resolved`));

    expect(res.status).toBe(200);
    const data = (await res.json()) as Array<MarketListItem>;
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    expect(data.every((market: { status: string }) => market.status === "resolved")).toBe(true);
    expect(data.some((market: { id: number }) => market.id === resolvedMarketId)).toBe(true);
    expect(data.some((market: { id: number }) => market.id === marketId)).toBe(false);
  });

  it("GET /api/auth/me/resolved-bets — returns the user's resolved bets", async () => {
    const res = await app.handle(
      new Request(`${BASE}/api/auth/me/resolved-bets`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      }),
    );

    expect(res.status).toBe(200);
    const data = (await res.json()) as Array<ResolvedBetPayload>;
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    expect(data[0]).toBeDefined();
    expect(data[0]!.marketTitle).toBe("Did the launch succeed?");
    expect(data[0]!.outcomeTitle).toBe("No");
    expect(data[0]!.result).toBe("lost");
  });

  it("GET /api/markets/leaderboard — ranks users by total winnings descending", async () => {
    const registerRes = await app.handle(
      new Request(`${BASE}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "winneruser",
          email: "winner@example.com",
          password: "winnerpass123",
        }),
      }),
    );

    expect(registerRes.status).toBe(201);
    const registeredWinner = (await registerRes.json()) as RegisterPayload;

    const resolvedMarket = await db.query.marketsTable.findFirst({
      where: eq(marketsTable.id, resolvedMarketId),
      columns: {
        resolvedOutcomeId: true,
      },
    });

    expect(resolvedMarket?.resolvedOutcomeId).toBeDefined();

    await db.insert(betsTable).values({
      userId: registeredWinner.id,
      marketId: resolvedMarketId,
      outcomeId: resolvedMarket?.resolvedOutcomeId as number,
      amount: 40,
    });

    const leaderboardRes = await app.handle(new Request(`${BASE}/api/markets/leaderboard`));

    expect(leaderboardRes.status).toBe(200);
    const leaderboard = (await leaderboardRes.json()) as Array<LeaderboardPayload>;
    expect(Array.isArray(leaderboard)).toBe(true);

    const winnerEntry = leaderboard.find((entry: { userId: number }) => entry.userId === registeredWinner.id);
    const originalUserEntry = leaderboard.find((entry: { userId: number }) => entry.userId === userId);

    expect(winnerEntry).toBeDefined();
    expect(originalUserEntry).toBeDefined();
    if (!winnerEntry || !originalUserEntry) {
      throw new Error("Expected leaderboard entries to exist");
    }
    expect(winnerEntry.totalWinnings).toBe(65);
    expect(originalUserEntry.totalWinnings).toBe(0);

    const allUsers = await db.query.usersTable.findMany({
      columns: {
        id: true,
      },
    });
    expect(leaderboard).toHaveLength(allUsers.length);
    expect(leaderboard[0]).toBeDefined();
    expect(leaderboard[1]).toBeDefined();
    expect(leaderboard[0]!.totalWinnings).toBeGreaterThanOrEqual(leaderboard[1]!.totalWinnings);
  });

  it("GET /api/markets — rejects invalid status filters", async () => {
    const res = await app.handle(new Request(`${BASE}/api/markets?status=closed`));

    expect(res.status).toBe(400);
  });

  it("GET /api/markets/:id — returns market detail", async () => {
    const res = await app.handle(new Request(`${BASE}/api/markets/${marketId}`));

    expect(res.status).toBe(200);
    const data = (await res.json()) as MarketPayload;
    expect(data.id).toBe(marketId);
    expect(data.title).toBe("Will it rain tomorrow?");
    expect(data.description).toBe("Weather prediction");
    expect(data.outcomes).toHaveLength(2);
  });

  it("GET /api/markets/:id/stream — opens market event stream", async () => {
    const abortController = new AbortController();
    const res = await app.handle(
      new Request(`${BASE}/api/markets/${marketId}/stream`, {
        signal: abortController.signal,
      }),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    abortController.abort();
  });

  it("GET /api/markets/:id — 404 for nonexistent market", async () => {
    const res = await app.handle(new Request(`${BASE}/api/markets/99999`));

    expect(res.status).toBe(404);
  });
});

describe("Bets", () => {
  it("POST /api/markets/:id/bets — requires auth", async () => {
    const res = await app.handle(
      new Request(`${BASE}/api/markets/${marketId}/bets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outcomeId, amount: 100 }),
      }),
    );

    expect(res.status).toBe(401);
  });

  it("POST /api/markets/:id/bets — places a bet", async () => {
    const res = await app.handle(
      new Request(`${BASE}/api/markets/${marketId}/bets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ outcomeId, amount: 50 }),
      }),
    );

    expect(res.status).toBe(201);
    const data = (await res.json()) as BetPayload;
    expect(data.id).toBeDefined();
    expect(data.userId).toBe(userId);
    expect(data.marketId).toBe(marketId);
    expect(data.outcomeId).toBe(outcomeId);
    expect(data.amount).toBe(50);
  });

  it("GET /api/auth/me/active-bets — returns the user's active bets with current odds", async () => {
    const res = await app.handle(
      new Request(`${BASE}/api/auth/me/active-bets`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      }),
    );

    expect(res.status).toBe(200);
    const data = (await res.json()) as Array<ActiveBetSummary>;
    expect(Array.isArray(data)).toBe(true);

    const activeBet = data.find((bet) => bet.marketId === marketId && bet.outcomeId === outcomeId);
    expect(activeBet).toBeDefined();
    expect(activeBet?.marketTitle).toBe("Will it rain tomorrow?");
    expect(activeBet?.outcomeTitle).toBe("Yes");
    expect(activeBet?.amount).toBe(50);
    expect(activeBet?.currentOdds).toBe(100);
  });

  it("POST /api/markets/:id/bets — validates amount", async () => {
    const res = await app.handle(
      new Request(`${BASE}/api/markets/${marketId}/bets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ outcomeId, amount: -10 }),
      }),
    );

    expect(res.status).toBe(400);
    const data = (await res.json()) as ValidationErrorPayload;
    expect(data.errors.length).toBeGreaterThan(0);
  });
});

describe("Error handling", () => {
  it("returns 404 JSON for unknown routes", async () => {
    const res = await app.handle(new Request(`${BASE}/nonexistent`));

    expect(res.status).toBe(404);
    const data = (await res.json()) as UnauthorizedPayload;
    expect(data.error).toBe("Not found");
  });
});
