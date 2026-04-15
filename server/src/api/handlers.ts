import { eq, and, sql } from "drizzle-orm";
import db from "../db";
import { usersTable, marketsTable, marketOutcomesTable, betsTable } from "../db/schema";
import { hashPassword, verifyPassword, type AuthTokenPayload } from "../lib/auth";
import { broadcastMarketUpdate, createMarketStreamResponse } from "../lib/market-events";
import { getEnrichedMarket, listEnrichedMarkets, type MarketStatus } from "../lib/market-data";
import { calculateUserWinnings } from "../lib/odds";
import {
  validateRegistration,
  validateLogin,
  validateMarketCreation,
  validateBet,
  validateResolution,
} from "../lib/validation";

type JwtSigner = {
  sign: (payload: AuthTokenPayload) => Promise<string>;
};

export async function handleRegister({
  body,
  jwt,
  set,
}: {
  body: { username: string; email: string; password: string };
  jwt: JwtSigner;
  set: { status: number };
}) {
  const { username, email, password } = body;
  const errors = validateRegistration(username, email, password);

  if (errors.length > 0) {
    set.status = 400;
    return { errors };
  }

  const existingUser = await db.query.usersTable.findFirst({
    where: (users, { or, eq }) => or(eq(users.email, email), eq(users.username, username)),
  });

  if (existingUser) {
    set.status = 409;
    return { errors: [{ field: "email", message: "User already exists" }] };
  }

  const passwordHash = await hashPassword(password);

  const [newUser] = await db.insert(usersTable).values({ username, email, passwordHash }).returning();

  const token = await jwt.sign({ userId: newUser!.id, role: newUser!.role });

  set.status = 201;
  return {
    id: newUser!.id,
    username: newUser!.username,
    email: newUser!.email,
    role: newUser!.role,
    balance: newUser!.balance,
    token,
  };
}

export async function handleLogin({
  body,
  jwt,
  set,
}: {
  body: { email: string; password: string };
  jwt: JwtSigner;
  set: { status: number };
}) {
  const { email, password } = body;
  const errors = validateLogin(email, password);

  if (errors.length > 0) {
    set.status = 400;
    return { errors };
  }

  const user = await db.query.usersTable.findFirst({
    where: eq(usersTable.email, email),
  });

  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    set.status = 401;
    return { error: "Invalid email or password" };
  }

  const token = await jwt.sign({ userId: user.id, role: user.role });

  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    balance: user.balance,
    token,
  };
}

export async function handleGetResolvedBets({
  user,
  query,
}: {
  user: typeof usersTable.$inferSelect;
  query: { limit?: number; offset?: number };
}) {
  const limit = Math.min(query.limit ?? 20, 100);
  const offset = query.offset ?? 0;

  const results = await db
    .select({
      id: betsTable.id,
      marketId: betsTable.marketId,
      marketTitle: marketsTable.title,
      outcomeTitle: marketOutcomesTable.title,
      outcomeId: betsTable.outcomeId,
      resolvedOutcomeId: marketsTable.resolvedOutcomeId,
      payout: betsTable.payout,
    })
    .from(betsTable)
    .innerJoin(marketsTable, eq(betsTable.marketId, marketsTable.id))
    .innerJoin(marketOutcomesTable, eq(betsTable.outcomeId, marketOutcomesTable.id))
    .where(
      and(
        eq(betsTable.userId, user.id),
        eq(marketsTable.status, "resolved"),
        sql`${marketsTable.resolvedOutcomeId} IS NOT NULL`,
      ),
    )
    .orderBy(sql`${betsTable.createdAt} DESC`)
    .limit(limit)
    .offset(offset);

  return results.map((row) => ({
    id: row.id,
    marketId: row.marketId,
    marketTitle: row.marketTitle,
    outcomeTitle: row.outcomeTitle,
    result: row.outcomeId === row.resolvedOutcomeId ? "won" : "lost",
    payout: row.payout ?? null,
  }));
}

export async function handleGetArchivedBets({
  user,
  query,
}: {
  user: typeof usersTable.$inferSelect;
  query: { limit?: number; offset?: number };
}) {
  const limit = Math.min(query.limit ?? 20, 100);
  const offset = query.offset ?? 0;

  const results = await db
    .select({
      id: betsTable.id,
      marketId: betsTable.marketId,
      marketTitle: marketsTable.title,
      outcomeTitle: marketOutcomesTable.title,
      amount: betsTable.amount,
    })
    .from(betsTable)
    .innerJoin(marketsTable, eq(betsTable.marketId, marketsTable.id))
    .innerJoin(marketOutcomesTable, eq(betsTable.outcomeId, marketOutcomesTable.id))
    .where(
      and(
        eq(betsTable.userId, user.id),
        eq(marketsTable.status, "archived"),
      ),
    )
    .orderBy(sql`${betsTable.createdAt} DESC`)
    .limit(limit)
    .offset(offset);

  return results.map((row) => ({
    id: row.id,
    marketId: row.marketId,
    marketTitle: row.marketTitle,
    outcomeTitle: row.outcomeTitle,
    amount: row.amount,
  }));
}

