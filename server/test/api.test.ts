import { describe, it, expect, beforeAll } from "bun:test";
import { eq } from "drizzle-orm";
import { applyMigrations } from "../src/db/apply-migrations";
import { betsTable, marketOutcomesTable, marketsTable, usersTable } from "../src/db/schema";
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
    const leaderboardBody = (await leaderboardRes.json()) as { entries: Array<LeaderboardPayload>; total: number };
    const leaderboard = leaderboardBody.entries;
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

describe("Bet business rules", () => {
  it("deducts balance after placing a bet", async () => {
    const res = await app.handle(
      new Request(`${BASE}/api/auth/me`, {
        headers: { Authorization: `Bearer ${authToken}` },
      }),
    );

    expect(res.status).toBe(200);
    const data = (await res.json()) as AuthPayload & { balance: number };
    // User started with 1000, placed a 50 bet (in the "places a bet" test) and a 25 bet was inserted directly
    expect(data.balance).toBe(950);
  });

  it("rejects bet when balance is insufficient", async () => {
    // Create a fresh user with known balance (1000)
    const regRes = await app.handle(
      new Request(`${BASE}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "brokeuser",
          email: "broke@example.com",
          password: "brokepass123",
        }),
      }),
    );
    const brokeUser = (await regRes.json()) as AuthPayload;

    const res = await app.handle(
      new Request(`${BASE}/api/markets/${marketId}/bets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${brokeUser.token}`,
        },
        body: JSON.stringify({ outcomeId, amount: 9999 }),
      }),
    );

    expect(res.status).toBe(400);
    const data = (await res.json()) as UnauthorizedPayload;
    expect(data.error).toBe("Insufficient balance");
  });

  it("rejects duplicate bet on same market", async () => {
    // authToken user already bet on marketId in the "places a bet" test
    const res = await app.handle(
      new Request(`${BASE}/api/markets/${marketId}/bets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ outcomeId, amount: 10 }),
      }),
    );

    expect(res.status).toBe(400);
    const data = (await res.json()) as UnauthorizedPayload;
    expect(data.error).toBe("You have already placed a bet on this market");
  });
});

