import { useEffect, useEffectEvent, useMemo, useState } from "react";
import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import type { Market } from "@/lib/api";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";

const DISTRIBUTION_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];

function formatDecimalOdds(chancePercent: number): string {
  if (!Number.isFinite(chancePercent) || chancePercent <= 0) {
    return "-";
  }

  const decimalOdds = 100 / chancePercent;
  const fractionDigits = decimalOdds < 10 ? 2 : 1;
  return `${decimalOdds.toFixed(fractionDigits)}x`;
}

function formatChance(chancePercent: number): string {
  if (!Number.isFinite(chancePercent)) {
    return "0%";
  }

  return `${chancePercent.toFixed(chancePercent % 1 === 0 ? 0 : 1)}%`;
}

function MarketDetailPage() {
  const { id } = useParams({ from: "/markets/$id" });
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [market, setMarket] = useState<Market | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedOutcomeId, setSelectedOutcomeId] = useState<number | null>(null);
  const [betAmount, setBetAmount] = useState("");
  const [isBetting, setIsBetting] = useState(false);

  const marketId = parseInt(id, 10);
  const parsedBetAmount = Number.parseFloat(betAmount);
  const isBetAmountValid = Number.isFinite(parsedBetAmount) && parsedBetAmount > 0;

  const outcomeDistribution = useMemo(() => {
    if (!market) {
      return [] as Array<{
        id: number;
        title: string;
        totalBets: number;
        percentage: number;
        color: string;
      }>;
    }

    return market.outcomes.map((outcome, index) => {
      const percentage =
        market.totalMarketBets > 0 ? (outcome.totalBets / market.totalMarketBets) * 100 : 0;

      return {
        id: outcome.id,
        title: outcome.title,
        totalBets: outcome.totalBets,
        percentage,
        color: DISTRIBUTION_COLORS[index % DISTRIBUTION_COLORS.length],
      };
    });
  }, [market]);

  const handleMarketUpdate = useEffectEvent((updatedMarket: Market) => {
    setMarket(updatedMarket);
    setSelectedOutcomeId((currentOutcomeId) => currentOutcomeId ?? updatedMarket.outcomes[0]?.id);
  });

  useEffect(() => {
    const loadMarket = async () => {
      try {
        setIsLoading(true);
        const data = await api.getMarket(marketId);
        setMarket(data);
        if (data.outcomes.length > 0) {
          setSelectedOutcomeId(data.outcomes[0].id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load market details");
      } finally {
        setIsLoading(false);
      }
    };

    loadMarket();
  }, [marketId]);

  useEffect(() => {
    if (!isAuthenticated || Number.isNaN(marketId)) {
      return;
    }

    return api.subscribeToMarketUpdates(marketId, handleMarketUpdate);
  }, [handleMarketUpdate, isAuthenticated, marketId]);

  const handlePlaceBet = async () => {
    if (!selectedOutcomeId) {
      setError("Please select an outcome");
      return;
    }

    if (!isBetAmountValid) {
      setError("Bet amount must be a positive number");
      return;
    }

    try {
      setIsBetting(true);
      setError(null);
      await api.placeBet(marketId, selectedOutcomeId, parsedBetAmount);
      setBetAmount("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to place bet");
    } finally {
      setIsBetting(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
            <p className="text-muted-foreground">Please log in to view this market</p>
            <Button onClick={() => navigate({ to: "/auth/login" })}>Login</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading market...</p>
      </div>
    );
  }

  if (!market) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
            <p className="text-destructive">Market not found</p>
            <Button onClick={() => navigate({ to: "/" })}>Back to Markets</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-blue-50 to-indigo-100 py-8">
      <div className="max-w-3xl mx-auto px-4 space-y-6">
        {/* Header */}
        <Button variant="outline" onClick={() => navigate({ to: "/" })}>
          ← Back
        </Button>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <CardTitle className="text-4xl">{market.title}</CardTitle>
                {market.description && (
                  <CardDescription className="text-lg mt-2">{market.description}</CardDescription>
                )}
              </div>
              <Badge variant={market.status === "active" ? "default" : "secondary"}>
                {market.status === "active" ? "Active" : "Resolved"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {error && (
              <div className="rounded-md bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            {/* Outcomes Display */}
            <div className="space-y-3">
              <h3 className="text-lg font-semibold">Outcomes</h3>
              {market.outcomes.map((outcome) => (
                <div
                  key={outcome.id}
                  className={`p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                    selectedOutcomeId === outcome.id
                      ? "border-primary bg-primary/5"
                      : "border-secondary bg-secondary/5 hover:border-primary/50"
                  }`}
                  onClick={() => market.status === "active" && setSelectedOutcomeId(outcome.id)}
                >
                  <div className="flex justify-between items-center">
                    <div className="flex-1">
                      <h4 className="font-semibold">{outcome.title}</h4>
                      <p className="text-sm text-muted-foreground mt-1">
                        Total bets: ${outcome.totalBets.toFixed(2)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="text-xs font-semibold text-muted-foreground md:text-sm">{formatDecimalOdds(outcome.odds)}</p>
                      <Badge
                        variant="outline"
                        className="h-auto min-h-12 min-w-18 justify-center overflow-visible px-3 py-2 text-[28px] font-bold leading-[1.1] md:text-[28px]"
                      >
                        {formatChance(outcome.odds)}
                      </Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Market Stats */}
            <div className="space-y-3">
              <h3 className="text-lg font-semibold">Bet Distribution</h3>

              {market.totalMarketBets === 0 ? (
                <div className="rounded-lg border border-border bg-secondary/10 p-4 text-sm text-muted-foreground">
                  No bets placed yet. Distribution will appear after the first bet.
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex h-8 overflow-hidden rounded-full border border-border bg-secondary/20">
                    {outcomeDistribution.map((entry) => (
                      <div
                        key={entry.id}
                        className="flex h-full items-center justify-center overflow-hidden px-1 transition-all"
                        style={{
                          width: `${entry.percentage}%`,
                          backgroundColor: entry.color,
                        }}
                        title={`${entry.title}: ${entry.percentage.toFixed(1)}%`}
                      >
                        {entry.percentage >= 12 ? (
                          <span className="truncate text-xs font-semibold text-white/95">
                            {entry.percentage.toFixed(0)}%
                          </span>
                        ) : null}
                      </div>
                    ))}
                  </div>

                  <div className="space-y-2">
                    {outcomeDistribution.map((entry) => (
                      <div
                        key={entry.id}
                        className="flex flex-col gap-1 rounded-md border border-border bg-background px-3 py-2 text-sm md:flex-row md:items-center md:justify-between"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="inline-block h-3 w-3 shrink-0 rounded-full"
                            style={{ backgroundColor: entry.color }}
                          />
                          <span className="font-medium text-foreground">{entry.title}</span>
                        </div>
                        <div className="flex items-center gap-3 text-muted-foreground">
                          <span>{entry.percentage.toFixed(1)}%</span>
                          <span>${entry.totalBets.toFixed(2)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-lg p-6 border border-primary/20 bg-primary/5">
              <p className="text-sm text-muted-foreground mb-1">Total Market Value</p>
              <p className="text-4xl font-bold text-primary">
                ${market.totalMarketBets.toFixed(2)}
              </p>
            </div>

            {/* Betting Section */}
            {market.status === "active" && (
              <Card className="bg-secondary/5">
                <CardHeader>
                  <CardTitle>Place Your Bet</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Selected Outcome</Label>
                    <div className="p-3 bg-white border border-secondary rounded-md">
                      {market.outcomes.find((o) => o.id === selectedOutcomeId)?.title ||
                        "None selected"}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="betAmount">Bet Amount ($)</Label>
                    <Input
                      id="betAmount"
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={betAmount}
                      onChange={(e) => setBetAmount(e.target.value)}
                      placeholder="Enter amount"
                      disabled={isBetting}
                    />
                  </div>

                  <Button
                    className="w-full text-lg py-6"
                    onClick={handlePlaceBet}
                    disabled={isBetting || !selectedOutcomeId || !isBetAmountValid}
                  >
                    {isBetting ? "Placing bet..." : "Place Bet"}
                  </Button>
                </CardContent>
              </Card>
            )}

            {market.status === "resolved" && (
              <Card>
                <CardContent className="py-6">
                  <p className="text-muted-foreground">This market has been resolved.</p>
                </CardContent>
              </Card>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/markets/$id")({
  component: MarketDetailPage,
});