export async function handleGetActiveBets({
  user,
  query,
}: {
  user: typeof usersTable.$inferSelect;
  query: { limit?: number; offset?: number };
}) {
  const limit = Math.min(query.limit ?? 20, 100);
  const offset = query.offset ?? 0;

  const results = await db
    .select({
      id: betsTable.id,
      marketId: betsTable.marketId,
      marketTitle: marketsTable.title,
      outcomeId: betsTable.outcomeId,
      outcomeTitle: marketOutcomesTable.title,
      amount: betsTable.amount,
    })
    .from(betsTable)
    .innerJoin(marketsTable, eq(betsTable.marketId, marketsTable.id))
    .innerJoin(marketOutcomesTable, eq(betsTable.outcomeId, marketOutcomesTable.id))
    .where(
      and(
        eq(betsTable.userId, user.id),
        eq(marketsTable.status, "active"),
      ),
    )
    .orderBy(sql`${betsTable.createdAt} DESC`)
    .limit(limit)
    .offset(offset);

  const uniqueMarketIds = [...new Set(results.map((r) => r.marketId))];
  const enrichedMarkets = await Promise.all(
    uniqueMarketIds.map(async (marketId) =>
      [marketId, await getEnrichedMarket(marketId)] as const,
    ),
  );
  const enrichedMarketMap = new Map(enrichedMarkets);

  return results.map((row) => {
    const market = enrichedMarketMap.get(row.marketId);
    const selectedOutcome = market?.outcomes.find((outcome) => outcome.id === row.outcomeId);

    return {
      id: row.id,
      marketId: row.marketId,
      marketTitle: row.marketTitle,
      outcomeId: row.outcomeId,
      outcomeTitle: row.outcomeTitle,
      amount: row.amount,
      currentOdds: selectedOutcome?.odds ?? 0,
    };
  });
}

export async function handleGetLeaderboard({
  query,
}: {
  query: { limit?: number; offset?: number };
}) {
  const limit = Math.min(query.limit ?? 20, 100);
  const offset = query.offset ?? 0;

  const entries = db.all<{ userId: number; username: string; totalWinnings: number }>(sql`
    WITH market_pools AS (
      SELECT
        ${betsTable.marketId} AS market_id,
        SUM(${betsTable.amount}) AS total_pool,
        SUM(CASE WHEN ${betsTable.outcomeId} = ${marketsTable.resolvedOutcomeId} THEN ${betsTable.amount} ELSE 0 END) AS winning_pool
      FROM ${betsTable}
      JOIN ${marketsTable} ON ${betsTable.marketId} = ${marketsTable.id}
      WHERE ${marketsTable.status} = 'resolved' AND ${marketsTable.resolvedOutcomeId} IS NOT NULL
      GROUP BY ${betsTable.marketId}
    ),
    user_winnings AS (
      SELECT
        ${betsTable.userId} AS user_id,
        ROUND(SUM(${betsTable.amount} * (mp.total_pool * 1.0 / mp.winning_pool)), 2) AS total_winnings
      FROM ${betsTable}
      JOIN ${marketsTable} ON ${betsTable.marketId} = ${marketsTable.id}
      JOIN market_pools mp ON ${betsTable.marketId} = mp.market_id
      WHERE ${betsTable.outcomeId} = ${marketsTable.resolvedOutcomeId}
      GROUP BY ${betsTable.userId}
    )
    SELECT
      ${usersTable.id} AS userId,
      ${usersTable.username} AS username,
      COALESCE(uw.total_winnings, 0) AS totalWinnings
    FROM ${usersTable}
    LEFT JOIN user_winnings uw ON ${usersTable.id} = uw.user_id
    ORDER BY totalWinnings DESC, ${usersTable.username} ASC
    LIMIT ${limit} OFFSET ${offset}
  `);

  const countResult = db.all<{ total: number }>(
    sql`SELECT COUNT(*) AS total FROM ${usersTable}`,
  );

  return {
    entries,
    total: countResult[0]?.total ?? 0,
  };
}