describe("Market Resolution", () => {
  let adminToken: string;
  let adminId: number;
  let resMarketId: number;
  let resOutcomeWin: number;
  let resOutcomeLose: number;
  let bettorToken: string;
  let bettorId: number;

  it("setup — create admin, market, and bets", async () => {
    // Register admin
    const adminReg = await app.handle(
      new Request(`${BASE}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "adminuser",
          email: "admin@test.com",
          password: "adminpass123",
        }),
      }),
    );
    expect(adminReg.status).toBe(201);
    const adminData = (await adminReg.json()) as AuthPayload;
    adminToken = adminData.token;
    adminId = adminData.id;

    // Promote to admin directly in DB
    await db.update(usersTable).set({ role: "admin" }).where(eq(usersTable.id, adminId));

    // Re-login to get token with admin role
    const loginRes = await app.handle(
      new Request(`${BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "admin@test.com", password: "adminpass123" }),
      }),
    );
    adminToken = ((await loginRes.json()) as AuthPayload).token;

    // Register bettor
    const bettorReg = await app.handle(
      new Request(`${BASE}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "bettoruser",
          email: "bettor@test.com",
          password: "bettorpass123",
        }),
      }),
    );
    const bettorData = (await bettorReg.json()) as AuthPayload;
    bettorToken = bettorData.token;
    bettorId = bettorData.id;

    // Admin creates a market
    const marketRes = await app.handle(
      new Request(`${BASE}/api/markets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          title: "Resolution test market",
          outcomes: ["Win", "Lose"],
        }),
      }),
    );
    expect(marketRes.status).toBe(201);
    const marketData = (await marketRes.json()) as MarketPayload;
    resMarketId = marketData.id;
    resOutcomeWin = marketData.outcomes[0]!.id;
    resOutcomeLose = marketData.outcomes[1]!.id;

    // Bettor bets 100 on "Win"
    const betRes1 = await app.handle(
      new Request(`${BASE}/api/markets/${resMarketId}/bets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${bettorToken}`,
        },
        body: JSON.stringify({ outcomeId: resOutcomeWin, amount: 100 }),
      }),
    );
    expect(betRes1.status).toBe(201);

    // Admin bets 50 on "Lose"
    const betRes2 = await app.handle(
      new Request(`${BASE}/api/markets/${resMarketId}/bets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ outcomeId: resOutcomeLose, amount: 50 }),
      }),
    );
    expect(betRes2.status).toBe(201);
  });

  it("rejects resolve from non-admin user", async () => {
    const res = await app.handle(
      new Request(`${BASE}/api/markets/${resMarketId}/resolve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${bettorToken}`,
        },
        body: JSON.stringify({ outcomeId: resOutcomeWin }),
      }),
    );

    expect(res.status).toBe(403);
  });

  it("admin resolves market and payouts are correct", async () => {
    // Record bettor balance before resolution
    const beforeRes = await app.handle(
      new Request(`${BASE}/api/auth/me`, {
        headers: { Authorization: `Bearer ${bettorToken}` },
      }),
    );
    const beforeData = (await beforeRes.json()) as AuthPayload & { balance: number };
    const balanceBefore = beforeData.balance;

    // Admin resolves with "Win" outcome
    const resolveRes = await app.handle(
      new Request(`${BASE}/api/markets/${resMarketId}/resolve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ outcomeId: resOutcomeWin }),
      }),
    );

    expect(resolveRes.status).toBe(200);
    const resolveData = (await resolveRes.json()) as { success: boolean; market: { status: string } };
    expect(resolveData.success).toBe(true);
    expect(resolveData.market.status).toBe("resolved");

    // Verify bettor payout: totalPool=150, winningPool=100, payout = 100 * (150/100) = 150
    const afterRes = await app.handle(
      new Request(`${BASE}/api/auth/me`, {
        headers: { Authorization: `Bearer ${bettorToken}` },
      }),
    );
    const afterData = (await afterRes.json()) as AuthPayload & { balance: number };
    expect(afterData.balance).toBe(balanceBefore + 150);
  });

  it("rejects resolving an already-resolved market", async () => {
    const res = await app.handle(
      new Request(`${BASE}/api/markets/${resMarketId}/resolve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ outcomeId: resOutcomeWin }),
      }),
    );

    expect(res.status).toBe(400);
    const data = (await res.json()) as UnauthorizedPayload;
    expect(data.error).toBe("Market is not active");
  });
});

describe("Market Archival", () => {
  let adminToken: string;
  let archMarketId: number;
  let archOutcome: number;
  let bettorToken: string;

  it("setup — create admin, market, and bet for archival", async () => {
    // Register and promote admin
    const adminReg = await app.handle(
      new Request(`${BASE}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "archiveadmin",
          email: "archiveadmin@test.com",
          password: "adminpass123",
        }),
      }),
    );
    expect(adminReg.status).toBe(201);
    const adminData = (await adminReg.json()) as AuthPayload;
    await db.update(usersTable).set({ role: "admin" }).where(eq(usersTable.id, adminData.id));

    const loginRes = await app.handle(
      new Request(`${BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "archiveadmin@test.com", password: "adminpass123" }),
      }),
    );
    adminToken = ((await loginRes.json()) as AuthPayload).token;

    // Register bettor
    const bettorReg = await app.handle(
      new Request(`${BASE}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "archivebettor",
          email: "archivebettor@test.com",
          password: "bettorpass123",
        }),
      }),
    );
    const bettorData = (await bettorReg.json()) as AuthPayload;
    bettorToken = bettorData.token;

    // Create market
    const marketRes = await app.handle(
      new Request(`${BASE}/api/markets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          title: "Archival test market",
          outcomes: ["Option A", "Option B"],
        }),
      }),
    );
    expect(marketRes.status).toBe(201);
    const marketData = (await marketRes.json()) as MarketPayload;
    archMarketId = marketData.id;
    archOutcome = marketData.outcomes[0]!.id;

    // Bettor places a 75 bet
    const betRes = await app.handle(
      new Request(`${BASE}/api/markets/${archMarketId}/bets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${bettorToken}`,
        },
        body: JSON.stringify({ outcomeId: archOutcome, amount: 75 }),
      }),
    );
    expect(betRes.status).toBe(201);
  });

  it("rejects archive from non-admin user", async () => {
    const res = await app.handle(
      new Request(`${BASE}/api/markets/${archMarketId}/archive`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${bettorToken}`,
        },
      }),
    );

    expect(res.status).toBe(403);
  });

  it("admin archives market and refunds bettors", async () => {
    // Record bettor balance before archive
    const beforeRes = await app.handle(
      new Request(`${BASE}/api/auth/me`, {
        headers: { Authorization: `Bearer ${bettorToken}` },
      }),
    );
    const beforeData = (await beforeRes.json()) as AuthPayload & { balance: number };
    const balanceBefore = beforeData.balance;

    // Admin archives
    const archiveRes = await app.handle(
      new Request(`${BASE}/api/markets/${archMarketId}/archive`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
      }),
    );

    expect(archiveRes.status).toBe(200);
    const archiveData = (await archiveRes.json()) as { success: boolean; market: { status: string } };
    expect(archiveData.success).toBe(true);
    expect(archiveData.market.status).toBe("archived");

    // Verify bettor got refunded 75
    const afterRes = await app.handle(
      new Request(`${BASE}/api/auth/me`, {
        headers: { Authorization: `Bearer ${bettorToken}` },
      }),
    );
    const afterData = (await afterRes.json()) as AuthPayload & { balance: number };
    expect(afterData.balance).toBe(balanceBefore + 75);
  });

  it("rejects archiving a non-active market", async () => {
    const res = await app.handle(
      new Request(`${BASE}/api/markets/${archMarketId}/archive`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
      }),
    );

    expect(res.status).toBe(400);
    const data = (await res.json()) as UnauthorizedPayload;
    expect(data.error).toBe("Only active markets can be archived");
  });
});

