import { eq } from "drizzle-orm";
import db from "../db";
import { betsTable, marketsTable } from "../db/schema";
import { calculateOutcomeOdds } from "./odds";

export type MarketStatus = "active" | "resolved" | "archived";

export interface EnrichedMarket {
  id: number;
  title: string;
  description?: string;
  status: MarketStatus;
  creator?: string;
  outcomes: Array<{
    id: number;
    title: string;
    odds: number;
    totalBets: number;
  }>;
  totalMarketBets: number;
}

type MarketQueryResult = {
  id: number;
  title: string;
  description: string | null;
  status: MarketStatus;
  creator: { username: string } | null;
  outcomes: Array<{
    id: number;
    title: string;
    position: number;
  }>;
};

async function getBetsPerOutcome(outcomeIds: Array<number>) {
  return Promise.all(
    outcomeIds.map(async (outcomeId) => {
      const totalBets = await db.select().from(betsTable).where(eq(betsTable.outcomeId, outcomeId));

      return {
        outcomeId,
        totalBets: totalBets.reduce((sum, bet) => sum + bet.amount, 0),
      };
    }),
  );
}

async function enrichMarket(market: MarketQueryResult): Promise<EnrichedMarket> {
  const betsPerOutcome = await getBetsPerOutcome(market.outcomes.map((outcome) => outcome.id));
  const totalMarketBets = betsPerOutcome.reduce((sum, entry) => sum + entry.totalBets, 0);

  return {
    id: market.id,
    title: market.title,
    description: market.description ?? undefined,
    status: market.status,
    creator: market.creator?.username,
    outcomes: market.outcomes.map((outcome) => {
      const outcomeBets = betsPerOutcome.find((entry) => entry.outcomeId === outcome.id)?.totalBets ?? 0;

      return {
        id: outcome.id,
        title: outcome.title,
        odds: calculateOutcomeOdds(outcomeBets, totalMarketBets),
        totalBets: outcomeBets,
      };
    }),
    totalMarketBets,
  };
}

export async function listEnrichedMarkets(status: MarketStatus): Promise<Array<EnrichedMarket>> {
  const markets = await db.query.marketsTable.findMany({
    where: eq(marketsTable.status, status),
    with: {
      creator: {
        columns: { username: true },
      },
      outcomes: {
        orderBy: (outcomes, { asc }) => asc(outcomes.position),
      },
    },
  });

  return Promise.all(markets.map((market) => enrichMarket(market as MarketQueryResult)));
}

export async function getEnrichedMarket(marketId: number): Promise<EnrichedMarket | null> {
  const market = await db.query.marketsTable.findFirst({
    where: eq(marketsTable.id, marketId),
    with: {
      creator: {
        columns: { username: true },
      },
      outcomes: {
        orderBy: (outcomes, { asc }) => asc(outcomes.position),
      },
    },
  });

  if (!market) {
    return null;
  }

  return enrichMarket(market as MarketQueryResult);
}