export async function handleCreateMarket({
  body,
  set,
  user,
}: {
  body: { title: string; description?: string; outcomes: string[] };
  set: { status: number };
  user: typeof usersTable.$inferSelect;
}) {
  const { title, description, outcomes } = body;
  const errors = validateMarketCreation(title, description || "", outcomes);

  if (errors.length > 0) {
    set.status = 400;
    return { errors };
  }

  const [market] = await db
    .insert(marketsTable)
    .values({
      title,
      description: description || null,
      createdBy: user.id,
    })
    .returning();

  const outcomeIds = await db
    .insert(marketOutcomesTable)
    .values(
      outcomes.map((title: string, index: number) => ({
        marketId: market!.id,
        title,
        position: index,
      })),
    )
    .returning();

  set.status = 201;
  return {
    id: market!.id,
    title: market!.title,
    description: market!.description,
    status: market!.status,
    outcomes: outcomeIds,
  };
}

export async function handleListMarkets({
  query,
}: {
  query: { status?: MarketStatus; limit?: number; offset?: number };
}) {
  const statusFilter = query.status ?? "active";
  const limit = Math.min(query.limit ?? 20, 100);
  const offset = query.offset ?? 0;
  return listEnrichedMarkets(statusFilter, limit, offset);
}

export async function handleGetMarket({
  params,
  set,
}: {
  params: { id: number };
  set: { status: number };
}) {
  const market = await getEnrichedMarket(params.id);

  if (!market) {
    set.status = 404;
    return { error: "Market not found" };
  }

  return market;
}

export async function handleMarketStream({
  params,
  request,
  set,
}: {
  params: { id: number };
  request: Request;
  set: { status: number };
}) {
  const market = await getEnrichedMarket(params.id);

  if (!market) {
    set.status = 404;
    return { error: "Market not found" };
  }

  return createMarketStreamResponse({
    marketId: params.id,
    initialMarket: market,
    signal: request.signal,
  });
}

export async function handlePlaceBet({
  params,
  body,
  set,
  user,
}: {
  params: { id: number };
  body: { outcomeId: number; amount: number };
  set: { status: number };
  user: typeof usersTable.$inferSelect;
}) {
  const marketId = params.id;
  const { outcomeId, amount } = body;
  const errors = validateBet(amount);

  if (errors.length > 0) {
    set.status = 400;
    return { errors };
  }

  const market = await db.query.marketsTable.findFirst({
    where: eq(marketsTable.id, marketId),
  });

  if (!market) {
    set.status = 404;
    return { error: "Market not found" };
  }

  if (market.status !== "active") {
    set.status = 400;
    return { error: "Market is not active" };
  }

  const outcome = await db.query.marketOutcomesTable.findFirst({
    where: and(eq(marketOutcomesTable.id, outcomeId), eq(marketOutcomesTable.marketId, marketId)),
  });

  if (!outcome) {
    set.status = 404;
    return { error: "Outcome not found" };
  }

  // All mutation checks (balance + duplicate) run inside the transaction to prevent races
  const result = await db.transaction(async (tx) => {
    // Re-check for duplicate bet inside transaction
    const existingBet = await tx.query.betsTable.findFirst({
      where: and(eq(betsTable.marketId, marketId), eq(betsTable.userId, user.id)),
    });

    if (existingBet) {
      return { error: "You have already placed a bet on this market" } as const;
    }

    // Atomically deduct balance only if sufficient (WHERE balance >= amount)
    const updated = await tx
      .update(usersTable)
      .set({ balance: sql`${usersTable.balance} - ${Number(amount)}` })
      .where(and(eq(usersTable.id, user.id), sql`${usersTable.balance} >= ${Number(amount)}`))
      .returning({ id: usersTable.id });

    if (updated.length === 0) {
      return { error: "Insufficient balance" } as const;
    }

    const [inserted] = await tx
      .insert(betsTable)
      .values({
        userId: user.id,
        marketId,
        outcomeId,
        amount: Number(amount),
      })
      .returning();

    return { bet: inserted! } as const;
  });

  if ("error" in result) {
    set.status = 400;
    return { error: result.error };
  }

  await broadcastMarketUpdate(marketId);

  set.status = 201;
  return {
    id: result.bet.id,
    userId: result.bet.userId,
    marketId: result.bet.marketId,
    outcomeId: result.bet.outcomeId,
    amount: result.bet.amount,
  };
}

