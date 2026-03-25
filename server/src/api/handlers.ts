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
}: {
  user: typeof usersTable.$inferSelect;
}) {
  const bets = await db.query.betsTable.findMany({
    where: eq(betsTable.userId, user.id),
    with: {
      market: true,
      outcome: true,
    },
  });

  return bets
    .filter((bet) => bet.market.status === "resolved" && bet.market.resolvedOutcomeId !== null)
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    .map((bet) => ({
      id: bet.id,
      marketId: bet.marketId,
      marketTitle: bet.market.title,
      outcomeTitle: bet.outcome.title,
      result: bet.outcomeId === bet.market.resolvedOutcomeId ? "won" : "lost",
    }));
}

export async function handleGetArchivedBets({
  user,
}: {
  user: typeof usersTable.$inferSelect;
}) {
  const bets = await db.query.betsTable.findMany({
    where: eq(betsTable.userId, user.id),
    with: {
      market: true,
      outcome: true,
    },
  });

  return bets
    .filter((bet) => bet.market.status === "archived")
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    .map((bet) => ({
      id: bet.id,
      marketId: bet.marketId,
      marketTitle: bet.market.title,
      outcomeTitle: bet.outcome.title,
      amount: bet.amount,
    }));
}

export async function handleGetActiveBets({
  user,
}: {
  user: typeof usersTable.$inferSelect;
}) {
  const bets = await db.query.betsTable.findMany({
    where: eq(betsTable.userId, user.id),
    with: {
      market: true,
      outcome: true,
    },
  });

  const activeBets = bets.filter((bet) => bet.market.status === "active");
  const enrichedMarkets = await Promise.all(
    [...new Set(activeBets.map((bet) => bet.marketId))].map(async (marketId) =>
      [marketId, await getEnrichedMarket(marketId)] as const,
    ),
  );
  const enrichedMarketMap = new Map(enrichedMarkets);

  return activeBets
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    .map((bet) => {
      const market = enrichedMarketMap.get(bet.marketId);
      const selectedOutcome = market?.outcomes.find((outcome) => outcome.id === bet.outcomeId);

      return {
        id: bet.id,
        marketId: bet.marketId,
        marketTitle: bet.market.title,
        outcomeId: bet.outcomeId,
        outcomeTitle: bet.outcome.title,
        amount: bet.amount,
        currentOdds: selectedOutcome?.odds ?? 0,
      };
    });
}

export async function handleGetLeaderboard() {
  const [users, bets] = await Promise.all([
    db.query.usersTable.findMany({
      columns: {
        id: true,
        username: true,
      },
    }),
    db.query.betsTable.findMany({
      with: {
        market: {
          columns: {
            id: true,
            status: true,
            resolvedOutcomeId: true,
          },
        },
      },
    }),
  ]);

  const resolvedBets = bets.filter(
    (bet) => bet.market.status === "resolved" && bet.market.resolvedOutcomeId !== null,
  );

  const totalBetsPerMarket = new Map<number, number>();
  const winningBetsPerMarket = new Map<number, number>();

  for (const bet of resolvedBets) {
    totalBetsPerMarket.set(bet.marketId, (totalBetsPerMarket.get(bet.marketId) ?? 0) + bet.amount);

    if (bet.outcomeId === bet.market.resolvedOutcomeId) {
      winningBetsPerMarket.set(
        bet.marketId,
        (winningBetsPerMarket.get(bet.marketId) ?? 0) + bet.amount,
      );
    }
  }

  const winningsByUserId = new Map<number, number>();

  for (const bet of resolvedBets) {
    if (bet.outcomeId !== bet.market.resolvedOutcomeId) {
      continue;
    }

    const totalMarketBets = totalBetsPerMarket.get(bet.marketId) ?? 0;
    const winningOutcomeTotalBets = winningBetsPerMarket.get(bet.marketId) ?? 0;

    const winnings = calculateUserWinnings(bet.amount, winningOutcomeTotalBets, totalMarketBets);
    winningsByUserId.set(
      bet.userId,
      Number(((winningsByUserId.get(bet.userId) ?? 0) + winnings).toFixed(2)),
    );
  }

  return users
    .map((user) => ({
      userId: user.id,
      username: user.username,
      totalWinnings: winningsByUserId.get(user.id) ?? 0,
    }))
    .sort((left, right) => {
      if (right.totalWinnings !== left.totalWinnings) {
        return right.totalWinnings - left.totalWinnings;
      }

      return left.username.localeCompare(right.username);
    });
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

export async function handleListMarkets({ query }: { query: { status?: MarketStatus } }) {
  const statusFilter = query.status ?? "active";
  return listEnrichedMarkets(statusFilter);
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

  if (user.balance < amount) {
    set.status = 400;
    return { error: "Insufficient balance" };
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

  const bet = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(betsTable)
      .values({
        userId: user.id,
        marketId,
        outcomeId,
        amount: Number(amount),
      })
      .returning();

    await tx
      .update(usersTable)
      .set({ balance: sql`${usersTable.balance} - ${Number(amount)}` })
      .where(eq(usersTable.id, user.id));

    return inserted!;
  });

  await broadcastMarketUpdate(marketId);

  set.status = 201;
  return {
    id: bet.id,
    userId: bet.userId,
    marketId: bet.marketId,
    outcomeId: bet.outcomeId,
    amount: bet.amount,
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

  // Gather bets to calculate payouts
  const allBets = await db.query.betsTable.findMany({
    where: eq(betsTable.marketId, marketId),
  });

  const totalPool = allBets.reduce((sum, b) => sum + b.amount, 0);
  const winningBets = allBets.filter((b) => b.outcomeId === outcomeId);
  const winningPool = winningBets.reduce((sum, b) => sum + b.amount, 0);

  await db.transaction(async (tx) => {
    await tx
      .update(marketsTable)
      .set({
        status: "resolved",
        resolvedOutcomeId: outcomeId,
        resolvedBy: user.id,
        resolvedAt: new Date(),
      })
      .where(eq(marketsTable.id, marketId));

    // Credit each winner
    for (const bet of winningBets) {
      const payout = calculateUserWinnings(bet.amount, winningPool, totalPool);
      await tx
        .update(usersTable)
        .set({ balance: sql`${usersTable.balance} + ${payout}` })
        .where(eq(usersTable.id, bet.userId));
    }
  });

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

  // Get all bets to refund
  const allBets = await db.query.betsTable.findMany({
    where: eq(betsTable.marketId, marketId),
  });

  await db.transaction(async (tx) => {
    await tx
      .update(marketsTable)
      .set({ status: "archived" })
      .where(eq(marketsTable.id, marketId));

    // Refund every bettor their original amount
    for (const bet of allBets) {
      await tx
        .update(usersTable)
        .set({ balance: sql`${usersTable.balance} + ${bet.amount}` })
        .where(eq(usersTable.id, bet.userId));
    }
  });

  await broadcastMarketUpdate(marketId);

  return {
    success: true,
    market: await getEnrichedMarket(marketId),
  };
}