describe("Pagination", () => {
  let paginationToken: string;

  it("setup — create user and markets for pagination", async () => {
    const regRes = await app.handle(
      new Request(`${BASE}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "paginationuser",
          email: "pagination@test.com",
          password: "pagepass123",
        }),
      }),
    );
    expect(regRes.status).toBe(201);
    paginationToken = ((await regRes.json()) as AuthPayload).token;

    // Create 3 additional active markets
    for (let i = 0; i < 3; i++) {
      const res = await app.handle(
        new Request(`${BASE}/api/markets`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${paginationToken}`,
          },
          body: JSON.stringify({
            title: `Pagination market ${i + 1}`,
            outcomes: ["Yes", "No"],
          }),
        }),
      );
      expect(res.status).toBe(201);
    }
  });

  it("respects limit parameter", async () => {
    const res = await app.handle(new Request(`${BASE}/api/markets?limit=2`));

    expect(res.status).toBe(200);
    const data = (await res.json()) as Array<MarketListItem>;
    expect(data).toHaveLength(2);
  });

  it("respects offset parameter", async () => {
    // Get total active markets first
    const allRes = await app.handle(new Request(`${BASE}/api/markets?limit=100`));
    const allData = (await allRes.json()) as Array<MarketListItem>;
    const total = allData.length;

    // Request with offset = total - 1, should get 1 result
    const res = await app.handle(new Request(`${BASE}/api/markets?limit=100&offset=${total - 1}`));

    expect(res.status).toBe(200);
    const data = (await res.json()) as Array<MarketListItem>;
    expect(data).toHaveLength(1);
  });

  it("leaderboard respects limit and offset", async () => {
    const res = await app.handle(new Request(`${BASE}/api/markets/leaderboard?limit=2&offset=0`));

    expect(res.status).toBe(200);
    const data = (await res.json()) as { entries: Array<LeaderboardPayload>; total: number };
    expect(data.entries).toHaveLength(2);
    expect(data.total).toBeGreaterThan(2);
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