export async function handleResolveMarket({
  params,
  body,
  set,
  user,
}: {
  params: { id: number };
  body: { outcomeId: number };
  set: { status: number };
  user: typeof usersTable.$inferSelect;
}) {
  const marketId = params.id;
  const { outcomeId } = body;
  const errors = validateResolution(outcomeId);

  if (errors.length > 0) {
    set.status = 400;
    return { errors };
  }

  const market = await db.query.marketsTable.findFirst({
    where: eq(marketsTable.id, marketId),
    with: {
      outcomes: true,
    },
  });

  if (!market) {
    set.status = 404;
    return { error: "Market not found" };
  }

  if (market.status !== "active") {
    set.status = 400;
    return { error: "Market is not active" };
  }

  const outcome = market.outcomes.find((item) => item.id === outcomeId);
  if (!outcome) {
    set.status = 404;
    return { error: "Outcome not found in this market" };
  }

  const txResult = await db.transaction(async (tx) => {
    // Atomically set status to "resolved" only if still "active" (prevents double resolution)
    const updated = await tx
      .update(marketsTable)
      .set({
        status: "resolved",
        resolvedOutcomeId: outcomeId,
        resolvedBy: user.id,
        resolvedAt: new Date(),
      })
      .where(and(eq(marketsTable.id, marketId), eq(marketsTable.status, "active")))
      .returning({ id: marketsTable.id });

    if (updated.length === 0) {
      return { error: "Market is not active" } as const;
    }

    // Gather bets inside the transaction so no new bets can sneak in
    const allBets = await tx.query.betsTable.findMany({
      where: eq(betsTable.marketId, marketId),
    });

    const totalPool = allBets.reduce((sum, b) => sum + b.amount, 0);
    const winningBets = allBets.filter((b) => b.outcomeId === outcomeId);
    const winningPool = winningBets.reduce((sum, b) => sum + b.amount, 0);

    // Credit each winner
    for (const bet of winningBets) {
      const payout = calculateUserWinnings(bet.amount, winningPool, totalPool);
      await tx
        .update(usersTable)
        .set({ balance: sql`${usersTable.balance} + ${payout}` })
        .where(eq(usersTable.id, bet.userId));
      await tx
        .update(betsTable)
        .set({ payout })
        .where(eq(betsTable.id, bet.id));
    }

    return { success: true } as const;
  });

  if ("error" in txResult) {
    set.status = 400;
    return { error: txResult.error };
  }

  await broadcastMarketUpdate(marketId);

  return {
    success: true,
    market: await getEnrichedMarket(marketId),
  };
}

export async function handleArchiveMarket({
  params,
  set,
}: {
  params: { id: number };
  set: { status: number };
}) {
  const marketId = params.id;

  const market = await db.query.marketsTable.findFirst({
    where: eq(marketsTable.id, marketId),
  });

  if (!market) {
    set.status = 404;
    return { error: "Market not found" };
  }

  if (market.status !== "active") {
    set.status = 400;
    return { error: "Only active markets can be archived" };
  }

  const txResult = await db.transaction(async (tx) => {
    // Atomically set status to "archived" only if still "active" (prevents double archive)
    const updated = await tx
      .update(marketsTable)
      .set({ status: "archived" })
      .where(and(eq(marketsTable.id, marketId), eq(marketsTable.status, "active")))
      .returning({ id: marketsTable.id });

    if (updated.length === 0) {
      return { error: "Only active markets can be archived" } as const;
    }

    // Get all bets inside transaction so no new bets can sneak in
    const allBets = await tx.query.betsTable.findMany({
      where: eq(betsTable.marketId, marketId),
    });

    // Refund every bettor their original amount
    for (const bet of allBets) {
      await tx
        .update(usersTable)
        .set({ balance: sql`${usersTable.balance} + ${bet.amount}` })
        .where(eq(usersTable.id, bet.userId));
    }

    return { success: true } as const;
  });

  if ("error" in txResult) {
    set.status = 400;
    return { error: txResult.error };
  }

  await broadcastMarketUpdate(marketId);

  return {
    success: true,
    market: await getEnrichedMarket(marketId),
  };
}

export async function handleGetApiKey({ user }: { user: typeof usersTable.$inferSelect }) {
  return { apiKey: user.apiKey ?? null };
}

export async function handleGenerateApiKey({ user }: { user: typeof usersTable.$inferSelect }) {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const apiKey = "pm_" + Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");

  await db.update(usersTable).set({ apiKey, updatedAt: new Date() }).where(eq(usersTable.id, user.id));

  return { apiKey };
}

export async function handleRevokeApiKey({
  user,
  set,
}: {
  user: typeof usersTable.$inferSelect;
  set: { status: number };
}) {
  await db.update(usersTable).set({ apiKey: null, updatedAt: new Date() }).where(eq(usersTable.id, user.id));
  set.status = 204;
}
